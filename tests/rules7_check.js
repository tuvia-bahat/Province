// Checks the new-rules prototype engine (src/rules7.js).   node tests/rules7_check.js
const path = require('path');
const R = require(path.join(__dirname, '..', 'src', 'rules7.js'));
const I = R.idx;
let bad = 0;
const t = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) bad++; };
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const put = (s, o, list) => { for (const [x, y, n] of list) { s.cells[I(x, y)].o = o; s.cells[I(x, y)].n = n; } return s; };

// dice -> the point -> its 4 squares (seen from the player's side)
{
  let s = R.roll(R.newGame(), 1, 1);
  t('green (1,1) -> squares around point (1,1)', JSON.stringify(s.roll.cells) === JSON.stringify([I(0, 0), I(1, 0), I(0, 1), I(1, 1)]));
  s = R.newGame(); s.turn = 1; s = R.roll(s, 1, 1);
  t('blue (1,1) -> point (6,6) (the other side of the board)', s.roll.vx === 6 && s.roll.vy === 6 && s.roll.cells.includes(I(6, 6)) && s.roll.cells.includes(I(5, 5)));
  s = R.newGame(); s = R.roll(s, 3, 3); s = R.roll(s, 2, 2); s = R.roll(s, 4, 4);
  t('3 rolls are allowed, the 4th is not', s.rolls === 3 && throws(() => R.roll(s, 1, 1)));
}
// territory: a base and the squares next to it; ties are neutral; a majority wins; walls cut adjacency
{
  let s = put(R.newGame(), 0, [[3, 1, 2]]);
  const o = R.owners(s);
  t('squares next to a base are its territory', o[I(3, 1)] === 0 && o[I(3, 0)] === 0 && o[I(3, 2)] === 0 && o[I(2, 1)] === 0 && o[I(4, 1)] === 0 && o[I(2, 0)] === null);
  s = put(s, 1, [[3, 3, 2]]);
  t('a square next to one base of each is neutral', R.owners(s)[I(3, 2)] === null);
  s = put(s, 0, [[2, 2, 1]]);   // (3,2) now touches 2 green bases ((3,1), (2,2)) and 1 blue ((3,3))
  t('a majority of adjacent bases takes the square', R.owners(s)[I(3, 2)] === 0);
  const w = R.newGame(); put(w, 0, [[3, 1, 2]]); w.walls[R.wkey(I(3, 1), I(3, 2))] = 1;
  t('a wall stops a base from claiming the square behind it', R.owners(w)[I(3, 2)] === null);
}
// landing: only on the chosen square, never in enemy territory, not on an enemy base
{
  let s = put(R.newGame(), 1, [[3, 3, 2]]); s.turn = 0; s.roll = { w: 0, b: 0, vx: 3, vy: 3, cells: R.vertexCells(3, 3) }; s.rolls = 1;
  t('cannot land in enemy territory', !R.canLand(s, I(3, 2)) && !R.canLand(s, I(2, 3)));
  t('cannot land on an enemy base', !R.canLand(s, I(3, 3)));
  t('can land on a far empty square', R.canLand(s, I(2, 2)) === true, '(2,2) touches no base: neutral');
  const s2 = put(R.newGame(), 0, [[3, 1, 2]]); s2.roll = { cells: R.vertexCells(3, 3) }; s2.rolls = 1;
  put(s2, 1, [[3, 3, 2]]);
  t('a tie square is neutral and can be landed on', R.canLand(s2, I(3, 2)) === true);
}
// move/attack from any base of the territory piece, landing only on the chosen square
{
  let s = put(R.newGame(), 0, [[1, 1, 5], [3, 1, 4]]);   // (2,1) touches both: one territory piece
  s.roll = { cells: [I(1, 1), I(2, 1), I(1, 2), I(2, 2)] }; s.rolls = 1;
  t('both bases are in the territory of the chosen square', R.sources(s, I(1, 1)).length === 2);
  const a = R.apply(s, { type: 'move', R: I(1, 1), from: I(3, 1), to: I(3, 0), count: 2 });
  t('move from a base that is not the chosen square', a.cells[I(3, 0)].o === 0 && a.cells[I(3, 0)].n === 2 && a.cells[I(3, 1)].n === 2 && a.turn === 1);
  t('landing happens on the chosen square', R.apply(s, { type: 'land', R: I(1, 1), count: 2 }).cells[I(1, 1)].n === 7);
  const far = put(R.newGame(), 0, [[1, 1, 5], [5, 5, 4]]);   // two separate pieces
  far.roll = { cells: [I(1, 1), I(2, 1), I(1, 2), I(2, 2)] }; far.rolls = 1;
  t('a base of another territory piece cannot move', throws(() => R.apply(far, { type: 'move', R: I(1, 1), from: I(5, 5), to: I(5, 4), count: 1 })));
  // attack: 5 vs 3
  const at = put(R.newGame(), 0, [[1, 1, 5]]); put(at, 1, [[2, 1, 3]]); at.roll = { cells: [I(1, 1), I(2, 1), I(1, 0), I(2, 0)] }; at.rolls = 1;
  const r = R.apply(at, { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 5 });
  t('attack 5 vs 3: 3 die, 2 stay', r.cells[I(2, 1)].o === 0 && r.cells[I(2, 1)].n === 2 && r.graveyard[1] === 3 && r.cells[I(1, 1)].o === null);
  const eq = R.apply(Object.assign(R.clone(at), {}), { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 3 });
  t('attack 3 vs 3 leaves the square empty', eq.cells[I(2, 1)].o === null && eq.cells[I(1, 1)].n === 2);
}
// transport: straight line through own territory
{
  const s = put(R.newGame(), 0, [[1, 1, 5], [4, 1, 2]]);   // (2,1), (3,1) are territory (touch a base)
  s.roll = { cells: [I(1, 1), I(2, 1), I(1, 2), I(2, 2)] }; s.rolls = 1;
  t('transport along a row to a base', R.transportTargets(s, I(1, 1)).some((x) => x.to === I(4, 1)));
  const r = R.apply(s, { type: 'transport', R: I(1, 1), from: I(1, 1), to: I(4, 1), count: 4 });
  t('transport moves all chosen soldiers to one square', r.cells[I(4, 1)].n === 6 && r.cells[I(1, 1)].n === 1);
  s.walls[R.wkey(I(2, 1), I(3, 1))] = 1;
  t('a wall blocks transport', !R.transportTargets(s, I(1, 1)).some((x) => x.to === I(4, 1)));
}
// walls: neutral, cost a wall, never enclose part of the board
{
  let s = R.roll(put(R.newGame(), 0, [[0, 0, 1]]), 1, 1);   // squares (0,0) (1,0) (0,1) (1,1); Green has a base on (0,0)
  const a = R.apply(s, { type: 'wall', R: I(0, 0), a: I(0, 0), b: I(1, 0) });
  t('a wall is placed and counted', a.walls[R.wkey(I(0, 0), I(1, 0))] === 1 && a.wallsLeft[0] === 9 && a.turn === 1);
  const b = R.roll(Object.assign(R.clone(a), { turn: 0, rolls: 0, roll: null }), 1, 1);
  t('the second wall that would close the corner is refused', !R.wallOk(b, I(0, 0), I(0, 1)) && throws(() => R.apply(b, { type: 'wall', R: I(0, 0), a: I(0, 0), b: I(0, 1) })));
  t('a harmless wall is fine', R.wallOk(b, I(1, 1), I(2, 1)));
  const none = R.clone(s); none.wallsLeft[0] = 0;
  t('no walls left, no wall', !R.wallOk(none, I(1, 1), I(2, 1)));
  const sides = R.wallSides(R.roll(put(R.newGame(), 0, [[0, 0, 1]]), 1, 1), I(0, 0));
  t('a corner square has only 2 sides that can take a wall', sides.length === 2);
  const nob = R.roll(R.newGame(), 1, 1);
  t('no wall from a square without your own base', R.wallSides(nob, I(0, 0)).length === 0 && throws(() => R.apply(nob, { type: 'wall', R: I(0, 0), a: I(0, 0), b: I(1, 0) })));
}
// win: one connected territory of 25 squares or more at the end of the turn
{
  const s = put(R.newGame(), 0, [[1, 1, 3], [3, 1, 3], [5, 1, 3], [1, 3, 3], [3, 3, 3], [5, 3, 3], [1, 5, 3], [3, 5, 3], [5, 5, 3]]);
  t('9 bases in a grid make one territory of 33 squares', R.territorySize(s, 0) === 33, 'size ' + R.territorySize(s, 0));
  const r = R.apply(R.roll(R.roll(R.roll(s, 1, 1), 2, 2), 3, 3), { type: 'pass' });
  t('the win is checked at the end of the turn', r.winner === 0);
  const s2 = put(R.newGame(), 0, [[1, 1, 3], [5, 5, 3]]);
  t('two separate pieces do not add up', R.territorySize(s2, 0) < 25 && R.apply(R.roll(R.roll(R.roll(s2, 1, 1), 2, 2), 3, 3), { type: 'pass' }).winner === null);
}
t('pass is refused before the third roll', throws(() => R.apply(R.roll(R.newGame(), 1, 1), { type: 'pass' })));
console.log(bad ? bad + ' FAILURE(S)' : 'all checks pass');
process.exit(bad ? 1 : 0);
