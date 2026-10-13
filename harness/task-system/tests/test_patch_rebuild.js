'use strict';
// Codex patch rebuilding: text matches the way Codex matches it (curly quotes, dashes and odd
// spaces count as their plain forms), and a patch the checker cannot rebuild is allowed and
// logged instead of refused. The task gate still judges the file's path in that case.
// Run: node --test task-system/tests/test_patch_rebuild.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const { editsFromPatch } = require(path.join(ROOT, 'tools/patch.cjs'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-rebuild-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const args of [['init', '-q'], ['config', 'user.name', 'T'], ['config', 'user.email', 't@example.invalid']]) spawnSync('git', args, { cwd: dir, env });
  fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'const b = 1;\n');
  spawnSync('git', ['add', '.'], { cwd: dir, env });
  spawnSync('git', ['commit', '-qm', 'base'], { cwd: dir, env });
  fs.mkdirSync(path.join(dir, 'task_list/open'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'task_list/open/01_t.md'), '---\nid: "01"\nstatus: in_progress\nfiles:\n  - a.js\n  - b.js\ndocs: []\n---\n# T\n');
  return dir;
}
const patch = (file, body) => '*** Begin Patch\n*** Update File: ' + file + '\n' + body + '\n*** End Patch';
function codex(dir, command, session) {
  return spawnSync(process.execPath, [path.join(ROOT, 'tools/dispatch.cjs'), 'codex', 'PreToolUse'], {
    input: JSON.stringify({ cwd: dir, session_id: session, tool_name: 'apply_patch', tool_input: { command } }), encoding: 'utf8', cwd: dir, env, windowsHide: true,
  });
}
const denied = r => r.status === 0 && /"permissionDecision":"deny"/.test(r.stdout);

test('curly quotes, dashes and non-breaking spaces match their plain forms', t => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, 'c.js'), 'say(“hello”);\n// a – b c ’x’\n');
  const edits = editsFromPatch(patch('c.js', '@@\n-say("hello");\n-// a - b c \'x\'\n+say("bye");'), dir);
  assert.equal(edits[0].tool_input.content, 'say("bye");\n');
});

test('plain text still has to match: a missing line is not invented', t => {
  const dir = repo(t);
  const edits = editsFromPatch(patch('a.js', '@@\n-const zzz = 9;\n+const a = 2;'), dir);
  assert.equal(edits[0].unrebuilt, true);
  assert.equal(edits[0].tool_input.content, 'const a = 1;\n', 'gates see the file as it is now');
});

test('a declared file the checker cannot rebuild is allowed and logged', t => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, 'b.js'), 'const b = 2;\n');  // b.js dirty, so a.js is the second code file
  const session = 'patch-rebuild-' + path.basename(dir);
  const r = codex(dir, patch('a.js', '@@\n-const a = â€“1;\n+const a = 2;'), session);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!denied(r), r.stdout);
  const log = fs.readFileSync(path.join(ROOT, 'state/hook-runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const entry = log.reverse().find(e => e.session === session && e.unrebuilt);
  assert.ok(entry, 'hook-runs.jsonl records the unrebuilt file');
  assert.match(entry.unrebuilt[0], /a\.js$/);
});

test('an undeclared file the checker cannot rebuild is still refused by the task gate', t => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, 'b.js'), 'const b = 2;\n');
  fs.writeFileSync(path.join(dir, 'c.js'), 'const c = 1;\n');
  const r = codex(dir, patch('c.js', '@@\n-const nope = 1;\n+const c = 2;'), 'patch-undeclared-' + path.basename(dir));
  assert.ok(denied(r), 'scope still enforced: ' + r.stdout + r.stderr);
  assert.match(r.stdout, /TASK GATE/, 'refused for scope, not for the failed rebuild');
});

test('input that is not a patch at all is still refused', t => {
  const dir = repo(t);
  assert.ok(denied(codex(dir, 'not a patch', 'patch-garbage-' + path.basename(dir))));
});
