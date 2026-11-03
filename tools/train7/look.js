// What does the saved net do?   node tools/train7/look.js
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', '..', 'src', 'rules7.js'));
const AI = require(path.join(__dirname, '..', '..', 'src', 'ai7.js'));
R.setQuiet(true);
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'net7.json'), 'utf8'));
const net = { w1: Float32Array.from(d.w1), b1: Float32Array.from(d.b1), w2: Float32Array.from(d.w2), b2: d.b2 };
const kinds = {}, landN = [];
let s = R.newGame(), ply = 0;
while (s.winner === null && ply < 120) {
  s = R.roll(s, 1 + Math.floor(Math.random() * 8), 1 + Math.floor(Math.random() * 8));
  const c = AI.choose(s, net, s.turn === 0 ? 0 : 1, Math.random);
  if (s.turn === 0) { kinds[c.act.type] = (kinds[c.act.type] || 0) + 1; if (c.act.type === 'land') landN.push(c.act.count); }
  s = c.ns; ply++;
}
console.log('net moves', kinds, 'land counts', landN.join(','), 'territory net/random', R.territorySize(s, 0), R.territorySize(s, 1), 'bases', s.cells.filter((c) => c.o === 0).length, s.cells.filter((c) => c.o === 1).length);
