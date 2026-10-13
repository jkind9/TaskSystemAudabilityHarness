'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const harness = path.resolve(__dirname, '../..');
const hook = path.join(harness, 'scripts/hooks/session-end.js');

function fixture(t, convention = 'task_list') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-handoff-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  const sessions = path.join(dir, 'sessions');
  const board = path.join(dir, convention);
  const preload = path.join(dir, 'preload.cjs');
  fs.writeFileSync(preload, `const u = require(${JSON.stringify(path.join(harness, 'scripts/lib/utils.js'))});
u.getSessionsDir = () => ${JSON.stringify(sessions)};
u.getDateString = () => '2026-10-09';
u.getTimeString = () => '10:00';
u.getSessionIdShort = () => 'handoff';`);
  function task(id, status = 'in_progress', current = '- Next action: run the tests.\n- Open decisions: none recorded.', folder = 'open') {
    const file = path.join(board, folder, `${id}_fixture.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\nid: "${id}"\ntitle: Fixture task\nstatus: ${status}\nlast_updated: 2026-10-09\n---\n\n## Current state\n\n${current}\n\n## What\n\nShould not appear in the handoff.\n`);
    return file;
  }
  const transcript = path.join(dir, 'transcript.jsonl');
  const session = path.join(sessions, '2026-10-09-handoff-session.tmp');
  function run(entries) {
    if (entries) fs.writeFileSync(transcript, entries.map(e => typeof e === 'string' ? e : JSON.stringify(e)).join('\n'));
    const child = spawnSync(process.execPath, ['--require', preload, hook], {
      cwd: dir, input: JSON.stringify({ transcript_path: transcript }), encoding: 'utf8'
    });
    assert.equal(child.status, 0, child.stderr);
    return fs.readFileSync(session, 'utf8');
  }
  return { dir, board, session, transcript, preload, task, run };
}
const user = text => ({ type: 'user', message: { role: 'user', content: text } });
const call = (id, command) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } });
const outcome = (id, content) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } });

test('active task state and paired failed check appear; notifications never become intent', t => {
  const f = fixture(t);
  f.task('06');
  const output = f.run([user('Continue the handoff work.'), user('<task-notification>background monitor</task-notification>'),
    user('<system-reminder>hook status</system-reminder>'), call('c1', 'node --test tests/handoff.js'),
    outcome('c1', 'Tests failed\nExit code: 1'), call('c2', 'git status --short'), outcome('c2', 'Exit code: 0'), '{bad json']);
  assert.match(output, /### Task handoff/);
  assert.match(output, /Task: 06.*in_progress/);
  assert.match(output, /Next action: run the tests/);
  assert.match(output, /Open decisions: none recorded/);
  assert.match(output, /node --test tests\/handoff.js/);
  assert.match(output, /Exit code: 1/);
  assert.doesNotMatch(output, /background monitor|hook status|task-notification|Should not appear/);
});

test('checks without a recorded exit remain unknown and never inherit another result', t => {
  const f = fixture(t);
  f.task('06');
  const output = f.run([user('Resume.'), call('c1', 'pytest tests/first.py'), outcome('c1', 'Exit code: 0'),
    call('c2', 'node tools/validate.cjs'), outcome('unrelated', 'Exit code: 0')]);
  assert.match(output, /Command: node tools\/validate.cjs/);
  assert.match(output, /Exit code: none recorded/);
});

test('Codex direct shell call and output capture command plus actual exit code', t => {
  const f = fixture(t);
  f.task('06');
  const output = f.run([
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Continue Codex work.' }] } },
    { type: 'response_item', payload: { type: 'function_call', call_id: 'cx', name: 'exec_command', arguments: JSON.stringify({ cmd: 'node --test test.js' }) } },
    { type: 'response_item', payload: { type: 'function_call_output', call_id: 'cx', output: 'Process exited with code 2\nOutput:\nfailed' } }
  ]);
  assert.match(output, /Continue Codex work/);
  assert.match(output, /Command: node --test test.js/);
  assert.match(output, /Exit code: 2/);
});

test('Codex functions.exec wrapped shell call supports structured command results', t => {
  const f = fixture(t);
  const output = f.run([
    { type: 'response_item', payload: { type: 'function_call', call_id: 'cx', name: 'functions.exec', arguments: 'text(await tools.exec_command({cmd:"node --test test.js",max_output_tokens:1000}));' } },
    { type: 'response_item', payload: { type: 'function_call_output', call_id: 'cx', output: JSON.stringify({ exit_code: 0, output: 'passed' }) } }
  ]);
  assert.match(output, /Command: node --test test.js/);
  assert.match(output, /Exit code: 0/);
});

test('no task or transcript produces explicit none and no placeholders', t => {
  const f = fixture(t);
  const output = f.run([]);
  assert.match(output, /Task: none recorded/);
  assert.match(output, /Current state: none recorded/);
  assert.match(output, /Command: none recorded/);
  assert.match(output, /Exit code: none recorded/);
  assert.doesNotMatch(output, /\[relevant files\]|\[Session context goes here\]|- \[ \]/);
});

test('most recently moved task wins over unrelated newer file mtime', t => {
  const f = fixture(t, 'docs/tasks');
  f.task('06', 'pending_review', '- Waiting for checkpoint.', 'pending_review');
  f.task('07', 'closed', '- Completed something else.', 'closed');
  fs.writeFileSync(path.join(f.board, '.journal.log'), '2026-10-09 10:00:00 move 06 open->pending_review pending_review/06_fixture.md\n');
  const output = f.run([user('Continue.')]);
  assert.match(output, /Task: 06.*pending_review/);
  assert.match(output, /Waiting for checkpoint/);
  assert.doesNotMatch(output, /Completed something else/);
});

test('multiple active tasks report ambiguity and do not invent a selected task', t => {
  const f = fixture(t);
  f.task('06');
  f.task('07');
  const output = f.run([user('Continue.')]);
  assert.match(output, /multiple in_progress tasks/);
  assert.match(output, /Current state: none recorded/);
});

test('repeated Stop updates generated state but preserves human notes byte for byte', t => {
  const f = fixture(t);
  f.task('06');
  f.run([user('Continue.')]);
  const notes = '\n\n### My notes\nKeep this exact spacing.  \n\n### Notes for Next Session\nAsk Sam about timing.\n';
  fs.appendFileSync(f.session, notes);
  f.task('06', 'in_progress', '- Next action: review failures.');
  const first = f.run();
  const second = f.run();
  assert.equal(first, second);
  assert.ok(second.endsWith(notes));
  assert.match(second, /review failures/);
  assert.doesNotMatch(second, /run the tests/);
  assert.equal((second.match(/ECC:SUMMARY:START/g) || []).length, 1);
});

test('legacy summaries retain the human tail during generated-block migration', t => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.session), { recursive: true });
  const tail = '### Notes for Next Session\nA human reminder.\n\n### Context to Load\nSome real context.\n';
  fs.writeFileSync(f.session, '# Session: 2026-10-09\n\n---\n## Session Summary\n\n### Tasks\n- old\n\n' + tail);
  const output = f.run([user('Resume.')]);
  assert.ok(output.endsWith(tail));
  assert.match(output, /Task: none recorded/);
});

