'use strict';
// Lean profile hooks, each firing and staying quiet: the end-of-session nudge, the session-start
// note, and the task gate's refusal naming `task.js begin` under ECC_TASK_FLOW=lean.
// Run: node --test task-system/tests/test_lean_hooks.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(ROOT, 'task-system/task.js');
// finish reads Claude transcripts under the home folder; give every call a scratch home.
const SCRATCH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-home-'));
test.after(() => fs.rmSync(SCRATCH_HOME, { recursive: true, force: true }));
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k) && k !== 'CLAUDE_PROJECT_DIR' && k !== 'ECC_TASK_FLOW')), USERPROFILE: SCRATCH_HOME, HOME: SCRATCH_HOME };
const hook = (name, cwd, extraEnv = {}, input = {}) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/hooks', name)], {
  input: JSON.stringify({ cwd, session_id: 'lean-hooks', ...input }), cwd, env: { ...env, ...extraEnv }, encoding: 'utf8', windowsHide: true,
});
function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-hooks-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const args of [['init', '-q'], ['config', 'user.name', 'T'], ['config', 'user.email', 't@example.invalid']]) spawnSync('git', args, { cwd: root, env });
  fs.writeFileSync(path.join(root, 'a.py'), 'x = 1\n');
  spawnSync('git', ['add', '.'], { cwd: root, env }); spawnSync('git', ['commit', '-qm', 'base'], { cwd: root, env });
  return root;
}
const cli = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true });

test('stop gate: an open task gets one line naming task.js finish', t => {
  const root = repo(t);
  cli(root, 'begin', 'Change x', '--files', 'a.py');
  const r = hook('lean-stop-gate.js', root);
  assert.equal(r.status, 2);
  const lines = r.stderr.split('\n').filter(l => l.trim());
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Task 00 is still open\. Run: node "\$HOME\/\.claude\/task-system\/task\.js" finish --checked/);
});

test('stop gate: quiet with no open task, after finish, and outside a repository', t => {
  const root = repo(t);
  assert.equal(hook('lean-stop-gate.js', root).status, 0);
  cli(root, 'begin', 'Change x', '--files', 'a.py');
  cli(root, 'finish', '--checked', 'no test exists: example task');
  assert.equal(hook('lean-stop-gate.js', root).status, 0);
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-plain-'));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  assert.equal(hook('lean-stop-gate.js', plain).status, 0);
});

test('session note: names the open task, else what the last task left over; quiet with no board', t => {
  const root = repo(t);
  assert.equal(hook('lean-session-note.js', root).stdout.trim(), '');
  cli(root, 'begin', 'Part one', '--files', 'a.py');
  assert.match(JSON.parse(hook('lean-session-note.js', root).stdout).hookSpecificOutput.additionalContext, /Open task 00 "Part one"/);
  cli(root, 'finish', '--checked', 'no test exists: example task', '--left', 'Part two: timestamps.');
  assert.match(JSON.parse(hook('lean-session-note.js', root).stdout).hookSpecificOutput.additionalContext, /Last finished task 00 "Part one" left over: Part two: timestamps\./);
});

test('task gate: under ECC_TASK_FLOW=lean the refusal names task.js begin; the default message is unchanged', t => {
  const root = repo(t);
  fs.writeFileSync(path.join(root, 'a.py'), 'x = 2\n');
  const write = { tool_name: 'Write', tool_input: { file_path: path.join(root, 'b.py'), content: 'y = 1\n' } };
  const lean = hook('task-gate.js', root, { ECC_TASK_FLOW: 'lean' }, write);
  assert.equal(lean.status, 2);
  assert.match(lean.stderr, /node "\$HOME\/\.claude\/task-system\/task\.js" begin "<title>" --files/);
  const plain = hook('task-gate.js', root, {}, write);
  assert.equal(plain.status, 2);
  assert.match(plain.stderr, /plan-to-tasks/);
});

test('task gate: under ECC_TASK_FLOW=lean a write outside the open task names task.js files add', t => {
  const root = repo(t);
  cli(root, 'begin', 'Change x', '--files', 'a.py');
  fs.writeFileSync(path.join(root, 'a.py'), 'x = 2\n');
  const write = { tool_name: 'Write', tool_input: { file_path: path.join(root, 'b.py'), content: 'y = 1\n' } };
  const lean = hook('task-gate.js', root, { ECC_TASK_FLOW: 'lean' }, write);
  assert.equal(lean.status, 2);
  assert.match(lean.stderr, /node "\$HOME\/\.claude\/task-system\/task\.js" files add b\.py/);
  const plain = hook('task-gate.js', root, {}, write);
  assert.equal(plain.status, 2);
  assert.match(plain.stderr, /add b\.py to that task's "files:"/);
});
