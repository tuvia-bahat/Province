# Overnight training notes (autonomous run)

Goal: improve the learned evaluation network (afterstate value net, self-play) for 6x6 and 8x8.
Rule: nothing here changes what users see. Wiring a model into the game needs the user's approval (beta first).

## Baseline (before the night)
- run6b (6x6, ch32 blocks2, 300 it, 62 min): vs random 100%, vs heuristic ~90%, plateau since ~it 120 (vs previous net ~50%).
  JS tournament (tests/skill.html, 30 games): vnet beats the site's current "strong" AI 21-9 (70%, +-16%), beats old greedy 25-5.
  Uses graded soldier counts, but transport only ~2% of actions.
- run8a (8x8): resumed from it 80 after a reboot (07:44).

## Chain (tools/train/chain.sh)
1. finish run8a (200 it)
2. run6c: fine-tune run6b with cosine LR 5e-4 -> 5e-5, tau 0.5 -> 0.15, buffer 800k, measured vs frozen champion (runs/champ6.pt)
3. run8b: same recipe for 8x8, vs runs/champ8.pt, with transport exploration (p=0.1)

## Log
- 08:19 run8a at it 138/200 (resumed 07:44). 8x8 keeps improving: vs heuristic 0.66 (it100) -> 0.77 (it130); vs previous net 0.52-0.70. Iterations slowed from ~30s to ~85s (GPU only ~33% busy, CPU idle: probably laptop power throttling). Nothing to fix; monitoring.
- 08:25 Slowdown (gen ~85s/iter, train step 4x slower) not thermal; raised python/dotnet to AboveNormal priority (Windows may be deprioritising background processes). Will compare timing at next check.
