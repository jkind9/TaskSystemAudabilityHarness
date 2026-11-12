'use strict';
// A task belongs to the session that began it. Two sessions on one board each begin, write under
// and finish their own task; neither blocks the other. A task can pass to a later session with
// adopt, never be held by two at once.
// Run: node --test task-system/tests/test_lean_owner.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const { globMatch } = require(path.join(ROOT, 'task-system/lean-board.js'));
const CLI = path.join(ROOT, 'task-system/task.js');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-owner-home-'));
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));
const base = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_|CLAUDE_CODE_SESSION_ID$|CODEX_SESSION_ID$|CODEX_THREAD_ID$|ECC_TASK_FLOW$)/i.test(k) && k !== 'CLAUDE_PROJECT_DIR')), USERPROFILE: HOME, HOME };
const as = (session, root, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, env: { ...base, ...(session ? { CLAUDE_CODE_SESSION_ID: session } : {}) }, encoding: 'utf8', windowsHide: true });
const hook = (name, root, session, input = {}) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/hooks', name)], {
  input: JSON.stringify({ cwd: root, session_id: session, ...input }), cwd: root, env: { ...base, ECC_TASK_FLOW: 'lean' }, encoding: 'utf8', windowsHide: true,
});
const write = (root, file) => ({ tool_name: 'Write', tool_input: { file_path: path.join(root, file), content: 'z = 3\n' } });

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-owner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const args of [['init', '-q'], ['config', 'user.name', 'T'], ['config', 'user.email', 't@example.invalid']]) spawnSync('git', args, { cwd: root, env: base });
  fs.writeFileSync(path.join(root, 'a.py'), 'x = 1\n');
  fs.writeFileSync(path.join(root, 'b.py'), 'y = 1\n');
  spawnSync('git', ['add', '.'], { cwd: root, env: base }); spawnSync('git', ['commit', '-qm', 'base'], { cwd: root, env: base });
  return root;
}
const openFiles = root => fs.readdirSync(path.join(root, 'task_list/open'));
const doneText = root => fs.readFileSync(path.join(root, 'task_list/done', fs.readdirSync(path.join(root, 'task_list/done'))[0]), 'utf8');

test('globMatch: ** spans folders, * stays in one, regex characters are literal, case is ignored', () => {
  const yes = [['a.py', 'a.py'], ['src/*.py', 'src/a.py'], ['src/**/*.py', 'src/a.py'], ['src/**/*.py', 'src/x/y/a.py'], ['**/*.md', 'docs/A.MD'], ['SRC\\a.py', 'src/a.py'], ['x[1]', 'x[1]']];
  const no = [['src/*.py', 'src/x/a.py'], ['a.b', 'axb'], ['?x', 'x']];
  for (const [g, p] of yes) assert.equal(globMatch(g, p), true, g + ' ~ ' + p);
  for (const [g, p] of no) assert.equal(globMatch(g, p), false, g + ' !~ ' + p);
});

test('two sessions each begin and finish their own task on one board', t => {
  const root = repo(t);
  assert.equal(as('A', root, 'begin', 'E9', '--files', 'a.py').status, 0);
  const second = as('B', root, 'begin', 'E10', '--files', 'b.py');
  assert.equal(second.status, 0, second.stderr);
  assert.match(fs.readFileSync(path.join(root, 'task_list/open', openFiles(root).find(f => f.startsWith('01_'))), 'utf8'), /^session: B$/m);
  const again = as('B', root, 'begin', 'E11', '--files', 'b.py');
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /Task 01 is still open in this session/);
  fs.writeFileSync(path.join(root, 'a.py'), 'x = 2\n');
  fs.writeFileSync(path.join(root, 'b.py'), 'y = 2\n');
  const done = as('B', root, 'finish', '--checked', 'no test exists: example');
  assert.equal(done.status, 0, done.stderr);
  assert.deepEqual(openFiles(root).map(f => f.slice(0, 3)), ['00_']);
  const files = doneText(root).match(/## Files\n\n([\s\S]*?)\n\n/)[1];
  assert.equal(files, '- b.py (+1 -1, 1 lines)', 'A\'s a.py is A\'s work, not listed in B\'s record');
});

