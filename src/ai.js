/* Province – יריב מחשב.
 *
 * שיטה: מחולל מהלכים + פונקציית הערכה + חיפוש expectimax בעומק 2:
 *   1. מייצרים את כל המהלכים החוקיים בשתי המשבצות שהוטלו (עם מספרי חיילים מייצגים), כולל דילוג.
 *   2. מדרגים אותם לפי פונקציית הערכה, ושומרים את הטובים ביותר.
 *   3. לכל אחד מהם עוברים על 18 הטלות הקוביות האפשריות של היריב (כל הטלה = זוג משבצות נגדיות),
 *      מניחים שהיריב יבחר את התגובה הכי טובה לו, ומחשבים את ממוצע ההערכה.
 * רמות: 'easy' – מהלך חמדן עם רעש; 'strong' – החיפוש המלא.
 * המשקלים כוונו בטורנירי משחק מול עצמו (משקל גבוה לחיילים חיים ניצח 18:5 את המשקל הקודם).
 */
(function (root) {
  'use strict';
  const R = root.Rules || require('./rules.js');
  const WIN = 3000;                       // שווי ניצחון/הפסד (ביחידות של פונקציית ההערכה)
  const H = [0, 100, 210, 340, 520, 2000]; // ערך של N פרובינציות בשליטה (קמור: הקרבה לניצחון שווה יותר)
  // משקלים של פונקציית ההערכה (ניתנים לכוונון)
  const DEFAULT_W = { prov: 1, presence: 6, strength: 1.5, alive: 6, over: 0.3, bridge: 2, bridgeLeft: 1, territory: 3 };
  let W = DEFAULT_W;

  // ---------- פונקציית הערכה ----------
  function sideValue(s, x, cnt, held) {
    let v = H[held[x]] * W.prov;
    const y = 1 - x;
    let presence = 0, strength = 0;
    for (let k = 0; k < 9; k++) {
      if (cnt[x][k] > 0) presence++;
      if (cnt[x][k] > 0 && cnt[y][k] === 0) strength += Math.min(cnt[x][k], 4);   // חיילים נוספים מקשים על שבירת השליטה
    }
    v += presence * W.presence + strength * W.strength;

    let alive = R.SOLDIERS - s.graveyard[x], over = 0;
    for (let i = 0; i < R.CELLS; i++) { const c = s.cells[i]; if (c.o === x && c.n > 6) over += c.n - 6; }
    v += alive * W.alive - over * W.over;

    let br = 0;
    for (const k in s.bridges) if (s.bridges[k] === x) br++;
    v += br * W.bridge + s.bridgesLeft[x] * W.bridgeLeft;

    v += largestTerritory(s, x) * W.territory;       // טריטוריה גדולה = חופש פעולה (מנדט) גדול יותר
    return v;
  }

  function largestTerritory(s, x) {
    const seen = new Uint8Array(R.CELLS);
    let best = 0;
    for (let i = 0; i < R.CELLS; i++) {
      if (seen[i] || s.cells[i].o !== x) continue;
      let size = 0; const q = [i]; seen[i] = 1;
      while (q.length) {
        const cur = q.pop(); size++;
        for (const n of R.neighbors(cur)) {
          if (seen[n] || s.cells[n].o !== x) continue;
          if (R.crossesRiver(cur, n) && s.bridges[R.bridgeKey(cur, n)] !== x) continue;
          seen[n] = 1; q.push(n);
        }
      }
      if (size > best) best = size;
    }
    return best;
  }

  // ערך המצב מנקודת מבטו של שחקן p (אנטי-סימטרי: evaluate(s,p) = -evaluate(s,1-p))
  function evaluate(s, p) {
    if (s.winner !== null) return s.winner === p ? WIN : -WIN;
    const cnt = [new Array(9).fill(0), new Array(9).fill(0)];
    for (let i = 0; i < R.CELLS; i++) { const c = s.cells[i]; if (c.o !== null) cnt[c.o][R.provinceOf(i)] += c.n; }
    const held = [0, 0];
    for (let k = 0; k < 9; k++) {
      if (cnt[0][k] > 0 && cnt[1][k] === 0) held[0]++;
      else if (cnt[1][k] > 0 && cnt[0][k] === 0) held[1]++;
    }
    return sideValue(s, p, cnt, held) - sideValue(s, 1 - p, cnt, held);
  }

  // ---------- מחולל מהלכים ----------
  function countSet(n, lite, extra) {
    const set = new Set();
    const base = lite ? [1, Math.ceil(n / 2), n] : [1, 2, 3, 4, Math.ceil(n / 2), n - 1, n];
    for (const v of base.concat(extra || [])) if (v >= 1 && v <= n) set.add(v);
    return [...set];
  }

  function candidates(s, lite) {
    const p = s.turn, out = [];
    for (const Rc of s.roll.cells) {
      for (const type of R.actionTypes(s, Rc)) {
        if (type === 'land') {
          const camp = R.camp(s, p);
          for (const c of countSet(camp, lite, lite ? [] : [6, 8, 12])) out.push({ type, R: Rc, count: c });
          continue;
        }
        for (const from of R.sources(s, type, Rc)) {
          const n = s.cells[from].n;
          if (type === 'withdraw') { for (const c of countSet(n, lite)) out.push({ type, R: Rc, from, count: c }); continue; }
          for (const t of R.targets(s, type, Rc, from)) {
            if (type === 'bridge') { out.push({ type, R: Rc, from, to: t.to, tgt: t, count: 0 }); continue; }
            const def = t.kind === 'attack' ? s.cells[t.to].n : 0;
            const extra = def ? [def - 1, def, def + 1, def + 2] : [];
            for (const c of countSet(n, lite, extra)) out.push({ type, R: Rc, from, to: t.to, tgt: t, count: c });
          }
        }
      }
    }
    out.push({ type: 'pass' });
    return out;
  }

  const play = (s, a) => (a.type === 'pass' ? R.passFast(s) : R.apply(s, a, true));

  // ---------- בחירת מהלך ----------
  const ROLLS = (() => {   // 18 הטלות שונות (כל זוג משבצות נגדיות פעם אחת)
    const out = [];
    for (let w = 1; w <= 6; w++) for (let b = 1; b <= 6; b++) {
      if (R.idx(w - 1, b - 1) < R.idx(6 - w, 6 - b)) out.push({ w, b, cells: [R.idx(w - 1, b - 1), R.idx(6 - w, 6 - b)] });
    }
    return out;
  })();

  // ערך המצב אחרי מהלך שלי, ממוצע על הטלות היריב ותגובה מיטבית (חמדנית) שלו
  function opponentAverage(st, p, lite) {
    const q = 1 - p;
    let sum = 0;
    const saved = st.roll;
    for (const r of ROLLS) {
      st.roll = { w: r.w, b: r.b, cells: r.cells };
      let worst = Infinity;
      for (const a of candidates(st, lite)) {
        const v = evaluate(play(st, a), p);
        if (v < worst) worst = v;
      }
      sum += worst;
    }
    st.roll = saved;
    return sum / ROLLS.length;
  }

  /* מחזיר פעולה בפורמט של Rules.apply, או { type:'pass' }. */
  function chooseAction(s, level, weights) {
    W = Object.assign({}, DEFAULT_W, weights || {});
    const p = s.turn;
    const list = candidates(s, false).map((a) => {
      const ns = play(s, a);
      return { a, ns, v1: evaluate(ns, p) + Math.random() * 0.5 };
    });
    list.sort((x, y) => y.v1 - x.v1);

    if (list[0].ns.winner === p) return list[0].a;
    if (level === 'easy') {
      const top = list.slice(0, 4);
      return top[Math.floor(Math.random() * Math.min(top.length, 3))].a;
    }

    const K = 14, lite = true;
    let best = null;
    for (const c of list.slice(0, K)) {
      if (c.ns.winner === p) return c.a;
      const v = c.ns.winner !== null ? -WIN : opponentAverage(c.ns, p, lite) + c.v1 * 0.1;
      if (!best || v > best.v) best = { v, a: c.a };
    }
    return best.a;
  }

  const AI = { evaluate, candidates, chooseAction, DEFAULT_W };
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  else root.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
