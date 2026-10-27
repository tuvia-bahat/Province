"""Self-play training under the beta RE-ROLL rule: once per turn the player may throw the dice again (the new roll replaces the old one).

Same afterstate value network as train.py (head "out": the mover's win probability after a move) plus a second head "out2" = g:
for the position BEFORE the roll, encoded as the opponent's afterstate (Features.Encode(s, 1 - turn)), g predicts the expected value, for the player to roll,
of the best afterstate he gets from a fresh roll:   g(s) ~ E_roll[ max_a v(after(s, roll, a)) ]   (logit of the win probability).
Decision rule at the first roll of a turn:  re-roll  iff  g(s) > max over the legal non-pass moves of v   (+ margin).
g is trained on its own network's numbers (every first roll gives one sample: target = sigmoid(best afterstate logit of that roll)), v is trained by TD(lambda) as before.

  python train_rr.py --size 6 --name rr6a --init runs/champ6e.pt --iters 60 --packed
"""
import argparse, math, time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn
from simio import Sim, PLANES, SCALARS, packed_len
from train import Net, unpack, soft_label, heuristic_pick

PASS = 5   # tools/sim/Rules.cs AT.Pass


class Net2(Net):
    def __init__(self, size, ch=64, blocks=3, fc=256):
        super().__init__(size, ch, blocks, fc)
        self.out2 = nn.Linear(128, 1)

    def both(self, x):   # x: uint8 [B, F] (full layout) -> (v logit, g logit)
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
        return self.out(h).squeeze(1), self.out2(h).squeeze(1)


def load_net(path, size, dev):
    ck = torch.load(path, map_location=dev, weights_only=False); a = ck['args']
    net = Net2(size, a['ch'], a['blocks']).to(dev)
    missing = net.load_state_dict(ck['net'], strict=False)
    has_g = not any(k.startswith('out2') for k in missing.missing_keys)
    if not has_g:   # fresh g head: start as "minus the value of the position the opponent just left" (v(pre) is the OPPONENT's win probability)
        with torch.no_grad():
            net.out2.weight.copy_(-net.out.weight); net.out2.bias.copy_(-net.out.bias)
    net.eval()
    return net, has_g


@torch.no_grad()
def run_net(net, feats, dev, packed, chunk=16384):
    out_v, out_g = [], []
    for i in range(0, len(feats), chunk):
        x = torch.from_numpy(np.ascontiguousarray(feats[i:i + chunk])).to(dev)
        if packed: x = unpack(x, net.size)
        v, g = net.both(x); out_v.append(v); out_g.append(g)
    if not out_v: return np.zeros(0, np.float32), np.zeros(0, np.float32)
    return torch.cat(out_v).cpu().numpy(), torch.cat(out_g).cpu().numpy()


def sigmoid(z): return 1.0 / (1.0 + np.exp(-z))


def decide(seg, tm, g_logit, smart, margin=0.0):
    """-> (action index or -2 for re-roll, X) for a slot on its FIRST roll of the turn. seg: v logits of all candidates (pass included)."""
    term = (tm & 1) == 1; ispass = (tm >> 1) == PASS
    if term.any(): return int(np.argmax(term)), 1.0
    X = float(sigmoid(seg.max()))
    nonpass = ~ispass
    if not nonpass.any(): return -2, X   # no legal move at all: the only sensible thing is to throw again
    if smart and g_logit is not None and g_logit > seg[nonpass].max() + margin: return -2, X
    return None, X


