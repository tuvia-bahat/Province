#!/bin/bash
# Biggest net that trains locally: ch64 x 4 residual blocks. Bootstrapped by the gen-2 net (teacher plays the first 30 iterations),
# then pure self-play with near-greedy exploration. Measured vs the frozen gen-2 nets.
cd "$(dirname "$0")"
python train.py --packed --nsims 2 --tau-std --size 6 --name big6 --ch 64 --blocks 4 --teacher runs/champ6e.pt --teacher-iters 30 --iters 150 --games-per-iter 256 --train-steps 150 --slots 128 --eval-every 25 \
  --lr 1e-3 --lr-final 5e-5 --tau0 0.4 --tau1 0.1 --buffer 800000 --champion runs/champ6e.pt > big6.out 2>&1
python train.py --packed --nsims 2 --tau-std --size 8 --name big8 --ch 64 --blocks 4 --teacher runs/champ8d.pt --teacher-iters 30 --iters 150 --games-per-iter 192 --train-steps 150 --slots 96 --eval-every 25 \
  --lr 1e-3 --lr-final 5e-5 --tau0 0.4 --tau1 0.1 --buffer 800000 --p-transport 0.1 --champion runs/champ8d.pt > big8.out 2>&1
echo CHAIN DONE
