'use strict';
// Bo ma TCVN3 + GBK - ban JavaScript cua docs/tools/tcvn3.py (cung thuat toan, cung bang tu tables.js).
// Khong phu thuoc vscode -> chay duoc bang node de kiem thu.

const T = require('./tables');

const PUA = 0xE000; // byte khong giai ma duoc -> U+E080..U+E0FF (ma hoa lai dung byte)

const U2T = new Map(); // ky tu -> byte TCVN3
const T2U = new Map(); // byte -> ky tu (chu thuong khi hoa/thuong chung byte)
const isLower = (c) => c !== c.toUpperCase() && c === c.toLowerCase();
const isUpper = (c) => c !== c.toLowerCase() && c === c.toUpperCase();
for (let i = 0; i < T.VN.length; i++) {
  const ch = T.VN[i];
  const b = T.TC[i];
  U2T.set(ch, b);
  if (!T2U.has(b) || isLower(ch)) T2U.set(b, ch);
}
for (const ch of 'ĂÂÊÔƠƯĐ') T2U.set(U2T.get(ch), ch);

const W2T = new Map();
const T2W = new Map();
for (let i = 0; i < T.WEST_U.length; i++) {
  W2T.set(T.WEST_U[i], T.WEST_B[i]);
  T2W.set(T.WEST_B[i], T.WEST_U[i]);
}
const WEST_B = new Set(T.WEST_B);
const TC_BYTES = new Set(T2U.keys());
const isUntoned = (c) => c >= 0xA1 && c <= 0xAE;
const isToned = (c) => TC_BYTES.has(c) && !isUntoned(c);
const UPPER_LOSSY = new Set([...T.VN].filter((c) => isUpper(c) && !'ĂÂÊÔƠƯĐ'.includes(c)));

const GBK = T.GBK;
const GBK_REV = new Map(); // ky tu -> (lead<<8)|trail
for (let i = 0; i < GBK.length; i++) {
  const ch = GBK[i];
  if (ch !== '\u0000' && !GBK_REV.has(ch)) GBK_REV.set(ch, ((0x81 + Math.floor(i / 191)) << 8) | (0x40 + (i % 191)));
}

function alpha(c) {
  return c !== null && ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A));
}

function cjkish(ch) {
  const o = ch.codePointAt(0);
  return (o >= 0x4E00 && o <= 0x9FFF) || (o >= 0x3400 && o <= 0x4DBF) || (o >= 0xF900 && o <= 0xFAFF)
    || (o >= 0x3000 && o <= 0x303F) || (o >= 0xFF00 && o <= 0xFFEF) || (o >= 0x2000 && o <= 0x206F)
    || (o >= 0x2100 && o <= 0x22FF) || (o >= 0x2460 && o <= 0x24FF) || (o >= 0x2500 && o <= 0x26FF)
    || o === 0xA4 || o === 0xA7 || o === 0xA8 || o === 0xB0 || o === 0xB1 || o === 0xB7 || o === 0xD7 || o === 0xF7;
}

function gbkPair(b0, b1, strict) {
  if (b0 < 0x81 || b0 > 0xFE || b1 < 0x40 || b1 > 0xFE) return null;
  const ch = GBK[(b0 - 0x81) * 191 + (b1 - 0x40)];
  if (ch === '\u0000') return null;
  if (strict && W2T.has(ch)) return null;
  return ch;
}

function gbkChars(run) {
  if (run.length % 2) return null;
  const out = [];
  for (let i = 0; i < run.length; i += 2) {
    const ch = gbkPair(run[i], run[i + 1], false);
    if (ch === null) return null;
    out.push(ch);
  }
  return out;
}

function gb2312(run) {
  for (let i = 0; i < run.length - 1; i += 2) {
    if (!(run[i] >= 0xA1 && run[i] <= 0xF7 && run[i + 1] >= 0xA1 && run[i + 1] <= 0xFE)) return false;
  }
  return true;
}

