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
- 09:35 Found the real bottleneck of slow iterations: the stdout pipe (GPU only ~33% busy, CPU idle). Implemented bit-packed features (soldier planes as bytes, 10 binary planes bit-packed): 442 -> 127 bytes (6x6) and 778 -> 218 bytes (8x8) per candidate; verified identical after GPU unpacking (tools/train/test_packed.py, 0 mismatches on 54k candidates). New runs use --packed (chain2.sh replaced chain.sh; run8a keeps running unpacked until it finishes).
- run8a at it 170: vs heuristic 0.91 (it 160), vs previous net ~0.52 (plateau again).
- 10:25 run8a finished (it 200): vs random 1.00, vs heuristic 0.95, vs net@190 0.55 (plateau). The first chain2 attempt crashed at once (packed batch not unpacked in the training step) - fixed, smoke-tested, relaunched (run6c then run8b, both --packed).
- 11:00 DIAGNOSIS of the slowdown: since the reboot this laptop's CPU runs ~5-6x slower (single-thread C# bench 232k -> ~40k moves/s; Windows reports ~20% processor performance although AC power, 100% max state, 58C). Not thermal, not the Windows power plan; probably an ASUS firmware/Armoury profile. I did NOT change system power settings (not mine to change). Work-around: packed features + 2 simulator processes used round-robin (--nsims 2) to overlap C# generation with GPU scoring (~15-25% faster). Training is now ~35 s per 256 games (6x6), ~90 s per 192 games (8x8).
- 11:00 chain3.sh started: run6c (150 it, 6x6 fine-tune vs frozen champ6) then run8b (120 it, 8x8 fine-tune vs champ8 = final run8a).
