/* Province – computer player for the new-rules prototype (rules7.js). Works in the browser (window.AI7) and in Node (module.exports).
 * It scores the position after each candidate action with a small neural net (afterstate value) and plays the best one.
 * The same code is used by the trainer (tools/train7/train.js). Weights: window.NET7 (src/net7.js). */
(function (root) {
  'use strict';
  const R = root.Rules7 || require('./rules7.js');
  const C = R.CELLS, NIN = 4 * C + 6, HID = 64, HA = 3;   // inputs: 4 planes + 6 numbers; hidden units; weight of the hand-made territory term

  function newNet(rng) {
    const net = { w1: new Float32Array(NIN * HID), b1: new Float32Array(HID), w2: new Float32Array(HID), b2: 0 };
    for (let i = 0; i < net.w1.length; i++) net.w1[i] = (rng() - 0.5) * 0.2;
    for (let i = 0; i < HID; i++) net.w2[i] = (rng() - 0.5) * 0.2;
    return net;
  }
  // the position seen by player p: planes of my bases, enemy bases, my territory, enemy territory, and a few numbers
  function features(s, p, x) {
    x.fill(0);
    const q = 1 - p;
    for (let i = 0; i < C; i++) {
      const c = s.cells[i];
      if (c.o === p) x[i] = c.n / 8; else if (c.o === q) x[C + i] = c.n / 8;
      if (s.own[i] === p) x[2 * C + i] = 1; else if (s.own[i] === q) x[3 * C + i] = 1;
    }
    const tm = R.territorySize(s, p), to = R.territorySize(s, q);
    x[4 * C] = R.camp(s, p) / R.SOLDIERS; x[4 * C + 1] = R.camp(s, q) / R.SOLDIERS;
    x[4 * C + 2] = s.graveyard[p] / R.SOLDIERS; x[4 * C + 3] = s.graveyard[q] / R.SOLDIERS;
    x[4 * C + 4] = tm / R.WIN; x[4 * C + 5] = to / R.WIN;
    let bm = 0, bo = 0;
    for (let i = 0; i < C; i++) { if (s.cells[i].o === p) bm++; else if (s.cells[i].o === q) bo++; }
    return (tm - to) / R.WIN + 0.012 * (bm - bo);   // the hand-made term: territory and spread of bases
  }
  // value for p (0..1); h receives the hidden layer for training
  function forward(net, x, g, h) {
    let a = net.b2 + HA * g;
    for (let j = 0; j < HID; j++) {
      let z = net.b1[j];
      for (let i = 0; i < NIN; i++) { const v = x[i]; if (v !== 0) z += v * net.w1[i * HID + j]; }
      const t = Math.tanh(z); if (h) h[j] = t;
      a += net.w2[j] * t;
    }
    return 1 / (1 + Math.exp(-a));
  }
  // soldiers only matter as base holders (no attacks): landing is 1-3 at a time, other actions move one, half or all
  const counts = (n, landing) => {
    const set = landing ? new Set([1, 2, 3]) : new Set([1, n]);
    if (!landing && n > 4) set.add(Math.ceil(n / 2));
    return [...set].filter((c) => c >= 1 && c <= n);
  };
  // candidate actions for the player to move (s has the roll)
  function actions(s) {
    const p = s.turn, out = [{ type: 'pass' }], seen = new Set(), camp = R.camp(s, p);
    for (const rc of s.roll.cells) {
      if (camp > 0 && R.canLand(s, rc)) for (const n of counts(camp, true)) out.push({ type: 'land', R: rc, count: n });
      for (const i of R.sources(s, rc)) {
        if (seen.has(i)) continue; seen.add(i);
        const n = s.cells[i].n;
        for (const c of counts(n)) out.push({ type: 'withdraw', R: rc, from: i, count: c });
        for (const o of R.optionsRaw(s, i)) for (const c of counts(n)) out.push({ type: o.type, R: o.R, from: i, to: o.to, count: c });
      }
    }
    return out;
  }
  // value of the position after act for the player who moves; null when the action is illegal
  const xbuf = new Float32Array(NIN);
  function afterstate(s, act, net) {
    const p = s.turn;
    let ns;
    try { ns = R.apply(s, act); } catch (e) { return null; }
    if (ns.winner !== null) return { ns, v: ns.winner === p ? 1 : 0, terminal: true };
    const g = features(ns, p, xbuf);
    return { ns, v: forward(net, xbuf, g), terminal: false };
  }
  // pick an action: the best afterstate, or a random legal one with probability eps
  function choose(s, net, eps, rng) {
    const acts = actions(s);
    if (eps > 0 && rng() < eps) {
      for (let k = 0; k < 30; k++) { const a = acts[Math.floor(rng() * acts.length)]; if (a.type === 'pass' && acts.length > 1 && rng() < 0.7) continue; try { return { act: a, ns: R.apply(s, a) }; } catch (e) { /* illegal */ } }
    }
    let best = null;
    for (const a of acts) {
      const r = afterstate(s, a, net); if (!r) continue;
      const v = r.v + rng() * 1e-4;
      if (!best || v > best.v) best = { act: a, ns: r.ns, v };
    }
    return best || { act: { type: 'pass' }, ns: R.apply(s, { type: 'pass' }), v: 0 };
  }

  root.AI7 = { NIN, HID, HA, newNet, features, forward, actions, afterstate, choose };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.AI7;
})(typeof window !== 'undefined' ? window : globalThis);
