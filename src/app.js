/* Province – ממשק משתמש (שני שחקנים על מכשיר אחד). הלוגיקה כולה ב-rules.js */
(function () {
  'use strict';
  const R = window.Rules;
  const SAVE_KEY = 'province.save.v1';
  const COLOR = ['var(--p0)', 'var(--p1)'];
  const NAME = R.NAMES;

  // ---------- גיאומטריה של הלוח ----------
  const P = 64, G = 28, M = 34, W = 2 * M + 6 * P + 2 * G;
  const cx = (x) => M + x * P + Math.floor(x / 2) * G + P / 2;
  const cy = (y) => { const r = 5 - y; return M + r * P + Math.floor(r / 2) * G + P / 2; };
  const cellX = (i) => cx(R.xy(i)[0]);
  const cellY = (i) => cy(R.xy(i)[1]);

  // ---------- מצב ----------
  let state, history, ui;
  const $ = (id) => document.getElementById(id);
  const fresh = () => ({ phase: 'roll', R: null, type: null, from: null, to: null, tgt: null, count: 1, stack: [] });

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.state && d.state.cells.length === R.CELLS) { state = d.state; history = d.history || []; return; } }
    } catch (e) { /* ignore */ }
    state = R.newGame(); history = [];
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state, history: history.slice(-60) })); } catch (e) { /* ignore */ }
  }
  function resetUiFromState() {
    ui = fresh();
    if (state.winner !== null) ui.phase = 'over';
    else if (!state.roll) ui.phase = 'roll';
    else afterRoll();
  }

  // ---------- זרימת מהלך ----------
  const playableCells = () => state.roll.cells.filter((c) => R.actionTypes(state, c).length > 0);

  function afterRoll() {
    ui = fresh();
    const pl = playableCells();
    if (pl.length === 0) ui.phase = 'skip';
    else if (pl.length === 1) selectR(pl[0]);
    else ui.phase = 'choose';
  }
  function snapshot() { const { stack, ...rest } = ui; ui.stack.push(rest); }
  function back() { if (ui.stack.length) { const prev = ui.stack.pop(); Object.assign(ui, prev); render(); } }

  function selectR(c) {
    ui.R = c;
    const types = R.actionTypes(state, c);
    if (types.length === 1) startAction(types[0]);
    else ui.phase = 'action';
  }
  function startAction(type) {
    ui.type = type; ui.from = ui.to = ui.tgt = null;
    if (type === 'land') { ui.phase = 'count'; ui.count = 1; return; }
    const srcs = R.sources(state, type, ui.R);
    if (srcs.length === 1) { ui.from = srcs[0]; afterSource(); } else ui.phase = 'source';
  }
  function afterSource() {
    if (ui.type === 'withdraw') { toCount(); return; }
    const ts = R.targets(state, ui.type, ui.R, ui.from);
    if (ts.length === 1) { ui.to = ts[0].to; ui.tgt = ts[0]; afterTarget(); } else ui.phase = 'target';
  }
  function afterTarget() { if (ui.type === 'bridge') ui.phase = 'confirm'; else toCount(); }
  function toCount() { ui.phase = 'count'; ui.count = R.maxCount(state, ui.type, ui.from); }

  function commit() {
    const a = { type: ui.type, R: ui.R, from: ui.from, to: ui.to, count: ui.type === 'bridge' ? 0 : ui.count };
    let ns;
    try { ns = R.apply(state, a); } catch (e) { console.error(e); return; }
    history.push(state); state = ns;
    ui = fresh(); if (state.winner !== null) ui.phase = 'over';
    save(); render();
  }
  function doRoll() {
    state = R.roll(state, 1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6));
    afterRoll(); ui.rolled = true; save(); render();
  }
  function doSkip() { history.push(state); state = R.skipTurn(state); resetUiFromState(); save(); render(); }
  function doPass() { history.push(state); state = R.passTurn(state); resetUiFromState(); save(); render(); }
  function undo() {
    if (!history.length) return;
    state = history.pop(); resetUiFromState(); save(); render();
  }
  // אישור בתוך הדף (חלונות confirm לא זמינים בכל סביבה): לחיצה ראשונה מבקשת אישור, שנייה מבצעת
  let newArmed = null;
  function newGame() {
    const btn = $('newBtn');
    if (state.log.length && state.winner === null && !newArmed) {
      btn.textContent = 'לחץ שוב למחיקת המשחק';
      newArmed = setTimeout(() => { newArmed = null; btn.textContent = 'משחק חדש'; }, 3000);
      return;
    }
    clearTimeout(newArmed); newArmed = null; btn.textContent = 'משחק חדש';
    state = R.newGame(); history = []; resetUiFromState(); save(); render();
  }

  // ---------- עזרי תצוגה ----------
  function tappable() {
    const set = new Map();
    if (ui.phase === 'choose') playableCells().forEach((c) => set.set(c, 'R'));
    else if (ui.phase === 'source') R.sources(state, ui.type, ui.R).forEach((c) => set.set(c, 'S'));
    else if (ui.phase === 'target') R.targets(state, ui.type, ui.R, ui.from).forEach((t) => set.set(t.to, 'T'));
    return set;
  }
  const svgEl = (tag, attrs, text) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function renderBoard() {
    const svg = $('board');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    svg.textContent = '';
    const add = (e) => { svg.appendChild(e); return e; };
    const control = R.provinceControl(state);

    add(svgEl('rect', { x: 0, y: 0, width: W, height: W, rx: 18, fill: '#a8733a' }));
    for (let py = 0; py < 3; py++) for (let px = 0; px < 3; px++) {
      const x = M + 2 * px * P + px * G, y = M + 2 * py * P + py * G;
      add(svgEl('rect', { x, y, width: 2 * P, height: 2 * P, rx: 12, fill: '#c99b5e' }));
      const owner = control[(2 - py) * 3 + px];   // שורה 0 למעלה בתצוגה = שורת פרובינציות 2
      if (owner !== null) add(svgEl('rect', { x, y, width: 2 * P, height: 2 * P, rx: 12, fill: owner === 0 ? '#c0392b' : '#2a5db0', opacity: 0.28 }));
    }
    // נהרות
    for (let k = 1; k <= 2; k++) {
      const pos = M + 2 * k * P + (k - 1) * G + G / 2;
      add(svgEl('line', { x1: pos, y1: 10, x2: pos, y2: W - 10, stroke: '#fff', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.92 }));
      add(svgEl('line', { x1: 10, y1: pos, x2: W - 10, y2: pos, stroke: '#fff', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.92 }));
    }
    // תוויות צירים: שחקן 0 (אדום) למטה ומשמאל, שחקן 1 (כחול) למעלה ומימין
    for (let i = 0; i < 6; i++) {
      add(svgEl('text', { x: cx(i), y: W - 13, class: 'axis a0' }, i + 1));
      add(svgEl('text', { x: cx(i), y: 14, class: 'axis a1' }, 6 - i));
      add(svgEl('text', { x: 14, y: cy(i), class: 'axis a0' }, i + 1));
      add(svgEl('text', { x: W - 14, y: cy(i), class: 'axis a1' }, 6 - i));
    }
    // גשרים
    for (const key in state.bridges) {
      const [a, b] = key.split('-').map(Number);
      const ax = cellX(a), ay = cellY(a), bx = cellX(b), by = cellY(b);
      const horiz = ay === by;
      const len = horiz ? Math.abs(bx - ax) - 44 : Math.abs(by - ay) - 44;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      add(svgEl('rect', {
        x: horiz ? mx - len / 2 : mx - 8, y: horiz ? my - 8 : my - len / 2,
        width: horiz ? len : 16, height: horiz ? 16 : len, rx: 4,
        fill: state.bridges[key] === 0 ? '#c0392b' : '#2a5db0', stroke: '#fff', 'stroke-width': 2.5,
      }));
    }
    // משבצות
    const tap = tappable();
    const pl = ui.phase === 'choose' ? playableCells() : [];
    for (let i = 0; i < R.CELLS; i++) {
      const x = cellX(i), y = cellY(i), c = state.cells[i];
      if (c.o === null) add(svgEl('circle', { cx: x, cy: y, r: 7, class: 'dot' }));
      else {
        add(svgEl('circle', { cx: x, cy: y, r: 25, class: 'base p' + c.o }));
        add(svgEl('text', { x, y: y + 1, class: 'cnt' }, c.n));
      }
    }
    // טבעות הדגשה
    const ring = (i, cls, r, extra) => add(svgEl('circle', Object.assign({ cx: cellX(i), cy: cellY(i), r, class: 'ring ' + cls }, extra)));
    if (state.roll && state.winner === null) {
      // שתי המשבצות שהוטלו מסומנות תמיד, גם אם אי אפשר לשחק באחת מהן
      state.roll.cells.forEach((c) => ring(c, 'roll', 31, { stroke: 'white' }));
      pl.forEach((c) => ring(c, 'roll pulse', 36, { stroke: state.turn === 0 ? '#ff6b5b' : '#6fa0ff' }));
    }
    if (ui.R !== null && ui.phase !== 'choose') ring(ui.R, 'sel', 32);
    if (ui.phase === 'source') R.sources(state, ui.type, ui.R).forEach((c) => ring(c, 'src pulse', 31));
    if (ui.from !== null) ring(ui.from, 'src', 31);
    if (ui.phase === 'target') R.targets(state, ui.type, ui.R, ui.from).forEach((t) => ring(t.to, 't-' + t.kind + ' pulse', 31));
    if (ui.to !== null) ring(ui.to, 't-' + (ui.tgt ? ui.tgt.kind : 'move'), 31);
    // אזורי לחיצה
    for (let i = 0; i < R.CELLS; i++) {
      const h = svgEl('circle', { cx: cellX(i), cy: cellY(i), r: 31, class: 'hit' + (tap.has(i) ? ' tap' : ''), 'data-i': i });
      add(h);
    }
  }

  function renderPanels() {
    for (const p of [0, 1]) {
      const el = $('panel' + p);
      el.style.setProperty('--c', COLOR[p]);
      el.classList.toggle('active', state.turn === p && state.winner === null);
      el.innerHTML = `<div class="name"><span>${NAME[p]}</span><small>${p === 0 ? 'למטה' : 'למעלה'}${state.turn === p && state.winner === null ? ' · בתור' : ''}</small></div>
        <div class="stats">
          <span>מחנה <b>${R.camp(state, p)}</b></span><span>גשרים <b>${state.bridgesLeft[p]}</b></span>
          <span>בית קברות <b>${state.graveyard[p]}</b></span><span class="prov">פרובינציות <b>${R.provincesHeld(state, p)}/${R.WIN_PROVINCES}</b></span>
        </div>`;
    }
  }

  function renderDice() {
    const box = $('dice');
    if (!state.roll) { box.innerHTML = '<span class="dice-note">הקוביות עדיין לא הוטלו</span>'; return; }
    const { w, b } = state.roll, cls = ui.rolled ? ' roll' : '';
    box.innerHTML = `<div class="die white${cls}" title="ציר X">${w}</div><div class="die brown${cls}" title="ציר Y">${b}</div>
      <span class="dice-note">לבנה = X · חומה = Y<br><bdi dir="ltr">(${w},${b})</bdi> ו-<bdi dir="ltr">(${7 - w},${7 - b})</bdi></span>`;
    ui.rolled = false;
  }

  function targetInfoHtml() {
    const t = ui.tgt, p = state.turn;
    let s = '';
    if (t && t.cross === 'place') s += ` <span class="br">· יונח גשר (נותרו ${state.bridgesLeft[p]})</span>`;
    if (t && t.cross === 'replace') s += ` <span class="br">· יוחלף גשר היריב</span>`;
    return s;
  }
  function previewHtml() {
    const p = state.turn, n = ui.count;
    if (ui.type === 'land') return `הנחתת <b>${n}</b> חיילים ב-${R.cellLabel(ui.R, p)} <span class="sub">נותרו במחנה: ${R.camp(state, p) - n}</span>`;
    if (ui.type === 'withdraw') return `משיכת <b>${n}</b> חיילים מ-${R.cellLabel(ui.from, p)} למחנה`;
    if (ui.type === 'transport') return `שינוע <b>${n}</b> חיילים מ-${R.cellLabel(ui.from, p)} אל ${R.cellLabel(ui.to, p)}`;
    if (ui.tgt && ui.tgt.kind === 'attack') {
      const d = state.cells[ui.to].n, k = Math.min(n, d);
      const out = n > d ? `<span class="good">${n - d} יישארו וישלטו במשבצת</span>` : n === d ? 'המשבצת תתרוקן' : `יישארו ${d - n} מגינים`;
      return `<span class="bad">התקפה</span> עם <b>${n}</b> מול <b>${d}</b> מגינים${targetInfoHtml()}<span class="sub">${k} יהרגו ו-${k} חזרו למחנה · ${out}</span>`;
    }
    return `הזזת <b>${n}</b> חיילים מ-${R.cellLabel(ui.from, p)} אל ${R.cellLabel(ui.to, p)}${targetInfoHtml()}`;
  }

  const ACTION_LABEL = {
    land: () => (state.cells[ui.R].o === state.turn ? 'תגבור (הנחתת חיילים)' : 'הנחתת חיילים'),
    move: () => (state.cells[ui.R].o === state.turn ? 'תנועה / התקפה' : state.cells[ui.R].o === null ? 'תנועה למשבצת' : 'התקפה'),
    transport: () => 'שינוע כוחות',
    withdraw: () => 'נסיגה למחנה',
    bridge: () => 'הנחת גשר',
  };

  function renderDock() {
    const msg = $('msg'), ctl = $('controls');
    const p = state.turn, nm = `<b style="color:${COLOR[p]}">${NAME[p]}</b>`;
    ctl.textContent = '';
    const btn = (label, cls, fn, disabled) => {
      const b = document.createElement('button');
      b.textContent = label; b.className = cls || '';
      if (disabled) b.disabled = true;
      b.addEventListener('click', fn); ctl.appendChild(b); return b;
    };
    const backBtn = () => { if (ui.stack.length) btn('חזרה', 'ghost', back); };
    ctl.style.removeProperty('--c');
    ctl.style.setProperty('--c', COLOR[p]);

    switch (ui.phase) {
      case 'over': {
        msg.innerHTML = `<b style="color:${COLOR[state.winner]}">${NAME[state.winner]}</b> ניצח!`;
        btn('משחק חדש', 'primary', newGame);
        break;
      }
      case 'roll':
        msg.innerHTML = `תור ${nm}`;
        btn('הטל קוביות', 'primary', doRoll);
        break;
      case 'skip':
        msg.innerHTML = `${nm}: אין מהלך אפשרי באף אחת מהמשבצות<span class="sub">התור עובר ליריב</span>`;
        btn('המשך', 'primary', doSkip);
        break;
      case 'choose':
        msg.innerHTML = `${nm}: בחר אחת משתי המשבצות המסומנות`;
        break;
      case 'action': {
        msg.innerHTML = `${nm}: משבצת ${R.cellLabel(ui.R, p)} – בחר פעולה`;
        R.actionTypes(state, ui.R).forEach((t) => btn(ACTION_LABEL[t](), 'act', () => { snapshot(); startAction(t); render(); }));
        backBtn();
        break;
      }
      case 'source':
        msg.innerHTML = `${nm}: ${ui.type === 'transport' ? 'בחר בסיס שממנו משנעים' : ui.type === 'bridge' ? 'בחר בסיס שממנו מניחים גשר' : ui.type === 'withdraw' ? 'בחר בסיס למשיכת חיילים' : 'בחר בסיס מקור'}`;
        backBtn();
        break;
      case 'target':
        msg.innerHTML = `${nm}: ${ui.type === 'bridge' ? 'בחר מעבר לנהר להנחת הגשר' : 'בחר יעד'}` +
          (ui.type === 'move' ? '<span class="sub"><span class="good">ירוק</span> – תנועה · <span class="bad">כתום</span> – התקפה</span>' : '');
        backBtn();
        break;
      case 'confirm': {
        const t = ui.tgt;
        msg.innerHTML = t.cross === 'replace'
          ? `החלפת גשר היריב בגשר שלך <span class="sub">נותרו לך ${state.bridgesLeft[p]} גשרים</span>`
          : `הנחת גשר חדש <span class="sub">נותרו לך ${state.bridgesLeft[p]} גשרים (לא ניתן להסיר גשר)</span>`;
        backBtn(); btn('אישור', 'primary', commit);
        break;
      }
      case 'count': {
        const max = R.maxCount(state, ui.type, ui.from);
        ui.count = Math.max(1, Math.min(max, ui.count));
        msg.innerHTML = previewHtml();
        const box = document.createElement('div'); box.className = 'stepper';
        box.innerHTML = `<div class="row"><button class="pm" id="minus">−</button><div class="num" id="num">${ui.count}</div><button class="pm" id="plus">+</button></div>
          <div class="row"><input type="range" id="rng" min="1" max="${max}" value="${ui.count}"></div>
          <div class="quick"><button id="q1">1</button><button id="qh">חצי</button><button id="qa">הכל (${max})</button></div>`;
        ctl.appendChild(box);
        const set = (v) => { ui.count = Math.max(1, Math.min(max, v)); renderDock(); renderPass(); };
        box.querySelector('#minus').onclick = () => set(ui.count - 1);
        box.querySelector('#plus').onclick = () => set(ui.count + 1);
        box.querySelector('#rng').oninput = (e) => set(+e.target.value);
        box.querySelector('#q1').onclick = () => set(1);
        box.querySelector('#qh').onclick = () => set(Math.ceil(max / 2));
        box.querySelector('#qa').onclick = () => set(max);
        const row = document.createElement('div'); row.className = 'btnrow'; ctl.appendChild(row);
        const mk = (label, cls, fn) => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = fn; row.appendChild(b); };
        if (ui.stack.length) mk('חזרה', 'ghost', back);
        mk('אישור', 'primary', commit);
        break;
      }
    }
  }

  function renderPass() {
    if (!['choose', 'action', 'source', 'target', 'count', 'confirm'].includes(ui.phase)) return;
    const b = document.createElement('button');
    b.textContent = 'דלג על התור'; b.className = 'ghost pass'; b.onclick = doPass;
    $('controls').appendChild(b);
  }

  function renderLog() {
    const box = $('logBox');
    box.innerHTML = state.log.slice(-40).reverse().map((l) => `<div>${l}</div>`).join('') || '<div>אין עדיין מהלכים</div>';
  }

  function render() {
    renderPanels(); renderBoard(); renderDice(); renderDock(); renderPass(); renderLog();
    $('undoBtn').disabled = history.length === 0;
    const o = $('overlay');
    if (state.winner !== null && !ui.dismissWin) {
      $('winTitle').innerHTML = `<span style="color:${COLOR[state.winner]}">${NAME[state.winner]}</span> ניצח!`;
      o.hidden = false;
    } else o.hidden = true;
  }

  // ---------- אירועים ----------
  $('board').addEventListener('click', (e) => {
    const t = e.target.closest('.hit.tap'); if (!t) return;
    const i = +t.getAttribute('data-i');
    if (ui.phase === 'choose') { snapshot(); selectR(i); }
    else if (ui.phase === 'source') { snapshot(); ui.from = i; afterSource(); }
    else if (ui.phase === 'target') { snapshot(); ui.tgt = R.targets(state, ui.type, ui.R, ui.from).find((x) => x.to === i); ui.to = i; afterTarget(); }
    render();
  });
  $('undoBtn').onclick = undo;
  $('newBtn').onclick = newGame;
  $('logBtn').onclick = () => { const b = $('logBox'); b.hidden = !b.hidden; };
  $('winNew').onclick = () => { state = R.newGame(); history = []; resetUiFromState(); save(); render(); };
  $('winClose').onclick = () => { ui.dismissWin = true; render(); };

  load(); resetUiFromState(); render();
  window.__province = { get state() { return state; }, get ui() { return ui; } };  // לנוחות בדיקה
})();
