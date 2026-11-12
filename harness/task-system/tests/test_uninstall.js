'use strict';
// tools/uninstall.cjs undoes tools/install.cjs. Both run from a copy of this folder with no install
// record, as in a fresh clone. Homes are scratch folders, and HOME and USERPROFILE point at one too,
// so a mishandled argument can never reach the real home.
// Run: node --test task-system/tests/test_uninstall.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-uninstall-'));
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
const COPY = path.join(DIR, 'harness'), SAFE_HOME = path.join(DIR, 'safe-home');
fs.cpSync(ROOT, COPY, { recursive: true, filter: from => !/[\\/](\.git|state|generated|installation\.json|validation\.json)$/.test(from) });
const run = (tool, ...args) => spawnSync(process.execPath, [path.join(COPY, 'tools', tool), ...args], { env: { ...process.env, USERPROFILE: SAFE_HOME, HOME: SAFE_HOME }, encoding: 'utf8', windowsHide: true, timeout: 300000 });

/** Every path under home except the backups, mapped to its text, 'dir' or 'link'. */
function listing(home) {
  const out = {};
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name), relative = path.relative(home, full).replace(/\\/g, '/');
      if (relative === '.agents/harness-backups') continue;
      if (entry.isSymbolicLink()) out[relative] = 'link';
      else if (entry.isDirectory()) { if (relative !== '.agents') out[relative] = 'dir'; walk(full); }
      else out[relative] = fs.readFileSync(full, 'utf8');
    }
  })(home);
  return out;
}

test('uninstall puts the home back as it was, keeps the harness files it moved, and runs once', { timeout: 600000 }, () => {
  const home = path.join(DIR, 'home-owned'), record = path.join(DIR, 'owned.json');
  const own = { '.claude/settings.json': '{"env":{"OWNER_KEY":"keep"}}', '.claude/CLAUDE.md': 'mine\n', '.claude/skills/own/SKILL.md': 'own\n', '.codex/config.toml': 'model = "x"\n' };
  for (const [file, text] of Object.entries(own)) {
    fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    fs.writeFileSync(path.join(home, file), text);
  }
  const before = listing(home);
  let r = run('install.cjs', home, record);
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(fs.readFileSync(path.join(home, '.claude/CLAUDE.md'), 'utf8'), 'mine\n');
  r = run('uninstall.cjs', home, record);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(listing(home), before);
  const { saved } = JSON.parse(r.stdout);
  assert.ok(JSON.parse(fs.readFileSync(path.join(saved, '.claude/settings.json'), 'utf8')).hooks, 'the harness settings are kept');
  assert.ok(!fs.existsSync(record));
  assert.ok(fs.readdirSync(path.join(COPY, 'skills')).length > 0, 'the links were removed, not followed');
  r = run('uninstall.cjs', home, record);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nothing to undo/);
  assert.deepEqual(listing(home), before);
});

test('after two installs into an empty home, uninstall brings none of the harness files back', { timeout: 600000 }, () => {
  const home = path.join(DIR, 'home-empty'), record = path.join(DIR, 'empty.json');
  fs.mkdirSync(home);
  for (let i = 0; i < 2; i++) { const r = run('install.cjs', home, record); assert.equal(r.status, 0, r.stderr); }
  const r = run('uninstall.cjs', home, record);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(listing(home), { '.claude': 'dir', '.codex': 'dir' });
});
