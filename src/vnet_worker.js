/* Province – Web Worker for the neural-network computer opponent (beta).
 * Receives { id, size, state } and answers { id, act } where act is in the Rules.apply format ({ type: 'pass' } = no move).
 * Loads src/vnet<size>.bin on first use. Runs off the main thread, so the board never freezes while the computer thinks. */
importScripts('rules.js', 'vnet.js');
const nets = {};
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
    postMessage({ id, act: nets[size].chooseAction(state) });
  } catch (err) { postMessage({ id, error: String(err && err.message || err) }); }
};
