'use strict';
// TCVN3 Editor: mo file TCVN3 (+ GBK) duoi dang Unicode, luu lai dung byte.
// Co che: FileSystemProvider cho scheme "tcvn3:" — doc file goc, giai ma -> UTF-8 cho VS Code; khi luu ma hoa nguoc lai.

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const codec = require('./codec');
const { prepareSave } = require('./save');

const SCHEME = 'tcvn3';
let out;
const lastWrite = new Map(); // duong dan (thuong) -> mtime sau lan ghi gan nhat cua extension
const rawOptOut = new Set(); // file nguoi dung chu dong mo dang goc -> khong tu mo lai
const busy = new Set();

const cfg = () => vscode.workspace.getConfiguration('tcvn3');
const toFile = (u) => u.with({ scheme: 'file' });
const toTcvn3 = (u) => u.with({ scheme: SCHEME });
const keyOf = (u) => toFile(u).fsPath.toLowerCase();
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const pad = (n) => String(n).padStart(2, '0');

function log(s) {
  const d = new Date();
  out.appendLine(`[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}] ${s}`);
}

function extOk(uri) {
  const exts = cfg().get('fileExtensions', ['.lua', '.ini', '.txt']).map((e) => e.toLowerCase());
  return exts.includes(path.extname(uri.fsPath).toLowerCase());
}

