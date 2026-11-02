/* Province – new-rules prototype ("squares", second game): engine. Works in the browser (window.Rules7) and in Node (module.exports).
 *
 * Board: 6x6 squares, no rivers, no attacks. 30 soldiers each; walls are unlimited and belong to nobody.
 * A turn: roll the dice once; they mark two opposite squares (as in the original game). One action per turn:
 *   land      new soldiers on a rolled square (empty or your base; not in enemy territory)
 *   withdraw  soldiers from a rolled square back to camp
 *   move      from a base the roll gives you freedom to, to a neighbouring square (never onto an enemy base or into enemy territory)
 *   transport from a base inside your territory, in a straight line through it, to another square of it
 *   wall      one wall on a side of a base the roll gives you freedom to
 *   pass
 * A roll gives freedom to the bases standing on or next to a rolled square, and to every base in their chain (touching bases);
 * and, when a rolled square is in your territory, to all your bases in that territory.
 * Territory: a wall that closes part of the board makes the closed part (the smaller side of the cut, never the biggest part) the territory
 * of whoever closed it; enemy soldiers inside are out of the game. Territory never changes hands.
 * Win: your territories add up to at least 19 squares (a majority of the board) at the end of your turn.
 */
(function (root) {
  'use strict';
  const N = 6, CELLS = N * N, SOLDIERS = 30, WIN = Math.floor(CELLS / 2) + 1, MAX_ROLLS = 1;   // 6x6; a majority of the board (19 squares) wins
  const idx = (x, y) => y * N + x;
  const xy = (i) => [i % N, Math.floor(i / N)];
  const wkey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const clone = (s) => JSON.parse(JSON.stringify(s));

  function newGame() {
    return { size: N, cells: Array.from({ length: CELLS }, () => ({ o: null, n: 0 })), walls: {}, own: new Array(CELLS).fill(null), graveyard: [0, 0], turn: 0, rolls: 0, roll: null, winner: null, log: [] };
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

  // the parts the walls cut the board into: { id[], lists[], outside[] (true for the biggest part; for each part of a tie) }
  function regions(s) {
    const id = new Array(CELLS).fill(-1), lists = [];
    for (let i = 0; i < CELLS; i++) {
      if (id[i] >= 0) continue;
      const k = lists.length, list = [i]; id[i] = k;
      for (let h = 0; h < list.length; h++) for (const j of neighbors(s, list[h])) if (id[j] < 0) { id[j] = k; list.push(j); }
      lists.push(list);
    }
    const big = lists.reduce((m, l) => Math.max(m, l.length), 0);
    return { id, lists, outside: lists.map((l) => l.length === big) };
  }
  // owner of every square (territory is permanent once closed)
  const owners = (s) => s.own;
  const territorySize = (s, p) => s.own.reduce((a, o) => a + (o === p ? 1 : 0), 0);
  // own bases that touch each other (not cut by a wall): the group containing base i
  function group(s, i) {
    const p = s.cells[i].o, seen = new Set([i]), list = [i];
    if (p === null) return [];
    for (let h = 0; h < list.length; h++) for (const j of neighbors(s, list[h])) if (s.cells[j].o === p && !seen.has(j)) { seen.add(j); list.push(j); }
    return list;
  }
  
  // roll the dice (w and b in 1..6): like the original game, they mark two opposite squares; the player plays from either of them
  function roll(s, w, b) {
    if (s.winner !== null) throw new Error('game over');
    if (s.rolls >= MAX_ROLLS) throw new Error('no rolls left');
    const ns = clone(s);
    ns.rolls++; ns.roll = { w, b, cells: [idx(w - 1, b - 1), idx(N - w, N - b)] };
    return ns;
  }

  // ---------- what the player may do ----------
  const canLand = (s, R) => camp(s, s.turn) > 0 && (s.cells[R].o === null || s.cells[R].o === s.turn) && s.own[R] !== 1 - s.turn;
  const canWithdraw = (s, R) => s.cells[R].o === s.turn;
  // bases a rolled square gives freedom to: the chain of bases standing on or next to it, and all your bases in your territory that contains it
  function sources(s, R) {
    const p = s.turn, g = regions(s), set = new Set();
    if (s.own[R] === p) for (const i of g.lists[g.id[R]]) if (s.cells[i].o === p && s.own[i] === p) set.add(i);
    for (const i of [R, ...neighbors(s, R)]) if (s.cells[i].o === p) for (const j of group(s, i)) set.add(j);
    return [...set];
  }
  // a move may go to a neighbour that holds no enemy base and is not enemy territory
  const moveTargets = (s, from) => neighbors(s, from).filter((j) => s.cells[j].o !== 1 - s.turn && s.own[j] !== 1 - s.turn);
  // straight lines through your territory: [{ to, steps }]
  function transportTargets(s, from) {
    const p = s.turn, out = [], [fx, fy] = xy(from);
    if (s.own[from] !== p) return out;
    for (const [dx, dy] of DIRS) {
      let cx = fx, cy = fy, steps = 0;
      for (;;) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) break;
        const a = idx(cx, cy), b = idx(nx, ny);
        if (s.walls[wkey(a, b)] || s.own[b] !== p || s.cells[b].o === 1 - p) break;
        steps++; out.push({ to: b, steps });
        cx = nx; cy = ny;
      }
    }
    return out;
  }
  const authorized = (s, i) => !!s.roll && s.roll.cells.some((rc) => sources(s, rc).includes(i));
  // where the base 'from' may go this turn: [{ to, type: move|transport, R }]
  function options(s, from) {
    const out = new Map();
    if (!s.roll || s.cells[from].o !== s.turn) return [];
    for (const rc of s.roll.cells) {
      if (!sources(s, rc).includes(from)) continue;
      for (const j of moveTargets(s, from)) if (!out.has(j)) out.set(j, { to: j, type: 'move', R: rc });
      for (const tr of transportTargets(s, from)) if (!out.has(tr.to)) out.set(tr.to, { to: tr.to, type: 'transport', R: rc });
    }
    return [...out.values()];
  }

  // ---------- walls ----------
  function edgeOk(a, b) {
    if (a === b || a < 0 || b < 0 || a >= CELLS || b >= CELLS) return false;
    const [ax, ay] = xy(a), [bx, by] = xy(b);
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  }
  // the walls that can be built from base 'at': on any of its sides (it must be a base this roll gives you freedom to); one wall per turn
  function wallCandidates(s, at) {
    if (s.cells[at].o !== s.turn || !authorized(s, at)) return [];
    const [x, y] = xy(at), out = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
      const j = idx(nx, ny);
      if (!s.walls[wkey(at, j)]) out.push({ a: at, b: j });
    }
    return out;
  }
  const wallSides = wallCandidates;

  function endTurn(s) {
    const p = s.turn;
    s.roll = null; s.rolls = 0;
    if (territorySize(s, p) >= WIN) { s.winner = p; s.log.push(`${p === 0 ? 'Green' : 'Blue'} has ${territorySize(s, p)} squares of territory and wins!`); }
    else s.turn = 1 - p;
  }
  function pass(s) { const ns = clone(s); ns.log.push(`${ns.turn === 0 ? 'Green' : 'Blue'}: passed`); endTurn(ns); return ns; }

  // act: { type: land|withdraw|move|transport|wall|pass, R (chosen square), from, to, count, walls: [[a,b],...] }. Throws when illegal.
  function apply(s, act) {
    if (s.winner !== null) throw new Error('game over');
    if (act.type === 'pass') { if (!s.roll) throw new Error('roll first'); if (s.rolls < MAX_ROLLS) throw new Error('you can pass only after the last roll'); return pass(s); }
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
      const src = cells[act.from];
      if (s.cells[act.from].o !== p || count < 1 || count > src.n) throw new Error('bad count');
      if (!options(s, act.from).some((o) => o.to === act.to && o.type === act.type)) throw new Error('illegal target');
      const dst = cells[act.to];
      src.n -= count; dst.o = p; dst.n += count; ns.log.push(`${name}: ${act.type === 'move' ? 'moved' : 'transported'} ${count}`);
      if (src.n === 0) src.o = null;
    } else if (act.type === 'wall') {
      const e = act.walls && act.walls[0], at = act.at === undefined ? act.R : act.at;
      if (!e || act.walls.length !== 1) throw new Error('one wall per turn');
      if (!edgeOk(e[0], e[1]) || !wallCandidates(s, at).some((c) => wkey(c.a, c.b) === wkey(e[0], e[1]))) throw new Error('cannot put a wall there');
      ns.walls[wkey(e[0], e[1])] = 1;
      const g = regions(ns); let closed = 0, out = 0;   // every closed part (never the biggest) that nobody owns yet becomes the territory of the one who closed it
      g.lists.forEach((l, k) => {
        if (g.outside[k]) return;
        for (const i of l) {
          if (ns.own[i] !== null) continue;
          ns.own[i] = p; closed++;
          if (cells[i].o === q) { out += cells[i].n; ns.graveyard[q] += cells[i].n; cells[i].o = null; cells[i].n = 0; }
        }
      });
      ns.log.push(`${name}: built a wall` + (closed ? `, closed ${closed} square${closed > 1 ? 's' : ''}` : '') + (out ? `, ${out} enemy soldier${out > 1 ? 's' : ''} out` : ''));
    } else throw new Error('unknown action');
    endTurn(ns);
    return ns;
  }

  root.Rules7 = {
    N, CELLS, SOLDIERS, WIN, MAX_ROLLS, idx, xy, wkey, newGame, neighbors, onBoard, camp, wallCount, regions, owners, group, territorySize, roll,
    canLand, canWithdraw, sources, moveTargets, transportTargets, options, authorized, wallCandidates, wallSides, apply, pass, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Rules7;
})(typeof window !== 'undefined' ? window : globalThis);
