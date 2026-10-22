import time, torch, numpy as np
from train import Net
dev = torch.device('cuda')
x = torch.randint(0, 3, (16384, 442), dtype=torch.uint8, device=dev)
for ch, blocks, half in [(64,3,False),(64,3,True),(32,2,False),(32,2,True),(48,2,True)]:
    net = Net(6, ch, blocks).to(dev).eval()
    with torch.no_grad():
        for _ in range(2):
            with torch.autocast('cuda', dtype=torch.float16, enabled=half): net(x)
        torch.cuda.synchronize(); t = time.time()
        for _ in range(5):
            with torch.autocast('cuda', dtype=torch.float16, enabled=half): net(x)
        torch.cuda.synchronize(); dt = (time.time() - t) / 5
    print(ch, blocks, 'fp16' if half else 'fp32', f'{16384/dt:.0f} cands/s', sum(p.numel() for p in net.parameters()))
