/* Province – new-rules prototype ("squares"): engine. Works in the browser (window.Rules7) and in Node (module.exports).
 *
 * Board: 7x7 squares, no rivers. The 6x6 points where grid lines cross lie between the squares; every point touches 4 squares.
 * Each player has 30 soldiers; walls are unlimited and belong to nobody. A turn: roll the dice (up to 3 times, the last roll counts);
 * the roll marks ONE point (seen from the player's side) and the player plays from one of the 4 squares around it. One action per turn:
 *   land      new soldiers on the chosen square (empty or own base; never next to an enemy base, never in a province the enemy holds)
 *   withdraw  soldiers from the chosen square back to camp
 *   move      from a base of the chosen square's group, to a neighbouring square (an enemy base = attack)
 *   transport from a base inside a province you hold, in a straight line through it, to another square of it
 *   pass      only after the third roll
 *   wall      a chain of connected walls, each on a side of a square that holds a base of the same group of adjacent bases
 * Provinces: walls (and the edge of the board) cut the board into parts; every part except the biggest is a closed province.
 * A province belongs to the player who has soldiers in it and the other has none; with soldiers of both, or none, it is neutral.
 * Adjacent own bases are one group (they can act together) but are not a province by themselves.
 * Win: closed provinces you hold add up to at least 25 squares at the end of your turn.
 */
