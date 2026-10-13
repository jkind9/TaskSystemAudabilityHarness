// Board scope: inside a git repository, task.js uses only a board at or below the repository's
// top folder, creates one there if none exists, and never reads or writes a board above it.
// Outside any repository it keeps searching upward (a plain folder of notes may hold a board).
// Run: node --test task-system/tests/test_board_scope.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TASK_JS = path.resolve(__dirname, '..', 'task.js');

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key) || key === 'NODE_TEST_CONTEXT' || key === 'CLAUDE_PROJECT_DIR') delete env[key];
  return env;
}
function taskJs(cwd, args) {
  return spawnSync(process.execPath, [TASK_JS, ...args], { cwd, env: cleanEnv(), encoding: 'utf8' });
}
// Every file under dir with its bytes, so "untouched" means byte-identical, not just "still there".
function snapshot(dir) {
  const out = {};
  for (const name of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, String(name));
    if (fs.statSync(file).isFile()) out[String(name).replace(/\\/g, '/')] = fs.readFileSync(file, 'utf8');
  }
  return out;
}
// An outer folder with its own board and one in_progress task, and a git repository inside it.
function nested() {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'board-scope-'));
  fs.mkdirSync(path.join(outer, 'task_list', 'open'), { recursive: true });
  fs.writeFileSync(path.join(outer, 'task_list', 'open', '01_outer_plan.md'),
    '---\nid: "01"\ntitle: Outer study plan\nstatus: in_progress\nfiles:\n  - notes.txt\n---\n# Outer plan\n');
  const repo = path.join(outer, 'runs', 'r1', 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  const init = spawnSync('git', ['init', '-q', repo], { env: cleanEnv(), encoding: 'utf8' });
  assert.strictEqual(init.status, 0, init.stderr);
  return { outer, repo };
}

test('a repository nested under a folder with a board never sees that board', () => {
  const { outer, repo } = nested();
  const before = snapshot(path.join(outer, 'task_list'));
  const list = taskJs(path.join(repo, 'src'), ['list']);
  assert.strictEqual(list.status, 0, list.stderr);
  assert.doesNotMatch(list.stdout, /Outer study plan/);
  assert.doesNotMatch(list.stdout, /active task: 01/);
  const created = taskJs(path.join(repo, 'src'), ['new', 'Inner change', '--files', 'src/a.py']);
  assert.strictEqual(created.status, 0, created.stderr);
  assert.ok(fs.existsSync(path.join(repo, 'task_list', 'open')), 'board created at the repository top');
  assert.strictEqual(fs.readdirSync(path.join(repo, 'task_list', 'open')).filter(f => f.endsWith('.md')).length, 1);
  assert.deepStrictEqual(snapshot(path.join(outer, 'task_list')), before, 'outer board byte-identical');
});

test('a board at the repository top is still found from a subfolder', () => {
  const { repo } = nested();
  assert.strictEqual(taskJs(repo, ['new', 'Top task', '--files', 'src/a.py']).status, 0);
  const list = taskJs(path.join(repo, 'src'), ['list']);
  assert.strictEqual(list.status, 0, list.stderr);
  assert.match(list.stdout, /Top task \*/);
});

test('a git worktree checkout (.git is a file) also bounds the search', () => {
  const { outer } = nested();
  const wt = path.join(outer, 'wt');
  fs.mkdirSync(wt);
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ' + path.join(outer, 'runs', 'r1', 'repo', '.git') + '\n');
  const list = taskJs(wt, ['list']);
  assert.strictEqual(list.status, 0, list.stderr);
  assert.doesNotMatch(list.stdout, /Outer study plan/);
});

test('outside any repository the upward search still finds a board', () => {
  const { outer } = nested();
  const plain = path.join(outer, 'notes', 'deep');
  fs.mkdirSync(plain, { recursive: true });
  const list = taskJs(plain, ['list']);
  assert.strictEqual(list.status, 0, list.stderr);
  assert.match(list.stdout, /Outer study plan \*/);
});
