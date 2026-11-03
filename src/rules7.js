/* Province – new-rules prototype ("squares" -> points, Go-like, third game): engine. Works in the browser (window.Rules7) and in Node (module.exports).
 *
 * Board: 8x8 points (like Go), no rivers, no walls, no attacks. 32 soldiers each. Bases touch each other in 8 directions (a diagonal contact connects).
 * A turn: roll the dice once (two numbers, x and y); they mark two opposite points (as in the original game). One action per turn:
 *   land      new soldiers on a rolled point (empty or your base; next to an enemy base is fine; not in enemy territory)
 *   withdraw  soldiers from a base connected to the rolled point (see sources) back to camp
 *   move      from a base connected to the rolled point, to any of the 8 neighbouring points that holds no enemy base
 *   transport from a base connected to the rolled point, in a straight line through your territory
 *   pass
 * Closing territory (like Go): your bases, connected side to side or diagonally, and the edge of the board enclose points that connect to each
 * other only side to side. Every enclosed part except the biggest is closed: its points - and the bases around them - become your territory.
 * Enemy bases inside are removed from the board. A part that contains closed enemy territory can be closed only by penetrating it (one base of your wall stands
 * on enemy territory); then the enemy territory inside becomes yours.
 * An invasion is legal only when it closes territory: after the move no base of yours may stand on enemy territory (as in Go, an illegal position is not allowed).
 * A diagonal gap between two bases is open:
 * bases can move through it, also into territory that looks closed.
 * Win: your territories (they need not touch) cover more than half of the board at the end of your turn.
 */
