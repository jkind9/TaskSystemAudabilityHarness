// Size gate scope tests: the gate reads the file's own repository and lets an oversized file
// regrow only up to its committed (HEAD) size.
// Run: node --test task-system/tests/test_size_gate_scope.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GATE = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'file-size-gate.js');
const lines = n => Array.from({ length: n }, (_, i) => 'const v' + i + ' = ' + i + ';').join('\n') + '\n';

function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^GIT_/i.test(k) || k === 'NODE_TEST_CONTEXT' || k === 'ECC_FILE_SIZE_LIMIT' || k === 'ECC_DISABLED_HOOKS') delete env[k];
  return env;
}
function git(cwd, args) { const r = spawnSync('git', args, { cwd, env: cleanEnv(), encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); }
function repo(taskId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'size-gate-'));
  git(dir, ['init', '-q']); git(dir, ['config', 'user.email', 't@t']); git(dir, ['config', 'user.name', 't']);
  fs.writeFileSync(path.join(dir, 'big.js'), lines(900));
  git(dir, ['add', '.']); git(dir, ['commit', '-qm', 'seed']);
  fs.mkdirSync(path.join(dir, 'task_list', 'open'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'task_list', 'open', taskId + '_t.' + 'md'), '---\nid: "' + taskId + '"\nstatus: in_progress\nfiles:\n  - big.js\n---\n');
  return dir;
}
function edit(cwd, file, oldS, newS, session) {
  const input = JSON.stringify({ tool_name: 'Edit', cwd, session_id: session, tool_input: { file_path: file, old_string: oldS, new_string: newS } });
  return spawnSync(process.execPath, [GATE], { cwd, input, env: cleanEnv(), encoding: 'utf8' });
}

test('a shrunk oversized file may regrow up to its committed size', () => {
  const dir = repo('07'), file = path.join(dir, 'big.js');
  fs.writeFileSync(file, lines(897));
  assert.strictEqual(edit(dir, file, 'const v0 = 0;\n', 'const v0 = 0;\nconst a = 1;\nconst b = 2;\n').status, 0);
});

test('an oversized file may not grow past its committed size', () => {
  const dir = repo('07'), file = path.join(dir, 'big.js');
  fs.writeFileSync(file, lines(897));
  assert.strictEqual(edit(dir, file, 'const v0 = 0;\n', 'const v0 = 0;\n' + lines(4)).status, 2);
});

test('an uncommitted oversized file may not grow at all', () => {
  const dir = repo('07'), file = path.join(dir, 'fresh.js');
  fs.writeFileSync(file, lines(850));
  assert.strictEqual(edit(dir, file, 'const v0 = 0;\n', 'const v0 = 0;\nconst a = 1;\n').status, 2);
});

test('the shrinks escape reads this session\'s task while other sessions have tasks open', () => {
  const dir = repo('07'), file = path.join(dir, 'big.js'), open = path.join(dir, 'task_list', 'open');
  fs.writeFileSync(path.join(open, '07_t.md'), '---\nid: "07"\nstatus: in_progress\nsession: A\nfiles:\n  - big.js\nshrinks:\n  - big.js\n---\n');
  fs.writeFileSync(path.join(open, '08_t.md'), '---\nid: "08"\nstatus: in_progress\nsession: B\nfiles:\n  - other.js\n---\n');
  const grow = session => edit(dir, file, 'const v0 = 0;\n', 'const v0 = 0;\nconst a = 1;\n', session).status;
  assert.strictEqual(grow('A'), 0, 'A is splitting big.js');
  assert.strictEqual(grow('B'), 2, 'B is not');
});

test('the splitter hint names the file\'s own repository task, not the session\'s', () => {
  const session = repo('65'), other = repo('03'), file = path.join(other, 'big.js');
  const r = edit(session, file, 'const v0 = 0;\n', 'const v0 = 0;\nconst a = 1;\n');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /task 03/);
  assert.doesNotMatch(r.stderr, /task 65/);
});
