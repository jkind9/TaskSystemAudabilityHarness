'use strict';
// Run against canonical source: node --test task-system/tests/test_dry_run.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const CLI = path.resolve(__dirname, '..', 'task.js');
const STATES = ['open', 'pending_review', 'closed', 'stale', 'archive'];
const STATUS = { open: 'in_progress', pending_review: 'pending_review', closed: 'closed', stale: 'stale', archive: 'archived' };
const TASK = '01_fixture.md';
// Git hook environment overrides must not redirect fixture commands to a caller's repository.
const CHILD_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name))),
  GIT_OPTIONAL_LOCKS: '0',
};

function run(cwd, executable, args, env = CHILD_ENV) {
  const child = spawnSync(executable, args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (child.error) throw child.error;
  assert.equal(child.signal, null, child.stderr);
  return child;
}
function cli(root, args) { return run(root, process.execPath, [CLI, ...args]); }
function git(root, args) {
  const child = run(root, 'git', args);
  assert.equal(child.status, 0, child.stderr);
  return child.stdout;
}

// Include empty directories and raw bytes, so normalization and new journals are visible.
function snapshot(root) {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory()
      ? [[entry.name + '/', null], ...snapshot(file).map(([name, bytes]) => [entry.name + '/' + name, bytes])]
      : [[entry.name, fs.readFileSync(file)]];
  });
}

function board(t, source, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-dryrun-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^task-dryrun-test-/);
    fs.rmSync(root, { recursive: true });
  });
  const convention = options.convention || 'task_list';
  const taskRoot = path.join(root, convention);
  fs.mkdirSync(path.join(taskRoot, source), { recursive: true });
  fs.mkdirSync(path.join(taskRoot, 'open'), { recursive: true });
  if (options.destination) fs.mkdirSync(path.join(taskRoot, options.destination), { recursive: true });
  const taskPath = path.join(taskRoot, source, TASK);
  const text = [
    '---', 'id: "01"', 'title: fixture', 'status: ' + STATUS[source],
    'created: 2000-01-01', 'last_updated: 2000-01-01', '---', '',
    '# Fixture café', '', 'See ' + convention + '/' + source + '/' + TASK, '',
    '## Receipts', '', '| field | value |', '|---|---|',
    '| result | ' + (options.unfilled ? '(fill in)' : 'done') + ' |', '',
  ].join('\r\n');
  fs.writeFileSync(taskPath, text);
  fs.writeFileSync(path.join(taskRoot, 'open', '02_peer.md'), '---\nid: 02\nstatus: blocked\n---\n# Preserve peer\n');
  fs.writeFileSync(path.join(root, 'unrelated.bin'), Buffer.from([0, 255, 13, 10]));
  if (options.journal !== false) fs.writeFileSync(path.join(taskRoot, '.journal.log'), 'existing journal\r\n');
  return { root, taskRoot, convention, taskPath };
}

function assertPreview(fixture, args) {
  const before = snapshot(fixture.root);
  const child = cli(fixture.root, args);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(snapshot(fixture.root), before, 'dry-run changed directory entries or file bytes');
  assert.match(child.stdout, /\[dry-run\].*would move/i);
}

function assertRealMove(fixture, args, source, destination) {
  const journalPath = path.join(fixture.taskRoot, '.journal.log');
  const journalBefore = fs.existsSync(journalPath) ? fs.readFileSync(journalPath, 'utf8') : '';
  const peerBefore = fs.readFileSync(path.join(fixture.taskRoot, 'open', '02_peer.md'));
  const beforeDate = new Date().toISOString().slice(0, 10);
  const child = cli(fixture.root, args);
  const afterDate = new Date().toISOString().slice(0, 10);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(fs.existsSync(fixture.taskPath), false);
  const moved = fs.readFileSync(path.join(fixture.taskRoot, destination, TASK), 'utf8');
  assert.match(moved, new RegExp('^status: ' + (destination === 'open' ? 'open' : STATUS[destination]) + '$', 'm'));
  const updated = moved.match(/^last_updated: (.+)$/m)[1];
  assert.ok([beforeDate, afterDate].includes(updated), updated);
  assert.ok(moved.includes(fixture.convention + '/' + destination + '/' + TASK));
  assert.ok(!moved.includes(fixture.convention + '/' + source + '/' + TASK));
  const appended = fs.readFileSync(journalPath, 'utf8').slice(journalBefore.length);
  assert.match(appended, new RegExp(' move 01 ' + source + '->' + destination + ' ' + destination + '/' + TASK + '\n$'));
  assert.equal(appended.trim().split('\n').length, 1);
  assert.deepEqual(fs.readFileSync(path.join(fixture.taskRoot, 'open', '02_peer.md')), peerBefore);
  assert.deepEqual(fs.readFileSync(path.join(fixture.root, 'unrelated.bin')), Buffer.from([0, 255, 13, 10]));
}

