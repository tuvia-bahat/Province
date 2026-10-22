#!/bin/bash
# Generation 3: another fine-tune of the gen-2 nets (small LR), measured vs the frozen gen-2 nets.
cd "$(dirname "$0")"
python train.py --packed --nsims 2 --tau-std --size 6 --name run6f --ch 32 --blocks 2 --init runs/champ6e2.pt --iters 120 --games-per-iter 256 --train-steps 120 --slots 128 --eval-every 40 \
  --lr 3e-4 --lr-final 3e-5 --tau0 0.25 --tau1 0.1 --buffer 800000 --champion runs/champ6e2.pt > run6f.out 2>&1
python train.py --packed --nsims 2 --tau-std --size 8 --name run8e --ch 32 --blocks 2 --init runs/champ8d2.pt --iters 120 --games-per-iter 192 --train-steps 120 --slots 96 --eval-every 40 \
  --lr 3e-4 --lr-final 3e-5 --tau0 0.25 --tau1 0.1 --buffer 800000 --p-transport 0.1 --champion runs/champ8d2.pt > run8e.out 2>&1
echo CHAIN DONE
