'use strict';
// Lean task flow: `task.js begin` writes the whole start of a task in one call; `task.js finish`
// runs the end-of-task checks once, writes Files / Checked / Left over and moves the task to done/.
// Run: node --test task-system/tests/test_lean_flow.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const CLI = path.resolve(__dirname, '..', 'task.js');
// finish reads Claude transcripts under the home folder; give every call a scratch home.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-flow-home-'));
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k) && k !== 'CLAUDE_PROJECT_DIR')), USERPROFILE: HOME, HOME };
const cli = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true });
const git = (root, ...args) => { const r = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-flow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'T'); git(root, 'config', 'user.email', 't@example.invalid');
  fs.mkdirSync(path.join(root, 'pkg'));
  fs.writeFileSync(path.join(root, 'pkg/core.py'), 'def add(a, b):\n    return a + b\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  return root;
}
const open = root => fs.readdirSync(path.join(root, 'task_list/open')).filter(f => f.endsWith('.md'));
const read = (root, folder, file) => fs.readFileSync(path.join(root, 'task_list', folder, file), 'utf8');

test('begin writes goal, plan and files in one call and makes the task active', t => {
  const root = repo(t);
  const r = cli(root, 'begin', 'Add subtraction', '--files', 'pkg/core.py,tests/test_core.py', '--goal', 'Subtract two numbers.', '--plan', '1. add sub() 2. test it');
  assert.equal(r.status, 0, r.stderr);
  const [file] = open(root);
  const text = read(root, 'open', file);
  assert.match(text, /status: in_progress/);
  assert.match(text, /files:\n  - pkg\/core\.py\n  - tests\/test_core\.py/);
  assert.match(text, /## Goal\n\nSubtract two numbers\./);
  assert.match(text, /## Plan\n\n1\. add sub\(\) 2\. test it/);
  assert.ok(text.trimEnd().split('\n').length <= 30, 'about 30 lines');
});

test('begin refuses while another task is open, and needs --files', t => {
  const root = repo(t);
  assert.equal(cli(root, 'begin', 'First', '--files', 'pkg/core.py').status, 0);
  const second = cli(root, 'begin', 'Second', '--files', 'pkg/core.py');
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /task\.js finish/);
  assert.equal(open(root).length, 1);
  assert.notEqual(cli(repo(t), 'begin', 'No files').status, 0);
});

test('finish records the check, the numbers and what is left, then moves the task to done/', t => {
  const root = repo(t);
  cli(root, 'begin', 'Add subtraction', '--files', 'pkg/core.py');
  fs.appendFileSync(path.join(root, 'pkg/core.py'), '\ndef sub(a, b):\n    return a - b\n');
  const r = cli(root, 'finish', '--checked', 'python -m pytest -q -> 3 passed', '--left', 'Division (next session).');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(open(root), []);
  const [file] = fs.readdirSync(path.join(root, 'task_list/done'));
  const text = read(root, 'done', file);
  assert.match(text, /status: done/);
  assert.match(text, /## Files\n\n- pkg\/core\.py \(\+3 -0, 5 lines\)/);
  assert.match(text, /`python -m pytest -q -> 3 passed`/);
  assert.match(text, /new duplicate blocks: 0/);
  assert.match(text, /complexity share \(functions over 10\): 0 \(was 0\)/);
  assert.match(text, /dead code on added lines: /);
  assert.match(text, /prose patterns: /);
  assert.match(text, /## Left over\n\nDivision \(next session\)\./);
});

test('the next begin shows what the last finished task left over', t => {
  const root = repo(t);
  cli(root, 'begin', 'Part one', '--files', 'pkg/core.py');
  cli(root, 'finish', '--checked', 'no test exists: example task', '--left', 'Part two: timestamps.');
  const r = cli(root, 'begin', 'Part two', '--files', 'pkg/core.py');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Left over from task 00: Part two: timestamps\./);
  assert.match(open(root)[0], /^01_/);
});

test('finish refuses a new duplicate block and leaves the task open', t => {
  const root = repo(t);
  cli(root, 'begin', 'Copy', '--files', 'pkg/core.py');
  const body = Array.from({ length: 6 }, (_, i) => '    total = total + values[' + i + ']').join('\n');
  fs.appendFileSync(path.join(root, 'pkg/core.py'), '\ndef one(values):\n    total = 0\n' + body + '\n    return total\n\ndef two(values):\n    total = 1\n' + body + '\n    return total\n');
  const r = cli(root, 'finish', '--checked', 'x -> y');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /1 new duplicate block/);
  assert.equal(open(root).length, 1);
});

test('finish refuses a touched code file over 800 lines', t => {
  const root = repo(t);
  cli(root, 'begin', 'Grow', '--files', 'pkg/core.py');
  fs.appendFileSync(path.join(root, 'pkg/core.py'), Array.from({ length: 801 }, (_, i) => 'v' + i + ' = ' + i).join('\n') + '\n');
  const r = cli(root, 'finish', '--checked', 'x -> y');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /pkg\/core\.py is 80\d lines/);
  assert.equal(open(root).length, 1);
});