function inProject(uri) {
  const p = uri.fsPath.replace(/\//g, '\\').toLowerCase();
  return cfg().get('projectFolders', [])
    .some((f) => f && p.includes(f.replace(/\//g, '\\').toLowerCase()));
}

// file nay co nen mo qua tcvn3: khong?
function wantsTcvn3(uri, bytes) {
  const k = codec.sniff(bytes);
  return k === 'legacy' || (k === 'ascii' && inProject(uri));
}

function backupPath(fileUri) {
  const p = fileUri.fsPath;
  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hms = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const base = cfg().get('backupDir', '') || path.join(os.homedir(), '.tcvn3-editor', 'backups');
  // Separate equal filenames without copying their source directory names.
  const identity = process.platform === 'win32' ? p.toLowerCase() : p;
  const bucket = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16);
  const name = path.basename(p);
  let dst = path.join(base, date, bucket, name + '.' + hms);
  for (let n = 2; fs.existsSync(dst); n++) dst = path.join(base, date, bucket, name + '.' + hms + '_' + n);
  return dst;
}

class Tcvn3FS {
  constructor() {
    this._em = new vscode.EventEmitter();
    this.onDidChangeFile = this._em.event;
  }

  watch(uri, options) {
    const f = toFile(uri);
    // VS Code watches the parent directory, not necessarily the document itself.
    let isDirectory = false;
    try { isDirectory = fs.statSync(f.fsPath).isDirectory(); } catch (e) { /* new file */ }
    const pattern = isDirectory
      ? new vscode.RelativePattern(f, options && options.recursive ? '**/*' : '*')
      : new vscode.RelativePattern(vscode.Uri.file(path.dirname(f.fsPath)), path.basename(f.fsPath));
    const w = vscode.workspace.createFileSystemWatcher(pattern);
    const fire = (type, changed) => this._em.fire([{ type, uri: toTcvn3(changed) }]);
    w.onDidChange((changed) => fire(vscode.FileChangeType.Changed, changed));
    w.onDidCreate((changed) => fire(vscode.FileChangeType.Created, changed));
    w.onDidDelete((changed) => fire(vscode.FileChangeType.Deleted, changed));
    return w;
  }

  stat(uri) { return vscode.workspace.fs.stat(toFile(uri)); }
  readDirectory(uri) { return vscode.workspace.fs.readDirectory(toFile(uri)); }
  createDirectory(uri) { return vscode.workspace.fs.createDirectory(toFile(uri)); }
  delete(uri, options) { return vscode.workspace.fs.delete(toFile(uri), options); }
  rename(a, b, options) { return vscode.workspace.fs.rename(toFile(a), toFile(b), options); }

  async readFile(uri) {
    const raw = Buffer.from(await vscode.workspace.fs.readFile(toFile(uri)));
    const kind = codec.sniff(raw);
    if (kind === 'utf16' || kind === 'utf8') {
      throw vscode.FileSystemError.Unavailable(`TCVN3: file là ${kind.toUpperCase()}, hãy mở bình thường (TCVN3: Mở dạng gốc).`);
    }
    const text = codec.decode(raw, true);
    let back = null;
    try { back = codec.encode(text); } catch (e) { back = null; }
    if (!back || Buffer.compare(back, raw) !== 0) {
      throw vscode.FileSystemError.Unavailable('TCVN3: không bảo đảm ghi lại đúng byte cho file này — không mở.');
    }
    return Buffer.from(text, 'utf8');
  }

  async writeFile(uri, content, options) {
    const f = toFile(uri);
    let old = null;
    try { old = Buffer.from(await vscode.workspace.fs.readFile(f)); } catch (e) { old = null; }
    if (old === null && !options.create) throw vscode.FileSystemError.FileNotFound(uri);
    if (old !== null && !options.overwrite) throw vscode.FileSystemError.FileExists(uri);
    if (old !== null && ['utf8', 'utf16'].includes(codec.sniff(old))) {
      throw vscode.FileSystemError.NoPermissions('TCVN3: file trên đĩa đã là UTF-8/UTF-16, không ghi đè bằng TCVN3.');
    }
    const name = path.basename(f.fsPath);
    let r;
    try {
      r = prepareSave(old, Buffer.from(content).toString('utf8'));
    } catch (e) {
      if (e instanceof codec.EncodeError) {
        const msg = `TCVN3: chưa lưu "${name}" — ${e.message}`;
        log(msg);
        vscode.window.showErrorMessage(msg);
        throw vscode.FileSystemError.NoPermissions(msg);
      }
      throw e;
    }
    if (r.unchanged) {
      log(`${name}: không có byte nào thay đổi.`);
      return;
    }
    let bk = '';
    if (old !== null) {
      const mtime = fs.statSync(f.fsPath).mtimeMs;
      if (lastWrite.get(keyOf(f)) !== mtime) { // lan luu dau trong phien, hoac file doi tu ben ngoai
        bk = backupPath(f);
        fs.mkdirSync(path.dirname(bk), { recursive: true });
        fs.writeFileSync(bk, old);
      }
    }
    await vscode.workspace.fs.writeFile(f, r.bytes);
    const check = Buffer.from(await vscode.workspace.fs.readFile(f));
    if (Buffer.compare(check, Buffer.from(r.bytes)) !== 0) {
      throw vscode.FileSystemError.Unavailable('TCVN3: đọc lại không khớp nội dung vừa ghi!');
    }
    lastWrite.set(keyOf(f), fs.statSync(f.fsPath).mtimeMs);
    log(`${name}: đã lưu TCVN3/GBK, dòng đổi ${JSON.stringify(r.changedLines.slice(0, 30))}`
      + `${r.changedLines.length > 30 ? '…' : ''}; md5 cũ=${old ? md5(old) : '-'} mới=${md5(Buffer.from(r.bytes))}`
      + (bk ? `; bản sao: ${path.basename(bk)}` : ''));
    for (const w of r.warnings) log('  CẢNH BÁO: ' + w);
    if (r.warnings.length) vscode.window.showWarningMessage(`TCVN3 (${name}): ${r.warnings.join(' | ')}`);
  }
}

function findTabs(uri) {
  const s = uri.toString();
  const tabs = [];
  for (const g of vscode.window.tabGroups.all) {
    for (const t of g.tabs) if (t.input instanceof vscode.TabInputText && t.input.uri.toString() === s) tabs.push(t);
  }
  return tabs;
}

// Thay tab dang mo "from" bang tab "to" (cung vi tri, cung che do xem truoc, cung vung dang xem).
async function swapEditor(from, to) {
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === from.toString());
  if (doc && doc.isDirty) {
    const isRaw = from.scheme === 'file';
    const pick = await vscode.window.showWarningMessage(
      isRaw ? `"${path.basename(from.fsPath)}" đang có thay đổi chưa lưu ở chế độ UTF-8 (chữ TCVN3 đã thành �). ĐỪNG lưu bản này. Bỏ thay đổi và mở lại dạng TCVN3?`
        : `"${path.basename(from.fsPath)}" có thay đổi chưa lưu. Hãy lưu (Ctrl+S) trước khi mở dạng gốc.`,
      { modal: true }, ...(isRaw ? ['Bỏ thay đổi và mở TCVN3'] : []));
    if (!pick) return false;
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('workbench.action.files.revert');
  }
  const old = findTabs(from);
  const ed = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === from.toString());
  const tab = old.find((t) => t.isActive) || old[0];
  const opts = { preview: tab ? tab.isPreview : undefined, viewColumn: tab ? tab.group.viewColumn : undefined };
  if (ed) opts.selection = ed.selection;
  const range = ed && ed.visibleRanges[0];
  const ned = await vscode.window.showTextDocument(to, opts);
  if (range) ned.revealRange(range, vscode.TextEditorRevealType.AtTop);
  const stale = findTabs(from);
  if (stale.length) await vscode.window.tabGroups.close(stale, true);
  return true;
}

async function openAsTcvn3(arg) {
  const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
  if (!uri || uri.scheme === SCHEME) return;
  if (uri.scheme !== 'file') {
    vscode.window.showInformationMessage('TCVN3: chỉ mở được file trên đĩa.');
    return;
  }
  const kind = codec.sniff(Buffer.from(await vscode.workspace.fs.readFile(uri)));
  if (kind === 'utf8' || kind === 'utf16') {
    vscode.window.showInformationMessage(`TCVN3: "${path.basename(uri.fsPath)}" là ${kind.toUpperCase()}, mở bình thường là đúng.`);
    return;
  }
  rawOptOut.delete(uri.toString());
  if (!vscode.window.activeTextEditor || vscode.window.activeTextEditor.document.uri.toString() !== uri.toString()) {
    if (!findTabs(uri).length) {
      await vscode.window.showTextDocument(toTcvn3(uri));
      return;
    }
  }
  await swapEditor(uri, toTcvn3(uri));
}

async function openRaw(arg) {
  const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
  if (!uri || uri.scheme !== SCHEME) return;
  const f = toFile(uri);
  rawOptOut.add(f.toString());
  if (!(await swapEditor(uri, f))) rawOptOut.delete(f.toString());
}

async function maybeAuto(editor) {
  if (!editor || !cfg().get('autoOpen', true)) return;
  const uri = editor.document.uri;
  if (uri.scheme !== 'file' || !extOk(uri) || rawOptOut.has(uri.toString())) return;
  const tabIsText = () => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    return !!tab && tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString();
  };
  if (!tabIsText()) { // tab co the cap nhat cham hon editor; thu lai 1 lan. Tab diff... thi bo qua.
    await new Promise((r) => setTimeout(r, 150));
    if (!tabIsText()) return;
  }
  if (editor.document.isDirty) return;
  const k = uri.toString();
  if (busy.has(k)) return;
  busy.add(k);
  try {
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri));
    if (wantsTcvn3(uri, raw)) await swapEditor(uri, toTcvn3(uri));
  } catch (e) {
    log(`Tự mở lỗi (${path.basename(uri.fsPath)}): ${e && (e.code || e.name) || 'Error'}. Hãy thử lệnh mở TCVN3 thủ công.`);
  } finally {
    busy.delete(k);
  }
}

