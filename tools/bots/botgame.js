// Plays ONE complete online game between two labelled bot players on the live Province server, move by move with human-like pauses,
// so the lobby shows a live game people can watch. Run by the scheduled GitHub workflow (.github/workflows/bot-games.yml).
//   node tools/bots/botgame.js            (real pace, ~8-20 minutes)
//   BOT_FAST=1 node tools/bots/botgame.js (test pace, a few seconds)
// Bots sign in anonymously exactly like players do (only the public publishable key is used - no secrets).
const path = require('path'), fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..', '..');
global.Rules = require(path.join(root, 'src/rules.js'));
const VNet = require(path.join(root, 'src/vnet.js'));

const URL = 'https://hckplrwzsfuwmscwhlhr.supabase.co', KEY = 'sb_publishable_5ur391jcRIaWSoBT2CmN-w_yKlhKq-A';
const FAST = !!process.env.BOT_FAST;
const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? Math.min(ms, 250) : ms));
const rnd = (a, b) => a + Math.random() * (b - a), pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const NAMES = ['Atlas', 'Nova', 'Orion', 'Luna', 'Echo', 'Juno', 'Kai', 'Mira', 'Zed', 'Sage', 'Rex', 'Pixel', 'Ember', 'Onyx', 'Vega', 'Iris'];

async function client(label) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw new Error(label + ' sign-in: ' + error.message);
  return sb;
}
async function rpc(sb, fn, args) { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(fn + ': ' + error.message); return data; }

async function main() {
  const size = +(process.env.BOT_SIZE || (Math.random() < 0.7 ? 8 : 6));
  const R = Rules.forSize(size); R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
  const V = VNet.forSize(size);
  const buf = fs.readFileSync(path.join(root, 'src', 'vnet' + size + '.bin'));
  V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  const [nA, nB] = (() => { const a = pick(NAMES); let b = pick(NAMES); while (b === a) b = pick(NAMES); return ['🤖 ' + a, '🤖 ' + b]; })();
  const sbs = [await client('A'), await client('B')];
  const id = await rpc(sbs[0], 'create_game', { p_size: size, p_name: nA });
  console.log(`game ${id} ${size}x${size}: ${nA} vs ${nB}`);
  await sleep(rnd(20000, 70000));   // the game sits in the lobby as "open" for a little while
  await rpc(sbs[1], 'join_game', { p_id: id, p_name: nB });

  let s = R.newGame(), n = 0, turns = 0;
  const temp = [rnd(0.015, 0.05), rnd(0.015, 0.05)];   // a little variety so games differ
  const submit = async (seat, kind, data, st) => { n++; await rpc(sbs[seat], 'submit_event', { p_id: id, p_n: n, p_kind: kind, p_data: data, p_turn_after: st.turn, p_winner: st.winner }); };
  try {
    await sleep(rnd(3000, 8000));
    while (s.winner === null && turns < 300) {
      const p = s.turn; turns++;
      s = R.roll(s, 1 + Math.floor(Math.random() * size), 1 + Math.floor(Math.random() * size));
      await submit(p, 'roll', { w: s.roll.w, b: s.roll.b }, s);
      await sleep(rnd(3500, 11000));   // "thinking"
      let kind, data, ns;
      if (!R.hasAnyMove(s)) { ns = R.skipTurn(s); kind = 'skip'; data = {}; }
      else {
        const a = V.chooseAction(s, { temp: temp[p] });
        if (a.type === 'pass') { ns = R.passTurn(s); kind = 'skip'; data = { pass: true }; }
        else { ns = R.apply(s, a); kind = 'act'; data = a; }
      }
      s = ns;
      await submit(p, kind, data, s);
      await sleep(rnd(1500, 4500));
    }
    if (s.winner === null) await rpc(sbs[1], 'resign', { p_id: id });   // never leave a game hanging
    console.log(`finished after ${n} events, winner: ${s.winner === null ? 'draw (resigned)' : s.winner}`);
  } catch (e) {
    console.error('game failed:', e.message);
    try { await rpc(sbs[1], 'resign', { p_id: id }); } catch (e2) { /* ignore */ }
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
