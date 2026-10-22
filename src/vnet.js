/* Province – יריב מחשב מבוסס רשת נוירונים (פונקציית הערכה נלמדת, ללא חיפוש).
 * הרשת מדרגת את המצב שמתקבל אחרי מהלך (הפלט: הסתברות הניצחון של מי ששיחק), והמחשב בוחר את המהלך הטוב ביותר
 * מבין כל המהלכים החוקיים עם כל כמות חיילים אפשרית. ההנדסה (קידוד המצב) זהה בדיוק לקידוד ב-tools/sim/Features.cs
 * שבו אומנה הרשת (tools/train/train.py). קובץ המשקלים: src/vnet6.bin (נוצר ע"י tools/train/export.py).
 */
(function (root) {
  'use strict';
  const PLANES = 12, SCALARS = 10;

  function build(R) {
    const S = R.SIZE, C = R.CELLS, NP = R.NPROV, F = PLANES * C + SCALARS;
    const SDIV = S === 6 ? [36, 36, 36, 36, 8, 8, 9, 9, 5, 5] : [54, 54, 54, 54, 14, 14, 16, 16, 8, 8];
    const NEI9 = [];   // for every cell: valid 3x3 neighbours (cell index, kernel slot)
    for (let p = 0; p < C; p++) {
      const y = Math.floor(p / S), x = p % S, l = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy, nx = x + dx;
        if (ny >= 0 && ny < S && nx >= 0 && nx < S) l.push([ny * S + nx, (dy + 1) * 3 + (dx + 1)]);
      }
      NEI9.push(l);
    }
    const firstCell = (k) => R.idx((k % R.PR) * 2, Math.floor(k / R.PR) * 2);
    const FIRST = Array.from({ length: NP }, (_, k) => firstCell(k));
    let NET = null;

    // ---------- קידוד המצב (זהה ל-Features.Encode ב-C#) ----------
    function bestComp(comp, ctl, p) {
      let best = -1, bn = 0; const cnt = new Map();
      for (let k = 0; k < NP; k++) {
        if (ctl[k] !== p) continue;
        const id = comp.id[FIRST[k]]; if (id < 0) continue;
        const v = (cnt.get(id) || 0) + 1; cnt.set(id, v);
        if (v > bn) { bn = v; best = id; }
      }
      return best;
    }
    function encode(ns, m, dst) {
      dst.fill(0);
      const o = 1 - m, ctl = R.provinceControl(ns);
      const cm = R.components(ns, m), co = R.components(ns, o);
      const bm = bestComp(cm, ctl, m), bo = bestComp(co, ctl, o);
      let heldM = 0, heldO = 0, connM = 0, connO = 0;
      for (let k = 0; k < NP; k++) {
        if (ctl[k] === m) { heldM++; if (bm >= 0 && cm.id[FIRST[k]] === bm) connM++; }
        else if (ctl[k] === o) { heldO++; if (bo >= 0 && co.id[FIRST[k]] === bo) connO++; }
      }
      for (let i = 0; i < C; i++) {
        const c = ns.cells[i];
        if (c.o === m) dst[i] = c.n; else if (c.o === o) dst[C + i] = c.n;
        const pr = R.provinceOf(i), k = ctl[pr];
        if (k === m) { dst[2 * C + i] = 1; if (bm >= 0 && cm.id[FIRST[pr]] === bm) dst[4 * C + i] = 1; }
        else if (k === o) { dst[3 * C + i] = 1; if (bo >= 0 && co.id[FIRST[pr]] === bo) dst[5 * C + i] = 1; }
        const x = i % S, y = Math.floor(i / S);
        if (x < S - 1 && R.provinceOf(i) !== R.provinceOf(i + 1)) dst[10 * C + i] = 1;
        if (y < S - 1 && R.provinceOf(i) !== R.provinceOf(i + S)) dst[11 * C + i] = 1;
      }
      for (const key in ns.bridges) {
        const ab = key.split('-'), a = +ab[0], b = +ab[1], east = b === a + 1, ow = ns.bridges[key];
        if (ow === m) dst[(east ? 6 : 7) * C + a] = 1; else if (ow === o) dst[(east ? 8 : 9) * C + a] = 1;
      }
      const so = PLANES * C;
      dst[so] = R.camp(ns, m); dst[so + 1] = R.camp(ns, o);
      dst[so + 2] = ns.graveyard[m]; dst[so + 3] = ns.graveyard[o];
      dst[so + 4] = ns.bridgesLeft[m]; dst[so + 5] = ns.bridgesLeft[o];
      dst[so + 6] = heldM; dst[so + 7] = heldO; dst[so + 8] = connM; dst[so + 9] = connO;
    }

    // ---------- הרשת ----------
    function setNet(buf) {   // ArrayBuffer מ-export.py
      const hdr = new Int32Array(buf, 0, 4); const [size, ch, blocks, fc] = hdr;
      if (size !== S) throw new Error('net is for board ' + size);
      let off = 16; const f32 = (n) => { const a = new Float32Array(buf, off, n); off += n * 4; return a; };
      const net = { ch, blocks, fc, res: [] };
      net.stemW = f32(9 * PLANES * ch); net.stemB = f32(ch);
      for (let i = 0; i < blocks; i++) net.res.push({ w1: f32(9 * ch * ch), b1: f32(ch), w2: f32(9 * ch * ch), b2: f32(ch) });
      net.fc1W = f32(C * ch * fc); net.fc1B = f32(fc);
      net.scW = f32(SCALARS * 32); net.scB = f32(32);
      net.fc2W = f32((fc + 32) * 128); net.fc2B = f32(128);
      net.outW = f32(128); net.outB = f32(1);
      net.t = { x: new Float32Array(C * PLANES), a: new Float32Array(C * ch), b: new Float32Array(C * ch), c: new Float32Array(C * ch), h: new Float32Array(fc), z: new Float32Array(128), s: new Float32Array(32) };
      NET = net;
    }
    function conv(inp, inC, w, b, outC, out) {
      for (let p = 0; p < C; p++) {
        const ob = p * outC;
        for (let oc = 0; oc < outC; oc++) out[ob + oc] = b[oc];
        const nb = NEI9[p];
        for (let j = 0; j < nb.length; j++) {
          const q = nb[j][0] * inC, wb = nb[j][1] * inC * outC;
          for (let ic = 0; ic < inC; ic++) {
            const v = inp[q + ic]; if (v === 0) continue;
            const row = wb + ic * outC;
            for (let oc = 0; oc < outC; oc++) out[ob + oc] += v * w[row + oc];
          }
        }
      }
    }
    function forward(feat) {   // feat: Uint8Array(F) -> logit
      const n = NET, t = n.t, ch = n.ch;
      for (let p = 0; p < C; p++) for (let k = 0; k < PLANES; k++) { const v = feat[k * C + p]; t.x[p * PLANES + k] = k < 2 ? v / 10 : v; }
      conv(t.x, PLANES, n.stemW, n.stemB, ch, t.a);
      for (let i = 0; i < t.a.length; i++) if (t.a[i] < 0) t.a[i] = 0;
      for (const r of n.res) {
        conv(t.a, ch, r.w1, r.b1, ch, t.b);
        for (let i = 0; i < t.b.length; i++) if (t.b[i] < 0) t.b[i] = 0;
        conv(t.b, ch, r.w2, r.b2, ch, t.c);
        for (let i = 0; i < t.a.length; i++) { const v = t.a[i] + t.c[i]; t.a[i] = v > 0 ? v : 0; }
      }
      const fc = n.fc, h = t.h;
      for (let j = 0; j < fc; j++) h[j] = n.fc1B[j];
      for (let i = 0; i < t.a.length; i++) {   // flatten order: position-major, matching export
        const v = t.a[i]; if (v === 0) continue;
        const row = i * fc;
        for (let j = 0; j < fc; j++) h[j] += v * n.fc1W[row + j];
      }
      for (let j = 0; j < fc; j++) if (h[j] < 0) h[j] = 0;
      const s = t.s; for (let j = 0; j < 32; j++) s[j] = n.scB[j];
      for (let i = 0; i < SCALARS; i++) { const v = feat[PLANES * C + i] / SDIV[i]; if (v === 0) continue; for (let j = 0; j < 32; j++) s[j] += v * n.scW[i * 32 + j]; }
      for (let j = 0; j < 32; j++) if (s[j] < 0) s[j] = 0;
      const z = t.z; for (let j = 0; j < 128; j++) z[j] = n.fc2B[j];
      for (let i = 0; i < fc; i++) { const v = h[i]; if (v === 0) continue; const row = i * 128; for (let j = 0; j < 128; j++) z[j] += v * n.fc2W[row + j]; }
      for (let i = 0; i < 32; i++) { const v = s[i]; if (v === 0) continue; const row = (fc + i) * 128; for (let j = 0; j < 128; j++) z[j] += v * n.fc2W[row + j]; }
      let out = n.outB[0];
      for (let j = 0; j < 128; j++) if (z[j] > 0) out += z[j] * n.outW[j];
      return out;
    }

    // ---------- מהלכים: כל מהלך חוקי עם כל כמות חיילים (זהה ל-Features.Candidates) ----------
    function candidates(s) {
      const p = s.turn, out = [], seen = new Set(), camp = R.camp(s, p);
      const add = (a) => { const k = a.type + ':' + (a.from === undefined ? -1 : a.from) + ':' + (a.to === undefined ? -1 : a.to) + ':' + a.count; if (seen.has(k)) return; seen.add(k); out.push(a); };
      for (const Rc of s.roll.cells) {
        if (camp > 0 && R.landTargets(s, Rc).length > 0) for (let c = 1; c <= camp; c++) add({ type: 'land', R: Rc, to: Rc, count: c });
        for (const t of ['move', 'transport', 'withdraw', 'bridge']) {
          for (const f of R.sources(s, t, Rc)) {
            const n = s.cells[f].n;
            if (t === 'withdraw') { for (let c = 1; c <= n; c++) add({ type: t, R: Rc, from: f, to: f, count: c }); continue; }
            for (const x of R.targets(s, t, Rc, f)) {
              if (t === 'bridge') add({ type: t, R: Rc, from: f, to: x.to, count: 0 });
              else for (let c = 1; c <= n; c++) add({ type: t, R: Rc, from: f, to: x.to, count: c });
            }
          }
        }
      }
      out.push({ type: 'pass' });
      return out;
    }

    // מדלל כמויות חיילים כשיש יותר מדי מהלכים להערכה (למכשירים איטיים): בכל קבוצה (סוג, מקור, יעד) נשארים 1, המקסימום וכל כמות שמתחלקת ב-stride
    function thin(list, maxEvals) {
      if (!maxEvals || list.length <= maxEvals) return list;
      const stride = Math.ceil(list.length / maxEvals), out = [];
      let i = 0;
      while (i < list.length) {
        let j = i; const a = list[i];
        while (j + 1 < list.length && list[j + 1].type === a.type && list[j + 1].from === a.from && list[j + 1].to === a.to && list[j + 1].type !== 'pass') j++;
        for (let k = i; k <= j; k++) { const c = list[k].count; if (k === i || k === j || c % stride === 0) out.push(list[k]); }
        i = j + 1;
      }
      return out;
    }

    // בוחר פעולה (פורמט Rules.apply) או { type: 'pass' }. opts.temp>0: בחירה אקראית משוקללת (לגיוון); opts.scores: מחזיר גם את הדירוג
    function chooseAction(s, opts) {
      opts = opts || {};
      const p = s.turn, list = thin(candidates(s), opts.maxEvals), feat = new Uint8Array(F);
      lastEvals = list.length;
      let best = null, bs = -Infinity; const scored = [];
      for (const a of list) {
        const ns = a.type === 'pass' ? R.passFast(s) : R.apply(s, a, true);
        if (ns.winner === p) return a;
        encode(ns, p, feat);
        const v = forward(feat) + (opts.noise ? Math.random() * opts.noise : 0);
        scored.push({ a, v });
        if (v > bs) { bs = v; best = a; }
      }
      if (opts.temp > 0) {
        const mx = bs; let tot = 0; const w = scored.map((x) => { const e = Math.exp((x.v - mx) / opts.temp); tot += e; return e; });
        let r = Math.random() * tot; for (let i = 0; i < scored.length; i++) { r -= w[i]; if (r <= 0) return scored[i].a; }
      }
      if (opts.scores) opts.scores.push(...scored);
      return best;
    }
    // חיפוש בעומק 2 בעזרת הרשת: לכל אחד מ-K המהלכים הטובים ביותר (לפי הרשת) ממוצע, על מדגם הטלות של היריב, של התגובה הכי טובה שלו.
    // opts: { K, rolls }. מחזיר פעולה (פורמט Rules.apply). איטי בהרבה מ-chooseAction, אבל חזק יותר.
    const sig = (z) => 1 / (1 + Math.exp(-z));
    function chooseSearch(s, opts) {
      opts = opts || {};
      const K = opts.K || 4, NR = opts.rolls || 4, p = s.turn, q = 1 - p, list = candidates(s), feat = new Uint8Array(F);
      const scored = [];
      for (const a of list) {
        const ns = a.type === 'pass' ? R.passFast(s) : R.apply(s, a, true);
        if (ns.winner === p) return a;
        encode(ns, p, feat);
        scored.push({ a, ns, v: forward(feat) });
      }
      scored.sort((x, y) => y.v - x.v);
      const top = scored.slice(0, K);
      // מדגם הטלות קבוע לכל המהלכים (השוואה הוגנת)
      const rolls = []; const used = new Set();
      while (rolls.length < NR) { const w = 1 + Math.floor(Math.random() * S), b = 1 + Math.floor(Math.random() * S), k = w * 10 + b; if (used.has(k)) continue; used.add(k); rolls.push([w, b]); }
      let best = null, bs = -Infinity;
      for (const c of top) {
        let tot = 0;
        for (const [w, b] of rolls) {
          const s2 = R.roll(c.ns, w, b), opp = candidates(s2);
          let mx = -Infinity, oppWins = false;
          for (const a2 of opp) {
            const n2 = a2.type === 'pass' ? R.passFast(s2) : R.apply(s2, a2, true);
            if (n2.winner === q) { oppWins = true; break; }
            encode(n2, q, feat); const v = forward(feat); if (v > mx) mx = v;
          }
          tot += oppWins ? 0 : 1 - sig(mx);
        }
        const val = tot / rolls.length;
        if (val > bs) { bs = val; best = c.a; }
      }
      return best;
    }
    let lastEvals = 0;
    return { F, encode, forward, candidates, chooseAction, chooseSearch, setNet, get lastEvals() { return lastEvals; }, get loaded() { return !!NET; } };
  }

  const cache = {};
  const V = { forSize: (n) => cache[n] || (cache[n] = build(root.Rules.forSize(n))), make: (n) => build(root.Rules.forSize(n)) };
  if (typeof module !== 'undefined' && module.exports) module.exports = V; else root.VNet = V;
})(typeof window !== 'undefined' ? window : globalThis);
