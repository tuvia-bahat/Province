// Quick look at how games go: random vs random.   node tools/train7/diag.js
const path = require('path');
const R = require(path.join(__dirname, '..', '..', 'src', 'rules7.js'));
const AI = require(path.join(__dirname, '..', '..', 'src', 'ai7.js'));
R.setQuiet(true);
const net = AI.newNet(Math.random);
let wins = 0, terr = [0, 0], passes = 0, moves = 0, games = 20;
for (let g = 0; g < games; g++) {
  let s = R.newGame(), ply = 0;
  while (s.winner === null && ply < 300) {
    s = R.roll(s, 1 + Math.floor(Math.random() * 8), 1 + Math.floor(Math.random() * 8));
    const c = AI.choose(s, net, 1, Math.random);
    if (c.act.type === 'pass') passes++; moves++;
    s = c.ns; ply++;
  }
  if (s.winner !== null) wins++;
  terr[0] += R.territorySize(s, 0); terr[1] += R.territorySize(s, 1);
}
console.log({ games, wins, avgTerr: terr.map((t) => (t / games).toFixed(1)), passShare: (passes / moves).toFixed(2) });
