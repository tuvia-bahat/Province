#!/bin/bash
# Unattended experiment chain: waits for the 8x8 run, then fine-tunes 6x6 (cosine LR, sharper play) against the frozen champion, then 8x8.
cd "$(dirname "$0")"
until grep -q "EVAL it 200" run8a.out || grep -q Traceback run8a.out; do sleep 30; done
cp runs/run8a/ckpt.pt runs/champ8.pt
python train.py --size 6 --name run6c --ch 32 --blocks 2 --init runs/champ6.pt --iters 200 --games-per-iter 256 --train-steps 120 --slots 128 --eval-every 20 \
  --lr 5e-4 --lr-final 5e-5 --tau0 0.5 --tau1 0.15 --buffer 800000 --champion runs/champ6.pt > run6c.out 2>&1
python train.py --size 8 --name run8b --ch 32 --blocks 2 --init runs/champ8.pt --iters 200 --games-per-iter 192 --train-steps 120 --slots 96 --eval-every 20 \
  --lr 5e-4 --lr-final 5e-5 --tau0 0.5 --tau1 0.15 --buffer 800000 --p-transport 0.1 --champion runs/champ8.pt > run8b.out 2>&1
echo CHAIN DONE
