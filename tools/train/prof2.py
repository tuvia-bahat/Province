import time, numpy as np, torch, sys
import train
from simio import Sim
from train import Net, score
train.PACKED = True
dev = torch.device('cuda'); net = Net(6, 32, 2).to(dev).eval()
G = 128; sim = Sim(6, G, seed=3, packed=True)
t = dict(frame=0, score=0, select=0); n = 0; nc = 0
for step in range(80):
    a = time.time(); f = sim.frame(); t['frame'] += time.time() - a; nc += int(f['nc'].sum())
    a = time.time(); lg = score(net, f['feats'], dev); torch.cuda.synchronize(); t['score'] += time.time() - a
    a = time.time(); offs = f['offs']; idx = np.zeros(G, dtype=np.int32)
    for g in range(G):
        lo, hi = offs[g], offs[g + 1]; s = lg[lo:hi]; tm = f['term'][lo:hi]
        z = s / 0.5 + np.random.gumbel(size=hi - lo); k = int(np.argmax(z)); idx[g] = k
        _ = f['feats'][lo + k].copy()
    t['select'] += time.time() - a; sim.choose(idx)
print({k: round(v, 2) for k, v in t.items()}, 'avg cands/frame', nc // 80)
sim.close()
