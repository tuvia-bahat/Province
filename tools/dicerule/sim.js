// Experiment: does "re-roll the dice automatically until the player has a legal move" lengthen the game?
// The computer (the released value network, both sides) plays itself on the live rules, with and without the re-roll rule.
//   node tools/dicerule/sim.js --board 6 --games 150 --procs 18 --out tools/dicerule/results
// Per game: turns (every turn of either player, a skipped turn counts as a turn; re-rolls do not count), acts (turns where a move/landing/bridge was made),
// skips (turns with no legal move), passes (turns where the net chose to pass although it had a move), rerolls (only with the rule), winner, finished.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const BOARD = +opt('board', 6), GAMES = +opt('games', 100), PROCS = +opt('procs', 8), WORKER = opt('worker', null), OUT = path.resolve(opt('out', path.join(__dirname, 'results')));
const MAXT = +opt('maxturns', 600);
const root = path.resolve(__dirname, '..', '..');

if (WORKER !== null) {
  global.Rules = require(path.join(root, 'src/rules.js')); global.NN = require(path.join(root, 'src/nn.js')); global.VNet = require(path.join(root, 'src/vnet.js'));
  const R = Rules.forSize(BOARD); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
  const V = VNet.make(BOARD); const buf = fs.readFileSync(path.join(root, 'src', 'vnet' + BOARD + '.bin')); V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const [n, total] = WORKER.split('/').map(Number);
  const rnd = () => 1 + Math.floor(Math.random() * BOARD);
  const play = (reroll) => {
    let s = R.newGame(); const r = { turns: 0, acts: 0, skips: 0, passes: 0, rerolls: 0 };
    while (s.winner === null && r.turns < MAXT) {
      s = R.roll(s, rnd(), rnd());
      if (reroll) { let k = 0; while (!R.hasAnyMove(s) && k < 500) { s = R.roll(s, rnd(), rnd()); r.rerolls++; k++; } }
      r.turns++;
      if (!R.hasAnyMove(s)) { s = R.skipTurn(s); r.skips++; continue; }
      const a = V.chooseAction(s);
      if (a.type === 'pass') { s = R.passTurn(s); r.passes++; } else { s = R.apply(s, a); r.acts++; }
    }
    r.finished = s.winner !== null; r.winner = s.winner;
    return r;
  };
  const out = [];
  for (let g = n; g < GAMES; g += total) { out.push({ g, rule: 'old', ...play(false) }); out.push({ g, rule: 'reroll', ...play(true) }); }
  console.log(JSON.stringify(out));
} else {
  fs.mkdirSync(OUT, { recursive: true });
  let done = 0; const all = []; const t0 = Date.now();
  for (let i = 0; i < PROCS; i++) {
    const c = cp.spawn(process.execPath, [__filename, '--board', BOARD, '--games', GAMES, '--maxturns', MAXT, '--worker', `${i}/${PROCS}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let o = ''; c.stdout.on('data', (d) => { o += d; });
    c.on('close', () => {
      try { all.push(...JSON.parse(o.trim().split('\n').pop())); } catch (e) { console.error('worker output unreadable'); }
      if (++done === PROCS) { fs.writeFileSync(path.join(OUT, `board${BOARD}.json`), JSON.stringify(all)); console.log('board', BOARD, 'rows', all.length, 'sec', ((Date.now() - t0) / 1000).toFixed(0)); }
    });
  }
}
