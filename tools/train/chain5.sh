#!/bin/bash
# Generation 2: fine-tune the current nets (run6d / run8c) with near-greedy self-play; measured vs the frozen generation-1 nets.
cd "$(dirname "$0")"
python train.py --packed --nsims 2 --tau-std --size 6 --name run6e --ch 32 --blocks 2 --init runs/champ6d.pt --iters 150 --games-per-iter 256 --train-steps 120 --slots 128 --eval-every 25 \
  --lr 4e-4 --lr-final 4e-5 --tau0 0.3 --tau1 0.1 --buffer 800000 --champion runs/champ6d.pt > run6e.out 2>&1
python train.py --packed --nsims 2 --tau-std --size 8 --name run8d --ch 32 --blocks 2 --init runs/champ8c.pt --iters 150 --games-per-iter 192 --train-steps 120 --slots 96 --eval-every 25 \
  --lr 4e-4 --lr-final 4e-5 --tau0 0.3 --tau1 0.1 --buffer 800000 --p-transport 0.1 --champion runs/champ8c.pt > run8d.out 2>&1
echo CHAIN DONE
