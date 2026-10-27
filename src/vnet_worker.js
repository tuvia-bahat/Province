/* Province – Web Worker for the neural-network computer opponent.
 * Receives { id, size, state } and answers { id, act } where act is in the Rules.apply format ({ type: 'pass' } = no move).
 * Loads src/vnet<size>.bin on first use. Runs off the main thread, so the board never freezes while the computer thinks.
 * Slow devices: it measures the time per evaluated move and thins out the soldier-count options so a move takes about 9 seconds at most. */
const VQ = self.location.search;   // ?v=<build id>: every file this worker loads carries it
importScripts('rules.js' + VQ, 'vnet.js' + VQ);
const nets = {};
let msPerEval = 0;   // moving average, 0 = unknown yet
onmessage = async (e) => {
  const { id, size, state, canReroll, rr } = e.data;
  try {
    const R = Rules.forSize(size);
    R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
    // rr: the re-roll rule is on (beta): use the net that was trained with it (vnet<size>rr.bin, it also knows when to re-roll); fall back to the plain net
    const key = size + (rr ? 'rr' : '');
    if (!nets[key]) {
      let res = rr ? await fetch('vnet' + size + 'rr.bin' + VQ) : null;
      if (!res || !res.ok) res = await fetch('vnet' + size + '.bin' + VQ);
      if (!res.ok) throw new Error('weights ' + res.status);
      const V = VNet.make(size); V.setNet(await res.arrayBuffer()); nets[key] = V;
    }
    const V = nets[key], maxEvals = msPerEval ? Math.max(150, Math.floor(9000 / msPerEval)) : 1500;
    const t0 = Date.now(), res = V.decide(state, { maxEvals, canReroll: !!canReroll });
    const dt = Date.now() - t0, n = Math.max(1, V.lastEvals);
    msPerEval = msPerEval ? 0.6 * msPerEval + 0.4 * (dt / n) : dt / n;
    if (res.reroll) postMessage({ id, reroll: true }); else postMessage({ id, act: res.act });
  } catch (err) { postMessage({ id, error: String(err && err.message || err) }); }
};
