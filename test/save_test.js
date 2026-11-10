'use strict';
// node test/save_test.js <thu muc work>  -> kiem thu prepareSave (gia lap cach VS Code gop xuong dong)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const codec = require('../codec');
const { prepareSave, splitLines } = require('../save');

const W = process.argv[2];
const results = [];
function test(name, fn) {
  try {
    fn();
    results.push('DAT   ' + name);
  } catch (e) {
    results.push('TRUOT ' + name + '\n      ' + (e && e.message));
  }
}
// VS Code: gop moi xuong dong ve kieu chiem da so
function vscodeNormalize(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  const eol = crlf > lf ? '\r\n' : '\n';
  return text.replace(/\r\n|\r|\n/g, eol);
}
const rawLines = (b) => {
  const out = [];
  let i = 0;
  for (let k = 0; k < b.length; k++) if (b[k] === 0x0A) { out.push(b.subarray(i, k + 1)); i = k + 1; }
  out.push(b.subarray(i));
  return out;
};

const mixed = fs.readFileSync(path.join(W, 'script/mobile/ho_tro_tan_thu.lua')); // CRLF 10 + LF 75
const crlfFile = fs.readFileSync(path.join(W, 'script/mobile/phuc_loi.lua')); // thuan CRLF
const gbkMixed = fs.readFileSync(path.join(W, 'script/item/item_billing/dabaoyuntie.lua')); // TCVN3+GBK, CRLF

test('file tron CRLF/LF: VS Code gop xuong dong, luu khong sua -> giu nguyen tung byte', () => {
  const t = vscodeNormalize(codec.decode(mixed));
  const r = prepareSave(mixed, t);
  assert.ok(r.unchanged, 'bytes khac ban goc');
});

test('sua dong CRLF/CR trong file tron: giu ca xuong dong cua dong duoc sua', () => {
  const original = codec.encode('a\r\nb\nc\rd\n');
  const r = prepareSave(original, 'x\nb\ny\nd\n');
  assert.deepStrictEqual(r.bytes, codec.encode('x\r\nb\ny\rd\n'));
  assert.deepStrictEqual(r.changedLines, [1, 3]);
});

test('file thuan CR le: them dong cung giu CR', () => {
  const r = prepareSave(codec.encode('a\rb\r'), 'a\nx\nb\n');
  assert.deepStrictEqual(r.bytes, codec.encode('a\rx\rb\r'));
});

test('file tron CRLF/LF: sua 2 cho xa nhau + them 1 dong -> dong khong sua giu nguyen byte', () => {
  const L = splitLines(vscodeNormalize(codec.decode(mixed)));
  const iA = L.findIndex((l) => l.t.includes('Hành trang không còn chỗ trống.'));
  const iB = L.findIndex((l) => l.t.includes('Bạn được phong làm Liêu!'));
  assert.ok(iA >= 0 && iB > iA + 5, 'khong tim thay dong mau');
  L[iA].t = L[iA].t.replace('Hành trang không còn chỗ trống.', 'Hành trang đã đầy, hãy dọn bớt.');
  L[iB].t = L[iB].t.replace('Liêu!', 'Liêu “Đại Liêu”…');
  L.splice(iA + 1, 0, { t: '\t-- Ghi chú: thử thêm dòng', e: L[iA].e });
  const r = prepareSave(mixed, L.map((l) => l.t + l.e).join(''));
  const oldR = rawLines(mixed);
  const newR = rawLines(r.bytes);
  assert.strictEqual(newR.length, oldR.length + 1, 'so dong');
  for (let k = 0; k < newR.length; k++) {
    const ok = k <= iA ? k : k - 1; // dong cu tuong ung
    if (k === iA || k === iA + 1 || k === iB + 1) continue;
    assert.ok(Buffer.compare(Buffer.from(newR[k]), Buffer.from(oldR[ok])) === 0, 'dong ' + (k + 1) + ' bi doi');
  }
  assert.deepStrictEqual(r.changedLines, [iA + 1, iA + 2, iB + 2]);
  const enc = codec.encode('Hành trang đã đầy, hãy dọn bớt.');
  assert.ok(Buffer.from(newR[iA]).includes(enc), 'dong sua 1 khong dung byte TCVN3');
  assert.ok(Buffer.from(newR[iB + 1]).includes(Buffer.from([0x93])) && Buffer.from(newR[iB + 1]).includes(Buffer.from([0x85])), 'dau “ … phai ra byte 93/85');
  // dong them moi dung kieu xuong dong cua dong lien truoc trong VS Code; dong sua giu kieu cu
  assert.ok(newR[iA].slice(-2).toString('latin1') === oldR[iA].slice(-2).toString('latin1'), 'dong sua 1 doi kieu xuong dong');
});

test('file thuan CRLF: them dong -> dong moi cung CRLF, khong sinh LF le', () => {
  const t = codec.decode(crlfFile);
  const t2 = t.replace('function MobilePhucLoi_Claim(', '-- Thêm chú thích mới\r\nfunction MobilePhucLoi_Claim(');
  const r = prepareSave(crlfFile, t2);
  const s = Buffer.from(r.bytes).toString('latin1');
  assert.strictEqual((s.match(/\n/g) || []).length, (s.match(/\r\n/g) || []).length, 'co LF le');
  assert.strictEqual(r.changedLines.length, 1);
});

