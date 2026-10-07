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

  // פונקציית ההערכה: סכום משוקלל של הפרשי תכונות בין השחקן ליריב. כל תכונה מחושבת לכל צד בנפרד.
  //  h1..h5       – שליטה בלפחות 1..5 פרובינציות (מצטבר, כך שהערך קמור: הקרבה לניצחון שווה יותר)
  //  c2..c5       – בגרסה 2: הכי הרבה פרובינציות בשליטה שמחוברות בטריטוריה אחת (≥2..5); בגרסה 1 זהה ל-h
  //  presence     – מספר פרובינציות שיש בהן חיילים;  strength – חיילים (עד 4) בפרובינציות שבשליטה בלעדית
  //  lead/trail   – פרובינציות מתמודדות שבהן יש לי יותר/פחות חיילים מהיריב
  //  alive/camp   – חיילים חיים, וחיילים שבמחנה;  over – חיילים מעל 6 באותה משבצת
  //  bridge/bridgeLeft – גשרים שהונחו ושנותרו
  //  territory    – גודל הטריטוריה הראשית (שרשרת בסיסים מחוברת);  army – חיילים בה;  terrProv – כמה פרובינציות היא פורשת עליהן
  //  frag         – בסיסים מחוץ לטריטוריה הראשית (פיזור);  secure – פרובינציות בשליטה שמחוברות לטריטוריה הראשית
  //  bases/lone   – מספר בסיסים, וכמה מהם עם חייל בודד;  weakFront – בסיסים שצמוד אליהם בסיס יריב חזק מהם
  const FN = ['h1', 'h2', 'h3', 'h4', 'h5', 'c2', 'c3', 'c4', 'c5', 'presence', 'strength', 'lead', 'trail', 'alive', 'camp', 'over', 'bridge', 'bridgeLeft',
    'territory', 'army', 'terrProv', 'frag', 'secure', 'bases', 'lone', 'weakFront'];
  const IDX = {}; FN.forEach((n, i) => { IDX[n] = i; });
  // כוונון: רגרסיה לוגיסטית על משחקי מחשב-נגד-מחשב (tests/train.html), מעורבבת חצי-חצי עם המשקלים הידניים
  const DEFAULT_W = {
    h1: 16.68, h2: 27.04, h3: 28.67, h4: 74.17, h5: 485.32, presence: 9.42, strength: -2.02, lead: 11.52, trail: -11.52, alive: 19.2, camp: 2.98, over: -0.51, bridge: -24.62, bridgeLeft: -4.57, territory: -3.82, army: 3.82, terrProv: 37.61, frag: 5.77, secure: -4.22, bases: 1.06, lone: 12.21, weakFront: -10.74,
  };
  let Wv = FN.map((n) => DEFAULT_W[n]);
  function setWeights(w) { const m = Object.assign({}, DEFAULT_W, w || {}); Wv = FN.map((n) => m[n]); }

  // ---------- תכונות ----------
  // רכיבי הטריטוריות של שחקן x (לפי כללי המשחק: בגרסה 2 כולל משבצות ריקות בפרובינציות בשליטה).
  // לכל צומת מספר רכיב; הרכיב הגדול ביותר הוא "הטריטוריה הראשית"
  function territoryInfo(s, x) {
    const nodes = R.territoryNodes(s, x);
    const comp = new Int8Array(R.CELLS).fill(-1), sizes = [];
    for (let i = 0; i < R.CELLS; i++) {
      if (comp[i] >= 0 || !nodes[i]) continue;
      const id = sizes.length; let size = 0; const q = [i]; comp[i] = id;
      while (q.length) {
        const cur = q.pop(); size++;
        for (const n of R.neighbors(cur)) {
          if (comp[n] >= 0 || !nodes[n]) continue;
          if (R.crossesRiver(cur, n) && s.bridges[R.bridgeKey(cur, n)] !== x) continue;
          comp[n] = id; q.push(n);
        }
      }
      sizes.push(size);
    }
    let best = -1, bs = 0;
    sizes.forEach((z, id) => { if (z > bs) { bs = z; best = id; } });
    return { comp, best, size: bs };
  }

  function features(s, x, cnt, held) {
    const f = new Float64Array(FN.length), y = 1 - x, h = held[x];
    for (let k = 1; k <= 5; k++) f[IDX['h' + k]] = h >= k ? 1 : 0;
    const prog = R.winProgress(s, x);
    for (let k = 2; k <= 5; k++) f[IDX['c' + k]] = prog >= k ? 1 : 0;
    for (let k = 0; k < 9; k++) {
      const a = cnt[x][k], b = cnt[y][k];
      if (a > 0) f[IDX.presence]++;
      if (a > 0 && b === 0) f[IDX.strength] += Math.min(a, 4);
      if (a > 0 && b > 0) { if (a > b) f[IDX.lead]++; else if (a < b) f[IDX.trail]++; }
    }
    const t = territoryInfo(s, x);
    let onBoard = 0;
    const secureProv = new Uint8Array(9);
    for (let i = 0; i < R.CELLS; i++) if (t.comp[i] === t.best && t.best >= 0) secureProv[R.provinceOf(i)] = 1;
    for (let i = 0; i < R.CELLS; i++) {
      const c = s.cells[i];
      if (c.o !== x) continue;
      onBoard += c.n;
      f[IDX.bases]++;
      if (c.n === 1) f[IDX.lone]++;
      if (c.n > 6) f[IDX.over] += c.n - 6;
      if (t.comp[i] === t.best) f[IDX.army] += Math.min(c.n, 6); else f[IDX.frag]++;
      for (const n of R.neighbors(i)) { const e = s.cells[n]; if (e.o === y && e.n > c.n) { f[IDX.weakFront]++; break; } }
    }
    const alive = R.SOLDIERS - s.graveyard[x];
    f[IDX.alive] = alive; f[IDX.camp] = alive - onBoard;
    for (const k in s.bridges) if (s.bridges[k] === x) f[IDX.bridge]++;
    f[IDX.bridgeLeft] = s.bridgesLeft[x];
    f[IDX.territory] = t.size;
    for (let k = 0; k < 9; k++) {
      if (secureProv[k]) f[IDX.terrProv]++;
      if (secureProv[k] && cnt[x][k] > 0 && cnt[y][k] === 0) f[IDX.secure]++;
    }
    return f;
  }

  function counts(s) {
    const cnt = [new Array(9).fill(0), new Array(9).fill(0)];
    for (let i = 0; i < R.CELLS; i++) { const c = s.cells[i]; if (c.o !== null) cnt[c.o][R.provinceOf(i)] += c.n; }
    const held = [0, 0];
    for (let k = 0; k < 9; k++) {
      if (cnt[0][k] > 0 && cnt[1][k] === 0) held[0]++;
      else if (cnt[1][k] > 0 && cnt[0][k] === 0) held[1]++;
    }
    return { cnt, held };
  }

  // הפרש תכונות F(שחקן 0) - F(שחקן 1): משמש לאימון הערכה מנתוני משחקים
  function featureDiff(s) {
    const { cnt, held } = counts(s);
    const a = features(s, 0, cnt, held), b = features(s, 1, cnt, held);
    return Array.from(a, (v, i) => v - b[i]);
  }

  // ערך המצב מנקודת מבטו של שחקן p (אנטי-סימטרי: evaluate(s,p) = -evaluate(s,1-p))
  function evaluate(s, p) {
    if (s.winner !== null) return s.winner === p ? WIN : -WIN;
    const { cnt, held } = counts(s);
    const a = features(s, p, cnt, held), b = features(s, 1 - p, cnt, held);
    let v = 0;
    for (let i = 0; i < Wv.length; i++) v += Wv[i] * (a[i] - b[i]);
    return v;
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
          const tg = R.landTargets(s, Rc);   // כל בסיס בטריטוריה (או המשבצת הריקה שהוטלה)
          for (const to of tg) {
            for (const c of countSet(camp, lite, lite ? [] : [6, 8, 12])) out.push({ type, R: Rc, to, count: c });
          }
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

  // המהלך הטוב ביותר שלי (חמדני) בהטלה נתונה, לעומק השלישי של החיפוש
  function bestReply(st, p, roll) {
    const saved = st.roll;
    st.roll = roll;
    let best = -Infinity;
    for (const a of candidates(st, true)) {
      const v = evaluate(play(st, a), p);
      if (v > best) best = v;
    }
    st.roll = saved;
    return best;
  }

  // ערך המצב אחרי מהלך שלי, ממוצע על הטלות היריב ותגובה מיטבית (חמדנית) שלו.
  // sample (אופציונלי): עומק שלישי – אחרי תגובת היריב מחשבים גם את המהלך הבא שלי, על מדגם הטלות.
  function opponentAverage(st, p, lite, sample) {
    const q = 1 - p;
    let sum = 0;
    const saved = st.roll;
    for (const r of ROLLS) {
      st.roll = { w: r.w, b: r.b, cells: r.cells };
      let worst = Infinity, worstState = null;
      for (const a of candidates(st, lite)) {
        const ns = play(st, a);
        const v = evaluate(ns, p);
        if (v < worst) { worst = v; worstState = ns; }
      }
      if (sample && worstState && worstState.winner === null) {
        let t = 0;
        for (const rr of sample) t += bestReply(worstState, p, rr);
        sum += t / sample.length;
      } else sum += worst;
    }
    st.roll = saved;
    return sum / ROLLS.length;
  }

  /* מחזיר פעולה בפורמט של Rules.apply, או { type:'pass' }. */
  function chooseAction(s, level, weights) {
    setWeights(weights);
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

    const deep = level === 'deep';
    const K = deep ? 8 : 14, lite = true;
    // מדגם קבוע של הטלות לעומק השלישי (אותו מדגם לכל המהלכים, כדי שההשוואה ביניהם הוגנת)
    const sample = deep ? ROLLS.slice().sort(() => Math.random() - 0.5).slice(0, 6).map((r) => ({ w: r.w, b: r.b, cells: r.cells })) : null;
    let best = null;
    for (const c of list.slice(0, K)) {
      if (c.ns.winner === p) return c.a;
      const v = c.ns.winner !== null ? -WIN : opponentAverage(c.ns, p, lite, sample) + c.v1 * 0.1;
      if (!best || v > best.v) best = { v, a: c.a };
    }
    return best.a;
  }

  const AI = { evaluate, candidates, chooseAction, featureDiff, setWeights, FN, DEFAULT_W };
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  else root.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