// Cum byte cao lien nhau thuoc 1 am tiet: dau cau chi o hai dau; phan chu <=3 byte, <=1 dau thanh, Đ/đ chi dung dau.
function tcvn3Plausible(run) {
  let s = 0;
  let e = run.length;
  while (s < e && WEST_B.has(run[s])) s++;
  while (e > s && WEST_B.has(run[e - 1])) e--;
  if (s >= e) return true;
  if (e - s > 3) return false;
  let toned = 0;
  for (let k = s; k < e; k++) {
    if (!TC_BYTES.has(run[k])) return false;
    if (isToned(run[k])) toned++;
  }
  if (toned > 1) return false;
  for (let k = s + 1; k < e; k++) if (run[k] === 0xA7 || run[k] === 0xAE) return false;
  return true;
}

function classifyRun(run, prev, nxt) {
  const tc = tcvn3Plausible(run);
  const g = gbkChars(run);
  const gp = g !== null && g.every(cjkish);
  if (tc && !gp) return 'tcvn3';
  if (gp && !tc) return 'gbk';
  if (tc && gp) {
    if (gb2312(run)) return alpha(prev) && alpha(nxt) ? 'tcvn3' : 'gbk';
    return alpha(prev) || alpha(nxt) ? 'tcvn3' : 'gbk';
  }
  for (const c of run) if (!TC_BYTES.has(c) && !WEST_B.has(c)) return 'gbk';
  return 'tcvn3';
}

// Chia bytes thanh cac doan [kind, start, end]; kind = 'ascii' | 'tcvn3' | 'gbk'.
function* segments(d) {
  const n = d.length;
  let i = 0;
  while (i < n) {
    let j = i;
    if (d[i] < 0x80) {
      while (j < n && d[j] < 0x80) j++;
      yield ['ascii', i, j];
      i = j;
      continue;
    }
    while (j < n && d[j] >= 0x80) j++;
    const run = d.subarray(i, j);
    const prev = i > 0 ? d[i - 1] : null;
    const nxt = j < n ? d[j] : null;
    // chu GBK mo rong co byte thu hai la ASCII (0x40-0x7E)
    if (run.length % 2 === 1 && nxt !== null && nxt >= 0x40 && nxt <= 0x7E && !tcvn3Plausible(run)) {
      const g = gbkChars(d.subarray(i, j + 1));
      if (g !== null && g.every(cjkish)) {
        yield ['gbk', i, j + 1];
        i = j + 1;
        continue;
      }
    }
    yield [classifyRun(run, prev, nxt), i, j];
    i = j;
  }
}

function raw(c, strict) {
  if (c < 0x80) return String.fromCharCode(c);
  return strict ? String.fromCharCode(PUA + c) : '[x' + c.toString(16).toUpperCase().padStart(2, '0') + ']';
}

function decTcvn3(run, strict) {
  let s = '';
  for (const c of run) {
    if (T2U.has(c)) s += T2U.get(c);
    else if (T2W.has(c)) s += T2W.get(c);
    else s += raw(c, strict);
  }
  return s;
}

function decGbk(run, strict) {
  let s = '';
  let i = 0;
  while (i < run.length) {
    const ch = i + 1 < run.length ? gbkPair(run[i], run[i + 1], false) : null;
    if (ch === null) {
      s += raw(run[i], strict);
      i += 1;
      continue;
    }
    if (strict && W2T.has(ch)) s += raw(run[i], strict) + raw(run[i + 1], strict);
    else s += ch;
    i += 2;
  }
  return s;
}

// strict=true: ban xem ma hoa lai dung tung byte; strict=false: chi de doc.
function decode(bytes, strict = true) {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const parts = [];
  for (const [kind, s, e] of segments(d)) {
    const run = d.subarray(s, e);
    if (kind === 'ascii') parts.push(Buffer.from(run.buffer, run.byteOffset, run.length).toString('latin1'));
    else if (kind === 'tcvn3') parts.push(decTcvn3(run, strict));
    else parts.push(decGbk(run, strict));
  }
  return parts.join('');
}

