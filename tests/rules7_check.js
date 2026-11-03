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

// dice: two opposite points by x, y; one roll per turn
{
  const s = R.roll(R.newGame(), 2, 3);
  t('8x8 points, 32 soldiers each, more than half is 33', R.N === 8 && R.SOLDIERS === 32 && R.WIN === 33 && R.camp(R.newGame(), 0) === 32);
  t('dice (2,3) -> points (1,2) and (6,5)', JSON.stringify(s.roll.cells) === JSON.stringify([I(1, 2), I(6, 5)]));
  t('only one roll per turn', s.rolls === 1 && throws(() => R.roll(s, 1, 1)));
  t('pass needs the roll first, then it is allowed', throws(() => R.apply(R.newGame(), { type: 'pass' })) && R.apply(s, { type: 'pass' }).turn === 1);
}
// landing: only on a rolled point, next to an enemy base is fine, not on an enemy base or in enemy territory
{
  const s = put(R.newGame(), 1, [[3, 3, 2]]); s.turn = 0; rolled(s, [I(3, 2), I(6, 6)]);
  t('landing next to an enemy base is allowed', R.canLand(s, I(3, 2)) && R.apply(s, { type: 'land', R: I(3, 2), count: 3 }).cells[I(3, 2)].n === 3);
  t('landing only on a rolled point', throws(() => R.apply(s, { type: 'land', R: I(1, 1), count: 1 })));
  const e = put(R.newGame(), 1, [[3, 3, 2]]); rolled(e, [I(3, 3), I(6, 6)]);
  t('cannot land on an enemy base', !R.canLand(e, I(3, 3)));
  const f = claim(R.newGame(), 1, 4, 4, 7, 7); rolled(f, [I(5, 5), I(1, 1)]);
  t('cannot land in enemy territory', !R.canLand(f, I(5, 5)) && R.canLand(f, I(1, 1)));
}
// bases connect diagonally; a roll gives freedom to every base of the chain: move and withdraw
{
  const s = put(R.newGame(), 0, [[1, 1, 5], [0, 0, 2], [6, 6, 3]]); rolled(s, [I(2, 2), I(7, 0)]);   // (2,2) is empty; (1,1) is diagonal to it; (0,0) is diagonal to (1,1)
  const src = R.sources(s, I(2, 2));
  t('a diagonal contact connects: the whole chain is connected to the rolled point', src.length === 2 && src.includes(I(1, 1)) && src.includes(I(0, 0)));
  const m = R.apply(s, { type: 'move', R: I(2, 2), from: I(0, 0), to: I(1, 0), count: 2 });
  t('a base of the chain that is not next to the rolled point may move', m.cells[I(1, 0)].n === 2 && m.cells[I(0, 0)].o === null);
  const d = R.apply(s, { type: 'move', R: I(2, 2), from: I(1, 1), to: I(2, 2), count: 3 });
  t('bases move diagonally', d.cells[I(2, 2)].n === 3 && R.moveTargets(s, I(1, 1)).length === 8);
  const w = R.apply(s, { type: 'withdraw', R: I(2, 2), from: I(0, 0), count: 2 });
  t('the chain base can withdraw', w.cells[I(0, 0)].o === null && R.camp(w, 0) === R.camp(s, 0) + 2);
  t('a base outside the chain can do nothing', !src.includes(I(6, 6)) && throws(() => R.apply(s, { type: 'move', R: I(2, 2), from: I(6, 6), to: I(6, 5), count: 1 })));
}
// no attacks
{
  const s = put(put(R.newGame(), 0, [[1, 1, 5]]), 1, [[2, 1, 3]]); rolled(s, [I(1, 1), I(6, 6)]);
  t('an enemy base is not a target', !R.options(s, I(1, 1)).some((o) => o.to === I(2, 1)) && throws(() => R.apply(s, { type: 'move', R: I(1, 1), from: I(1, 1), to: I(2, 1), count: 5 })));
  t('other neighbours (also diagonal) are', R.options(s, I(1, 1)).some((o) => o.to === I(1, 2)) && R.options(s, I(1, 1)).some((o) => o.to === I(2, 2)));
  const e = claim(put(R.newGame(), 0, [[1, 1, 5]]), 1, 2, 0, 2, 2); rolled(e, [I(1, 1), I(6, 6)]);
  t('a base may move into enemy territory (when it is not an enemy base)', R.options(e, I(1, 1)).some((o) => o.to === I(2, 1)));
}
// closing territory, Go style
{
  const s = put(put(R.newGame(), 0, [[0, 1, 2]]), 1, [[0, 0, 2]]);   // Green has (0,1); Blue sits in the corner (0,0)
  const a = R.apply(rolled(s, [I(1, 0), I(6, 7)]), { type: 'land', R: I(1, 0), count: 1 });   // Green lands on (1,0): two bases touching diagonally close the corner
  t('two bases touching diagonally and the edge of the board close the corner', a.own[I(0, 0)] === 0);
  t('the bases around it belong to the territory', a.own[I(1, 0)] === 0 && a.own[I(0, 1)] === 0 && R.territorySize(a, 0) === 3);
  t('the enemy base inside is out and the point is empty', a.cells[I(0, 0)].o === null && a.graveyard[1] === 2);
  t('enemy cannot land in the closed territory', !R.canLand(R.roll(a, 1, 1), I(0, 0)));
  const diag = put(R.newGame(), 0, [[0, 3, 1], [1, 2, 1], [2, 1, 1]]);   // a diagonal line across a corner
  const dd = R.apply(rolled(diag, [I(3, 0), I(4, 7)]), { type: 'land', R: I(3, 0), count: 1 });
  t('a diagonal chain from edge to edge closes the corner (6 points + 4 bases)', dd.own[I(0, 0)] === 0 && dd.own[I(2, 0)] === 0 && dd.own[I(1, 1)] === 0 && R.territorySize(dd, 0) === 10, 'size ' + R.territorySize(dd, 0));
  const col = put(R.newGame(), 0, [[2, 0, 1], [2, 1, 1], [2, 2, 1], [2, 3, 1], [2, 4, 1], [2, 5, 1], [2, 6, 1]]);
  const c = R.apply(rolled(col, [I(2, 7), I(5, 0)]), { type: 'land', R: I(2, 7), count: 1 });
  t('a chain across the board closes the smaller side', c.own[I(0, 0)] === 0 && c.own[I(5, 3)] === null && R.territorySize(c, 0) === 24, 'size ' + R.territorySize(c, 0));
  const lone = R.apply(rolled(put(R.newGame(), 0, [[3, 3, 1]]), [I(4, 3), I(3, 4)]), { type: 'land', R: I(4, 3), count: 1 });
  t('two lone bases close nothing', R.territorySize(lone, 0) === 0);
  const gap = R.apply(rolled(put(R.newGame(), 0, [[0, 2, 1]]), [I(1, 0), I(6, 7)]), { type: 'land', R: I(1, 0), count: 1 });
  t('bases that leave a gap close nothing', R.territorySize(gap, 0) === 0);
  const d = R.roll(Object.assign(R.clone(a), { turn: 0 }), 1, 2);
  const d2 = R.apply(d, { type: 'withdraw', R: I(0, 1), count: 2 });
  t('closed territory stays closed when a base is withdrawn', d2.own[I(0, 0)] === 0 && d2.own[I(0, 1)] === 0);
}
// penetrating through a diagonal gap, and closing over enemy territory
{
  const a = R.apply(rolled(put(put(R.newGame(), 0, [[0, 1, 2]]), 1, [[1, 1, 4]]), [I(1, 0), I(6, 7)]), { type: 'land', R: I(1, 0), count: 1 });   // Green closes the corner; Blue stands on (1,1)
  const b = Object.assign(R.clone(a), { turn: 1 }); rolled(b, [I(1, 1), I(6, 6)]);
  t('a base can step diagonally into the closed corner', R.options(b, I(1, 1)).some((o) => o.to === I(0, 0)));
  const b2 = R.apply(b, { type: 'move', R: I(1, 1), from: I(1, 1), to: I(0, 0), count: 2 });
  t('...and stands inside enemy territory', b2.cells[I(0, 0)].o === 1 && b2.own[I(0, 0)] === 0);
  // a column of bases across the board closes the right side; if it contains closed enemy territory, only a base that penetrated it makes that possible
  const mk = (invade) => {
    const col = put(R.newGame(), 0, [0, 1, 2, 3, 4, 5, 6].map((y) => [4, y, 1]));
    for (let y = 6; y <= 7; y++) for (let x = 5; x <= 7; x++) col.own[I(x, y)] = 1;
    if (invade) col.own[I(4, 6)] = 1;   // one base of the chain stands on enemy territory
    return col;
  };
  const c0 = R.apply(rolled(mk(false), [I(4, 7), I(3, 0)]), { type: 'land', R: I(4, 7), count: 1 });
  t('closing around closed enemy territory without penetrating it closes nothing', R.territorySize(c0, 0) === 0 && c0.own[I(7, 7)] === 1);
  const c1 = R.apply(rolled(mk(true), [I(4, 7), I(3, 0)]), { type: 'land', R: I(4, 7), count: 1 });
  t('after penetrating it, the closed part takes the enemy territory inside', c1.own[I(7, 7)] === 0 && c1.own[I(5, 6)] === 0 && R.territorySize(c1, 1) === 0, 'enemy keeps ' + R.territorySize(c1, 1));
  const eb = mk(true); put(eb, 1, [[6, 6, 3]]);
  const c2 = R.apply(rolled(eb, [I(4, 7), I(3, 0)]), { type: 'land', R: I(4, 7), count: 1 });
  t('an enemy base inside the closed part leaves the board', c2.cells[I(6, 6)].o === null && c2.graveyard[1] === 3);
}
// transport inside your territory
{
  const s = claim(put(R.newGame(), 0, [[0, 0, 5], [3, 0, 2]]), 0, 0, 0, 3, 1); rolled(s, [I(0, 0), I(7, 7)]);
  t('transport along a row inside your territory', R.transportTargets(s, I(0, 0)).some((x) => x.to === I(3, 0)));
  const r = R.apply(s, { type: 'transport', R: I(0, 0), from: I(0, 0), to: I(3, 0), count: 4 });
  t('transport moves the chosen soldiers to one point', r.cells[I(3, 0)].n === 6 && r.cells[I(0, 0)].n === 1);
  const line = put(R.newGame(), 0, [[0, 0, 4], [1, 0, 1], [2, 0, 1]]); line.own[I(0, 0)] = 0; line.own[I(1, 0)] = 0; rolled(line, [I(0, 0), I(7, 7)]);
  t('transport two points along a line of your bases, also when the far base is not in the closed territory', R.transportTargets(line, I(0, 0)).some((x) => x.to === I(2, 0) && x.steps === 2));
  t('no transport through empty points that are not yours', R.transportTargets(put(R.newGame(), 0, [[0, 0, 5]]), I(0, 0)).length === 0);
  const all = claim(put(R.newGame(), 0, [[0, 0, 5], [3, 1, 2], [7, 7, 1]]), 0, 0, 0, 3, 1); rolled(all, [I(1, 0), I(6, 7)]);
  t('a rolled point inside your territory connects all its bases', R.sources(all, I(1, 0)).includes(I(0, 0)) && R.sources(all, I(1, 0)).includes(I(3, 1)) && !R.sources(all, I(1, 0)).includes(I(7, 7)));
}
// win: closed territories cover more than half of the board
{
  const mk = (n) => { const s = R.newGame(); for (let i = 0; i < n; i++) s.own[i] = 0; return s; };
  t('32 points are not enough', R.apply(R.roll(mk(32), 1, 1), { type: 'pass' }).winner === null);
  t('33 points win at the end of the turn', R.apply(R.roll(mk(33), 1, 1), { type: 'pass' }).winner === 0);
}
console.log(bad ? bad + ' FAILURE(S)' : 'all checks pass');
process.exit(bad ? 1 : 0);