test('begin and files add warn when another session lists the same file', t => {
  const root = repo(t);
  as('A', root, 'begin', 'E9', '--files', 'a.py,BIBLE.md');
  const b = as('B', root, 'begin', 'E10', '--files', 'b.py,BIBLE.md');
  assert.match(b.stdout, /Note: open task 00 in another session also lists BIBLE\.md\./);
  assert.match(as('B', root, 'files', 'add', 'a.py').stdout, /Note: open task 00 in another session also lists a\.py\./);
});

test('finish and files add name tasks open in other sessions instead of touching them', t => {
  const root = repo(t);
  as('A', root, 'begin', 'E9', '--files', 'a.py');
  const finish = as('B', root, 'finish', '--checked', 'x -> y');
  assert.notEqual(finish.status, 0);
  assert.match(finish.stderr, /no open task to finish in this session[\s\S]*Open in other sessions: 00\..*task\.js adopt <id>/);
  assert.notEqual(as('B', root, 'files', 'add', 'b.py').status, 0);
  assert.equal(openFiles(root).length, 1);
});

test('a record without a session still belongs to every session', t => {
  const root = repo(t);
  as('', root, 'begin', 'Old style', '--files', 'a.py');
  assert.match(fs.readFileSync(path.join(root, 'task_list/open', openFiles(root)[0]), 'utf8'), /^session: $/m);
  assert.match(as('B', root, 'begin', 'New', '--files', 'b.py').stderr, /Task 00 is still open in this session/);
  assert.equal(as('B', root, 'finish', '--checked', 'no test exists: example').status, 0);
});

test('adopt moves a task to a later session; the old session can no longer act on it', t => {
  const root = repo(t);
  as('A', root, 'begin', 'Long task', '--files', 'a.py');
  const moved = as('C', root, 'adopt', '0');
  assert.equal(moved.status, 0, moved.stderr);
  assert.match(moved.stdout, /Task 00 now belongs to this session \(was A\)\. Its files: a\.py/);
  assert.match(fs.readFileSync(path.join(root, 'task_list/open', openFiles(root)[0]), 'utf8'), /^session: C$/m);
  assert.match(as('C', root, 'adopt', '00').stdout, /already belongs to this session/);
  assert.notEqual(as('A', root, 'finish', '--checked', 'no test exists: example').status, 0);
  assert.equal(as('C', root, 'finish', '--checked', 'no test exists: example').status, 0);
});

test('adopt adds the session line to a record from before owners', t => {
  const root = repo(t);
  as('', root, 'begin', 'Old style', '--files', 'a.py');
  const file = path.join(root, 'task_list/open', openFiles(root)[0]);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^session: \n/m, ''));
  assert.equal(as('C', root, 'adopt', '00').status, 0);
  assert.match(fs.readFileSync(file, 'utf8'), /^status: in_progress\nsession: C\nfiles:/m);
});

test('adopt refuses with no session id, an unknown task, or a task of its own still open', t => {
  const root = repo(t);
  as('A', root, 'begin', 'E9', '--files', 'a.py');
  assert.match(as('', root, 'adopt', '00').stderr, /no session id/);
  assert.match(as('C', root, 'adopt', '7').stderr, /no open task 7/);
  as('C', root, 'begin', 'Own', '--files', 'b.py');
  assert.match(as('C', root, 'adopt', '00').stderr, /Task 01 is open in this session/);
  assert.match(fs.readFileSync(path.join(root, 'task_list/open', openFiles(root).find(f => f.startsWith('00_'))), 'utf8'), /^session: A$/m);
});

test('a number another begin has claimed is skipped', t => {
  const root = repo(t);
  as('A', root, 'begin', 'First', '--files', 'a.py');
  fs.mkdirSync(path.join(root, 'task_list/.ids/01'));
  as('B', root, 'begin', 'Second', '--files', 'b.py');
  assert.deepEqual(openFiles(root).map(f => f.slice(0, 3)).sort(), ['00_', '02_']);
});

