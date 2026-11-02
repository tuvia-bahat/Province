/* Province – new-rules prototype ("squares"): engine. Works in the browser (window.Rules7) and in Node (module.exports).
 *
 * Board: 7x7 squares, no rivers. The 6x6 points where grid lines cross lie between the squares; every point touches 4 squares.
 * Each player has 30 soldiers and 10 walls. A turn: roll the dice (up to 3 times, the last roll counts); the roll marks ONE point
 * (seen from the player's side) and the player plays from one of the 4 squares around it. One move per turn:
 *   land      new soldiers on the chosen square (empty or own base, never in enemy territory)
 *   withdraw  soldiers from the chosen square back to camp
 *   move      from ANY base of the territory the chosen square belongs to, to a neighbouring square (an enemy base = attack)
 *   transport from any base of that territory, in a straight line through the territory, to another square of it
 *   pass      only after the third roll
 *   wall      a wall on one side of the chosen square (blocks both players and territory; the board must stay in one piece)
 * Territory: a base is its owner's. An empty square next to bases belongs to the player with MORE adjacent bases (tie = nobody's).
 * Walls cut adjacency. Win: a connected territory of at least 25 squares at the end of your turn.
 */
(function (root) {
  'use strict';
  const N = 7, CELLS = N * N, SOLDIERS = 30, WALLS = 10, WIN = 25, MAX_ROLLS = 3, ROLL_MAX = 6;
  const idx = (x, y) => y * N + x;
  const xy = (i) => [i % N, Math.floor(i / N)];
  const wkey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const clone = (s) => JSON.parse(JSON.stringify(s));

  function newGame() {
    return { size: N, cells: Array.from({ length: CELLS }, () => ({ o: null, n: 0 })), walls: {}, wallsLeft: [WALLS, WALLS], graveyard: [0, 0], turn: 0, rolls: 0, roll: null, winner: null, log: [] };
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

  // owner of every square: a base belongs to its owner; an empty square to the player with more adjacent bases (tie: nobody)
  function owners(s) {
    const out = new Array(CELLS).fill(null);
    for (let i = 0; i < CELLS; i++) {
      const c = s.cells[i];
      if (c.o !== null) { out[i] = c.o; continue; }
      let a = 0, b = 0;
      for (const j of neighbors(s, i)) { const o = s.cells[j].o; if (o === 0) a++; else if (o === 1) b++; }
      out[i] = a > b ? 0 : b > a ? 1 : null;
    }
    return out;
  }
  // connected pieces of player p's territory (adjacency not cut by walls): { id[], lists[] }
  function components(s, p, own) {
    own = own || owners(s);
    const id = new Array(CELLS).fill(-1), lists = [];
    for (let i = 0; i < CELLS; i++) {
      if (own[i] !== p || id[i] >= 0) continue;
      const k = lists.length, list = [i]; id[i] = k;
      for (let h = 0; h < list.length; h++) for (const j of neighbors(s, list[h])) if (own[j] === p && id[j] < 0) { id[j] = k; list.push(j); }
      lists.push(list);
    }
    return { id, lists };
  }
  const territorySize = (s, p) => components(s, p).lists.reduce((m, l) => Math.max(m, l.length), 0);

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
    const p = s.turn, c = s.cells[R];
    return camp(s, p) > 0 && (c.o === null || c.o === p) && owners(s)[R] !== 1 - p;
  }
  const canWithdraw = (s, R) => s.cells[R].o === s.turn;
  // bases that may move / transport: every base of the territory piece that contains R (R must be the player's territory)
  function sources(s, R) {
    const p = s.turn, own = owners(s);
    if (own[R] !== p) return [];
    const comp = components(s, p, own), list = comp.lists[comp.id[R]];
    return list.filter((i) => s.cells[i].o === p);
  }
  const moveTargets = (s, from) => neighbors(s, from);
  // straight lines through own territory: [{ to, steps }]
  function transportTargets(s, from) {
    const p = s.turn, own = owners(s), [fx, fy] = xy(from), out = [];
    for (const [dx, dy] of DIRS) {
      let cx = fx, cy = fy, steps = 0;
      for (;;) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) break;
        const a = idx(cx, cy), b = idx(nx, ny);
        if (s.walls[wkey(a, b)] || own[b] !== p) break;
        steps++; out.push({ to: b, steps });
        cx = nx; cy = ny;
      }
    }
    return out;
  }
  // can a wall go on the side between squares a and b?  (must stay in one piece)
  function wallOk(s, a, b) {
    if (s.wallsLeft[s.turn] <= 0) return false;
    if (a === b || a < 0 || b < 0 || a >= CELLS || b >= CELLS) return false;
    const [ax, ay] = xy(a), [bx, by] = xy(b);
    if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return false;
    if (s.walls[wkey(a, b)]) return false;
    const t = { walls: Object.assign({}, s.walls) }; t.walls[wkey(a, b)] = 1;
    const seen = new Array(CELLS).fill(false), st = [0]; seen[0] = true; let n = 1;
    while (st.length) { const i = st.pop(); for (const j of neighbors(t, i)) if (!seen[j]) { seen[j] = true; n++; st.push(j); } }
    return n === CELLS;
  }
  // the 4 sides of R where a wall could go: [{ a: R, b: neighbour }]
  function wallSides(s, R) {
    const [x, y] = xy(R), out = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
      const j = idx(nx, ny);
      if (wallOk(s, R, j)) out.push({ a: R, b: j });
    }
    return out;
  }

  function endTurn(s) {
    const p = s.turn;
    s.roll = null; s.rolls = 0;
    if (territorySize(s, p) >= WIN) { s.winner = p; s.log.push(`${p === 0 ? 'Green' : 'Blue'} controls ${territorySize(s, p)} connected squares and wins!`); }
    else s.turn = 1 - p;
  }
  function pass(s) { const ns = clone(s); ns.log.push(`${ns.turn === 0 ? 'Green' : 'Blue'}: passed`); endTurn(ns); return ns; }

  // act: { type: land|withdraw|move|transport|wall|pass, R (chosen square), from, to, count, a, b }. Throws when illegal.
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
      if (!sources(s, act.R).includes(act.from)) throw new Error('not a base of that territory');
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
      if (!(act.a === act.R || act.b === act.R)) throw new Error('a wall goes on a side of the chosen square');
      if (!wallOk(s, act.a, act.b)) throw new Error('cannot put a wall there');
      ns.walls[wkey(act.a, act.b)] = 1; ns.wallsLeft[p]--; ns.log.push(`${name}: built a wall`);
    } else throw new Error('unknown action');
    endTurn(ns);
    return ns;
  }

  root.Rules7 = {
    N, CELLS, SOLDIERS, WALLS, WIN, MAX_ROLLS, idx, xy, wkey, newGame, neighbors, onBoard, camp, owners, components, territorySize, vertexCells, roll,
    canLand, canWithdraw, sources, moveTargets, transportTargets, wallOk, wallSides, apply, pass, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Rules7;
})(typeof window !== 'undefined' ? window : globalThis);
