"""Export a trained value network to the binary format read by src/vnet.js.   python export.py runs/run6b/ckpt.pt ../../src/vnet6.bin"""
import sys, struct
import numpy as np, torch
from train import Net

ck = torch.load(sys.argv[1], map_location='cpu'); a = ck['args']
size, ch, blocks = a['size'], a['ch'], a['blocks']
net = Net(size, ch, blocks); net.load_state_dict(ck['net']); net.eval()
sd = {k: v.numpy().astype(np.float32) for k, v in net.state_dict().items()}
C = size * size
parts = []
def conv_w(w):   # [oc, ic, 3, 3] -> [k=ky*3+kx][ic][oc]
    return np.ascontiguousarray(w.transpose(2, 3, 1, 0).reshape(9, w.shape[1], w.shape[0]))
parts += [conv_w(sd['stem.weight']), sd['stem.bias']]
for i in range(blocks):
    parts += [conv_w(sd[f'res.{i}.0.weight']), sd[f'res.{i}.0.bias'], conv_w(sd[f'res.{i}.1.weight']), sd[f'res.{i}.1.bias']]
fc = sd['fc1.weight'].shape[0]
w = sd['fc1.weight'].reshape(fc, ch, C)            # [j, c, pos]
parts += [np.ascontiguousarray(w.transpose(2, 1, 0).reshape(C * ch, fc)), sd['fc1.bias']]   # rows indexed pos*ch + c
parts += [np.ascontiguousarray(sd['sc.weight'].T), sd['sc.bias']]
parts += [np.ascontiguousarray(sd['fc2.weight'].T), sd['fc2.bias']]
parts += [sd['out.weight'].reshape(-1), sd['out.bias'].reshape(-1)]
with open(sys.argv[2], 'wb') as f:
    f.write(struct.pack('<4i', size, ch, blocks, fc))
    for p in parts: f.write(np.ascontiguousarray(p, dtype='<f4').tobytes())
print('wrote', sys.argv[2], sum(p.size for p in parts) * 4 + 16, 'bytes')