let sb;
async function updateStatus() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) { sb.hide(); return; }
  const u = ed.document.uri;
  if (u.scheme === SCHEME) {
    sb.text = '$(check) TCVN3+GBK';
    sb.tooltip = 'Đang mở qua TCVN3: hiển thị Unicode; khi lưu ghi lại chữ Việt bằng TCVN3, chữ Hán bằng GBK, giữ nguyên byte phần không sửa.\nBấm để mở dạng gốc (byte).';
    sb.command = 'tcvn3.openRaw';
    sb.backgroundColor = undefined;
    sb.show();
    return;
  }
  if (u.scheme === 'file' && extOk(u)) {
    try {
      const st = fs.statSync(u.fsPath);
      if (st.size < 64 * 1024 * 1024 && codec.sniff(fs.readFileSync(u.fsPath)) === 'legacy') {
        sb.text = '$(warning) TCVN3: bấm để hiện đúng';
        sb.tooltip = 'File TCVN3/GBK đang mở như UTF-8 — ĐỪNG lưu ở chế độ này.';
        sb.command = { command: 'tcvn3.open', title: 'TCVN3', arguments: [u] };
        sb.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        sb.show();
        return;
      }
    } catch (e) { /* bo qua */ }
  }
  sb.hide();
}

// Tim chu (co dau) trong cac file; tra ve danh sach {uri, line, col, text, kind}.
async function searchIn(roots, query, token, progress) {
  const needle = codec.compose(query).toLowerCase();
  const exts = cfg().get('fileExtensions', ['.lua', '.ini', '.txt']).map((e) => e.replace(/^\./, ''));
  const glob = `**/*.{${exts.join(',')}}`;
  const items = [];
  for (const root of roots) {
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(root, glob), '**/{node_modules,.git}/**', 200000, token);
    let done = 0;
    for (const f of files) {
      if ((token && token.isCancellationRequested) || items.length >= 3000) break;
      done++;
      if (progress && done % 200 === 0) progress.report({ message: `${done}/${files.length} file, ${items.length} kết quả` });
      let raw;
      try { raw = await fs.promises.readFile(f.fsPath); } catch (e) { continue; }
      const kind = codec.sniff(raw);
      const text = kind === 'utf8' ? raw.toString('utf8')
        : kind === 'utf16' ? (raw[0] === 0xFF ? raw.subarray(2).toString('utf16le') : '')
          : codec.decode(raw, true);
      const lines = text.split(/\r\n|\r|\n/);
      for (let i = 0; i < lines.length; i++) {
        const c = lines[i].toLowerCase().indexOf(needle);
        if (c >= 0) items.push({ uri: f, line: i, col: c, len: needle.length, text: lines[i], kind });
      }
    }
  }
  return items;
}

