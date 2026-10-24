// Builds the staged scenes for the meme reels with the REAL rules engine: a clean starting position plus a script of dice rolls and actions.
// Every action is applied through Rules.apply (an illegal script throws), and a snapshot of the board is written after each event.
//   node tools/reels/gen_scenes.js        -> tools/reels/scenes/<name>.json
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
global.Rules = require(path.join(root, 'src/rules.js'));
const R = Rules.forSize(6); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
const I = (x, y) => y * 6 + x;
const snap = (s) => ({ cells: s.cells.map((c) => [c.o === null ? -1 : c.o, c.n]), bridges: s.bridges, grave: s.graveyard.slice(), camp: [R.camp(s, 0), R.camp(s, 1)], turn: s.turn, winner: s.winner,
  ctl: R.provinceControl(s).map((o) => (o === null ? -1 : o)), prog: [R.winProgress(s, 0), R.winProgress(s, 1)], roll: s.roll ? { w: s.roll.w, b: s.roll.b, cells: s.roll.cells } : null });

function build(spec) {
  let s = R.newGame();
  for (const [x, y, n] of spec.g || []) { const c = s.cells[I(x, y)]; c.o = 0; c.n = n; }
  for (const [x, y, n] of spec.b || []) { const c = s.cells[I(x, y)]; c.o = 1; c.n = n; }
  for (const [x1, y1, x2, y2, o] of spec.br || []) { s.bridges[R.bridgeKey(I(x1, y1), I(x2, y2))] = o; s.bridgesLeft[o] -= 1; }
  if (spec.grave) s.graveyard = spec.grave.slice();
  return s;
}
const act = (type, from, to, count, Rr) => (type === 'land' ? { type, R: Rr, to: Rr, count } : { type, R: Rr, from: I(...from), to: I(...to), count });

function run(name, spec, steps, keyStep, extra) {
  let s = build(spec); const events = [], snaps = [snap(s)];
  steps.forEach((st, k) => {
    s.turn = st.actor; s = R.roll(s, st.dice[0], st.dice[1]);
    events.push({ kind: 'roll', actor: st.actor, data: { w: s.roll.w, b: s.roll.b } }); snaps.push(snap(s));
    let ns, ev;
    if (st.skip) { ns = R.skipTurn(s); ev = { kind: 'skip', actor: st.actor, data: {} }; }
    else if (st.pass) { ns = R.passTurn(s); ev = { kind: 'skip', actor: st.actor, data: { pass: true } }; }
    else {
      const a = st.act; const hit = a.type === 'move' && s.cells[a.to] && s.cells[a.to].o === 1 - st.actor ? Math.min(a.count, s.cells[a.to].n) : 0;
      ns = R.apply(s, a); ev = { kind: 'act', actor: st.actor, data: a, killed: hit };
    }
    events.push(ev); snaps.push(snap(ns)); s = ns;
    if (k === keyStep) extra.keyIdx = events.length - 1;
  });
  fs.mkdirSync(path.join(__dirname, 'scenes'), { recursive: true });
  const out = { name, size: 6, events, snaps, keyIdx: extra.keyIdx, winner: s.winner };
  fs.writeFileSync(path.join(__dirname, 'scenes', name + '.json'), JSON.stringify(out));
  const last = snaps[snaps.length - 1], first = snaps[1];
  console.log(name, 'events', events.length, 'key', extra.keyIdx, '| prog before/after key:', JSON.stringify(snaps[extra.keyIdx].prog), '->', JSON.stringify(snaps[extra.keyIdx + 1].prog), '| grave', JSON.stringify(last.grave));
}

// 1. one soldier cuts a 4-province chain in half
run('lone', {
  g: [[1, 1, 5], [0, 0, 2], [2, 1, 4], [3, 0, 3], [2, 2, 4], [3, 3, 3]],
  b: [[2, 4, 3], [4, 5, 2], [5, 5, 2], [0, 5, 3]],
  br: [[1, 1, 2, 1, 0], [2, 1, 2, 2, 0]],
}, [
  { actor: 0, dice: [3, 3], act: act('move', [3, 3], [4, 3], 2, I(2, 2)) },     // I claim the 4th province: 4 connected, one more to win
  { actor: 1, dice: [3, 4], act: act('move', [2, 4], [2, 3], 1, I(2, 3)) },     // Blue walks ONE soldier into my middle province
], 1, {});

// 2. attackers go home, defenders do not
run('wipe', {
  g: [[1, 1, 12], [0, 0, 3], [2, 2, 2]],
  b: [[4, 4, 4], [5, 5, 3]],
}, [
  { actor: 1, dice: [3, 2], act: act('land', null, null, 12, I(2, 1)) },        // Blue lands 12 right next to me
  { actor: 0, dice: [3, 2], act: act('move', [1, 1], [2, 1], 12, I(2, 1)) },    // I attack with 12
], 1, {});

// 3. "it's just luck"
run('luck', {
  g: [[0, 0, 3]],
  b: [[4, 4, 5], [5, 5, 2]],
}, [
  { actor: 0, dice: [4, 5], act: act('land', null, null, 24, I(3, 4)) },        // 24 soldiers on the lit square, next to Blue's base
  { actor: 1, dice: [1, 3], pass: true },
  { actor: 0, dice: [5, 5], act: act('move', [3, 4], [4, 4], 24, I(4, 4)) },    // and the attack
], 2, {});

// 4. the dice have other plans
run('nomove', {
  g: [[0, 0, 5], [0, 1, 3], [0, 2, 4], [1, 3, 3], [1, 4, 3], [0, 5, 2]],
  b: [[2, 0, 4], [3, 1, 3], [3, 4, 4], [2, 5, 3]],
  br: [[0, 1, 0, 2, 0], [1, 3, 1, 4, 0]],
}, [
  { actor: 0, dice: [4, 5], skip: true },
], 0, {});