def arena_rr(a, b, size, dev, packed, games=192, slots=64, seed=11):
    """a, b: dict(net=Net2|None, smart=bool) or dict(kind='heur'|'random'). Both sides play under the re-roll rule. Returns a's score (unfinished = half)."""
    sim = Sim(size, slots, seed=seed, packed=packed, reroll=True)
    aSeat = [i % 2 for i in range(slots)]; done = 0; sc_a = 0.0; stats = dict(first=0, rr=0, forced=0)
    while done < games:
        f = sim.frame(); offs = f['offs']
        for g in range(slots):
            fin = int(f['finished'][g])
            if fin != -2:
                done += 1; sc_a += 0.5 if fin < 0 else (1.0 if fin == aSeat[g] else 0.0); aSeat[g] = 1 - aSeat[g]
        res = {}
        for key, pl in (('a', a), ('b', b)):
            if pl.get('net') is not None:
                v, _ = run_net(pl['net'], f['feats'], dev, packed)
                ids = [g for g in range(slots) if f['can_rr'][g]]
                gg = run_net(pl['net'], f['pre'][ids], dev, packed)[1] if (pl['smart'] and ids) else None
                res[key] = (v, dict(zip(ids, gg)) if gg is not None else {})
        idx = np.zeros(slots, dtype=np.int32)
        for g in range(slots):
            lo, hi = offs[g], offs[g + 1]; who = 'a' if f['mover'][g] == aSeat[g] else 'b'; pl = a if who == 'a' else b
            tm = f['term'][lo:hi]; ispass = (tm >> 1) == PASS; first = bool(f['can_rr'][g])
            if pl.get('net') is not None:
                v, gl = res[who]; seg = v[lo:hi].copy()
                if first:
                    act, _ = decide(seg, tm, gl.get(g), pl['smart'])
                    stats['first'] += 1
                    if act == -2:
                        stats['rr'] += 1; stats['forced'] += int(not (~ispass).any()); idx[g] = -2; continue
                    if act is not None: idx[g] = act; continue
                    seg[ispass] = -1e9
                s = seg; s[(tm & 1) == 1] += 1e6
                idx[g] = int(np.argmax(s + np.random.rand(hi - lo) * 1e-4))
            else:   # heuristic / random baselines re-roll only when they have no move at all
                if first and not (~ispass).any(): idx[g] = -2; continue
                if pl['kind'] == 'random':
                    ok = np.where(~ispass)[0] if first else np.arange(hi - lo); idx[g] = int(np.random.choice(ok)); continue
                k = heuristic_pick(f, offs, g, size)
                if first and ispass[k]:
                    k = int(np.random.choice(np.where(~ispass)[0]))
                idx[g] = k
        sim.choose(idx)
    sim.close()
    return sc_a / done, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=6)
    ap.add_argument('--name', default='rr')
    ap.add_argument('--init', required=True, help='checkpoint to start from (its weights; a missing g head is initialised from the v head)')
    ap.add_argument('--champion', default=None, help='frozen checkpoint (no g head needed) that plays the old way: re-roll only when it has no move')
    ap.add_argument('--slots', type=int, default=128)
    ap.add_argument('--iters', type=int, default=60)
    ap.add_argument('--games-per-iter', dest='gpi', type=int, default=256)
    ap.add_argument('--train-steps', type=int, default=120)
    ap.add_argument('--batch', type=int, default=1024)
    ap.add_argument('--buffer', type=int, default=400000)
    ap.add_argument('--lam', type=float, default=0.7)
    ap.add_argument('--tau0', type=float, default=0.3)
    ap.add_argument('--tau1', type=float, default=0.1)
    ap.add_argument('--eps', type=float, default=0.03)
    ap.add_argument('--lr', type=float, default=4e-4)
    ap.add_argument('--lr-final', dest='lr_final', type=float, default=4e-5)
    ap.add_argument('--g-weight', dest='g_w', type=float, default=1.0)
    ap.add_argument('--rr-eps', dest='rr_eps', type=float, default=0.1, help='chance to flip the re-roll decision (exploration; also gives g samples for both outcomes)')
    ap.add_argument('--g-warm', dest='g_warm', type=int, default=3, help='iterations at the start in which the re-roll decision is random (50/50) so g has data before it is trusted')
    ap.add_argument('--eval-every', type=int, default=10)
    ap.add_argument('--eval-games', type=int, default=192)
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--packed', action='store_true')
    ap.add_argument('--nsims', type=int, default=2)
    a = ap.parse_args()
    dev = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    run = Path(__file__).resolve().parent / 'runs' / a.name; run.mkdir(parents=True, exist_ok=True)
    net, _ = load_net(a.init, a.size, dev); net.train()
    ck0 = torch.load(a.init, map_location='cpu', weights_only=False)['args']
    ch, blocks = ck0['ch'], ck0['blocks']
    opt = torch.optim.Adam(net.parameters(), lr=a.lr)
    it0 = 0
    if a.resume and (run / 'ckpt.pt').exists():
        ck = torch.load(run / 'ckpt.pt', map_location=dev, weights_only=False); net.load_state_dict(ck['net']); opt.load_state_dict(ck['opt']); it0 = ck['it']
    champ = None
    if a.champion: champ, _ = load_net(a.champion, a.size, dev)
    log = open(run / 'log.txt', 'a')
    def P(*s):
        m = ' '.join(str(x) for x in s); print(m, flush=True); log.write(m + '\n'); log.flush()
    P('device', dev, 'params', sum(p.numel() for p in net.parameters()), 'args', vars(a))
    F = packed_len(a.size) if a.packed else PLANES * a.size * a.size + SCALARS
    bufX = np.zeros((a.buffer, F), np.uint8); bufY = np.zeros(a.buffer, np.float32); bn = 0; bp = 0       # v samples
    gX = np.zeros((a.buffer // 2, F), np.uint8); gY = np.zeros(a.buffer // 2, np.float32); gn = 0; gp = 0   # g samples
    NS = a.nsims; S = a.slots // NS
    sims = [Sim(a.size, S, seed=int(time.time()) % 100000 + 17 * i, packed=a.packed, reroll=True) for i in range(NS)]
    trajs = [[[] for _ in range(S)] for _ in range(NS)]
    t0 = time.time()
    for it in range(it0, a.iters):
        frac = it / max(1, a.iters - 1)
        tau = a.tau0 + (a.tau1 - a.tau0) * frac
        for gp_ in opt.param_groups: gp_['lr'] = a.lr_final + 0.5 * (a.lr - a.lr_final) * (1 + math.cos(math.pi * frac))
        games = 0; wins = [0, 0, 0]; nlen = 0; nfirst = 0; nrr = 0; nforced = 0
        tg = time.time(); net.eval()
        while games < a.gpi:
            for si in range(NS):
                sim = sims[si]; traj = trajs[si]
                f = sim.frame(); offs = f['offs']
                for g in range(S):
                    fin = int(f['finished'][g])
                    if fin != -2 and traj[g]:
                        games += 1; wins[fin if fin >= 0 else 2] += 1; nlen += len(traj[g])
                        T = traj[g]; n = len(T); Gv = np.zeros(n, np.float32); last_m = T[-1][1]
                        if fin >= 0: out_last = 1.0 if fin == last_m else 0.0
                        else: out_last = soft_label(f['prog'][g][last_m], f['prog'][g][1 - last_m], f['held'][g][last_m], f['held'][g][1 - last_m])
                        Gv[n - 1] = out_last
                        for t in range(n - 2, -1, -1): Gv[t] = (1 - a.lam) * (1 - T[t + 1][2]) + a.lam * (1 - Gv[t + 1])
                        for t in range(n):
                            bufX[bp] = T[t][0]; bufY[bp] = Gv[t]; bp = (bp + 1) % a.buffer; bn = min(bn + 1, a.buffer)
                        traj[g] = []
                    elif fin != -2: traj[g] = []
                v, _ = run_net(net, f['feats'], dev, a.packed)
                ids = [g for g in range(S) if f['can_rr'][g]]
                gl = dict(zip(ids, run_net(net, f['pre'][ids], dev, a.packed)[1])) if ids else {}
                idx = np.zeros(S, np.int32)
                for g in range(S):
                    lo, hi = offs[g], offs[g + 1]; seg = v[lo:hi]; tm = f['term'][lo:hi]; ispass = (tm >> 1) == PASS
                    first = bool(f['can_rr'][g])
                    mask = None
                    if first:
                        act, X = decide(seg, tm, gl.get(g), True)
                        nfirst += 1
                        # g sample: the best afterstate of THIS roll at this position (target for g(pre))
                        gX[gp] = f['pre'][g]; gY[gp] = X; gp = (gp + 1) % len(gY); gn = min(gn + 1, len(gY))
                        if not (tm & 1).any():   # (a winning move is always played)
                            forced = act == -2 and not (~ispass).any()
                            if not forced:
                                if it < a.g_warm: act = -2 if np.random.rand() < 0.5 else None
                                elif np.random.rand() < a.rr_eps: act = None if act == -2 else -2
                            if act == -2:
                                nrr += 1; nforced += int(forced); idx[g] = -2; continue
                            mask = ~ispass
                    su = (seg - seg.mean()) / (seg.std() + 1e-6)
                    tmask = (tm & 1) == 1
                    if tmask.any(): k = int(np.argmax(tmask))
                    elif np.random.rand() < a.eps:
                        ok = np.where(mask)[0] if mask is not None else np.arange(hi - lo); k = int(np.random.choice(ok))
                    else:
                        z = su / tau + np.random.gumbel(size=hi - lo)
                        if mask is not None: z = np.where(mask, z, -1e9)
                        k = int(np.argmax(z))
                    idx[g] = k
                    traj[g].append((f['feats'][lo + k].copy(), int(f['mover'][g]), float(sigmoid(seg[k]))))
                sim.choose(idx)
        tgen = time.time() - tg
        net.train(); tl = tg_ = 0.0; tt = time.time()
        for _ in range(a.train_steps if (bn >= a.batch and gn >= a.batch) else 0):
            ii = np.random.randint(0, bn, a.batch); jj = np.random.randint(0, gn, a.batch)
            x = torch.from_numpy(np.concatenate([bufX[ii], gX[jj]])).to(dev)
            if a.packed: x = unpack(x, a.size)
            yv = torch.from_numpy(bufY[ii]).to(dev); yg = torch.from_numpy(gY[jj]).to(dev)
            lv, lg_ = net.both(x)
            l1 = Fn.binary_cross_entropy_with_logits(lv[:a.batch], yv); l2 = Fn.binary_cross_entropy_with_logits(lg_[a.batch:], yg)
            loss = l1 + a.g_w * l2
            opt.zero_grad(); loss.backward(); opt.step(); tl += l1.item(); tg_ += l2.item()
        net.eval(); st = max(1, a.train_steps)
        P(f'it {it+1}/{a.iters} games {games} len {nlen/max(1,games):.0f} wins0/1/unf {wins} v-loss {tl/st:.4f} g-loss {tg_/st:.4f} re-roll rate {nrr/max(1,nfirst):.3f} (forced {nforced/max(1,nfirst):.3f}) tau {tau:.2f} gen {tgen:.0f}s train {time.time()-tt:.0f}s total {(time.time()-t0)/60:.1f}m')
        if (it + 1) % a.eval_every == 0 or it + 1 == a.iters:
            torch.save({'net': net.state_dict(), 'opt': opt.state_dict(), 'it': it + 1, 'args': dict(vars(a), ch=ch, blocks=blocks, size=a.size)}, run / 'ckpt.pt')
            me = dict(net=net, smart=True); me_dumb = dict(net=net, smart=False)
            r, _ = arena_rr(me, dict(kind='random'), a.size, dev, a.packed, games=64)
            h, _ = arena_rr(me, dict(kind='heur'), a.size, dev, a.packed, games=a.eval_games)
            sd, stt = arena_rr(me, me_dumb, a.size, dev, a.packed, games=a.eval_games)
            msg = f'  EVAL it {it+1}: vs random {r:.2f}, vs heuristic {h:.2f}, smart vs same net re-rolling only when forced {sd:.3f} (re-roll rate {stt["rr"]/max(1,stt["first"]):.3f})'
            if champ is not None:
                c_, _ = arena_rr(me, dict(net=champ, smart=False), a.size, dev, a.packed, games=a.eval_games); msg += f', vs CHAMPION (old net, forced-only) {c_:.3f}'
            P(msg)
    for sim in sims: sim.close()


if __name__ == '__main__':
    main()
