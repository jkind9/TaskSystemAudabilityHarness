// Transition guard tests: the task CLI refuses the three unsafe cases found by the 2026-10-08 audit
// (a mistyped flag, closing without a Receipts section, starting an unreviewed HIGH task),
// changes nothing when it refuses, and still allows each case with an explicit --force.
// Run: node --test task-system/tests/test_transition_guards.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const CLI = path.resolve(__dirname, '..', 'task.js');
const MD = '.' + 'md';
const RECEIPTS = '\n## Receipts\n\n| field | value |\n|---|---|\n| closing commit | abc |\n';

function board(frontmatter, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guards-'));
  fs.mkdirSync(path.join(dir, 'task_list', 'open'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'task_list', 'open', '01_fixture' + MD),
    '---\nid: "01"\ntitle: Fixture\nstatus: open\n' + frontmatter + '---\n\n# Task 01\n\n## In plain English\n\nA fixture task used by tests.\n' + body);
  return dir;
}
function snapshot(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { out.push('D ' + path.relative(dir, p)); walk(p); }
      else out.push('F ' + path.relative(dir, p) + ' ' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
    }
  })(dir);
  return out.sort().join('\n');
}
function cli(dir, args) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^GIT_/i.test(k) || k === 'NODE_TEST_CONTEXT') delete env[k];
  return spawnSync(process.execPath, [CLI, ...args], { cwd: dir, env, encoding: 'utf8' });
}
function refusedWithoutChange(dir, args) {
  const before = snapshot(dir);
  const r = cli(dir, args);
  assert.notStrictEqual(r.status, 0, 'expected refusal: ' + args.join(' ') + '\n' + r.stdout);
  assert.strictEqual(snapshot(dir), before, 'board changed on refusal: ' + args.join(' '));
  return r;
}
const journal = dir => { try { return fs.readFileSync(path.join(dir, 'task_list', '.journal.log'), 'utf8'); } catch { return ''; } };

test('a mistyped flag is refused before anything changes', () => {
  const dir = board('priority: LOW\n', RECEIPTS);
  const r = refusedWithoutChange(dir, ['move', '01', 'closed', '--dryrun']);
  assert.match(r.stderr, /unknown flag --dryrun/);
});

test('closing a task with no Receipts section is refused', () => {
  refusedWithoutChange(board('priority: LOW\n', ''), ['move', '01', 'closed']);
  refusedWithoutChange(board('priority: LOW\n', ''), ['close', '01']);
});

test('closing a task with no Receipts section is allowed with --force', () => {
  const dir = board('priority: LOW\n', '');
  assert.strictEqual(cli(dir, ['move', '01', 'closed', '--force']).status, 0);
  assert.ok(fs.existsSync(path.join(dir, 'task_list', 'closed', '01_fixture' + MD)));
});

test('a task with filled receipts still closes', () => {
  const dir = board('priority: LOW\n', RECEIPTS);
  assert.strictEqual(cli(dir, ['move', '01', 'closed']).status, 0);
});

for (const [priority, stamp] of [['HIGH', 'null'], ['HIGH', '2026-10-08 FAIL'], ['CRITICAL', 'null']]) {
  test(`starting a ${priority} task whose plan review is ${stamp} is refused`, () => {
    const r = refusedWithoutChange(board(`priority: ${priority}\nplan_reviewed: ${stamp}\n`, RECEIPTS), ['start', '01']);
    assert.match(r.stderr, /plan review/);
  });
}

test('an unreviewed HIGH task starts with --force and the override is journaled', () => {
  const dir = board('priority: HIGH\nplan_reviewed: null\n', RECEIPTS);
  assert.strictEqual(cli(dir, ['start', '01', '--force']).status, 0);
  assert.match(fs.readFileSync(path.join(dir, 'task_list', 'open', '01_fixture' + MD), 'utf8'), /status: in_progress/);
  assert.match(journal(dir), /force-start 01/);
});

test('a HIGH task with a PASS review starts, and a MED task needs no review', () => {
  assert.strictEqual(cli(board('priority: HIGH\nplan_reviewed: 2026-10-09 PASS\n', RECEIPTS), ['start', '01']).status, 0);
  assert.strictEqual(cli(board('priority: MED\nplan_reviewed: null\n', RECEIPTS), ['start', '01']).status, 0);
});

test('new does not auto-start an unreviewed HIGH task', () => {
  const dir = board('priority: LOW\n', RECEIPTS);
  const r = cli(dir, ['new', 'Risky change', '--priority', 'HIGH']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /not started/);
  const created = fs.readdirSync(path.join(dir, 'task_list', 'open')).find(n => n.startsWith('02_'));
  assert.match(fs.readFileSync(path.join(dir, 'task_list', 'open', created), 'utf8'), /status: open/);
});
