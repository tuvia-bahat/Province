// Checks the training puzzles against the neural-network evaluation: for every puzzle, how does the net rank the moves that the lesson accepts
// versus the ones it rejects?   node tests/puzzle_eval.js [lessonId]
// A good puzzle: the best accepted move is also among the net's top moves, and clearly better than the best rejected one.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
global.Rules = require(path.join(root, 'src/rules.js'));
global.NN = require(path.join(root, 'src/nn.js'));
global.VNet = require(path.join(root, 'src/vnet.js'));
const T = require(path.join(root, 'src/training.js'));
const R = Rules.forSize(6); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
const V = VNet.make(6); const buf = fs.readFileSync(path.join(root, 'src/vnet6.bin')); V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const sig = (z) => 1 / (1 + Math.exp(-z));
const only = process.argv[2];
const fmt = (a) => a.type === 'pass' ? 'pass' : `${a.type} ${a.from !== undefined ? R.xy(a.from).join(',') + '->' : ''}${R.xy(a.to !== undefined ? a.to : a.R).join(',')} x${a.count}`;
for (const id in T.lessons) {
  if (only && id !== only) continue;
  T.lessons[id].puzzles.forEach((P, i) => {
    const s = T.position(Rules, P.spec), feat = new Uint8Array(V.F), rows = [];
    for (const a of V.candidates(s)) {
      if (a.type === 'pass') continue;
      let ns; try { ns = R.apply(s, a); } catch (e) { continue; }
      V.encode(ns, 0, feat);
      rows.push({ a, p: ns.winner === 0 ? 1 : sig(V.forward(feat)), ok: !!P.accept(R, s, a, ns) });
    }
    rows.sort((x, y) => y.p - x.p);
    const bestOk = rows.find((r) => r.ok), bestBad = rows.find((r) => !r.ok);
    const rank = bestOk ? rows.indexOf(bestOk) + 1 : -1;
    console.log(`\n== ${id} #${i + 1}  "${P.prompt}"  legal ${rows.length}, accepted ${rows.filter((r) => r.ok).length}`);
    console.log(`   best accepted: ${bestOk ? (100 * bestOk.p).toFixed(1) + '%  (net rank ' + rank + ')  ' + fmt(bestOk.a) : 'none'}`);
    console.log(`   best rejected: ${bestBad ? (100 * bestBad.p).toFixed(1) + '%  ' + fmt(bestBad.a) : 'none'}`);
    console.log('   top 6: ' + rows.slice(0, 6).map((r) => (r.ok ? '+' : '-') + (100 * r.p).toFixed(0) + '% ' + fmt(r.a)).join(' | '));
  });
}