test('the cost line counts every session that owned the task and no other', t => {
  const root = repo(t);
  as('A', root, 'begin', 'Long task', '--files', 'a.py');
  as('C', root, 'adopt', '00');
  const project = path.join(HOME, '.claude', 'projects', 'p-' + path.basename(root));
  fs.mkdirSync(project, { recursive: true });
  const usage = { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 9 };
  for (const session of ['A', 'C', 'X']) fs.writeFileSync(path.join(project, session + '.jsonl'), JSON.stringify({ cwd: root }) + '\n'
    + JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { id: 'm-' + session, role: 'assistant', model: 'claude-opus-5-5', usage } }) + '\n');
  const r = as('C', root, 'finish', '--checked', 'no test exists: example');
  assert.equal(r.status, 0, r.stderr);
  assert.match(doneText(root), /Claude tokens 20 \(fresh input 2, cache read 0, output 18; 2 sessions\)/);
});

test('task gate: another session\'s open task neither blocks a write nor uses up the free first file', t => {
  const root = repo(t);
  as('A', root, 'begin', 'E9', '--files', 'a.py');
  assert.match(hook('task-gate.js', root, 'B', write(root, 'a.py')).stderr, /a\.py\) is listed by open task "?00"?, which belongs to another session/,
    'a free first-file edit may not touch another session\'s files');
  fs.writeFileSync(path.join(root, 'a.py'), 'x = 2\n');
  assert.equal(hook('task-gate.js', root, 'B', write(root, 'b.py')).status, 0, 'a.py is A\'s, so b.py is B\'s first code file');
  fs.writeFileSync(path.join(root, 'b.py'), 'y = 2\n');
  assert.equal(hook('task-gate.js', root, 'B', write(root, 'c.py')).status, 2, 'second file of B\'s own needs a task');
  as('B', root, 'begin', 'E10', '--files', 'b.py,c.py');
  assert.equal(hook('task-gate.js', root, 'B', write(root, 'c.py')).status, 0);
  assert.equal(hook('task-gate.js', root, 'A', write(root, 'a.py')).status, 0, 'A keeps writing under its own task');
  const off = hook('task-gate.js', root, 'B', write(root, 'd.py'));
  assert.equal(off.status, 2);
  assert.match(off.stderr, /not in open task "?01"?'s files/);
  as('B', root, 'files', 'add', 'a.py');
  assert.equal(hook('task-gate.js', root, 'B', write(root, 'a.py')).status, 0, 'listed in both tasks once the user agreed');
});

test('task gate: after adopt the old session may not write the task\'s files', t => {
  const root = repo(t);
  as('A', root, 'begin', 'Long task', '--files', 'a.py');
  as('C', root, 'adopt', '00');
  assert.equal(hook('task-gate.js', root, 'A', write(root, 'a.py')).status, 2);
  assert.equal(hook('task-gate.js', root, 'C', write(root, 'a.py')).status, 0);
});

test('stop gate and session note: each session hears about its own task only', t => {
  const root = repo(t);
  as('A', root, 'begin', 'E9 audit fixes', '--files', 'a.py');
  assert.equal(hook('lean-stop-gate.js', root, 'B').status, 0);
  const own = hook('lean-stop-gate.js', root, 'A');
  assert.equal(own.status, 2);
  assert.match(own.stderr, /Task 00 is still open\..*leave it open: that session runs task\.js adopt 00\./);
  const note = JSON.parse(hook('lean-session-note.js', root, 'B').stdout).hookSpecificOutput.additionalContext;
  assert.match(note, /^Open in another session, so do not finish or change: 00 "E9 audit fixes"\. If the user says that session has ended, task\.js adopt <id>/);
  assert.match(JSON.parse(hook('lean-session-note.js', root, 'A').stdout).hookSpecificOutput.additionalContext, /^Open task 00 "E9 audit fixes"/);
});
