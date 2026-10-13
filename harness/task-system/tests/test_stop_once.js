'use strict';
// End-of-session gate: one refusal at most, as one line naming the exact command to run; the
// next stop in the same session is allowed and logged with what was still missing.
// Run: node --test task-system/tests/test_stop_once.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const GATE = path.join(ROOT, 'scripts/hooks/task-complete-gate.js');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));

function repo(t, receipts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-once-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const args of [['init', '-q'], ['config', 'user.name', 'T'], ['config', 'user.email', 't@example.invalid']]) spawnSync('git', args, { cwd: dir, env });
  fs.writeFileSync(path.join(dir, 'a.js'), '1\n');
  spawnSync('git', ['add', '.'], { cwd: dir, env });
  spawnSync('git', ['commit', '-qm', 'base'], { cwd: dir, env });
  fs.writeFileSync(path.join(dir, 'a.js'), '2\n');
  fs.mkdirSync(path.join(dir, 'task_list/open'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'task_list/open/01_t.md'), '---\nid: "01"\nstatus: in_progress\nfiles: [a.js]\ndocs: []\n---\n# T\n\n## In plain English\n\nChange the number in a file so the test fixture has a code change to judge.\n\ndocs n/a: fixture\ntests n/a: fixture\n\n## Receipts\n\n| field | value |\n|---|---|\n| result | ' + receipts + ' |\n');
  return dir;
}
function stop(provider, dir, session) {
  return spawnSync(process.execPath, [path.join(ROOT, 'tools/dispatch.cjs'), provider, 'Stop'], {
    input: JSON.stringify({ cwd: dir, session_id: session }), encoding: 'utf8', cwd: dir, env, windowsHide: true,
  });
}
const refused = (provider, r) => provider === 'claude' ? r.status === 2 : r.status === 0 && /"decision":"block"/.test(r.stdout);

test('the refusal is one line that names the exact command', t => {
  const dir = repo(t, '(fill in)');
  const r = spawnSync(process.execPath, [GATE], { input: JSON.stringify({ session_id: 'x' }), encoding: 'utf8', cwd: dir, env });
  assert.equal(r.status, 2);
  const lines = r.stderr.split('\n').filter(l => l.trim());
  assert.equal(lines.length, 1, r.stderr);
  assert.match(lines[0], /unfilled receipts/);
  assert.match(lines[0], /node ~\/\.claude\/task-system\/task\.js move 01 pending_review/);
});

test('each runtime refuses once, then allows the next stop and logs what was missing', t => {
  for (const provider of ['claude', 'codex']) {
    const dir = repo(t, '(fill in)');
    const session = 'stop-once-' + provider + '-' + path.basename(dir);
    const outcomes = [1, 2, 3, 4].map(() => refused(provider, stop(provider, dir, session)));
    assert.deepEqual(outcomes, [true, false, true, false], provider);
    const log = fs.readFileSync(path.join(ROOT, 'state/hook-runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const gaveUp = log.filter(e => e.session === session && e.gaveUp);
    assert.equal(gaveUp.length, 2, provider);
    assert.match(gaveUp[0].missing, /Task 01 is still open. Run: .*task.js" finish --checked/);  // v2: the lean stop gate
  }
});

test('a finished task is allowed at the first stop', t => {
  const dir = repo(t, 'done, checked with node a.js');
  fs.mkdirSync(path.join(dir, 'task_list/done'));
  fs.renameSync(path.join(dir, 'task_list/open/01_t.md'), path.join(dir, 'task_list/done/01_t.md'));  // v2: finished = in done/
  for (const provider of ['claude', 'codex']) assert.equal(refused(provider, stop(provider, dir, 'stop-quiet-' + provider + path.basename(dir))), false, provider);
});
