'use strict';
// Self-test for deploy-harness.cjs on two throwaway repositories: "dev" (this repository, with
// harness/) and "live" (the installed copy). HOME points at a scratch folder, so the default live
// folder is never the real one. As on this PC, the global git config sets core.autocrlf=true and
// both repositories set false; the fixture's test fails on a CRLF checkout.
// Run: node --test tools/deploy-harness-selftest.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEPLOY = path.join(__dirname, 'deploy-harness.cjs');
const FILES = {
  '.gitignore': 'generated/\n',
  'core.md': 'one\n',
  'tools/render.cjs': "const fs = require('fs'); fs.mkdirSync('generated', { recursive: true }); fs.copyFileSync('core.md', 'generated/rendered.md');\n",
  'task-system/tests/test_core.js': "require('node:test')('core', () => require('node:assert').doesNotMatch(require('fs').readFileSync(__dirname + '/../../core.md', 'utf8'), /broken|\\r/));\n",
  'scripts/hooks/tests/test_hook.js': "require('node:test')('hook', () => {});\n",
};

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-selftest-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'gitconfig'), '[user]\n\tname = T\n\temail = t@example.invalid\n[core]\n\tautocrlf = true\n');
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k) && k !== 'ECC_TASK_FLOW')),
    HOME: dir, USERPROFILE: dir, GIT_CONFIG_GLOBAL: path.join(dir, 'gitconfig') };
  const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const dev = path.join(dir, 'dev'), live = path.join(dir, 'live');
  for (const [root, top] of [[dev, path.join(dev, 'harness')], [live, live]]) {
    for (const [file, text] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(top, file)), { recursive: true }); fs.writeFileSync(path.join(top, file), text); }
    git(root, 'init', '-q'); git(root, 'config', 'core.autocrlf', 'false'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'start');
  }
  const change = (root, file, text) => { fs.writeFileSync(path.join(root, file), text); git(root, 'commit', '-qam', 'change ' + file); };
  const deploy = (...args) => spawnSync(process.execPath, [DEPLOY, ...args], { cwd: dev, env, encoding: 'utf8' });
  const read = file => fs.readFileSync(path.join(live, file), 'utf8');
  return { dev, live, git, change, deploy, read };
}

test('deploys a committed change after its tests pass in a clone, then has nothing left to deploy', t => {
  const { dev, live, git, change, deploy, read } = setup(t);
  change(dev, 'harness/core.md', 'two\n');
  const r = deploy('--live', live);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read('core.md'), 'two\n');
  assert.equal(git(live, 'rev-parse', 'HEAD^{tree}'), git(dev, 'rev-parse', 'HEAD:harness'));
  assert.equal(read('generated/rendered.md'), 'two\n', 'the instructions are rendered after the deploy');
  assert.match(git(live, 'log', '-1', '--format=%B'), /^deploy: harness\/ from dev [0-9a-f]{7}\n\n- change harness\/core\.md/);
  assert.ok(fs.existsSync(path.join(dev, 'harness-history.bundle')));
  assert.match(r.stdout, /Deployed/);
  assert.match(deploy('--live', live).stdout, /Nothing to deploy/);
});

test('a failing test stops the deploy before the live harness changes', t => {
  const { dev, live, change, deploy, read } = setup(t);
  change(dev, 'harness/core.md', 'broken\n');
  const r = deploy('--live', live);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /tests failed[\s\S]*live harness is unchanged/);
  assert.equal(read('core.md'), 'one\n');
});

test('--check tests the change without touching the live harness', t => {
  const { dev, live, change, deploy, read } = setup(t);
  change(dev, 'harness/core.md', 'two\n');
  const r = deploy('--check', '--live', live);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Check only/);
  assert.equal(read('core.md'), 'one\n');
});

test('refuses uncommitted changes here or in the live harness', t => {
  const { dev, live, change, deploy } = setup(t);
  change(dev, 'harness/core.md', 'two\n');
  fs.writeFileSync(path.join(dev, 'harness/core.md'), 'three\n');
  assert.match(deploy('--live', live).stderr, /harness\/ has uncommitted changes/);
  fs.writeFileSync(path.join(dev, 'harness/core.md'), 'two\n');
  fs.writeFileSync(path.join(live, 'core.md'), 'edited on the pc\n');
  const r = deploy('--live', live);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /live harness has uncommitted changes[\s\S]*core\.md/);
});

test('refuses a live harness changed outside this repository', t => {
  const { dev, live, git, change, deploy } = setup(t);
  change(live, 'core.md', 'edited on the pc\n');
  const head = git(live, 'rev-parse', 'HEAD');
  change(dev, 'harness/core.md', 'two\n');
  const r = deploy('--live', live);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /did not come from this repository/);
  assert.equal(git(live, 'rev-parse', 'HEAD'), head);
});

test('refuses an unknown argument instead of deploying to the default folder', t => {
  const { live, deploy } = setup(t);
  for (const args of [['--liv', live], ['--live']]) {
    const r = deploy(...args);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage: node tools\/deploy-harness\.cjs/);
  }
});
