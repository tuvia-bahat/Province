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
- 10:33 DIAGNOSIS of the slowdown: since the reboot this laptop's CPU runs ~5-6x slower (single-thread C# bench 232k -> ~40k moves/s; Windows reports ~20% processor performance although AC power, 100% max state, 58C). Not thermal, not the Windows power plan; probably an ASUS firmware/Armoury profile. I did NOT change system power settings (not mine to change). Work-around: packed features + 2 simulator processes used round-robin (--nsims 2) to overlap C# generation with GPU scoring (~15-25% faster). Training is now ~35 s per 256 games (6x6), ~90 s per 192 games (8x8).
- 10:33 chain3.sh started: run6c (150 it, 6x6 fine-tune vs frozen champ6) then run8b (120 it, 8x8 fine-tune vs champ8 = final run8a).
- 11:25 run6c (aborted at it 77): fine-tuning with lr decay gave NO gain: vs CHAMPION 0.46 / 0.50 / 0.48.
- 11:25 KEY FINDING (explains the plateau): self-play exploration was almost uniform random. Measured on the champion: within-decision logit std is only 0.27 and top1-top2 gap 0.055, so temperature 0.3 on raw logits picked the best-scored move only 8% of the time (0.1 -> 19%, 0.03 -> 42%). All earlier nets (run6b, run8a) learned from nearly random play. New flag --tau-std applies the temperature to z-scored scores (robust to logit scale): tau 0.4 -> 0.12. chain4: run6d (6x6, from champ6) then run8c (8x8, from champ8), both measured vs the frozen champions.
- 12:25 run6d finished (150 it, z-scored exploration; games are now ~50 moves instead of ~100, loss 0.44 vs 0.58): vs CHAMPION 0.46 / 0.57 / 0.52 / 0.53 / 0.61 / 0.51 (it 25..150; +-3% each) -> roughly +3..5% over the champion, not decisive; vs heuristic 0.96. Exported tests/vnet6d.bin (run6d) and tests/vnet6b.bin (champion) for a JS head-to-head (tests/skill.html?net=..&net2=.., levels vnet / vnet2): started 12:25 vnet(6d) vs strong x40 and vnet(6d) vs vnet(6b) x40; read results in window.__sk. run8c (8x8) is training now.
- 13:20 run8c (8x8, z-scored exploration) at it 60/120: vs CHAMPION(champ8=run8a final) 0.57 (it20), 0.60 (it40); vs previous net 0.64; vs heuristic 0.97 -> real improvement for 8x8. JS tournaments of 12:25 were lost when the preview tab died; restarted 13:20 (30 games each: vnet=6d vs vnet2=champion 6b, then 6d vs strong).
- 14:10 FINAL nets: run6d -> src/vnet6.bin, run8c -> src/vnet8.bin. Node arena (tests/arena_node.js, 80 games each, +-11%): champion 6b vs site "strong": 61%; NEW 6d vs strong: 75% (60-20); 6d vs 6b: 61% (49-31). 8x8: run8c vs CHAMPION 0.68 (256 games), vs heuristic 0.97; 8x8 JS tournament vs strong: running (results/8c_vs_strong.txt).
- 14:10 Beta wiring: src/vnet_worker.js + app.js (vnetAsk/aiApply); only with ?beta=1 (BETA_FLAG), vs-computer 6x6/8x8; falls back to the old AI if the worker fails or takes >20s. Verified through the real UI: moves arrive (6x6 ~1.5s, 8x8 ~1.8s incl. loading), no console errors. Pushed (30d545b). Non-beta users are unaffected.
- 14:20 8x8 JS tournament (tests/arena_node.js, 40 games): run8c vs site "strong": 30-9 (+1 unfinished) = 77%. Generation 2 started (chain5): run6e (from run6d) then run8d (from run8c), measured vs frozen run6d / run8c (champ6d.pt, champ8c.pt), tau 0.3->0.1, lr 4e-4->4e-5.
- 14:32 Beta-only 'Watch AI vs AI' / 'Watch new AI vs old AI' added to the start menu (pause + speed); verified via UI, hidden without ?beta=1 (commit above).
- 16:02 Generation 2 results. run6e vs run6d (champion) in training arena 0.55; JS Node arena 100 games: 53-44 (+3 unfinished) = 55%. run8d vs run8c: training arena 0.55; JS Node arena 60 games: 36-23 (+1) = 61%. Both small positives -> beta nets upgraded to gen 2 (src/vnet6.bin = run6e, src/vnet8.bin = run8d; previous gen-1 nets kept as tests/vnet6d.bin and tests/vnet8c.bin).
- 16:02 User request: train the biggest net that fits locally, think time in the browser does not matter. chain6.sh: ch64 x 4 blocks (~6x the compute of ch32x2), teacher bootstrap (gen-2 net plays the first 30 iterations), then self-play; run big6 then big8; measured vs frozen gen-2 nets (champ6e.pt, champ8d.pt).
