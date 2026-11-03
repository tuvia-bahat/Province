// Checks the new-rules prototype engine (src/rules7.js).   node tests/rules7_check.js
const path = require('path');
const R = require(path.join(__dirname, '..', 'src', 'rules7.js'));
const I = R.idx;
let bad = 0;
const t = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) bad++; };
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const put = (s, o, list) => { for (const [x, y, n] of list) { s.cells[I(x, y)].o = o; s.cells[I(x, y)].n = n; } return s; };
const claim = (s, p, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.own[I(x, y)] = p; return s; };
const rolled = (s, cells) => { s.roll = { w: 0, b: 0, cells }; s.rolls = 1; return s; };

// dice: two opposite squares by x, y; one roll per turn
{
  const s = R.roll(R.newGame(), 2, 3);
  t('8x8 board, 54 soldiers, more than half is 33', R.N === 8 && R.SOLDIERS === 54 && R.WIN === 33);
  t('dice (2,3) -> squares (1,2) and (6,5)', JSON.stringify(s.roll.cells) === JSON.stringify([I(1, 2), I(6, 5)]));
  t('only one roll per turn', s.rolls === 1 && throws(() => R.roll(s, 1, 1)));
  t('pass needs the roll first, then it is allowed', throws(() => R.apply(R.newGame(), { type: 'pass' })) && R.apply(s, { type: 'pass' }).turn === 1);
}
// landing: only on a rolled square, next to an enemy base is fine, not on an enemy base or in enemy territory
{
  const s = put(R.newGame(), 1, [[3, 3, 2]]); s.turn = 0; rolled(s, [I(3, 2), I(6, 6)]);
  t('landing next to an enemy base is allowed', R.canLand(s, I(3, 2)) && R.apply(s, { type: 'land', R: I(3, 2), count: 3 }).cells[I(3, 2)].n === 3);
  t('landing only on a rolled square', throws(() => R.apply(s, { type: 'land', R: I(1, 1), count: 1 })));
  const e = put(R.newGame(), 1, [[3, 3, 2]]); rolled(e, [I(3, 3), I(6, 6)]);
  t('cannot land on an enemy base', !R.canLand(e, I(3, 3)));
  const f = claim(R.newGame(), 1, 4, 4, 7, 7); rolled(f, [I(5, 5), I(1, 1)]);
  t('cannot land in enemy territory', !R.canLand(f, I(5, 5)) && R.canLand(f, I(1, 1)));
}
// a roll next to your base: that base moves in any direction; its whole chain can withdraw
{
  const s = put(R.newGame(), 0, [[1, 1, 5], [1, 0, 2], [6, 6, 3]]); rolled(s, [I(2, 1), I(5, 6)]);   // (2,1) is empty and next to (1,1)
  t('only the base next to the rolled square may move', R.movers(s, I(2, 1)).length === 1 && R.movers(s, I(2, 1))[0] === I(1, 1));
  const m = R.apply(s, { type: 'move', R: I(2, 1), from: I(1, 1), to: I(1, 2), count: 3 });
  t('it moves in a direction that is not the rolled square', m.cells[I(1, 2)].n === 3 && m.cells[I(1, 1)].n === 2);
  t('a chain base that is not next to it cannot move', throws(() => R.apply(s, { type: 'move', R: I(2, 1), from: I(1, 0), to: I(2, 0), count: 1 })));
  t('a far base cannot move', !R.sources(s, I(2, 1)).includes(I(6, 6)));
  const w = R.apply(s, { type: 'withdraw', R: I(2, 1), from: I(1, 0), count: 2 });
  t('the chain base can withdraw', w.cells[I(1, 0)].o === null && R.camp(w, 0) === R.camp(s, 0) + 2);
  t('a far base cannot withdraw', throws(() => R.apply(s, { type: 'withdraw', R: I(2, 1), from: I(6, 6), count: 1 })));
}
// no attacks
{
  const s = put(put(R.newGame(), 0, [[1, 1, 5]]), 1, [[2, 1, 3]]); rolled(s, [I(1, 1), I(6, 6)]);
  t('an enemy base is not a target', !R.options(s, I(1, 1)).some((o) => o.to === I(2, 1)) && throws(() => R.apply(s, { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 5 })));
  t('other neighbours are', R.options(s, I(1, 1)).some((o) => o.to === I(1, 2)));
  const e = claim(put(R.newGame(), 0, [[1, 1, 5]]), 1, 2, 0, 2, 2); rolled(e, [I(1, 1), I(6, 6)]);
  t('enemy territory is not a target', !R.options(e, I(1, 1)).some((o) => o.to === I(2, 1)));
}
// closing territory
{
  const s = put(put(R.newGame(), 0, [[0, 1, 2], [1, 1, 2]]), 1, [[0, 0, 2]]);   // Green has (0,1) and (1,1); Blue sits in the corner (0,0)
  const gap = R.apply(rolled(put(put(R.newGame(), 0, [[0, 1, 2]]), 1, [[0, 0, 2]]), [I(1, 0), I(6, 7)]), { type: 'land', R: I(1, 0), count: 1 });
  t('two bases touching only diagonally do not close the corner', R.territorySize(gap, 0) === 0 && gap.cells[I(0, 0)].o === 1);
  const a = R.apply(rolled(s, [I(1, 0), I(6, 7)]), { type: 'land', R: I(1, 0), count: 1 });   // Green lands on (1,0): three touching bases close the corner
  t('three touching bases and the edge of the board enclose the corner square', a.own[I(0, 0)] === 0);
  t('the bases around it belong to the territory', a.own[I(1, 0)] === 0 && a.own[I(0, 1)] === 0 && a.own[I(1, 1)] === 0 && R.territorySize(a, 0) === 4);
  t('the enemy base inside is out and the square is empty', a.cells[I(0, 0)].o === null && a.graveyard[1] === 2);
  t('enemy cannot land in the closed territory', (() => { const b = R.roll(a, 1, 1); return !R.canLand(b, I(0, 0)); })());
  // a base chain from edge to edge: only the smaller side is closed (2 columns = 16 squares + the 8 bases)
  const col = put(R.newGame(), 0, [[2, 0, 1], [2, 1, 1], [2, 2, 1], [2, 3, 1], [2, 4, 1], [2, 5, 1], [2, 6, 1]]);
  const c = R.apply(rolled(col, [I(2, 7), I(5, 0)]), { type: 'land', R: I(2, 7), count: 1 });
  t('a chain across the board closes the smaller side', c.own[I(0, 0)] === 0 && c.own[I(5, 3)] === null && R.territorySize(c, 0) === 24, 'size ' + R.territorySize(c, 0));
  // enemy closed territory is no wall: a part that contains it cannot be closed
  const col2 = (x) => put(R.newGame(), 0, [0, 1, 2, 3, 4, 5, 6].map((y) => [x, y, 1]));
  const withEnemy = col2(4); withEnemy.own[I(7, 7)] = 1;
  const c2 = R.apply(rolled(withEnemy, [I(4, 7), I(3, 0)]), { type: 'land', R: I(4, 7), count: 1 });
  t('a chain around closed enemy territory closes nothing', R.territorySize(c2, 0) === 0 && c2.own[I(7, 7)] === 1);
  const inner = col2(1); inner.own[I(7, 7)] = 1;
  const c3 = R.apply(rolled(inner, [I(1, 7), I(6, 0)]), { type: 'land', R: I(1, 7), count: 1 });
  t('an inner chain that keeps the enemy territory out closes the rest', R.territorySize(c3, 0) === 16 && c3.own[I(7, 7)] === 1, 'size ' + R.territorySize(c3, 0));
  // nothing is closed by a lone base
  const lone = R.apply(rolled(put(R.newGame(), 0, [[3, 3, 1]]), [I(4, 3), I(3, 4)]), { type: 'land', R: I(4, 3), count: 1 });
  t('two lone bases close nothing', R.territorySize(lone, 0) === 0);
  // territory is permanent: leaving the bases does not open it
  const d = R.roll(Object.assign(R.clone(a), { turn: 0 }), 1, 2);   // squares (0,1) and (7,6)
  const d2 = R.apply(d, { type: 'withdraw', R: I(0, 1), count: 2 });
  t('closed territory stays closed when a base is withdrawn', d2.own[I(0, 0)] === 0 && d2.own[I(0, 1)] === 0);
}
// transport inside your closed territory
{
  const s = claim(put(R.newGame(), 0, [[0, 0, 5], [3, 0, 2]]), 0, 0, 0, 3, 1); rolled(s, [I(0, 0), I(7, 7)]);
  t('transport along a row inside your territory', R.transportTargets(s, I(0, 0)).some((x) => x.to === I(3, 0)));
  const r = R.apply(s, { type: 'transport', R: I(0, 0), from: I(0, 0), to: I(3, 0), count: 4 });
  t('transport moves the chosen soldiers to one square', r.cells[I(3, 0)].n === 6 && r.cells[I(0, 0)].n === 1);
  t('no transport outside your territory', R.transportTargets(put(R.newGame(), 0, [[0, 0, 5]]), I(0, 0)).length === 0);
  const all = claim(put(R.newGame(), 0, [[0, 0, 5], [3, 1, 2], [7, 7, 1]]), 0, 0, 0, 3, 1); rolled(all, [I(1, 0), I(6, 7)]);
  t('a rolled square inside your territory connects all its bases', R.sources(all, I(1, 0)).includes(I(0, 0)) && R.sources(all, I(1, 0)).includes(I(3, 1)) && !R.sources(all, I(1, 0)).includes(I(7, 7)));
}
// win: closed territories cover more than half of the board
{
  const mk = (n) => { const s = R.newGame(); for (let i = 0; i < n; i++) s.own[i] = 0; return s; };
  t('32 squares are not enough', R.apply(R.roll(mk(32), 1, 1), { type: 'pass' }).winner === null);
  t('33 squares win at the end of the turn', R.apply(R.roll(mk(33), 1, 1), { type: 'pass' }).winner === 0);
  t('territories that are not connected add up', (() => { const s = R.newGame(); for (let i = 0; i < 16; i++) s.own[i] = 0; for (let i = 40; i < 57; i++) s.own[i] = 0; return R.territorySize(s, 0) === 33; })());
}
console.log(bad ? bad + ' FAILURE(S)' : 'all checks pass');
process.exit(bad ? 1 : 0);