const COMB = /[A-Za-zÀ-ɏḀ-ỿ][̀-ͯ]+/g;
// Gop dau to hop cua chu Latin; khong NFC ca chuoi (giu nguyen chu Han tuong thich).
function compose(text) {
  return text.replace(COMB, (m) => m.normalize('NFC'));
}

class EncodeError extends Error {
  constructor(bad) {
    super('Ký tự không có trong TCVN3/GBK: ' + bad.slice(0, 10).map((b) => `"${b.ch}" (U+${b.ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) dòng ${b.line} cột ${b.col}`).join('; '));
    this.bad = bad;
  }
}

// Unicode -> bytes: ASCII giu nguyen, chu Viet -> TCVN3, dau cau “ ” … -> byte vnconv, chu Han -> GBK.
function encode(text) {
  text = compose(text);
  const out = new Uint8Array(text.length * 2 + 4);
  let n = 0;
  const bad = [];
  let line = 1;
  let col = 1;
  for (const ch of text) {
    const o = ch.codePointAt(0);
    if (o < 0x80) out[n++] = o;
    else if (o >= PUA + 0x80 && o <= PUA + 0xFF) out[n++] = o - PUA;
    else if (U2T.has(ch)) out[n++] = U2T.get(ch);
    else if (W2T.has(ch)) out[n++] = W2T.get(ch);
    else {
      const g = GBK_REV.get(ch);
      if (g !== undefined) {
        out[n++] = g >> 8;
        out[n++] = g & 0xFF;
      } else {
        bad.push({ ch, line, col });
        out[n++] = 0x3F;
      }
    }
    if (ch === '\n') {
      line++;
      col = 1;
    } else col++;
  }
  if (bad.length) throw new EncodeError(bad);
  return Buffer.from(out.buffer, 0, n);
}

// Canh bao cho chu MOI viet.
function warnings(text) {
  text = compose(text);
  const w = [];
  const lossy = [...new Set([...text].filter((c) => UPPER_LOSSY.has(c)))].sort();
  if (lossy.length) w.push('Chữ hoa có dấu thanh không có trong TCVN3, sẽ thành chữ thường: ' + lossy.join(' '));
  const gbk = [...new Set([...text].filter((c) => {
    const o = c.codePointAt(0);
    return o >= 0x80 && !U2T.has(c) && !W2T.has(c) && !(o >= PUA + 0x80 && o <= PUA + 0xFF);
  }))].sort();
  if (gbk.length) {
    w.push('Ký tự không phải chữ Việt, sẽ ghi bằng GBK (2 byte): ' + gbk.join(' ') + ' — nếu nằm trong chuỗi tiếng Việt thì đổi sang ASCII.');
    const t5c = gbk.filter((c) => GBK_REV.has(c) && (GBK_REV.get(c) & 0xFF) === 0x5C);
    if (t5c.length) w.push('Chữ GBK có byte thứ hai là dấu \\ (hỏng chuỗi Lua): ' + t5c.join(' '));
  }
  return w;
}

// Loai file: 'utf16' | 'utf8' (co byte cao, UTF-8 hop le) | 'ascii' | 'legacy' (TCVN3/GBK).
const UTF8_FATAL = new TextDecoder('utf-8', { fatal: true });
function sniff(bytes) {
  if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) return 'utf16';
  let high = false;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] >= 0x80) { high = true; break; }
  if (!high) return 'ascii';
  try {
    UTF8_FATAL.decode(bytes);
    return 'utf8';
  } catch (e) {
    return 'legacy';
  }
}

module.exports = { decode, encode, compose, warnings, sniff, segments, EncodeError, PUA, U2T, W2T, GBK_REV };
