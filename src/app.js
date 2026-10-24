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
  const O = window.Online;
  const COLORS = ['#34c98a', '#3a9cf5'];     // תואם ל---p0 / --p1 ב-style.css

  // ---------- גיאומטריה ----------
  // P מרחק בין משבצות, G רווח בין פרובינציות (נהר), M שוליים, CR רדיוס עיגול, LIFT גובה ריחוף, RIVER_W עובי נהר, BR עובי גשר, FS גודל מספרים
  const GEO = {
    6: { P: 64, G: 34, M: -11, CR: 21, LIFT: 10, RIVER_W: 8, BR: 8, FS: 18 },
    8: { P: 56, G: 22, M: -7, CR: 21, LIFT: 9, RIVER_W: 6, BR: 8, FS: 17 },
  };
  const DOT_R = 7;   // משבצת ריקה היא נקודה קטנה; רק בסיס הוא עיגול מלא
  const BRIDGE_FILL = 0.68;   // חלק מהרווח בין שני העיגולים שהגשר (כולל הקצוות העגולים) תופס: אותה פרופורציה בכל גודל לוח
  let P, G, M, CR, W, LIFT, RIVER_W, BR, FS;
  function useBoard(n) {
    R = window.Rules.forSize(n); AIB = window.AI.forSize(n);
    ({ P, G, M, CR, LIFT, RIVER_W, BR, FS } = GEO[n]);
    W = 2 * M + n * P + (n / 2 - 1) * G;
    const len = (P + G - 2 * CR) * BRIDGE_FILL - BR, th = 16, tw = Math.max(3.5, Math.min(4, th * BR / len));
    document.documentElement.style.setProperty('--tick-w', tw.toFixed(1) + 'px');
    document.documentElement.style.setProperty('--tick-h', th + 'px');
    document.documentElement.style.setProperty('--tick-gap', (R.BRIDGES <= 8 ? 8 : 4) + 'px');
    memo = { state: null, play: null, opts: new Map() };
  }
  let FLIP = false;   // הלוח מסתובב 180° לשחקן הכחול, כדי שיראה את עצמו למטה
  const cx = (x) => { if (FLIP) x = R.SIZE - 1 - x; return M + x * P + Math.floor(x / 2) * G + P / 2; };
  const cy = (y) => { const r = FLIP ? y : R.SIZE - 1 - y; return M + r * P + Math.floor(r / 2) * G + P / 2; };
  const cellX = (i) => cx(R.xy(i)[0]);
  const cellY = (i) => cy(R.xy(i)[1]);

  // ---------- מצב ----------
  const $ = (id) => document.getElementById(id);
  let state, history;
  let online = null, localBak = null;   // online: { id, game, seat, n, replay, ... }
  const pname = (p) => (online && online.game ? (p === 0 ? online.game.name0 : online.game.name1 || '…') : settings.mode === 'ai' && settings.name ? (p === settings.human ? settings.name : 'Computer') : NAME[p]);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // mode: ai | online | tutorial
  let settings = { mode: 'ai', human: 0, level: 'strong', levelR: 'strong', levelB: 'strong', speed: 'normal', board: 6 };
  let lastMove = null, lastRoll = null, aiTimer = null, paused = false;
  let winShowAt = 0, winTimer = null;   // חלון הניצחון מוצג רק אחרי אנימציית המהלך והבהוב הפרובינציות
  // גרסת בטא של הטוטוריאל: רק מי שפתח את האתר עם ?beta=1 (נשמר בדפדפן; ?beta=0 מכבה) מקבל את הטוטוריאל החדש. כל השאר ממשיכים לקבל את הקיים.
  const BETA_FLAG = (() => {
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('beta')) { if (q.get('beta') === '0') localStorage.removeItem('province.beta'); else localStorage.setItem('province.beta', '1'); }
      return localStorage.getItem('province.beta') === '1';
    } catch (e) { return false; }
  })();
  const TUT = window.TUTORIAL_V3 || window.TUTORIAL_NEW || window.TUTORIAL;   // V3 (שוחרר לכולם): לחיצות בלבד, חץ מצביע, כרטיסים צפים על הלוח
  const TV3 = TUT === window.TUTORIAL_V3;
  const tut = { active: false, i: 0, page: 0, phase: 'pages', backup: null, cardAt: 0, cardTimer: null, nudgeTimer: null, sub: 0, subFor: -1 };
  let ui = freshUi();
  function freshUi() { return { sel: null, sheet: null, hover: null, rolled: false }; }
  const SPEED = { slow: 2, normal: 1, fast: 0.12 };
  const SPEED_LABEL = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
  const isAiTurn = () => state.winner === null &&
    (settings.mode === 'watch' ||   // beta: computer vs computer
      (settings.mode === 'ai' && state.turn !== settings.human) ||
      (settings.mode === 'tutorial' && tut.phase === 'game' && state.turn === 1));
  const aiLevel = () => settings.level;
  const phase = () => (state.winner !== null ? 'over' : !state.roll ? 'roll' : R.hasAnyMove(state) ? 'play' : 'skip');
  // בחירת בסיס מתמשכת (נבדקה כתכונת ניסוי ופתוחה כעת לכולם); בטוטוריאל הבחירה הישנה נשארת כדי שההדרכה תישאר ממוקדת
  const BETA = true;
  const betaOn = () => BETA && (!tut.active || TV3);
  // Training (beta): theory cards + practice positions (src/training.js)
  const train = { active: false, lesson: null, phase: 'theory', page: 0, i: 0, tries: 0, results: [], ok: false, backup: null, cardAt: 0, timer: null };
  // מצב בחירת בסיס: הבסיס נשאר נבחר אחרי לחיצה, יעדי התנועה מודגשים, ואפשר ללחוץ על יעד כדי לבחור כמה חיילים להזיז
  const selMode = () => betaOn() && ui.sel !== null && !isAiTurn() && phase() === 'play' && (!online || onlineMyTurn()) && (ui.sheet === null || ui.sheet.kind === 'adjust');
  const canAct = () => !isAiTurn() && phase() === 'play' && ui.sheet === null && (!tut.active || tut.phase === 'game') && (!train.active || train.phase === 'practice') && (!online || onlineMyTurn());

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.state && (d.state.cells.length === 36 || d.state.cells.length === 64)) {
          state = d.state; history = d.history || []; settings = Object.assign(settings, d.settings || {});
          settings.board = d.state.cells.length === 64 ? 8 : 6;
          if (d.rec && d.rec.gid && Array.isArray(d.rec.events) && Array.isArray(d.rec.sigs) && d.rec.events.length === d.rec.sigs.length) aiRec = Object.assign({ sent: false }, d.rec);
          return;
        }
      }
    } catch (e) { /* ignore */ }
    state = window.Rules.forSize(settings.board).newGame(); history = [];
  }
  function afterLoad() { if (settings.mode !== 'ai') { settings.mode = 'ai'; settings.human = 0; state = window.Rules.forSize(settings.board).newGame(); history = []; } }
  // כללי גרסה 2 בכל המצבים (פרובינציה בשליטה = טריטוריה; ניצחון ב-5 פרובינציות מחוברות). המחשב אומן עליהם.
  function applyRules() { R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true; }
  function save() {
    if (tut.active || train.active || online) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state, history: history.slice(-60), settings, rec: aiRec && !aiRec.sent && !aiRec.broken ? { gid: aiRec.gid, size: aiRec.size, name: aiRec.name, nn: aiRec.nn, events: aiRec.events, sigs: aiRec.sigs } : null })); } catch (e) { /* ignore */ }
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
    if (tut.active && !TV3) {
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
    if (train.active) return trainCommit(a);
    let ns;
    if (tut.active && !tutMatches(a)) { tutNudge('Follow the highlighted move'); return false; }
    try { ns = R.apply(state, a); } catch (e) { console.error(e); return false; }
    const prev = state;
    if (tut.active) { tut.i++; tut.cardAt = Infinity; trackLesson(); }
    winShowAt = ns.winner !== null ? Infinity : 0;
    history.push(state); lastMove = { p: state.turn, a }; const actor = state.turn; state = ns;
    ui = freshUi();
    recAi('act', a, actor, state);
    if (online) emit('act', a);
    save(); render(); animateMove(prev, a, ns);
    return true;
  }
  // ---- יומן משחק נגד המחשב: נשמר לדשבורד (supabase/ai_games.sql) ----
  let aiRec = null;   // { gid, size, name, events: [{ n, actor, kind, data }], sigs: [חתימת המצב אחרי כל אירוע], nn, sent }
  const posSig = (s) => JSON.stringify([s.cells.map((c) => (c.o === null ? 0 : c.o + 1) * 100 + c.n), s.bridges, s.turn, s.roll ? s.roll.cells : null, s.winner]);
  const recOn = () => !!aiRec && !aiRec.sent && settings.mode === 'ai' && !online && !tut.active && !train.active;
  function recAi(kind, data, actor, after) {
    if (!recOn()) return;
    aiRec.events.push({ n: aiRec.events.length + 1, actor, kind, data }); aiRec.sigs.push(posSig(after));
    queueLive();
  }
  function recSync() {   // אחרי ביטול מהלך: חותכים את היומן עד למצב הנוכחי
    if (!aiRec || aiRec.sent) return;
    const k = aiRec.sigs.lastIndexOf(posSig(state));
    if (k >= 0) { aiRec.events.length = k + 1; aiRec.sigs.length = k + 1; }
    else if (history.length === 0 && state.cells.every((c) => c.o === null)) { aiRec.events.length = 0; aiRec.sigs.length = 0; }
    else { aiRec.broken = true; }
  }
  // התקדמות נשלחת לשרת תוך כדי המשחק (עד פעם ב-4 שניות), כך שמשחק שנעזב באמצע כבר קיים בשרת; שם הוא נחשב "נטוש" אחרי 30 דקות בלי מהלך
  function queueLive() {
    if (!aiRec || aiRec.lt) return;
    aiRec.lt = setTimeout(() => { if (aiRec) { aiRec.lt = null; if (!aiRec.sent && state.winner === null) sendAiLog('live'); } }, 4000);
  }
  function sendAiLog(ended) {
    if (!aiRec || aiRec.sent || aiRec.broken || aiRec.events.length < 4) return;
    aiRec.sent = ended === 'win';   // משחק שנגמר נשלח פעם אחת; 'live' ו'נטוש' יכולים להידרס אם ממשיכים
    O.logAiGame({ gid: aiRec.gid, size: aiRec.size, name: aiRec.name, events: aiRec.events, winner: ended === 'win' ? state.winner : null, ended, nn: aiRec.nn });
  }
  function doRoll() {
    const sc = tut.active ? tutStepNow() : null;
    const fd = window.__forceDice && window.__forceDice.length ? window.__forceDice.shift() : null;   // dev hook for recording demo footage; never set in normal play
    state = sc ? R.roll(state, sc.dice[0], sc.dice[1]) : fd ? R.roll(state, fd[0], fd[1]) : R.roll(state, 1 + Math.floor(Math.random() * R.SIZE), 1 + Math.floor(Math.random() * R.SIZE));
    lastRoll = { w: state.roll.w, b: state.roll.b, p: state.turn }; lastMove = null;
    ui = freshUi(); ui.rolled = true;
    recAi('roll', { w: state.roll.w, b: state.roll.b }, state.turn, state);
    if (online) emit('roll', { w: state.roll.w, b: state.roll.b });
    save(); render();
  }
  function passOrSkip(fn) {
    const isPass = fn === R.passTurn;
    const actor = state.turn; history.push(state); lastMove = null; state = fn(state); ui = freshUi();
    recAi('skip', isPass ? { pass: true } : {}, actor, state);
    if (online) emit('skip', isPass ? { pass: true } : {});
    if (tut.active) { tut.i++; tut.cardAt = Infinity; trackLesson(); }
    save(); render();
  }
  const doSkip = () => passOrSkip(R.skipTurn);
  const doPass = () => passOrSkip(R.passTurn);

  function undo() {
    if (!history.length) return;
    clearTimeout(aiTimer); aiTimer = null; clearTimeout(winTimer); winShowAt = 0;
    state = history.pop();
    // נגד המחשב: חוזרים עד לתור האדם (ביטול מהלך המחשב יחד עם מהלך האדם)
    while (isAiTurn() && history.length) state = history.pop();
    lastMove = null; ui = freshUi(); recSync(); save(); render();
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
      const rv = (j) => M + 2 * j * P + (j - 1) * G + G / 2, edges = [0, rv(1), rv(2), W];
      const tintLight = ['#e7f9f1', '#e7f3fe'][wp];
      for (const k of group) {
        const pxk = FLIP ? R.PR - 1 - (k % R.PR) : k % R.PR, pyk = Math.floor(k / R.PR), top = FLIP ? pyk : R.PR - 1 - pyk;   // שורה מלמעלה
        const r0 = document.createElementNS(NS, 'rect');
        r0.setAttribute('x', edges[pxk]); r0.setAttribute('y', edges[top]);
        r0.setAttribute('width', edges[pxk + 1] - edges[pxk]); r0.setAttribute('height', edges[top + 1] - edges[top]);
        r0.setAttribute('fill', tintLight); r0.setAttribute('opacity', 0);
        wg.appendChild(r0);
        try { r0.animate([{ opacity: 0 }, { opacity: 1, offset: .5 }, { opacity: 0 }], { duration: PULSE, iterations: 3, delay: startMs, easing: 'ease-in-out' }); } catch (e) { /* ignore */ }
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
  function togglePause() {   // beta watch mode
    paused = !paused;
    if (paused) { clearTimeout(aiTimer); aiTimer = null; render(); } else { render(); scheduleAi(); }
  }
  function cycleSpeed() {
    const order = ['slow', 'normal', 'fast'];
    settings.speed = order[(order.indexOf(settings.speed) + 1) % order.length];
    render();
  }
  function scheduleAi() {
    if (aiTimer || paused || vnetPending || !isAiTurn()) return;
    aiTimer = setTimeout(aiStep, Math.max((state.roll ? 1000 : 700) * SPEED[settings.speed], fxUntil - Date.now() + 250));
  }
  // ---- learned (neural network) computer opponent, computed in a Web Worker (falls back to the old AI if anything fails) ----
  let vnetWorker = null, vnetTok = 0, vnetPending = false;
  // watch mode: 'nn' = new AI on both sides, 'nnold' = new AI (Green) against the old AI (Blue)
  const VNET_ON = (p) => !!window.Worker && (settings.board === 6 || settings.board === 8) && !online && !tut.active && (settings.mode !== 'watch' || settings.watch !== 'nnold' || p === 0);
  function vnetAsk(snap, apply) {
    if (!VNET_ON(snap.turn)) return false;
    try {
      if (!vnetWorker) {
        vnetWorker = new Worker('src/vnet_worker.js');
        vnetWorker.onerror = (e) => { console.error('vnet worker', e); vnetWorker = null; };
      }
      const tok = ++vnetTok, w = vnetWorker; vnetPending = true;
      const fallback = (why) => {
        vnetPending = false;
        if (tok !== vnetTok || state !== snap) { if (!paused) scheduleAi(); return; }
        console.warn('vnet fallback:', why); vnetTok++;
        let a = { type: 'pass' }; try { a = AIB.chooseAction(snap, aiLevel()); } catch (e) { console.error(e); }
        apply(a);
      };
      const timer = setTimeout(() => fallback('timeout'), 40000);
      w.onmessage = (e) => {
        if (e.data.id !== tok) return;
        clearTimeout(timer); vnetPending = false;
        if (tok !== vnetTok || state !== snap) { if (!paused) scheduleAi(); return; }   // undo / new game while thinking: drop the answer
        if (e.data.error) { fallback(e.data.error); return; }
        vnetTok++; window.__vnetMoves = (window.__vnetMoves || 0) + 1; if (aiRec) aiRec.nn = true; apply(e.data.act);
      };
      w.postMessage({ id: tok, size: settings.board, state: snap });
      return true;
    } catch (e) { console.error(e); return false; }
  }
  function aiStep() {
    aiTimer = null;
    if (window.__demoMode) return;   // dev hook: demo footage is driven by __demoRoll/__demoAct
    if (!isAiTurn()) return;
    if (tut.active) { tutAiStep(); return; }
    if (!state.roll) { doRoll(); return; }
    if (window.__scriptAi && window.__scriptAi.length) { aiApply(window.__scriptAi.shift()); return; }   // dev hook for recording demo footage
    let a = { type: 'pass' };
    if (R.hasAnyMove(state)) {
      if (vnetAsk(state, aiApply)) return;   // beta: neural-network computer (worker); the move is applied when it answers
      try { a = AIB.chooseAction(state, aiLevel()); } catch (e) { console.error(e); }
    }
    aiApply(a);
  }
  window.__demoRoll = (w, b) => { state = R.roll(state, w, b); render(); };   // dev hooks for recording a real game's moves with the real animations
  window.__demoAct = (a) => aiApply(a);
  function aiApply(a) {
    const p = state.turn;
    const prevS = state;
    history.push(state);
    if (!R.hasAnyMove(state)) state = R.skipTurn(state);
    else if (a.type === 'pass') state = R.passTurn(state);
    else {
      try { state = R.apply(state, a); } catch (e) { console.error(e); state = R.passTurn(state); a = { type: 'pass' }; }
    }
    lastMove = a.type === 'pass' ? null : { p, a };
    winShowAt = state.winner !== null && a.type !== 'pass' ? Infinity : 0;
    ui = freshUi();
    if (!R.hasAnyMove(prevS)) recAi('skip', {}, p, state); else if (a.type === 'pass') recAi('skip', { pass: true }, p, state); else recAi('act', a, p, state);
    save(); render();
    if (a.type !== 'pass') animateMove(prevS, a, state);
  }



  // ---------- אימון (בטא): כרטיסי תיאוריה + תרגול ממצבי לוח נתונים (src/training.js) ----------
  const TRAIN_KEY = 'province.train';
  const trainProgress = () => { try { return JSON.parse(localStorage.getItem(TRAIN_KEY) || '{}'); } catch (e) { return {}; } };
  const trainPuzzle = () => (train.lesson ? train.lesson.puzzles[train.i] : null);
  const trainStartState = () => R.clone(window.TRAINING.position(window.Rules, trainPuzzle().spec));
  function openTrainMenu() {
    const prog = trainProgress(), box = $('trainList'); box.textContent = '';
    for (const g of window.TRAINING.groups) {
      const h = document.createElement('div'); h.className = 'tr-group'; h.textContent = g.title; box.appendChild(h);
      for (const l of g.lessons) {
        const ready = !!window.TRAINING.lessons[l.id], done = prog[l.id] && prog[l.id].done;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tile tr-lesson' + (ready ? '' : ' soon');
        b.innerHTML = `<span>${l.name}</span><em>${ready ? (done ? '✓' : '') : 'Soon'}</em>`;
        if (ready) b.onclick = () => trainStart(l.id); else b.disabled = true;
        box.appendChild(b);
      }
    }
    $('trainModal').hidden = false;
  }
  function trainStart(id) {
    const L = window.TRAINING.lessons[id]; if (!L) return;
    $('trainModal').hidden = true; $('startModal').hidden = true; closeLobby();
    if (tut.active) tutExit();
    clearTimeout(aiTimer); aiTimer = null; paused = false; clearTimeout(winTimer); winShowAt = 0; fxCancel();
    if (!train.active) train.backup = { state, history, settings: Object.assign({}, settings) };
    Object.assign(train, { active: true, lesson: L, phase: 'theory', page: 0, i: 0, tries: 0, results: [], ok: false, cardAt: 0 });
    settings = Object.assign({}, settings, { mode: 'train', human: 0, board: 6 });
    useBoard(6); applyRules();
    train.i = 0; state = trainStartState(); state.roll = null;   // theory cards are shown over the first position
    history = []; lastMove = lastRoll = null; ui = freshUi();
    $('overlay').dataset.dismissed = ''; $('overlay').hidden = true;
    O.track('train_start', { lesson: id });
    render();
  }
  function trainExit(toMenu) {
    if (!train.active) return;
    if (train.phase !== 'done') O.track('train_exit', { lesson: train.lesson.id, at: train.phase === 'theory' ? 0 : train.i + 1 });
    clearTimeout(train.timer); fxCancel();
    train.active = false;
    const b = train.backup; train.backup = null;
    if (b) { settings = b.settings; state = b.state; history = b.history; }
    useBoard(settings.board); applyRules();
    lastMove = lastRoll = null; ui = freshUi(); $('overlay').hidden = true; $('coach').hidden = true;
    render();
    if (toMenu) openTrainMenu();
  }
  function trainLoad(i) {
    train.i = i; train.tries = 0; train.phase = 'practice'; train.ok = false;
    state = trainStartState(); history = []; lastMove = null; ui = freshUi(); fxCancel();
    render();
  }
  function trainCommit(a) {   // the player made a move in a practice position
    const P = trainPuzzle(); let ns;
    try { ns = R.apply(state, a); } catch (e) { console.error(e); return false; }
    const before = state, ok = !!P.accept(R, before, a, ns);
    train.ctx = { before, a, after: ns };
    train.tries++; train.ok = ok; train.phase = 'feedback';
    if (ok) train.results[train.i] = train.tries === 1 ? 'first' : 'second';
    O.track('train_puzzle', { lesson: train.lesson.id, i: train.i + 1, ok, tries: train.tries });
    history.push(state); lastMove = { p: 0, a }; state = ns; ui = freshUi(); winShowAt = 0;
    train.cardAt = Date.now() + 99999;
    render(); animateMove(before, a, ns);
    clearTimeout(train.timer);
    train.cardAt = Date.now() + Math.max(0, fxUntil - Date.now()) + 500;
    train.timer = setTimeout(() => { if (train.active) render(); }, Math.max(0, fxUntil - Date.now()) + 530);
    return true;
  }
  function trainShowSolution() {
    const P = trainPuzzle();
    state = trainStartState(); history = []; lastMove = null; ui = freshUi(); fxCancel();
    train.phase = 'solution'; train.results[train.i] = 'shown'; train.cardAt = Date.now() + 99999;
    render();
    const before = state; let ns;
    try { ns = R.apply(state, P.solution); } catch (e) { console.error(e); train.cardAt = 0; render(); return; }
    clearTimeout(train.timer);
    train.timer = setTimeout(() => {
      if (!train.active) return;
      history.push(state); lastMove = { p: 0, a: P.solution }; state = ns; ui = freshUi();
      render(); animateMove(before, P.solution, ns);
      train.cardAt = Date.now() + Math.max(0, fxUntil - Date.now()) + 400;
      train.timer = setTimeout(() => { if (train.active) render(); }, Math.max(0, fxUntil - Date.now()) + 430);
    }, 500);
  }
  function trainNext() {
    if (train.i + 1 < train.lesson.puzzles.length) { trainLoad(train.i + 1); return; }
    train.phase = 'done';
    const first = train.results.filter((r) => r === 'first').length, prog = trainProgress();
    prog[train.lesson.id] = { done: true, best: Math.max(first, (prog[train.lesson.id] && prog[train.lesson.id].best) || 0) };
    try { localStorage.setItem(TRAIN_KEY, JSON.stringify(prog)); } catch (e) { /* ignore */ }
    O.track('train_done', { lesson: train.lesson.id, score: first });
    render();
  }
  function renderCoachTrain() {
    const el = $('coach');
    if (!train.active) { el.hidden = true; return; }
    const L = train.lesson, P = train.phase === 'theory' || train.phase === 'done' ? null : trainPuzzle();
    let title = '', body = '', btns = [], cells = [];
    if (train.phase === 'theory') {
      const pg = L.theory[train.page];
      title = pg.title; body = pg.body;
      btns = [[train.page < L.theory.length - 1 ? 'Next' : "Let's practice", () => { if (train.page < L.theory.length - 1) train.page++; else trainLoad(0); render(); }]];
    } else if (train.phase === 'practice') {
      title = P.prompt; body = P.info ? P.info(R, state) : '';
      for (const c of state.roll.cells) cells.push({ i: c, w: 10 });
    } else if (Date.now() < train.cardAt) { el.hidden = true; return; }
    else if (train.phase === 'feedback' && train.ok) {
      title = 'Correct'; body = typeof P.good === 'function' ? P.good(R, train.ctx.before, train.ctx.a, train.ctx.after) : P.good; btns = [['Next', trainNext]];
    } else if (train.phase === 'feedback') {
      title = 'Not quite';
      const hint = typeof P.hint === 'function' ? P.hint(R, train.ctx.before, train.ctx.a, train.ctx.after) : P.hint;
      if (train.tries < 2) { body = hint; btns = [['Try again', () => { train.phase = 'practice'; trainLoad(train.i); train.tries = 1; render(); }]]; }
      else { body = hint; btns = [['Show solution', trainShowSolution]]; }
    } else if (train.phase === 'solution') {
      title = 'Solution'; body = P.shown; btns = [['Next', trainNext]];
    } else if (train.phase === 'done') {
      const first = train.results.filter((r) => r === 'first').length, n = L.puzzles.length;
      title = 'Lesson complete';
      body = `${L.recap}<div class="tr-score">${first} of ${n} on the first try</div>`;
      btns = [['Back to lessons', () => trainExit(true)]];
    }
    el.classList.add('v3');
    $('coachStep').textContent = '';
    $('coachTitle').textContent = title;
    $('coachBody').innerHTML = body + (btns.length ? `<div class="coach-next">${btns.map((b, k) => `<button class="btn" data-k="${k}" type="button">${b[0]}</button>`).join('')}</div>` : '');
    $('coachFoot').innerHTML = '';
    $('coachNudge').textContent = '';
    $('coachBody').querySelectorAll('.coach-next .btn').forEach((b) => { b.onclick = () => btns[+b.dataset.k][1](); });
    el.hidden = false;
    placeCoach(el, cells);
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
  function tutArrowSvg(ex) {   // חץ קופץ שמצביע על המשבצת שצריך ללחוץ עליה עכשיו
    if (ex.type === 'skip') return '';
    const target = ex.tap ? ex.cell : (ui.sel === ex.from ? ex.to : ex.from);
    if (target === undefined || target === null) return '';
    const x = cellX(target), y = cellY(target), up = y > CR * 4;   // בשורה העליונה החץ מצביע מלמטה
    const sgn = up ? -1 : 1;
    const halo = `<circle class="guide-halo" cx="${x}" cy="${y}" r="${CR + 8}"/>`;
    return halo + `<g transform="translate(${x} ${y})"><g transform="scale(1 ${-sgn})"><g class="tut-arrow"><path d="M0 ${-(CR + 7)} l-12 -17 h7.5 v-13 h9 v13 h7.5 z" /></g></g></g>`;
  }
  function tutGuideSvg(ex) {
    if (TV3) return tutArrowSvg(ex);
    const halo = (i, cls, n) => {
      const x = cellX(i), y = cellY(i);
      return `<circle class="${cls}" cx="${x}" cy="${y}" r="${CR + 8}"/>` + (n ? `<text class="guide-n" x="${x}" y="${y - CR - 14}">${n}</text>` : '');
    };
    if (ex.tap) return halo(ex.cell, 'guide-halo', '');
    const sx = cellX(ex.from), sy = cellY(ex.from), tx = cellX(ex.to), ty = cellY(ex.to), d = Math.hypot(tx - sx, ty - sy) || 1;
    const ux = (tx - sx) / d, uy = (ty - sy) / d, pad = CR + 12;
    const line = d > 2 * pad + 6 ? `<line class="guide-line" x1="${sx + ux * pad}" y1="${sy + uy * pad}" x2="${tx - ux * pad}" y2="${ty - uy * pad}"/>` : '';
    return line + halo(ex.from, 'guide-halo', '') + halo(ex.to, 'guide-ring', '');
  }
  function tutTap(e, cancelled) {   // בטוטוריאל V3: רק לחיצות. בסיס, ואז יעד, בדיוק כמו במשחק
    if (cancelled || !canAct()) return;
    const ex = tutExpect();
    if (!ex) return;
    const c = cellAt(toSvg(e), CR + 12);
    if (c === null) return;
    const wrong = () => tutNudge(ex.type === 'skip' ? 'Tap Pass' : 'Tap where the arrow points');
    if (ex.tap) { if (c === ex.cell) startAdjust(c); else wrong(); return; }
    if (ui.sel === null) { if (c === ex.from) { ui.sel = c; render(); } else wrong(); return; }
    if (c === ex.to) { ui.sel = null; startMove(ex.from, ex.to); return; }
    if (c === ui.sel) { ui.sel = null; render(); return; }
    wrong();
  }
  function tutNudge(msg) {
    const el = $('coachNudge');
    el.textContent = msg;
    const c = $('coach');
    c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
    clearTimeout(tut.nudgeTimer);
    tut.nudgeTimer = setTimeout(() => { el.textContent = ''; }, 2800);
  }
  const tutIntroList = (st) => (st ? [].concat(st.intro) : []);
  const tutIntroPending = () => {
    if (!TV3 || !tut.active || tut.phase !== 'game') return false;
    const st = tutStepNow();
    if (!st || st.who !== 0 || state.roll) return false;
    if (tut.subFor !== tut.i) { tut.subFor = tut.i; tut.sub = 0; }
    return tut.sub < tutIntroList(st).length - 1;
  };
  function tutHighlightsMeter() {
    if (!TV3 || !tut.active || state.winner !== null) return false;
    if (tut.phase === 'pages') return !!(TUT.pages[tut.page] && TUT.pages[tut.page].hl);
    const st = tutStepNow();
    return !!(st && st.who === 0 && st.hl && state.turn === 0 && Date.now() >= tut.cardAt);
  }
  // הכרטיס צף על הלוח: למעלה או למטה, איפה שפחות מכסה את המשבצות שמעורבות במהלך (cells: [{ i, w }])
  function placeCoach(el, cells) {
    const bb = $('board').getBoundingClientRect(), sc = bb.width / W;
    const cw = Math.min(bb.width - 12, 460);
    el.style.left = (bb.left + (bb.width - cw) / 2) + 'px'; el.style.width = cw + 'px';
    el.style.top = '0px'; el.style.minHeight = ''; el.style.maxHeight = '';
    const h = el.offsetHeight, pad = 8;
    const score = (t) => cells.reduce((acc, c) => { const y = bb.top + cellY(c.i) * sc, up = cellY(c.i) > CR * 4, lo = y - (up ? CR + 36 : CR + 4) * sc, hi = y + (up ? CR + 4 : CR + 36) * sc; return acc + (hi > t && lo < t + h ? c.w : 0); }, 0);
    let best = bb.top + pad, bs = Infinity;
    for (let t = bb.top + pad; t <= bb.bottom - pad - h + 0.5; t += 6) { const v = score(t); if (v < bs - 0.01) { bs = v; best = t; } }
    el.style.top = best + 'px';
  }
  function renderCoachV3() {
    const el = $('coach');
    if (!tut.active || state.winner !== null) { el.hidden = true; return; }
    let title, body, next = '', cells = [];
    if (tut.phase === 'pages') {
      const pg = TUT.pages[tut.page];
      title = pg.title; body = pg.body;
      next = tut.page < TUT.pages.length - 1 ? 'Next' : "Let's play";
    } else {
      const st = tutStepNow();
      if (!st || st.who !== 0 || state.turn !== 0 || Date.now() < tut.cardAt) { el.hidden = true; return; }
      if (tut.subFor !== tut.i) { tut.subFor = tut.i; tut.sub = 0; }
      title = st.title;
      if (state.roll) body = st.instr;
      else { const ip = tutIntroList(st); body = ip[Math.min(tut.sub, ip.length - 1)]; if (tut.sub < ip.length - 1) next = 'Next'; }
      const add = (c, w) => { if (c) cells.push({ i: tIdx(c), w }); };
      add(st.act.from, 10); add(st.act.to, 10); add(st.act.R, 4);
      cells.push({ i: R.idx(st.dice[0] - 1, st.dice[1] - 1), w: 4 }, { i: R.idx(R.SIZE - st.dice[0], R.SIZE - st.dice[1]), w: 4 });
    }
    el.classList.add('v3');
    $('coachStep').textContent = '';
    $('coachTitle').textContent = title;
    $('coachBody').innerHTML = body + (next ? `<div class="coach-next"><button class="btn" id="coachNext" type="button">${next}</button></div>` : '');
    $('coachFoot').innerHTML = '';
    const nb = $('coachNext');
    if (nb) nb.onclick = () => {
      if (tut.phase === 'pages') { if (tut.page < TUT.pages.length - 1) tut.page++; else { tut.phase = 'game'; tut.i = 0; tut.cardAt = 0; } }
      else tut.sub++;
      render();
    };
    el.hidden = false;
    placeCoach(el, cells);
  }
  function renderCoach() {
    if (train.active) { renderCoachTrain(); return; }
    if (TV3) { renderCoachV3(); return; }
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
    // אותם שוליים כמו שאר המסך (5% מהצדדים ומלמעלה), והכרטיס מסתיים לפני כפתור התפריט
    const mb = $('menuBtn').getBoundingClientRect(), top = Math.max(innerWidth * 0.05, pl.top - 8);
    const wide = getComputedStyle($('app')).display === 'grid';   // פריסת מחשב: הכרטיס על פני העמודה הימנית, עד הכפתורים
    el.style.left = pl.left + 'px'; el.style.width = Math.max(160, Math.min(pl.width, mb.left - 8 - pl.left)) + 'px';
    if (wide) {   // מחשב: הכרטיס יושב מתחת לפאנל היריב (לא מכסה אותו), עד הכפתורים
      const below = pl.bottom + 14;
      el.style.top = below + 'px'; el.style.minHeight = '';
      el.style.maxHeight = Math.max(120, $('dock').getBoundingClientRect().top - 14 - below) + 'px';
    } else {
      el.style.top = top + 'px';
      el.style.minHeight = (pl.height + 14) + 'px';
      el.style.maxHeight = Math.max(pl.height + 14, bw.top - 2 - top) + 'px';
    }
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
  const trackLesson = () => O.track('tutorial_lesson_done', { n: TUT.steps.slice(0, tut.i).filter((x) => x.who === 0).length });
  function startTutorial() {
    if (train.active) trainExit(false);
    O.track('tutorial_start', { beta: BETA_FLAG }); tut.doneTracked = false;
    try { localStorage.setItem('province.tutprompt', '1'); } catch (e) { /* ignore */ }
    hideTutPrompt();
    clearTimeout(aiTimer); aiTimer = null; paused = false; clearTimeout(winTimer); winShowAt = 0; fxCancel();
    if (!tut.active) tut.backup = { state, history, settings: Object.assign({}, settings) };
    tut.active = true; tut.i = 0; tut.page = 0; tut.phase = 'pages'; tut.cardAt = 0;
    settings = Object.assign({}, settings, { mode: 'tutorial', human: 0, board: 6 });
    useBoard(6); applyRules();
    state = R.newGame(); history = []; lastMove = lastRoll = null; ui = freshUi();
    $('overlay').dataset.dismissed = ''; $('overlay').hidden = true; closeLobby();
    render();
  }
  function tutExit() {
    if (!tut.active) return;
    if (state.winner === null) O.track('tutorial_exit', { at: TUT.steps.slice(0, tut.i).filter((x) => x.who === 0).length });
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
  // נגד המחשב: תמיד משחקים ירוק (ראשונים) ומול רמה אחת; בוחרים רק גודל לוח
  let startMode = 'online';
  function openNew() { startMode = 'ai'; $('lbCont').hidden = !(settings.mode === 'ai' && state.winner === null && history.length > 0); $('startMain').hidden = true; $('startSize').hidden = false; $('startModal').hidden = false; }
  let gameSeq = 0, aiEndSeq = 0;   // כל משחק מול המחשב נספר פעם אחת בהתחלה ופעם בסיומו
  function startNew() {
    clearTimeout(aiTimer); aiTimer = null; paused = false; clearTimeout(winTimer); winShowAt = 0;
    tut.active = false; tut.backup = null; clearTimeout(tut.cardTimer); $('coach').hidden = true;
    settings = Object.assign({}, pending, { mode: pending.mode === 'watch' ? 'watch' : 'ai' }); closeLobby(); settings.human = +settings.human; settings.board = +settings.board;
    useBoard(settings.board); applyRules();
    state = R.newGame(); history = []; lastMove = lastRoll = null; ui = freshUi();
    $('overlay').dataset.dismissed = '';
    if (aiRec && aiRec.lt) clearTimeout(aiRec.lt);
    if (aiRec && !aiRec.sent) sendAiLog('abandoned');
    aiRec = settings.mode === 'ai' ? { gid: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null, size: settings.board, name: settings.name || null, events: [], sigs: [], nn: false, sent: false } : null;
    if (aiRec && !aiRec.gid) aiRec = null;
    gameSeq++; if (settings.mode === 'ai') O.track('ai_start', { board: settings.board, nn: !!window.Worker });
    save(); render();
  }

  // ---------- תצוגה: לוח ----------
       // כמה העיגול המודגש "מרחף" מעל העיגול האפור שמתחתיו
  
  function renderBoard() {
    const svg = $('board');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    const control = R.provinceControl(state);
    const play = canAct() ? playableMap() : new Map();
    const opts = (canAct() || selMode()) && ui.sel !== null ? optionsFrom(ui.sel) : null;
    const sheet = ui.sheet;
    const turnColor = COLORS[state.turn];
    const rolled = state.roll && state.winner === null ? state.roll.cells : [];
    // בזמן ביצוע מהלך (בחירת בסיס / חלון כמות) נשארים רק הסימונים של המשבצות המעורבות
    const involved = opts ? new Set([ui.sel, ...opts.keys()]) : sheet ? new Set([sheet.from, sheet.cell, sheet.to]) : null;
    let h = '';

    // נהרות
    for (let k = 1; k <= R.SIZE / 2 - 1; k++) {
      const pos = M + 2 * k * P + (k - 1) * G + G / 2;
      h += `<line class="river" style="stroke-width:${RIVER_W}" x1="${pos}" y1="0" x2="${pos}" y2="${W}"/><line class="river" style="stroke-width:${RIVER_W}" x1="0" y1="${pos}" x2="${W}" y2="${pos}"/>`;
    }
    if (tut.active && tut.phase === 'game' && tut.i < (TUT !== window.TUTORIAL ? 1 : 5)) {   // הקוביות הן קואורדינטות: מספרי העמודות והשורות בשוליים, לכל שחקן מהצד שלו (אצל היריב הספירה הפוכה)
      for (let k = 0; k < R.SIZE; k++) {
        h += `<text class="axis a0" x="${cx(k)}" y="${cy(0) + CR + 16}">${k + 1}</text>`;
        h += `<text class="axis a0" x="${cx(0) - CR - 10}" y="${cy(k) + 1}">${k + 1}</text>`;
        { const tx = cx(k), ty = cy(R.SIZE - 1) - CR - 15; h += `<text class="axis a1" x="${tx}" y="${ty}" transform="rotate(180 ${tx} ${ty})">${R.SIZE - k}</text>`; }
        { const tx = cx(R.SIZE - 1) + CR + 10, ty = cy(k) + 1; h += `<text class="axis a1" x="${tx}" y="${ty}" transform="rotate(180 ${tx} ${ty})">${R.SIZE - k}</text>`; }
      }
    }
    // משבצת שהוטלה וניתן לשחק בה: מילוי בהיר בצבע השחקן, בשכבה שמתחת לכל הנקודות; נשאר גם בזמן גרירה ובחירת כמות. אחרת העיגול נשאר חלול
    for (const Rc of rolled) {
      if ((!involved || involved.has(Rc)) && R.actionTypes(state, Rc).length > 0 && !(betaOn() && opts && Rc !== ui.sel && opts.has(Rc))) h += `<circle class="roll-fill" cx="${cellX(Rc)}" cy="${cellY(Rc)}" r="${CR + 4}" fill="${state.turn ? 'rgba(58,156,245,.16)' : 'rgba(52,201,138,.2)'}"/>`;
    }
    if (betaOn() && sheet && sheet.kind === 'move' && sheet.to !== undefined) {   // יעד שנבחר: המעגל מתמלא
      h += `<circle class="roll-fill" cx="${cellX(sheet.to)}" cy="${cellY(sheet.to)}" r="${CR + 4}" fill="${state.turn ? 'rgba(58,156,245,.3)' : 'rgba(52,201,138,.38)'}"/>`;
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
      if (opts) lit = i === ui.sel || opts.has(i);
      else if (sheet) lit = i === sheet.from || i === sheet.cell || i === sheet.to;
      else lit = play.has(i);
      // גרירה: רק הבסיס שנבחר מרחף; בסיסים ביעדים נשארים במקום והמשבצת שלהם מתכהה. אחרת: בסיס מודגש מרחף
      const dragging = !!opts, isDest = (dragging && i !== ui.sel && opts.has(i)) || (!opts && !!sheet && sheet.to !== undefined && i === sheet.to);
      const floating = lit && c.o !== null && !isDest;
      const ty = y;   // בלי ריחוף: הבסיס נשאר במקומו, והטבעת המקווקוות מסמנת מה אפשר לשחק
      const ctl = control[R.provinceOf(i)];   // פרובינציה בשליטה: העיגולים עצמם נצבעים בגוון של השחקן
      const cellR = DOT_R;   // גם מתחת לבסיס רק נקודה: כשהבסיס מוסתר באנימציה לא נחשף עיגול ריק
      h += `<circle class="cell${ctl !== null ? ' c' + ctl : ''}${lit && (c.o === null || isDest || rolled.includes(i)) ? ' deep' : ''}" cx="${x}" cy="${y}" r="${cellR}"/>`;
      const selBase = betaOn() && i === ui.sel;   // הבסיס שנבחר שומר על הטבעת האפורה המקווקוות כל הזמן
      if (!selBase && (i === destCell || (betaOn() && opts && i !== ui.sel && opts.has(i)))) {
        // טבעת היעד הרציפה מחליפה את המקווקוו (אותו קוטר בדיוק)
        h += `<circle class="ring-dest" cx="${x}" cy="${y}" r="${CR + 4}" stroke="${turnColor}"/>`;
      } else if (rolled.includes(i) && (!involved || involved.has(i))) {
        // משבצת שאי אפשר לשחק בה: טבעת מקווקוו באפור
        h += `<circle id="rr${i}" class="ring-roll" cx="${x}" cy="${y}" r="${CR + 4}" stroke="${turnColor}"/>`;
      }
      // בסיס מרחף: טבעת מקווקוות אפורה מסתובבת סביב המשבצת (במקומה הקבוע) ובשכבה שמתחת לבסיס; במשבצת שהוטלה כבר יש טבעת משלה
      if (selBase ? (c.o !== null && !rolled.includes(i)) : (floating && !rolled.includes(i) && i !== destCell)) h += `<circle class="ring-float" cx="${x}" cy="${y}" r="${CR + 4}"/>`;
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
      el.className = 'pl' + (state.turn === p && state.winner === null ? ' active' : '') + (p === 0 && tutHighlightsMeter() ? ' hlprov' : '');
      const tag = settings.mode === 'train' ? (p === 0 ? 'You' : '') : settings.mode === 'watch' ? (settings.watch === 'nnold' ? (p === 0 ? 'NEW AI' : 'OLD AI') : 'AI') : settings.mode === 'tutorial' ? (p === 0 ? 'You' : 'CPU') : settings.mode === 'online' ? (online && p === online.seat ? 'You' : '') : settings.mode === 'ai' ? (p === settings.human ? 'You' : 'CPU') : '';
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
      el.innerHTML = `<div class="head"><span class="swatch"></span><span class="nm">${esc(pname(p))}</span><span class="tag">${tag}</span>${diceHtml}</div>
        <div class="grid"><div class="line" title="On board ${onB} · Lost ${lost}">${IC.sold}<span class="num" data-k="sold" data-p="${p}">${reserve}</span><div class="sbar"><i class="r" style="width:${w(reserve)}"></i><i class="b" style="width:${w(onB)}"></i></div></div>
        <div class="line provline">${IC.prov}<span class="num" data-k="prov" data-p="${p}">${held}</span><div class="prov${R.WIN_PROVINCES > 5 ? ' many' : ''}">${prov}</div></div>
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
    const name = `<b style="color:${COLORS[p]}">${esc(pname(p))}</b>`;
    ctl.textContent = '';
    $('dock').classList.toggle('sheeting', !!ui.sheet);
    const addBtn = (parent, text, cls, fn) => {
      const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = text; b.onclick = fn; parent.appendChild(b); return b;
    };
    const row = () => { const r = document.createElement('div'); r.className = 'row'; ctl.appendChild(r); return r; };

    if (train.active && train.phase !== 'practice') { msg.innerHTML = ''; return; }
    if (online && renderOnlineDock(msg, addBtn, row)) return;
    if (state.winner !== null && tut.active) { msg.innerHTML = ''; return; }   // בטוטוריאל: בלי כפתור New game מתחת ללוח; ממשיכים דרך חלון הניצחון
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
      if (tut.active && (tut.phase !== 'game' || Date.now() < tut.cardAt || tutIntroPending())) return;
      addBtn(row(), 'Roll dice', 'wide' + (tut.active ? ' guide' : ''), doRoll);
      return;
    }
    if (ph === 'skip') {
      msg.innerHTML = '';
      addBtn(row(), 'Pass', tut.active ? 'guide' : '', doSkip);
      return;
    }

    // ph === 'play'
    const sh = ui.sheet;
    if (sh) {
      sh.count = Math.max(sh.min, Math.min(sh.max, sh.count));
      msg.innerHTML = '';
      const box = document.createElement('div'); box.className = 'sheet' + (sh.min === sh.max && !betaOn() ? ' fixed' : '');
      const addLabel = sh.kind === 'adjust' && state.cells[sh.cell].o === p ? 'Reinforce' : 'Land';
      const toggle = sh.modes && sh.modes.length > 1
        ? `<div class="seg mini" id="modeSeg">${sh.modes.map((m) => `<button data-m="${m}" class="${m === sh.mode ? 'on' : ''}">${m === 'add' ? addLabel : 'Withdraw'}</button>`).join('')}</div>` : '';
      const cap = !toggle && sh.kind === 'adjust' ? `<div class="cap">${sh.mode === 'add' ? addLabel : 'Withdraw'}</div>` : (tut.active && sh.kind === 'move' ? '<div class="cap" id="shCap"></div>' : '');
      box.innerHTML = `${toggle}${cap}
        <div class="srow"><div class="num" id="shNum"></div><button class="pm" id="minus" aria-label="Less">−</button><input type="range" id="rng" min="${sh.min}" max="${sh.max}" step="1" aria-label="Soldiers"><button class="pm" id="plus" aria-label="More">+</button><button class="pm ok" id="ok" aria-label="Confirm">✓</button><button class="pm x" id="cancel" aria-label="Cancel">✕</button></div>`;
      ctl.appendChild(box);
      const rng = box.querySelector('#rng');
      const capEl = box.querySelector('.cap');   // המילה ממורכזת מעל הסלייד בר עצמו, לא מעל כל הרוחב
      if (capEl) { const bb = box.getBoundingClientRect(), rr = rng.getBoundingClientRect(); capEl.style.transform = `translateX(${(rr.left + rr.width / 2) - (bb.left + bb.width / 2)}px)`; }
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
      box.querySelector('#cancel').onclick = () => { ui.sheet = null; ui.sel = null; render(); };
      box.querySelector('#ok').onclick = () => { if (tut.active && !tutSheetOk(sh)) { tutNudge(sh.tut ? (sh.kind === 'adjust' && sh.mode !== (sh.tut.type === 'withdraw' ? 'withdraw' : 'add') ? 'Pick the highlighted option' : `Set the amount to ${sh.tut.count}`) : 'Follow the highlighted move'); return; } commit(sh.build(sh.count)); };
      return;
    }

    msg.innerHTML = '';
    if (tut.active || (train.active && ui.sel === null)) return;
    if (betaOn() && ui.sel !== null) {
      const n = optionsFrom(ui.sel).size;
      msg.innerHTML = n ? 'Tap a lit square to move soldiers' : 'This base can\'t move with this roll';
      addBtn(row(), 'Cancel', 'soft sm', () => { ui.sel = null; render(); });
      return;
    }
    addBtn(row(), 'Pass', 'soft', doPass);
  }

  function renderLog() {
    $('logBox').innerHTML = state.log.slice(-40).reverse().map((l) => `<div>${l}</div>`).join('') || '<div>No moves yet</div>';
  }

  const onlineEndTracked = new Set();
  function trackEnds() {
    if (tut.active) { if (!tut.doneTracked) { tut.doneTracked = true; O.track('tutorial_complete'); } return; }
    if (online) {
      if (online.seat !== null && !online.replay && !onlineEndTracked.has(online.id)) { onlineEndTracked.add(online.id); O.track('online_end', { board: online.game.size, won: state.winner === online.seat }); }
      return;
    }
    if (settings.mode === 'ai' && aiEndSeq !== gameSeq) { aiEndSeq = gameSeq; O.track('ai_end', { board: settings.board, won: state.winner === settings.human }); sendAiLog('win'); }
  }
  function render() {
    fxCancel();
    FLIP = !tut.active && (online ? online.seat === 1 : settings.mode === 'ai' && settings.human === 1);
    $('app').classList.toggle('flip', FLIP);
    renderPanels(); renderBoard(); ui.rolled = false; renderDock(); renderLog(); renderCoach();
    const canResign = !!online && online.seat !== null && !online.replay && online.game.status === 'active' && state.winner === null;
    const watching = settings.mode === 'watch' && !online && !tut.active;
    $('undoBtn').textContent = online ? 'Resign' : watching ? (paused ? 'Resume' : 'Pause') : 'Undo';
    $('undoBtn').hidden = !!online && !canResign;
    $('undoBtn').disabled = tut.active || train.active || (watching ? state.winner !== null : (!online && history.length === 0));
    $('speedBtn').hidden = !watching;
    $('speedBtn').textContent = 'Speed: ' + SPEED_LABEL[settings.speed];
    $('tutBtn').hidden = !!online;
    if (state.winner !== null) trackEnds();
    const o = $('overlay');
    if (state.winner !== null && !o.dataset.dismissed && Date.now() >= winShowAt) {
      const w = state.winner;
      const by = online && online.game.ended_by;
      $('winTitle').innerHTML = tut.active
        ? `<span style="color:${COLORS[0]}">You win!</span>`
        : online
          ? `<span style="color:${COLORS[w]}">${esc(pname(w))}</span> wins${by === 'resign' ? ' (resigned)' : by === 'timeout' ? ' (timeout)' : ''}`
          : settings.mode === 'ai'
          ? `<span style="color:${COLORS[w]}">${w === settings.human ? 'You win' : 'Computer wins'}</span>`
          : `<span style="color:${COLORS[w]}">${NAME[w]}</span> wins`;
      $('winText').hidden = !tut.active;
      $('winText').innerHTML = tut.active ? '<b>Remember</b><ul>' + TUT.recap.map((t) => `<li>${t}</li>`).join('') + '</ul>' : '';
      $('winTrain').hidden = !(BETA_FLAG && tut.active);
      $('winNew').textContent = tut.active ? 'Play vs computer' : online ? 'Lobby' : 'New game';
      $('winCommunity').hidden = BETA_FLAG || communityDone() || !showCommunity(); communityText();
      $('winFeedback').hidden = !BETA_FLAG || tut.active || feedbackDone();
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
    if ((!canAct() && !selMode()) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const pos = toSvg(e), c = cellAt(pos, CR + 12);
    drag = { id: e.pointerId, start: c, x0: pos.x, y0: pos.y, moved: false, hover: null, prevSel: ui.sel };
    if (c === null) return;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (tut.active && TV3) return;   // טוטוריאל V3: הכול נקבע בשחרור (לחיצה)
    if (ui.sel !== null && betaOn()) return;   // כבר יש בסיס נבחר: ההחלטה מתקבלת בשחרור (יעד / החלפה / ביטול)
    const pl = playableMap().get(c);
    if ((pl && pl.source) || (betaOn() && state.cells[c].o === state.turn)) { ui.sel = c; render(); }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || (tut.active && TV3)) return;
    const pos = toSvg(e);
    if (!drag.moved && Math.hypot(pos.x - drag.x0, pos.y - drag.y0) > 9) drag.moved = true;
    if (!drag.moved || ui.sel === null || drag.start !== ui.sel || (ui.sheet && !(betaOn() && ui.sheet.kind === 'adjust'))) return;
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
    if (tut.active && TV3) { tutTap(e, cancelled); return; }
    const sel = ui.sel;
    if (betaOn() && !cancelled && (canAct() || selMode())) {
      // בחירה מתמשכת: לחיצה קצרה על בסיס בוחרת אותו (ופותחת תגבור/משיכה); לחיצה על יעד מודגש פותחת את בחירת הכמות להזזה
      if (d.moved) {
        ui.sel = null;
        if (sel !== null && d.start === sel && d.hover !== null) { if (ui.sheet) ui.sheet = null; startMove(sel, d.hover); }
        else { if (ui.sheet && ui.sheet.kind === 'adjust') ui.sheet = null; render(); }
        return;
      }
      const c = d.start;
      if (d.prevSel === null) {   // אין בחירה קודמת: לחיצה על בסיס נבחר אותו (בחירה נשארת)
        if (sel !== null && c === sel) { if (!startAdjust(c)) render(); return; }
        ui.sel = null;
        if (c !== null && playableMap().has(c) && startAdjust(c)) return;
        if (sel !== null) render();
        return;
      }
      const opts = optionsFrom(d.prevSel);
      if (c !== null && c !== d.prevSel && opts.has(c)) { ui.sel = null; ui.sheet = null; startMove(d.prevSel, c); return; }
      ui.sheet = null; ui.sel = null;
      const pl = c !== null && c !== d.prevSel ? playableMap().get(c) : null;
      if (pl && pl.source) { ui.sel = c; if (!startAdjust(c)) render(); return; }
      render();
      return;
    }
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

  // עוזבים באמצע משחק נגד המחשב: שולחים את מה שנשחק עד עכשיו (אם ממשיכים וגומרים, המשחק המלא דורס אותו)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && aiRec && !aiRec.sent && state.winner === null) sendAiLog('live'); });
  window.addEventListener('pagehide', () => { if (aiRec && !aiRec.sent && state.winner === null) sendAiLog('live'); });

  // ---------- אונליין ----------
  const netErr = (e) => { console.error(e); const m = $('lbMsg'); if (m) m.textContent = String((e && e.message) || e); if (online) resync(); };
  const onlineMyTurn = () => !!online && online.seat !== null && !online.replay && online.game.status === 'active' && state.turn === online.seat;

  function evApply(s, ev) {
    if (ev.kind === 'roll') return R.roll(s, ev.data.w, ev.data.b);
    if (ev.kind === 'skip') return ev.data && ev.data.pass ? R.passTurn(s) : R.skipTurn(s);
    return R.apply(s, ev.data);
  }
  function emit(kind, data) {
    if (!online || online.seat === null) return;
    const n = ++online.n;
    O.submit(online.id, n, kind, data, state.turn, state.winner).catch(netErr);
  }
  // חלון הניצחון/שאר מצבי הסיום שלא עוברים דרך מהלך (כניעה, זמן)
  function markFinished(g) {
    online.game = g;
    if (g.status === 'finished' && state.winner === null && g.ended_by !== 'win' && g.winner !== null) state = Object.assign({}, state, { winner: g.winner });
  }
  function onRemoteMove(row) {
    if (!online || online.replay) return;
    if (online.loading) { online.queue.push(row); return; }
    if (row.n <= online.n) return;   // הד של המהלך שלי
    if (row.n !== online.n + 1) { resync(); return; }
    let ns; const prev = state;
    try { ns = evApply(state, row); } catch (e) { resync(); return; }
    online.n = row.n; state = ns; ui = freshUi();
    if (row.kind === 'roll') { lastRoll = { w: ns.roll.w, b: ns.roll.b, p: ns.turn }; lastMove = null; ui.rolled = true; render(); }
    else if (row.kind === 'act') { winShowAt = ns.winner !== null ? Infinity : 0; lastMove = { p: prev.turn, a: row.data }; render(); animateMove(prev, row.data, ns); }
    else { lastMove = null; render(); }
  }
  function onGameRow(g) {
    if (!online) return;
    const old = online.game, hadWinner = state.winner !== null;
    g.live = old.live;
    markFinished(g);
    if (g.status === 'cancelled') { openLobby(); return; }
    if (old.status === 'open' && g.status === 'active') { online.n = 0; state = R.newGame(); lastMove = lastRoll = null; }
    // כל מהלך מעדכן גם את שורת המשחק; מציירים מחדש רק כשמשהו השתנה באמת (אחרת האנימציה של המהלך נקטעת)
    else if (old.name1 === g.name1 && (hadWinner || state.winner === null)) return;
    render();
  }
  // בודק מול השרת אם פספסנו משהו (הצטרפות, מהלך, סיום) ורק אז טוען מחדש: כך לא קוטעים אנימציות סתם
  async function softResync() {
    if (!online || online.replay || online.loading || online.syncing) return;
    online.syncing = true;
    const id = online.id;
    try {
      const g = await O.getGame(id);
      if (!online || online.id !== id) return;
      const moves = g.live ? g.live.moves_count : online.n;
      if (g.status !== online.game.status || g.name1 !== online.game.name1 || moves > online.n) await openOnline(id, { keep: true });
    } catch (e) { /* ignore */ }
    if (online && online.id === id) online.syncing = false;
  }
  const onResume = () => { if (online && !online.replay) softResync(); else if (!$('lobby').hidden) refreshLobby(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) onResume(); });
  window.addEventListener('online', onResume);
  window.addEventListener('focus', onResume);
  window.addEventListener('pageshow', (e) => { if (e.persisted) onResume(); });
  async function resync() {
    if (!online || online.replay) return;
    const id = online.id;
    try { await openOnline(id, { keep: true }); } catch (e) { console.error(e); }
  }

  async function openOnline(id, opts = {}) {
    clearTimeout(aiTimer); aiTimer = null; clearTimeout(winTimer); winShowAt = 0; fxCancel();
    tut.active = false; tut.backup = null; clearTimeout(tut.cardTimer); $('coach').hidden = true;
    const g = opts.inject ? opts.inject.game : await O.getGame(id);
    const seat = g.p0 === O.uid ? 0 : g.p1 === O.uid ? 1 : null;
    if (online) { if (online.unsub) online.unsub(); clearInterval(online.tick); }
    else if (!localBak) localBak = { state, history, settings: Object.assign({}, settings) };
    settings = Object.assign({}, settings, { mode: 'online', board: g.size });
    useBoard(g.size); applyRules();
    online = { id, game: g, seat, n: 0, replay: null, unsub: null, tick: null, loading: true, queue: [] };
    state = R.newGame(); history = []; lastMove = lastRoll = null; ui = freshUi();
    closeLobby(); $('overlay').hidden = true;
    $('overlay').dataset.dismissed = (opts.replay || g.status === 'finished') ? '1' : '';
    if (!opts.replay && g.status !== 'finished') online.unsub = O.watchGame(id, onRemoteMove, onGameRow, (row) => { if (online) online.game.live = row; });
    const moves = opts.inject ? opts.inject.moves : await O.getMoves(id);
    if (opts.replay) {
      const S = [R.newGame()];
      for (const ev of moves) S.push(evApply(S[S.length - 1], ev));
      online.replay = { S, A: moves, i: 0, timer: null };
      online.loading = false; state = S[0];
    } else {
      for (const ev of moves) { state = evApply(state, ev); online.n = ev.n; if (ev.kind === 'roll') lastRoll = { w: ev.data.w, b: ev.data.b, p: ev.actor }; }
      online.loading = false;
      const q = online.queue.sort((a, b) => a.n - b.n); online.queue = [];
      markFinished(g);
      for (const row of q) onRemoteMove(row);
      // רשת ביטחון למקרה שעדכון בזמן אמת הוחמץ (למשל הטלפון היה ברקע): בדיקה מהירה מול השרת בזמן המתנה לשחקן או ליריב
      online.tick = setInterval(() => {
        if (!online || online.replay || online.loading) return;
        online.t = (online.t || 0) + 1;
        const g = online.game;
        if (g.status === 'open' || (g.status === 'active' && state.winner === null && state.turn !== online.seat && online.t % 3 === 0)) softResync();
        if (online.t % 6 === 0) renderDock();
      }, 5000);
    }
    render();
  }

  // תצוגת חזרה על משחק שהסתיים
  function replayGo(i, animate) {
    const rp = online && online.replay; if (!rp) return;
    i = Math.max(0, Math.min(rp.S.length - 1, i));
    const prev = rp.S[rp.i], fwd = i === rp.i + 1; rp.i = i; state = rp.S[i]; ui = freshUi(); lastMove = null; winShowAt = 0;
    const ev = fwd ? rp.A[i - 1] : null;
    if (ev && ev.kind === 'act') lastMove = { p: ev.actor, a: ev.data };
    render();
    if (animate && ev && ev.kind === 'act') animateMove(prev, ev.data, state);
    if (rp.timer) { clearTimeout(rp.timer); rp.timer = null; }
    if (rp.playing) {
      if (i >= rp.S.length - 1) rp.playing = false;
      else rp.timer = setTimeout(() => replayGo(rp.i + 1, true), rp.A[i] && rp.A[i].kind === 'act' ? 2700 : 1000);
    }
    renderDock();
  }
  function renderOnlineDock(msg, addBtn, row) {
    const g = online.game, rp = online.replay;
    if (rp) {
      msg.textContent = `Step ${rp.i} / ${rp.S.length - 1}`;
      const r = row();
      addBtn(r, '‹', 'soft sm', () => { rp.playing = false; replayGo(rp.i - 1, false); });
      addBtn(r, rp.playing ? 'Pause' : (rp.i >= rp.S.length - 1 ? 'Restart' : 'Play'), 'sm', () => {
        if (rp.playing) { rp.playing = false; clearTimeout(rp.timer); renderDock(); return; }
        rp.playing = true;
        if (rp.i >= rp.S.length - 1) replayGo(0, false); else replayGo(rp.i + 1, true);
      });
      addBtn(r, '›', 'soft sm', () => { rp.playing = false; replayGo(rp.i + 1, true); });
      return true;
    }
    if (g.status === 'open') {
      msg.innerHTML = 'Waiting for an opponent…';
      if (online.seat === 0) {
        const r = row();
        addBtn(r, 'Invite a friend', '', () => inviteFriend(online.id));
        addBtn(r, 'Cancel', 'soft', () => { O.cancelGame(online.id).then(openLobby).catch(netErr); });
      }
      return true;
    }
    if (state.winner !== null) {
      const by = g.ended_by === 'resign' ? ' (resigned)' : g.ended_by === 'timeout' ? ' (timeout)' : '';
      msg.innerHTML = `<b style="color:${COLORS[state.winner]}">${esc(pname(state.winner))}</b> wins${by}`;
      addBtn(row(), 'Lobby', 'wide', openLobby);
      return true;
    }
    if (online.seat === null) { msg.innerHTML = `Watching · <b style="color:${COLORS[state.turn]}">${esc(pname(state.turn))}</b>`; return true; }
    if (state.turn !== online.seat) {
      msg.innerHTML = `<b style="color:${COLORS[state.turn]}">${esc(pname(state.turn))}</b> · ${state.roll ? 'Thinking…' : 'Rolling…'}`;
      if (Date.now() - new Date((g.live || g).last_move_at).getTime() > 5 * 60e3) addBtn(row(), 'Claim win', 'soft sm', () => { O.claimTimeout(online.id).catch(netErr); });
      return true;
    }
    return false;
  }

  // הזמנת חבר: קישור ישיר למשחק הפתוח (province-game.com/?join=ID), בשיתוף של הטלפון או בהעתקה
  async function inviteFriend(id) {
    const url = location.origin + location.pathname.replace(/[^/]*$/, '') + '?join=' + id;
    O.track('invite_click');
    const text = 'Join my game of Province';
    try {
      if (navigator.share) { await navigator.share({ title: 'Province', text, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); $('msg').textContent = 'Link copied. Send it to a friend.'; }
    catch (e) { window.prompt('Copy this link and send it to a friend:', url); }
  }
  // כניסה דרך קישור הזמנה: מצטרפים למשחק הפתוח (או חוזרים/צופים אם הוא כבר רץ)
  async function handleJoinLink() {
    let id = null;
    try { id = new URLSearchParams(location.search).get('join'); } catch (e) { /* ignore */ }
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    try {
      await O.init();
      const g = await O.getGame(id);
      if (g.status === 'open' && g.p0 !== O.uid) {
        const n = await askName(); if (!n) return;
        await O.joinGame(id, n); O.track('online_join', { board: g.size, via: 'link' });
      }
      if (g.status === 'cancelled') { $('lbMsg').textContent = 'That game was cancelled.'; return; }
      await openOnline(id);
    } catch (e) { $('lbMsg').textContent = 'That game is no longer available.'; console.error(e); }
  }

  // ---------- לובי ----------
  const TAG_PENDING = '<span class="lb-tag open">Pending</span>';
  const TAG_LIVE = '<span class="lb-tag live">Live</span>';
  let lobbyUnsub = null, lobbyTimer = null, lobbyDeb = null, lobbyBusy = false, presenceOn = false, lastCount = null, histLimit = 20;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLobby(); });
  function closeLobby() {
    $('lobby').hidden = true; $('startModal').hidden = true; $('nameModal').hidden = true;
    if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; }
    clearInterval(lobbyTimer); lobbyTimer = null;
  }
  function leaveOnline() {
    if (!online) return;
    if (online.unsub) online.unsub();
    clearInterval(online.tick);
    if (online.replay && online.replay.timer) clearTimeout(online.replay.timer);
    online = null;
    if (localBak) { settings = localBak.settings; state = localBak.state; history = localBak.history; localBak = null; }
    useBoard(settings.board); applyRules();
    clearTimeout(winTimer); winShowAt = 0; fxCancel();
    lastMove = lastRoll = null; ui = freshUi(); $('overlay').hidden = true; $('overlay').dataset.dismissed = state.winner !== null ? '1' : '';
    render();
  }
  function openLobby() {
    leaveOnline();
    $('startModal').hidden = true; $('nameModal').hidden = true; $('bar').classList.remove('open');
    if (tut.active) tutExit();
    if (train.active) trainExit(false);
    $('lobby').hidden = false;
    $('lbMsg').textContent = '';
    histLimit = 20;
    refreshLobby();
    if (!presenceOn) { presenceOn = true; O.presence((n) => { $('lbCount').textContent = n; if (lastCount !== null && n > lastCount) { const el = document.querySelector('.lb-online'); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); } lastCount = n; }).catch(() => { presenceOn = false; }); }
  }
  const dot = (cls) => `<i class="lb-dot ${cls}"></i>`;
  async function refreshLobby() {
    if ($('lobby').hidden || lobbyBusy) return;
    lobbyBusy = true;
    try {
      const d = await O.lobby(histLimit);
      if (!lobbyUnsub) { try { lobbyUnsub = O.watchLobby(() => { clearTimeout(lobbyDeb); lobbyDeb = setTimeout(refreshLobby, 500); }); } catch (e) { /* ignore */ } }
      const me = O.uid, sz = (g) => `<span class="sz">${g.size}×${g.size}</span>`;
      const row = (g, d0, txt, icon, a) => `<div class="lb-row" data-id="${g.id}" data-a="${a}"${g.ai ? ' data-ai="1"' : ''}>${dot(d0)}<div class="lb-txt">${txt}</div><div class="lb-go">${icon || ''}</div></div>`;
      let h = '', prev = false;
      const sep = (n) => { const s = prev && n > 0 ? ' sep' : ''; prev = prev || n > 0; return s; };
      let s0 = sep(d.open.length);
      d.open.forEach((g, k) => { h += row(g, 'open', `<b>${esc(g.name0)}</b>${sz(g)}`, TAG_PENDING, 'open').replace('class="lb-row"', 'class="lb-row"'); });
      s0 = sep(d.active.length);
      d.active.forEach((g, k) => {
        const mine = g.p0 === me || g.p1 === me;
        let r = row(g, 'live', `<b>${esc(g.name0)}</b> <span class="dim">vs</span> <b>${esc(g.name1)}</b>${sz(g)}`, TAG_LIVE, 'open');
        if (k === 0 && s0) r = r.replace('class="lb-row"', 'class="lb-row sep"');
        h += r;
      });
      const s1 = sep(d.finished.length);
      d.finished.forEach((g, k) => {
        const win = g.winner === null ? '' : `<span class="lb-win">${esc(g.winner === 0 ? g.name0 : g.name1)} wins</span>${g.quit ? ' <span class="dim">(resigned)</span>' : ''}`;
        let r = row(g, 'done', `<b>${esc(g.name0)}</b> <span class="dim">vs</span> <b>${esc(g.name1)}</b>${sz(g)}${win}`, '', 'replay');
        if (k === 0 && s1) r = r.replace('class="lb-row"', 'class="lb-row sep"');
        h += r;
      });
      if (d.moreFinished) h += '<button class="lb-more" id="lbMore" type="button">Show more</button>';
      $('lbList').innerHTML = h || '<div class="lb-empty">No games yet<br><span>Tap + to create one and invite a friend</span></div>';
      $('lbMsg').textContent = '';
    } catch (e) { $('lbMsg').textContent = 'Can\'t reach the server'; console.error(e); }
    lobbyBusy = false;
  }
  // חלון השם: מופיע רק כשנכנסים למשחק (יצירה/הצטרפות), עם השם השמור לעריכה
  function askName() {
    return new Promise((resolve) => {
      const m = $('nameModal'), inp = $('nameIn');
      inp.value = O.getName(); m.hidden = false; setTimeout(() => { inp.focus(); inp.select(); }, 50);
      const done = (v) => { m.hidden = true; $('nameOk').onclick = $('nameCancel').onclick = inp.onkeydown = null; resolve(v); };
      const ok = () => { const n = O.cleanName(inp.value); if (!n) { inp.focus(); return; } O.setName(n); done(n); };
      $('nameOk').onclick = ok; $('nameCancel').onclick = () => done(null);
      inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') done(null); };
    });
  }
  $('lbPlus').onclick = () => {
    startMode = 'online';
    $('startMain').hidden = false; $('startSize').hidden = true;
    $('startModal').hidden = false;
  };
  $('startModal').addEventListener('click', (e) => { if (e.target === $('startModal')) $('startModal').hidden = true; });
  $('lbOnline').onclick = () => { startMode = 'online'; $('startMain').hidden = true; $('startSize').hidden = false; };
  $('startBack').onclick = () => { $('startMain').hidden = false; $('startSize').hidden = true; };
  $('startSize').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-size]'); if (!b) return;
    const size = +b.dataset.size;
    $('startModal').hidden = true;
    if (startMode === 'ai') { const n = await askName(); if (!n) return; pending = { mode: 'ai', board: size, human: 0, level: 'strong', speed: 'normal', name: n }; startNew(); return; }
    if (startMode === 'watch' || startMode === 'watchold') { pending = { mode: 'watch', watch: startMode === 'watch' ? 'nn' : 'nnold', board: size, human: 0, level: 'strong', speed: 'normal' }; startNew(); return; }
    const n = await askName(); if (!n) return;
    try { const id = await O.createGame(size, n); O.track('online_create', { board: size }); await openOnline(id); } catch (er) { netErr(er); }
  });
  $('lbList').addEventListener('click', async (e) => {
    if (e.target.closest('#lbMore')) { histLimit += 20; refreshLobby(); return; }
    const r = e.target.closest('.lb-row'); if (!r) return;
    const id = r.dataset.id, a = r.dataset.a;
    if (r.dataset.ai) { O.track('ai_replay'); openAiReplay(id); return; }
    try {
      const g = a === 'open' ? await O.getGame(id) : null;
      if (g && g.status === 'open' && g.p0 !== O.uid) { const n = await askName(); if (!n) return; await O.joinGame(id, n); O.track('online_join', { board: g.size }); await openOnline(id); }
      else if (a === 'replay') { O.track('online_replay'); await openOnline(id, { replay: true }); }
      else { if (g && g.p0 !== O.uid && g.p1 !== O.uid) O.track('online_watch'); await openOnline(id); }
    } catch (er) { netErr(er); refreshLobby(); }
  });
  $('lbAi').onclick = openNew;
  // beta: Training lessons
  if (BETA_FLAG) { $('lbTrain').hidden = false; }
  $('lbTrain').onclick = () => { $('startModal').hidden = true; openTrainMenu(); };
  $('trainClose').onclick = () => { $('trainModal').hidden = true; };
  $('trainModal').addEventListener('click', (e) => { if (e.target === $('trainModal')) $('trainModal').hidden = true; });
  $('winTrain').onclick = () => { $('overlay').hidden = true; openTrainMenu(); };
  // beta: watch the computer play itself
  if (BETA_FLAG) { $('lbWatch').hidden = false; $('lbWatchOld').hidden = false; }
  const openWatch = (m) => { startMode = m; $('lbCont').hidden = true; $('startMain').hidden = true; $('startSize').hidden = false; };
  $('lbWatch').onclick = () => openWatch('watch');
  $('lbWatchOld').onclick = () => openWatch('watchold');
  $('lbCont').onclick = closeLobby;
  $('lbTut').onclick = startTutorial;

  // ---------- הצעה לטוטוריאל למי שנכנס בפעם הראשונה ----------
  const tpSeen = () => { try { return localStorage.getItem('province.tutprompt') === '1'; } catch (e) { return false; } };
  const tpMark = () => { try { localStorage.setItem('province.tutprompt', '1'); } catch (e) { /* ignore */ } };
  let tpTimer = null;
  function hideTutPrompt() {
    clearTimeout(tpTimer);
    const el = $('tutPrompt'); el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 450);
  }
  function maybeTutPrompt() {
    if (tpSeen() || $('lobby').hidden || !$('nameModal').hidden || !$('startModal').hidden || tut.active || online) return;
    let joining = false; try { joining = new URLSearchParams(location.search).has('join'); } catch (e) { /* ignore */ }
    if (joining) return;
    tpMark(); O.track('tutorial_prompt_shown');
    const el = $('tutPrompt'); el.hidden = false;
    void el.offsetWidth; setTimeout(() => el.classList.add('show'), 40);
    tpTimer = setTimeout(hideTutPrompt, 15000);
    el.classList.add('big');
  }
  $('tpStart').onclick = () => { hideTutPrompt(); O.track('tutorial_prompt_accept'); startTutorial(); };
  $('tpSkip').onclick = () => { hideTutPrompt(); O.track('tutorial_prompt_skip'); };

  // ---------- התקנה כאפליקציה ----------
  let installEv = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isPhone = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const installDismissed = () => { try { return Date.now() - (+localStorage.getItem('province.installDismiss') || 0) < 7 * 864e5; } catch (e) { return false; } };
  function renderInstall() {
    const show = isPhone && !standalone() && !installDismissed() && (!!installEv || isIos);
    $('lbInstall').hidden = !show;
    $('lbInstallBtn').hidden = !installEv;
    $('lbInstallTxt').textContent = installEv ? 'Add Province to your home screen' : 'Tap Share, then Add to Home Screen';
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEv = e; O.track('install_available'); renderInstall(); });
  window.addEventListener('appinstalled', () => { O.track('app_installed'); installEv = null; renderInstall(); });
  $('lbInstallBtn').onclick = async () => { if (!installEv) return; O.track('install_click'); installEv.prompt(); try { const c = await installEv.userChoice; if (c && c.outcome === 'accepted') O.track('install_accepted'); } catch (e) { /* ignore */ } installEv = null; renderInstall(); };
  // הזמנה לקבוצת הוואטסאפ: במסך הניצחון רק למי שעוד לא לחץ עליה אף פעם
  // ההזמנה לקבוצת הוואטסאפ (בעברית) מוצגת רק למי שנכנס מישראל
  let userCountry = null;
  try { userCountry = localStorage.getItem('province.cc') || null; } catch (e) { /* ignore */ }
  const isIL = () => (userCountry ? userCountry === 'IL' : /^he/i.test(navigator.language || ''));
  // ההזמנה מוצגת לכולם: בעברית לישראלים, באנגלית לשאר העולם
  const showCommunity = () => true;
  function communityText() {
    const il = isIL();
    for (const a of [$('lbCommunity'), $('winCommunity')]) {
      a.dir = il ? 'rtl' : 'ltr'; a.lang = il ? 'he' : 'en';
      const t = a.lastChild; if (t && t.nodeType === 3) t.textContent = il ? 'הצטרפו לקהילת הוואטסאפ של המשחק' : 'Join the Province WhatsApp community';
    }
  }
  function applyCommunity() { $('lbCommunity').hidden = !showCommunity(); communityText(); }
  function setCountry(cc) {
    if (!cc) return;
    userCountry = cc;
    try { localStorage.setItem('province.cc', cc); } catch (e) { /* ignore */ }
    applyCommunity();
  }
  const communityDone = () => { try { return localStorage.getItem('province.community') === '1'; } catch (e) { return false; } };
  const markCommunity = (where) => { O.track('community_click', { from: where }); try { localStorage.setItem('province.community', '1'); } catch (e) { /* ignore */ } $('winCommunity').hidden = true; };
  $('lbCommunity').addEventListener('click', () => markCommunity('lobby'));
  applyCommunity();
  $('winCommunity').addEventListener('click', () => markCommunity('win'));
  // feedback after a game (beta): stored on the server, read in the dashboard
  const feedbackDone = () => { try { return localStorage.getItem('province.feedback') === '1'; } catch (e) { return false; } };
  const fbShow = (on) => { $('fbModal').hidden = !on; if (on) { $('fbThanks').hidden = true; $('fbSend').hidden = false; $('fbIn').hidden = false; $('fbIn').value = ''; setTimeout(() => $('fbIn').focus(), 50); } };
  $('winFeedback').onclick = () => { O.track('feedback_open'); fbShow(true); };
  $('fbCancel').onclick = () => fbShow(false);
  $('fbSend').onclick = () => {
    const t = $('fbIn').value.trim(); if (t.length < 2) return;
    O.sendFeedback(t, { board: settings.board, mode: settings.mode, won: state.winner === settings.human, beta: !!BETA_FLAG }).catch(() => {});
    O.track('feedback_sent'); try { localStorage.setItem('province.feedback', '1'); } catch (e) { /* ignore */ }
    $('winFeedback').hidden = true; $('fbIn').hidden = true; $('fbSend').hidden = true; $('fbThanks').hidden = false; setTimeout(() => fbShow(false), 1600);
  };
  $('lbInstallX').onclick = () => { O.track('install_dismiss'); try { localStorage.setItem('province.installDismiss', String(Date.now())); } catch (e) { /* ignore */ } $('lbInstall').hidden = true; };
  renderInstall();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});

  // ---------- כפתורים ----------
  $('speedBtn').onclick = cycleSpeed;
  $('undoBtn').onclick = () => { if (settings.mode === 'watch' && !online) togglePause(); else if (!online) undo(); else if (window.confirm('Resign this game?')) O.resign(online.id).catch(netErr); };
  $('logBtn').onclick = () => { const b = $('logBox'); b.hidden = !b.hidden; };
  const menu = (open) => { $('bar').classList.toggle('open', open); $('menuBtn').setAttribute('aria-expanded', open); };
  $('menuBtn').onclick = (e) => { e.stopPropagation(); menu(!$('bar').classList.contains('open')); };
  $('bar').addEventListener('click', (e) => { if (e.target.closest('button')) menu(false); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#bar')) menu(false); });
  $('newBtn').onclick = openLobby;
  $('winNew').onclick = () => {
    $('overlay').hidden = true;
    if (tut.active) { askName().then((n) => { if (!n) return; pending = Object.assign({}, tut.backup ? tut.backup.settings : settings, { mode: 'ai', board: 6, human: 0, name: n }); startNew(); }); } else if (online) openLobby(); else openNew();
  };
  $('tutBtn').onclick = startTutorial;
  $('coachExit').onclick = () => (train.active ? trainExit(false) : tutExit());
  window.addEventListener('resize', () => { if (tut.active) renderCoach(); });
  $('winClose').onclick = () => { $('overlay').dataset.dismissed = '1'; $('overlay').hidden = true; };

  if (BETA_FLAG) { const b = document.createElement('div'); b.id = 'betaBadge'; b.textContent = 'BETA'; b.title = 'Beta features are on. Open ?beta=0 to turn them off.'; document.body.appendChild(b); }
  load(); afterLoad(); useBoard(settings.board); applyRules(); aiEndSeq = state.winner !== null ? 0 : -1; if (state.winner !== null) $('overlay').dataset.dismissed = '1'; render(); openLobby();
  // משחק נגד המחשב שהסתיים: צפייה חוזרת (מההיסטוריה בלובי, או קישור ?aireplay=<id>)
  async function openAiReplay(id) {
    try {
      const r = await O.publicAiGame(id);
      if (!r) { window.alert('Game not found.'); return; }
      const g = { id, size: r.size, status: 'finished', winner: r.winner, ended_by: r.ended === 'win' ? 'win' : 'timeout', moves_count: r.events.length, name0: r.name || 'Player', name1: 'Computer', p0: null, p1: null, created_at: r.at, last_move_at: r.at, live: { last_move_at: r.at } };
      await openOnline(id, { replay: true, inject: { game: g, moves: r.events } });
      if (r.ended !== 'win' && online && online.replay) replayGo(online.replay.S.length - 1, false);
    } catch (e) { console.error(e); window.alert('Cannot open this game.'); }
  }
  try { const ar = new URLSearchParams(location.search).get('aireplay'); if (ar) openAiReplay(ar); } catch (e) { /* ignore */ }
  setTimeout(() => { try { O.retryAiLogs(); } catch (e) { /* ignore */ } }, 4000);
  handleJoinLink();
  setTimeout(maybeTutPrompt, 2000);
  O.geo().then((g) => { setCountry(g.country); return g; }).then((g) => O.track('visit', Object.assign({ mobile: isPhone, standalone: standalone(), returning: O.returning }, g)));
  window.__province = { get state() { return state; }, get aiRec() { return aiRec; }, get ui() { return ui; }, get settings() { return settings; }, setCountry, setState(s) { state = s; history = []; ui = freshUi(); lastMove = lastRoll = null; render(); }, playableMap, optionsFrom, cellX, cellY, get R() { return R; } };   // לנוחות בדיקה
})();
