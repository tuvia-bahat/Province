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
  for (let y = y0; y <= y1; y++) { if (x0 > 0) wall(s, I(x0 - 1, y), I(x0, y)); if (x1 < 5) wall(s, I(x1, y), I(x1 + 1, y)); }
  for (let x = x0; x <= x1; x++) { if (y0 > 0) wall(s, I(x, y0 - 1), I(x, y0)); if (y1 < 5) wall(s, I(x, y1), I(x, y1 + 1)); }
}
const rolled = (s, cells) => { s.roll = { w: 0, b: 0, cells }; s.rolls = 1; return s; };
const three = (s) => R.roll(s, 1, 1);   // the one roll of the turn

// dice -> two opposite squares, like the original game
{
  let s = R.roll(R.newGame(), 1, 1);
  t('dice (1,1) -> squares (0,0) and (5,5)', JSON.stringify(s.roll.cells) === JSON.stringify([I(0, 0), I(5, 5)]));
  s = R.roll(R.newGame(), 2, 3);
  t('dice (2,3) -> squares (1,2) and (4,3)', JSON.stringify(s.roll.cells) === JSON.stringify([I(1, 2), I(4, 3)]));
  s = R.newGame(); s.turn = 1; s = R.roll(s, 2, 3);
  t('the same dice give the same squares for the other player', JSON.stringify(s.roll.cells) === JSON.stringify([I(1, 2), I(4, 3)]));
  s = R.roll(R.newGame(), 3, 3);
  t('only one roll per turn: no re-roll', s.rolls === 1 && throws(() => R.roll(s, 1, 1)));
  t('the board is 6x6', R.N === 6 && R.CELLS === 36 && R.WIN === 19);
}
// no territory from adjacency alone; only a closed province with one player having soldiers in it
{
  const s = put(R.newGame(), 0, [[3, 1, 2]]);
  t('squares next to a base are NOT territory', R.owners(s).every((o) => o === null) && R.territorySize(s, 0) === 0);
  const c = put(R.newGame(), 0, [[1, 1, 2]]); box(c, 0, 0, 2, 2);
  t('a part closed by walls with only your soldiers is yours (9 squares)', R.territorySize(c, 0) === 9 && R.owners(c)[I(0, 0)] === 0 && R.owners(c)[I(5, 5)] === null);
  const both = put(put(R.newGame(), 0, [[1, 1, 2]]), 1, [[2, 2, 2]]); box(both, 0, 0, 2, 2);
  t('soldiers of both players: the empty squares stay neutral', R.territorySize(both, 0) === 0 && R.territorySize(both, 1) === 0);
  const empty = R.newGame(); box(empty, 0, 0, 2, 2);
  t('a closed part with nobody in it is neutral', R.territorySize(empty, 0) === 0);
  const big = put(R.newGame(), 0, [[1, 1, 2]]); box(big, 0, 0, 4, 4);   // the closed part is 25 squares, the rest 11: only the smaller side is a province
  t('the smaller side of the cut is the closed one', R.owners(big)[I(1, 1)] === null && R.territorySize(big, 0) === 0);
  const d = put(R.newGame(), 0, [[5, 5, 2]]); box(d, 0, 0, 4, 4);
  t('...and it is yours when your soldiers are on that side', R.territorySize(d, 0) === 11);
}
// landing: not next to an enemy base, not in an enemy province, not on an enemy base
{
  const s = put(R.newGame(), 1, [[3, 3, 2]]); s.turn = 0; rolled(s, [I(3, 2), I(2, 2)]);
  t('cannot land next to an enemy base', !R.canLand(s, I(3, 2)) && !R.canLand(s, I(2, 3)));
  t('cannot land on an enemy base', !R.canLand(s, I(3, 3)));
  t('can land on a far empty square', R.canLand(s, I(1, 1)) === true);
  wall(s, I(3, 2), I(3, 3));
  t('a wall between them makes it fine', R.canLand(s, I(3, 2)) === true);
  const e = put(R.newGame(), 1, [[4, 4, 2]]); box(e, 3, 3, 5, 5); rolled(e, [I(3, 3), I(2, 2)]);
  t('cannot land in a province the enemy holds', !R.canLand(e, I(3, 3)));
}
// groups: adjacent own bases act together; a square next to a base gives nothing
{
  const s = put(R.newGame(), 0, [[1, 1, 5], [2, 1, 4], [4, 4, 2]]);
  rolled(s, [I(1, 1), I(4, 3)]);
  t('adjacent bases are one group', R.group(s, I(1, 1)).length === 2 && R.sources(s, I(1, 1)).length === 2);
  t('an empty square next to a base gives no freedom of action', R.sources(s, I(4, 3)).length === 0);
  t('a base of another group cannot move', R.sources(s, I(1, 1)).every((i) => i !== I(4, 4)));
  const a = R.apply(s, { type: 'move', R: I(1, 1), from: I(2, 1), to: I(3, 1), count: 2 });
  t('move from the group base that is not the chosen square', a.cells[I(3, 1)].n === 2 && a.cells[I(2, 1)].n === 2 && a.turn === 1);
  t('landing happens on the chosen square', R.apply(s, { type: 'land', R: I(1, 1), count: 2 }).cells[I(1, 1)].n === 7);
  t('a far base cannot move elsewhere', throws(() => R.apply(s, { type: 'move', R: I(1, 1), from: I(4, 4), to: I(4, 5), count: 1 })));
  const adj = R.apply(s, { type: 'move', R: I(4, 3), from: I(4, 4), to: I(4, 3), count: 1 });
  t('a base next to a rolled square may move into it', adj.cells[I(4, 3)].n === 1 && adj.cells[I(4, 4)].n === 1);
  const en = put(put(R.newGame(), 0, [[4, 4, 4]]), 1, [[4, 3, 2]]); rolled(en, [I(4, 3), I(1, 1)]);
  t('...and may attack a base standing on it', R.apply(en, { type: 'move', R: I(4, 3), from: I(4, 4), to: I(4, 3), count: 4 }).cells[I(4, 3)].o === 0);
  const at = put(R.newGame(), 0, [[1, 1, 5]]); put(at, 1, [[2, 1, 3]]); rolled(at, [I(1, 1), I(4, 4)]);
  const r = R.apply(at, { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 5 });
  t('attack 5 vs 3: 3 die, 2 stay', r.cells[I(2, 1)].o === 0 && r.cells[I(2, 1)].n === 2 && r.graveyard[1] === 3 && r.cells[I(1, 1)].o === null);
  const eq = R.apply(R.clone(at), { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 3 });
  t('attack 3 vs 3 leaves the square empty', eq.cells[I(2, 1)].o === null && eq.cells[I(1, 1)].n === 2);
}
// a rolled square in your province: every base in it may act
{
  const s = put(R.newGame(), 0, [[0, 0, 5], [2, 2, 2], [5, 5, 1]]); box(s, 0, 0, 2, 2); rolled(s, [I(1, 1), I(4, 4)]);
  const src = R.sources(s, I(1, 1));
  t('all your bases of the province are playable from an empty rolled square inside it', src.length === 2 && src.includes(I(0, 0)) && src.includes(I(2, 2)));
  t('...but not the base outside it', !src.includes(I(5, 5)));
}
// transport only inside a province you hold
{
  const s = put(R.newGame(), 0, [[0, 0, 5], [2, 0, 2]]); box(s, 0, 0, 2, 2); rolled(s, [I(0, 0), I(5, 5)]);
  t('transport along a row inside your province', R.transportTargets(s, I(0, 0)).some((x) => x.to === I(2, 0)));
  const r = R.apply(s, { type: 'transport', R: I(0, 0), from: I(0, 0), to: I(2, 0), count: 4 });
  t('transport moves the chosen soldiers to one square', r.cells[I(2, 0)].n === 6 && r.cells[I(0, 0)].n === 1);
  t('no transport outside a province', R.transportTargets(put(R.newGame(), 0, [[0, 0, 5]]), I(0, 0)).length === 0);
}
// walls: unlimited, shared, one per turn, on a side of the chosen square that holds your base
{
  const s = R.roll(put(R.newGame(), 0, [[1, 1, 3], [2, 1, 3]]), 2, 2);   // squares (1,1) and (4,4)
  t('a square without your base cannot take a wall', R.wallCandidates(s, I(4, 4)).length === 0 && throws(() => R.apply(s, { type: 'wall', R: I(4, 4), walls: [[I(4, 4), I(4, 3)]] })));
  t('the 4 sides of the chosen base are offered', R.wallCandidates(s, I(1, 1)).length === 4);
  const ok = R.apply(s, { type: 'wall', R: I(1, 1), walls: [[I(1, 1), I(1, 0)]] });
  t('a wall is built, costs nothing, and the turn passes', R.wallCount(ok) === 1 && ok.turn === 1);
  t('two walls in one turn are refused', throws(() => R.apply(s, { type: 'wall', R: I(1, 1), walls: [[I(1, 1), I(1, 0)], [I(2, 1), I(2, 0)]] })));
  t('a side of another square is refused', throws(() => R.apply(s, { type: 'wall', R: I(1, 1), walls: [[I(2, 1), I(2, 0)]] })));
}
// win: closed provinces you hold add up to 19 squares (a majority of the board) at the end of your turn
{
  const mk = (withD) => {
    const s = put(R.newGame(), 0, [[0, 0, 1], [2, 0, 1], [4, 0, 1]]);
    box(s, 0, 0, 1, 2); box(s, 2, 0, 3, 2); box(s, 4, 0, 5, 2); box(s, 0, 3, 0, 3);
    if (withD) put(s, 0, [[0, 3, 1]]);
    return s;
  };
  t('three 6-square provinces (18) are not enough', R.territorySize(mk(false), 0) === 18 && R.apply(three(mk(false)), { type: 'pass' }).winner === null);
  t('a fourth closed square makes 19 and wins at the end of the turn', R.territorySize(mk(true), 0) === 19 && R.apply(three(mk(true)), { type: 'pass' }).winner === 0);
}
t('pass needs the roll first, and is possible after it', throws(() => R.apply(R.newGame(), { type: 'pass' })) && R.apply(R.roll(R.newGame(), 1, 1), { type: 'pass' }).turn === 1);
console.log(bad ? bad + ' FAILURE(S)' : 'all checks pass');
process.exit(bad ? 1 : 0);