test('Claude structured result metadata records zero but unreported success stays unknown', t => {
  const f = fixture(t);
  const explicit = outcome('c1', 'All checks passed');
  explicit.toolUseResult = { stdout: 'All checks passed', exitCode: 0 };
  assert.match(f.run([call('c1', 'pytest tests/first.py'), explicit]), /Exit code: 0/);
  assert.match(f.run([call('c1', 'pytest tests/first.py'), outcome('c1', 'All checks passed')]), /Exit code: none recorded/);
});

test('ambiguous wrapped commands cannot claim the wrapper result as their own exit', t => {
  const f = fixture(t);
  const output = f.run([
    { type: 'response_item', payload: { type: 'function_call', call_id: 'cx', name: 'functions.exec', arguments: 'await Promise.all([tools.exec_command({cmd:"node --test first.js"}), tools.exec_command({cmd:"node --test second.js"})]);' } },
    { type: 'response_item', payload: { type: 'function_call_output', call_id: 'cx', output: JSON.stringify({ exit_code: 0 }) } }
  ]);
  assert.match(output, /Command: node --test second.js/);
  assert.match(output, /Exit code: none recorded/);
});

test('fallback inactive task without Current state stays explicit; mixed notifications are stripped', t => {
  const f = fixture(t);
  const file = f.task('09', 'closed', '', 'closed');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Current state', '## Another heading'));
  const output = f.run([user('Please resume. <task-notification>machine notice</task-notification>')]);
  assert.match(output, /Task: 09.*closed/);
  assert.match(output, /Current state: none recorded/);
  assert.match(output, /Please resume/);
  assert.doesNotMatch(output, /machine notice/);
});

test('human text containing dollar replacement tokens stays literal on repeated Stop', t => {
  const f = fixture(t);
  const entries = [user('Keep $& literal and keep $` literal.')];
  const first = f.run(entries);
  const second = f.run(entries);
  assert.equal(first, second);
  assert.match(second, /Keep \$& literal/);
});

test('failed atomic replacement preserves the prior session and human notes', t => {
  const f = fixture(t);
  f.run([user('Continue.')]);
  fs.appendFileSync(f.session, '\n### Personal notes\nKeep this note.\n');
  const before = fs.readFileSync(f.session, 'utf8');
  fs.appendFileSync(f.preload, '\nrequire("fs").renameSync = () => { throw new Error("injected rename failure"); };\n');
  assert.equal(f.run([user('New intent.')]), before);
  assert.deepEqual(fs.readdirSync(path.dirname(f.session)), [path.basename(f.session)]);
});

test('actual Codex custom exec call and output record the observed check', t => {
  const f = fixture(t);
  const output = f.run([
    { type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'cx', name: 'exec', input: 'text(await tools.exec_command({cmd:"node --test actual.js"}));' } },
    { type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'cx', output: JSON.stringify({ exit_code: 1, output: 'failed' }) } }
  ]);
  assert.match(output, /Command: node --test actual.js/);
  assert.match(output, /Exit code: 1/);
});

