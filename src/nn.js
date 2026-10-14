/* Province – רשת נוירונים קטנה (MLP עם שתי שכבות נסתרות), ללא תלות חיצונית.
 * משמשת כפונקציית הערכה של המחשב (forward), ולאימון בדפדפן (init, train).
 *   x (קלט) -> relu(W1·x+b1) -> relu(W2·h1+b2) -> z = w3·h2+b3 ;  הסתברות ניצחון = sigmoid(z)
 */
(function (root) {
  'use strict';

  function rand(seed) {   // מחולל פסאודו-אקראי דטרמיניסטי (mulberry32)
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

  function init(nin, h1, h2, seed) {
    const r = rand(seed || 1);
    const mk = (n, scale) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = gauss(r) * scale; return a; };
    return { nin, h1, h2, W1: mk(h1 * nin, Math.sqrt(2 / nin)), b1: new Float32Array(h1), W2: mk(h2 * h1, Math.sqrt(2 / h1)), b2: new Float32Array(h2), w3: mk(h2, Math.sqrt(1 / h2)), b3: 0 };
  }

  // מחזיר z (לוגיט). cache (אופציונלי) שומר הפעלות לאימון.
  function forward(net, x, cache) {
    const { nin, h1, h2, W1, b1, W2, b2, w3 } = net;
    const a1 = cache ? cache.a1 : new Float32Array(h1), a2 = cache ? cache.a2 : new Float32Array(h2);
    for (let j = 0, o = 0; j < h1; j++, o += nin) {
      let z = b1[j];
      for (let i = 0; i < nin; i++) { const v = x[i]; if (v !== 0) z += W1[o + i] * v; }
      a1[j] = z > 0 ? z : 0;
    }
    for (let j = 0, o = 0; j < h2; j++, o += h1) {
      let z = b2[j];
      for (let i = 0; i < h1; i++) z += W2[o + i] * a1[i];
      a2[j] = z > 0 ? z : 0;
    }
    let z = net.b3;
    for (let j = 0; j < h2; j++) z += w3[j] * a2[j];
    return z;
  }

  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  /* אימון: X = Float32Array של N*nin, Y = Float32Array של N (תוויות 0..1). אופטימיזציה Adam, אצוות.
   * מחזיר { loss, acc } על קבוצת הבדיקה (אם ניתנה). */
  function train(net, X, Y, opts) {
    const o = Object.assign({ epochs: 10, batch: 256, lr: 1e-3, l2: 1e-5, valFrac: 0.1, onEpoch: null, seed: 7 }, opts || {});
    const nin = net.nin, h1 = net.h1, h2 = net.h2, N = Y.length, r = rand(o.seed);
    const idx = new Uint32Array(N); for (let i = 0; i < N; i++) idx[i] = i;
    // splitAt: מדדים [0, splitAt) לאימון והשאר לבדיקה, בלי ערבוב ביניהם (כדי שמצבים ממשחק אחד לא יהיו בשתי הקבוצות)
    const nTr = o.splitAt != null ? o.splitAt : N - Math.floor(N * o.valFrac), nVal = N - nTr;
    for (let i = nTr - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    const params = [net.W1, net.b1, net.W2, net.b2, net.w3];
    const m = params.map((p) => new Float32Array(p.length)), v = params.map((p) => new Float32Array(p.length));
    let m3 = 0, v3 = 0, step = 0;
    const g = params.map((p) => new Float32Array(p.length)); let g3 = 0;
    const cache = { a1: new Float32Array(h1), a2: new Float32Array(h2) };
    const d1 = new Float32Array(h1), d2 = new Float32Array(h2);
    const evalSet = (from, to) => {
      let loss = 0, acc = 0, n = 0; const xs = new Float32Array(nin);
      for (let k = from; k < to; k++) {
        const s = idx[k]; xs.set(X.subarray(s * nin, s * nin + nin));
        const p = sigmoid(forward(net, xs)), y = Y[s];
        loss -= y * Math.log(p + 1e-7) + (1 - y) * Math.log(1 - p + 1e-7); acc += (p > 0.5) === (y > 0.5) ? 1 : 0; n++;
      }
      return { loss: loss / Math.max(1, n), acc: acc / Math.max(1, n) };
    };
    const xs = new Float32Array(nin);
    let bestVal = Infinity, best = null;
    for (let ep = 1; ep <= o.epochs; ep++) {
      for (let i = nTr - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      for (let b0 = 0; b0 < nTr; b0 += o.batch) {
        const b1 = Math.min(nTr, b0 + o.batch), bs = b1 - b0;
        g.forEach((a) => a.fill(0)); g3 = 0;
        for (let k = b0; k < b1; k++) {
          const s = idx[k]; for (let i = 0; i < nin; i++) xs[i] = X[s * nin + i];
          const z = forward(net, xs, cache), dz = (sigmoid(z) - Y[s]) / bs;
          // שכבה 3
          g3 += dz;
          for (let j = 0; j < h2; j++) { g[4][j] += dz * cache.a2[j]; d2[j] = cache.a2[j] > 0 ? dz * net.w3[j] : 0; }
          // שכבה 2
          d1.fill(0);
          for (let j = 0, ob = 0; j < h2; j++, ob += h1) {
            const dj = d2[j]; if (dj === 0) continue;
            g[3][j] += dj;
            for (let i = 0; i < h1; i++) { g[2][ob + i] += dj * cache.a1[i]; d1[i] += dj * net.W2[ob + i]; }
          }
          // שכבה 1
          for (let j = 0, ob = 0; j < h1; j++, ob += nin) {
            if (cache.a1[j] <= 0) continue;
            const dj = d1[j]; if (dj === 0) continue;
            g[1][j] += dj;
            for (let i = 0; i < nin; i++) { const xv = xs[i]; if (xv !== 0) g[0][ob + i] += dj * xv; }
          }
        }
        step++;
        const b1c = 1 - Math.pow(0.9, step), b2c = 1 - Math.pow(0.999, step), lr = o.lr * Math.sqrt(b2c) / b1c;
        for (let pi = 0; pi < params.length; pi++) {
          const P = params[pi], G = g[pi], M = m[pi], V = v[pi];
          for (let i = 0; i < P.length; i++) {
            const gi = G[i] + o.l2 * P[i];
            M[i] = 0.9 * M[i] + 0.1 * gi; V[i] = 0.999 * V[i] + 0.001 * gi * gi;
            P[i] -= lr * M[i] / (Math.sqrt(V[i]) + 1e-8);
          }
        }
        m3 = 0.9 * m3 + 0.1 * g3; v3 = 0.999 * v3 + 0.001 * g3 * g3; net.b3 -= lr * m3 / (Math.sqrt(v3) + 1e-8);
      }
      const tr = evalSet(0, Math.min(nTr, 20000)), va = nVal ? evalSet(nTr, N) : null;
      if (o.onEpoch) o.onEpoch(ep, tr, va);
      if (va && va.loss < bestVal) { bestVal = va.loss; best = { ep, p: params.map((a) => a.slice()), b3: net.b3 }; }   // עצירה מוקדמת: שומרים את האפוק הטוב ביותר בבדיקה
    }
    if (best) { params.forEach((a, i) => a.set(best.p[i])); net.b3 = best.b3; if (o.onEpoch) o.onEpoch(-best.ep, null, null); }
    return nVal ? evalSet(nTr, N) : null;
  }

  const round = (a) => Array.from(a, (v) => +v.toFixed(5));
  const toJSON = (net) => ({ nin: net.nin, h1: net.h1, h2: net.h2, W1: round(net.W1), b1: round(net.b1), W2: round(net.W2), b2: round(net.b2), w3: round(net.w3), b3: +net.b3.toFixed(5) });
  const fromJSON = (j) => ({ nin: j.nin, h1: j.h1, h2: j.h2, W1: Float32Array.from(j.W1), b1: Float32Array.from(j.b1), W2: Float32Array.from(j.W2), b2: Float32Array.from(j.b2), w3: Float32Array.from(j.w3), b3: j.b3 });

  const NN = { init, forward, train, sigmoid, toJSON, fromJSON, rand };
  if (typeof module !== 'undefined' && module.exports) module.exports = NN;
  else root.NN = NN;
})(typeof window !== 'undefined' ? window : globalThis);
