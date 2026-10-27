// Test helper (run in the browser console on index.html?beta=1): plays the tutorial through the real UI with taps only.
// window.__go(n, stage): plays lessons 1..n-1, stops inside lesson n after the roll ('roll') or after selecting the base ('sel').
// window.__full(): plays all lessons and collects card heights + whether the card covers the move's squares into window.__rep.
(() => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const setup = () => {
    const P = window.__province, R = P.R, TN = window.TUTORIAL_V3;
    const el = document.getElementById('board');
    const pt = (c) => { const r = el.getBoundingClientRect(), vb = el.viewBox.baseVal, sc = r.width / vb.width; return { clientX: r.left + P.cellX(c) * sc, clientY: r.top + P.cellY(c) * sc, pointerId: 1, bubbles: true, isPrimary: true, button: 0 }; };
    const tap = async (c) => { el.dispatchEvent(new PointerEvent('pointerdown', pt(c))); el.dispatchEvent(new PointerEvent('pointerup', pt(c))); await w(250); };
    const btn = (re) => [...document.querySelectorAll('#controls button, #coach button')].find((b) => re.test(b.textContent) && b.offsetParent !== null);
    const rect = () => document.getElementById('coach').getBoundingClientRect();
    const covers = (c) => { const q = pt(c), r = rect(); return !document.getElementById('coach').hidden && q.clientX > r.left && q.clientX < r.right && q.clientY > r.top - 14 && q.clientY < r.bottom + 14; };
    return { P, R, humans: TN.steps.filter((s) => s.who === 0), tap, btn, rect, covers };
  };
  async function start() {
    window.__fxScale = 0.05;
    await w(1000);
    document.getElementById('lbPlus').click(); await w(200);
    document.getElementById('lbTut').click(); await w(600);
  }
  async function run(target, stage, rep) {
    await start();
    const { P, R, humans, tap, btn, rect, covers } = setup();
    while (btn(/^next$|let.?s play/i)) { btn(/^next$|let.?s play/i).click(); await w(250); }
    for (let k = 0; k < Math.min(target, humans.length); k++) {
      const st = humans[k], a = st.act, idx = (c) => R.idx(c[0], c[1]);
      let rb = null;
      for (let i = 0; i < 100; i++) { while (btn(/^next$|^got it$/i)) { btn(/^next$|^got it$/i).click(); await w(250); } rb = [...document.querySelectorAll('#controls button')].find((b) => /roll/i.test(b.textContent)); if (rb && !document.getElementById('coach').hidden) break; await w(100); }
      const r0 = { k: k + 1, h: Math.round(rect().height), covIntro: [a.from, a.to].filter(Boolean).filter((c) => covers(idx(c))).length };
      rb.click(); await w(600);
      const rrb = btn(/re-roll/i); if (rrb) { if (rep) r0.reroll = true; if (!rep && stage === 'rr' && k === target - 1) return 'at re-roll ' + (k + 1); rrb.click(); await w(500); }   // beta: lessons with a re-roll
      r0.h2 = Math.round(rect().height); r0.covered = [a.from, a.to].filter(Boolean).filter((c) => covers(idx(c))).length;
      if (k === target - 1 && stage) { if (stage === 'sel' && a.from) await tap(idx(a.from)); return 'stopped at ' + (k + 1); }
      if (a.type === 'skip') { btn(/pass/i).click(); await w(800); }
      else if (a.type === 'land') { await tap(idx(a.to)); await w(300); document.getElementById('ok').click(); await w(900); }
      else { await tap(idx(a.from)); r0.coverSel = [a.to].filter((c) => covers(idx(c))).length; await tap(idx(a.to)); await w(300); document.getElementById('ok').click(); await w(900); }
      if (rep) rep.rep.push(r0);
      for (let i = 0; i < 60; i++) { if (P.state.winner !== null) break; if (P.state.turn === 0 && !document.getElementById('coach').hidden) break; await w(150); }
      if (P.state.winner !== null) break;
    }
    if (rep) rep.winner = P.state.winner;
  }
  window.__go = (n, stage) => { window.__goRes = null; run(n, stage || 'roll').then((r) => { window.__goRes = r || 'done'; }); return 'go'; };
  window.__full = () => { window.__rep = { done: false, rep: [], err: null }; run(99, null, window.__rep).catch((e) => { window.__rep.err = String(e && e.stack || e); }).then(() => { window.__rep.done = true; }); return 'started'; };
})();
