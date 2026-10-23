// Exploration helper for writing lessons: shows how the net ranks the move groups of a position (best soldier count per type/from/to)
// plus exact measurements before and after each move.   node tests/puzzle_scan.js '<json spec>'   spec as in src/training.js position()
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
global.Rules = require(path.join(root, 'src/rules.js')); global.NN = require(path.join(root, 'src/nn.js')); global.VNet = require(path.join(root, 'src/vnet.js'));
const T = require(path.join(root, 'src/training.js'));
const R = Rules.forSize(6); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
const V = VNet.make(6); const buf = fs.readFileSync(path.join(root, 'src/vnet6.bin')); V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const sig = (z) => 1 / (1 + Math.exp(-z));
const spec = JSON.parse(process.argv[2]); const s = T.position(Rules, spec), feat = new Uint8Array(V.F);
const xy = (i) => R.xy(i).join(',');
const groups = new Map();
for (const a of V.candidates(s)) {
  if (a.type === 'pass') continue;
  let ns; try { ns = R.apply(s, a); } catch (e) { continue; }
  V.encode(ns, 0, feat); const p = ns.winner === 0 ? 1 : sig(V.forward(feat));
  const key = `${a.type} ${a.from !== undefined ? xy(a.from) + '->' : ''}${xy(a.to !== undefined ? a.to : a.R)}`;
  const g = groups.get(key); if (!g || p > g.p) groups.set(key, { p, a, ns });
}
const rows = [...groups.entries()].sort((x, y) => y[1].p - x[1].p);
const m = (st) => `me kills ${T.kills(R, { ...R.clone(st), turn: 0 }, 0).toFixed(1)} (${Math.round(100 * T.strike(R, st, 0))}%) free ${Math.round(100 * T.freeTurn(R, st, 0))}% | them kills ${T.kills(R, st, 1).toFixed(1)} (${Math.round(100 * T.strike(R, st, 1))}%) free ${Math.round(100 * T.freeTurn(R, st, 1))}% | terr ${T.terrSize(R, st, 0)}-${T.terrSize(R, st, 1)}`;
console.log('before:', m(R.clone(Object.assign({}, s, { roll: null }))));
for (const [k, g] of rows.slice(0, +process.argv[3] || 12)) console.log(`${(100 * g.p).toFixed(1)}%  ${k} x${g.a.count}   after: ${m(g.ns)}`);
console.log('...worst:', rows.slice(-3).map(([k, g]) => (100 * g.p).toFixed(1) + '% ' + k).join(' | '));
