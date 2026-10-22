# Province fast simulator (C#)

A port of `src/rules.js` (live-game rules: province territory, win = connected provinces) for fast self-play / AI training.

- `dotnet build -c Release` then `dotnet run -c Release --no-build -- bench 6 3000` (random-playout speed)
- Parity with the JS engine: open `tests/trace.html?board=6&games=120&post=http://localhost:9099/` while a tiny receiver
  saves the POST body to `trace6.json`, then `dotnet run -c Release --no-build -- parity trace6.json`.
  Result at port time: 6x6 (9,629 steps) and 8x8 (10,601 steps), 0 mismatches in legality sets, targets, resulting state, held/winProgress.
