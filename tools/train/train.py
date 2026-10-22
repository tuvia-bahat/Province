"""Self-play training of a learned evaluation function for Province (afterstate value network, TD-Gammon style).

The network scores the position right AFTER a move (the opponent to move): it outputs the mover's win probability.
A move is chosen by scoring EVERY legal move with EVERY soldier count and picking the best (no search), so the
quantity to land/move/transport is decided by the learned evaluation, not by a fixed list of amounts.

  python train.py --size 6 --name run6 --iters 200
"""
import argparse, json, os, time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn
from simio import Sim, PLANES, SCALARS

SCALAR_DIV = None


class Net(nn.Module):
    def __init__(self, size, ch=64, blocks=3, fc=256):
        super().__init__()
        self.size, self.cells = size, size * size
        self.stem = nn.Conv2d(PLANES, ch, 3, padding=1)
        self.res = nn.ModuleList([nn.ModuleList([nn.Conv2d(ch, ch, 3, padding=1), nn.Conv2d(ch, ch, 3, padding=1)]) for _ in range(blocks)])
        self.fc1 = nn.Linear(ch * self.cells, fc)
        self.sc = nn.Linear(SCALARS, 32)
        self.fc2 = nn.Linear(fc + 32, 128)
        self.out = nn.Linear(128, 1)
        soldiers = 36 if size == 6 else 54
        bridges = 8 if size == 6 else 14
        nprov, win = (size // 2) ** 2, 5 if size == 6 else 8
        self.register_buffer('sdiv', torch.tensor([soldiers, soldiers, soldiers, soldiers, bridges, bridges, nprov, nprov, win, win], dtype=torch.float32))

    def forward(self, x):   # x: uint8 [B, F]
        B = x.shape[0]; C = self.cells
        planes = x[:, :PLANES * C].float().view(B, PLANES, self.size, self.size)
        planes = torch.cat([planes[:, :2] / 10.0, planes[:, 2:]], dim=1)
        sc = x[:, PLANES * C:].float() / self.sdiv
        h = Fn.relu(self.stem(planes))
        for c1, c2 in self.res:
            h = Fn.relu(h + c2(Fn.relu(c1(h))))
        h = Fn.relu(self.fc1(h.flatten(1)))
        h = torch.cat([h, Fn.relu(self.sc(sc))], dim=1)
        h = Fn.relu(self.fc2(h))
        return self.out(h).squeeze(1)   # logit of the mover's win probability


def unpack(xp, size):
    """packed uint8 [B, FP] -> the full uint8 layout the network expects (see Features.EncodePacked)"""
    C = size * size; B = xp.shape[0]; nb = (10 * C + 7) // 8
    shifts = torch.arange(8, device=xp.device, dtype=torch.uint8).view(1, 1, 8)
    bits = ((xp[:, 2 * C:2 * C + nb].unsqueeze(2) >> shifts) & 1).reshape(B, nb * 8)[:, :10 * C]
    return torch.cat([xp[:, :2 * C], bits, xp[:, 2 * C + nb:]], dim=1)


PACKED = False


@torch.no_grad()
def score(net, feats, dev, chunk=16384):
    out = []
    for i in range(0, len(feats), chunk):
        x = torch.from_numpy(np.ascontiguousarray(feats[i:i + chunk])).to(dev)
        if PACKED: x = unpack(x, net.size)
        out.append(net(x))
    return torch.cat(out).cpu().numpy()


def soft_label(prog_m, prog_o, held_m, held_o):   # label for games that hit the turn cap: who was closer to winning
    d = (prog_m - prog_o) + 0.3 * (held_m - held_o)
    return 0.5 + 0.5 * np.tanh(0.5 * d)


def heuristic_pick(f, offs, g, size):
    """Simple baseline: greedy on province progress / held provinces / soldiers lost (like the old 1-ply player)."""
    seg = f['feats'][offs[g]:offs[g + 1]]
    sc = seg[:, -SCALARS:].astype(np.float32)
    v = 4 * (sc[:, 8] - sc[:, 9]) + 1.5 * (sc[:, 6] - sc[:, 7]) + 0.25 * (sc[:, 3] - sc[:, 2]) + np.random.rand(len(seg)) * 0.3
    v[(f['term'][offs[g]:offs[g + 1]] & 1) == 1] += 1e6
    return int(np.argmax(v))


def arena(net_a, net_b, size, dev, games=128, slots=64, kind_b='net', seed=7):
    global PACKED
    """net_a (greedy) against net_b / 'random' / 'heur'. Returns A's win rate over finished games (unfinished = half)."""
    sim = Sim(size, slots, seed=seed, packed=PACKED)
    aSeat = [i % 2 for i in range(slots)]   # which seat A plays in each slot's current game
    done = 0; score_a = 0.0
    while done < games:
        f = sim.frame(); offs = f['offs']
        for g in range(slots):
            fin = int(f['finished'][g])
            if fin != -2:
                done += 1
                score_a += 0.5 if fin < 0 else (1.0 if fin == aSeat[g] else 0.0)
                aSeat[g] = 1 - aSeat[g]
        lg_a = score(net_a, f['feats'], dev) if net_a is not None else None
        lg_b = score(net_b, f['feats'], dev) if kind_b == 'net' else None
        idx = np.zeros(slots, dtype=np.int32)
        for g in range(slots):
            lo, hi = offs[g], offs[g + 1]
            if f['mover'][g] == aSeat[g]:
                s = lg_a[lo:hi].copy()
            elif kind_b == 'net':
                s = lg_b[lo:hi].copy()
            elif kind_b == 'random':
                s = np.random.rand(hi - lo)
            else:
                idx[g] = heuristic_pick(f, offs, g, size); continue
            s[(f['term'][lo:hi] & 1) == 1] += 1e6
            idx[g] = int(np.argmax(s + np.random.rand(hi - lo) * 1e-4))
        sim.choose(idx)
    sim.close()
    return score_a / done


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=6)
    ap.add_argument('--name', default='run')
    ap.add_argument('--slots', type=int, default=128)
    ap.add_argument('--iters', type=int, default=100)
    ap.add_argument('--games-per-iter', type=int, default=256)
    ap.add_argument('--train-steps', type=int, default=120)
    ap.add_argument('--batch', type=int, default=1024)
    ap.add_argument('--buffer', type=int, default=400000)
    ap.add_argument('--lam', type=float, default=0.7)
    ap.add_argument('--tau0', type=float, default=1.0)
    ap.add_argument('--tau1', type=float, default=0.3)
    ap.add_argument('--eps', type=float, default=0.03)
    ap.add_argument('--p-transport', dest='p_transport', type=float, default=0.0, help='chance to force exploring a transport move when one exists')
    ap.add_argument('--lr', type=float, default=1e-3)
    ap.add_argument('--ch', type=int, default=64)
    ap.add_argument('--blocks', type=int, default=3)
    ap.add_argument('--eval-every', type=int, default=10)
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--packed', action='store_true', help='compact bit-packed features over the pipe (about 3.5x less data)')
    ap.add_argument('--init', default=None, help='start a NEW run from the weights of this checkpoint')
    ap.add_argument('--lr-final', dest='lr_final', type=float, default=None, help='cosine-decay the learning rate to this value')
    ap.add_argument('--champion', default=None, help='checkpoint to measure against at every evaluation')
    a = ap.parse_args()

    global PACKED
    PACKED = a.packed
    dev = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    run = Path(__file__).resolve().parent / 'runs' / a.name; run.mkdir(parents=True, exist_ok=True)
    net = Net(a.size, a.ch, a.blocks).to(dev)
    opt = torch.optim.Adam(net.parameters(), lr=a.lr)
    it0 = 0
    if a.resume and (run / 'ckpt.pt').exists():
        ck = torch.load(run / 'ckpt.pt', map_location=dev); net.load_state_dict(ck['net']); opt.load_state_dict(ck['opt']); it0 = ck['it']
    if a.init:
        net.load_state_dict(torch.load(a.init, map_location=dev, weights_only=False)['net'])
    champ = None
    if a.champion:
        cka = torch.load(a.champion, map_location=dev, weights_only=False)
        champ = Net(a.size, cka['args']['ch'], cka['args']['blocks']).to(dev); champ.load_state_dict(cka['net']); champ.eval()
    log = open(run / 'log.txt', 'a')
    def P(*s):
        m = ' '.join(str(x) for x in s); print(m, flush=True); log.write(m + '\n'); log.flush()
    P('device', dev, 'params', sum(p.numel() for p in net.parameters()), 'args', vars(a))

    from simio import packed_len
    F = packed_len(a.size) if a.packed else PLANES * a.size * a.size + SCALARS
    bufX = np.zeros((a.buffer, F), dtype=np.uint8); bufY = np.zeros(a.buffer, dtype=np.float32); bn = 0; bp = 0
    sim = Sim(a.size, a.slots, seed=int(time.time()) % 100000, packed=a.packed)
    traj = [[] for _ in range(a.slots)]   # per slot: list of (feat, mover, value)
    prev = None; best_snapshot = None
    t0 = time.time()
    for it in range(it0, a.iters):
        frac = it / max(1, a.iters - 1)
        tau = a.tau0 + (a.tau1 - a.tau0) * frac
        if a.lr_final is not None:
            import math
            for gp in opt.param_groups: gp['lr'] = a.lr_final + 0.5 * (a.lr - a.lr_final) * (1 + math.cos(math.pi * frac))
        games = 0; wins = [0, 0, 0]; nlen = 0
        tg = time.time()
        while games < a.games_per_iter:
            f = sim.frame(); offs = f['offs']
            for g in range(a.slots):
                fin = int(f['finished'][g])
                if fin != -2 and traj[g]:
                    games += 1; wins[fin if fin >= 0 else 2] += 1; nlen += len(traj[g])
                    # lambda-returns over the alternating-perspective trajectory
                    T = traj[g]; n = len(T); G = np.zeros(n, dtype=np.float32)
                    last_m = T[-1][1]
                    if fin >= 0: out_last = 1.0 if fin == last_m else 0.0
                    else: out_last = soft_label(*( (f['prog'][g][last_m], f['prog'][g][1 - last_m], f['held'][g][last_m], f['held'][g][1 - last_m]) ))
                    G[n - 1] = out_last
                    for t in range(n - 2, -1, -1):
                        G[t] = (1 - a.lam) * (1 - T[t + 1][2]) + a.lam * (1 - G[t + 1])
                    for t in range(n):
                        bufX[bp] = T[t][0]; bufY[bp] = G[t]; bp = (bp + 1) % a.buffer; bn = min(bn + 1, a.buffer)
                    traj[g] = []
                elif fin != -2:
                    traj[g] = []
            lg = score(net, f['feats'], dev)
            idx = np.zeros(a.slots, dtype=np.int32)
            for g in range(a.slots):
                lo, hi = offs[g], offs[g + 1]
                s = lg[lo:hi]
                tm = f['term'][lo:hi]; term = (tm & 1) == 1; trn = (tm >> 1) == 2   # 2 = transport
                if term.any(): k = int(np.argmax(term))
                elif trn.any() and np.random.rand() < a.p_transport:
                    z = np.where(trn, s / tau + np.random.gumbel(size=hi - lo), -1e9); k = int(np.argmax(z))
                elif np.random.rand() < a.eps: k = np.random.randint(hi - lo)
                else:
                    z = s / tau + np.random.gumbel(size=hi - lo); k = int(np.argmax(z))
                idx[g] = k
                traj[g].append((f['feats'][lo + k].copy(), int(f['mover'][g]), float(1 / (1 + np.exp(-s[k])))))
            sim.choose(idx)
        tgen = time.time() - tg
        # ---- train ----
        net.train(); tl = 0.0; tt = time.time()
        for _ in range(a.train_steps if bn >= a.batch else 0):
            ii = np.random.randint(0, bn, a.batch)
            x = torch.from_numpy(bufX[ii]).to(dev); y = torch.from_numpy(bufY[ii]).to(dev)
            loss = Fn.binary_cross_entropy_with_logits(net(x), y)
            opt.zero_grad(); loss.backward(); opt.step(); tl += loss.item()
        net.eval()
        P(f'it {it+1}/{a.iters} games {games} len {nlen/max(1,games):.0f} wins0/1/unf {wins} loss {tl/max(1,a.train_steps):.4f} buf {bn} tau {tau:.2f} gen {tgen:.0f}s train {time.time()-tt:.0f}s total {(time.time()-t0)/60:.1f}m')
        if (it + 1) % a.eval_every == 0 or it + 1 == a.iters:
            torch.save({'net': net.state_dict(), 'opt': opt.state_dict(), 'it': it + 1, 'args': vars(a)}, run / 'ckpt.pt')
            r = arena(net, None, a.size, dev, games=128, kind_b='random')
            h = arena(net, None, a.size, dev, games=128, kind_b='heur')
            msg = f'  EVAL it {it+1}: vs random {r:.2f}, vs heuristic {h:.2f}'
            if champ is not None:
                c_ = arena(net, champ, a.size, dev, games=256, kind_b='net'); msg += f', vs CHAMPION {c_:.2f}'
            if prev is not None:
                p_ = arena(net, prev, a.size, dev, games=128, kind_b='net'); msg += f', vs net@{prev_it} {p_:.2f}'
            P(msg)
            prev = Net(a.size, a.ch, a.blocks).to(dev); prev.load_state_dict(net.state_dict()); prev.eval(); prev_it = it + 1
    sim.close()


if __name__ == '__main__':
    main()
