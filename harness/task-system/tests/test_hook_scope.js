// Hook scope regression tests: each write is judged by the repository that owns the file,
// and the documentation rules block real Markdown writes without blocking reads.
// Run: node --test task-system/tests/test_hook_scope.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const GATE = path.join(ROOT, 'scripts', 'hooks', 'task-gate.js');
const { builtin } = require(path.join(ROOT, 'tools', 'dispatch.cjs'));

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key) || key === 'NODE_TEST_CONTEXT') delete env[key];
  return env;
}
function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, env: cleanEnv(), encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr);
}
// A git repo with one committed file, an active task owning `owned`, and dirty code files.
function repo(owned, dirty, extraTask) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-scope-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@t']);
  git(dir, ['config', 'user.name', 't']);
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-qm', 'seed']);
  fs.mkdirSync(path.join(dir, 'task_list', 'open'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'task_list', 'open', '01_active.' + 'md'),
    '---\nid: "01"\nstatus: in_progress\nfiles:\n  - ' + owned + '\ndocs:\n  - README.' + 'md\n---\n');
  if (extraTask) fs.writeFileSync(path.join(dir, 'task_list', 'open', '02_report.' + 'md'), extraTask);
  for (const f of dirty) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), 'x = 1\n'); }
  return dir;
}
function gate(cwd, filePath) {
  const input = JSON.stringify({ tool_name: 'Write', cwd, tool_input: { file_path: filePath, content: 'x' } });
  return spawnSync(process.execPath, [GATE], { cwd, input, env: cleanEnv(), encoding: 'utf8' }).status;
}

const sessionRepo = repo('a.py', ['a.py', 'other.py']);   // the session's folder: active task owns only a.py
const fileRepo = repo('lib/b.js', ['lib/c.js']);          // a second repository with its own board

test('a file in another repository is judged by that repository\'s active task', () => {
  assert.strictEqual(gate(sessionRepo, path.join(fileRepo, 'lib', 'b.js')), 0);
});
test('a file in another repository outside that repository\'s task is still blocked', () => {
  assert.strictEqual(gate(sessionRepo, path.join(fileRepo, 'lib', 'unowned.js')), 2);
});
test('a file outside any repository passes', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-scratch-'));
  assert.strictEqual(gate(sessionRepo, path.join(scratch, 'probe.js')), 0);
});
test('a file in the session repository outside its task is blocked as before', () => {
  assert.strictEqual(gate(sessionRepo, path.join(sessionRepo, 'unowned.py')), 2);
});
test('a file in the session repository inside its task passes as before', () => {
  assert.strictEqual(gate(sessionRepo, path.join(sessionRepo, 'a.py')), 0);
});

function shell(command) { return builtin('bash-documentation-policy', { cwd: sessionRepo, tool_input: { command } }).status; }
const MD = '.' + 'md';
test('read-only shell commands that mention Markdown pass', () => {
  assert.strictEqual(shell('sha256sum README' + MD + '; echo "--- suite"; node --test x.js 2>&1 | tail'), 0);
  assert.strictEqual(shell('echo ---; grep -n x task_list/open/a' + MD + ' 2>/dev/null'), 0);
  assert.strictEqual(shell('cat notes' + MD + ' | head -5'), 0);
  // The shapes blocked on 2026-10-08: a stderr redirect earlier on the line, Markdown read later.
  assert.strictEqual(shell('echo "--- links"; node x.js 2>&1; sha256sum C:/Users/x/.claude/CLAUDE' + MD), 0);
  assert.strictEqual(shell('echo ---; ls 2>/dev/null; grep -c y task_list/closed/66_a' + MD), 0);
});
test('shell writes that create loose Markdown are blocked', () => {
  assert.strictEqual(shell('echo hi > notes' + MD), 2);
  assert.strictEqual(shell('cat <<EOF >> docs/guide' + MD), 2);
  assert.strictEqual(shell('echo x | tee -a notes' + MD), 2);
  assert.strictEqual(shell('cp draft.txt notes' + MD), 2);
  assert.strictEqual(shell('printf x > "my notes' + MD + '"'), 2);
});
test('documentation writes outside any repository pass', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-scratch-'));
  assert.strictEqual(builtin('bash-documentation-policy', { cwd: scratch, tool_input: { command: 'claude -p x > out.json 2> err.txt' } }).status, 0);
  assert.strictEqual(builtin('documentation-policy', { cwd: scratch, tool_input: { file_path: path.join(scratch, 'notes' + MD) } }).status, 0);
});
test('shell writes to allowed documentation paths pass', () => {
  assert.strictEqual(shell('echo hi >> README' + MD), 0);
  assert.strictEqual(shell('echo x > task_list/open/03_x' + MD), 0);
});

function edit(dir, rel) { return builtin('documentation-policy', { cwd: dir, tool_input: { file_path: path.join(dir, rel) } }).status; }
test('a root document declared in a task\'s docs list may be edited', () => {
  const dir = repo('a.py', [], '---\nid: "02"\nstatus: closed\ndocs:\n  - REPORT' + MD + '\n---\n');
  assert.strictEqual(edit(dir, 'REPORT' + MD), 0);
});
test('an undeclared loose document is still blocked', () => {
  const dir = repo('a.py', [], '---\nid: "02"\nstatus: closed\ndocs:\n  - REPORT' + MD + '\n---\n');
  assert.strictEqual(edit(dir, 'NOTES' + MD), 2);
});
