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

  // ---- lesson 1: Importance of Territory ----
  const territory = {
    id: 'territory',
    name: 'Importance of Territory',
    idea: 'Claim it, connect it, protect it.',
    theory: [
      { title: 'Territory', body: 'Hold a province <b>alone</b> and every square in it becomes <b>your territory</b>.' },
      { title: 'Why it matters', body: 'In your territory you can play from <b>any</b> base. Outside it, your options shrink.' },
      { title: 'To win', body: 'You need <b>5 provinces</b>, all <b>connected</b>. Claim them, connect them, protect them.' },
    ],
    puzzles: [
      {
        prompt: 'Claim a new province.',
        spec: { g: [[0, 0, 3], [1, 1, 4]], b: [[2, 4, 4], [3, 5, 3]], dice: [2, 2] },
        accept: (R, before, a, after) => ctlOf(R, after, 0).length > ctlOf(R, before, 0).length,
        solution: { type: 'land', R: 28, to: 28, count: 4 },
        good: 'Yes! You are alone in that province, so the <b>whole province</b> is yours now.',
        hint: 'Reinforcing a province you already hold gains no territory. Land where <b>nobody</b> has soldiers.',
        shown: 'Land in the empty province. It becomes yours.',
      },
      {
        prompt: 'Connect your territory.',
        spec: { g: [[0, 0, 3], [1, 1, 5], [2, 1, 3], [3, 0, 2]], b: [[4, 4, 4], [5, 5, 3]], dice: [3, 2] },
        accept: (R, before, a, after) => R.winProgress(after, 0) > R.winProgress(before, 0),
        solution: { type: 'move', R: 8, from: 7, to: 8, count: 1 },
        good: 'The bridge joins your two provinces into <b>one territory</b>. Both count now.',
        hint: 'Two provinces that are not connected count <b>separately</b>. Build a bridge across the river between them.',
        shown: 'Cross the river from your left base to build a bridge.',
      },
      {
        prompt: 'Take back your province.',
        spec: { g: [[0, 0, 4], [0, 1, 3], [3, 0, 3], [2, 1, 2]], b: [[1, 1, 1], [2, 4, 3]], dice: [2, 2] },
        accept: (R, before, a, after) => R.provinceControl(after)[0] === 0,
        solution: { type: 'move', R: 7, from: 6, to: 7, count: 1 },
        good: "Blue's soldier is gone, so the province is <b>yours again</b>.",
        hint: 'Blue has a soldier in your province, so <b>nobody</b> controls it. Attack it.',
        shown: 'Attack the lone soldier from the base next to it.',
      },
    ],
    recap: 'Claim it, connect it, protect it.',
  };

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

  root.TRAINING = { groups, lessons, position, verify };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TRAINING;
})(typeof window !== 'undefined' ? window : globalThis);
