'use strict';
// Kiem thu that trong VS Code (che do --extensionTestsPath). Thu muc thu: bien moi truong TCVN3_E2E_DIR
// (chua ban sao file trong <dir>/workspace/...). Ket qua ghi vao <dir>/e2e_result.txt.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const R = process.env.TCVN3_E2E_DIR;
const WORK = path.join(R, 'workspace');
const results = [];
const ok = (name, cond, extra) => results.push((cond ? 'DAT   ' : 'TRUOT ') + name + (extra ? '  [' + extra + ']' : ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { if (await fn()) return true; } catch (e) { /* thu lai */ }
    await sleep(100);
  }
  return false;
}
const act = () => vscode.window.activeTextEditor;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const rawLines = (b) => b.toString('latin1').split('\n');
const loneCR = (b) => { let n = 0; for (let i = 0; i < b.length; i++) if (b[i] === 13 && b[i + 1] !== 10) n++; return n; };

async function open(p, expectScheme) {
  await vscode.window.showTextDocument(vscode.Uri.file(p), { preview: false });
  const got = await waitFor(() => act() && same(act().document.uri.fsPath, p) && act().document.uri.scheme === expectScheme, 8000);
  if (expectScheme === 'file') await sleep(1200); // cho xem co bi tu mo sang tcvn3 khong
  return { ed: act(), got: got && act().document.uri.scheme === expectScheme };
}
async function replaceText(doc, a, b) {
  const t = doc.getText();
  const i = t.indexOf(a);
  if (i < 0) throw new Error('khong thay: ' + a);
  const we = new vscode.WorkspaceEdit();
  we.replace(doc.uri, new vscode.Range(doc.positionAt(i), doc.positionAt(i + a.length)), b);
  await vscode.workspace.applyEdit(we);
}
function backups() {
  const out = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  })(path.join(R, 'backups'));
  return out;
}

