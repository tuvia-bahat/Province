// node tools/train/parity_rr.js <net.bin> <dump.json> <size>
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
global.Rules = require(path.join(root, 'src/rules.js')); const VNet = require(path.join(root, 'src/vnet.js'));
const [bin, dump, size] = [process.argv[2], process.argv[3], +process.argv[4]];
const V = VNet.make(size); const buf = fs.readFileSync(bin); V.setNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const d = JSON.parse(fs.readFileSync(dump, 'utf8')); let maxV = 0, maxG = 0;
for (let i = 0; i < d.feat.length; i++) {
  const v = V.forward(Uint8Array.from(d.feat[i])), g = V.lastG;
  maxV = Math.max(maxV, Math.abs(v - d.v[i])); maxG = Math.max(maxG, Math.abs(g - d.g[i]));
}
console.log(JSON.stringify({ vectors: d.feat.length, hasG: V.hasG, maxAbsDiffV: maxV, maxAbsDiffG: maxG }));
