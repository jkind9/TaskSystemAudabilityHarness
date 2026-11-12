'use strict';
// Lean checks where Node cannot start other programs (inside Codex's Windows sandbox every spawn fails
// with EPERM): the last commit is read straight from .git, the diff is computed in JavaScript, and Python
// complexity falls back to an approximate count. Each part is compared with real git or Python here.
// Run: node --test task-system/tests/test_lean_nospawn.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const { headFiles, workingFiles } = require(path.join(ROOT, 'checks', 'gitread.cjs'));
const { lineDiff } = require(path.join(ROOT, 'checks', 'linediff.cjs'));
const { functionComplexity } = require(path.join(ROOT, 'checks', 'complexity.cjs'));
// finish reads Claude transcripts under the home folder; give every call a scratch home.
const SCRATCH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-home-'));
test.after(() => fs.rmSync(SCRATCH_HOME, { recursive: true, force: true }));
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_|CLAUDE_CODE_SESSION_ID$|CODEX_SESSION_ID$|CODEX_THREAD_ID$)/i.test(k) && k !== 'CLAUDE_PROJECT_DIR')), USERPROFILE: SCRATCH_HOME, HOME: SCRATCH_HOME };
const noSpawnEnv = { ...env, PATH: path.dirname(process.execPath), Path: path.dirname(process.execPath) };
const git = (root, ...args) => { const r = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-nospawn-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'T'); git(root, 'config', 'user.email', 't@example.invalid'); git(root, 'config', 'core.autocrlf', 'false');
  return root;
}
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const lines = n => Array.from({ length: n }, (_, i) => 'line_' + i + ' = ' + i * 7).join('\n') + '\n';

