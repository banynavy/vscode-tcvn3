'use strict';
// Run VS Code with isolated profiles and synthetic fixtures.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const codec = require('../codec');

const extension = path.resolve(__dirname, '..');
const code = process.env.TCVN3_CODE_EXE || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const root = process.env.TCVN3_E2E_OUTPUT || path.join(os.tmpdir(), 'tcvn3-editor-tests', stamp);
const work = path.join(root, 'workspace');
const fixtures = [
  ['script/sample.lua', codec.encode('-- 中文注释测试\r\nlocal status = "Trạng thái luyện công"\r\n')],
  ['script/mixed.lua', codec.encode('-- CRLF comment\r\nlocal text = "Hành trang không còn chỗ trống."\nreturn text\n')],
  ['script/comments.lua', codec.encode(('-- 中文注释测试\r\n').repeat(5) + 'local text = "Nội dung tiếng Việt"\r\n')],
  ['script/lone_cr.lua', codec.encode('-- 中文注释测试\r\nlocal a = 1\rreturn a\r\n')],
  ['client/utf8.ini', Buffer.from('[config]\ntitle=Tiếng Việt UTF-8\n', 'utf8')],
  ['script/ascii.lua', Buffer.from('-- Reserved\nreturn 1\n')],
  ['script/unconfigured.lua', Buffer.from('-- Reserved\nreturn 2\n')],
];
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const originals = new Map();
for (const [name, bytes] of fixtures) {
  const dest = path.join(work, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}
fs.mkdirSync(path.join(root, 'other'), { recursive: true });
fs.writeFileSync(path.join(root, 'other', 'plain.lua'), '-- plain ASCII\nreturn 1\n');
fs.writeFileSync(path.join(work, 'script', 'mixed_eol.lua'), 'first\r\nsecond\nthird\rfourth\n');
fs.writeFileSync(path.join(work, 'script', 'utf16.txt'), Buffer.from('\uFEFFUnicode text\r\n', 'utf16le'));
fs.mkdirSync(path.join(root, 'user-data', 'User'), { recursive: true });
fs.writeFileSync(path.join(root, 'user-data', 'User', 'settings.json'), JSON.stringify({
  'workbench.startupEditor': 'none',
  'files.autoSave': 'off',
  'files.hotExit': 'off',
  'extensions.autoCheckUpdates': false,
  'extensions.autoUpdate': false,
  'update.mode': 'none',
  'tcvn3.projectFolders': ['/workspace/'],
  'tcvn3.backupDir': path.join(root, 'backups'),
}));
fs.mkdirSync(path.join(root, 'extensions'), { recursive: true });
const env = { ...process.env, TCVN3_E2E_DIR: root };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VSCODE_IPC_HOOK_CLI;
const args = [
  '--new-window', '--disable-extensions', '--disable-workspace-trust',
  '--skip-welcome', '--skip-release-notes',
  '--user-data-dir', path.join(root, 'user-data'),
  '--extensions-dir', path.join(root, 'extensions'),
  '--extensionDevelopmentPath', process.env.TCVN3_EXTENSION_PATH || extension,
  '--extensionTestsPath', path.join(__dirname, 'e2e'), work,
];
console.log('E2E directory:', root);
const stdout = fs.openSync(path.join(root, 'vscode-stdout.log'), 'w');
const stderr = fs.openSync(path.join(root, 'vscode-stderr.log'), 'w');
const child = spawn(code, args, { env, windowsHide: true, stdio: ['ignore', stdout, stderr] });
fs.closeSync(stdout);
fs.closeSync(stderr);
const timer = setTimeout(() => {
  console.error('VS Code E2E timed out after 120 seconds:', root);
  child.kill();
}, 120000);
child.on('error', (err) => { clearTimeout(timer); console.error(err); process.exitCode = 1; });
child.on('exit', (exitCode) => {
  clearTimeout(timer);
  const report = path.join(root, 'e2e_result.txt');
  const text = fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : 'LOI: missing E2E report';
  console.log(text);
  const changed = [...originals].filter(([p, before]) => hash(p) !== before).map(([p]) => p);
  fs.writeFileSync(path.join(root, 'originals.json'), JSON.stringify({
    files: Object.fromEntries(originals), changed,
  }, null, 2));
  console.log('Original files changed:', changed.length);
  process.exitCode = exitCode === 0 && !/^(TRUOT|LOI)/m.test(text) && changed.length === 0 ? 0 : 1;
});