test('a file already over 800 lines may be touched without growing; finish reports it and passes', t => {
  const root = repo(t);
  fs.writeFileSync(path.join(root, 'pkg/big.py'), Array.from({ length: 850 }, (_, i) => 'v' + i + ' = ' + i).join('\n') + '\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'big');
  cli(root, 'begin', 'Shrink', '--files', 'pkg/big.py');
  fs.writeFileSync(path.join(root, 'pkg/big.py'), Array.from({ length: 840 }, (_, i) => 'w' + i + ' = ' + i).join('\n') + '\n');
  const r = cli(root, 'finish', '--checked', 'x -> y');
  assert.equal(r.status, 0, r.stderr);
  assert.match(read(root, 'done', fs.readdirSync(path.join(root, 'task_list/done'))[0]), /over 800 lines, not grown: pkg\/big\.py \(840, was 850\)/);
});

test('help shows the lean syntax itself, so nobody has to read lean.js', t => {
  const help = cli(repo(t), 'help').stdout;
  assert.match(help, /begin "<title>" --files a,b --goal "<line>" --plan "<steps>"/);
  assert.match(help, /finish --checked "<command> -> <result>" --left "<text>"/);
  assert.doesNotMatch(help, /see lean\.js/);
});

test('files add puts new paths under the open task, once each', t => {
  const root = repo(t);
  cli(root, 'begin', 'Add subtraction', '--files', 'pkg/core.py');
  const r = cli(root, 'files', 'add', 'tests/test_core.py,pkg/util.py', 'tests/test_core.py');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pkg\/core\.py, tests\/test_core\.py, pkg\/util\.py/);
  const text = read(root, 'open', open(root)[0]);
  assert.match(text, /files:\n  - pkg\/core\.py\n  - tests\/test_core\.py\n  - pkg\/util\.py\ncreated:/);
});

test('files add needs an open task and a path', t => {
  const root = repo(t);
  const none = cli(root, 'files', 'add', 'pkg/core.py');
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /task\.js begin/);
  cli(root, 'begin', 'T', '--files', 'pkg/core.py');
  assert.notEqual(cli(root, 'files', 'add').status, 0);
  assert.notEqual(cli(root, 'files', 'remove', 'pkg/core.py').status, 0);
});

test('core/AGENTS.md names one way to widen a task, and only commands task.js has', () => {
  const text = fs.readFileSync(path.resolve(__dirname, '..', '..', 'core', 'AGENTS.md'), 'utf8');
  assert.match(text, /task\.js" files add /);
  assert.doesNotMatch(text, /add the file to `files:`/);
  const named = [...text.matchAll(/task\.js"? (\w+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(named)].sort(), ['begin', 'files', 'finish']);
});

test('help names files add', t => {
  assert.match(cli(repo(t), 'help').stdout, /files add <path>/);
});

test('finish refuses a check that did not run, once, naming the command to use', t => {
  for (const checked of ['tests not run', 'pytest -> not run', 'none -> nothing to run', 'not run -> awaiting YAML tests']) {
    const root = repo(t);
    cli(root, 'begin', 'T', '--files', 'pkg/core.py');
    const first = cli(root, 'finish', '--checked', checked);
    assert.notEqual(first.status, 0, checked);
    assert.match(first.stderr, /finish --checked "<command you ran> -> <result>"/);
    assert.match(first.stderr, /--checked "no test exists: <why>"/);
    assert.equal(open(root).length, 1);
    const second = cli(root, 'finish', '--checked', checked);
    assert.equal(second.status, 0, second.stderr);
    const done = read(root, 'done', fs.readdirSync(path.join(root, 'task_list/done'))[0]);
    assert.ok(done.includes('- `' + checked + '` (no check named; accepted after one refusal)'), done);
  }
});

test('finish accepts a check that ran, or a plain statement that no test exists', t => {
  for (const checked of ['git diff --check -> passed; tests not run', 'python -m pytest -q → 3 failed', 'no test exists: config only']) {
    const root = repo(t);
    cli(root, 'begin', 'T', '--files', 'pkg/core.py');
    const r = cli(root, 'finish', '--checked', checked);
    assert.equal(r.status, 0, checked + ': ' + r.stderr);
    assert.ok(read(root, 'done', fs.readdirSync(path.join(root, 'task_list/done'))[0]).includes('- `' + checked + '`\n'));
  }
});

test('finish records the minutes since begin and the Claude tokens used in that time', t => {
  const root = repo(t);
  cli(root, 'begin', 'Cost', '--files', 'pkg/core.py');
  const project = path.join(HOME, '.claude', 'projects', 'p-' + path.basename(root));
  fs.mkdirSync(project, { recursive: true });
  const usage = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000, output_tokens: 100 };
  fs.writeFileSync(path.join(project, 's1.jsonl'), JSON.stringify({ cwd: root }) + '\n'
    + JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { id: 'm1', role: 'assistant', model: 'claude-opus-5-5', usage } }) + '\n');
  fs.appendFileSync(path.join(root, 'pkg/core.py'), '\ndef sub(a, b):\n    return a - b\n');
  const r = cli(root, 'finish', '--checked', 'python -m pytest -q -> 1 passed');
  assert.equal(r.status, 0, r.stderr);
  const text = read(root, 'done', fs.readdirSync(path.join(root, 'task_list/done'))[0]);
  assert.match(text, /- cost: \d+ min from begin to finish; Claude tokens 1,110 \(fresh input 10, cache read 1,000, output 100; 1 session\)/);
});

test('finish says plainly when no Claude tokens were found', t => {
  const root = repo(t);
  cli(root, 'begin', 'No transcript', '--files', 'pkg/core.py');
  const r = cli(root, 'finish', '--checked', 'no test exists: example');
  assert.equal(r.status, 0, r.stderr);
  const text = read(root, 'done', fs.readdirSync(path.join(root, 'task_list/done'))[0]);
  assert.match(text, /- cost: \d+ min from begin to finish; Claude tokens: none found \(Codex sessions are not read\)/);
});

test('finish needs --checked and an open task', t => {
  const root = repo(t);
  assert.match(cli(root, 'finish', '--checked', 'x -> y').stderr, /no open task/);
  cli(root, 'begin', 'T', '--files', 'pkg/core.py');
  assert.match(cli(root, 'finish').stderr, /--checked/);
});
