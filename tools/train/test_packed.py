"""Checks that packed features unpack to exactly the full-format features (same seeds, same choices)."""
import numpy as np, torch
from simio import Sim
from train import unpack
for size in (6, 8):
    a = Sim(size, 8, seed=5); b = Sim(size, 8, seed=5, packed=True)
    bad = 0; n = 0
    for step in range(40):
        fa, fb = a.frame(), b.frame()
        assert (fa['nc'] == fb['nc']).all() and (fa['term'] == fb['term']).all()
        full = torch.from_numpy(np.ascontiguousarray(fa['feats']))
        un = unpack(torch.from_numpy(np.ascontiguousarray(fb['feats'])), size)
        bad += int((full != un).any(dim=1).sum()); n += len(full)
        idx = (np.arange(8) * 3 + step) % fa['nc']
        a.choose(idx.astype(np.int32)); b.choose(idx.astype(np.int32))
    print(f'size {size}: {n} candidates compared, {bad} mismatches, bytes per candidate {a.F} -> {b.F}')
    a.close(); b.close()
