/* Province – Web Worker for the neural-network computer opponent.
 * Receives { id, size, state } and answers { id, act } where act is in the Rules.apply format ({ type: 'pass' } = no move).
 * Loads src/vnet<size>.bin on first use. Runs off the main thread, so the board never freezes while the computer thinks.
 * Slow devices: it measures the time per evaluated move and thins out the soldier-count options so a move takes about 9 seconds at most. */
importScripts('rules.js', 'vnet.js');
const nets = {};
let msPerEval = 0;   // moving average, 0 = unknown yet
onmessage = async (e) => {
  const { id, size, state } = e.data;
  try {
    const R = Rules.forSize(size);
    R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
    if (!nets[size]) {
      const res = await fetch('vnet' + size + '.bin');
      if (!res.ok) throw new Error('weights ' + res.status);
      const V = VNet.forSize(size); V.setNet(await res.arrayBuffer()); nets[size] = V;
    }
    const V = nets[size], maxEvals = msPerEval ? Math.max(150, Math.floor(9000 / msPerEval)) : 1500;
    const t0 = Date.now(), act = V.chooseAction(state, { maxEvals });
    const dt = Date.now() - t0, n = Math.max(1, V.lastEvals);
    msPerEval = msPerEval ? 0.6 * msPerEval + 0.4 * (dt / n) : dt / n;
    postMessage({ id, act });
  } catch (err) { postMessage({ id, error: String(err && err.message || err) }); }
};
