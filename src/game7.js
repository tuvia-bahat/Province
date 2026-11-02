/* Province – new-rules prototype: two players on one device (beta). The rules are in rules7.js; this file draws the board and handles taps. */
(function (root) {
  'use strict';
  const R = root.Rules7;
  const $ = (id) => document.getElementById(id);
  const CELL = 52, W = R.N * CELL;
  const COLORS = ['#34c98a', '#3a9cf5'], NAMES = ['Green', 'Blue'];
  let s = null, ui = { R: null, src: null };

  function reset() { s = R.newGame(); ui = { R: null, src: null }; $('g7win').hidden = true; render(); }

  // ---------- drawing ----------
  const cx = (i) => (i % R.N) * CELL + CELL / 2, cy = (i) => Math.floor(i / R.N) * CELL + CELL / 2;
  function edgeMid(a, b) {   // midpoint of the side between neighbouring squares a and b
    const [ax, ay] = R.xy(a), [bx, by] = R.xy(b);
    return ax !== bx ? [Math.max(ax, bx) * CELL, ay * CELL + CELL / 2] : [ax * CELL + CELL / 2, Math.max(ay, by) * CELL];
  }
  function boardSvg() {
    const own = R.owners(s), p = s.turn, rollCells = s.roll ? s.roll.cells : [];
    let h = `<rect x="0" y="0" width="${W}" height="${W}" rx="14" fill="var(--surface)"/>`;
    for (let i = 0; i < R.CELLS; i++) {
      if (own[i] === null) continue;
      const x = (i % R.N) * CELL, y = Math.floor(i / R.N) * CELL;
      h += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${own[i] === 0 ? 'var(--p0-soft)' : 'var(--p1-soft)'}"/>`;
    }
    for (let k = 1; k < R.N; k++) h += `<line x1="${k * CELL}" y1="0" x2="${k * CELL}" y2="${W}" stroke="var(--line)" stroke-width="1.6"/><line x1="0" y1="${k * CELL}" x2="${W}" y2="${k * CELL}" stroke="var(--line)" stroke-width="1.6"/>`;
    h += `<rect x="0.8" y="0.8" width="${W - 1.6}" height="${W - 1.6}" rx="14" fill="none" stroke="var(--line)" stroke-width="1.6"/>`;
    for (const k in s.walls) {   // walls
      const [a, b] = k.split('-').map(Number), [ax, ay] = R.xy(a), [bx, by] = R.xy(b);
      if (ax !== bx) { const x = Math.max(ax, bx) * CELL; h += `<line x1="${x}" y1="${ay * CELL + 3}" x2="${x}" y2="${(ay + 1) * CELL - 3}" stroke="var(--ink)" stroke-width="7" stroke-linecap="round"/>`; }
      else { const y = Math.max(ay, by) * CELL; h += `<line x1="${ax * CELL + 3}" y1="${y}" x2="${(ax + 1) * CELL - 3}" y2="${y}" stroke="var(--ink)" stroke-width="7" stroke-linecap="round"/>`; }
    }
    for (const i of rollCells) {   // the 4 squares of the rolled point
      const x = (i % R.N) * CELL, y = Math.floor(i / R.N) * CELL, chosen = ui.R === i;
      h += `<rect x="${x + 3}" y="${y + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="8" fill="${chosen ? 'rgba(27,30,36,.07)' : 'none'}" stroke="var(--ink)" stroke-width="${chosen ? 3 : 1.8}" ${chosen ? '' : 'stroke-dasharray="5 4"'}/>`;
    }
    for (let i = 0; i < R.CELLS; i++) {   // soldiers
      const c = s.cells[i]; if (c.o === null) continue;
      h += `<circle cx="${cx(i)}" cy="${cy(i)}" r="19" fill="${COLORS[c.o]}"/><text x="${cx(i)}" y="${cy(i) + 6}" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">${c.n}</text>`;
    }
    if (ui.src !== null) {   // chosen base and where it can go
      h += `<circle cx="${cx(ui.src)}" cy="${cy(ui.src)}" r="23" fill="none" stroke="var(--ink)" stroke-width="3"/>`;
      for (const t of targets(ui.src)) {
        const enemy = s.cells[t.to].o === 1 - p;
        h += `<circle cx="${cx(t.to)}" cy="${cy(t.to)}" r="22" fill="none" stroke="${enemy ? '#e24646' : 'var(--ink)'}" stroke-width="2.6" ${enemy ? '' : 'stroke-dasharray="4 4"'}/>`;
      }
    }
    if (s.roll) {   // the floating flag on the point
      const fx = s.roll.vx * CELL, fy = s.roll.vy * CELL;
      h += `<circle cx="${fx}" cy="${fy}" r="4" fill="var(--ink)"/><g class="g7-flag" style="transform-origin:${fx}px ${fy}px"><line x1="${fx}" y1="${fy}" x2="${fx}" y2="${fy - 30}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><path d="M${fx} ${fy - 30}l22 7l-22 8z" fill="${COLORS[p]}" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/></g>`;
    }
    if (ui.R !== null && !s.winner) {   // + on each side of the chosen square: build a wall there
      for (const side of R.wallSides(s, ui.R)) {
        const [mx, my] = edgeMid(side.a, side.b);
        h += `<g data-w="${side.a}-${side.b}" class="g7-plus"><circle cx="${mx}" cy="${my}" r="12" fill="var(--ink)"/><path d="M${mx - 5} ${my}h10M${mx} ${my - 5}v10" stroke="var(--bg)" stroke-width="2.6" stroke-linecap="round"/></g>`;
      }
    }
    return h;
  }
  function targets(from) {   // squares the chosen base can go to: neighbours (move / attack) and straight lines through the territory (transport)
    const seen = new Map();
    for (const j of R.moveTargets(s, from)) seen.set(j, { to: j, type: 'move' });
    for (const t of R.transportTargets(s, from)) if (!seen.has(t.to)) seen.set(t.to, { to: t.to, type: 'transport' });
    return [...seen.values()];
  }

  function panel(p) {
    const el = $('g7p' + p), cur = s.turn === p && !s.winner, big = R.territorySize(s, p);
    el.className = 'g7-pl' + (cur ? ' active' : '');
    el.innerHTML = `<div class="g7-head"><i style="background:${COLORS[p]}"></i><b>${NAMES[p]}</b>${cur && s.roll ? `<span class="g7-dice">${s.roll.w}<u></u>${s.roll.b}</span><span class="g7-tag">roll ${s.rolls} of ${R.MAX_ROLLS}</span>` : cur ? '<span class="g7-tag">your turn</span>' : ''}</div>
      <div class="g7-stats"><span>Camp <b>${R.camp(s, p)}</b></span><span>Walls <b>${s.wallsLeft[p]}</b></span><span>Territory <b>${big}</b>/${R.WIN}</span></div>
      <div class="g7-prog"><i style="width:${Math.min(100, 100 * big / R.WIN)}%;background:${COLORS[p]}"></i></div>`;
  }

  function dock() {
    const d = $('g7dock'), msg = $('g7msg'); d.innerHTML = '';
    const btn = (text, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = text; b.onclick = fn; d.appendChild(b); };
    if (s.winner !== null) { msg.textContent = ''; return; }
    const name = NAMES[s.turn];
    if (!s.roll) { msg.innerHTML = `<b style="color:${COLORS[s.turn]}">${name}</b>: roll the dice`; btn('Roll dice', 'wide', () => doRoll()); return; }
    if (ui.R === null) msg.textContent = 'Tap one of the 4 squares around the flag';
    else if (ui.src === null) msg.textContent = 'Land or withdraw below, tap one of your bases to move it, or tap + to build a wall';
    else msg.textContent = 'Tap a highlighted square: move, attack or transport';
    if (ui.R !== null) {
      if (R.canLand(s, ui.R)) btn('Land', '', () => openSheet('Land soldiers', R.camp(s, s.turn), Math.min(R.camp(s, s.turn), 4), (n) => commit({ type: 'land', R: ui.R, count: n })));
      if (R.canWithdraw(s, ui.R)) btn('Withdraw', 'soft', () => openSheet('Withdraw soldiers', s.cells[ui.R].n, s.cells[ui.R].n, (n) => commit({ type: 'withdraw', R: ui.R, count: n })));
    }
    if (s.rolls < R.MAX_ROLLS) btn(`Re-roll (${R.MAX_ROLLS - s.rolls} left)`, 'soft', () => doRoll());
    if (s.rolls >= R.MAX_ROLLS) btn('Pass', 'soft', () => commit({ type: 'pass' }));   // passing is possible only after the third roll
  }

  function render() {
    $('g7board').innerHTML = boardSvg();
    panel(0); panel(1); dock();
    if (s.winner !== null) { $('g7wintxt').innerHTML = `<span style="color:${COLORS[s.winner]}">${NAMES[s.winner]}</span> wins!`; $('g7win').hidden = false; }
  }

  // ---------- actions ----------
  function doRoll() {
    s = R.roll(s, 1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)); ui = { R: null, src: null }; render();
  }
  function commit(act) {
    try { s = R.apply(s, act); } catch (e) { $('g7msg').textContent = 'Not allowed: ' + e.message; return; }
    ui = { R: null, src: null }; render();
  }
  function openSheet(title, max, def, ok) {
    let n = Math.max(1, Math.min(max, def));
    $('g7sheetTitle').textContent = title; const r = $('g7range'); r.min = 1; r.max = max; r.value = n; $('g7count').textContent = n;
    r.oninput = () => { n = +r.value; $('g7count').textContent = n; };
    $('g7sheetOk').onclick = () => { $('g7sheet').hidden = true; ok(n); };
    $('g7sheetCancel').onclick = () => { $('g7sheet').hidden = true; };
    $('g7sheet').hidden = false;
  }

  function onBoardTap(e) {
    if (s.winner !== null) return;
    const w = e.target.closest('[data-w]');
    if (w) { const [a, b] = w.dataset.w.split('-').map(Number); commit({ type: 'wall', R: ui.R, a, b }); return; }
    if (!s.roll) return;
    const bb = $('g7board').getBoundingClientRect(), sc = W / bb.width;
    const x = Math.floor(((e.clientX - bb.left) * sc) / CELL), y = Math.floor(((e.clientY - bb.top) * sc) / CELL);
    if (x < 0 || x >= R.N || y < 0 || y >= R.N) return;
    const i = R.idx(x, y), rolled = s.roll.cells.includes(i);
    if (ui.src !== null) {
      const t = targets(ui.src).find((q) => q.to === i);
      if (t) {   // move / attack / transport: ask how many
        const from = ui.src, n = s.cells[from].n, enemy = s.cells[i].o === 1 - s.turn;
        openSheet(enemy ? 'Attack with' : t.type === 'transport' ? 'Transport' : 'Move', n, n, (c) => commit({ type: t.type, R: ui.R, from, to: i, count: c }));
        return;
      }
    }
    if (ui.R !== null && s.cells[i].o === s.turn && R.sources(s, ui.R).includes(i)) { ui.src = ui.src === i ? null : i; render(); return; }
    if (rolled) { ui = { R: ui.R === i ? null : i, src: null }; render(); return; }
    ui.src = null; render();
  }

  function init() {
    if (!R || !$('g7')) return;
    $('g7board').addEventListener('click', onBoardTap);
    $('g7Exit').onclick = () => close();
    $('g7New').onclick = () => { if (window.confirm('Start a new game?')) reset(); };
    $('g7winNew').onclick = () => reset();
    $('g7winExit').onclick = () => close();
  }
  function open() { if (!s) reset(); $('g7').hidden = false; render(); }
  function close() { $('g7').hidden = true; $('g7sheet').hidden = true; }

  root.Game7 = { open, close, reset, get state() { return s; }, get ui() { return ui; }, setState(ns) { s = ns; ui = { R: null, src: null }; render(); } };   // setState: test hook
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
