/* Province – ממשק משתמש.
 * מצבי משחק: שני שחקנים על מכשיר אחד / אדם נגד מחשב / צפייה במחשב נגד מחשב.
 * הלוגיקה ב-rules.js, המחשב ב-ai.js.
 *
 * אינטראקציה (בלי תפריטים): אחרי הטלה המשבצות שאפשר לפעול מהן מודגשות בצל.
 *   לחיצה על משבצת ריקה מודגשת = הנחתת חיילים.
 *   לחיצה על בסיס = בחירה (צל חזק), ומשבצות היעד מודגשות. גרירה (או לחיצה) ליעד = תנועה / התקפה / גשר / שינוע.
 */
(function () {
  'use strict';
  let R = window.Rules, AIB = window.AI;   // כללי המשחק והמחשב של גודל הלוח הנוכחי (useBoard)
  const SAVE_KEY = 'province.save.v7';
  const NAME = window.Rules.NAMES;
  const COLORS = ['#e5484d', '#3b6ef5'];     // תואם ל---p0 / --p1 ב-style.css

  // ---------- גיאומטריה ----------
  // P מרחק בין משבצות, G רווח בין פרובינציות (נהר), M שוליים, CR רדיוס עיגול, LIFT גובה ריחוף, RIVER_W עובי נהר, BR עובי גשר, FS גודל מספרים
  const GEO = {
    6: { P: 64, G: 34, M: -11, CR: 21, LIFT: 10, RIVER_W: 12, BR: 8, FS: 18 },
    8: { P: 56, G: 22, M: -7, CR: 21, LIFT: 9, RIVER_W: 9, BR: 8, FS: 17 },
  };
  const BRIDGE_FILL = 0.68;   // חלק מהרווח בין שני העיגולים שהגשר (כולל הקצוות העגולים) תופס: אותה פרופורציה בכל גודל לוח
  let P, G, M, CR, W, LIFT, RIVER_W, BR, FS;
  function useBoard(n) {
    R = window.Rules.forSize(n); AIB = window.AI.forSize(n);
    ({ P, G, M, CR, LIFT, RIVER_W, BR, FS } = GEO[n]);
    W = 2 * M + n * P + (n / 2 - 1) * G;
    const len = (P + G - 2 * CR) * BRIDGE_FILL - BR, th = 16, tw = Math.max(3.5, Math.min(4, th * BR / len));
    document.documentElement.style.setProperty('--tick-w', tw.toFixed(1) + 'px');
    document.documentElement.style.setProperty('--tick-h', th + 'px');
    memo = { state: null, play: null, opts: new Map() };
  }
  const cx = (x) => M + x * P + Math.floor(x / 2) * G + P / 2;
  const cy = (y) => { const r = R.SIZE - 1 - y; return M + r * P + Math.floor(r / 2) * G + P / 2; };
  const cellX = (i) => cx(R.xy(i)[0]);
  const cellY = (i) => cy(R.xy(i)[1]);

  // ---------- מצב ----------
  const $ = (id) => document.getElementById(id);
  let state, history;
  // mode: pvp | ai | watch
  let settings = { mode: 'pvp', human: 0, level: 'strong', levelR: 'strong', levelB: 'strong', speed: 'normal', board: 6 };
  let lastMove = null, lastRoll = null, aiTimer = null, paused = false;
  let winShowAt = 0, winTimer = null;   // חלון הניצחון מוצג רק אחרי אנימציית המהלך והבהוב הפרובינציות
  const TUT = window.TUTORIAL;
  const tut = { active: false, i: 0, page: 0, phase: 'pages', backup: null, cardAt: 0, cardTimer: null, nudgeTimer: null };
  let ui = freshUi();
  function freshUi() { return { sel: null, sheet: null, hover: null, rolled: false }; }
  const SPEED = { slow: 2, normal: 1, fast: 0.12 };
  const SPEED_LABEL = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
  const isAiTurn = () => state.winner === null &&
    (settings.mode === 'watch' || (settings.mode === 'ai' && state.turn !== settings.human) ||
      (settings.mode === 'tutorial' && tut.phase === 'game' && state.turn === 1));
  const aiLevel = () => (settings.mode === 'watch' ? (state.turn === 0 ? settings.levelR : settings.levelB) : settings.level);
  const phase = () => (state.winner !== null ? 'over' : !state.roll ? 'roll' : R.hasAnyMove(state) ? 'play' : 'skip');
  const canAct = () => !isAiTurn() && phase() === 'play' && ui.sheet === null && (!tut.active || tut.phase === 'game');

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.state && (d.state.cells.length === 36 || d.state.cells.length === 64)) {
          state = d.state; history = d.history || []; settings = Object.assign(settings, d.settings || {});
          settings.board = d.state.cells.length === 64 ? 8 : 6; return;
        }
      }
    } catch (e) { /* ignore */ }
    state = window.Rules.forSize(settings.board).newGame(); history = [];
  }
  // כללי גרסה 2 בכל המצבים (פרובינציה בשליטה = טריטוריה; ניצחון ב-5 פרובינציות מחוברות). המחשב אומן עליהם.
  function applyRules() { R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true; }
  function save() {
    if (tut.active) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state, history: history.slice(-60), settings })); } catch (e) { /* ignore */ }
  }

  // ---------- חישובי אפשרויות ----------
  let memo = { state: null, play: null, opts: new Map() };
  function ensureMemo() { if (memo.state !== state) memo = { state, play: null, opts: new Map() }; }

  // כל המשבצות שאפשר לפעול מהן: משבצות הנחתה, ובסיסים שאפשר להזיז/לתקוף/לשנע/למשוך/להניח גשר מהם
  function playableMap() {
    ensureMemo();
    if (memo.play) return memo.play;
    const m = new Map();
    const add = (c, k) => { const e = m.get(c) || {}; e[k] = true; m.set(c, e); };
    if (state.roll) {
      for (const Rc of state.roll.cells) {
        if (R.actionTypes(state, Rc).includes('land')) for (const t of R.landTargets(state, Rc)) add(t, 'land');
        for (const t of ['move', 'transport', 'withdraw', 'bridge']) for (const f of R.sources(state, t, Rc)) add(f, 'source');
      }
    }
    if (tut.active) {   // בטוטוריאל מודגש רק מה שהמדריך מבקש לעשות
      const ex = tutExpect(), f = new Map();
      if (ex) f.set(ex.tap ? ex.cell : ex.from, ex.tap ? { land: true } : { source: true });
      return (memo.play = f);
    }
    return (memo.play = m);
  }

  // יעדים אפשריים מבסיס נתון: to -> { move, transport, bridge } (כל אחד עם tgt ו-R)
  function optionsFrom(from) {
    ensureMemo();
    if (memo.opts.has(from)) return memo.opts.get(from);
    const opts = new Map();
    for (const Rc of state.roll.cells) {
      for (const t of ['move', 'transport', 'bridge']) {
        if (!R.sources(state, t, Rc).includes(from)) continue;
        for (const tg of R.targets(state, t, Rc, from)) {
          const o = opts.get(tg.to) || { to: tg.to };
          if (!o[t]) o[t] = { tg, R: Rc };
          opts.set(tg.to, o);
        }
      }
    }
    if (tut.active) {
      const ex = tutExpect(), f = new Map();
      if (ex && !ex.tap && from === ex.from && opts.has(ex.to)) f.set(ex.to, opts.get(ex.to));
      memo.opts.set(from, f);
      return f;
    }
    memo.opts.set(from, opts);
    return opts;
  }

  // תוכנית פעולה לגרירה/לחיצה מבסיס אל יעד
  function planFor(from, to) {
    const o = optionsFrom(from).get(to);
    if (!o) return null;
    const n = state.cells[from].n;
    if (o.move) return { type: 'move', R: o.move.R, tgt: o.move.tg, from, to, min: o.bridge ? 0 : 1, max: n, bridge: o.bridge || null };
    if (o.transport) return { type: 'transport', R: o.transport.R, tgt: o.transport.tg, from, to, min: 1, max: n, bridge: null };
    return { type: 'bridge', R: o.bridge.R, tgt: o.bridge.tg, from, to, min: 0, max: 0, bridge: o.bridge };
  }
  function actionFromPlan(plan, count) {
    if (count === 0) return { type: 'bridge', R: plan.bridge.R, from: plan.from, to: plan.to, count: 0 };
    return { type: plan.type, R: plan.R, from: plan.from, to: plan.to, count };
  }
  const withdrawR = (from) => state.roll.cells.find((Rc) => R.sources(state, 'withdraw', Rc).includes(from));
  const landR = (c) => state.roll.cells.find((Rc) => R.actionTypes(state, Rc).includes('land') && R.landTargets(state, Rc).includes(c));

  // ---------- ביצוע ----------
  function commit(a) {
    let ns;
    if (tut.active && !tutMatches(a)) { tutNudge('Follow the highlighted move'); return false; }
    try { ns = R.apply(state, a); } catch (e) { console.error(e); return false; }
    const prev = state;
    if (tut.active) { tut.i++; tut.cardAt = Infinity; }
    winShowAt = ns.winner !== null ? Infinity : 0;
    history.push(state); lastMove = { p: state.turn, a }; state = ns;
    ui = freshUi();
    save(); render(); animateMove(prev, a, ns);
    return true;
  }
  function doRoll() {
    const sc = tut.active ? tutStepNow() : null;
    state = sc ? R.roll(state, sc.dice[0], sc.dice[1]) : R.roll(state, 1 + Math.floor(Math.random() * R.SIZE), 1 + Math.floor(Math.random() * R.SIZE));
    lastRoll = { w: state.roll.w, b: state.roll.b, p: state.turn }; lastMove = null;
    ui = freshUi(); ui.rolled = true;
    save(); render();
  }
  function passOrSkip(fn) { history.push(state); lastMove = null; state = fn(state); ui = freshUi(); save(); render(); }
  const doSkip = () => passOrSkip(R.skipTurn);
  const doPass = () => passOrSkip(R.passTurn);

  function undo() {
    if (!history.length) return;
    clearTimeout(aiTimer); aiTimer = null; clearTimeout(winTimer); winShowAt = 0;
    state = history.pop();
    // נגד המחשב: חוזרים עד לתור האדם (ביטול מהלך המחשב יחד עם מהלך האדם)
    while (isAiTurn() && history.length) state = history.pop();
    lastMove = null; ui = freshUi(); save(); render();
  }

  // פותחים תמיד את חלון האישור, גם כשאין מה לבחור (בלי ביצוע אוטומטי)
  function openSheet(sheet) {
    ui.sheet = sheet; render();
  }
  // לחיצה קצרה על משבצת: הוספת חיילים מהמחנה (תגבור/הנחתה) ו/או משיכת חיילים בחזרה למחנה
  function startAdjust(c) {
    if (tut.active) { const ex = tutExpect(); if (!ex || !ex.tap || ex.cell !== c) return false; }
    const p = state.turn, cell = state.cells[c], modes = [];
    const rl = landR(c), rw = cell.o === p ? withdrawR(c) : undefined;
    if (rl !== undefined && R.camp(state, p) > 0) modes.push('add');
    if (rw !== undefined) modes.push('withdraw');
    if (!modes.length) return false;
    const sh = { kind: 'adjust', cell: c, modes, mode: modes[0], rl, rw };
    setMode(sh, modes[0]);
    tutPrep(sh);
    ui.sheet = sh; render();
    return true;
  }
  function setMode(sh, mode) {
    const p = state.turn;
    sh.mode = mode;
    if (mode === 'add') {
      sh.min = 1; sh.max = R.camp(state, p); sh.count = 1;
      sh.build = (n) => ({ type: 'land', R: sh.rl, to: sh.cell, count: n });
    } else {
      sh.min = 1; sh.max = state.cells[sh.cell].n; sh.count = sh.max;
      sh.build = (n) => ({ type: 'withdraw', R: sh.rw, from: sh.cell, count: n });
    }
  }
  function startMove(from, to) {
    const plan = planFor(from, to);
    if (!plan) { render(); return; }
    const sh = { kind: 'move', plan, from, to, min: plan.min, max: plan.max, count: plan.max > 1 ? plan.max - 1 : plan.max, build: (n) => actionFromPlan(plan, n) };
    tutPrep(sh);
    openSheet(sh);
  }

  // ---------- אנימציית מהלך ----------
  // רצה מיד אחרי render(): מסתירה את הבסיסים המושפעים, ומציירת במקומם "רפאים" שמספריהם מתעדכנים בהדרגה,
  // יחד עם סימון קטן של המהלך (חרבות, שבב נע, "+N"). כל render() חדש מבטל אותה, והלוח הסופי תמיד נכון.
  let fxTimers = [], fxUntil = 0;
  const FK = 1.8;   // מקדם האטה כללי לאנימציות (כל אנימציה נמשכת לפחות ~2 שניות)
  function fxCancel() { fxTimers.forEach(clearTimeout); fxTimers = []; }
  const later = (ms, fn) => { fxTimers.push(setTimeout(fn, ms * FK * (window.__fxScale || 1))); };
  const NS = 'http://www.w3.org/2000/svg';
  function mk(parent, tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    e.style.transformBox = 'fill-box'; e.style.transformOrigin = 'center';
    parent.appendChild(e);
    return e;
  }
  const bump = (el, from = 1.35, ms = 170) => {
    try {
      el.style.transformBox = 'fill-box'; el.style.transformOrigin = 'center';
      el.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], { duration: ms * FK, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
    } catch (e) { /* ignore */ }
  };
  const stats = (s, pl) => ({ prov: R.winProgress(s, pl), sold: R.camp(s, pl), brid: s.bridgesLeft[pl], dead: s.graveyard[pl] });
  const HALO = 'paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round;';

  function animateMove(prev, a, next) {
    fxCancel();
    const svg = $('board');
    if (!svg || !a || a.type === 'pass') { releaseWin(0); return; }
    const p = prev.turn, q = 1 - p, col = COLORS[p];
    const g = mk(svg, 'g', { id: 'fx', 'pointer-events': 'none' });
    const real = (i) => svg.querySelectorAll(`[data-i="${i}"]`);
    const hide = (i) => real(i).forEach((e) => { e.style.visibility = 'hidden'; });
    const show = (i, pop) => real(i).forEach((e) => { e.style.visibility = ''; if (pop && e.tagName === 'circle') bump(e, .5, 300); });
    const ghost = (i, owner, n) => {
      const x = cellX(i), y = cellY(i);
      const c = mk(g, 'circle', { class: `base p${owner}`, cx: x, cy: y, r: CR });
      const t = mk(g, 'text', { class: 'cnt', x, y: y + 1, style: `font-size:${FS}px` });
      t.textContent = n;
      return {
        set(v) { t.textContent = v; bump(t, 1.4, 160); },
        remove() { c.remove(); t.remove(); },
        flick() { [c, t].forEach((e) => { try { e.animate([{ opacity: 1 }, { opacity: .25 }, { opacity: 1 }], { duration: 340 * FK, easing: 'ease-in-out' }); } catch (er) { /* ignore */ } }); },
        fade() { [c, t].forEach((e) => { try { e.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.4)' }], { duration: 350 * FK, fill: 'forwards' }); } catch (er) { /* ignore */ } }); later(360, () => { c.remove(); t.remove(); }); },
      };
    };
    // מספר בבסיס שעולה/יורד בהדרגה במקום (בלי רפאים); בסיס חדש צץ פעם אחת; בסיס שנעלם מתכווץ
    function cellTween(i, owner, from, to, t0, step) {
      const steps = Math.min(Math.abs(to - from), 8);
      const end = t0 + Math.max(steps, 1) * step;
      if (from === to) return end;
      const vals = []; for (let k = 1; k <= steps; k++) vals.push(Math.round(from + (to - from) * k / steps));
      if (to > 0) {
        const txt = svg.querySelector(`text[data-i="${i}"]`), circ = svg.querySelector(`circle[data-i="${i}"]`);
        if (!txt || !circ) return end;
        if (from <= 0) {
          hide(i);
          later(t0, () => { show(i, false); bump(circ, .3, 320); bump(txt, .3, 320); });
          return end;
        }
        txt.textContent = from;
        later(t0, () => bump(circ, 1.22, 300));
        vals.forEach((v, k) => later(t0 + k * step, () => { txt.textContent = v; bump(txt, 1.4, 170); }));
        return end;
      }
      let gh = ghost(i, owner, from);
      hide(i);
      vals.forEach((v, k) => later(t0 + k * step, () => { if (v > 0 && gh) gh.set(v); }));
      later(end, () => { if (gh) { gh.fade(); gh = null; } });
      return end + 300;
    }
    const panelEl = (pl, k) => document.querySelector(`#pl${pl} .num[data-k="${k}"]`);
    function panelTween(pl, k, from, to, t0, step) {
      const el = panelEl(pl, k);
      if (!el || from === to) return;
      el.textContent = from;
      const steps = Math.min(Math.abs(to - from), 10);
      for (let j = 1; j <= steps; j++) { const v = Math.round(from + (to - from) * j / steps); later(t0 + (j - 1) * step, () => { el.textContent = v; bump(el, 1.35, 200); }); }
    }
    const label = (x, y, text, color, t0) => later(t0, () => {
      const t = mk(g, 'text', { x, y, 'text-anchor': 'middle', fill: color, style: 'font:700 16px var(--font);' + HALO });
      t.textContent = text;
      t.animate([{ transform: 'translateY(0)', opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'translateY(-22px)', opacity: 0 }], { duration: 800 * FK, easing: 'ease-out', fill: 'forwards' });
      later(820, () => t.remove());
    });
    const ring = (i, t0) => later(t0, () => {
      const c = mk(g, 'circle', { cx: cellX(i), cy: cellY(i), r: CR, fill: 'none', stroke: col, 'stroke-width': 3 });
      c.animate([{ transform: 'scale(1)', opacity: .9 }, { transform: 'scale(1.9)', opacity: 0 }], { duration: 600 * FK, easing: 'ease-out', fill: 'forwards' });
      later(620, () => c.remove());
    });
    const bridgeIn = (from, to) => {
      const key = R.bridgeKey(from, to);
      if (prev.bridges[key] === next.bridges[key] || next.bridges[key] !== p) return 0;
      const el = svg.querySelector(`line[data-key="${key}"]`);
      if (!el) return 0;
      const len = el.getTotalLength ? el.getTotalLength() : 40;
      // הקו מצויר מהקצה של המשבצת הנמוכה; אם הגשר נבנה מהצד השני – מציירים בכיוון ההפוך
      const from0 = Math.min(from, to) === from ? len : -len;
      el.animate([{ strokeDasharray: len, strokeDashoffset: from0 }, { strokeDasharray: len, strokeDashoffset: 0 }], { duration: 200 * FK, easing: 'ease-out' });
      return 220;
    };

    const n = a.count | 0;
    let end = 0, panelT = 0;
    const handled = new Set();

    if (a.type === 'land') {
      const c = a.to === undefined || a.to === null ? a.R : a.to;
      const from = prev.cells[c].o === p ? prev.cells[c].n : 0, to = next.cells[c].o === p ? next.cells[c].n : 0;
      label(cellX(c), cellY(c) - CR - 4, '+' + n, col, 0);
      end = cellTween(c, p, from, to, 150, 90);
    } else if (a.type === 'withdraw') {
      const c = a.from;
      label(cellX(c), cellY(c) - CR - 4, '−' + n, col, 0);
      end = cellTween(c, p, prev.cells[c].n, next.cells[c].o === p ? next.cells[c].n : 0, 150, 90);
    } else if (a.type === 'bridge') {
      end = Math.max(bridgeIn(a.from, a.to), 300);
      ring(a.from, 0); ring(a.to, 200);
    } else {
      const f = a.from, t = a.to, tB = bridgeIn(f, t);
      const sx = cellX(f), sy = cellY(f), tx = cellX(t), ty = cellY(t);
      const attack = prev.cells[t].o === q;
      const dl = Math.hypot(tx - sx, ty - sy) || 1;
      if (!attack) {
        // פעימה בבסיס המקור (המספר יורד), ואחריה פעימה בבסיס היעד (המספר עולה)
        const e1 = cellTween(f, p, prev.cells[f].n, next.cells[f].o === p ? next.cells[f].n : 0, tB + 100, 110);
        const tD = e1 + 250, dFrom = prev.cells[t].o === p ? prev.cells[t].n : 0;
        end = cellTween(t, p, dFrom, next.cells[t].n, tD, 110);
        panelT = tD;
      } else {
        const def = prev.cells[t].n, k = Math.min(n, def), step = k > 6 ? 200 : 360;
        hide(f); hide(t);
        const gs = ghost(f, p, prev.cells[f].n), gd = ghost(t, q, def);
        const mx = (sx + tx) / 2, my = (sy + ty) / 2;
        let px = -(ty - sy) / dl, py = (tx - sx) / dl;
        if (px * (W / 2 - mx) + py * (W / 2 - my) < 0) { px = -px; py = -py; }   // הסימון יוצא לכיוון מרכז הלוח, לא מכסה את המספרים
        let sw = null, o1 = null;
        const t1 = tB + 120;
        later(t1, () => {
          o1 = mk(g, 'g', { transform: `translate(${mx} ${my})` });
          const big = mk(o1, 'g', { transform: 'scale(1.25)' });
          sw = mk(big, 'g', {});
          const st0 = `fill:${col};stroke:#fff;stroke-width:2.4px;paint-order:stroke;stroke-linejoin:round;`;
          for (const ang of [-42, 42]) {
            const sd = mk(sw, 'g', { transform: `rotate(${ang})` });
            mk(sd, 'polygon', { points: '0,-13 2.3,-10 2.3,5 -2.3,5 -2.3,-10', style: st0 });   // להב
            mk(sd, 'rect', { x: -5.5, y: 5, width: 11, height: 2.6, rx: 1.2, style: st0 });      // מגן
            mk(sd, 'rect', { x: -1.3, y: 7.6, width: 2.6, height: 4.2, rx: 1, style: st0 });     // ידית
            mk(sd, 'circle', { cx: 0, cy: 13, r: 1.9, style: st0 });                              // ראש הידית
          }
          bump(sw, .3, 320);
        });
        const dead0 = prev.graveyard[q];
        handled.add(q + 'dead');
        { const el0 = panelEl(q, 'dead'); if (el0) el0.textContent = dead0; }
        for (let j = 1; j <= k; j++) {
          later(t1 + 340 + (j - 1) * step, () => {
            // המספרים של שני הבסיסים יורדים יחד, והסמלים מהבהבים
            if (def - j > 0) gd.set(def - j); else gd.remove();
            const sv = prev.cells[f].n - j;
            if (sv > 0) gs.set(sv); else gs.remove();
            gd.flick(); gs.flick(); if (sw) bump(sw, 1.3, 160);
            const el = panelEl(q, 'dead'); if (el) { el.textContent = dead0 + j; bump(el, 1.45, 220); }
          });
        }
        end = t1 + 340 + k * step + 120;
        later(end, () => { gs.remove(); gd.remove(); show(f, false); show(t, next.cells[t].o === p); if (o1) o1.remove(); });
        end += 260; panelT = end - 260;
      }
    }

    // מוני הפאנלים (ללא ההרוגים בהתקפה, שנספרים תוך כדי הקרב)
    for (const pl of [0, 1]) {
      const A = stats(prev, pl), B = stats(next, pl);
      for (const k of ['prov', 'sold', 'brid', 'dead']) {
        if (handled.has(pl + k)) continue;
        panelTween(pl, k, A[k], B[k], panelT, 60);
      }
    }
    end = Math.max(end, a.type === 'bridge' ? 700 : 1150);   // אנימציות קצרות צריכות זמן להיראות
    fxUntil = Date.now() + end * FK * (window.__fxScale || 1) + 300;
    // התור של המחשב (אם כבר נקבע) מחכה לסיום האנימציה
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; scheduleAi(); }
    later(end + 200, () => { if (g.parentNode) g.remove(); });
    if (next.winner !== null) {
      // אחרי המהלך: הפרובינציות המחוברות של המנצח מהבהבות 3 פעמים לאט ברקע בצבעו, ורק אחר כך מופיע חלון הניצחון
      const wp = next.winner, startMs = (end + 250) * FK * (window.__fxScale || 1);
      const ctl = R.provinceControl(next), first = (k) => R.idx((k % R.PR) * 2, Math.floor(k / R.PR) * 2);
      let group = [];
      for (let k = 0; k < R.NPROV && !group.length; k++) {
        if (ctl[k] !== wp) continue;
        const comp = R.territory(next, first(k), wp), grp = [];
        for (let j = 0; j < R.NPROV; j++) if (ctl[j] === wp && comp.includes(first(j))) grp.push(j);
        if (grp.length >= R.WIN_PROVINCES) group = grp;
      }
      if (!group.length) for (let k = 0; k < R.NPROV; k++) if (ctl[k] === wp) group.push(k);
      const PULSE = 1200;
      const wg = document.createElementNS(NS, 'g');
      wg.setAttribute('pointer-events', 'none');
      svg.insertBefore(wg, svg.firstChild);
      for (const k of group) {
        const a0 = first(k), b0 = R.idx((k % R.PR) * 2 + 1, Math.floor(k / R.PR) * 2 + 1), m = CR + 8;
        const r0 = document.createElementNS(NS, 'rect');
        r0.setAttribute('x', cellX(a0) - m); r0.setAttribute('y', Math.min(cellY(a0), cellY(b0)) - m);
        r0.setAttribute('width', Math.abs(cellX(b0) - cellX(a0)) + 2 * m); r0.setAttribute('height', Math.abs(cellY(b0) - cellY(a0)) + 2 * m);
        r0.setAttribute('rx', 16); r0.setAttribute('fill', COLORS[wp]); r0.setAttribute('opacity', 0);
        wg.appendChild(r0);
        try { r0.animate([{ opacity: 0 }, { opacity: .42, offset: .5 }, { opacity: 0 }], { duration: PULSE, iterations: 3, delay: startMs, easing: 'ease-in-out' }); } catch (e) { /* ignore */ }
      }
      releaseWin(startMs + 3 * PULSE + 350);
    }
  }
  // חלון הניצחון נחשף אחרי השהיה (ms), גם אם האנימציה בוטלה באמצע
  function releaseWin(ms) {
    clearTimeout(winTimer);
    winShowAt = Date.now() + ms;
    winTimer = setTimeout(() => { winShowAt = 0; render(); }, ms + 20);
  }

  // ---------- יריב מחשב ----------
  function scheduleAi() {
    if (aiTimer || paused || !isAiTurn()) return;
    aiTimer = setTimeout(aiStep, Math.max((state.roll ? 1000 : 700) * SPEED[settings.speed], fxUntil - Date.now() + 250));
  }
  function togglePause() {
    paused = !paused;
    if (paused) { clearTimeout(aiTimer); aiTimer = null; }
    render();
  }
  function cycleSpeed() {
    const order = ['slow', 'normal', 'fast'];
    settings.speed = order[(order.indexOf(settings.speed) + 1) % order.length];
    save(); render();
  }
  function aiStep() {
    aiTimer = null;
    if (!isAiTurn()) return;
    if (tut.active) { tutAiStep(); return; }
    if (!state.roll) { doRoll(); return; }
    const p = state.turn;
    let a = { type: 'pass' };
    if (R.hasAnyMove(state)) {
      try { a = AIB.chooseAction(state, aiLevel()); } catch (e) { console.error(e); }
    }
    const prevS = state;
    history.push(state);
    if (!R.hasAnyMove(state)) state = R.skipTurn(state);
    else if (a.type === 'pass') state = R.passTurn(state);
    else {
      try { state = R.apply(state, a); } catch (e) { console.error(e); state = R.passTurn(state); a = { type: 'pass' }; }
    }
    lastMove = a.type === 'pass' ? null : { p, a };
    winShowAt = state.winner !== null && a.type !== 'pass' ? Infinity : 0;
    ui = freshUi(); save(); render();
    if (a.type !== 'pass') animateMove(prevS, a, state);
  }


  // ---------- טוטוריאל ----------
  // משחק מתוסרט על 6×6 (src/tutorial.js): האדם משחק אדום, המחשב מבצע מהלכים קבועים. כל צעד של האדם מוכתב: מסומן על הלוח בדיוק מה לעשות,
  // ומעל פאנל היריב מופיע כרטיס הסבר שנסגר אחרי כל מהלך.
  const tIdx = (c) => R.idx(c[0], c[1]);
  const tutStepNow = () => (tut.active && tut.phase === 'game' ? TUT.steps[tut.i] || null : null);
  function tutExpect() {   // הפעולה הצפויה בצעד הנוכחי של האדם (אחרי ההטלה), או null
    const st = tutStepNow();
    if (!st || st.who !== 0 || state.turn !== 0 || !state.roll || state.winner !== null) return null;
    const a = st.act, ex = { kind: st.kind, type: a.type, count: a.count };
    if (a.from) ex.from = tIdx(a.from);
    if (a.to) ex.to = tIdx(a.to);
    ex.tap = a.type === 'land' || a.type === 'withdraw';
    ex.cell = a.type === 'land' ? ex.to : a.type === 'withdraw' ? ex.from : null;
    return ex;
  }
  function tutMatches(a) {
    const ex = tutExpect();
    if (!ex) return false;
    return a.type === ex.type && (a.count | 0) === ex.count && (ex.from === undefined || a.from === ex.from) && (ex.to === undefined || a.to === ex.to);
  }
  function tutPrep(sh) {   // חלון הכמות נפתח כבר עם ההגדרה הנכונה
    if (!tut.active) return;
    const ex = tutExpect();
    if (!ex) return;
    sh.tut = ex;
    if (sh.kind === 'adjust') { const want = ex.type === 'withdraw' ? 'withdraw' : 'add'; if (sh.modes.includes(want) && sh.mode !== want) setMode(sh, want); }
    sh.count = Math.max(sh.min, Math.min(sh.max, ex.count));
  }
  function tutSheetOk(sh) {
    const ex = sh.tut;
    if (!ex) return false;
    if (sh.kind === 'adjust') return sh.mode === (ex.type === 'withdraw' ? 'withdraw' : 'add') && sh.count === ex.count;
    return sh.count === ex.count;
  }
  function tutGuideSvg(ex) {
    const ring = (i, n) => {
      const x = cellX(i), y = cellY(i);
      return `<circle class="guide-ring" cx="${x}" cy="${y}" r="${CR + 10}"/>` +
        (n ? `<circle cx="${x + CR + 4}" cy="${y - CR - 4}" r="10" fill="#1b1e24"/><text class="guide-n" x="${x + CR + 4}" y="${y - CR - 3}">${n}</text>` : '');
    };
    if (ex.tap) return ring(ex.cell, '');
    return `<line class="guide-line" x1="${cellX(ex.from)}" y1="${cellY(ex.from)}" x2="${cellX(ex.to)}" y2="${cellY(ex.to)}"/>` + ring(ex.from, '1') + ring(ex.to, '2');
  }
  function tutNudge(msg) {
    const el = $('coachNudge');
    el.textContent = msg;
    const c = $('coach');
    c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
    clearTimeout(tut.nudgeTimer);
    tut.nudgeTimer = setTimeout(() => { el.textContent = ''; }, 2800);
  }
  function renderCoach() {
    const el = $('coach');
    if (!tut.active || state.winner !== null) { el.hidden = true; return; }
    let step, title, body, foot = '';
    if (tut.phase === 'pages') {
      const pg = TUT.pages[tut.page];
      step = `${tut.page + 1} / ${TUT.pages.length}`; title = pg.title; body = pg.body;
      foot = `<button class="btn sm" id="coachNext" type="button">${tut.page < TUT.pages.length - 1 ? 'Next' : "Let's play"}</button>`;
    } else {
      const st = tutStepNow();
      if (!st || st.who !== 0 || state.turn !== 0 || Date.now() < tut.cardAt) { el.hidden = true; return; }
      const humans = TUT.steps.filter((x) => x.who === 0), n = humans.indexOf(st) + 1;
      step = `Lesson ${n} of ${humans.length}`; title = st.title; body = state.roll ? st.instr : st.intro;
    }
    $('coachStep').textContent = step;
    $('coachTitle').textContent = title;
    $('coachBody').innerHTML = body;
    $('coachFoot').innerHTML = foot;
    const nb = $('coachNext');
    if (nb) nb.onclick = () => {
      if (tut.page < TUT.pages.length - 1) tut.page++;
      else { tut.phase = 'game'; tut.i = 0; tut.cardAt = 0; }
      render();
    };
    el.hidden = false;
    // הכרטיס מכסה את פאנל היריב (ואת הרווח שמתחתיו עד הלוח)
    const pl = $('pl1').getBoundingClientRect(), bw = $('boardWrap').getBoundingClientRect();
    el.style.left = (pl.left - 6) + 'px'; el.style.width = (pl.width + 12) + 'px';
    el.style.top = Math.max(4, pl.top - 8) + 'px';
    el.style.minHeight = (pl.height + 14) + 'px';
    el.style.maxHeight = Math.max(pl.height + 14, bw.top - (pl.top - 8) - 2) + 'px';
    el.classList.remove('tight');
    if (el.scrollHeight > el.clientHeight + 1) el.classList.add('tight');   // מסך נמוך: טקסט קצת קטן יותר במקום גלילה
  }
  function tutScheduleCard() {
    const delay = Math.max(0, fxUntil - Date.now()) + 500;
    tut.cardAt = Date.now() + delay;
    clearTimeout(tut.cardTimer);
    tut.cardTimer = setTimeout(() => { if (tut.active) render(); }, delay + 30);
  }
  function tutAiStep() {
    const st = tutStepNow();
    if (!st || st.who !== 1) return;
    if (!state.roll) { doRoll(); return; }
    const a = { type: st.act.type, count: st.act.count };
    if (st.act.R) a.R = tIdx(st.act.R);
    if (st.act.from) a.from = tIdx(st.act.from);
    if (st.act.to) a.to = tIdx(st.act.to);
    const prevS = state;
    history.push(state);
    let act = a;
    try { state = R.apply(state, a); } catch (e) { console.error(e); state = R.passTurn(state); act = { type: 'pass' }; }
    tut.i++;
    lastMove = { p: 1, a: act };
    winShowAt = state.winner !== null && act.type !== 'pass' ? Infinity : 0;
    ui = freshUi(); render();
    if (act.type !== 'pass') animateMove(prevS, act, state);
    tutScheduleCard();
  }
  function startTutorial() {
    clearTimeout(aiTimer); aiTimer = null; paused = false; clearTimeout(winTimer); winShowAt = 0; fxCancel();
    if (!tut.active) tut.backup = { state, history, settings: Object.assign({}, settings) };
    tut.active = true; tut.i = 0; tut.page = 0; tut.phase = 'pages'; tut.cardAt = 0;
    settings = Object.assign({}, settings, { mode: 'tutorial', human: 0, board: 6 });
    useBoard(6); applyRules();
    state = R.newGame(); history = []; lastMove = lastRoll = null; ui = freshUi();
    $('newModal').hidden = true; $('overlay').dataset.dismissed = ''; $('overlay').hidden = true;
    render();
  }
  function tutExit() {
    if (!tut.active) return;
    clearTimeout(aiTimer); aiTimer = null; clearTimeout(winTimer); winShowAt = 0; fxCancel(); clearTimeout(tut.cardTimer);
    tut.active = false;
    const b = tut.backup; tut.backup = null;
    if (b) { settings = b.settings; state = b.state; history = b.history; }
    useBoard(settings.board); applyRules();
    lastMove = lastRoll = null; ui = freshUi(); $('overlay').hidden = true; $('coach').hidden = true;
    render();
  }

  // ---------- משחק חדש ----------
  let pending = null;
  function openNew() { pending = Object.assign({}, settings); renderNewModal(); $('newModal').hidden = false; }
  function renderNewModal() {
    const groups = { grpMode: 'mode', grpBoard: 'board', grpSide: 'human', grpLevel: 'level', grpLevelR: 'levelR', grpLevelB: 'levelB', grpSpeed: 'speed' };
    for (const id in groups) $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(pending[groups[id]]) === b.dataset.v));
    $('grpSideWrap').hidden = $('grpLevelWrap').hidden = pending.mode !== 'ai';
    $('grpWatchWrap').hidden = pending.mode !== 'watch';
  }
  function startNew() {
    clearTimeout(aiTimer); aiTimer = null; paused = false; clearTimeout(winTimer); winShowAt = 0;
    tut.active = false; tut.backup = null; clearTimeout(tut.cardTimer); $('coach').hidden = true;
    settings = Object.assign({}, pending); settings.human = +settings.human; settings.board = +settings.board;
    useBoard(settings.board); applyRules();
    state = R.newGame(); history = []; lastMove = lastRoll = null; ui = freshUi();
    $('newModal').hidden = true; $('overlay').dataset.dismissed = '';
    save(); render();
  }

  // ---------- תצוגה: לוח ----------
       // כמה העיגול המודגש "מרחף" מעל העיגול האפור שמתחתיו
  
  function renderBoard() {
    const svg = $('board');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    const control = R.provinceControl(state);
    const play = canAct() ? playableMap() : new Map();
    const opts = canAct() && ui.sel !== null ? optionsFrom(ui.sel) : null;
    const sheet = ui.sheet;
    const turnColor = COLORS[state.turn];
    const rolled = state.roll && state.winner === null ? state.roll.cells : [];
    let h = '';

    // נהרות
    for (let k = 1; k <= R.SIZE / 2 - 1; k++) {
      const pos = M + 2 * k * P + (k - 1) * G + G / 2;
      h += `<line class="river" style="stroke-width:${RIVER_W}" x1="${pos}" y1="0" x2="${pos}" y2="${W}"/><line class="river" style="stroke-width:${RIVER_W}" x1="0" y1="${pos}" x2="${W}" y2="${pos}"/>`;
    }
    // טבעת היעד בזמן גרירה: בשכבה שמתחת לכל העיגולים (מתחת לבסיס המרחף)
    h += `<circle id="hoverRing" class="hover-ring" r="${CR + 4}" stroke="${turnColor}" visibility="hidden"/>`;
    if (sheet && sheet.to !== undefined) {   // חלון הכמות פתוח: קו מהבסיס ליעד, מתחת לעיגולים
      h += `<line class="drag-line" x1="${cellX(sheet.from)}" y1="${cellY(sheet.from)}" x2="${cellX(sheet.to)}" y2="${cellY(sheet.to)}" stroke="${turnColor}"/>`;
    }
    // גשרים: עם רווח בין הגשר לעיגולים
    for (const key in state.bridges) {
      const [a, b] = key.split('-').map(Number);
      const ax = cellX(a), ay = cellY(a), bx = cellX(b), by = cellY(b);
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, off = (len - ((P + G - 2 * CR) * BRIDGE_FILL - BR)) / 2;
      h += `<line data-key="${key}" class="bridge" style="stroke-width:${BR}" x1="${ax + ux * off}" y1="${ay + uy * off}" x2="${bx - ux * off}" y2="${by - uy * off}" stroke="${COLORS[state.bridges[key]]}"/>`;
    }
    // משבצות: עיגול אפור קבוע, ומעליו (אם יש בסיס) עיגול הבסיס. רק בסיס מודגש מרחף בהיסט; אצל משבצת ריקה מודגשת
    // האפור מתכהה. כל הטבעות (מקווקו של ההטלה, וטבעת היעד) נמצאות בשכבה שמתחת לעיגול העליון.
    const destCell = sheet ? (sheet.to !== undefined ? sheet.to : sheet.cell) : null;
    for (let i = 0; i < R.CELLS; i++) {
      const c = state.cells[i], x = cellX(i), y = cellY(i);
      let lit = false;
      if (sheet) lit = i === sheet.from || i === sheet.cell || i === sheet.to;
      else if (opts) lit = i === ui.sel || opts.has(i);
      else lit = play.has(i);
      // גרירה: רק הבסיס שנבחר מרחף; בסיסים ביעדים נשארים במקום והמשבצת שלהם מתכהה. אחרת: בסיס מודגש מרחף
      const dragging = !sheet && !!opts, isDest = (dragging && i !== ui.sel && opts.has(i)) || (!!sheet && sheet.to !== undefined && i === sheet.to);
      const floating = lit && c.o !== null && !isDest;
      const ty = y;   // בלי ריחוף: הבסיס נשאר במקומו, והטבעת המקווקוות מסמנת מה אפשר לשחק
      const ctl = control[R.provinceOf(i)];   // פרובינציה בשליטה: העיגולים עצמם נצבעים בגוון של השחקן
      h += `<circle class="cell${ctl !== null ? ' c' + ctl : ''}${lit && (c.o === null || isDest || rolled.includes(i)) ? ' deep' : ''}" cx="${x}" cy="${y}" r="${CR}"/>`;
      if (i === destCell) {
        // טבעת היעד הרציפה מחליפה את המקווקוו (אותו קוטר בדיוק)
        h += `<circle class="ring-dest" cx="${x}" cy="${y}" r="${CR + 4}" stroke="${turnColor}"/>`;
      } else if (rolled.includes(i)) {
        // משבצת שאי אפשר לשחק בה: טבעת מקווקוו באפור
        h += `<circle id="rr${i}" class="ring-roll" cx="${x}" cy="${y}" r="${CR + 4}" stroke="${turnColor}"/>`;
      }
      // בסיס מרחף: טבעת מקווקוות אפורה מסתובבת סביב המשבצת (במקומה הקבוע) ובשכבה שמתחת לבסיס; במשבצת שהוטלה כבר יש טבעת משלה
      if (floating && !rolled.includes(i) && i !== destCell) h += `<circle class="ring-float" cx="${x}" cy="${y}" r="${CR + 4}"/>`;
      if (c.o !== null) h += `<circle data-i="${i}" class="base p${c.o}${isDest ? ' dest' : ''}" cx="${x}" cy="${ty}" r="${CR}"/><text data-i="${i}" class="cnt" style="font-size:${FS}px" x="${x}" y="${ty + 1}">${c.n}</text>`;
    }
    if (tut.active && !sheet) { const ex = canAct() ? tutExpect() : null; if (ex) h += tutGuideSvg(ex); }
    // שכבת גרירה (מתעדכנת ללא ציור מחדש של הלוח)
    h += `<g id="dragLayer"><line id="dragLine" class="drag-line" stroke="${turnColor}" visibility="hidden"/><circle id="dragDot" class="drag-dot" r="9" fill="${turnColor}" visibility="hidden"/></g>`;
    svg.innerHTML = h;
  }

  // ---------- תצוגה: שחקנים וקוביות ----------
  const dieHtml = (n, roll) => `<span class="die${roll ? ' roll' : ''}">${n}</span>`;
  function renderPanels() {
    for (const p of [0, 1]) {
      const el = $('pl' + p);
      el.style.setProperty('--c', COLORS[p]);
      el.className = 'pl' + (state.turn === p && state.winner === null ? ' active' : '');
      const tag = settings.mode === 'tutorial' ? (p === 0 ? 'You' : 'CPU') : settings.mode === 'watch' ? 'CPU' : settings.mode === 'ai' ? (p === settings.human ? 'You' : 'CPU') : '';
      const held = R.winProgress(state, p);
      let prov = '';
      for (let k = 0; k < R.WIN_PROVINCES; k++) prov += `<i class="${k < held ? 'on' : ''}"></i>`;
      // חיילים: פס אחד – מחנה (צבע מלא), על הלוח (גוון בהיר), אבודים (אפור בהיר)
      const tot = R.SOLDIERS, reserve = R.camp(state, p), lost = state.graveyard[p], onB = tot - reserve - lost;
      const w = (n) => (100 * n / tot).toFixed(2) + '%';
      let ticks = '';
      for (let i = 0; i < R.BRIDGES; i++) ticks += `<i class="${i < state.bridgesLeft[p] ? 'on' : ''}"></i>`;
      const IC = {
        prov: '<svg class="ic" viewBox="0 0 16 16"><path d="M4.5 1.5h7v4.2a3.5 3.5 0 0 1-7 0z" fill="currentColor"/><path d="M4.5 3H2.5c0 2.6 1 3.8 2.4 4M11.5 3h2c0 2.6-1 3.8-2.4 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 9.2V12M5.2 14.5h5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
        sold: '<svg class="ic" viewBox="0 0 16 16"><path d="M8 0.8l1.7 2.2v7H6.3V3z" fill="currentColor"/><rect x="3.8" y="10" width="8.4" height="1.7" rx=".8" fill="currentColor"/><rect x="7.1" y="11.7" width="1.8" height="2.4" fill="currentColor"/><circle cx="8" cy="14.7" r="1.1" fill="currentColor"/></svg>',
        brid: '<svg class="ic" viewBox="0 0 16 16"><path d="M2 13.5a6 6.5 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
        dead: '<svg class="ic" viewBox="0 0 16 16"><path d="M8 1.2v11.6M4 5h8M2 14.6h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      };
      const diceHtml = state.roll && state.winner === null && state.turn === p
        ? `<span class="dice">${dieHtml(state.roll.w, ui.rolled)}${dieHtml(state.roll.b, ui.rolled)}</span>` : '';
      el.innerHTML = `<div class="head"><span class="swatch"></span><span class="nm">${NAME[p]}</span><span class="tag">${tag}</span>${diceHtml}</div>
        <div class="grid"><div class="line" title="On board ${onB} · Lost ${lost}">${IC.sold}<span class="num" data-k="sold" data-p="${p}">${reserve}</span><div class="sbar"><i class="r" style="width:${w(reserve)}"></i><i class="b" style="width:${w(onB)}"></i></div></div>
        <div class="line">${IC.prov}<span class="num" data-k="prov" data-p="${p}">${held}</span><div class="prov${R.WIN_PROVINCES > 5 ? ' many' : ''}">${prov}</div></div>
        <div class="line">${IC.brid}<span class="num" data-k="brid" data-p="${p}">${state.bridgesLeft[p]}</span><div class="ticks">${ticks}</div></div>
        <div class="line">${IC.dead}<span class="num" data-k="dead" data-p="${p}">${lost}</span><div class="sbar"><i class="d" style="width:${w(lost)}"></i></div></div></div>`;
    }
  }


  // ---------- תצוגה: דוק ----------
  const lbl = (c) => R.cellLabel(c, state.turn);
  function sheetText(sh) {
    const n = sh.count, p = state.turn;
    if (sh.kind === 'adjust') {
      if (sh.mode === 'add') {
        const own = state.cells[sh.cell].o === p;
        return { title: `${own ? 'Reinforce' : 'Land'} ${lbl(sh.cell)}`, note: `${R.camp(state, p) - n} left in reserve` };
      }
      return { title: `Withdraw from ${lbl(sh.cell)}`, note: `${state.cells[sh.cell].n - n} stay` };
    }
    const pl = sh.plan, tg = n === 0 ? pl.bridge.tg : pl.tgt;
    const bridge = tg.cross === 'place' ? `New bridge (${state.bridgesLeft[p] - 1} left)` : tg.cross === 'replace' ? 'Replaces enemy bridge' : '';
    if (n === 0) return { title: `Bridge to ${lbl(sh.to)}`, note: bridge };
    if (pl.tgt.kind === 'attack') {
      const d = state.cells[sh.to].n, k = Math.min(n, d);
      const out = n > d ? `${n - d} take the cell` : n === d ? 'cell cleared' : `${d - n} defenders left`;
      return { title: `Attack ${lbl(sh.to)}`, note: `${n} vs ${d} · ${k} killed · ${out}` + (bridge ? ` · ${bridge}` : '') };
    }
    return { title: `${pl.type === 'transport' ? 'Transport' : 'Move'} to ${lbl(sh.to)}`, note: bridge };
  }

  function renderDock() {
    const msg = $('msg'), ctl = $('controls');
    const p = state.turn;
    const name = `<b style="color:${COLORS[p]}">${NAME[p]}</b>`;
    ctl.textContent = '';
    $('dock').classList.toggle('sheeting', !!ui.sheet);
    const addBtn = (parent, text, cls, fn) => {
      const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = text; b.onclick = fn; parent.appendChild(b); return b;
    };
    const row = () => { const r = document.createElement('div'); r.className = 'row'; ctl.appendChild(r); return r; };

    if (state.winner !== null) {
      msg.innerHTML = `<b style="color:${COLORS[state.winner]}">${NAME[state.winner]}</b> wins`;
      addBtn(row(), 'New game', 'wide', openNew);
      return;
    }
    if (isAiTurn()) {
      const doing = paused ? 'Paused' : state.roll ? 'Thinking…' : 'Rolling…';
      msg.innerHTML = `${name} · ${doing}`;
      return;
    }
    const ph = phase();
    if (ph === 'roll') {
      msg.innerHTML = '';
      if (tut.active && (tut.phase !== 'game' || Date.now() < tut.cardAt)) return;
      addBtn(row(), 'Roll dice', 'wide' + (tut.active ? ' guide' : ''), doRoll);
      return;
    }
    if (ph === 'skip') {
      msg.innerHTML = '';
      addBtn(row(), 'Pass', '', doSkip);
      return;
    }

    // ph === 'play'
    const sh = ui.sheet;
    if (sh) {
      sh.count = Math.max(sh.min, Math.min(sh.max, sh.count));
      msg.innerHTML = '';
      const box = document.createElement('div'); box.className = 'sheet' + (sh.min === sh.max ? ' fixed' : '');
      const addLabel = sh.kind === 'adjust' && state.cells[sh.cell].o === p ? 'Reinforce' : 'Land';
      const toggle = sh.modes && sh.modes.length > 1
        ? `<div class="seg mini" id="modeSeg">${sh.modes.map((m) => `<button data-m="${m}" class="${m === sh.mode ? 'on' : ''}">${m === 'add' ? addLabel : 'Withdraw'}</button>`).join('')}</div>` : '';
      const cap = !toggle && sh.kind === 'adjust' ? `<div class="cap">${sh.mode === 'add' ? addLabel : 'Withdraw'}</div>` : (tut.active && sh.kind === 'move' ? '<div class="cap" id="shCap"></div>' : '');
      box.innerHTML = `${toggle}${cap}
        <div class="srow"><div class="num" id="shNum"></div><button class="pm" id="minus" aria-label="Less">−</button><input type="range" id="rng" min="${sh.min}" max="${sh.max}" step="1" aria-label="Soldiers"><button class="pm" id="plus" aria-label="More">+</button><button class="pm ok" id="ok" aria-label="Confirm">✓</button><button class="pm x" id="cancel" aria-label="Cancel">✕</button></div>`;
      ctl.appendChild(box);
      const rng = box.querySelector('#rng');
      // מעדכנים רק את התצוגה (בלי לבנות מחדש את הרכיבים), כדי שגרירת המחוון תמשיך לעבוד
      const view = () => {
        box.querySelector('#shNum').innerHTML = `${sh.count}`;
        rng.value = sh.count;
        rng.style.setProperty('--p', (sh.max === sh.min ? 100 : ((sh.count - sh.min) / (sh.max - sh.min)) * 100) + '%');
        if (tut.active) {
          const sc = box.querySelector('#shCap');
          if (sc) sc.textContent = sh.count === 0 ? 'Bridge only' : sh.plan.type === 'transport' ? 'Transport' : sh.plan.tgt.kind === 'attack' ? 'Attack' : 'Move';
          const okb = box.querySelector('#ok');
          if (okb) okb.classList.toggle('guide', tutSheetOk(sh));
        }
      };
      const set = (v) => {
        const nv = Math.max(sh.min, Math.min(sh.max, v));
        if (nv !== sh.count) { sh.count = nv; }
        view();
      };
      box.querySelector('#minus').onclick = () => set(sh.count - 1);
      box.querySelector('#plus').onclick = () => set(sh.count + 1);
      rng.oninput = (e) => set(+e.target.value);
      const seg = box.querySelector('#modeSeg');
      if (seg) seg.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.dataset.m === sh.mode) return; setMode(sh, b.dataset.m); renderDock(); };
      view();
      box.querySelector('#cancel').onclick = () => { ui.sheet = null; render(); };
      box.querySelector('#ok').onclick = () => { if (tut.active && !tutSheetOk(sh)) { tutNudge(sh.tut ? (sh.kind === 'adjust' && sh.mode !== (sh.tut.type === 'withdraw' ? 'withdraw' : 'add') ? 'Pick the highlighted option' : `Set the amount to ${sh.tut.count}`) : 'Follow the highlighted move'); return; } commit(sh.build(sh.count)); };
      return;
    }

    msg.innerHTML = '';
    if (tut.active) return;
    addBtn(row(), 'Pass', 'soft', doPass);
  }

  function renderLog() {
    $('logBox').innerHTML = state.log.slice(-40).reverse().map((l) => `<div>${l}</div>`).join('') || '<div>No moves yet</div>';
  }

  function render() {
    fxCancel();
    renderPanels(); renderBoard(); ui.rolled = false; renderDock(); renderLog(); renderCoach();
    const watch = settings.mode === 'watch';
    $('undoBtn').textContent = watch ? (paused ? 'Resume' : 'Pause') : 'Undo';
    $('undoBtn').disabled = tut.active || (watch ? state.winner !== null : history.length === 0);
    $('speedBtn').hidden = !watch;
    $('speedBtn').textContent = 'Speed: ' + SPEED_LABEL[settings.speed];
    const o = $('overlay');
    if (state.winner !== null && !o.dataset.dismissed && Date.now() >= winShowAt) {
      const w = state.winner;
      $('winTitle').innerHTML = tut.active
        ? `<span style="color:${COLORS[0]}">You win!</span>`
        : settings.mode === 'ai'
          ? `<span style="color:${COLORS[w]}">${w === settings.human ? 'You win' : 'Computer wins'}</span>`
          : `<span style="color:${COLORS[w]}">${NAME[w]}</span> wins`;
      $('winText').hidden = !tut.active;
      $('winText').innerHTML = tut.active ? '<b>Remember</b><ul>' + TUT.recap.map((t) => `<li>${t}</li>`).join('') + '</ul>' : '';
      $('winNew').textContent = tut.active ? 'Play vs computer' : 'New game';
      o.hidden = false;
    } else o.hidden = true;
    scheduleAi();
  }

  // ---------- אינטראקציה: מגע, לחיצה וגרירה ----------
  const svg = $('board');
  let drag = null;   // { id, start, x0, y0, moved, hover, selectedNow }

  function toSvg(e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: q.x, y: q.y };
  }
  function cellAt(pos, r) {
    let best = null, bd = r;
    for (let i = 0; i < R.CELLS; i++) {
      const d = Math.hypot(pos.x - cellX(i), pos.y - cellY(i));
      if (d <= bd) { best = i; bd = d; }
    }
    return best;
  }
  let hiddenRoll = null;
  function overlay(pos, hover) {
    const line = $('dragLine'), dot = $('dragDot'), ring = $('hoverRing');
    if (!line) return;
    if (hiddenRoll) { hiddenRoll.setAttribute('visibility', 'visible'); hiddenRoll = null; }
    if (pos && hover !== null && hover !== undefined) {
      const rr = $('rr' + hover);
      if (rr) { rr.setAttribute('visibility', 'hidden'); hiddenRoll = rr; }
    }
    if (!pos) { line.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); ring.setAttribute('visibility', 'hidden'); return; }
    line.setAttribute('x1', cellX(ui.sel)); line.setAttribute('y1', cellY(ui.sel));
    line.setAttribute('x2', pos.x); line.setAttribute('y2', pos.y);
    dot.setAttribute('cx', pos.x); dot.setAttribute('cy', pos.y);
    line.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
    if (hover !== null && hover !== undefined) {
      ring.setAttribute('cx', cellX(hover)); ring.setAttribute('cy', cellY(hover)); ring.setAttribute('visibility', 'visible');
    } else ring.setAttribute('visibility', 'hidden');
  }

  // לחיצה על בסיס מודגש "מרימה" אותו ומדליקה את יעדי הגרירה. הזזה/התקפה/גשר/שינוע נעשים רק בגרירה.
  // לחיצה קצרה (בלי גרירה) פותחת הוספה או משיכה של חיילים.
  svg.addEventListener('pointerdown', (e) => {
    if (!canAct() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const pos = toSvg(e), c = cellAt(pos, CR + 12);
    drag = { id: e.pointerId, start: c, x0: pos.x, y0: pos.y, moved: false, hover: null };
    if (c === null) return;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const pl = playableMap().get(c);
    if (pl && pl.source) { ui.sel = c; render(); }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const pos = toSvg(e);
    if (!drag.moved && Math.hypot(pos.x - drag.x0, pos.y - drag.y0) > 9) drag.moved = true;
    if (!drag.moved || ui.sel === null || drag.start !== ui.sel || ui.sheet) return;
    const opts = optionsFrom(ui.sel);
    let hover = cellAt(pos, CR + 14);
    if (hover === ui.sel || (hover !== null && !opts.has(hover))) hover = null;
    if (hover !== drag.hover) { drag.hover = hover; }
    overlay(pos, hover);
  });

  function endPointer(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    overlay(null);
    const sel = ui.sel;
    ui.sel = null;
    if (cancelled || !canAct()) { if (sel !== null) render(); return; }
    if (d.moved) {                                              // גרירה
      if (sel !== null && d.start === sel && d.hover !== null) startMove(sel, d.hover);
      else if (sel !== null) render();
      return;
    }
    // לחיצה קצרה
    const c = d.start;
    if (c !== null && playableMap().has(c) && startAdjust(c)) return;
    if (sel !== null) render();
  }
  svg.addEventListener('pointerup', (e) => endPointer(e, false));
  svg.addEventListener('pointercancel', (e) => endPointer(e, true));
  svg.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- כפתורים ----------
  $('undoBtn').onclick = () => (settings.mode === 'watch' ? togglePause() : undo());
  $('speedBtn').onclick = cycleSpeed;
  $('logBtn').onclick = () => { const b = $('logBox'); b.hidden = !b.hidden; };
  const menu = (open) => { $('bar').classList.toggle('open', open); $('menuBtn').setAttribute('aria-expanded', open); };
  $('menuBtn').onclick = (e) => { e.stopPropagation(); menu(!$('bar').classList.contains('open')); };
  $('bar').addEventListener('click', (e) => { if (e.target.closest('button')) menu(false); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#bar')) menu(false); });
  $('newBtn').onclick = openNew;
  $('newCancel').onclick = () => { $('newModal').hidden = true; };
  $('newStart').onclick = startNew;
  for (const [id, key] of [['grpMode', 'mode'], ['grpBoard', 'board'], ['grpSide', 'human'], ['grpLevel', 'level'], ['grpLevelR', 'levelR'], ['grpLevelB', 'levelB'], ['grpSpeed', 'speed']]) {
    $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pending[key] = b.dataset.v; renderNewModal(); });
  }
  $('winNew').onclick = () => {
    $('overlay').hidden = true;
    if (tut.active) { pending = Object.assign({}, tut.backup ? tut.backup.settings : settings, { mode: 'ai', board: 6, human: 0 }); startNew(); } else openNew();
  };
  $('tutBtn').onclick = startTutorial;
  $('tutLink').onclick = startTutorial;
  $('coachExit').onclick = tutExit;
  window.addEventListener('resize', () => { if (tut.active) renderCoach(); });
  $('winClose').onclick = () => { $('overlay').dataset.dismissed = '1'; $('overlay').hidden = true; };

  load(); useBoard(settings.board); applyRules(); render();
  window.__province = { get state() { return state; }, get ui() { return ui; }, get settings() { return settings; }, playableMap, optionsFrom, cellX, cellY, get R() { return R; } };   // לנוחות בדיקה
})();
