// usage.js tests: token totals for a task come from Claude transcripts inside the task's journal
// windows, count each message once, include subagents, and list sessions separately.
// Run: node --test task-system/tests/test_usage.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE = path.resolve(__dirname, '..', 'usage.js');

// Journal times are local; transcript timestamps are ISO UTC. Build both from the same Date.
const at = (h, m) => new Date(2026, 9, 9, h, m, 0);
const local = d => d.toLocaleString('sv-SE');
function message(id, when, model, usage) {
  return JSON.stringify({ type: 'assistant', timestamp: when.toISOString(), message: { id, role: 'assistant', model, usage } });
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'));
  const board = path.join(dir, 'task_list');
  fs.mkdirSync(board);
  fs.writeFileSync(path.join(board, '.journal.log'), [
    local(at(9, 0)) + ' start 07',
    local(at(10, 0)) + ' start 08',            // starting another task closes 07's window
    local(at(11, 0)) + ' start 07',
    local(at(11, 30)) + ' move 07 open->pending_review pending_review/07_x.md',
  ].join('\n') + '\n');
  const project = path.join(dir, 'projects', 'p1');
  fs.mkdirSync(path.join(project, 'sessA', 'subagents'), { recursive: true });
  const u = (i, c, r, o) => ({ input_tokens: i, cache_creation_input_tokens: c, cache_read_input_tokens: r, output_tokens: o });
  fs.writeFileSync(path.join(project, 'sessA.jsonl'), [
    JSON.stringify({ cwd: dir }),
    message('m1', at(9, 5), 'claude-opus-5-5', u(1, 10, 100, 5)),     // streamed twice: count the last record once
    message('m1', at(9, 5), 'claude-opus-5-5', u(1, 10, 100, 7)),
    message('m2', at(10, 30), 'claude-opus-5-5', u(1, 1, 1000, 1)),   // inside task 08's window: excluded
    message('m3', at(11, 10), 'claude-sonnet-5-5', u(2, 20, 200, 3)),
    JSON.stringify({ type: 'user', timestamp: at(9, 6).toISOString(), message: { role: 'user', content: 'hi' } }),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(project, 'sessA', 'subagents', 'agent-x.jsonl'),
    message('s1', at(9, 20), 'claude-sonnet-5-5', u(0, 50, 500, 2)) + '\n');
  fs.writeFileSync(path.join(project, 'sessB.jsonl'), JSON.stringify({ cwd: dir }) + '\n' +
    message('b1', at(11, 15), 'claude-opus-5-5', u(4, 0, 40, 1)) + '\n');
  return { board, projects: path.join(dir, 'projects') };
}

function run(args) {
  const r = spawnSync(process.execPath, [USAGE, ...args], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('totals count each message once, include subagents and exclude other tasks\' windows', () => {
  const { board, projects } = fixture();
  const report = run(['07', '--board', board, '--projects', projects, '--json']);
  assert.strictEqual(report.windows.length, 2);
  const a = report.sessions.find(s => s.session === 'sessA');
  assert.deepStrictEqual(
    { messages: a.messages, fresh: a.freshInput, cacheRead: a.cacheRead, output: a.output, subagentMessages: a.subagentMessages },
    { messages: 3, fresh: (1 + 10) + (2 + 20) + (0 + 50), cacheRead: 100 + 200 + 500, output: 7 + 3 + 2, subagentMessages: 1 });
  assert.deepStrictEqual(a.models, { 'claude-opus-5-5': 1, 'claude-sonnet-5-5': 2 });
});

test('concurrent sessions in the same window are listed separately, and --session selects one', () => {
  const { board, projects } = fixture();
  const all = run(['07', '--board', board, '--projects', projects, '--json']);
  assert.deepStrictEqual(all.sessions.map(s => s.session).sort(), ['sessA', 'sessB']);
  const one = run(['07', '--board', board, '--projects', projects, '--session', 'sessB', '--json']);
  assert.deepStrictEqual(one.sessions.map(s => s.session), ['sessB']);
  assert.strictEqual(one.total.messages, 1);
});

test('v2 begin and finish lines make a window', () => {
  const { board, projects } = fixture();
  fs.writeFileSync(path.join(board, '.journal.log'), [
    local(at(9, 0)) + ' begin 07 open/07_x.md',
    local(at(9, 30)) + ' files add 07 b.py',     // not a window boundary
    local(at(10, 0)) + ' finish 07 done/07_x.md',
  ].join('\n') + '\n');
  const report = run(['07', '--board', board, '--projects', projects, '--json']);
  assert.strictEqual(report.windows.length, 1);
  const a = report.sessions.find(s => s.session === 'sessA');
  assert.strictEqual(a.messages, 2, 'm1 and the 09:20 subagent message; m2 at 10:30 is after finish');
});

test('a task that never started reports no windows instead of guessing', () => {
  const { board, projects } = fixture();
  const report = run(['99', '--board', board, '--projects', projects, '--json']);
  assert.strictEqual(report.windows.length, 0);
  assert.strictEqual(report.total.messages, 0);
});
