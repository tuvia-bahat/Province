#!/bin/bash
# Fix of self-play exploration: temperature is applied to z-scored scores (--tau-std) so play is near-greedy instead of near-random.
cd "$(dirname "$0")"
python train.py --packed --nsims 2 --tau-std --size 6 --name run6d --ch 32 --blocks 2 --init runs/champ6.pt --iters 150 --games-per-iter 256 --train-steps 120 --slots 128 --eval-every 25 \
  --lr 5e-4 --lr-final 5e-5 --tau0 0.4 --tau1 0.12 --buffer 800000 --champion runs/champ6.pt > run6d.out 2>&1
python train.py --packed --nsims 2 --tau-std --size 8 --name run8c --ch 32 --blocks 2 --init runs/champ8.pt --iters 120 --games-per-iter 192 --train-steps 120 --slots 96 --eval-every 20 \
  --lr 5e-4 --lr-final 5e-5 --tau0 0.4 --tau1 0.12 --buffer 800000 --p-transport 0.1 --champion runs/champ8.pt > run8c.out 2>&1
echo CHAIN DONE
