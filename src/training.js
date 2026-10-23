/* Province – Training (שיעורי אימון): theory cards + practice positions.
 * Each lesson: a few short theory cards, then practice positions. The player must make a move from the given position;
 * a move is accepted when its RESULT matches the idea of the lesson (accept(R, before, action, after)), so there may be several good moves.
 * Wrong first try: a hint and a second chance. Wrong again: the solution is played on the board, then on to the next position.
 * Positions are built from a compact spec (Green = you, y=0 is your side, dice [w,b] light the cells (w-1,b-1) and (6-w,6-b)).
 * The file also contains verify(Rules): every position must have a legal accepted move, a legal rejected move, and a valid solution.
 */
(function (root) {
  'use strict';

  // ---- catalogue (shown in the lessons menu). Lessons without `lesson` are not written yet ("Soon") ----
  const groups = [
    { title: 'Basic Training', lessons: [
      { id: 'territory', name: 'Importance of Territory' },
      { id: 'landing', name: 'Strategic Landing' },
      { id: 'attack', name: 'Attack Tactics' },
      { id: 'defense', name: 'Defensive Methods' },
      { id: 'opening', name: 'The Opening' },
      { id: 'endgame', name: 'End Game' },
    ] },
    { title: 'Advanced Training', lessons: [
      { id: 'offisolation', name: 'Offensive Isolation' },
      { id: 'defisolation', name: 'Defensive Isolation' },
      { id: 'keypoints', name: 'Landing Keypoints' },
      { id: 'architecture', name: 'Territory Architecture' },
      { id: 'invading', name: 'Strategic Invading' },
      { id: 'forces', name: 'Forces Management' },
      { id: 'risk', name: 'Risk and Opportunity' },
    ] },
  ];

  // ---- position builder ----
  // spec: { g: [[x,y,n]...] Green bases, b: [[x,y,n]...] Blue bases, br: [[x1,y1,x2,y2,owner]...] bridges, dice: [w,b], grave: [gGreen, gBlue] }
  function position(Rules, spec) {
    const R = Rules.forSize(6);
    let s = R.newGame();
    for (const [x, y, n] of spec.g || []) { const c = s.cells[R.idx(x, y)]; c.o = 0; c.n = n; }
    for (const [x, y, n] of spec.b || []) { const c = s.cells[R.idx(x, y)]; c.o = 1; c.n = n; }
    for (const [x1, y1, x2, y2, o] of spec.br || []) { s.bridges[R.bridgeKey(R.idx(x1, y1), R.idx(x2, y2))] = o; s.bridgesLeft[o] -= 1; }
    if (spec.grave) s.graveyard = spec.grave.slice();
    s.turn = 0;
    return R.roll(s, spec.dice[0], spec.dice[1]);
  }

  const ctlOf = (R, s, p) => R.provinceControl(s).map((o, k) => (o === p ? k : -1)).filter((k) => k >= 0);

  // ---- measurements used by the lessons (all exact, computed from the rules) ----
  // chance (over the 36 dice rolls) that player p could attack at least one enemy base on their turn; with `cell`, that exact base
  function strike(R, s, p, cell) {
    const base = R.clone(s); base.turn = p; base.roll = null; base.winner = null;
    let n = 0;
    for (let w = 1; w <= 6; w++) for (let b = 1; b <= 6; b++) {
      const t = R.roll(base, w, b); let hit = false;
      for (const Rc of t.roll.cells) {
        for (const f of R.sources(t, 'move', Rc)) for (const x of R.targets(t, 'move', Rc, f)) if (x.kind === 'attack' && (cell === undefined || x.to === cell)) hit = true;
        if (hit) break;
      }
      if (hit) n++;
    }
    return n / 36;
  }
  // expected number of enemy soldiers player p could kill on their turn (over the 36 rolls, best single attack each time;
  // an attack can use only the soldiers standing on the attacking base)
  function kills(R, s, p) {
    const base = R.clone(s); base.turn = p; base.roll = null; base.winner = null;
    let tot = 0;
    for (let w = 1; w <= 6; w++) for (let b = 1; b <= 6; b++) {
      const t = R.roll(base, w, b); let best = 0;
      for (const Rc of t.roll.cells) for (const f of R.sources(t, 'move', Rc)) for (const x of R.targets(t, 'move', Rc, f))
        if (x.kind === 'attack') best = Math.max(best, Math.min(t.cells[f].n, t.cells[x.to].n));
      tot += best;
    }
    return tot / 36;
  }
  // chance that at least one of the two lit squares falls inside player p's territory (= a "free turn")
  function freeTurn(R, s, p) {
    const nodes = R.territoryNodes(s, p); let n = 0;
    for (let w = 1; w <= 6; w++) for (let b = 1; b <= 6; b++) if (nodes[R.idx(w - 1, b - 1)] || nodes[R.idx(6 - w, 6 - b)]) n++;
    return n / 36;
  }
  const terrSize = (R, s, p) => Array.from(R.territoryNodes(s, p)).filter(Boolean).length;
  const pct = (x) => Math.round(100 * x) + '%';
  const heldOf = (R, s, p) => R.provinceControl(s).filter((o) => o === p).length;
  const adjacentContact = (R, s) => { for (let i = 0; i < R.CELLS; i++) if (s.cells[i].o === 0) for (const n of R.neighbors(i)) if (s.cells[n].o === 1) return true; return false; };
  const asTurn = (R, s, p) => { const t = R.clone(s); t.turn = p; t.roll = null; t.winner = null; return t; };

  // ---- lesson 1: Importance of Territory ----
  // Every claim below was checked: free-turn numbers are exact (36 dice rolls), and each practice position was run through the
  // neural-network evaluation (tests/puzzle_eval.js): the accepted moves are the ones the net rates best.
  const I = (x, y) => y * 6 + x;
  const GREEN3 = { g: [[0, 0, 3], [1, 1, 4], [2, 1, 3], [1, 2, 3], [1, 3, 4]], br: [[1, 1, 2, 1, 0], [1, 1, 1, 2, 0]] };   // three connected provinces
  const territory = {
    id: 'territory',
    name: 'Importance of Territory',
    idea: 'Territory is freedom. Freedom decides who strikes first.',
    theory: [
      { title: 'Territory is freedom', body: 'A lit square inside your connected territory lets you play from <b>any</b> base in it. Each province you hold gives about <b>20% more</b> free turns.' },
      { title: 'Free turns', body: '4 squares: free in <b>22%</b> of turns. 8: <b>44%</b>. 12: <b>67%</b>. 16: <b>78%</b>. Hold 5 provinces and nearly every turn is free.' },
      { title: 'Strike first', body: 'Attackers lose nothing: they go back to camp. Defenders <b>die for good</b>. A strike kills as many as the attacking base holds, up to what it hits.' },
      { title: 'Size decides', body: 'On a free turn you can hit <b>any</b> enemy base that touches <b>any</b> of your bases. The bigger territory usually strikes first.' },
      { title: 'The rule', body: 'Bigger than them? <b>Press</b>, with more soldiers than their base next door. And hit the base that is <b>alone</b> in its province: it costs them the whole province.' },
    ],
    puzzles: [],
    recap: 'Territory is freedom. Grow it cheaply, press when you are bigger, and hit the lone base.',
  };
  const note = (R, s) => `Your territory: <b>${terrSize(R, s, 0)}</b> squares, free in <b>${pct(freeTurn(R, s, 0))}</b> of turns. Blue: <b>${terrSize(R, s, 1)}</b>, free in <b>${pct(freeTurn(R, s, 1))}</b>.`;
  territory.puzzles = [
    {   // 1. the cheapest way to add a province
      prompt: 'Find the cheapest territory.',
      spec: Object.assign({}, { g: GREEN3.g.concat([[3, 0, 2], [4, 3, 2]]), br: GREEN3.br, b: [[1, 4, 6], [0, 5, 2], [5, 5, 3]], dice: [2, 3] }),
      info: (R, s) => note(R, s),
      accept: (R, before, a, after) => freeTurn(R, after, 0) - freeTurn(R, before, 0) >= 0.15,
      solution: { type: 'move', R: I(1, 2), from: I(3, 0), to: I(4, 0), count: 1 },
      good: (R, before, a, after) => `Free turns: <b>${pct(freeTurn(R, before, 0))}</b> to <b>${pct(freeTurn(R, after, 0))}</b>. One soldier crossing the river claimed an empty province and built the bridge to it.`,
      hint: (R) => `A new province adds the most <b>free turns</b>. A single soldier across the river is enough.`,
      shown: 'Move one soldier across the river. The empty province becomes yours, and your free turns jump.',
    },
    {   // 2. press when bigger, with force
      prompt: 'You are bigger. Press.',
      spec: { g: [[0, 0, 3], [1, 1, 3], [2, 1, 2], [3, 0, 2], [1, 2, 2], [1, 3, 3]], br: GREEN3.br, b: [[4, 2, 5], [5, 3, 3], [5, 4, 5], [4, 5, 3]], dice: [4, 3] },
      info: (R, s) => note(R, s),
      accept: (R, before, a, after) => a.type === 'land' && a.to === I(3, 2) && a.count >= 6,
      solution: { type: 'land', R: I(3, 2), to: I(3, 2), count: 20 },
      good: (R, before, a, after) => `Blue's base next door holds <b>5</b>, so a strike could kill at most 5 of your <b>${after.cells[I(3, 2)].n}</b>. Now you threaten it.`,
      hint: (R, before, a, after) => (a.type === 'land' && a.to === I(3, 2)
        ? `Blue's base next door holds <b>5</b>: a strike would kill every soldier you land. Bring <b>more than 5</b>.`
        : `You hold more territory, so you strike first. <b>Get close</b> to Blue's base, and land more soldiers than it holds.`),
      shown: 'Land next to Blue with more soldiers than their base holds. You threaten it, and it cannot wipe you out.',
    },
    {   // 3. the lone base
      prompt: 'Free turn. Choose your target.',
      spec: { g: [[0, 0, 3], [1, 1, 4], [2, 1, 3], [1, 2, 3], [1, 3, 4], [4, 3, 2]], br: GREEN3.br, b: [[2, 3, 3], [1, 4, 6], [0, 5, 2], [5, 5, 3]], dice: [2, 3] },
      info: (R, s) => note(R, s),
      accept: (R, before, a, after) => a.type === 'move' && heldOf(R, after, 1) < heldOf(R, before, 1),
      solution: { type: 'move', R: I(1, 2), from: I(1, 3), to: I(2, 3), count: 3 },
      good: (R, before, a, after) => `That base was alone in its province, so Blue lost the whole province: <b>${heldOf(R, before, 1)}</b> to <b>${heldOf(R, after, 1)}</b> provinces.`,
      hint: 'The prize is not soldiers, it is <b>provinces</b>. Look for the enemy base that is <b>alone</b> in its province.',
      shown: 'Hit the lone base. Blue loses the whole province, and your attackers go back to camp.',
    },
  ];

  const lessons = { territory };

  // ---- self test (Node / browser) ----
  function verify(Rules) {
    const R = Rules.forSize(6); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
    const out = [];
    for (const id in lessons) {
      lessons[id].puzzles.forEach((P, i) => {
        const s = position(Rules, P.spec), tag = `${id}#${i + 1}`;
        // all legal actions (every count) from the position
        const acts = [], p = 0;
        for (const Rc of s.roll.cells) {
          if (R.camp(s, p) > 0 && R.landTargets(s, Rc).length) for (let c = 1; c <= R.camp(s, p); c++) acts.push({ type: 'land', R: Rc, to: Rc, count: c });
          for (const t of ['move', 'transport', 'withdraw', 'bridge']) for (const f of R.sources(s, t, Rc)) {
            const n = s.cells[f].n;
            if (t === 'withdraw') { for (let c = 1; c <= n; c++) acts.push({ type: t, R: Rc, from: f, count: c }); continue; }
            for (const x of R.targets(s, t, Rc, f)) { if (t === 'bridge') acts.push({ type: t, R: Rc, from: f, to: x.to, count: 0 }); else for (let c = 1; c <= n; c++) acts.push({ type: t, R: Rc, from: f, to: x.to, count: c }); }
          }
        }
        let ok = 0, bad = 0;
        for (const a of acts) { let ns; try { ns = R.apply(s, a); } catch (e) { continue; } if (P.accept(R, s, a, ns)) ok++; else bad++; }
        let sol = 'valid';
        try { const ns = R.apply(s, P.solution); if (!P.accept(R, s, P.solution, ns)) sol = 'NOT ACCEPTED'; } catch (e) { sol = 'ILLEGAL: ' + e.message; }
        out.push({ tag, legal: acts.length, accepted: ok, rejected: bad, solution: sol, good: ok > 0 && bad > 0 && sol === 'valid' });
      });
    }
    return { ok: out.every((x) => x.good), out };
  }

  root.TRAINING = { groups, lessons, position, verify, strike, freeTurn, terrSize, kills };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TRAINING;
})(typeof window !== 'undefined' ? window : globalThis);
