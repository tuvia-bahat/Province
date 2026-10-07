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
  const R = window.Rules;
  const SAVE_KEY = 'province.save.v5';
  const NAME = R.NAMES;
  const COLORS = ['#e5484d', '#3b6ef5'];     // תואם ל---p0 / --p1 ב-style.css

  // ---------- גיאומטריה ----------
  const P = 64, G = 26, M = 22, CR = 26, W = 2 * M + 6 * P + 2 * G;
  const cx = (x) => M + x * P + Math.floor(x / 2) * G + P / 2;
  const cy = (y) => { const r = 5 - y; return M + r * P + Math.floor(r / 2) * G + P / 2; };
  const cellX = (i) => cx(R.xy(i)[0]);
  const cellY = (i) => cy(R.xy(i)[1]);

  // ---------- מצב ----------
  const $ = (id) => document.getElementById(id);
  let state, history;
  // mode: pvp | ai | watch
  let settings = { mode: 'pvp', human: 0, level: 'strong', levelR: 'strong', levelB: 'strong', speed: 'normal' };
  let lastMove = null, lastRoll = null, aiTimer = null, paused = false;
  let ui = freshUi();
  function freshUi() { return { sel: null, sheet: null, hover: null, rolled: false }; }
  const SPEED = { slow: 2, normal: 1, fast: 0.12 };
  const SPEED_LABEL = { slow: 'איטית', normal: 'רגילה', fast: 'מהירה' };
  const isAiTurn = () => state.winner === null &&
    (settings.mode === 'watch' || (settings.mode === 'ai' && state.turn !== settings.human));
  const aiLevel = () => (settings.mode === 'watch' ? (state.turn === 0 ? settings.levelR : settings.levelB) : settings.level);
  const phase = () => (state.winner !== null ? 'over' : !state.roll ? 'roll' : R.hasAnyMove(state) ? 'play' : 'skip');
  const canAct = () => !isAiTurn() && phase() === 'play' && ui.sheet === null;

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.state && d.state.cells.length === R.CELLS) { state = d.state; history = d.history || []; settings = Object.assign(settings, d.settings || {}); return; }
      }
    } catch (e) { /* ignore */ }
    state = R.newGame(); history = [];
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state, history: history.slice(-60), settings })); } catch (e) { /* ignore */ }
  }

  // ---------- משוב מישוש ----------
  // אנדרואיד: navigator.vibrate. אייפון: מתג מערכת נסתר (iOS 17.4+), בשיטה הכי טובה שקיימת בדפדפן.
  const tickEl = (() => {
    const l = document.createElement('label');
    l.setAttribute('aria-hidden', 'true');
    l.style.cssText = 'position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none';
    l.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.appendChild(l);
    return l;
  })();
  const PATTERNS = { select: 14, tick: 8, soft: 5, confirm: [12, 36, 18], error: [18, 40, 18] };
  function haptic(kind) {
    try {
      if (navigator.vibrate) { navigator.vibrate(PATTERNS[kind]); return; }
      tickEl.click();
    } catch (e) { /* ignore */ }
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
        if (R.actionTypes(state, Rc).includes('land')) add(Rc, 'land');
        for (const t of ['move', 'transport', 'withdraw', 'bridge']) for (const f of R.sources(state, t, Rc)) add(f, 'source');
      }
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
  const canReinforce = (c) => state.roll.cells.includes(c) && R.actionTypes(state, c).includes('land');

  // ---------- ביצוע ----------
  function commit(a) {
    let ns;
    try { ns = R.apply(state, a); } catch (e) { console.error(e); return false; }
    history.push(state); lastMove = { p: state.turn, a }; state = ns;
    ui = freshUi();
    haptic('confirm');
    save(); render();
    return true;
  }
  function doRoll() {
    state = R.roll(state, 1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6));
    lastRoll = { w: state.roll.w, b: state.roll.b, p: state.turn }; lastMove = null;
    ui = freshUi(); ui.rolled = true;
    haptic('soft'); save(); render();
  }
  function passOrSkip(fn) { history.push(state); lastMove = null; state = fn(state); ui = freshUi(); save(); render(); }
  const doSkip = () => passOrSkip(R.skipTurn);
  const doPass = () => passOrSkip(R.passTurn);

  function undo() {
    if (!history.length) return;
    clearTimeout(aiTimer); aiTimer = null;
    state = history.pop();
    // נגד המחשב: חוזרים עד לתור האדם (ביטול מהלך המחשב יחד עם מהלך האדם)
    while (isAiTurn() && history.length) state = history.pop();
    lastMove = null; ui = freshUi(); save(); render();
  }

  // פתיחת בחירת כמות, או ביצוע מיידי כשאין מה לבחור
  function openSheet(sheet) {
    if (sheet.min === sheet.max) { commit(sheet.build(sheet.max)); return; }
    ui.sheet = sheet; render();
  }
  function startLand(c) {
    const p = state.turn, max = R.camp(state, p);
    openSheet({ kind: 'land', cell: c, min: 1, max, count: 1, build: (n) => ({ type: 'land', R: c, count: n }) });
  }
  function startWithdraw(from) {
    const Rc = withdrawR(from), max = state.cells[from].n;
    openSheet({ kind: 'withdraw', from, min: 1, max, count: max, build: (n) => ({ type: 'withdraw', R: Rc, from, count: n }) });
  }
  function startMove(from, to) {
    const plan = planFor(from, to);
    if (!plan) return;
    openSheet({ kind: 'move', plan, from, to, min: plan.min, max: plan.max, count: plan.max, build: (n) => actionFromPlan(plan, n) });
  }

  // ---------- יריב מחשב ----------
  function scheduleAi() {
    if (aiTimer || paused || !isAiTurn()) return;
    aiTimer = setTimeout(aiStep, (state.roll ? 1000 : 700) * SPEED[settings.speed]);
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
    if (!state.roll) { doRoll(); return; }
    const p = state.turn;
    let a = { type: 'pass' };
    if (R.hasAnyMove(state)) {
      try { a = AI.chooseAction(state, aiLevel()); } catch (e) { console.error(e); }
    }
    history.push(state);
    if (!R.hasAnyMove(state)) state = R.skipTurn(state);
    else if (a.type === 'pass') state = R.passTurn(state);
    else {
      try { state = R.apply(state, a); } catch (e) { console.error(e); state = R.passTurn(state); a = { type: 'pass' }; }
    }
    lastMove = a.type === 'pass' ? null : { p, a };
    ui = freshUi(); save(); render();
  }

  // ---------- משחק חדש ----------
  let pending = null;
  function openNew() { pending = Object.assign({}, settings); renderNewModal(); $('newModal').hidden = false; }
  function renderNewModal() {
    const groups = { grpMode: 'mode', grpSide: 'human', grpLevel: 'level', grpLevelR: 'levelR', grpLevelB: 'levelB', grpSpeed: 'speed' };
    for (const id in groups) $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(pending[groups[id]]) === b.dataset.v));
    $('grpSideWrap').hidden = $('grpLevelWrap').hidden = pending.mode !== 'ai';
    $('grpWatchWrap').hidden = pending.mode !== 'watch';
  }
  function startNew() {
    clearTimeout(aiTimer); aiTimer = null; paused = false;
    settings = Object.assign({}, pending); settings.human = +settings.human;
    state = R.newGame(); history = []; lastMove = lastRoll = null; ui = freshUi();
    $('newModal').hidden = true; $('overlay').dataset.dismissed = '';
    save(); render();
  }

  // ---------- תצוגה: לוח ----------
  const DEFS = `<defs>
      <filter id="sh1" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="4.5" flood-color="#1b2233" flood-opacity=".38"/></filter>
      <filter id="sh2" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#1b2233" flood-opacity=".62"/></filter>
    </defs>`;

  function renderBoard() {
    const svg = $('board');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    const control = R.provinceControl(state);
    const play = canAct() ? playableMap() : new Map();
    const opts = canAct() && ui.sel !== null ? optionsFrom(ui.sel) : null;
    const sheet = ui.sheet;
    const turnColor = COLORS[state.turn];
    let h = DEFS;

    // נהרות
    for (let k = 1; k <= 2; k++) {
      const pos = M + 2 * k * P + (k - 1) * G + G / 2;
      h += `<line class="river" x1="${pos}" y1="8" x2="${pos}" y2="${W - 8}"/><line class="river" x1="8" y1="${pos}" x2="${W - 8}" y2="${pos}"/>`;
    }
    // גשרים
    for (const key in state.bridges) {
      const [a, b] = key.split('-').map(Number);
      const ax = cellX(a), ay = cellY(a), bx = cellX(b), by = cellY(b);
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, off = CR - 2;
      h += `<line class="bridge" x1="${ax + ux * off}" y1="${ay + uy * off}" x2="${bx - ux * off}" y2="${by - uy * off}" stroke="${COLORS[state.bridges[key]]}"/>`;
    }
    // עיגולים
    for (let i = 0; i < R.CELLS; i++) {
      const c = state.cells[i], x = cellX(i), y = cellY(i);
      let f = '';
      if (sheet) { if (i === sheet.from || i === sheet.cell) f = 'sh2'; else if (i === sheet.to) f = 'sh1'; }
      else if (opts) { if (i === ui.sel) f = 'sh2'; else if (opts.has(i)) f = 'sh1'; }
      else if (play.has(i)) f = 'sh1';
      const fa = f ? ` filter="url(#${f})"` : '';
      if (c.o === null) {
        const ctl = control[R.provinceOf(i)];
        h += `<circle class="cell${ctl !== null ? ' c' + ctl : ''}" cx="${x}" cy="${y}" r="${CR}"${fa}/>`;
      } else {
        h += `<circle class="base p${c.o}" cx="${x}" cy="${y}" r="${CR}"${fa}/><text class="cnt" x="${x}" y="${y + 1}">${c.n}</text>`;
      }
    }
    // טבעות: משבצות שהוטלו, ומהלך אחרון
    if (state.roll && state.winner === null) {
      state.roll.cells.forEach((c) => { h += `<circle class="ring-roll" cx="${cellX(c)}" cy="${cellY(c)}" r="${CR + 8}" stroke="${turnColor}"/>`; });
    }
    if (lastMove) {
      const la = lastMove.a;
      const cells = la.type === 'land' ? [la.R] : la.type === 'withdraw' ? [la.from] : [la.from, la.to];
      cells.forEach((c) => { if (c !== null && c !== undefined) h += `<circle class="ring-last" cx="${cellX(c)}" cy="${cellY(c)}" r="${CR + 5}" stroke="${COLORS[lastMove.p]}"/>`; });
    }
    // שכבת גרירה (מתעדכנת ללא ציור מחדש של הלוח)
    h += `<g id="dragLayer"><line id="dragLine" class="drag-line" stroke="${turnColor}" visibility="hidden"/><circle id="dragDot" class="drag-dot" r="12" fill="${turnColor}" visibility="hidden"/><circle id="hoverRing" class="hover-ring" r="${CR + 5}" stroke="${turnColor}" visibility="hidden"/></g>`;
    svg.innerHTML = h;
  }

  // ---------- תצוגה: שחקנים וקוביות ----------
  function renderPanels() {
    for (const p of [0, 1]) {
      const el = $('pl' + p);
      el.style.setProperty('--c', COLORS[p]);
      el.className = 'pl' + (state.turn === p && state.winner === null ? ' active' : '');
      const tag = settings.mode === 'watch' ? 'מחשב' : settings.mode === 'ai' ? (p === settings.human ? 'אתה' : 'מחשב') : '';
      const held = R.provincesHeld(state, p);
      let pips = '';
      for (let k = 0; k < R.WIN_PROVINCES; k++) pips += `<span class="pip${k < held ? ' on' : ''}"></span>`;
      el.innerHTML = `<div class="top"><span class="swatch"></span><span>${NAME[p]}</span><span class="tag">${tag}</span><span class="pips" title="פרובינציות">${pips}</span></div>
        <div class="meta">מחנה ${R.camp(state, p)} · קברות ${state.graveyard[p]} · גשרים ${state.bridgesLeft[p]}</div><div class="under"></div>`;
    }
  }

  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHtml(n, label, cls) {
    let cells = '';
    for (let i = 0; i < 9; i++) cells += `<i${PIPS[n].includes(i) ? ' class="on"' : ''}></i>`;
    return `<div class="die-wrap${cls.old ? ' old' : ''}"><div class="die${cls.roll ? ' roll' : ''}">${cells}</div><small>${label}</small></div>`;
  }
  function renderDice() {
    const box = $('dice');
    const info = state.roll || lastRoll;
    if (!info) { box.innerHTML = '<span class="dice-empty">הקוביות עדיין לא הוטלו</span>'; return; }
    const cls = { roll: ui.rolled, old: !state.roll };
    box.innerHTML = dieHtml(info.w, 'X', cls) + dieHtml(info.b, 'Y', cls);
    ui.rolled = false;
  }

  // ---------- תצוגה: דוק ----------
  const lbl = (c) => R.cellLabel(c, state.turn);
  function sheetText(sh) {
    const n = sh.count, p = state.turn;
    if (sh.kind === 'land') {
      const own = state.cells[sh.cell].o === p;
      return { title: `${own ? 'תגבור' : 'הנחתה'} ב-${lbl(sh.cell)}`, note: `נותרו במחנה ${R.camp(state, p) - n}` };
    }
    if (sh.kind === 'withdraw') return { title: `נסיגה מ-${lbl(sh.from)} למחנה`, note: `${state.cells[sh.from].n - n} יישארו בבסיס` };
    const pl = sh.plan, tg = n === 0 ? pl.bridge.tg : pl.tgt;
    const bridge = tg.cross === 'place' ? `גשר חדש (נותרו ${state.bridgesLeft[p] - 1})` : tg.cross === 'replace' ? 'החלפת גשר היריב' : '';
    if (n === 0) return { title: `הנחת גשר אל ${lbl(sh.to)}`, note: bridge };
    if (pl.tgt.kind === 'attack') {
      const d = state.cells[sh.to].n, k = Math.min(n, d);
      const out = n > d ? `${n - d} יישארו וישלטו` : n === d ? 'המשבצת תתרוקן' : `יישארו ${d - n} מגינים`;
      return { title: `התקפה על ${lbl(sh.to)}`, note: `${n} מול ${d} · ${k} יהרגו · ${out}` + (bridge ? ` · ${bridge}` : '') };
    }
    return { title: `${pl.type === 'transport' ? 'שינוע' : 'תנועה'} אל ${lbl(sh.to)}`, note: bridge };
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
    const lastLog = state.log.length ? `<span class="sub">${state.log[state.log.length - 1]}</span>` : '';

    if (state.winner !== null) {
      msg.innerHTML = `<b style="color:${COLORS[state.winner]}">${NAME[state.winner]}</b> ניצח`;
      addBtn(row(), 'משחק חדש', 'wide', openNew);
      return;
    }
    if (isAiTurn()) {
      const doing = paused ? 'מושהה' : state.roll ? 'חושב…' : 'מטיל קוביות…';
      msg.innerHTML = `${name} · ${doing}${lastLog}`;
      return;
    }
    const ph = phase();
    if (ph === 'roll') {
      msg.innerHTML = `תור ${name}${lastLog}`;
      addBtn(row(), 'הטל קוביות', 'wide', doRoll);
      return;
    }
    if (ph === 'skip') {
      msg.innerHTML = `${name} · אין מהלך אפשרי<span class="sub">התור עובר ליריב</span>`;
      addBtn(row(), 'המשך', 'wide', doSkip);
      return;
    }

    // ph === 'play'
    const sh = ui.sheet;
    if (sh) {
      sh.count = Math.max(sh.min, Math.min(sh.max, sh.count));
      const t = sheetText(sh);
      msg.innerHTML = '';
      const box = document.createElement('div'); box.className = 'sheet';
      box.innerHTML = `<div class="title">${t.title}</div>
        <div class="stepper"><button class="pm" id="minus" aria-label="פחות">−</button>
          <div class="num">${sh.count}${sh.count === 0 ? '<small>גשר בלבד</small>' : ''}</div>
          <button class="pm" id="plus" aria-label="יותר">+</button></div>
        <input type="range" id="rng" min="${sh.min}" max="${sh.max}" value="${sh.count}" aria-label="כמות חיילים">
        <div class="quick"><button class="btn soft sm" id="qmin">${sh.min === 0 ? 'גשר בלבד' : '1'}</button><button class="btn soft sm" id="qhalf">חצי</button><button class="btn soft sm" id="qall">הכל</button></div>
        <div class="note">${t.note}</div>`;
      ctl.appendChild(box);
      const set = (v) => { sh.count = Math.max(sh.min, Math.min(sh.max, v)); haptic('tick'); renderDock(); renderBoard(); };
      box.querySelector('#minus').onclick = () => set(sh.count - 1);
      box.querySelector('#plus').onclick = () => set(sh.count + 1);
      box.querySelector('#rng').oninput = (e) => set(+e.target.value);
      box.querySelector('#qmin').onclick = () => set(sh.min === 0 ? 0 : 1);
      box.querySelector('#qhalf').onclick = () => set(Math.max(sh.min, Math.ceil(sh.max / 2)));
      box.querySelector('#qall').onclick = () => set(sh.max);
      const r = row();
      addBtn(r, 'ביטול', 'ghost', () => { ui.sheet = null; haptic('soft'); render(); });
      addBtn(r, 'אישור', '', () => commit(sh.build(sh.count)));
      return;
    }

    if (ui.sel === null) {
      msg.innerHTML = `${name} · בחר משבצת מודגשת`;
    } else {
      msg.innerHTML = `${name} · גרור מ-${lbl(ui.sel)} ליעד<span class="sub">או לחץ על יעד מודגש</span>`;
      const r = row();
      if (canReinforce(ui.sel)) addBtn(r, 'תגבור', 'soft sm', () => startLand(ui.sel));
      if (withdrawR(ui.sel) !== undefined) addBtn(r, 'נסיגה למחנה', 'soft sm', () => startWithdraw(ui.sel));
    }
    addBtn(row(), 'דלג על התור', 'ghost sm', doPass);
  }

  function renderLog() {
    $('logBox').innerHTML = state.log.slice(-40).reverse().map((l) => `<div>${l}</div>`).join('') || '<div>אין עדיין מהלכים</div>';
  }

  function render() {
    renderPanels(); renderBoard(); renderDice(); renderDock(); renderLog();
    const watch = settings.mode === 'watch';
    $('undoBtn').textContent = watch ? (paused ? 'המשך' : 'השהה') : 'בטל מהלך';
    $('undoBtn').disabled = watch ? state.winner !== null : history.length === 0;
    $('speedBtn').hidden = !watch;
    $('speedBtn').textContent = 'מהירות: ' + SPEED_LABEL[settings.speed];
    const o = $('overlay');
    if (state.winner !== null && !o.dataset.dismissed) {
      const w = state.winner;
      const word = settings.mode === 'ai' ? (w === settings.human ? 'ניצחת' : 'המחשב ניצח') : 'ניצח';
      $('winTitle').innerHTML = settings.mode === 'ai' ? `<span style="color:${COLORS[w]}">${word}</span>` : `<span style="color:${COLORS[w]}">${NAME[w]}</span> ${word}`;
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
  function overlay(pos, hover) {
    const line = $('dragLine'), dot = $('dragDot'), ring = $('hoverRing');
    if (!line) return;
    if (!pos) { line.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); ring.setAttribute('visibility', 'hidden'); return; }
    line.setAttribute('x1', cellX(ui.sel)); line.setAttribute('y1', cellY(ui.sel));
    line.setAttribute('x2', pos.x); line.setAttribute('y2', pos.y);
    dot.setAttribute('cx', pos.x); dot.setAttribute('cy', pos.y);
    line.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
    if (hover !== null && hover !== undefined) {
      ring.setAttribute('cx', cellX(hover)); ring.setAttribute('cy', cellY(hover)); ring.setAttribute('visibility', 'visible');
    } else ring.setAttribute('visibility', 'hidden');
  }

  svg.addEventListener('pointerdown', (e) => {
    if (!canAct() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const pos = toSvg(e), c = cellAt(pos, CR + 10);
    drag = { id: e.pointerId, start: c, x0: pos.x, y0: pos.y, moved: false, hover: null, selectedNow: false };
    if (c === null) return;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const play = playableMap();
    const opts = ui.sel !== null ? optionsFrom(ui.sel) : null;
    const isTarget = opts && opts.has(c) && c !== ui.sel;
    // נגיעה בבסיס מודגש (שאינו יעד של הבסיס שנבחר) בוחרת אותו מיד
    if (!isTarget && c !== ui.sel && play.get(c) && play.get(c).source) {
      ui.sel = c; drag.selectedNow = true; haptic('select'); render();
      // render החליף את ה-SVG; ממשיכים לעקוב אחרי האצבע דרך ה-capture שעל האלמנט הראשי
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const pos = toSvg(e);
    if (!drag.moved && Math.hypot(pos.x - drag.x0, pos.y - drag.y0) > 9) drag.moved = true;
    if (!drag.moved || ui.sel === null || drag.start !== ui.sel || ui.sheet) return;
    const opts = optionsFrom(ui.sel);
    let hover = cellAt(pos, CR + 12);
    if (hover === ui.sel || (hover !== null && !opts.has(hover))) hover = null;
    if (hover !== drag.hover) { drag.hover = hover; if (hover !== null) haptic('tick'); }
    overlay(pos, hover);
  });

  function endPointer(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    overlay(null);
    if (cancelled || !canAct()) return;
    const c = d.start;

    if (d.moved && ui.sel !== null && c === ui.sel) {          // גרירה מהבסיס שנבחר
      if (d.hover !== null) startMove(ui.sel, d.hover);
      return;
    }
    if (d.moved || c === null) {                                // גרירה לא רלוונטית / לחיצה בחוץ
      if (!d.moved && c === null && ui.sel !== null) { ui.sel = null; render(); }
      return;
    }
    // לחיצה (בלי גרירה)
    if (d.selectedNow) return;                                  // נבחר זה עתה בנגיעה
    const play = playableMap();
    const opts = ui.sel !== null ? optionsFrom(ui.sel) : null;
    if (ui.sel !== null) {
      if (c === ui.sel) { ui.sel = null; haptic('soft'); render(); return; }
      if (opts.has(c)) { haptic('select'); startMove(ui.sel, c); return; }
      ui.sel = null; haptic('soft'); render(); return;
    }
    if (play.get(c) && play.get(c).land && !play.get(c).source) { haptic('select'); startLand(c); return; }
  }
  svg.addEventListener('pointerup', (e) => endPointer(e, false));
  svg.addEventListener('pointercancel', (e) => endPointer(e, true));
  svg.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- כפתורים ----------
  $('undoBtn').onclick = () => (settings.mode === 'watch' ? togglePause() : undo());
  $('speedBtn').onclick = cycleSpeed;
  $('logBtn').onclick = () => { const b = $('logBox'); b.hidden = !b.hidden; };
  $('newBtn').onclick = openNew;
  $('newCancel').onclick = () => { $('newModal').hidden = true; };
  $('newStart').onclick = startNew;
  for (const [id, key] of [['grpMode', 'mode'], ['grpSide', 'human'], ['grpLevel', 'level'], ['grpLevelR', 'levelR'], ['grpLevelB', 'levelB'], ['grpSpeed', 'speed']]) {
    $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pending[key] = b.dataset.v; renderNewModal(); });
  }
  $('winNew').onclick = () => { $('overlay').hidden = true; openNew(); };
  $('winClose').onclick = () => { $('overlay').dataset.dismissed = '1'; $('overlay').hidden = true; };

  load(); render();
  window.__province = { get state() { return state; }, get ui() { return ui; }, get settings() { return settings; }, playableMap, optionsFrom };   // לנוחות בדיקה
})();
