// Headless tournament in Node, parallel over processes (no browser needed).
//   node tests/arena_node.js --board 6 --games 100 --procs 8 vnet:tests/vnet6d.bin strong
//   levels: strong | greedy | easy | random | vnet:<path to .bin>
// Plays levels A and B alternating seats and prints A's wins/losses/draws. Uses the live game rules (province territory, connected win).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const levels = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const board = +opt('board', 6), games = +opt('games', 40), procs = +opt('procs', 8), worker = opt('worker', null);
const root = path.resolve(__dirname, '..');

function load() {
  global.Rules = require(path.join(root, 'src/rules.js'));
  global.NN = require(path.join(root, 'src/nn.js'));
  global.AI = require(path.join(root, 'src/ai.js'));
  global.VNet = require(path.join(root, 'src/vnet.js'));
  const R = Rules.forSize(board); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
  return R;
}

function makePlayer(R, spec) {
  const A = AI.forSize(board);
  if (spec.startsWith('vnetm:')) {   // vnetm:<path>:<maxEvals> = thinned candidate list (slow-device mode)
    const [, file, M] = spec.split(':'); const V = VNet.make(board); const buf = fs.readFileSync(path.resolve(root, file));
    V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return (s) => V.chooseAction(s, { maxEvals: +M });
  }
  if (spec.startsWith('vnets:')) {   // vnets:<path>:<K>:<rolls> = the net with a 2-ply search
    const [, file, K, NR] = spec.split(':'); const V = VNet.make(board); const buf = fs.readFileSync(path.resolve(root, file));
    V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return (s) => V.chooseSearch(s, { K: +K || 4, rolls: +NR || 4 });
  }
  if (spec.startsWith('vnet:')) {
    const V = VNet.make(board); const buf = fs.readFileSync(path.resolve(root, spec.slice(5)));
    V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return (s) => V.chooseAction(s);
  }
  if (spec === 'random') return (s) => { const l = A.candidates(s, false); return l.length ? l[Math.floor(Math.random() * l.length)] : { type: 'pass' }; };
  return (s) => A.chooseAction(s, spec);
}

if (worker !== null) {   // child: play my share and print JSON
  const R = load(), n = +worker.split('/')[0], total = +worker.split('/')[1];
  const pa = makePlayer(R, levels[0]), pb = makePlayer(R, levels[1]);
  const res = { a: 0, b: 0, d: 0, firstWins: 0, turns: 0, n: 0 };
  for (let g = n; g < games; g += total) {
    const flip = g % 2 === 1, p = flip ? [pb, pa] : [pa, pb];
    let s = R.newGame(), t = 0;
    while (s.winner === null && t < 400) {
      s = R.roll(s, 1 + Math.random() * R.SIZE | 0, 1 + Math.random() * R.SIZE | 0);
      const a = p[s.turn](s);
      s = a.type === 'pass' ? R.passTurn(s) : R.apply(s, a); t++;
    }
    res.n++; res.turns += t;
    if (s.winner === null) res.d++; else { const aWon = flip ? s.winner === 1 : s.winner === 0; if (aWon) res.a++; else res.b++; if (s.winner === 0) res.firstWins++; }
  }
  console.log(JSON.stringify(res));
} else {
  if (levels.length !== 2) { console.log('usage: node tests/arena_node.js [--board 6] [--games 100] [--procs 8] A B'); process.exit(1); }
  const t0 = Date.now(); let done = 0; const tot = { a: 0, b: 0, d: 0, firstWins: 0, turns: 0, n: 0 };
  for (let i = 0; i < procs; i++) {
    const c = cp.spawn(process.execPath, [__filename, '--board', board, '--games', games, '--worker', `${i}/${procs}`, ...levels], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => {
      try { const r = JSON.parse(out.trim().split('\n').pop()); for (const k in tot) tot[k] += r[k]; } catch (e) { console.error('worker failed', out); }
      if (++done === procs) {
        const dec = tot.a + tot.b;
        console.log(`${levels[0]} vs ${levels[1]} (board ${board}): ${tot.a}-${tot.b}` + (tot.d ? `, ${tot.d} unfinished` : '') + ` = ${(100 * tot.a / Math.max(1, dec)).toFixed(0)}% for A over ${tot.n} games, avg ${Math.round(tot.turns / tot.n)} turns, first mover won ${tot.firstWins}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    });
  }
}