(function (root) {
  'use strict';
  const N = 8, CELLS = N * N, SOLDIERS = 32, WIN = Math.floor(CELLS / 2) + 1, MAX_ROLLS = 1;   // more than half of the board: 33 squares
  const idx = (x, y) => y * N + x;
  const xy = (i) => [i % N, Math.floor(i / N)];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIRS8 = [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const clone = (s) => JSON.parse(JSON.stringify(s));

  function newGame() {
    return { size: N, cells: Array.from({ length: CELLS }, () => ({ o: null, n: 0 })), own: new Array(CELLS).fill(null), graveyard: [0, 0], turn: 0, rolls: 0, roll: null, winner: null, log: [] };
  }
  function neighbors(i) {
    const [x, y] = xy(i), out = [];
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(idx(nx, ny)); }
    return out;
  }
  const onBoard = (s, p) => s.cells.reduce((a, c) => a + (c.o === p ? c.n : 0), 0);
  const camp = (s, p) => SOLDIERS - onBoard(s, p) - s.graveyard[p];
  const owners = (s) => s.own;
  const territorySize = (s, p) => s.own.reduce((a, o) => a + (o === p ? 1 : 0), 0);

  const around = (i) => {   // the 8 points around i
    const [x, y] = xy(i), out = [];
    for (const [dx, dy] of DIRS8) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(idx(nx, ny)); }
    return out;
  };
  // own bases that touch each other (also diagonally): the chain containing base i
  function group(s, i) {
    const p = s.cells[i].o, seen = new Set([i]), list = [i];
    if (p === null) return [];
    for (let h = 0; h < list.length; h++) for (const j of around(list[h])) if (s.cells[j].o === p && !seen.has(j)) { seen.add(j); list.push(j); }
    return list;
  }

  // roll the dice (w and b in 1..N): like the original game, two opposite squares
  function roll(s, w, b) {
    if (s.winner !== null) throw new Error('game over');
    if (s.rolls >= MAX_ROLLS) throw new Error('no rolls left');
    const ns = clone(s);
    ns.rolls++; ns.roll = { w, b, cells: [idx(w - 1, b - 1), idx(N - w, N - b)] };
    return ns;
  }

  // ---------- what the player may do ----------
  const canLand = (s, R) => camp(s, s.turn) > 0 && (s.cells[R].o === null || s.cells[R].o === s.turn) && s.own[R] !== 1 - s.turn;
  // bases connected to rolled point R: the chains of the bases on or next to it, and every base in your territory that contains R
  function sources(s, R) {
    const p = s.turn, set = new Set();
    for (const i of [R, ...around(R)]) if (s.cells[i].o === p) for (const j of group(s, i)) set.add(j);
    if (s.own[R] === p) {
      const seen = new Set([R]), list = [R];
      for (let h = 0; h < list.length; h++) for (const j of around(list[h])) if (s.own[j] === p && !seen.has(j)) { seen.add(j); list.push(j); }
      for (const i of list) if (s.cells[i].o === p) set.add(i);
    }
    return [...set];
  }
  const canWithdraw = (s, R) => sources(s, R).length > 0;
  // a move may go to any of the 8 neighbouring points that holds no enemy base
  const moveTargets = (s, from) => around(from).filter((j) => s.cells[j].o !== 1 - s.turn);
  // straight lines (8 directions) through your territory and your own bases: [{ to, steps }]
  function transportTargets(s, from) {
    const p = s.turn, out = [], [fx, fy] = xy(from);
    for (const [dx, dy] of DIRS8) {
      let cx = fx, cy = fy, steps = 0;
      for (;;) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) break;
        const b = idx(nx, ny);
        if (s.cells[b].o === 1 - p || (s.own[b] !== p && s.cells[b].o !== p)) break;   // only through your territory and your own bases
        steps++; out.push({ to: b, steps });
        cx = nx; cy = ny;
      }
    }
    return out;
  }
  // where the base 'from' may go this turn: [{ to, type: move|transport, R }]
  function optionsRaw(s, from) {
    const out = new Map();
    if (!s.roll || s.cells[from].o !== s.turn) return [];
    for (const rc of s.roll.cells) {
      if (!sources(s, rc).includes(from)) continue;
      for (const j of moveTargets(s, from)) if (!out.has(j)) out.set(j, { to: j, type: 'move', R: rc });
      for (const tr of transportTargets(s, from)) if (!out.has(tr.to)) out.set(tr.to, { to: tr.to, type: 'transport', R: rc });
    }
    return [...out.values()];
  }

  // the options a player really has: a move into enemy territory counts only if some number of soldiers makes it legal (see apply)
  function options(s, from) {
    const raw = optionsRaw(s, from), q = 1 - s.turn;
    return raw.filter((o) => {
      if (o.type !== 'move' || s.own[o.to] !== q) return true;
      const n = s.cells[from].n;
      return [1, n].some((count) => { try { apply(s, { type: 'move', R: o.R, from, to: o.to, count }); return true; } catch (e) { return false; } });
    });
  }

  // ---------- closing territory ----------
  // the parts of the board that player p's bases (connected also diagonally) cut it into; points of a part connect side to side only.
  // every part except the biggest is closed: it becomes p's territory, enemy bases in it are removed
  function claim(s, p) {
    const q = 1 - p, seen = new Array(CELLS).fill(false), comps = [];
    for (let i = 0; i < CELLS; i++) {
      if (seen[i] || s.cells[i].o === p) continue;
      const list = [i]; seen[i] = true;
      for (let h = 0; h < list.length; h++) for (const j of neighbors(list[h])) if (!seen[j] && s.cells[j].o !== p) { seen[j] = true; list.push(j); }
      comps.push(list);
    }
    const big = comps.reduce((m, l) => Math.max(m, l.length), 0);
    let closed = 0, out = 0;
    for (const l of comps) {
      if (l.length === big) continue;
      // closed enemy territory is not yours to enclose, unless you penetrated it: one of the bases of your wall stands on enemy territory
      if (l.some((i) => s.own[i] === q) && !l.some((i) => around(i).some((b) => s.cells[b].o === p && s.own[b] === q))) continue;
      for (const i of l) {
        if (s.own[i] !== p) { s.own[i] = p; closed++; }
        if (s.cells[i].o === q) { out += s.cells[i].n; s.graveyard[q] += s.cells[i].n; s.cells[i].o = null; s.cells[i].n = 0; }
        for (const b of around(i)) if (s.cells[b].o === p && s.own[b] !== p) { s.own[b] = p; closed++; }   // the bases around it belong to the territory too
      }
    }
    return { closed, out };
  }

  function endTurn(s) {
    const p = s.turn;
    s.roll = null; s.rolls = 0;
    if (territorySize(s, p) >= WIN) { s.winner = p; s.log.push(`${p === 0 ? 'Green' : 'Blue'} has ${territorySize(s, p)} squares of closed territory and wins!`); }
    else s.turn = 1 - p;
  }
  function pass(s) { const ns = clone(s); ns.log.push(`${ns.turn === 0 ? 'Green' : 'Blue'}: passed`); endTurn(ns); return ns; }

  // act: { type: land|withdraw|move|transport|pass, R (rolled square), from, to, count }. Throws when illegal.
  function apply(s, act) {
    if (s.winner !== null) throw new Error('game over');
    if (!s.roll) throw new Error('roll first');
    if (act.type === 'pass') return pass(s);
    if (!s.roll.cells.includes(act.R)) throw new Error('not a rolled square');
    const p = s.turn, ns = clone(s), cells = ns.cells, name = p === 0 ? 'Green' : 'Blue', count = act.count | 0;
    if (act.type === 'land') {
      if (!canLand(s, act.R)) throw new Error('cannot land there');
      if (count < 1 || count > camp(s, p)) throw new Error('bad count');
      cells[act.R].o = p; cells[act.R].n += count; ns.log.push(`${name}: landed ${count}`);
    } else if (act.type === 'withdraw') {
      const from = act.from === undefined ? act.R : act.from;
      if (!sources(s, act.R).includes(from)) throw new Error('not a base connected to the rolled square');
      if (count < 1 || count > cells[from].n) throw new Error('bad count');
      cells[from].n -= count; if (cells[from].n === 0) cells[from].o = null; ns.log.push(`${name}: withdrew ${count}`);
    } else if (act.type === 'move' || act.type === 'transport') {
      const src = cells[act.from];
      if (s.cells[act.from].o !== p || count < 1 || count > src.n) throw new Error('bad count');
      if (!optionsRaw(s, act.from).some((o) => o.to === act.to && o.type === act.type)) throw new Error('illegal target');
      const dst = cells[act.to];
      src.n -= count; dst.o = p; dst.n += count; ns.log.push(`${name}: ${act.type === 'move' ? 'moved' : 'transported'} ${count}`);
      if (src.n === 0) src.o = null;
    } else throw new Error('unknown action');
    const c = claim(ns, p);
    // like Go: a base may not stay inside enemy territory unless closing territory has just made that square yours
    for (let i = 0; i < CELLS; i++) if (ns.cells[i].o === p && ns.own[i] === 1 - p) throw new Error('illegal: an invasion must close territory');
    if (c.closed) ns.log.push(`${name}: closed ${c.closed} square${c.closed > 1 ? 's' : ''}` + (c.out ? `, ${c.out} enemy soldier${c.out > 1 ? 's' : ''} out` : ''));
    endTurn(ns);
    return ns;
  }

  root.Rules7 = {
    N, CELLS, SOLDIERS, WIN, MAX_ROLLS, idx, xy, newGame, neighbors, onBoard, camp, owners, group, territorySize, roll,
    canLand, canWithdraw, sources, moveTargets, transportTargets, options, claim, apply, pass, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Rules7;
})(typeof window !== 'undefined' ? window : globalThis);