for (const [i, source] of STATES.entries()) {
  for (const [j, destination] of STATES.entries()) {
    if (source === destination) continue;
    const options = { destination: (i + j) % 2 ? destination : undefined, journal: (i + j) % 2 === 0,
      convention: i % 2 ? 'docs/tasks' : 'task_list' };
    test('dry-run move ' + source + ' -> ' + destination, t => {
      assertPreview(board(t, source, options), ['move', '01', destination, '--dry-run']);
    });
    test('real move ' + source + ' -> ' + destination, t => {
      assertRealMove(board(t, source, options), ['move', '01', destination], source, destination);
    });
  }
}

for (const source of STATES.filter(state => state !== 'closed')) {
  test('dry-run close alias from ' + source, t => {
    assertPreview(board(t, source, { journal: false }), ['close', '01', '--dry-run']);
  });
}
test('real close alias', t => {
  assertRealMove(board(t, 'open'), ['close', '01'], 'open', 'closed');
});
test('forced closed preview does not write unfilled task', t => {
  assertPreview(board(t, 'open', { unfilled: true, journal: false }), ['move', '01', 'closed', '--force', '--dry-run']);
});

for (const [name, args, options] of [
  ['missing task', ['move', '99', 'closed', '--dry-run'], {}],
  ['unknown state', ['move', '01', 'unknown', '--dry-run'], {}],
  ['same state', ['move', '01', 'open', '--dry-run'], {}],
  ['unfilled receipts', ['close', '01', '--dry-run'], { unfilled: true }],
  ['duplicate id', ['move', '01', 'closed', '--dry-run'], { duplicate: true }],
]) {
  test('invalid dry-run preserves board: ' + name, t => {
    const fixture = board(t, 'open', options);
    if (options.duplicate) fs.copyFileSync(fixture.taskPath, path.join(fixture.taskRoot, 'open', '01_duplicate.md'));
    const before = snapshot(fixture.root);
    const child = cli(fixture.root, args);
    assert.equal(child.status, 1, child.stderr);
    assert.deepEqual(snapshot(fixture.root), before);
  });
}

function gitBoard(t) {
  const fixture = board(t, 'open');
  git(fixture.root, ['init', '-q', '-b', 'main']);
  git(fixture.root, ['add', '.']);
  git(fixture.root, ['-c', 'user.name=CLI Test', '-c', 'user.email=cli-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
  fs.writeFileSync(path.join(fixture.root, 'staged.txt'), 'peer staged change\n');
  git(fixture.root, ['add', 'staged.txt']);
  return fixture;
}
function gitState(root) {
  return ['rev-parse --verify HEAD', 'status --porcelain=v1', 'ls-files --stage -z', 'diff --cached --binary']
    .map(args => git(root, args.split(' ')));
}
for (const args of [['move', '01', 'pending_review', '--dry-run'], ['close', '01', '--dry-run']]) {
  test('ordinary Git board preview preserves index and staged peers: ' + args.join(' '), t => {
    const fixture = gitBoard(t);
    const before = gitState(fixture.root);
    assertPreview(fixture, args);
    assert.deepEqual(gitState(fixture.root), before);
  });
}
test('real Git-backed move keeps staged peer and stages task rename', t => {
  const fixture = gitBoard(t);
  const peerBefore = git(fixture.root, ['show', ':staged.txt']);
  const headBefore = git(fixture.root, ['rev-parse', 'HEAD']);
  assertRealMove(fixture, ['move', '01', 'closed'], 'open', 'closed');
  const tracked = git(fixture.root, ['ls-files']);
  assert.ok(tracked.includes('task_list/closed/' + TASK));
  assert.ok(!tracked.includes('task_list/open/' + TASK));
  assert.equal(git(fixture.root, ['show', ':staged.txt']), peerBefore);
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD']), headBefore);
});

test('fixture ignores inherited Git repository overrides', t => {
  const caller = gitBoard(t);
  const before = snapshot(caller.root);
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_TEST_CONTEXT'));
  const child = run(caller.root, process.execPath,
    ['--test', '--test-reporter=spec', '--test-name-pattern=ordinary Git board preview', __filename],
    { ...childEnv, GIT_INDEX_FILE: path.join(caller.root, 'external-index') });
  assert.match(child.stdout, /tests 2\b/, child.stdout + child.stderr);
  assert.deepEqual(snapshot(caller.root), before, 'fixture modified the caller repository');
  assert.equal(child.status, 0, child.stdout + child.stderr);
});
