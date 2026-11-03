/* Province – new-rules prototype ("squares", third game): engine. Works in the browser (window.Rules7) and in Node (module.exports).
 *
 * Board: 8x8 squares, no rivers, no walls, no attacks. 54 soldiers each. A turn: roll the dice once (two numbers, x and y);
 * they mark two opposite squares (as in the original game). One action per turn:
 *   land      new soldiers on a rolled square (empty or your base; next to an enemy base is fine; not in enemy territory)
 *   withdraw  soldiers from a base connected to the rolled square (see sources) back to camp
 *   move      from a base standing on or next to a rolled square, to any neighbouring square (never onto an enemy base or into enemy territory)
 *   transport from a base connected to the rolled square, in a straight line through your closed territory
 *   pass
 * Closing territory: when your bases (touching side to side - a diagonal touch leaves a gap) and the edge of the board enclose empty squares (the smaller side of the cut, never the biggest part),
 * those squares - and the bases around them - become your closed territory. Enemy bases inside are removed from the board.
 * Closed territory is permanent and enemies cannot enter it.
 * Win: your closed territories (they need not touch) cover more than half of the board at the end of your turn.
 */
(function (root) {
  'use strict';
  const N = 8, CELLS = N * N, SOLDIERS = 54, WIN = Math.floor(CELLS / 2) + 1, MAX_ROLLS = 1;   // more than half of the board: 33 squares
  const idx = (x, y) => y * N + x;
  const xy = (i) => [i % N, Math.floor(i / N)];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
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

  const around = (i) => {   // the 8 squares around i
    const [x, y] = xy(i), out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(idx(nx, ny)); }
    return out;
  };
  // own bases that touch each other: the chain containing base i
  function group(s, i) {
    const p = s.cells[i].o, seen = new Set([i]), list = [i];
    if (p === null) return [];
    for (let h = 0; h < list.length; h++) for (const j of neighbors(list[h])) if (s.cells[j].o === p && !seen.has(j)) { seen.add(j); list.push(j); }
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
  // bases that may move from rolled square R: standing on it or next to it
  const movers = (s, R) => [R, ...neighbors(R)].filter((i) => s.cells[i].o === s.turn);
  // bases connected to rolled square R: the chains of its movers, and every base in your closed territory that contains R
  function sources(s, R) {
    const p = s.turn, set = new Set();
    for (const i of movers(s, R)) for (const j of group(s, i)) set.add(j);
    if (s.own[R] === p) {
      const seen = new Set([R]), list = [R];
      for (let h = 0; h < list.length; h++) for (const j of neighbors(list[h])) if (s.own[j] === p && !seen.has(j)) { seen.add(j); list.push(j); }
      for (const i of list) if (s.cells[i].o === p) set.add(i);
    }
    return [...set];
  }
  const canWithdraw = (s, R) => sources(s, R).length > 0;
  // a move may go to a neighbour that holds no enemy base and is not enemy territory
  const moveTargets = (s, from) => neighbors(from).filter((j) => s.cells[j].o !== 1 - s.turn && s.own[j] !== 1 - s.turn);
  // straight lines through your closed territory: [{ to, steps }]
  function transportTargets(s, from) {
    const p = s.turn, out = [], [fx, fy] = xy(from);
    if (s.own[from] !== p) return out;
    for (const [dx, dy] of DIRS) {
      let cx = fx, cy = fy, steps = 0;
      for (;;) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) break;
        const b = idx(nx, ny);
        if (s.own[b] !== p || s.cells[b].o === 1 - p) break;
        steps++; out.push({ to: b, steps });
        cx = nx; cy = ny;
      }
    }
    return out;
  }
  // where the base 'from' may go this turn: [{ to, type: move|transport, R }]
  function options(s, from) {
    const out = new Map();
    if (!s.roll || s.cells[from].o !== s.turn) return [];
    for (const rc of s.roll.cells) {
      if (movers(s, rc).includes(from)) for (const j of moveTargets(s, from)) if (!out.has(j)) out.set(j, { to: j, type: 'move', R: rc });
      if (sources(s, rc).includes(from)) for (const tr of transportTargets(s, from)) if (!out.has(tr.to)) out.set(tr.to, { to: tr.to, type: 'transport', R: rc });
    }
    return [...out.values()];
  }

  // ---------- closing territory ----------
  // the parts of the board that player p's bases cut it into (bases themselves are the barrier); every part except the biggest is closed
  function claim(s, p) {
    const q = 1 - p, seen = new Array(CELLS).fill(false), comps = [];
    for (let i = 0; i < CELLS; i++) {
      if (seen[i] || s.cells[i].o === p) continue;
      const list = [i]; seen[i] = true;
      for (let h = 0; h < list.length; h++) for (const j of around(list[h])) if (!seen[j] && s.cells[j].o !== p) { seen[j] = true; list.push(j); }   // empty squares connect diagonally too: bases that only touch diagonally leave a gap
      comps.push(list);
    }
    const big = comps.reduce((m, l) => Math.max(m, l.length), 0);
    let closed = 0, out = 0;
    for (const l of comps) {
      if (l.length === big) continue;
      for (const i of l) {
        if (s.own[i] !== null) continue;
        s.own[i] = p; closed++;
        if (s.cells[i].o === q) { out += s.cells[i].n; s.graveyard[q] += s.cells[i].n; s.cells[i].o = null; s.cells[i].n = 0; }
        for (const b of around(i)) if (s.cells[b].o === p && s.own[b] === null) { s.own[b] = p; closed++; }   // the bases around it belong to the territory too
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
      if (!options(s, act.from).some((o) => o.to === act.to && o.type === act.type)) throw new Error('illegal target');
      const dst = cells[act.to];
      src.n -= count; dst.o = p; dst.n += count; ns.log.push(`${name}: ${act.type === 'move' ? 'moved' : 'transported'} ${count}`);
      if (src.n === 0) src.o = null;
    } else throw new Error('unknown action');
    const c = claim(ns, p);
    if (c.closed) ns.log.push(`${name}: closed ${c.closed} square${c.closed > 1 ? 's' : ''}` + (c.out ? `, ${c.out} enemy soldier${c.out > 1 ? 's' : ''} out` : ''));
    endTurn(ns);
    return ns;
  }

  root.Rules7 = {
    N, CELLS, SOLDIERS, WIN, MAX_ROLLS, idx, xy, newGame, neighbors, onBoard, camp, owners, group, territorySize, roll,
    canLand, canWithdraw, movers, sources, moveTargets, transportTargets, options, claim, apply, pass, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Rules7;
})(typeof window !== 'undefined' ? window : globalThis);
