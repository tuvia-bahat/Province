#!/bin/bash
# beta re-roll rule: fine-tune the gen-2 nets with the re-roll decision (head g). 6x6 first, then 8x8.
cd "$(dirname "$0")"
python train_rr.py --size 6 --name rr6a --init runs/champ6e.pt --champion runs/champ6e.pt --iters 80 --games-per-iter 256 --slots 128 --nsims 2 --eval-every 10 --eval-games 192 --packed > rr6a.out 2>&1
python train_rr.py --size 8 --name rr8a --init runs/champ8d.pt --champion runs/champ8d.pt --iters 60 --games-per-iter 192 --slots 128 --nsims 2 --eval-every 10 --eval-games 128 --packed > rr8a.out 2>&1
