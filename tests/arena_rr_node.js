// Headless tournament under the beta RE-ROLL rule (once per turn a player may throw the dice again; the new roll replaces the old one),
// played with the JS engine and the JS inference code, i.e. exactly what runs in the browser.
//   node tests/arena_rr_node.js --board 6 --games 100 --procs 16 A:src/vnet6.bin:smart B:tests/vnet6e.bin:forced
// player spec  <weights.bin>:<smart|forced>   smart = re-roll when the net's g head says so (needs a net with the g head); forced = only when there is no legal move
// Prints A's wins / losses / draws and the share of first rolls that were re-rolled.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const specs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const board = +opt('board', 6), games = +opt('games', 40), procs = +opt('procs', 8), worker = opt('worker', null), margin = +opt('margin', 0);
const root = path.resolve(__dirname, '..');

if (worker !== null) {
  global.Rules = require(path.join(root, 'src/rules.js')); global.NN = require(path.join(root, 'src/nn.js')); global.VNet = require(path.join(root, 'src/vnet.js'));
  const R = Rules.forSize(board); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
  const mk = (spec) => {
    const [file, mode] = spec.split(':'); const V = VNet.make(board); const buf = fs.readFileSync(path.resolve(root, file));
    V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return { V, smart: mode === 'smart' };
  };
  const pa = mk(specs[0]), pb = mk(specs[1]), [n, total] = worker.split('/').map(Number);
  const res = { a: 0, b: 0, d: 0, first: 0, rr: 0, turns: 0, n: 0 };
  const rnd = () => 1 + Math.floor(Math.random() * board);
  for (let g = n; g < games; g += total) {
    const flip = g % 2 === 1, pl = flip ? [pb, pa] : [pa, pb];
    let s = R.newGame(), t = 0;
    while (s.winner === null && t < 400) {
      const P = pl[s.turn];
      s = R.roll(s, rnd(), rnd());
      let canRe = true;
      for (;;) {
        const r = P.V.decide(s, { canReroll: canRe, margin: P.smart ? margin : 1e9 });
        if (canRe) res.first++;
        if (r.reroll) { res.rr++; s = R.roll(s, rnd(), rnd()); canRe = false; continue; }
        const a = r.act;
        s = a.type === 'pass' ? (R.hasAnyMove(s) ? R.passTurn(s) : R.skipTurn(s)) : R.apply(s, a);
        break;
      }
      t++;
    }
    res.turns += t; res.n++;
    if (s.winner === null) res.d++; else if ((s.winner === 0) !== flip) res.a++; else res.b++;
  }
  console.log(JSON.stringify(res));
} else {
  let done = 0; const tot = { a: 0, b: 0, d: 0, first: 0, rr: 0, turns: 0, n: 0 };
  for (let i = 0; i < procs; i++) {
    const c = cp.spawn(process.execPath, [__filename, '--board', board, '--games', games, '--margin', margin, '--worker', `${i}/${procs}`, ...specs], { stdio: ['ignore', 'pipe', 'inherit'] });
    let o = ''; c.stdout.on('data', (d) => { o += d; });
    c.on('close', () => {
      try { const r = JSON.parse(o.trim().split('\n').pop()); for (const k in tot) tot[k] += r[k]; } catch (e) { console.error('worker output unreadable'); }
      if (++done === procs) console.log(`A ${specs[0]}  vs  B ${specs[1]}   board ${board}\n  A wins ${tot.a}, B wins ${tot.b}, unfinished ${tot.d}  (A = ${(100 * (tot.a + tot.d / 2) / tot.n).toFixed(1)}%, +-${(98 / Math.sqrt(tot.n)).toFixed(0)}%)   avg turns ${(tot.turns / tot.n).toFixed(0)}   first rolls re-rolled ${(100 * tot.rr / Math.max(1, tot.first)).toFixed(1)}%`);
    });
  }
}
