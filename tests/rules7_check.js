// Checks the new-rules prototype engine (src/rules7.js).   node tests/rules7_check.js
const path = require('path');
const R = require(path.join(__dirname, '..', 'src', 'rules7.js'));
const I = R.idx;
let bad = 0;
const t = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) bad++; };
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const put = (s, o, list) => { for (const [x, y, n] of list) { s.cells[I(x, y)].o = o; s.cells[I(x, y)].n = n; } return s; };
const wall = (s, a, b) => { s.walls[R.wkey(a, b)] = 1; };
const claim = (s, p, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.own[I(x, y)] = p; return s; };
const rolled = (s, cells) => { s.roll = { w: 0, b: 0, cells }; s.rolls = 1; return s; };
// walls around the rectangle x0..x1, y0..y1 (inclusive squares), except the sides listed in 'skip' as [a, b]
function box(s, x0, y0, x1, y1, skip) {
  const sk = (a, b) => (skip || []).some((e) => R.wkey(e[0], e[1]) === R.wkey(a, b));
  for (let y = y0; y <= y1; y++) { if (x0 > 0 && !sk(I(x0 - 1, y), I(x0, y))) wall(s, I(x0 - 1, y), I(x0, y)); if (x1 < 5 && !sk(I(x1, y), I(x1 + 1, y))) wall(s, I(x1, y), I(x1 + 1, y)); }
  for (let x = x0; x <= x1; x++) { if (y0 > 0 && !sk(I(x, y0 - 1), I(x, y0))) wall(s, I(x, y0 - 1), I(x, y0)); if (y1 < 5 && !sk(I(x, y1), I(x, y1 + 1))) wall(s, I(x, y1), I(x, y1 + 1)); }
}

