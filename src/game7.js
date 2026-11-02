/* Province – new-rules prototype: two players on one device (beta). The rules are in rules7.js.
 * It runs inside the normal game screen (#app): same player panels, dock, count slider and menu as the real game; only the board and the rules differ. */
(function (root) {
  'use strict';
  const R = root.Rules7;
  const $ = (id) => document.getElementById(id);
  const S = 60, W = R.N * S, CR = 21, DOT_R = 7, FS = 18;   // lattice step, board size, base radius, empty-square dot, count font
  const COLORS = ['#34c98a', '#3a9cf5'], NAMES = ['Green', 'Blue'];
  let active = false, s = null, hist = [], ui = { R: null, src: null, sheet: null, rolled: false };

  const fresh = () => ({ R: null, src: null, sheet: null, rolled: false });
  function reset() { s = R.newGame(); hist = []; ui = fresh(); $('overlay').hidden = true; render(); }

  // ---------- board ----------
  const sq = (i, ring) => { const g = ring ? 2 : 5, x = (i % R.N) * S + g, y = (R.N - 1 - Math.floor(i / R.N)) * S + g; return `x="${x}" y="${y}" width="${S - 2 * g}" height="${S - 2 * g}" rx="${ring ? 11 : 9}"`; };
  const cx = (i) => (i % R.N) * S + S / 2, cy = (i) => (R.N - 1 - Math.floor(i / R.N)) * S + S / 2;   // row 1 is at the bottom, like the original game
  const targets = (from) => R.options(s, from);   // where the chosen base can go
  function canPlay(i) { return R.canLand(s, i) || R.canWithdraw(s, i) || R.sources(s, i).length > 0 || R.wallSides(s, i).length > 0 || R.neighbors(s, i).some((j) => s.cells[j].o === s.turn); }
  function renderBoard() {
    const svg = $('board'), own = R.owners(s), p = s.turn, color = COLORS[p];
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    const rolled = s.roll && s.winner === null ? s.roll.cells.filter(canPlay) : [];   // only the squares you can actually play are marked
    const sh = ui.sheet, opts = ui.src !== null && !(sh && sh.kind === 'move') ? new Set([ui.src, ...targets(ui.src).map((t) => t.to)]) : null;
    const involved = opts || (sh ? new Set([sh.from, sh.cell, sh.to].filter((v) => v !== undefined)) : null);
    if (sh && sh.kind === 'adjust') involved.add(sh.cell);
    // a rolled square in your territory: every base that may act from it is marked too
    const playSrc = new Set();
    if (!opts && !sh) for (let i = 0; i < R.CELLS; i++) if (R.options(s, i).length) playSrc.add(i);
    let h = '';
    for (const i of rolled) {   // light fill under the squares of the rolled point where something can be played
      if (!involved || involved.has(i)) h += `<rect class="roll-fill" ${sq(i, 1)} fill="${p ? 'rgba(58,156,245,.16)' : 'rgba(52,201,138,.2)'}"/>`;
    }
    if (sh && sh.to !== undefined) h += `<line class="drag-line" x1="${cx(sh.from)}" y1="${cy(sh.from)}" x2="${cx(sh.to)}" y2="${cy(sh.to)}" stroke="${color}"/>`;
    for (const k in s.walls) {   // walls: a bar across the gap between two neighbouring squares
      const [a, b] = k.split('-').map(Number), [ax] = R.xy(a), [bx] = R.xy(b), mx = (cx(a) + cx(b)) / 2, my = (cy(a) + cy(b)) / 2;
      h += ax !== bx ? `<line class="wall" x1="${mx}" y1="${my - S * 0.42}" x2="${mx}" y2="${my + S * 0.42}"/>` : `<line class="wall" x1="${mx - S * 0.42}" y1="${my}" x2="${mx + S * 0.42}" y2="${my}"/>`;
    }
    for (let i = 0; i < R.CELLS; i++) {
      const c = s.cells[i], x = cx(i), y = cy(i), lit = opts ? opts.has(i) : sh ? involved.has(i) : false;
      const isDest = (opts && i !== ui.src && opts.has(i)) || (sh && sh.to !== undefined && i === sh.to);
      h += `<rect class="cell sq${own[i] !== null ? ' c' + own[i] : ''}${lit && (c.o === null || isDest || rolled.includes(i)) ? ' deep' : ''}" ${sq(i, 0)}/>`;
      if (isDest) h += `<rect class="ring-dest" ${sq(i, 1)} stroke="${color}"/>`;
      else if (rolled.includes(i) && (!involved || involved.has(i))) h += `<rect class="ring-roll" style="animation:none" ${sq(i, 1)} stroke="${color}"/>`;
      if (sh && sh.kind === 'adjust' && sh.cell === i && !isDest) h += `<rect class="ring-dest" ${sq(i, 1)} stroke="${color}"/>`;
      if (playSrc.has(i) && !rolled.includes(i)) h += `<circle class="ring-float" cx="${x}" cy="${y}" r="${CR + 4}"/>`;
      if (ui.src === i && c.o !== null) h += `<circle class="ring-float" cx="${x}" cy="${y}" r="${CR + 4}"/>`;
      if (c.o !== null) h += `<circle data-i="${i}" class="base p${c.o}${isDest ? ' dest' : ''}" cx="${x}" cy="${y}" r="${CR}"/><text data-i="${i}" class="cnt" style="font-size:${FS}px" x="${x}" y="${y + 1}">${c.n}</text>`;
    }
    if (sh && sh.mode === 'wall' && s.winner === null) {   // + on each side of the chosen square: build a wall
      for (const side of R.wallCandidates(s, sh.cell)) {
        const mx = (cx(side.a) + cx(side.b)) / 2, my = (cy(side.a) + cy(side.b)) / 2;
        h += `<g data-w="${side.a}-${side.b}" class="g7-plus"><circle cx="${mx}" cy="${my}" r="11" fill="var(--ink)"/><path d="M${mx - 5} ${my}h10M${mx} ${my - 5}v10" stroke="var(--bg)" stroke-width="2.6" stroke-linecap="round"/></g>`;
      }
    }
    svg.innerHTML = h;
  }

  // ---------- panels (same markup as the real game) ----------
  const dieHtml = (n, roll) => `<span class="die${roll ? ' roll' : ''}">${n}</span>`;
  const IC = {
    prov: '<svg class="ic" viewBox="0 0 16 16"><path d="M4.5 1.5h7v4.2a3.5 3.5 0 0 1-7 0z" fill="currentColor"/><path d="M4.5 3H2.5c0 2.6 1 3.8 2.4 4M11.5 3h2c0 2.6-1 3.8-2.4 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 9.2V12M5.2 14.5h5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    sold: '<svg class="ic" viewBox="0 0 16 16"><path d="M8 0.8l1.7 2.2v7H6.3V3z" fill="currentColor"/><rect x="3.8" y="10" width="8.4" height="1.7" rx=".8" fill="currentColor"/><rect x="7.1" y="11.7" width="1.8" height="2.4" fill="currentColor"/><circle cx="8" cy="14.7" r="1.1" fill="currentColor"/></svg>',
    brid: '<svg class="ic" viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1.5 6.3h13M1.5 9.7h13M8 3v3.3M5 6.3v3.4M11 6.3v3.4M8 9.7V13" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    dead: '<svg class="ic" viewBox="0 0 16 16"><path d="M8 1.2v11.6M4 5h8M2 14.6h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };
  function renderPanels() {
    for (const p of [0, 1]) {
      const el = $('pl' + p);
      el.style.setProperty('--c', COLORS[p]);
      el.className = 'pl' + (s.turn === p && s.winner === null ? ' active' : '');
      const terr = R.territorySize(s, p), held = Math.floor(terr * 5 / R.WIN);   // five boxes: a majority of the board (19 squares) wins
      let prov = '';
      for (let k = 0; k < 5; k++) prov += `<i class="${k < held ? 'on' : ''}"></i>`;
      const tot = R.SOLDIERS, reserve = R.camp(s, p), lost = s.graveyard[p], onB = tot - reserve - lost;
      const w = (n) => (100 * n / tot).toFixed(2) + '%';
      const dice = s.roll && s.winner === null && s.turn === p ? `<span class="dice">${dieHtml(s.roll.w, ui.rolled)}${dieHtml(s.roll.b, ui.rolled)}</span>` : '';
      el.innerHTML = `<div class="head"><span class="swatch"></span><span class="nm">${NAMES[p]}</span><span class="tag"></span>${dice}</div>
        <div class="grid"><div class="line" title="On board ${onB} · Lost ${lost}">${IC.sold}<span class="num">${reserve}</span><div class="sbar"><i class="r" style="width:${w(reserve)}"></i><i class="b" style="width:${w(onB)}"></i></div></div>
        <div class="line provline">${IC.prov}<span class="num">${terr}</span><div class="prov">${prov}</div></div>
        <div class="line brline">${IC.brid}<span class="num">${R.wallCount(s)}</span><div class="ticks"></div></div>
        <div class="line">${IC.dead}<span class="num">${lost}</span><div class="sbar"><i class="d" style="width:${w(lost)}"></i></div></div></div>`;
    }
  }

  // ---------- dock (same buttons and count slider as the real game) ----------
  function renderDock() {
    const msg = $('msg'), ctl = $('controls'), p = s.turn;
    ctl.textContent = ''; msg.innerHTML = '';
    $('dock').classList.toggle('sheeting', !!ui.sheet);
    const row = () => { const r = document.createElement('div'); r.className = 'row'; ctl.appendChild(r); return r; };
    const add = (parent, text, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = text; b.onclick = fn; parent.appendChild(b); return b; };
    if (s.winner !== null) { msg.innerHTML = `<b style="color:${COLORS[s.winner]}">${NAMES[s.winner]}</b> wins`; add(row(), 'New game', 'wide', reset); return; }
    if (!s.roll) { add(row(), 'Roll dice', 'wide', () => doRoll()); return; }
    const sh = ui.sheet;
    if (sh) {
      const box = document.createElement('div'); box.className = 'sheet';
      const names = { add: R.canLand(s, sh.cell) && s.cells[sh.cell].o === p ? 'Reinforce' : 'Land', withdraw: 'Withdraw', wall: 'Wall' };
      const toggle = sh.modes && sh.modes.length > 1 ? `<div class="seg mini" id="modeSeg">${sh.modes.map((m) => `<button data-m="${m}" class="${m === sh.mode ? 'on' : ''}">${names[m]}</button>`).join('')}</div>` : '';
      const cap = !toggle ? `<div class="cap">${sh.cap}</div>` : '';
      if (sh.mode === 'wall') {
        box.innerHTML = `${toggle}${cap}<div class="srow" style="justify-content:center;gap:14px"><div class="note" style="min-height:0">Tap a + to build a wall</div><button class="pm x" id="cancel" aria-label="Cancel">✕</button></div>`;
        ctl.appendChild(box);
        const sg = box.querySelector('#modeSeg'); if (sg) sg.onclick = (e) => { const bt = e.target.closest('button'); if (bt && bt.dataset.m !== sh.mode) { setMode(sh, bt.dataset.m); render(); } };
        box.querySelector('#cancel').onclick = () => { ui.sheet = null; render(); };
        return;
      }
      sh.count = Math.max(sh.min, Math.min(sh.max, sh.count));
      box.innerHTML = `${toggle}${cap}
        <div class="srow"><div class="num" id="shNum"></div><button class="pm" id="minus" aria-label="Less">−</button><input type="range" id="rng" min="${sh.min}" max="${sh.max}" step="1" aria-label="Soldiers"><button class="pm" id="plus" aria-label="More">+</button><button class="pm ok" id="ok" aria-label="Confirm">✓</button><button class="pm x" id="cancel" aria-label="Cancel">✕</button></div>`;
      ctl.appendChild(box);
      const rng = box.querySelector('#rng');
      const view = () => {
        box.querySelector('#shNum').innerHTML = `${sh.count}`;
        rng.value = sh.count;
        rng.style.setProperty('--p', (sh.max === sh.min ? 100 : ((sh.count - sh.min) / (sh.max - sh.min)) * 100) + '%');
      };
      const set = (v) => { sh.count = Math.max(sh.min, Math.min(sh.max, v)); view(); };
      box.querySelector('#minus').onclick = () => set(sh.count - 1);
      box.querySelector('#plus').onclick = () => set(sh.count + 1);
      rng.oninput = (e) => set(+e.target.value);
      const sg = box.querySelector('#modeSeg'); if (sg) sg.onclick = (e) => { const bt = e.target.closest('button'); if (bt && bt.dataset.m !== sh.mode) { setMode(sh, bt.dataset.m); render(); } };
      view();
      box.querySelector('#cancel').onclick = () => { ui.sheet = null; render(); };
      box.querySelector('#ok').onclick = () => commit(sh.build(sh.count));
      return;
    }
    const r = row();
    if (ui.src !== null) { add(r, 'Cancel', 'soft sm', () => { ui.src = null; render(); }); return; }
    add(r, 'Pass', 'soft', () => commit({ type: 'pass' }));   // one roll per turn, no re-roll
  }

  function render() {
    renderPanels(); renderBoard(); ui.rolled = false; renderDock();
    $('logBox').innerHTML = s.log.slice(-40).reverse().map((l) => `<div>${l}</div>`).join('') || '<div>No moves yet</div>';
    $('undoBtn').textContent = 'Undo'; $('undoBtn').hidden = false; $('undoBtn').disabled = hist.length === 0;
    $('speedBtn').hidden = true; $('tutBtn').hidden = true;
    const o = $('overlay');
    if (s.winner !== null) {
      $('winTitle').innerHTML = `<span style="color:${COLORS[s.winner]}">${NAMES[s.winner]}</span> wins`;
      $('winText').hidden = true; $('winTrain').hidden = true; $('winCommunity').hidden = true; $('winNew').textContent = 'New game';
      o.dataset.dismissed = ''; o.hidden = false;
    } else o.hidden = true;
  }

  // ---------- actions ----------
  function doRoll() {
    s = R.roll(s, 1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)); ui = fresh(); ui.rolled = true;
    renderPanels(); renderBoard(); renderDock(); ui.rolled = false;
  }
  function commit(act) {
    let ns;
    try { ns = R.apply(s, act); } catch (e) { ui = fresh(); render(); return; }
    hist.push(s); s = ns; ui = fresh(); render();
  }
  function undo() { if (!hist.length) return; s = hist.pop(); ui = fresh(); render(); }
  function setMode(sh, m) {
    const p = s.turn; sh.mode = m; 
    if (m === 'add') { sh.min = 1; sh.max = R.camp(s, p); sh.count = Math.min(sh.max, 4); sh.build = (n) => ({ type: 'land', R: sh.cell, count: n }); }
    else if (m === 'withdraw') { sh.min = 1; sh.max = s.cells[sh.cell].n; sh.count = sh.max; sh.build = (n) => ({ type: 'withdraw', R: sh.cell, count: n }); }
  }
  function openAdjust(i, src) {   // a tap on a rolled square: the count slider opens at once (land / reinforce, withdraw, or a wall)
    const modes = [];
    if (R.canLand(s, i)) modes.push('add');
    if (R.canWithdraw(s, i)) modes.push('withdraw');
    if (R.wallSides(s, i).length) modes.push('wall');
    ui = fresh(); ui.src = src === undefined ? null : src;
    if (!modes.length) { render(); return; }
    ui.sheet = { kind: 'adjust', cell: i, modes, cap: '' };
    setMode(ui.sheet, modes[0]);
    render();
  }
  function openMove(from, t) {
    const n = s.cells[from].n, enemy = s.cells[t.to].o === 1 - s.turn;
    ui = fresh(); ui.sheet = { kind: 'move', from, to: t.to, cell: t.to, mode: 'move', min: 1, max: n, count: n, cap: enemy ? 'Attack' : t.type === 'transport' ? 'Transport' : 'Move', build: (c) => ({ type: t.type, R: t.R, from, to: t.to, count: c }) };
    render();
  }
  // a base that may move this turn: it belongs to the territory of one of the rolled squares; returns that square
  function mandate(i) { return R.options(s, i).length ? i : null; }
  function cellAt(e) {
    const bb = $('board').getBoundingClientRect(), sc = W / bb.width;
    const x = Math.floor(((e.clientX - bb.left) * sc) / S), y = R.N - 1 - Math.floor(((e.clientY - bb.top) * sc) / S);
    return x < 0 || x >= R.N || y < 0 || y >= R.N ? null : R.idx(x, y);
  }
  let down = null;
  function onDown(e) {
    if (!active || s.winner !== null || !s.roll || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const wl = e.target.closest('[data-w]');
    if (wl) { down = { wall: wl.dataset.w }; return; }
    if (ui.sheet && ui.sheet.kind === 'move') { down = null; return; }
    down = { i: cellAt(e), x: e.clientX, y: e.clientY };
  }
  function onUp(e) {
    const d = down; down = null;
    if (!active || !d || s.winner !== null || !s.roll) return;
    if (d.wall) { const [a, b] = d.wall.split('-').map(Number); commit({ type: 'wall', R: ui.sheet.cell, walls: [[a, b]] }); return; }
    const j = cellAt(e), i = d.i;
    if (i === null) return;
    if (j !== null && j !== i && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) {   // drag a base to a square: move / attack / transport
      const t = targets(i).find((q) => q.to === j);
      if (t) openMove(i, t);
      return;
    }
    const prev = ui.src;
    if (prev !== null) {   // a base is picked: tap a lit square to go there
      const tg = targets(prev).find((q) => q.to === i);
      if (tg) { openMove(prev, tg); return; }
    }
    // like the real game: a tap on a base picks it (its targets light up) and opens the count slider for the square at the same time
    const mv = mandate(i) !== null;
    if (s.roll.cells.includes(i)) { openAdjust(i, mv ? i : null); return; }
    if (mv) { ui = Object.assign(fresh(), { src: prev === i ? null : i }); render(); return; }
    ui.src = null; render();
  }

  // ---------- hooking into the normal screen ----------
  function open() {
    if (!R) return;
    active = true;
    for (const id of ['lobby', 'startModal', 'nameModal', 'overlay', 'coach']) { const el = $(id); if (el) el.hidden = true; }
    $('app').classList.remove('flip'); $('logBox').hidden = true;
    if (!s) { s = R.newGame(); hist = []; ui = fresh(); }
    render();
  }
  function close() { active = false; $('overlay').hidden = true; $('speedBtn').hidden = true; }
  function init() {
    if (!R || !$('app')) return;
    $('board').addEventListener('pointerdown', onDown);
    $('board').addEventListener('pointerup', onUp);
    // the menu buttons of the normal screen: Undo steps back here, Lobby leaves; the rest of the real handlers must not run
    $('bar').addEventListener('click', (e) => {
      if (!active) return;
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'undoBtn') { e.stopPropagation(); undo(); document.getElementById('bar').classList.remove('open'); $('menuBtn').setAttribute('aria-expanded', false); }
      else if (b.id === 'newBtn') close();
    }, true);
    $('winNew').addEventListener('click', (e) => { if (!active) return; e.stopImmediatePropagation(); reset(); }, true);
  }

  root.Game7 = { open, close, reset, get active() { return active; }, get state() { return s; }, get ui() { return ui; }, setState(ns) { s = ns; ui = fresh(); render(); } };   // setState: test hook
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
