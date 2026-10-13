'use strict';
// Installing v2, and installing a named version in place with `install.cjs --version <tag>`.
// Runs on a throwaway clone (never the live folder): the working tree's changes are copied in and
// committed there, so the clone is clean. Homes are scratch folders.
// Run: node --test task-system/tests/test_install_version.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'core.longpaths=true', ...args], { cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, 'git ' + args.join(' ') + ': ' + r.stderr);
  return r.stdout;
};
// The installer's default home is os.homedir(). Point it at a throwaway folder for every call, so an
// argument the parser mishandles can never install into the real home (it did once, 2026-10-13).
const SAFE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-safe-home-'));
test.after(() => fs.rmSync(SAFE_HOME, { recursive: true, force: true }));
const installEnv = { ...env, USERPROFILE: SAFE_HOME, HOME: SAFE_HOME };
const install = (clone, ...args) => spawnSync(process.execPath, [path.join(clone, 'tools/install.cjs'), ...args], { cwd: clone, env: installEnv, encoding: 'utf8', windowsHide: true, timeout: 300000 });
const same = (a, b) => fs.realpathSync(a).toLowerCase() === fs.realpathSync(b).toLowerCase();
const settings = home => JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'));

/** A clone of this repository holding the working tree's current files as one commit. */
function cloneWithWorkingTree(dir) {
  const clone = path.join(dir, 'harness');
  git(dir, 'clone', '-q', '--no-hardlinks', ROOT, clone);
  for (const line of git(ROOT, 'status', '--porcelain', '-uall').split('\n').filter(Boolean)) {
    const file = line.slice(3).replace(/^"|"$/g, '');
    const from = path.join(ROOT, file), to = path.join(clone, file);
    if (fs.existsSync(from)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
    else fs.rmSync(to, { force: true });
  }
  git(clone, 'add', '-A');
  git(clone, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'working tree', '--allow-empty');
  fs.writeFileSync(path.join(clone, 'rules/default.rules'), '# Codex approvals (untracked)\n');
  return clone;
}

test('v2 installs core, --version v1 installs v1 in place, and going back retires v1-only settings', { timeout: 600000 }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-version-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clone = cloneWithWorkingTree(dir);
  const home = path.join(dir, 'home'), record = path.join(dir, 'installation.json');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify({ env: { OWNER_KEY: 'keep' } }));
  const oldRules = path.join(dir, 'old-rules');
  fs.mkdirSync(oldRules);
  fs.symlinkSync(oldRules, path.join(home, '.claude/rules'), 'junction');

  // v2 from the clone as checked out.
  let r = install(clone, home, record);
  assert.equal(r.status, 0, r.stderr);
  for (const provider of ['claude', 'codex']) for (const name of ['skills', 'commands', 'scripts', 'task-system']) assert.ok(same(path.join(home, '.' + provider, name), path.join(clone, name)), provider + '/' + name);
  assert.ok(same(path.join(home, '.claude/agents'), path.join(clone, 'agents')));
  assert.ok(!fs.existsSync(path.join(home, '.claude/rules')), 'v2 does not link ~/.claude/rules');
  assert.ok(same(path.join(home, '.codex/rules'), path.join(clone, 'rules')), '~/.codex/rules keeps Codex approvals');
  const installed = JSON.parse(fs.readFileSync(record, 'utf8'));
  assert.ok(fs.existsSync(path.join(installed.backup, '.claude/rules')), 'the old rules link is kept in the backup');
  assert.match(fs.readFileSync(path.join(home, '.claude/CLAUDE.md'), 'utf8'), /Write the record twice, one command each/);
  assert.match(fs.readFileSync(path.join(home, '.codex/AGENTS.md'), 'utf8'), /Write the record twice, one command each/);
  let s = settings(home);
  assert.equal(s.env.ECC_TASK_FLOW, 'lean');
  assert.equal(s.env.OWNER_KEY, 'keep');
  const core = JSON.parse(fs.readFileSync(path.join(clone, 'core/policy.json'), 'utf8'));
  assert.deepEqual(Object.keys(s.hooks).sort(), [...new Set(['SessionStart', 'UserPromptSubmit', ...core.hooks.map(h => h.event)])].sort());
  assert.deepEqual(installed.env.sort(), Object.keys(core.env).sort());
  const v2Head = git(clone, 'rev-parse', 'HEAD').trim();

  // v1 in place (the --version=<tag> spelling works too).
  r = install(clone, '--version=v1', home, record);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(clone, 'rev-parse', 'HEAD').trim(), git(clone, 'rev-parse', 'v1^{commit}').trim());
  assert.match(fs.readFileSync(path.join(home, '.claude/CLAUDE.md'), 'utf8'), /Task workflow \(all projects\)/);
  assert.ok(same(path.join(home, '.claude/rules'), path.join(clone, 'rules')), 'v1 links ~/.claude/rules');
  assert.ok(fs.existsSync(path.join(clone, 'rules/default.rules')), 'untracked approvals survive the checkout');
  s = settings(home);
  assert.equal(s.env.ECC_TASK_FLOW, undefined, 'v2-only key retired');
  assert.ok(s.env.ECC_DISABLED_HOOKS, 'v1 key set');
  assert.equal(s.env.OWNER_KEY, 'keep');
  const dispatcher = path.join(clone, 'tools', 'dispatch.cjs').replace(/\\/g, '/');
  for (const groups of Object.values(s.hooks)) for (const g of groups) for (const h of g.hooks) assert.ok(h.command.includes(dispatcher), h.command);

  // Back to v2 with the plain installer.
  git(clone, 'checkout', '-q', v2Head);
  r = install(clone, home, record);
  assert.equal(r.status, 0, r.stderr);
  s = settings(home);
  assert.equal(s.env.ECC_DISABLED_HOOKS, undefined, 'v1-only key retired');
  assert.equal(s.env.ECC_TASK_FLOW, 'lean');
  assert.equal(s.env.OWNER_KEY, 'keep');
  assert.ok(!fs.existsSync(path.join(home, '.claude/rules')));
});

test('--version refuses an unknown tag and a tracked change, and leaves the checkout alone', { timeout: 600000 }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-version-refuse-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clone = cloneWithWorkingTree(dir);
  const home = path.join(dir, 'home'), record = path.join(dir, 'installation.json');
  fs.mkdirSync(home);
  const head = git(clone, 'rev-parse', 'HEAD').trim();
  for (const bad of [['--version'], ['--bogus'], [home, record, '--version']]) {
    const refused = install(clone, ...bad);
    assert.notEqual(refused.status, 0, bad.join(' '));
    assert.match(refused.stderr, /usage: node tools\/install\.cjs/);
  }
  assert.ok(!fs.existsSync(path.join(clone, '--version')) && !fs.existsSync(path.join(clone, '--bogus')), 'no folder made from an option');
  assert.deepEqual(fs.readdirSync(SAFE_HOME), [], 'no install fell back to the default home');
  let r = install(clone, '--version', 'no-such-tag', home, record);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no-such-tag/);
  fs.appendFileSync(path.join(clone, 'README.md'), '\nlocal edit\n');
  r = install(clone, '--version', 'v1', home, record);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /README\.md/);
  assert.equal(git(clone, 'rev-parse', 'HEAD').trim(), head);
  assert.ok(!fs.existsSync(path.join(home, '.claude')), 'nothing installed');
});
