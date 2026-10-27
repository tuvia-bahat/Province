"""Dumps feature vectors and the PyTorch outputs (v and g logits) of a checkpoint, for tools/train/parity_rr.js (JS inference must match).
   python parity_rr.py runs/rr6a/ckpt.pt 6 out.json"""
import sys, json
import numpy as np, torch
from simio import Sim
from train import unpack
from train_rr import load_net, run_net
ck, size, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
dev = torch.device('cpu')
net, _ = load_net(ck, size, dev)
sim = Sim(size, 16, seed=5, packed=True, reroll=True)
rows = []
for _ in range(40):
    f = sim.frame(); rows.append(f['feats'][:40].copy()); rows.append(f['pre'].copy())
    sim.choose(np.zeros(16, dtype=np.int32))
sim.close()
X = np.concatenate(rows)[:300]
full = unpack(torch.from_numpy(X), size).numpy()
v, g = run_net(net, X, dev, True)
json.dump({'feat': full.tolist(), 'v': v.tolist(), 'g': g.tolist()}, open(out, 'w'))
print('dumped', len(X), 'vectors, F =', full.shape[1])
