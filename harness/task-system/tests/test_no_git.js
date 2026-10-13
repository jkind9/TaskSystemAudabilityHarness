'use strict';
// task.js without git: where git cannot start (Codex's sandbox refused to spawn it in the Study 2
// pilot) or the folder is not a repository, close and move still work and the journal says why no
// checkpoint was made. Where git works, the checkpoint rule is unchanged.
// Run: node --test task-system/tests/test_no_git.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const CLI = path.resolve(__dirname, '..', 'task.js');
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k) && k !== 'CLAUDE_PROJECT_DIR'));
// PATH holding only Node's folder, so spawning git fails as it did in the sandbox.
const noGitEnv = { ...baseEnv, PATH: path.dirname(process.execPath), Path: path.dirname(process.execPath) };
function cli(root, env, ...args) { return spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true }); }
function board(t, withGit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'task_list/open'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/a.js'), 'x\n');
  fs.writeFileSync(path.join(root, 'task_list/open/01_fixture.md'), '---\nid: "01"\ntitle: Fixture\nstatus: in_progress\npriority: MED\nfiles: [src/**]\ndocs: []\n---\n\n## In plain English\n\nA test task.\n\n## Receipts\n\n| field | value |\n|---|---|\n| closing commit | none: no git here |\n| result | done |\n');
  if (withGit) {
    for (const args of [['init', '-q'], ['config', 'user.name', 'T'], ['config', 'user.email', 't@example.invalid'], ['add', '.'], ['commit', '-qm', 'base']]) {
      const r = spawnSync('git', args, { cwd: root, env: baseEnv, encoding: 'utf8', windowsHide: true });
      assert.equal(r.status, 0, r.stderr);
    }
  }
  return root;
}
const journal = root => fs.readFileSync(path.join(root, 'task_list/.journal.log'), 'utf8');

test('close works in a folder that is not a git repository and journals why', t => {
  const root = board(t, false);
  const r = cli(root, baseEnv, 'close', '01');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(root, 'task_list/closed/01_fixture.md')));
  assert.ok(!fs.existsSync(path.join(root, 'task_list/open/01_fixture.md')));
  assert.match(journal(root), /close 01 without a git checkpoint: not a git repository/);
});

test('close and move work when git cannot start', t => {
  const root = board(t, true);
  const moved = cli(root, noGitEnv, 'move', '01', 'pending_review');
  assert.equal(moved.status, 0, moved.stderr);
  const closed = cli(root, noGitEnv, 'close', '01');
  assert.equal(closed.status, 0, closed.stderr);
  assert.match(closed.stderr + closed.stdout, /without a git checkpoint/);
  assert.ok(fs.existsSync(path.join(root, 'task_list/closed/01_fixture.md')));
  assert.match(journal(root), /close 01 without a git checkpoint: git cannot start/);
});

test('a dry-run close without git changes nothing', t => {
  const root = board(t, false);
  const r = cli(root, baseEnv, 'close', '01', '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(root, 'task_list/open/01_fixture.md')));
  assert.ok(!fs.existsSync(path.join(root, 'task_list/.journal.log')) || !/without a git checkpoint/.test(journal(root)));
});

test('where git works, a close with no commit receipt is still refused', t => {
  const root = board(t, true);
  const r = cli(root, baseEnv, 'close', '01');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Awaiting checkpoint/);
  assert.ok(fs.existsSync(path.join(root, 'task_list/open/01_fixture.md')));
});
