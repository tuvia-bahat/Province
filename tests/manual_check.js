// Replays every worked example of the how-to-play booklet (src/manual_scenarios.js) on the real rules engine and checks the booklet's claim (allowed / not allowed).
//   node tests/manual_check.js
const path = require('path');
global.Rules = require(path.join(__dirname, '..', 'src', 'rules.js'));
const S = require(path.join(__dirname, '..', 'src', 'manual_scenarios.js'));
const R = Rules.forSize(6); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
const ix = (c) => R.idx(c[0], c[1]);

let bad = 0;
for (const sc of S) {
  const s = R.newGame();
  for (const [x, y, n] of sc.g || []) { s.cells[R.idx(x, y)].o = 0; s.cells[R.idx(x, y)].n = n; }
  for (const [x, y, n] of sc.b || []) { s.cells[R.idx(x, y)].o = 1; s.cells[R.idx(x, y)].n = n; }
  for (const [x1, y1, x2, y2, o] of sc.br || []) { s.bridges[R.bridgeKey(R.idx(x1, y1), R.idx(x2, y2))] = o; s.bridgesLeft[o] -= 1; }
  if (sc.bl) s.bridgesLeft = sc.bl.slice();
  s.turn = 0;
  const lit = ix(sc.lit), t = R.roll(s, sc.lit[0] + 1, sc.lit[1] + 1);
  if (!t.roll.cells.includes(lit)) { console.log('FAIL (lit square is not on the roll)', sc.id); bad++; continue; }
  const a = { type: sc.act.type, R: lit, count: sc.act.count };
  if (sc.act.from) a.from = ix(sc.act.from);
  if (sc.act.to) a.to = ix(sc.act.to);
  if (sc.act.type === 'land' || sc.act.type === 'withdraw') { /* no target for withdraw */ }
  let allowed = true, why = '';
  try { R.apply(t, a); } catch (e) { allowed = false; why = e.message; }
  if (sc.act.type === 'land' && a.to === undefined) a.to = lit;
  const okMark = allowed === sc.ok ? 'ok  ' : 'FAIL';
  if (allowed !== sc.ok) bad++;
  console.log(okMark, sc.id.padEnd(20), sc.ok ? 'allowed' : 'not allowed', allowed ? '' : '(' + why + ')');
}
console.log(bad ? bad + ' MISMATCH(ES)' : 'all ' + S.length + ' examples match the game rules');
process.exit(bad ? 1 : 0);
