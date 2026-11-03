// Self-play trainer for the new-rules prototype.   node tools/train7/train.js [iterations] [gamesPerIteration] [workers]
// The net (src/ai7.js) learns the value of a position from games it plays against itself (TD(lambda) towards the result).
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', '..', 'src', 'rules7.js'));
const AI = require(path.join(__dirname, '..', '..', 'src', 'ai7.js'));
const { NIN, HID, HA } = AI;
const MAXPLY = 160, LAMBDA = 0.8;

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const toNet = (d) => ({ w1: Float32Array.from(d.w1), b1: Float32Array.from(d.b1), w2: Float32Array.from(d.w2), b2: d.b2 });
const die = (rng) => 1 + Math.floor(rng() * R.N);

// play one game; players[p] = { net, eps } (net null = random mover). Returns { winner, plies, samples (if learn) }
function playGame(players, rng, learn) {
  R.setQuiet(true);
  let s = R.newGame(), plies = 0;
  const traj = [[], []], buf = new Float32Array(NIN);
  while (s.winner === null && plies < MAXPLY) {
    s = R.roll(s, die(rng), die(rng));
    const p = s.turn, pl = players[p];
    const c = AI.choose(s, pl.net || players[0].net || players[1].net, pl.net ? pl.eps : 1, rng);
    if (learn) {
      const g = AI.features(c.ns, p, buf);
      traj[p].push({ x: Float32Array.from(buf), g, term: c.ns.winner !== null });
    }
    s = c.ns; plies++;
  }
  let winner = s.winner;
  if (winner === null) { const d = R.territorySize(s, 0) - R.territorySize(s, 1); winner = d > 0 ? 0 : d < 0 ? 1 : null; }
  const out = { winner, plies, samples: [] };
  if (!learn) return out;
  for (const p of [0, 1]) {
    const z = s.winner !== null ? (s.winner === p ? 1 : 0) : 0.5 + 0.5 * Math.tanh((R.territorySize(s, p) - R.territorySize(s, 1 - p)) / 10);
    const T = traj[p], v = T.map((t) => AI.forward(players[p].net, t.x, t.g, null));
    let G = z;
    for (let k = T.length - 1; k >= 0; k--) {
      if (k < T.length - 1) G = (1 - LAMBDA) * v[k + 1] + LAMBDA * G;
      out.samples.push({ x: T[k].x, g: T[k].g, t: T[k].term ? z : G });
    }
  }
  return out;
}

if (!isMainThread) {
  parentPort.on('message', (m) => {
    const net = toNet(m.net), rng = mulberry(m.seed);
    if (m.job === 'train') {
      const X = [], G = [], T = []; let plies = 0, decisive = 0;
      for (let g = 0; g < m.games; g++) {
        const r = playGame([{ net, eps: m.eps }, { net, eps: m.eps }], rng, true);
        plies += r.plies; if (r.winner !== null) decisive++;
        for (const smp of r.samples) { X.push(smp.x); G.push(smp.g); T.push(smp.t); }
      }
      parentPort.postMessage({ X, G, T, plies, decisive, games: m.games });
    } else {   // evaluate against a random mover, alternating seats
      let wins = 0, draws = 0;
      for (let g = 0; g < m.games; g++) {
        const seat = g % 2, pl = [{ net: null }, { net: null }]; pl[seat] = { net, eps: 0 };
        const r = playGame(pl, rng, false);
        if (r.winner === seat) wins++; else if (r.winner === null) draws++;
      }
      parentPort.postMessage({ wins, draws, games: m.games });
    }
  });
} else {
  const ITER = +process.argv[2] || 50, GAMES = +process.argv[3] || 64, W = +process.argv[4] || 8;
  const FILE = path.join(__dirname, 'net7.json');
  let net;
  if (fs.existsSync(FILE) && !process.env.FRESH) net = toNet(JSON.parse(fs.readFileSync(FILE, 'utf8'))); else net = AI.newNet(mulberry(7));
  const workers = Array.from({ length: W }, () => new Worker(__filename));
  const ask = (w, msg) => new Promise((res) => { w.once('message', res); w.postMessage(msg); });
  const plain = () => ({ w1: Array.from(net.w1), b1: Array.from(net.b1), w2: Array.from(net.w2), b2: net.b2 });
  const save = () => {
    const d = plain(), r = (a) => a.map((v) => +v.toFixed(5));
    fs.writeFileSync(FILE, JSON.stringify(d));
    fs.writeFileSync(path.join(__dirname, '..', '..', 'src', 'net7.js'), '// trained by tools/train7/train.js\nwindow.NET7 = ' + JSON.stringify({ w1: r(d.w1), b1: r(d.b1), w2: r(d.w2), b2: +d.b2.toFixed(5) }) + ';\n');
  };
  const h = new Float32Array(HID);
  function sgd(X, G, T, lr) {
    const order = Array.from({ length: X.length }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let loss = 0;
    for (const k of order) {
      const x = X[k], y = AI.forward(net, x, G[k], h), e = y - T[k]; loss += e * e;
      const da = e * y * (1 - y);
      for (let j = 0; j < HID; j++) {
        const dz = da * net.w2[j] * (1 - h[j] * h[j]);
        net.w2[j] -= lr * da * h[j];
        net.b1[j] -= lr * dz;
        for (let i = 0; i < NIN; i++) { const v = x[i]; if (v !== 0) net.w1[i * HID + j] -= lr * dz * v; }
      }
      net.b2 -= lr * da;
    }
    return loss / X.length;
  }
  (async () => {
    const t0 = Date.now();
    for (let it = 1; it <= ITER; it++) {
      const eps = Math.max(0.05, 0.25 - it * 0.004), lr = 0.004;
      const parts = await Promise.all(workers.map((w, k) => ask(w, { job: 'train', net: plain(), seed: it * 1000 + k, games: Math.ceil(GAMES / W), eps })));
      const X = [], G = [], T = []; let plies = 0, decisive = 0, games = 0;
      for (const p of parts) { X.push(...p.X); G.push(...p.G); T.push(...p.T); plies += p.plies; decisive += p.decisive; games += p.games; }
      const loss = sgd(X, G, T, lr);
      let line = `iter ${it}  games ${games}  plies/game ${(plies / games).toFixed(0)}  decisive ${(100 * decisive / games).toFixed(0)}%  loss ${loss.toFixed(4)}  eps ${eps.toFixed(2)}  ${((Date.now() - t0) / 60000).toFixed(1)} min`;
      if (it % 5 === 0 || it === ITER) {
        const ev = await Promise.all(workers.map((w, k) => ask(w, { job: 'eval', net: plain(), seed: 777 + it * 10 + k, games: 8 })));
        const wins = ev.reduce((a, e) => a + e.wins, 0), n = ev.reduce((a, e) => a + e.games, 0), dr = ev.reduce((a, e) => a + e.draws, 0);
        line += `  | vs random: ${wins}/${n} won, ${dr} undecided`;
        save();
      }
      console.log(line);
    }
    save();
    for (const w of workers) w.terminate();
  })();
}