(function (root) {
  'use strict';
  const N = 7, CELLS = N * N, SOLDIERS = 30, WIN = 25, MAX_ROLLS = 3, ROLL_MAX = 6;
  const idx = (x, y) => y * N + x;
  const xy = (i) => [i % N, Math.floor(i / N)];
  const wkey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const clone = (s) => JSON.parse(JSON.stringify(s));

  function newGame() {
    return { size: N, cells: Array.from({ length: CELLS }, () => ({ o: null, n: 0 })), walls: {}, graveyard: [0, 0], turn: 0, rolls: 0, roll: null, winner: null, log: [] };
  }
  // squares next to i (orthogonal), not separated by a wall
  function neighbors(s, i) {
    const [x, y] = xy(i), out = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
      const j = idx(nx, ny);
      if (!s.walls[wkey(i, j)]) out.push(j);
    }
    return out;
  }
  const onBoard = (s, p) => s.cells.reduce((a, c) => a + (c.o === p ? c.n : 0), 0);
  const camp = (s, p) => SOLDIERS - onBoard(s, p) - s.graveyard[p];
  const wallCount = (s) => Object.keys(s.walls).length;

  // the parts the walls cut the board into: { id[] (part of every square), lists[], outside (the biggest part), owner[] (per part: 0, 1 or null) }
  function regions(s) {
    const id = new Array(CELLS).fill(-1), lists = [];
    for (let i = 0; i < CELLS; i++) {
      if (id[i] >= 0) continue;
      const k = lists.length, list = [i]; id[i] = k;
      for (let h = 0; h < list.length; h++) for (const j of neighbors(s, list[h])) if (id[j] < 0) { id[j] = k; list.push(j); }
      lists.push(list);
    }
    let outside = 0;
    lists.forEach((l, k) => { if (l.length > lists[outside].length) outside = k; });
    const owner = lists.map((l, k) => {
      if (k === outside) return null;
      let a = false, b = false;
      for (const i of l) { const o = s.cells[i].o; if (o === 0) a = true; else if (o === 1) b = true; }
      return a && !b ? 0 : b && !a ? 1 : null;
    });
    return { id, lists, outside, owner };
  }
  // owner of every square: the holder of the closed province it lies in, else nobody
  function owners(s) {
    const g = regions(s);
    return Array.from({ length: CELLS }, (_, i) => g.owner[g.id[i]]);
  }
  // squares in the closed provinces player p holds
  function territorySize(s, p) {
    const g = regions(s);
    return g.lists.reduce((a, l, k) => a + (g.owner[k] === p ? l.length : 0), 0);
  }
  // own bases that touch each other (not cut by a wall): the group containing base i
  function group(s, i) {
    const p = s.cells[i].o, seen = new Set([i]), list = [i];
    if (p === null) return [];
    for (let h = 0; h < list.length; h++) for (const j of neighbors(s, list[h])) if (s.cells[j].o === p && !seen.has(j)) { seen.add(j); list.push(j); }
    return list;
  }
  const enemyNext = (s, i, p) => neighbors(s, i).some((j) => s.cells[j].o === 1 - p);

  // the 4 squares around point (vx, vy), vx and vy in 1..6
  const vertexCells = (vx, vy) => [idx(vx - 1, vy - 1), idx(vx, vy - 1), idx(vx - 1, vy), idx(vx, vy)];

  // roll the dice (w and b in 1..6): the point is read from the side of the player to move
  function roll(s, w, b) {
    if (s.winner !== null) throw new Error('game over');
    if (s.rolls >= MAX_ROLLS) throw new Error('no rolls left');
    const ns = clone(s), vx = ns.turn === 0 ? w : ROLL_MAX + 1 - w, vy = ns.turn === 0 ? b : ROLL_MAX + 1 - b;
    ns.rolls++; ns.roll = { w, b, vx, vy, cells: vertexCells(vx, vy) };
    return ns;
  }

  // ---------- what the player may do from chosen square R ----------
  function canLand(s, R) {
    const p = s.turn, c = s.cells[R], g = regions(s);
    return camp(s, p) > 0 && (c.o === null || c.o === p) && !enemyNext(s, R, p) && g.owner[g.id[R]] !== 1 - p;
  }
  const canWithdraw = (s, R) => s.cells[R].o === s.turn;
  // bases that may move: the group of R (or of an own base next to R), and every base of a province you hold that contains R
  function sources(s, R) {
    const p = s.turn, g = regions(s), set = new Set();
    if (g.owner[g.id[R]] === p) for (const i of g.lists[g.id[R]]) if (s.cells[i].o === p) set.add(i);
    for (const i of [R, ...neighbors(s, R)]) if (s.cells[i].o === p) for (const j of group(s, i)) set.add(j);
    return [...set];
  }
  const moveTargets = (s, from) => neighbors(s, from);
  // straight lines through a province you hold: [{ to, steps }]
  function transportTargets(s, from) {
    const p = s.turn, g = regions(s), out = [], [fx, fy] = xy(from);
    if (g.owner[g.id[from]] !== p) return out;
    for (const [dx, dy] of DIRS) {
      let cx = fx, cy = fy, steps = 0;
      for (;;) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) break;
        const a = idx(cx, cy), b = idx(nx, ny);
        if (s.walls[wkey(a, b)]) break;
        steps++; out.push({ to: b, steps });
        cx = nx; cy = ny;
      }
    }
    return out;
  }

  // ---------- walls ----------
  function edgeOk(a, b) {
    if (a === b || a < 0 || b < 0 || a >= CELLS || b >= CELLS) return false;
    const [ax, ay] = xy(a), [bx, by] = xy(b);
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  }
  // the two end points of the wall between neighbouring squares a and b
  function edgeEnds(a, b) {
    const [ax, ay] = xy(a), [bx, by] = xy(b);
    return ax !== bx ? [[Math.max(ax, bx), ay], [Math.max(ax, bx), ay + 1]] : [[ax, Math.max(ay, by)], [ax + 1, Math.max(ay, by)]];
  }
  const touches = (e, f) => { const A = edgeEnds(e[0], e[1]), B = edgeEnds(f[0], f[1]); return A.some((u) => B.some((v) => u[0] === v[0] && u[1] === v[1])); };
  // walls that may be added next to the chain 'chosen' ([[a,b],...]) from chosen square R: the first on a side of R itself, the next ones on sides of squares holding a base of R's group and touching the chain
  function wallCandidates(s, R, chosen) {
    chosen = chosen || [];
    if (s.cells[R].o !== s.turn) return [];
    const have = new Set(chosen.map((e) => wkey(e[0], e[1]))), out = [];
    for (const i of chosen.length ? group(s, R) : [R]) {   // the first wall goes on the base you picked; the chain may then run along its group
      const [x, y] = xy(i);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
        const j = idx(nx, ny), k = wkey(i, j);
        if (s.walls[k] || have.has(k)) continue;
        if (chosen.length && !chosen.some((e) => touches(e, [i, j]))) continue;
        out.push({ a: i, b: j });
      }
    }
    return out;
  }
  const wallSides = (s, R) => wallCandidates(s, R, []);   // can the chosen square start a wall at all

  function endTurn(s) {
    const p = s.turn;
    s.roll = null; s.rolls = 0;
    if (territorySize(s, p) >= WIN) { s.winner = p; s.log.push(`${p === 0 ? 'Green' : 'Blue'} holds ${territorySize(s, p)} squares in closed provinces and wins!`); }
    else s.turn = 1 - p;
  }
  function pass(s) { const ns = clone(s); ns.log.push(`${ns.turn === 0 ? 'Green' : 'Blue'}: passed`); endTurn(ns); return ns; }

  // act: { type: land|withdraw|move|transport|wall|pass, R (chosen square), from, to, count, walls: [[a,b],...] }. Throws when illegal.
  function apply(s, act) {
    if (s.winner !== null) throw new Error('game over');
    if (act.type === 'pass') { if (!s.roll) throw new Error('roll first'); if (s.rolls < MAX_ROLLS) throw new Error('you can pass only after the third roll'); return pass(s); }
    if (!s.roll) throw new Error('roll first');
    if (!s.roll.cells.includes(act.R)) throw new Error('not a rolled square');
    const p = s.turn, q = 1 - p, ns = clone(s), cells = ns.cells, name = p === 0 ? 'Green' : 'Blue', count = act.count | 0;
    if (act.type === 'land') {
      if (!canLand(s, act.R)) throw new Error('cannot land there');
      if (count < 1 || count > camp(s, p)) throw new Error('bad count');
      cells[act.R].o = p; cells[act.R].n += count; ns.log.push(`${name}: landed ${count}`);
    } else if (act.type === 'withdraw') {
      if (!canWithdraw(s, act.R)) throw new Error('nothing to withdraw');
      if (count < 1 || count > cells[act.R].n) throw new Error('bad count');
      cells[act.R].n -= count; if (cells[act.R].n === 0) cells[act.R].o = null; ns.log.push(`${name}: withdrew ${count}`);
    } else if (act.type === 'move' || act.type === 'transport') {
      if (!sources(s, act.R).includes(act.from)) throw new Error('not a base of that group');
      const src = cells[act.from];
      if (count < 1 || count > src.n) throw new Error('bad count');
      const ok = act.type === 'move' ? moveTargets(s, act.from).includes(act.to) : transportTargets(s, act.from).some((t) => t.to === act.to);
      if (!ok) throw new Error('illegal target');
      const dst = cells[act.to];
      if (act.type === 'move' && dst.o === q) {   // attack: each attacker kills one defender; extra attackers stay; equal leaves the square empty
        const def = dst.n, killed = Math.min(count, def);
        src.n -= count; ns.graveyard[q] += killed;
        if (count > def) { dst.o = p; dst.n = count - def; } else if (count === def) { dst.o = null; dst.n = 0; } else dst.n = def - count;
        ns.log.push(`${name}: attacked with ${count}, ${killed} killed`);
      } else {
        src.n -= count; dst.o = p; dst.n += count; ns.log.push(`${name}: ${act.type === 'move' ? 'moved' : 'transported'} ${count}`);
      }
      if (src.n === 0) src.o = null;
    } else if (act.type === 'wall') {
      const list = act.walls || [];
      if (!list.length) throw new Error('no walls');
      if (s.cells[act.R].o !== p) throw new Error('a wall can only be built from a square with your own base');
      const chain = [];
      for (const e of list) {
        if (!edgeOk(e[0], e[1])) throw new Error('bad wall');
        if (!wallCandidates(s, act.R, chain).some((c) => wkey(c.a, c.b) === wkey(e[0], e[1]))) throw new Error('cannot put a wall there');
        chain.push(e);
      }
      for (const e of chain) ns.walls[wkey(e[0], e[1])] = 1;
      ns.log.push(`${name}: built ${chain.length} wall${chain.length > 1 ? 's' : ''}`);
    } else throw new Error('unknown action');
    endTurn(ns);
    return ns;
  }

  root.Rules7 = {
    N, CELLS, SOLDIERS, WIN, MAX_ROLLS, idx, xy, wkey, newGame, neighbors, onBoard, camp, wallCount, regions, owners, group, territorySize, vertexCells, roll,
    canLand, canWithdraw, sources, moveTargets, transportTargets, wallCandidates, wallSides, apply, pass, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Rules7;
})(typeof window !== 'undefined' ? window : globalThis);
