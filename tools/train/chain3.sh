#!/bin/bash
# Unattended chain (packed features, 2 simulator processes). Fine-tunes the frozen champions with a decaying learning rate.
cd "$(dirname "$0")"
python train.py --packed --nsims 2 --size 6 --name run6c --ch 32 --blocks 2 --init runs/champ6.pt --iters 150 --games-per-iter 256 --train-steps 120 --slots 128 --eval-every 25 \
  --lr 5e-4 --lr-final 5e-5 --tau0 0.5 --tau1 0.15 --buffer 800000 --champion runs/champ6.pt > run6c.out 2>&1
python train.py --packed --nsims 2 --size 8 --name run8b --ch 32 --blocks 2 --init runs/champ8.pt --iters 120 --games-per-iter 192 --train-steps 120 --slots 96 --eval-every 20 \
  --lr 5e-4 --lr-final 5e-5 --tau0 0.5 --tau1 0.15 --buffer 800000 --p-transport 0.1 --champion runs/champ8.pt > run8b.out 2>&1
echo CHAIN DONE
