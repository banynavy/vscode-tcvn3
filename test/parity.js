'use strict';
// node test/parity.js <out.tsv> <thu muc>...  -> moi file: md5 giai ma strict, md5 giai ma hien thi, khu hoi dung byte?
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const codec = require('../codec');

const out = [];
let n = 0;
let bad = 0;
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(lua|ini|txt)$/i.test(ent.name)) {
      const b = fs.readFileSync(p);
      if (b.length >= 2 && ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF))) continue;
      const strict = codec.decode(b, true);
      const shown = codec.decode(b, false);
      let rt;
      try {
        rt = Buffer.compare(codec.encode(strict), b) === 0;
      } catch (e) {
        rt = false;
      }
      if (!rt) bad++;
      n++;
      const h = (s) => crypto.createHash('md5').update(Buffer.from(s, 'utf8')).digest('hex');
      out.push([p, h(strict), h(shown), rt ? 1 : 0].join('\t'));
    }
  }
}
for (const d of process.argv.slice(3)) walk(d);
fs.writeFileSync(process.argv[2], out.join('\n') + '\n');
console.log(`files=${n} roundtrip_fail=${bad}`);
