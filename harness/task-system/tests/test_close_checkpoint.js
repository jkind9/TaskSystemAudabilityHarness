'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const CLI = path.resolve(__dirname, '..', 'task.js');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
function run(root, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, env, encoding: 'utf8', windowsHide: true });
  if (r.error) throw r.error;
  return r;
}
function git(root, ...args) { const r = run(root, 'git', args); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
function cli(root, ...args) { return run(root, process.execPath, [CLI, ...args]); }
function fixture(t, scope = '[src/**]') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(root, 'task_list/open'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/a.js'), 'initial\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'initial docs\n');
  fs.writeFileSync(path.join(root, 'unrelated.js'), 'preserve\n');
  const taskPath = path.join(root, 'task_list/open/01_fixture.md');
  fs.writeFileSync(taskPath, '---\nid: "01"\ntitle: Fixture\nstatus: in_progress\npriority: MED\nfiles: ' + scope + '\ndocs: [README.md]\n---\n\n## In plain English\n\nTest scoped checkpoints.\n\n## Receipts\n\n| field | value |\n|---|---|\n| closing commit | awaiting checkpoint |\n| result | verified |\n');
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'test: baseline');
  return { root, taskPath, sha: git(root, 'rev-parse', 'HEAD') };
}
function receipt(f, sha) { fs.writeFileSync(f.taskPath, fs.readFileSync(f.taskPath, 'utf8').replace(/\| closing commit \|[^\n]+/, '| closing commit | ' + sha + ' |')); }
function refused(f, ...args) {
  const before = git(f.root, 'status', '--porcelain=v1');
  const bytes = fs.readFileSync(f.taskPath);
  const head = git(f.root, 'rev-parse', 'HEAD');
  const r = cli(f.root, ...args);
  assert.notEqual(r.status, 0, r.stdout);
  assert.equal(git(f.root, 'status', '--porcelain=v1'), before);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), head);
  assert.deepEqual(fs.readFileSync(f.taskPath), bytes);
  return r;
}
test('code close refuses missing, invalid and unrelated checkpoint before moving', t => {
  const f = fixture(t);
  assert.match(refused(f, 'close', '01').stderr, /checkpoint/i);
  receipt(f, 'f'.repeat(40)); refused(f, 'close', '01');
  fs.writeFileSync(path.join(f.root, 'unrelated.js'), 'new unrelated\n');
  git(f.root, 'add', 'unrelated.js'); git(f.root, 'commit', '-qm', 'test: unrelated');
  receipt(f, git(f.root, 'rev-parse', 'HEAD')); refused(f, 'move', '01', 'closed');
});
test('reachable checkpoint closes; dirty code or docs refuses even with force', t => {
  const f = fixture(t); receipt(f, f.sha);
  fs.writeFileSync(path.join(f.root, 'src/a.js'), 'dirty\n'); refused(f, 'close', '01', '--force');
  git(f.root, 'checkout', '--', 'src/a.js');
  fs.writeFileSync(path.join(f.root, 'README.md'), 'dirty docs\n'); refused(f, 'close', '01');
  git(f.root, 'checkout', '--', 'README.md');
  const r = cli(f.root, 'close', '01'); assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(f.root, 'task_list/closed/01_fixture.md'), 'utf8'), /status: closed/);
});
test('nonancestor commit cannot close', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.root, 'src/a.js'), 'branch\n');
  git(f.root, 'add', 'src/a.js'); git(f.root, 'commit', '-qm', 'test: other branch');
  const detached = git(f.root, 'rev-parse', 'HEAD'); git(f.root, 'reset', '--hard', f.sha);
  receipt(f, detached); refused(f, 'close', '01');
});
test('commit closes only scoped paths including new/deleted files; unrelated dirty remains', t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.root, 'src/a.js'));
  fs.writeFileSync(path.join(f.root, 'src/new file.js'), 'new\n');
  fs.writeFileSync(path.join(f.root, 'README.md'), 'new docs\n');
  fs.writeFileSync(path.join(f.root, 'unrelated.js'), 'uncommitted\n');
  const r = cli(f.root, 'close', '01', '--commit'); assert.equal(r.status, 0, r.stderr);
  const sha = git(f.root, 'rev-parse', 'HEAD'); assert.notEqual(sha, f.sha);
  const moved = fs.readFileSync(path.join(f.root, 'task_list/closed/01_fixture.md'), 'utf8'); assert.ok(moved.includes(sha));
  assert.equal(git(f.root, 'show', 'HEAD:unrelated.js'), 'preserve');
  assert.equal(git(f.root, 'diff', '--cached', '--name-only').includes('unrelated.js'), false);
  assert.match(git(f.root, 'status', '--porcelain=v1'), /unrelated.js/);
  assert.match(git(f.root, 'show', '--format=', '--name-only', 'HEAD'), /src\/new file.js/);
});
test('unrelated staged files are preserved and cause commit refusal', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.root, 'unrelated.js'), 'staged peer\n'); git(f.root, 'add', 'unrelated.js');
  fs.writeFileSync(path.join(f.root, 'src/a.js'), 'ours\n');
  assert.match(refused(f, 'close', '01', '--commit').stderr, /staged/i);
});
test('commit dry-run preserves task, index, HEAD and journal', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.root, 'src/a.js'), 'ours\n');
  const before = git(f.root, 'status', '--porcelain=v1'); const bytes = fs.readFileSync(f.taskPath);
  const r = cli(f.root, 'close', '01', '--commit', '--dry-run'); assert.equal(r.status, 0, r.stderr);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.sha); assert.equal(git(f.root, 'status', '--porcelain=v1'), before);
  assert.deepEqual(fs.readFileSync(f.taskPath), bytes); assert.equal(fs.existsSync(path.join(f.root, 'task_list/.journal.log')), false);
});
test('empty files task retains existing close semantics', t => {
  const f = fixture(t, '[]'); assert.equal(cli(f.root, 'close', '01').status, 0);
});
test('escaping scope and non-close commit flag refuse without mutation', t => {
  refused(fixture(t, '[../outside.js]'), 'close', '01', '--commit');
  refused(fixture(t), 'move', '01', 'pending_review', '--commit');
});
test('Git commit failure keeps task in original folder and does not record a false SHA', t => {
  const f = fixture(t); git(f.root, 'config', 'core.hooksPath', '.git/failing-hooks');
  fs.mkdirSync(path.join(f.root, '.git/failing-hooks'));
  fs.writeFileSync(path.join(f.root, '.git/failing-hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  fs.writeFileSync(path.join(f.root, 'src/a.js'), 'ours\n');
  const r = cli(f.root, 'close', '01', '--commit'); assert.notEqual(r.status, 0);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.sha);
  assert.match(fs.readFileSync(f.taskPath, 'utf8'), /awaiting checkpoint/);
});
test('an older ancestor cannot certify a newer scoped version', t => {
  const f = fixture(t); receipt(f, f.sha);
  fs.writeFileSync(path.join(f.root, 'src/a.js'), 'changed since receipt\n');
  git(f.root, 'add', 'src/a.js'); git(f.root, 'commit', '-qm', 'test: later code');
  refused(f, 'close', '01');
});
test('already staged deletions are included in the source checkpoint', t => {
  const f = fixture(t); git(f.root, 'rm', 'src/a.js');
  const r = cli(f.root, 'close', '01', '--commit'); assert.equal(r.status, 0, r.stderr);
  assert.match(git(f.root, 'show', '--format=', '--name-status', 'HEAD'), /D\s+src\/a.js/);
});
test('worktree handoff persists both task path deletion and destination metadata', t => {
  const f = fixture(t); receipt(f, f.sha); git(f.root, 'add', 'task_list/open/01_fixture.md'); git(f.root, 'commit', '-qm', 'test: checkpoint receipt');
  const wt = path.join(f.root, 'fixture-worktree');
  git(f.root, 'worktree', 'add', '-qb', 'task/01-fixture', wt);
  t.after(() => { if (fs.existsSync(f.root)) run(f.root, 'git', ['worktree', 'remove', '--force', wt]); });
  fs.writeFileSync(path.join(wt, 'unrelated.js'), 'peer dirty\n');
  const r = cli(wt, 'close', '01'); assert.equal(r.status, 0, r.stderr);
  const tree = git(wt, 'ls-tree', '-r', '--name-only', 'HEAD');
  assert.ok(tree.includes('task_list/closed/01_fixture.md'));
  assert.equal(tree.includes('task_list/open/01_fixture.md'), false);
  assert.match(git(wt, 'show', 'HEAD:task_list/closed/01_fixture.md'), /status: closed/);
  assert.match(git(wt, 'status', '--porcelain=v1'), /unrelated.js/);
});
test('worktree handoff failure retains folder and gives recovery guidance', t => {
  const f = fixture(t); receipt(f, f.sha); git(f.root, 'add', 'task_list/open/01_fixture.md'); git(f.root, 'commit', '-qm', 'test: receipt');
  const wt = path.join(f.root, 'fixture-worktree'); git(f.root, 'worktree', 'add', '-qb', 'task/01-fixture', wt);
  t.after(() => { if (fs.existsSync(f.root)) run(f.root, 'git', ['worktree', 'remove', '--force', wt]); });
  fs.writeFileSync(path.join(wt, 'unrelated.js'), 'staged peer\n'); git(wt, 'add', 'unrelated.js');
  const r = cli(wt, 'close', '01'); assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Handoff stopped/); assert.ok(fs.existsSync(wt));
  assert.match(git(wt, 'diff', '--cached', '--name-only'), /unrelated.js/);
});
test('commit with clean scoped source reuses its valid checkpoint rather than making metadata-only commit', t => {
  const f = fixture(t); receipt(f, f.sha);
  const r = cli(f.root, 'close', '01', '--commit'); assert.equal(r.status, 0, r.stderr);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.sha);
});
test('commit with no scoped source change and no checkpoint refuses before committing metadata', t => {
  const f = fixture(t); refused(f, 'close', '01', '--commit');
});
test('a merge commit carrying scoped changes is a valid checkpoint', t => {
  const f = fixture(t); const base = git(f.root, 'branch', '--show-current');
  git(f.root, 'checkout', '-qb', 'source-feature'); fs.writeFileSync(path.join(f.root, 'src/a.js'), 'merged\n');
  git(f.root, 'add', 'src/a.js'); git(f.root, 'commit', '-qm', 'test: feature');
  git(f.root, 'checkout', '-q', base); git(f.root, 'merge', '--no-ff', '-qm', 'test: merge', 'source-feature');
  receipt(f, git(f.root, 'rev-parse', 'HEAD')); const r = cli(f.root, 'close', '01'); assert.equal(r.status, 0, r.stderr);
});
test('large glob scopes use streamed path lists within the Windows command limit', t => {
  const f = fixture(t);
  for (let i = 0; i < 800; i++) fs.writeFileSync(path.join(f.root, 'src', String(i).padStart(4, '0') + '_long-module-name-long-module-name-long-module-name-.js'), 'initial\n');
  git(f.root, 'add', 'src'); git(f.root, 'commit', '-qm', 'test: large scope');
  fs.writeFileSync(path.join(f.root, 'src/a.js'), 'changed\n');
  const r = cli(f.root, 'close', '01', '--commit'); assert.equal(r.status, 0, r.stderr);
});
test('a fresh Git repository can create its first task source checkpoint', t => {
  const f = fixture(t); git(f.root, 'checkout', '--orphan', 'fresh'); git(f.root, 'rm', '--cached', 'unrelated.js');
  const r = cli(f.root, 'close', '01', '--commit'); assert.equal(r.status, 0, r.stderr);
  assert.match(git(f.root, 'show', '--format=', '--name-only', 'HEAD'), /src\/a.js/);
});
test('restored working files cannot hide uncheckpointed staged code or docs', t => {
  for (const file of ['src/a.js', 'README.md']) {
    const f = fixture(t); receipt(f, f.sha); const original = fs.readFileSync(path.join(f.root, file));
    fs.writeFileSync(path.join(f.root, file), 'staged uncheckpointed\n'); git(f.root, 'add', file);
    fs.writeFileSync(path.join(f.root, file), original);
    refused(f, 'close', '01'); refused(f, 'close', '01', '--commit');
    assert.equal(git(f.root, 'show', ':' + file), 'staged uncheckpointed');
  }
});