async function searchCmd(folderArg) {
  let roots;
  if (folderArg instanceof vscode.Uri) roots = [toFile(folderArg)];
  else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length) roots = vscode.workspace.workspaceFolders.map((w) => w.uri);
  else if (vscode.window.activeTextEditor) roots = [vscode.Uri.file(path.dirname(toFile(vscode.window.activeTextEditor.document.uri).fsPath))];
  else {
    const pick = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Tìm trong thư mục này' });
    if (!pick) return;
    roots = pick;
  }
  const q = await vscode.window.showInputBox({ prompt: 'TCVN3: tìm chữ (gõ có dấu, không phân biệt hoa thường) trong ' + roots.map((r) => path.basename(r.fsPath)).join(', ') });
  if (!q) return;
  const items = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `TCVN3: đang tìm "${q}"…`, cancellable: true },
    (progress, token) => searchIn(roots, q, token, progress));
  if (!items.length) {
    vscode.window.showInformationMessage(`TCVN3: không tìm thấy "${q}".`);
    return;
  }
  const qp = items.map((it) => ({
    label: it.text.trim().slice(0, 200) || ' ',
    description: `${vscode.workspace.asRelativePath(it.uri)}:${it.line + 1}`,
    it,
  }));
  const pick = await vscode.window.showQuickPick(qp, { matchOnDescription: true, placeHolder: `${items.length} kết quả cho "${q}"${items.length >= 3000 ? ' (dừng ở 3000)' : ''}` });
  if (!pick) return;
  const it = pick.it;
  const target = (it.kind === 'legacy' || (it.kind === 'ascii' && inProject(it.uri))) ? toTcvn3(it.uri) : it.uri;
  const a = new vscode.Position(it.line, it.col);
  await vscode.window.showTextDocument(target, { selection: new vscode.Range(a, a.translate(0, it.len)) });
}

function activate(context) {
  out = vscode.window.createOutputChannel('TCVN3');
  context.subscriptions.push(out);
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider(SCHEME, new Tcvn3FS(), { isCaseSensitive: false }));
  context.subscriptions.push(vscode.commands.registerCommand('tcvn3.open', openAsTcvn3));
  context.subscriptions.push(vscode.commands.registerCommand('tcvn3.openRaw', openRaw));
  context.subscriptions.push(vscode.commands.registerCommand('tcvn3.search', searchCmd));
  context.subscriptions.push(vscode.commands.registerCommand('tcvn3.showLog', () => out.show()));
  sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  context.subscriptions.push(sb);
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => {
    maybeAuto(e);
    updateStatus();
  }));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((d) => {
    if (d.uri.scheme === 'file') rawOptOut.delete(d.uri.toString());
  }));
  maybeAuto(vscode.window.activeTextEditor);
  updateStatus();
  log('TCVN3 Editor đã bật.');
  return { codec, searchIn, toTcvn3 }; // dung cho kiem thu
}

function deactivate() {}

module.exports = { activate, deactivate };