async function main() {
  const ext = vscode.extensions.getExtension('canh-trang.tcvn3-editor');
  const api = await ext.activate();
  const codec = api.codec;

  // 1. Tu mo file TCVN3+GBK
  const npc = path.join(WORK, 'script', 'sample.lua');
  const npcOrig = fs.readFileSync(npc);
  let { ed, got } = await open(npc, 'tcvn3');
  ok('1. tu mo file TCVN3+GBK qua tcvn3:', got, ed && ed.document.uri.toString());
  const doc = ed.document;
  ok('1. hien dung chu Viet "Trạng thái luyện công"', doc.getText().includes('"Trạng thái luyện công"'));
  ok('1. hien dung chu Han "中文注释测试"', doc.getText().includes('中文注释测试'));
  const fileTabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputText && t.input.uri.scheme === 'file' && same(t.input.uri.fsPath, npc));
  ok('1. tab UTF-8 cu da dong', await waitFor(() => fileTabs().length === 0), String(fileTabs().length));
  ok('1. ngon ngu van la lua', doc.languageId === 'lua', doc.languageId);

  // 2. Sua + luu
  await replaceText(doc, 'Trạng thái luyện công', 'Trạng thái luyện công (đã thử “sửa”…)');
  const saved = await doc.save();
  const npc2 = fs.readFileSync(npc);
  const o = rawLines(npcOrig);
  const n = rawLines(npc2);
  const diff = n.map((l, i) => (l !== o[i] ? i : -1)).filter((i) => i >= 0);
  ok('2. luu thanh cong', saved && !doc.isDirty);
  ok('2. chi doi dung 1 dong, so dong giu nguyen', n.length === o.length && diff.length === 1, JSON.stringify(diff));
  ok('2. dong doi dung byte TCVN3 (khop codec.encode)', Buffer.from(n[diff[0]], 'latin1').includes(codec.encode('Trạng thái luyện công (đã thử “sửa”…)')));
  ok('2. khong BOM, khong UTF-8', npc2[0] !== 0xEF && codec.sniff(npc2) === 'legacy');
  const bk1 = backups();
  ok('2. co ban sao luu = ban goc', bk1.length === 1 && Buffer.compare(fs.readFileSync(bk1[0]), npcOrig) === 0, bk1.map((b) => path.relative(R, b)).join(','));
  ok('2. sao luu dung ma dinh danh, khong sao chep thu muc nguon', bk1.every((p) => {
    const parts = path.relative(path.join(R, 'backups'), p).split(path.sep);
    return parts.length === 3 && /^[a-f0-9]{16}$/.test(parts[1]);
  }));

  // 3. Luu lan 2 trong phien -> khong sao luu them
  await replaceText(doc, '(đã thử “sửa”…)', '(thử lần 2)');
  await doc.save();
  ok('3. luu lan 2 khong tao them ban sao luu', backups().length === 1);

  // 4. Ky tu ngoai bang -> khong luu, file tren dia khong doi
  const before4 = fs.readFileSync(npc);
  await replaceText(doc, '(thử lần 2)', '(🎁)');
  let saved4;
  try { saved4 = await doc.save(); } catch (e) { saved4 = false; }
  ok('4. emoji -> tu choi luu', saved4 === false && doc.isDirty);
  ok('4. file tren dia khong doi', Buffer.compare(fs.readFileSync(npc), before4) === 0);
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('workbench.action.files.revert');
  ok('4. revert xong', !doc.isDirty);

  // 5. File doi tu ben ngoai -> tab tu cap nhat
  const ext5 = Buffer.concat([fs.readFileSync(npc), codec.encode('-- dòng thêm từ bên ngoài\r\n')]);
  fs.writeFileSync(npc, ext5);
  ok('5. file doi ben ngoai -> tab cap nhat', await waitFor(() => doc.getText().includes('-- dòng thêm từ bên ngoài'), 8000));
  await replaceText(doc, '-- dòng thêm từ bên ngoài', '-- dòng bên ngoài đã sửa');
  await doc.save();
  ok('5. luu sau thay doi ben ngoai -> sao luu lai ban tren dia', backups().length === 2
    && backups().some((p) => Buffer.compare(fs.readFileSync(p), ext5) === 0));

  // 6. Mo dang goc roi mo lai TCVN3
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('tcvn3.openRaw');
  const r6 = await waitFor(() => act() && act().document.uri.scheme === 'file' && same(act().document.uri.fsPath, npc), 5000);
  await sleep(1200);
  ok('6. TCVN3: Mo dang goc -> tab file:, khong bi tu mo lai', r6 && act().document.uri.scheme === 'file');
  await vscode.commands.executeCommand('tcvn3.open');
  ok('6. TCVN3: Mo dang TCVN3 -> tab tcvn3:', await waitFor(() => act() && act().document.uri.scheme === 'tcvn3', 5000));

  // 7. File tron CRLF/LF
  const mix = path.join(WORK, 'script', 'mixed.lua');
  const mixOrig = fs.readFileSync(mix);
  ({ ed, got } = await open(mix, 'tcvn3'));
  await replaceText(ed.document, 'Hành trang không còn chỗ trống.', 'Hành trang đã đầy.');
  await ed.document.save();
  const mo = rawLines(mixOrig);
  const mn = rawLines(fs.readFileSync(mix));
  const d7 = mn.map((l, i) => (l !== mo[i] ? i : -1)).filter((i) => i >= 0);
  ok('7. file tron CRLF/LF: chi 1 dong doi, CRLF/LF cac dong khac giu nguyen', got && mn.length === mo.length && d7.length === 1, JSON.stringify(d7));
  ok('7. so CRLF giu nguyen', (fs.readFileSync(mix).toString('latin1').match(/\r\n/g) || []).length === (mixOrig.toString('latin1').match(/\r\n/g) || []).length);

  // 8. File TCVN3+GBK CRLF: chu thich GBK giu nguyen
  const dab = path.join(WORK, 'script', 'comments.lua');
  const dabOrig = fs.readFileSync(dab);
  ({ ed, got } = await open(dab, 'tcvn3'));
  ok('8. hien chu Han trong chu thich', ed.document.getText().includes('中文注释测试'));
  await replaceText(ed.document, 'Nội dung tiếng Việt', 'Nội dung mới');
  await ed.document.save();
  const dl = rawLines(fs.readFileSync(dab));
  const dlo = rawLines(dabOrig);
  ok('8. 5 dong chu thich GBK giu nguyen byte', [0, 1, 2, 3, 4].every((i) => dl[i] === dlo[i]));
  ok('8. toan file van CRLF', !/[^\r]\n/.test(fs.readFileSync(dab).toString('latin1')));

  // 9. File co CR le
  const muyi = path.join(WORK, 'script', 'lone_cr.lua');
  const muyiOrig = fs.readFileSync(muyi);
  ({ ed, got } = await open(muyi, 'tcvn3'));
  const t9 = ed.document.getText();
  const firstLine = t9.split(/\r\n|\r|\n/)[0];
  const we = new vscode.WorkspaceEdit();
  we.insert(ed.document.uri, new vscode.Position(0, firstLine.length), ' ');
  await vscode.workspace.applyEdit(we);
  await ed.document.save();
  const m9 = fs.readFileSync(muyi);
  ok('9. file CR le: CR le van con, chi them 1 byte', loneCR(m9) === loneCR(muyiOrig) && m9.length === muyiOrig.length + 1);

  // 10. File UTF-8 -> khong tu mo
  const utf = path.join(WORK, 'client', 'utf8.ini');
  ({ got } = await open(utf, 'file'));
  ok('10. file UTF-8 giu che do binh thuong', got);

  // 11. File ASCII trong thu muc du an -> mo tcvn3, go chu Viet luu bang TCVN3
  const asc = path.join(WORK, 'script', 'ascii.lua');
  ({ ed, got } = await open(asc, 'tcvn3'));
  ok('11. file ASCII trong thu muc da cau hinh -> tcvn3:', got);
  await replaceText(ed.document, '-- Reserved', '-- Thử: Reserved');
  await ed.document.save();
  ok('11. chu Viet trong file ASCII luu bang TCVN3', fs.readFileSync(asc).includes(codec.encode('Thử:')));

  // 12. File ASCII ngoai du an -> khong tu mo
  ({ got } = await open(path.join(R, 'other', 'plain.lua'), 'file'));
  ok('12. file ASCII ngoai du an giu che do binh thuong', got);

  // 13. Tim chu co dau
  const items = await api.searchIn([vscode.Uri.file(WORK)], 'LUYỆN CÔNG');
  ok('13. tim "LUYỆN CÔNG" ra dong trong sample.lua', items.some((it) => same(it.uri.fsPath, npc) && it.text.includes('luyện công')), String(items.length));

  // 14. Sua chinh dong CRLF/CR trong file tron (VS Code da chuan hoa trong bo nho).
  const mixedEol = path.join(WORK, 'script', 'mixed_eol.lua');
  ({ ed, got } = await open(mixedEol, 'tcvn3'));
  await replaceText(ed.document, 'first', 'dòng đầu');
  await replaceText(ed.document, 'third', 'dòng thứ ba');
  await ed.document.save();
  ok('14. dong CRLF/CR duoc sua van giu nguyen xuong dong', got && Buffer.compare(fs.readFileSync(mixedEol),
    codec.encode('dòng đầu\r\nsecond\ndòng thứ ba\rfourth\n')) === 0);

  // 15. UTF-16 duoc bo qua, khong di qua bo ma legacy.
  const utf16 = path.join(WORK, 'script', 'utf16.txt');
  ({ got } = await open(utf16, 'file'));
  ok('15. file UTF-16 giu che do binh thuong', got);

  // 16. Mac dinh khong ep file ASCII sang legacy; lenh mo thu cong van hoat dong.
  await vscode.workspace.getConfiguration('tcvn3').update('projectFolders', [], vscode.ConfigurationTarget.Global);
  const unconfigured = path.join(WORK, 'script', 'unconfigured.lua');
  ({ got } = await open(unconfigured, 'file'));
  ok('16. file ASCII khong cau hinh giu che do binh thuong', got);
  await vscode.commands.executeCommand('tcvn3.open');
  ok('16. mo ASCII thu cong qua tcvn3:', await waitFor(() => act() && act().document.uri.scheme === 'tcvn3'));
  await replaceText(act().document, '-- Reserved', '-- Chữ Việt');
  await act().document.save();
  ok('16. ASCII mo thu cong luu chu Viet dung ma', fs.readFileSync(unconfigured).includes(codec.encode('Chữ Việt')));
}

module.exports.run = async function run() {
  results.length = 0;
  let error;
  try {
    await main();
  } catch (e) {
    error = e;
    results.push('LOI ' + (e && e.stack));
  }
  fs.writeFileSync(path.join(R, 'e2e_result.txt'), results.join('\n') + '\n', 'utf8');
  if (error) throw error;
  const failed = results.filter((r) => r.startsWith('TRUOT '));
  if (failed.length) throw new Error(failed.join('\n'));
};
