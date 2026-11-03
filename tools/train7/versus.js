// Trained net against the hand-made term alone (an untrained net).   node tools/train7/versus.js [games]
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', '..', 'src', 'rules7.js'));
const AI = require(path.join(__dirname, '..', '..', 'src', 'ai7.js'));
R.setQuiet(true);
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'net7.json'), 'utf8'));
const trained = { w1: Float32Array.from(d.w1), b1: Float32Array.from(d.b1), w2: Float32Array.from(d.w2), b2: d.b2 };
const blank = { w1: new Float32Array(AI.NIN * AI.HID), b1: new Float32Array(AI.HID), w2: new Float32Array(AI.HID), b2: 0 };   // only the hand-made term
const G = +process.argv[2] || 60;
let wins = 0, draws = 0, plies = 0;
for (let g = 0; g < G; g++) {
  const seat = g % 2, nets = [blank, blank]; nets[seat] = trained;
  let s = R.newGame(), ply = 0;
  while (s.winner === null && ply < 200) { s = R.roll(s, 1 + Math.floor(Math.random() * 8), 1 + Math.floor(Math.random() * 8)); s = AI.choose(s, nets[s.turn], 0, Math.random).ns; ply++; }
  plies += ply;
  const w = s.winner !== null ? s.winner : (R.territorySize(s, 0) > R.territorySize(s, 1) ? 0 : R.territorySize(s, 0) < R.territorySize(s, 1) ? 1 : null);
  if (w === seat) wins++; else if (w === null) draws++;
}
console.log(`trained net vs hand-made term only: ${wins}/${G} won, ${draws} undecided, ${(plies / G).toFixed(0)} plies/game`);