// Real Codex records carry an item id (ctc_...) and a separate call_id; outputs link by call_id.
test('real-shaped Codex record with item id and call_id pairs a *.test.js run with its exit', t => {
  const f = fixture(t);
  const output = f.run([
    { type: 'response_item', payload: { type: 'custom_tool_call', id: 'ctc_item', call_id: 'call_x', name: 'exec', input: 'const r = await tools.exec_command({"cmd": "node test/clamp.test.js", workdir: "."}); text(JSON.stringify({exit_code: r.exit_code}));' } },
    { type: 'response_item', payload: { type: 'custom_tool_call_output', id: 'ctco_item', call_id: 'call_x', output: [
      { type: 'input_text', text: 'Script completed\nWall time 1.2 seconds\nOutput:\n' }, { type: 'input_text', text: JSON.stringify({ exit_code: 0 }) }
    ] } }
  ]);
  assert.match(output, /Command: node test\/clamp.test.js/);
  assert.match(output, /Exit code: 0/);
});

// Claude Code reports a non-zero exit as "Exit code N" with is_error; a clean finish has neither.
const claudeResult = (id, content, isError, toolUseResult) => ({ type: 'user', toolUseResult,
  message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
test('Claude Bash result that finished cleanly in the foreground records exit 0', t => {
  const f = fixture(t);
  const clean = { stdout: '# pass 1', stderr: '', interrupted: false, isImage: false, noOutputExpected: false };
  assert.match(f.run([call('c1', 'node test/sum.test.js'), claudeResult('c1', '# pass 1', false, clean)]), /Exit code: 0/);
  assert.match(f.run([call('c1', 'node test/sum.test.js'), claudeResult('c1', 'Exit code 1\n# fail 1', true, 'Error: Exit code 1\n# fail 1')]), /Exit code: 1/);
  for (const notFinished of [{ ...clean, interrupted: true }, { ...clean, backgroundTaskId: 'b1' }]) {
    assert.match(f.run([call('c1', 'node test/sum.test.js'), claudeResult('c1', '', false, notFinished)]), /Exit code: none recorded/);
  }
  assert.match(f.run([call('c1', 'node test/sum.test.js'), claudeResult('c1', '# pass 1', undefined, undefined)]), /Exit code: none recorded/);
});

test('Claude PowerShell tool calls are read as shell checks', t => {
  const f = fixture(t);
  const ps = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'p1', name: 'PowerShell', input: { command: 'node test/sum.test.js' } }] } };
  const output = f.run([ps, claudeResult('p1', '# pass 1', false, { stdout: '# pass 1', stderr: '', interrupted: false })]);
  assert.match(output, /Command: node test\/sum.test.js/);
  assert.match(output, /Exit code: 0/);
});

test('common test-file and test-runner names count as checks; ordinary scripts do not', t => {
  const f = fixture(t);
  for (const command of ['node tests/foo.spec.ts', 'python tests/x_test.py', 'go test ./...', 'cargo test']) {
    assert.match(f.run([call('c1', command), outcome('c1', 'Exit code: 3')]), /Exit code: 3/, command);
  }
  for (const command of ['node src/app.js', 'node contest.js', 'cat test/notes.txt']) {
    assert.match(f.run([call('c1', command), outcome('c1', 'Exit code: 3')]), /Command: none recorded/, command);
  }
});

test('owned legacy placeholder is removed so SessionStart accepts a useful handoff', t => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.session), { recursive: true });
  fs.writeFileSync(f.session, '# Session: 2026-10-09\n\n---\n## Current State\n\n[Session context goes here]\n\n### Notes for Next Session\nKeep this human note.\n');
  const output = f.run([user('Resume useful work.')]);
  assert.doesNotMatch(output, /\[Session context goes here\]/);
  assert.match(output, /Keep this human note/);
  assert.match(output, /Resume useful work/);
});

test('actual Codex output text-item envelopes and settled values preserve observed exits', t => {
  const f = fixture(t);
  const invocation = { type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'cx', name: 'exec', input: 'text(await tools.exec_command({cmd:"node --test envelope.js"}));' } };
  for (const value of [
    { chunk_id: 'fixture', wall_time_seconds: 1, exit_code: 2, output: 'failed' },
    { status: 'fulfilled', value: { exit_code: 2, output: 'failed' } }
  ]) {
    const output = f.run([invocation, { type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'cx', output: [
      { type: 'input_text', text: 'Script completed' }, { type: 'input_text', text: JSON.stringify(value) }
    ] } }]);
    assert.match(output, /Command: node --test envelope.js/);
    assert.match(output, /Exit code: 2/);
  }
  const unknown = f.run([invocation, { type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'cx', output: [
    { type: 'input_text', text: JSON.stringify({ status: 'fulfilled', value: { output: 'completed' } }) }
  ] } }]);
  assert.match(unknown, /Exit code: none recorded/);
});