test('file TCVN3+GBK: sua chu Viet -> chu thich GBK giu nguyen byte', () => {
  const t = codec.decode(gbkMixed);
  const t2 = t.split('Xin xác nhận hành trang có').join('Xin kiểm tra lại hành trang có'); // 2 cho
  const r = prepareSave(gbkMixed, t2);
  const oldR = rawLines(gbkMixed);
  const newR = rawLines(r.bytes);
  for (let k = 0; k < 5; k++) assert.ok(Buffer.compare(Buffer.from(newR[k]), Buffer.from(oldR[k])) === 0, 'dong GBK ' + (k + 1));
  assert.strictEqual(r.changedLines.length, 2);
});

test('file co CR le (穆义.lua): VS Code gop xuong dong, luu khong sua -> giu nguyen tung byte', () => {
  const b = fs.readFileSync(path.join(W, 'script/江南区/泉州/npc/穆义.lua'));
  const t = vscodeNormalize(codec.decode(b));
  assert.ok(!t.includes('\r'), 'gia lap chua gop CR');
  assert.ok(prepareSave(b, t).unchanged, 'bytes khac ban goc');
});

test('bo/them xuong dong cuoi file', () => {
  const t = codec.decode(crlfFile);
  assert.ok(t.endsWith('\r\n'));
  const r1 = prepareSave(crlfFile, t.slice(0, -2));
  assert.ok(!Buffer.from(r1.bytes).toString('latin1').endsWith('\n'));
  const r2 = prepareSave(crlfFile, t + 'x = 1\r\n');
  assert.ok(Buffer.from(r2.bytes).toString('latin1').endsWith('x = 1\r\n'));
});

test('ky tu ngoai bang (emoji) -> EncodeError co dong/cot', () => {
  const t = codec.decode(crlfFile).replace('Mobile Phuc Loi', 'Mobile 🎁 Phuc Loi');
  assert.throws(() => prepareSave(crlfFile, t), (e) => e instanceof codec.EncodeError && e.bad[0].ch === '🎁' && e.bad[0].line > 1);
});

test('canh bao chu hoa co dau thanh + chu Han trong dong moi', () => {
  const t = codec.decode(crlfFile).replace('Mobile Phuc Loi', 'ĐẠI HIỆP 测试');
  const r = prepareSave(crlfFile, t);
  assert.ok(r.warnings.some((w) => w.includes('Ạ') && w.includes('Ệ')), 'thieu canh bao chu hoa');
  assert.ok(r.warnings.some((w) => w.includes('测')), 'thieu canh bao GBK');
});

test('file moi (chua ton tai)', () => {
  const r = prepareSave(null, 'Talk(1,"","Chào đại hiệp")\r\n');
  assert.ok(Buffer.compare(Buffer.from(r.bytes), Buffer.concat([Buffer.from('Talk(1,"","Ch'), Buffer.from([0xB5]), Buffer.from('o '), Buffer.from([0xAE, 0xB9]), Buffer.from('i hi'), Buffer.from([0xD6]), Buffer.from('p")\r\n')])) === 0);
});

test('BOM do VS Code them vao -> bi bo', () => {
  const r = prepareSave(crlfFile, '﻿' + codec.decode(crlfFile));
  assert.ok(r.unchanged);
});

test('dau to hop (Unicode dung san) -> gop thanh chu dung', () => {
  const r = prepareSave(null, 'Tiến');
  assert.ok(Buffer.compare(Buffer.from(r.bytes), Buffer.from([0x54, 0x69, 0xD5, 0x6E])) === 0);
});

test('file lon (settings/npcs.txt): sua 1 dong < 3 giay', () => {
  const big = fs.readFileSync(path.join(W, 'settings/npcs.txt'));
  const t0 = Date.now();
  const t = vscodeNormalize(codec.decode(big));
  const L = splitLines(t);
  const k = Math.floor(L.length / 2);
  L[k].t = L[k].t + ' ';
  const r = prepareSave(big, L.map((l) => l.t + l.e).join(''));
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, ms + ' ms');
  assert.strictEqual(r.bytes.length, big.length + 1);
  results.push('      (npcs.txt ' + big.length + ' byte, ' + L.length + ' dong, ' + ms + ' ms)');
});

// thong ke: file co CR le (VS Code coi la xuong dong -> se bi doi)
let loneCR = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(lua|ini|txt)$/i.test(e.name)) {
      const b = fs.readFileSync(p);
      for (let i = 0; i < b.length; i++) if (b[i] === 0x0D && b[i + 1] !== 0x0A) { loneCR++; break; }
    }
  }
})(path.join(W, 'script'));
results.push('(thong ke) file trong script/ co ky tu CR le: ' + loneCR);

console.log(results.join('\n'));
process.exitCode = results.some((r) => r.startsWith('TRUOT')) ? 1 : 0;
