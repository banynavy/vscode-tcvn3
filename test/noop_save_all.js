'use strict';
// node test/noop_save_all.js <thu muc>... -> moi file: VS Code gop xuong dong + luu khong sua => phai giong tung byte.
const fs = require('fs');
const path = require('path');
const codec = require('../codec');
const { prepareSave } = require('../save');

function vscodeNormalize(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const all = (text.match(/\r\n|\r|\n/g) || []).length;
  return text.replace(/\r\n|\r|\n/g, crlf > all - crlf ? '\r\n' : '\n');
}
let n = 0;
const bad = [];
const kinds = {};
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(lua|ini|txt)$/i.test(e.name)) {
      const b = fs.readFileSync(p);
      const k = codec.sniff(b);
      kinds[k] = (kinds[k] || 0) + 1;
      if (k === 'utf16' || k === 'utf8') continue; // extension khong mo cac file nay qua tcvn3:
      n++;
      try {
        if (!prepareSave(b, vscodeNormalize(codec.decode(b))).unchanged) bad.push(p);
      } catch (err) {
        bad.push(p + ' : ' + err.message);
      }
    }
  }
}
for (const d of process.argv.slice(2)) walk(d);
console.log('loai file:', JSON.stringify(kinds));
console.log(`mo+luu khong sua: ${n} file, khac byte: ${bad.length}`);
bad.slice(0, 10).forEach((p) => console.log('  ', p));
process.exitCode = bad.length ? 1 : 0;
