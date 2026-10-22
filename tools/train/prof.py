import time, numpy as np, torch
from simio import Sim
from train import Net, score
dev = torch.device('cuda')
net = Net(6).to(dev).eval()
sim = Sim(6, 128, seed=3)
tf = ts = 0; nc = []; steps = 0
t0 = time.time()
while steps < 60:
    a = time.time(); f = sim.frame(); tf += time.time() - a
    nc.append(int(f['nc'].sum()))
    a = time.time(); lg = score(net, f['feats'], dev); torch.cuda.synchronize(); ts += time.time() - a
    idx = np.array([int(np.argmax(lg[f['offs'][g]:f['offs'][g+1]])) for g in range(128)], dtype=np.int32)
    sim.choose(idx); steps += 1
print('frames', steps, 'wait/read', round(tf, 1), 'gpu', round(ts, 1), 'avg cands/frame', int(np.mean(nc)), 'max', max(nc))
sim.close()
