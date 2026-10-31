/* Province – the worked examples of the how-to-play booklet (manual.html). Every example is a small position on the 6x6 board plus one action,
 * and says whether the game allows it. tests/manual_check.js replays all of them on the real rules engine, so the booklet cannot contradict the game.
 * Coordinates are [x, y] = [column, row], 0..5, the board is drawn with row 0 at the top. g = Green's bases [x, y, soldiers], b = Blue's.
 * br = bridges [x1, y1, x2, y2, owner(0 green / 1 blue)], bl = bridges left [green, blue], lit = the lit square the action is played on.
 * act = { type, from, to, count }  (type: land | move | transport | withdraw | bridge; an attack is a 'move' onto an enemy square). */
(function (root) {
  'use strict';
  const S = [];
  const add = (o) => S.push(o);

  // ---------- LAND ----------
  add({ id: 'land-empty', topic: 'land', ok: true, title: 'An empty lit square', g: [[1, 4, 3]], lit: [3, 2], act: { type: 'land', to: [3, 2], count: 4 }, camp: 4,
        cap: 'The lit square is empty: land soldiers from your camp right on it. A new base appears.' });
  add({ id: 'land-own', topic: 'land', ok: true, title: 'Your own base', g: [[1, 4, 3]], lit: [1, 4], act: { type: 'land', to: [1, 4], count: 4 }, camp: 4,
        cap: 'The lit square is one of your bases: add soldiers from your camp to it.' });
  add({ id: 'land-contested', topic: 'land', ok: true, title: 'Next to an enemy base', g: [[2, 2, 2], [1, 4, 3]], b: [[2, 3, 2]], lit: [3, 3], act: { type: 'land', to: [3, 3], count: 3 }, camp: 3,
        cap: 'Both colours are in this province, so nobody controls it. Its empty squares are not enemy territory, and you may land here.' });
  add({ id: 'land-enemy-terr', topic: 'land', ok: false, title: 'Inside enemy territory', g: [[1, 4, 3]], b: [[2, 2, 2]], lit: [3, 3], act: { type: 'land', to: [3, 3], count: 3 },
        cap: 'Blue controls this province, so all of its squares are Blue territory, even the empty ones. No landing.' });
  add({ id: 'land-enemy-base', topic: 'land', ok: false, title: 'An enemy base', g: [[1, 4, 3]], b: [[3, 3, 2]], lit: [3, 3], act: { type: 'land', to: [3, 3], count: 3 },
        cap: 'You cannot land on top of enemy soldiers. Attack them instead (see Attack).' });
  add({ id: 'land-other-base', topic: 'land', ok: false, title: 'A different base of yours', g: [[1, 4, 3], [2, 4, 2], [1, 3, 2]], br: [[1, 4, 2, 4, 0], [1, 3, 1, 4, 0]], lit: [1, 4], act: { type: 'land', to: [2, 4], count: 2 },
        cap: 'Only the lit square gets new soldiers. The lit base (dashed ring) can be reinforced, but your other bases cannot, even though they are in the same territory.', focusLit: true });

  // ---------- MOVE ----------
  add({ id: 'move-next', topic: 'move', ok: true, title: 'To a square next to the base', g: [[1, 4, 5]], lit: [1, 4], act: { type: 'move', from: [1, 4], to: [0, 4], count: 3 },
        cap: 'Move any number of soldiers (1 to all of them) from a base to a square that shares a side with it.' });
  add({ id: 'move-any-base', topic: 'move', ok: true, title: 'From any base in your territory', g: [[1, 4, 4], [2, 4, 3]], br: [[1, 4, 2, 4, 0]], lit: [1, 4], act: { type: 'move', from: [2, 4], to: [3, 4], count: 2 },
        cap: 'The lit square is in your territory, so you may play from ANY base of that territory. Here the soldiers that move are not on the lit square.' });
  add({ id: 'move-adjacent-lit', topic: 'move', ok: true, title: 'Onto a lit square next to your base', g: [[2, 4, 4]], lit: [2, 3], act: { type: 'move', from: [2, 4], to: [2, 3], count: 2 },
        cap: 'The lit square is outside your territory but next to your base: move there from that base. Crossing the river builds your bridge.' });
  add({ id: 'move-far', topic: 'move', ok: false, title: 'A lit square far from your bases', g: [[1, 4, 4]], lit: [4, 1], act: { type: 'move', from: [1, 4], to: [4, 1], count: 2 },
        cap: 'The lit square is not in your territory and none of your bases touches it. You cannot move there.' });
  add({ id: 'move-diagonal', topic: 'move', ok: false, title: 'Diagonally', g: [[2, 4, 4]], lit: [3, 5], act: { type: 'move', from: [2, 4], to: [3, 5], count: 2 },
        cap: 'Squares touch only when they share a side: up, down, left or right. A diagonal does not count.' });
  add({ id: 'move-enemy-bridge', topic: 'move', ok: false, title: 'Across an enemy bridge', g: [[1, 4, 4]], br: [[1, 4, 2, 4, 1]], lit: [2, 4], act: { type: 'move', from: [1, 4], to: [2, 4], count: 2 },
        cap: 'A bridge belongs to whoever built it. You cannot cross Blue’s bridge (you can only replace it, see Build a bridge).' });
  add({ id: 'move-no-bridges', topic: 'move', ok: false, title: 'No bridges left', g: [[1, 4, 4]], bl: [0, 8], lit: [1, 3], act: { type: 'move', from: [1, 4], to: [1, 3], count: 2 },
        cap: 'Crossing a river with no bridge needs a new one. With none left in your supply you cannot cross.' });

  // ---------- ATTACK ----------
  add({ id: 'attack-ok', topic: 'attack', ok: true, title: 'A base next to yours', g: [[1, 4, 5]], b: [[0, 4, 3]], lit: [1, 4], act: { type: 'move', from: [1, 4], to: [0, 4], count: 5 },
        cap: '5 attackers against 3 defenders: 3 defenders die, 2 attackers stay on the square, 3 attackers are worn out and go back to your camp.' });
  add({ id: 'attack-river', topic: 'attack', ok: true, title: 'Across a river', g: [[2, 4, 5]], b: [[2, 3, 2]], lit: [2, 3], act: { type: 'move', from: [2, 4], to: [2, 3], count: 4 },
        cap: 'You can attack across a river. The attack builds your bridge, as part of the same move.' });
  add({ id: 'attack-far', topic: 'attack', ok: false, title: 'A base that is not next to yours', g: [[1, 4, 5]], b: [[3, 3, 2]], lit: [3, 3], act: { type: 'move', from: [1, 4], to: [3, 3], count: 5 },
        cap: 'You can only attack a square that touches the base you attack from.' });

  // ---------- WITHDRAW ----------
  add({ id: 'withdraw-ok', topic: 'withdraw', ok: true, title: 'From any base in your territory', g: [[1, 4, 4], [2, 4, 3]], br: [[1, 4, 2, 4, 0]], lit: [1, 4], act: { type: 'withdraw', from: [2, 4], count: 2 }, camp: 2,
        cap: 'The lit square is in your territory: take any number of soldiers off ANY of its bases and back to your camp.' });
  add({ id: 'withdraw-no', topic: 'withdraw', ok: false, title: 'A lit square outside your territory', g: [[1, 4, 4]], lit: [2, 3], act: { type: 'withdraw', from: [1, 4], count: 2 },
        cap: 'Withdrawing needs a lit square inside your territory. This one is outside, even though it touches your base.' });

  // ---------- TRANSPORT ----------
  add({ id: 'transport-base', topic: 'transport', ok: true, title: 'Along a straight line to a base', g: [[1, 4, 5], [3, 4, 2]], br: [[1, 4, 2, 4, 0]], lit: [1, 4], act: { type: 'transport', from: [1, 4], to: [3, 4], count: 4 },
        cap: 'In a straight line through your territory (here over your bridge), as far as you like, in one move.' });
  add({ id: 'transport-empty', topic: 'transport', ok: true, title: 'To an empty square of your province', g: [[1, 4, 5], [3, 4, 2]], br: [[1, 4, 2, 4, 0]], lit: [1, 4], act: { type: 'transport', from: [1, 4], to: [2, 4], count: 3 },
        cap: 'The empty squares of provinces you control are part of your territory. Transport can end on one of them, and a new base appears there.' });
  add({ id: 'transport-blocked', topic: 'transport', ok: false, title: 'Blocked by an enemy base', g: [[1, 4, 5], [3, 4, 2]], b: [[2, 4, 2]], br: [[1, 4, 2, 4, 0]], lit: [1, 4], act: { type: 'transport', from: [1, 4], to: [3, 4], count: 4 },
        cap: 'The line may only pass through your own territory. An enemy base stops it, so you cannot jump over it.' });
  add({ id: 'transport-river', topic: 'transport', ok: false, title: 'Over a river with no bridge of yours', g: [[1, 4, 5], [2, 4, 2]], lit: [1, 4], act: { type: 'transport', from: [1, 4], to: [2, 4], count: 3 },
        cap: 'A river can be crossed only on a bridge that you built. (A normal move would build one; transport does not.)' });
  add({ id: 'transport-bend', topic: 'transport', ok: false, title: 'Not in a straight line', g: [[1, 4, 5], [3, 5, 2]], br: [[1, 4, 2, 4, 0]], lit: [1, 4], act: { type: 'transport', from: [1, 4], to: [3, 5], count: 3 },
        cap: 'Only straight lines: along a row or along a column. No turns and no diagonals.' });

  // ---------- BRIDGE ----------
  add({ id: 'bridge-only', topic: 'bridge', ok: true, title: 'A bridge and nothing else', g: [[1, 4, 3]], lit: [1, 4], act: { type: 'bridge', from: [1, 4], to: [1, 3], count: 0 },
        cap: 'Build a bridge from your base across the river without moving any soldier.' });
  add({ id: 'bridge-move', topic: 'bridge', ok: true, title: 'Build the bridge and move over it', g: [[1, 4, 3]], lit: [1, 4], act: { type: 'move', from: [1, 4], to: [1, 3], count: 2 },
        cap: 'A bridge and a move are ONE move, not two. Crossing a river with soldiers builds the bridge as part of it.' });
  add({ id: 'bridge-replace', topic: 'bridge', ok: true, title: 'Replace an enemy bridge', g: [[1, 4, 3], [1, 3, 2]], br: [[1, 3, 1, 4, 1]], lit: [1, 4], act: { type: 'bridge', from: [1, 4], to: [1, 3], count: 0 },
        cap: 'Blue’s bridge is replaced by yours, because you hold the squares at both ends.' });
  add({ id: 'bridge-have', topic: 'bridge', ok: false, title: 'A bridge is already there', g: [[1, 4, 3]], br: [[1, 3, 1, 4, 0]], lit: [1, 4], act: { type: 'bridge', from: [1, 4], to: [1, 3], count: 0 },
        cap: 'There is already a bridge of yours between these squares.' });
  add({ id: 'bridge-one-end', topic: 'bridge', ok: false, title: 'An enemy bridge, only one end yours', g: [[1, 4, 3]], br: [[1, 3, 1, 4, 1]], lit: [1, 4], act: { type: 'bridge', from: [1, 4], to: [1, 3], count: 0 },
        cap: 'To replace an enemy bridge you need soldiers on both squares it connects.' });

  root.MANUAL_SCENARIOS = S;
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
