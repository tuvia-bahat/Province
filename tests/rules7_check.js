// Checks the new-rules prototype engine (src/rules7.js).   node tests/rules7_check.js
const path = require('path');
const R = require(path.join(__dirname, '..', 'src', 'rules7.js'));
const I = R.idx;
let bad = 0;
const t = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) bad++; };
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const put = (s, o, list) => { for (const [x, y, n] of list) { s.cells[I(x, y)].o = o; s.cells[I(x, y)].n = n; } return s; };
const wall = (s, a, b) => { s.walls[R.wkey(a, b)] = 1; };
// close the rectangle x0..x1, y0..y1 (inclusive squares) with walls
function box(s, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) { if (x0 > 0) wall(s, I(x0 - 1, y), I(x0, y)); if (x1 < 6) wall(s, I(x1, y), I(x1 + 1, y)); }
  for (let x = x0; x <= x1; x++) { if (y0 > 0) wall(s, I(x, y0 - 1), I(x, y0)); if (y1 < 6) wall(s, I(x, y1), I(x, y1 + 1)); }
}
const rolled = (s, cells) => { s.roll = { w: 0, b: 0, vx: 3, vy: 3, cells }; s.rolls = 1; return s; };

// dice -> the point -> its 4 squares (seen from the player's side)
{
  let s = R.roll(R.newGame(), 1, 1);
  t('green (1,1) -> squares around point (1,1)', JSON.stringify(s.roll.cells) === JSON.stringify([I(0, 0), I(1, 0), I(0, 1), I(1, 1)]));
  s = R.newGame(); s.turn = 1; s = R.roll(s, 1, 1);
  t('blue (1,1) -> point (6,6) (the other side of the board)', s.roll.vx === 6 && s.roll.vy === 6 && s.roll.cells.includes(I(6, 6)) && s.roll.cells.includes(I(5, 5)));
  s = R.newGame(); s = R.roll(s, 3, 3); s = R.roll(s, 2, 2); s = R.roll(s, 4, 4);
  t('3 rolls are allowed, the 4th is not', s.rolls === 3 && throws(() => R.roll(s, 1, 1)));
}
// no territory from adjacency alone; only a closed province with one player's soldiers
{
  const s = put(R.newGame(), 0, [[3, 1, 2]]);
  t('squares next to a base are NOT territory', R.owners(s).every((o) => o === null) && R.territorySize(s, 0) === 0);
  const c = put(R.newGame(), 0, [[1, 1, 2]]); box(c, 0, 0, 2, 2);
  t('a part closed by walls with only your soldiers is yours (9 squares)', R.territorySize(c, 0) === 9 && R.owners(c)[I(0, 0)] === 0 && R.owners(c)[I(5, 5)] === null);
  const both = put(put(R.newGame(), 0, [[1, 1, 2]]), 1, [[2, 2, 2]]); box(both, 0, 0, 2, 2);
  t('soldiers of both players: the empty squares stay neutral', R.territorySize(both, 0) === 0 && R.territorySize(both, 1) === 0);
  const empty = R.newGame(); box(empty, 0, 0, 2, 2);
  t('a closed part with nobody in it is neutral', R.territorySize(empty, 0) === 0);
  const big = put(R.newGame(), 0, [[1, 1, 2]]); box(big, 0, 0, 5, 5);   // the closed part is 36 squares: it is the biggest, so the 13 outside squares are the "closed" one
  t('the smaller side of the cut is the closed one', R.regions(big).lists.length === 2 && R.owners(big)[I(1, 1)] === null && R.owners(big)[I(6, 6)] === null);
  const d = put(R.newGame(), 0, [[6, 6, 2]]); box(d, 0, 0, 5, 5);
  t('...and it is yours when your soldiers are on that side', R.territorySize(d, 0) === 13);
}
// landing: not next to an enemy base, not in an enemy province, not on an enemy base
{
  let s = put(R.newGame(), 1, [[3, 3, 2]]); s.turn = 0; rolled(s, R.vertexCells(3, 3));
  t('cannot land next to an enemy base', !R.canLand(s, I(3, 2)) && !R.canLand(s, I(2, 3)));
  t('cannot land on an enemy base', !R.canLand(s, I(3, 3)));
  t('can land on a far empty square', R.canLand(s, I(2, 2)) === true);
  wall(s, I(3, 2), I(3, 3));
  t('a wall between them makes it fine', R.canLand(s, I(3, 2)) === true);
  const e = put(R.newGame(), 1, [[5, 5, 2]]); box(e, 4, 4, 6, 6); e.roll = { cells: [I(4, 4), I(5, 4), I(4, 3), I(5, 3)] }; e.rolls = 1;
  t('cannot land in a province the enemy holds', !R.canLand(e, I(4, 4)));
}
// groups: adjacent own bases act together; a base far away does not
{
  let s = put(R.newGame(), 0, [[1, 1, 5], [2, 1, 4], [5, 5, 2]]);
  rolled(s, [I(1, 1), I(2, 1), I(1, 2), I(2, 2)]);
  t('adjacent bases are one group', R.group(s, I(1, 1)).length === 2 && R.sources(s, I(1, 2)).length === 2);
  t('a base of another group cannot move', R.sources(s, I(1, 1)).every((i) => i !== I(5, 5)));
  const a = R.apply(s, { type: 'move', R: I(1, 1), from: I(2, 1), to: I(3, 1), count: 2 });
  t('move from the group base that is not the chosen square', a.cells[I(3, 1)].n === 2 && a.cells[I(2, 1)].n === 2 && a.turn === 1);
  t('landing happens on the chosen square', R.apply(s, { type: 'land', R: I(1, 1), count: 2 }).cells[I(1, 1)].n === 7);
  t('a far base cannot move', throws(() => R.apply(s, { type: 'move', R: I(1, 1), from: I(5, 5), to: I(5, 4), count: 1 })));
  const at = put(R.newGame(), 0, [[1, 1, 5]]); put(at, 1, [[2, 1, 3]]); rolled(at, [I(1, 1), I(2, 1), I(1, 0), I(2, 0)]);
  const r = R.apply(at, { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 5 });
  t('attack 5 vs 3: 3 die, 2 stay', r.cells[I(2, 1)].o === 0 && r.cells[I(2, 1)].n === 2 && r.graveyard[1] === 3 && r.cells[I(1, 1)].o === null);
  const eq = R.apply(R.clone(at), { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 3 });
  t('attack 3 vs 3 leaves the square empty', eq.cells[I(2, 1)].o === null && eq.cells[I(1, 1)].n === 2);
}
// transport only inside a province you hold
{
  const s = put(R.newGame(), 0, [[0, 0, 5], [2, 0, 2]]); box(s, 0, 0, 2, 2); rolled(s, [I(0, 0), I(1, 0), I(0, 1), I(1, 1)]);
  t('transport along a row inside your province', R.transportTargets(s, I(0, 0)).some((x) => x.to === I(2, 0)));
  const r = R.apply(s, { type: 'transport', R: I(0, 0), from: I(0, 0), to: I(2, 0), count: 4 });
  t('transport moves the chosen soldiers to one square', r.cells[I(2, 0)].n === 6 && r.cells[I(0, 0)].n === 1);
  t('no transport outside a province', R.transportTargets(put(R.newGame(), 0, [[0, 0, 5]]), I(0, 0)).length === 0);
}
// walls: unlimited, shared, a connected chain next to bases of one group
{
  let s = R.roll(put(R.newGame(), 0, [[1, 1, 3], [2, 1, 3]]), 2, 2);   // flag on point (2,2): squares (1,1) (2,1) (1,2) (2,2)
  t('a square without your base cannot start a wall', R.wallCandidates(s, I(1, 2), []).length === 0);
  const c0 = R.wallCandidates(s, I(1, 1), []);
  t('first wall: any side of a base of the group (8 sides)', c0.length === 8, 'got ' + c0.length);
  const chain = [[I(1, 1), I(1, 0)], [I(1, 0), I(2, 0)].map((x) => x)];   // second is not on a side of a base square
  t('a wall not next to a base of the group is refused', throws(() => R.apply(s, { type: 'wall', R: I(1, 1), walls: [[I(1, 1), I(1, 0)], [I(3, 3), I(3, 2)]] })));
  t('a wall that does not touch the first one is refused', throws(() => R.apply(s, { type: 'wall', R: I(1, 1), walls: [[I(1, 1), I(1, 0)], [I(2, 1), I(2, 2)]] })));
  const ok = R.apply(s, { type: 'wall', R: I(1, 1), walls: [[I(1, 1), I(1, 0)], [I(2, 1), I(2, 0)]] });   // two top sides of the two bases: they touch at a point
  t('a connected chain along both bases is built in one turn', R.wallCount(ok) === 2 && ok.turn === 1);
  t('no wall from a square without your own base', throws(() => R.apply(s, { type: 'wall', R: I(1, 2), walls: [[I(1, 2), I(1, 3)]] })));
  void chain;
  // close a province with a chain along a row of bases and win it over turns
  let w = put(R.newGame(), 0, [[0, 2, 1], [1, 2, 1], [2, 2, 1]]);
  w = R.roll(w, 1, 3);   // point (1,3): squares (0,2) (1,2) (0,3) (1,3)
  const r = R.apply(w, { type: 'wall', R: I(0, 2), walls: [[I(0, 2), I(0, 3)], [I(1, 2), I(1, 3)], [I(2, 2), I(2, 3)]] });
  t('three connected walls under a row of bases', R.wallCount(r) === 3);
}
// win: closed provinces you hold add up to 25 squares at the end of your turn
{
  const s = put(R.newGame(), 0, [[0, 0, 3]]); box(s, 0, 0, 4, 4);   // 25 squares closed, outside is 24
  t('25 closed squares of yours: the closed part is the smaller one, 24, so no win yet', R.territorySize(s, 0) === 0 || R.territorySize(s, 0) === 24, 'size ' + R.territorySize(s, 0));
  const w = put(R.newGame(), 0, [[0, 0, 3]]); box(w, 0, 0, 4, 4);
  const f = R.apply(R.roll(R.roll(R.roll(w, 1, 1), 2, 2), 3, 3), { type: 'pass' });
  t('24 squares are not enough', f.winner === null);
  // two provinces: 3x4 + 3x4 = 24, plus 1 more
  const m = put(put(R.newGame(), 0, [[0, 0, 2]]), 0, [[6, 6, 2]]); box(m, 0, 0, 1, 5); box(m, 5, 1, 6, 6);   // 12 + 12 = 24
  t('provinces add up', R.territorySize(m, 0) === 24, 'size ' + R.territorySize(m, 0));
  const n = put(put(put(R.newGame(), 0, [[0, 0, 2]]), 0, [[6, 6, 2]]), 0, [[3, 0, 2]]); box(n, 0, 0, 1, 5); box(n, 5, 1, 6, 6); box(n, 3, 0, 3, 0);
  t('with a third closed square it reaches 25 and wins', R.territorySize(n, 0) === 25 && R.apply(R.roll(R.roll(R.roll(n, 1, 1), 2, 2), 3, 3), { type: 'pass' }).winner === 0);
}
t('pass is refused before the third roll', throws(() => R.apply(R.roll(R.newGame(), 1, 1), { type: 'pass' })));
console.log(bad ? bad + ' FAILURE(S)' : 'all checks pass');
process.exit(bad ? 1 : 0);
