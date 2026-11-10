'use strict';
// Chuan bi noi dung ghi file: ma hoa TCVN3/GBK + tra lai kieu xuong dong goc cho cac dong khong sua
// (VS Code tu gop CRLF/LF khi mo file tron xuong dong). Khong phu thuoc vscode.

const codec = require('./codec');

// Tach dong giong VS Code: \r\n, \n va \r le deu la xuong dong.
function splitLines(s) {
  const out = [];
  const re = /\r\n|\r|\n/g;
  let i = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push({ t: s.slice(i, m.index), e: m[0] });
    i = m.index + m[0].length;
  }
  out.push({ t: s.slice(i), e: '' });
  return out;
}

// map[k] = chi so dong cu tuong ung voi dong moi k, hoac -1 (dong moi/sua).
function matchLines(oldL, newL) {
  const map = new Array(newL.length).fill(-1);
  let p = 0;
  while (p < oldL.length && p < newL.length && oldL[p].t === newL[p].t) {
    map[p] = p;
    p++;
  }
  let s = 0;
  while (s < oldL.length - p && s < newL.length - p && oldL[oldL.length - 1 - s].t === newL[newL.length - 1 - s].t) {
    map[newL.length - 1 - s] = oldL.length - 1 - s;
    s++;
  }
  const a = oldL.slice(p, oldL.length - s);
  const b = newL.slice(p, newL.length - s);
  if (a.length && b.length && a.length * b.length <= 4e6) {
    // LCS tren phan giua
    const n = a.length;
    const m = b.length;
    const W = m + 1;
    const dp = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * W + j] = a[i].t === b[j].t ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i].t === b[j].t) {
        map[p + j] = p + i;
        i++;
        j++;
      } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
      else j++;
    }
  }
  return map;
}

function newlineStyle(text) {
  const styles = new Set(text.match(/\r\n|\r|\n/g) || []);
  return styles.size === 1 ? [...styles][0] : null;
}

/**
 * oldBytes: noi dung file hien tai tren dia (null neu file moi); newText: noi dung VS Code muon ghi.
 * Tra ve { bytes, unchanged, changedLines, warnings }. Nem codec.EncodeError neu co ky tu khong ma hoa duoc.
 */
function prepareSave(oldBytes, newText) {
  if (newText.charCodeAt(0) === 0xFEFF) newText = newText.slice(1);
  let text = newText;
  let changedLines = [];
  if (oldBytes) {
    const oldText = codec.decode(oldBytes, true);
    const oldL = splitLines(oldText);
    const newL = splitLines(newText);
    const map = matchLines(oldL, newL);
    // A replacement keeps its original terminator too. VS Code normalizes all
    // terminators in memory, including lines the user actually edits.
    const eolMap = map.slice();
    let prevOld = -1;
    let prevNew = -1;
    for (let k = 0; k <= newL.length; k++) {
      if (k < newL.length && map[k] < 0) continue;
      const anchor = k === newL.length ? oldL.length : map[k];
      if (anchor - prevOld === k - prevNew) {
        for (let j = prevNew + 1; j < k; j++) eolMap[j] = prevOld + j - prevNew;
      }
      prevOld = anchor;
      prevNew = k;
    }
    const style = newlineStyle(oldText); // file goc thuan CRLF/LF -> dong moi cung dung kieu do
    const parts = [];
    for (let k = 0; k < newL.length; k++) {
      const nl = newL[k];
      let eol;
      if (eolMap[k] >= 0) {
        const ol = oldL[eolMap[k]];
        eol = nl.e === '' ? '' : (ol.e !== '' ? ol.e : (style || nl.e));
      } else {
        eol = nl.e === '' ? '' : (style || nl.e);
      }
      if (map[k] < 0) changedLines.push(k + 1);
      parts.push(nl.t, eol);
    }
    text = parts.join('');
  } else {
    changedLines = splitLines(newText).map((_, k) => k + 1);
  }
  const bytes = codec.encode(text);
  const unchanged = !!oldBytes && Buffer.compare(Buffer.from(bytes), Buffer.from(oldBytes)) === 0;
  const lines = splitLines(text);
  const warnText = changedLines.map((k) => (lines[k - 1] ? lines[k - 1].t : '')).join('\n');
  return { bytes, unchanged, changedLines, warnings: unchanged ? [] : codec.warnings(warnText) };
}

module.exports = { prepareSave, splitLines, matchLines };