test('the last commit read from .git matches git, for packed objects with deltas and for loose objects', t => {
  const root = repo(t);
  write(root, 'pkg/a.py', lines(300)); write(root, 'README.md', '# R\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'one');
  write(root, 'pkg/a.py', lines(300).replace('line_150 = 1050', 'line_150 = 0')); write(root, 'pkg/b.py', 'x = 1\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'two');
  git(root, 'gc', '-q', '--aggressive');
  write(root, 'pkg/c.py', 'y = 2\n'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'three (loose)');
  const head = headFiles(root);
  assert.equal(head.sha, git(root, 'rev-parse', 'HEAD').trim());
  assert.deepEqual([...head.files.keys()].sort(), git(root, 'ls-tree', '-r', '--name-only', 'HEAD').trim().split('\n').sort());
  for (const name of head.files.keys()) assert.equal(head.read(name), git(root, 'show', 'HEAD:' + name), name);
});

test('a detached HEAD and packed refs are followed', t => {
  const root = repo(t);
  write(root, 'a.py', 'a = 1\n'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'one');
  git(root, 'pack-refs', '--all');
  assert.equal(headFiles(root).sha, git(root, 'rev-parse', 'HEAD').trim());
  git(root, 'checkout', '-q', '--detach');
  assert.equal(headFiles(root).read('a.py'), 'a = 1\n');
});

test('the working-tree file list follows .gitignore like git does', t => {
  const root = repo(t);
  write(root, '.gitignore', '__pycache__/\n*.pyc\n/build\n!keep.pyc\ndocs/*.tmp\n');
  write(root, 'src/a.py', 'a\n'); write(root, 'src/__pycache__/a.cpython.pyc', 'x'); write(root, 'src/b.pyc', 'x'); write(root, 'src/keep.pyc', 'x');
  write(root, 'build/out.txt', 'x'); write(root, 'src/build/kept.txt', 'x'); write(root, 'docs/n.tmp', 'x'); write(root, 'docs/deep/n.tmp', 'x');
  write(root, 'tracked.pyc', 'x'); git(root, 'add', '-f', 'tracked.pyc', '.gitignore'); git(root, 'commit', '-qm', 'base');
  const expected = [...git(root, 'ls-files').trim().split('\n'), ...git(root, 'ls-files', '--others', '--exclude-standard').trim().split('\n')].filter(Boolean).sort();
  assert.deepEqual([...workingFiles(root, new Set(git(root, 'ls-files').trim().split('\n')))].sort(), expected);
});

test('line diff: added runs and removed count', () => {
  assert.deepEqual(lineDiff('a\nb\nc\n', 'a\nx\ny\nc\nz\n'), { addedRuns: [['x', 'y'], ['z']], addedLines: [2, 3, 5], removed: 1 });
  assert.deepEqual(lineDiff('', 'p\nq\n'), { addedRuns: [['p', 'q']], addedLines: [1, 2], removed: 0 });
  assert.deepEqual(lineDiff('same\n', 'same\n'), { addedRuns: [], addedLines: [], removed: 0 });
  assert.deepEqual(lineDiff('a\r\nb\r\n', 'a\nb\n'), { addedRuns: [], addedLines: [], removed: 0 }, 'line endings alone are not a change');
});

test('python complexity without python: the approximate count agrees with the exact one on plain code', () => {
  const branches = Array.from({ length: 11 }, (_, i) => '    if x == ' + i + ':\n        return ' + i).join('\n');
  const source = 'def simple(x):\n    return x\n\ndef branchy(x):\n' + branches + '\n    return -1\n\nclass K:\n    def m(self, a):\n        """if and or"""\n        return [v for v in a if v and not v < 0]  # or\n';
  const exact = functionComplexity({ 'm.py': source });
  const approx = functionComplexity({ 'm.py': source }, { pythonExe: 'no-such-python' });
  assert.equal(exact.method, 'python ast');
  assert.equal(approx.method, 'approximate (python could not start)');
  const scores = r => Object.fromEntries(r.functions['m.py'].map(f => [f.name, f.cc]));
  assert.deepEqual(scores(approx), scores(exact));
  assert.deepEqual(scores(exact), { simple: 1, branchy: 12, m: 4 });
});

test('finish with git and python unreachable records the same files and checks as with them', t => {
  const results = [];
  for (const runEnv of [env, noSpawnEnv]) {
    const root = repo(t);
    write(root, 'pkg/core.py', 'def add(a, b):\n    return a + b\n'); write(root, '.gitignore', '__pycache__/\n');
    git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
    const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'task-system/task.js'), ...args], { cwd: root, env: runEnv, encoding: 'utf8' });
    assert.equal(cli('begin', 'Sub', '--files', 'pkg/**').status, 0);
    fs.appendFileSync(path.join(root, 'pkg/core.py'), '\ndef sub(a, b):\n    return a - b\n');
    write(root, 'pkg/new.py', 'def neg(x):\n    return -x\n'); write(root, 'pkg/__pycache__/core.pyc', 'x');
    const r = cli('finish', '--checked', 'pytest -> 2 passed');
    assert.equal(r.status, 0, r.stderr);
    const text = fs.readFileSync(path.join(root, 'task_list/done', fs.readdirSync(path.join(root, 'task_list/done'))[0]), 'utf8');
    results.push(text.split('## Files')[1].split('## Left over')[0].replace(/; approximate[^\n]*/, ''));
  }
  assert.equal(results[1], results[0]);
  assert.match(results[0], /- pkg\/core\.py \(\+3 -0, 5 lines\)\n- pkg\/new\.py \(\+2 -0, 2 lines\)\n/);
  assert.doesNotMatch(results[0], /__pycache__|not listed|not run/);
});

test('a folder the sandbox will not let us read is skipped and reported, not fatal', t => {
  const root = repo(t);
  write(root, 'a.py', 'a = 1\n'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  write(root, 'b.py', 'b = 2\n');
  const locked = path.join(root, 'pytest-cache-files-x');
  write(root, 'pytest-cache-files-x/f.txt', 'x');
  const user = process.env.USERNAME || os.userInfo().username;
  const deny = process.platform === 'win32' ? spawnSync('icacls', [locked, '/deny', user + ':(OI)(CI)(RX)']) : spawnSync('chmod', ['000', locked]);
  assert.equal(deny.status, 0, 'could not lock the folder for the test');
  try {
    const listed = workingFiles(root, new Set(['a.py']));
    assert.deepEqual([...listed].sort(), ['a.py', 'b.py']);
    assert.deepEqual(listed.skipped, ['pytest-cache-files-x']);
    const { runChecks } = require(path.join(ROOT, 'checks', 'run.cjs'));
    const checked = runChecks({ root });
    assert.equal(checked.git, true);
    assert.deepEqual(checked.unreadable, ['pytest-cache-files-x']);
  } finally {
    // unlock before the folder is deleted by repo()'s cleanup
    if (process.platform === 'win32') spawnSync('icacls', [locked, '/remove:d', user]); else spawnSync('chmod', ['755', locked]);
  }
});
