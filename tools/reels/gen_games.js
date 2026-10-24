// Plays net-vs-net games on the real engine and writes, for every game, the full move log with a snapshot of the board after each event,
// plus a list of "highlights" (moments good for a meme). Used by make_reels.py.
//   node tools/reels/gen_games.js --games 80 --procs 16 --out tools/reels/games
const fs = require('fs'), path = require('path'), cp = require('child_process');
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const GAMES = +opt('games', 40), PROCS = +opt('procs', 8), OUT = path.resolve(opt('out', path.join(__dirname, 'games'))), WORKER = opt('worker', null), SIZE = +opt('size', 6);
const root = path.resolve(__dirname, '..', '..');
global.Rules = require(path.join(root, 'src/rules.js')); global.NN = require(path.join(root, 'src/nn.js')); global.VNet = require(path.join(root, 'src/vnet.js'));
const R = Rules.forSize(SIZE); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
const snap = (s) => ({ cells: s.cells.map((c) => [c.o === null ? -1 : c.o, c.n]), bridges: s.bridges, grave: s.graveyard.slice(), camp: [R.camp(s, 0), R.camp(s, 1)], turn: s.turn, winner: s.winner,
  ctl: R.provinceControl(s).map((o) => (o === null ? -1 : o)), prog: [R.winProgress(s, 0), R.winProgress(s, 1)], roll: s.roll ? { w: s.roll.w, b: s.roll.b, cells: s.roll.cells } : null });

function play(seed) {
  const V = VNet.make(SIZE); const buf = fs.readFileSync(path.join(root, 'src', 'vnet' + SIZE + '.bin')); V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  let s = R.newGame(); const events = [], snaps = [snap(s)];
  for (let t = 0; t < 220 && s.winner === null; t++) {
    const p = s.turn; s = R.roll(s, 1 + Math.floor(Math.random() * SIZE), 1 + Math.floor(Math.random() * SIZE));
    events.push({ kind: 'roll', actor: p, data: { w: s.roll.w, b: s.roll.b } }); snaps.push(snap(s));
    let a, ns, kind, data;
    if (!R.hasAnyMove(s)) { ns = R.skipTurn(s); kind = 'skip'; data = {}; }
    else { a = V.chooseAction(s, { maxEvals: 220 }); if (a.type === 'pass') { ns = R.passTurn(s); kind = 'skip'; data = { pass: true }; } else { ns = R.apply(s, a); kind = 'act'; data = a; } }
    const killed = kind === 'act' && data.type === 'move' && s.cells[data.to] && s.cells[data.to].o === 1 - p ? Math.min(data.count, s.cells[data.to].n) : 0;
    events.push({ kind, actor: p, data, killed }); s = ns; snaps.push(snap(s));
  }
  return { seed, size: SIZE, events, snaps, winner: s.winner };
}

function highlights(g) {
  const H = [], E = g.events, S = g.snaps;
  for (let i = 0; i < E.length; i++) {
    const e = E[i]; if (e.kind === 'roll') continue;
    const before = S[i], after = S[i + 1], p = e.actor, q = 1 - p;     // snaps[i] = state right after the roll of this turn
    const held = (st, who) => st.ctl.filter((o) => o === who).length;
    if (e.kind === 'act' && e.data.count === 1 && (e.data.type === 'move' || e.data.type === 'land') && held(after, q) < held(before, q) && held(before, q) >= 3)
      H.push({ type: 'lone', at: i, score: held(before, q) });
    if (e.kind === 'act' && e.killed >= 8) H.push({ type: 'wipe', at: i, score: e.killed });
    if (e.kind === 'act' && e.data.type === 'land' && e.data.count >= 18) H.push({ type: 'bigland', at: i, score: e.data.count });
    if (e.kind === 'skip' && !e.data.pass && before.prog[p] >= 4) H.push({ type: 'skipclose', at: i, score: before.prog[p] });
    if (e.kind === 'act' && e.data.type === 'bridge' && Object.values(before.bridges).includes(q) && after.bridges) H.push({ type: 'bridge', at: i, score: 1 });
  }
  const last = S[S.length - 1];
  if (g.winner !== null && last.prog[1 - g.winner] >= 4) H.push({ type: 'nearwin', at: E.length - 1, score: last.prog[1 - g.winner] });
  return H;
}

if (WORKER !== null) {
  const [n, total] = WORKER.split('/').map(Number); const res = [];
  for (let g = n; g < GAMES; g += total) { const game = play(g); game.highlights = highlights(game); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `g${String(g).padStart(3, '0')}.json`), JSON.stringify(game)); res.push({ g, hl: game.highlights.map((h) => h.type), len: game.events.length, winner: game.winner }); }
  console.log(JSON.stringify(res));
} else {
  let done = 0; const all = [];
  for (let i = 0; i < PROCS; i++) {
    const c = cp.spawn(process.execPath, [__filename, '--games', GAMES, '--out', OUT, '--size', SIZE, '--worker', `${i}/${PROCS}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => { try { all.push(...JSON.parse(out.trim().split('\n').pop())); } catch (e) { /* ignore */ } if (++done === PROCS) {
      const cnt = {}; for (const r of all) for (const t of new Set(r.hl)) cnt[t] = (cnt[t] || 0) + 1;
      console.log(`${all.length} games; games containing each highlight:`, JSON.stringify(cnt)); } });
  }
}