// dice: two opposite squares, once per turn, pass after the roll
{
  let s = R.roll(R.newGame(), 2, 3);
  t('dice (2,3) -> squares (1,2) and (4,3)', JSON.stringify(s.roll.cells) === JSON.stringify([I(1, 2), I(4, 3)]));
  t('only one roll per turn', s.rolls === 1 && throws(() => R.roll(s, 1, 1)));
  t('the board is 6x6 and a majority is 19', R.N === 6 && R.WIN === 19);
  t('pass needs the roll first, then it is allowed', throws(() => R.apply(R.newGame(), { type: 'pass' })) && R.apply(s, { type: 'pass' }).turn === 1);
}
// closing part of the board makes it the closer's territory; enemy soldiers inside are out
{
  const s = put(put(R.newGame(), 0, [[2, 0, 3]]), 1, [[0, 0, 4], [1, 1, 2]]);
  box(s, 0, 0, 2, 2, [[I(2, 0), I(3, 0)]]);   // all around the 3x3 corner except the side between (2,0) and (3,0)
  const r = R.roll(s, 3, 1);                   // squares (2,0) and (3,5)
  t('before the last wall nothing is owned', R.territorySize(s, 0) === 0);
  const a = R.apply(r, { type: 'wall', R: I(2, 0), at: I(2, 0), walls: [[I(2, 0), I(3, 0)]] });
  t('the closed 9 squares become the closer\'s territory', R.territorySize(a, 0) === 9 && a.own[I(0, 0)] === 0 && a.own[I(5, 5)] === null);
  t('enemy soldiers inside are out of the game', a.cells[I(0, 0)].o === null && a.cells[I(1, 1)].o === null && a.graveyard[1] === 6);
  const rn = Object.assign(R.clone(r), { turn: 1 }); rn.roll = null; rn.rolls = 0;
  t('territory never changes hands', R.territorySize(a, 1) === 0);
  // a tie between two halves: nobody gets either
  const h = put(R.newGame(), 0, [[5, 2, 2]]);
  for (let x = 0; x < 5; x++) wall(h, I(x, 2), I(x, 3));
  const h2 = R.apply(R.roll(h, 6, 3), { type: 'wall', R: I(5, 2), at: I(5, 2), walls: [[I(5, 2), I(5, 3)]] });   // squares (5,2) and (0,3)
  t('two equal halves: neither is territory', R.territorySize(h2, 0) === 0 && R.territorySize(h2, 1) === 0);
  // the smaller side only
  const k = put(R.newGame(), 0, [[4, 4, 1]]);
  box(k, 0, 0, 4, 3, [[I(4, 3), I(4, 4)]]);   // 5x4 = 20 squares; with the open side the rest joins them
  const k2 = R.apply(R.roll(k, 5, 5), { type: 'wall', R: I(4, 4), at: I(4, 4), walls: [[I(4, 3), I(4, 4)]] });   // squares (4,4) and (1,1)
  t('only the smaller side of the cut is closed (16 of 36)', R.territorySize(k2, 0) === 16, 'size ' + R.territorySize(k2, 0));
}
// freedom of action: bases on or next to a rolled square and their chain; the whole territory when the square is in it
{
  const s = put(R.newGame(), 0, [[1, 1, 5], [1, 0, 2], [4, 4, 3]]);
  rolled(s, [I(2, 1), I(3, 5)]);   // (2,1) is empty, next to (1,1); (1,1)-(1,0) are a chain
  const src = R.sources(s, I(2, 1));
  t('a roll next to your base gives freedom to it and to its chain', src.length === 2 && src.includes(I(1, 1)) && src.includes(I(1, 0)));
  t('...but not to a base elsewhere', !src.includes(I(4, 4)));
  const a = R.apply(s, { type: 'move', R: I(2, 1), from: I(1, 0), to: I(2, 0), count: 2 });
  t('move from the chain base that is not next to the rolled square', a.cells[I(2, 0)].n === 2 && a.cells[I(1, 0)].o === null);
  const tr = claim(put(R.newGame(), 0, [[0, 0, 5], [2, 2, 2], [5, 5, 1]]), 0, 0, 0, 2, 2);
  rolled(tr, [I(1, 1), I(4, 4)]);
  const ts = R.sources(tr, I(1, 1));
  t('a rolled square inside your territory activates all your bases in it', ts.length === 2 && ts.includes(I(0, 0)) && ts.includes(I(2, 2)) && !ts.includes(I(5, 5)));
}
// landing and withdrawing: only on a rolled square; next to an enemy base is fine; not on an enemy base or in enemy territory
{
  const s = put(R.newGame(), 1, [[3, 3, 2]]); s.turn = 0; rolled(s, [I(3, 2), I(2, 2)]);
  t('landing next to an enemy base is allowed', R.canLand(s, I(3, 2)) && R.canLand(s, I(2, 2)));
  t('cannot land on an enemy base', !R.canLand(s, I(3, 3)));
  t('landing is only on a rolled square', throws(() => R.apply(s, { type: 'land', R: I(1, 1), count: 1 })));
  t('landing works', R.apply(s, { type: 'land', R: I(3, 2), count: 3 }).cells[I(3, 2)].n === 3);
  const e = claim(R.newGame(), 1, 3, 3, 5, 5); rolled(e, [I(3, 3), I(2, 2)]);
  t('cannot land in enemy territory', !R.canLand(e, I(3, 3)));
}
// no attacks, no moving into enemy territory
{
  const s = put(put(R.newGame(), 0, [[1, 1, 5]]), 1, [[2, 1, 3]]); rolled(s, [I(1, 1), I(4, 4)]);
  t('an enemy base is not a target', !R.options(s, I(1, 1)).some((o) => o.to === I(2, 1)) && throws(() => R.apply(s, { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 5 })));
  t('other neighbours are', R.options(s, I(1, 1)).some((o) => o.to === I(1, 2)));
  const e = claim(put(R.newGame(), 0, [[1, 1, 5]]), 1, 2, 0, 2, 2); rolled(e, [I(1, 1), I(4, 4)]);
  t('enemy territory is not a target', !R.options(e, I(1, 1)).some((o) => o.to === I(2, 1)));
}
// transport inside your territory
{
  const s = claim(put(R.newGame(), 0, [[0, 0, 5], [2, 0, 2]]), 0, 0, 0, 2, 2); rolled(s, [I(0, 0), I(5, 5)]);
  t('transport along a row inside your territory', R.transportTargets(s, I(0, 0)).some((x) => x.to === I(2, 0)));
  const r = R.apply(s, { type: 'transport', R: I(0, 0), from: I(0, 0), to: I(2, 0), count: 4 });
  t('transport moves the chosen soldiers to one square', r.cells[I(2, 0)].n === 6 && r.cells[I(0, 0)].n === 1);
  t('no transport outside your territory', R.transportTargets(put(R.newGame(), 0, [[0, 0, 5]]), I(0, 0)).length === 0);
}
// walls: one per turn, from a base the roll gives you freedom to
{
  const s = R.roll(put(R.newGame(), 0, [[1, 1, 3], [2, 1, 3], [5, 5, 1]]), 2, 2);   // squares (1,1) and (4,4)
  t('the 4 sides of a base you may use are offered', R.wallCandidates(s, I(1, 1)).length === 4 && R.wallCandidates(s, I(2, 1)).length === 4);
  t('a base the roll does not reach cannot build', R.wallCandidates(s, I(5, 5)).length === 0);
  const ok = R.apply(s, { type: 'wall', R: I(1, 1), at: I(2, 1), walls: [[I(2, 1), I(2, 0)]] });
  t('a wall by another base of the chain works and passes the turn', R.wallCount(ok) === 1 && ok.turn === 1);
  t('two walls in one turn are refused', throws(() => R.apply(s, { type: 'wall', R: I(1, 1), at: I(1, 1), walls: [[I(1, 1), I(1, 0)], [I(2, 1), I(2, 0)]] })));
}
// win: territories add up to 19 squares at the end of your turn
{
  const mk = (n) => { const s = R.newGame(); let c = 0; for (let i = 0; i < 36 && c < n; i++, c++) s.own[i] = 0; return s; };
  t('18 squares are not enough', R.apply(R.roll(mk(18), 1, 1), { type: 'pass' }).winner === null);
  t('19 squares win at the end of the turn', R.apply(R.roll(mk(19), 1, 1), { type: 'pass' }).winner === 0);
}
console.log(bad ? bad + ' FAILURE(S)' : 'all checks pass');
process.exit(bad ? 1 : 0);
