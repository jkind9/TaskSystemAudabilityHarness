'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const { builtin } = require(path.join(root, 'tools/dispatch.cjs'));
const { report } = require('../usage.js');

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function git(cwd, args) {
  const child = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  return child.stdout;
}
function repository(t) {
  const base = temp(t);
  const dir = path.join(base, 'repo');
  fs.mkdirSync(dir);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.name', 'Fixture']);
  git(dir, ['config', 'user.email', 'fixture@example.invalid']);
  fs.mkdirSync(path.join(dir, 'task_list/open'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n');
  git(dir, ['add', '.']); git(dir, ['commit', '-qm', 'fixture']);
  return dir;
}
function taskNew(dir, extras) {
  const child = spawnSync(process.execPath, [path.join(root, 'task-system/task.js'), 'new', 'Risky fixture', '--priority', 'HIGH', ...extras], { cwd: dir, encoding: 'utf8' });
  return child;
}

test('new HIGH --worktree cannot skip the PASS review and forced creation is journaled', t => {
  const dir = repository(t);
  const result = taskNew(dir, ['--worktree']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /not started/);
  assert.equal(git(dir, ['worktree', 'list', '--porcelain']).match(/^worktree /gm).length, 1);
  const unreviewed = fs.readFileSync(path.join(dir, 'task_list/open/00_risky_fixture.md'), 'utf8');
  assert.match(unreviewed, /status: open/);
  const forced = taskNew(dir, ['--force']);
  assert.equal(forced.status, 0, forced.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'task_list/.journal.log'), 'utf8'), /force-start 01 without a PASS plan review/);
});

function installFixture(t, style) {
  const dir = temp(t), source = path.join(dir, 'source'), home = path.join(dir, 'home');
  fs.mkdirSync(path.join(source, 'tools'), { recursive: true });
  for (const name of ['install.cjs', 'install-version.cjs']) fs.copyFileSync(path.join(root, 'tools', name), path.join(source, 'tools', name));
  for (const name of ['scripts', 'rules', 'skills', 'commands', 'task-system', 'output-styles', 'agents', 'generated/codex-agents']) fs.mkdirSync(path.join(source, name), { recursive: true });
  fs.writeFileSync(path.join(source, 'output-styles/plain-language.md'), '---\nname: plain-language\n---\nPlain prose.');
  for (const provider of ['claude', 'codex']) fs.mkdirSync(path.join(home, '.' + provider), { recursive: true });
  fs.writeFileSync(path.join(source, 'generated/CLAUDE.md'), 'old Claude bytes');
  fs.writeFileSync(path.join(source, 'generated/INSTRUCTIONS.md'), 'old Codex bytes');
  fs.linkSync(path.join(source, 'generated/INSTRUCTIONS.md'), path.join(home, '.claude/AGENTS.md'));
  fs.linkSync(path.join(source, 'generated/CLAUDE.md'), path.join(home, '.claude/CLAUDE.md'));
  fs.linkSync(path.join(source, 'generated/INSTRUCTIONS.md'), path.join(home, '.codex/AGENTS.md'));
  fs.writeFileSync(path.join(source, 'installation.json'), JSON.stringify({ instructions: [path.join(home, '.claude/CLAUDE.md'), path.join(home, '.codex/AGENTS.md'), path.join(home, '.claude/AGENTS.md')] }));
  fs.writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify({ ...(style ? { outputStyle: style } : {}), ownerSetting: true }));
  fs.writeFileSync(path.join(home, '.codex/config.toml'), 'model = "owner-model"\n');
  for (const provider of ['claude', 'codex']) fs.writeFileSync(path.join(source, 'generated/' + provider + '-hooks.json'), '{"hooks":{}}');
  fs.mkdirSync(path.join(source, 'core'), { recursive: true });
  fs.writeFileSync(path.join(source, 'core/policy.json'), '{"env":{}}');
  // Simulate real render writing through previously installed hardlinks.
  fs.writeFileSync(path.join(source, 'tools/render.cjs'), `const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');module.exports={root,POLICY:'core/policy.json',render(){fs.writeFileSync(path.join(root,'generated/CLAUDE.md'),'new Claude bytes');fs.writeFileSync(path.join(root,'generated/INSTRUCTIONS.md'),'new Codex bytes');return {instructionsSha256:'codex',claudeInstructionsSha256:'claude'};}};`);
  return { source, home, run(destination = path.join(dir, 'installed.json')) {
    const result = spawnSync(process.execPath, [path.join(source, 'tools/install.cjs'), home, destination], { encoding: 'utf8' });
    return { result, destination };
  } };
}

test('upgrade backs up obsolete Claude instructions before render and removes their binding', t => {
  const f = installFixture(t);
  const { result, destination } = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(f.home, '.claude/AGENTS.md')), false);
  const installation = JSON.parse(fs.readFileSync(destination));
  const backup = path.join(installation.backup, '.claude/AGENTS.md');
  assert.equal(fs.readFileSync(backup, 'utf8'), 'old Codex bytes');
  fs.writeFileSync(path.join(f.source, 'generated/INSTRUCTIONS.md'), 'later render');
  assert.equal(fs.readFileSync(backup, 'utf8'), 'old Codex bytes', 'backup must be independent of the old hardlink inode');
});

test('fresh style selection works and existing owner style survives installation', t => {
  for (const style of [undefined, 'owner-style']) {
    const f = installFixture(t, style), { result } = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.home, '.claude/settings.json'))).outputStyle, style || 'plain-language');
  }
});

test('later installation failure restores pre-render hardlinked instruction bytes and settings', t => {
  const f = installFixture(t, 'owner-style');
  const settings = fs.readFileSync(path.join(f.home, '.claude/settings.json'), 'utf8');
  const { result } = f.run(f.home); // writing installation metadata to a directory fails after config writes
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(f.home, '.claude/CLAUDE.md'), 'utf8'), 'old Claude bytes');
  assert.equal(fs.readFileSync(path.join(f.home, '.codex/AGENTS.md'), 'utf8'), 'old Codex bytes');
  assert.equal(fs.readFileSync(path.join(f.home, '.claude/AGENTS.md'), 'utf8'), 'old Codex bytes');
  assert.equal(fs.readFileSync(path.join(f.home, '.claude/settings.json'), 'utf8'), settings);
  assert.equal(fs.readFileSync(path.join(f.home, '.codex/config.toml'), 'utf8'), 'model = "owner-model"\n');
});

test('provider-specific propagation hashes differ legitimately and wrong hashes are refused', () => {
  const { validateHookContexts } = require(path.join(root, 'tools/propagation.cjs'));
  const revision = { claudeInstructionsSha256: 'aaa', instructionsSha256: 'bbb' };
  const contexts = { claude: 'Same behavior.\nShared harness loaded; instructions SHA256 aaa. Source: harness.', codex: 'Same behavior.\nShared harness loaded; instructions SHA256 bbb. Source: harness.' };
  assert.doesNotThrow(() => validateHookContexts(contexts, revision));
  assert.throws(() => validateHookContexts({ ...contexts, claude: contexts.codex }, revision));
  assert.throws(() => validateHookContexts({ ...contexts, claude: contexts.claude.replace('Same behavior', 'Other behavior') }, revision));
});

test('usage excludes another repository and lists unknown origins separately', t => {
  const dir = temp(t), board = path.join(dir, 'task_list'), projects = path.join(dir, 'projects');
  fs.mkdirSync(board); fs.mkdirSync(projects);
  const when = new Date(2026, 9, 9, 10, 0, 0);
  fs.writeFileSync(path.join(board, '.journal.log'), new Date(2026, 9, 9, 9, 0, 0).toLocaleString('sv-SE') + ' start 01\n' + new Date(2026, 9, 9, 11, 0, 0).toLocaleString('sv-SE') + ' move 01 open->pending_review pending_review/01_fixture.md\n');
  function session(project, name, cwd, tokens, subagent = false) {
    const folder = path.join(projects, project, ...(subagent ? [name, 'subagents'] : []));
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, (subagent ? 'agent-a' : name) + '.jsonl'), JSON.stringify({ ...(cwd ? { cwd } : {}), timestamp: when.toISOString(), message: { id: name, role: 'assistant', model: 'test-model', usage: { input_tokens: tokens } } }) + '\n');
  }
  session('this-project', 'ours', dir, 1);
  session('other-project', 'theirs', path.join(dir, 'unrelated'), 1000);
  session('unknown-project', 'unknown', null, 500);
  session('this-project', 'ours', null, 2, true);
  const found = report({ id: '01', board, projects });
  assert.equal(found.total.freshInput, 3);
  assert.equal(found.total.subagentMessages, 1);
  assert.deepEqual(found.sessions.map(s => s.session), ['ours']);
  assert.equal(found.unattributed.length, 1);
  assert.equal(found.unattributed[0].session, 'unknown');
});

test('shell documentation policy respects quotes and blocks combined stream redirects', t => {
  const dir = repository(t);
  const status = command => builtin('bash-documentation-policy', { cwd: dir, tool_input: { command } }).status;
  for (const command of ['echo "tee notes.md"', 'printf "cp source notes.md"', 'echo "x > notes.md"', 'cat "literal>notes.md"']) assert.equal(status(command), 0, command);
  for (const command of ['echo x &> notes.md', 'echo x &>> notes.md', 'echo x > "notes with spaces.md"', 'echo x | tee one.md two.md', 'cp source notes.md']) assert.equal(status(command), 2, command);
  assert.equal(status('echo x 2>&1'), 0);
});

test('quoted Windows backslashes preserve README allowance and loose-document refusal', { skip: process.platform !== 'win32' }, t => {
  const dir = repository(t);
  const status = command => builtin('bash-documentation-policy', { cwd: dir, tool_input: { command } }).status;
  assert.equal(status('echo x > "' + path.join(dir, 'README.md') + '"'), 0);
  assert.equal(status('echo x > "' + path.join(dir, 'notes.md') + '"'), 2);
});

test('new and start worktree activation open usage windows on the worktree board only', t => {
  for (const mode of ['new', 'start']) {
    const dir = repository(t);
    if (mode === 'start') fs.writeFileSync(path.join(dir, 'task_list/open/00_risky_fixture.md'), '---\nid: "00"\nstatus: open\npriority: MED\n---\n\n## In plain English\nA fixture.\n');
    const result = mode === 'new' ? taskNew(dir, ['--force', '--worktree']) : spawnSync(process.execPath, [path.join(root, 'task-system/task.js'), 'start', '00', '--worktree'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const wt = path.join(path.dirname(dir), 'repo.worktrees/task-00');
    const board = path.join(wt, 'task_list');
    assert.match(fs.readFileSync(path.join(board, '.journal.log'), 'utf8'), /^\d{4}-.* start 00$/m);
    const primary = path.join(dir, 'task_list/.journal.log');
    assert.doesNotMatch(fs.existsSync(primary) ? fs.readFileSync(primary, 'utf8') : '', /^\d{4}-.*\sstart 00$/m);
    const projects = path.join(dir, 'fixture-transcripts');
    fs.mkdirSync(path.join(projects, 'worktree'), { recursive: true });
    fs.writeFileSync(path.join(projects, 'worktree/session.jsonl'), JSON.stringify({ cwd: wt, timestamp: new Date().toISOString(), message: { id: 'worktree-check', role: 'assistant', model: 'fixture', usage: { input_tokens: 1 } } }));
    const found = report({ id: '00', board, projects });
    assert.equal(found.windows.length, 1);
    assert.equal(found.total.freshInput, 1);
  }
});

test('literal directory copy and move targets are checked by resulting basename', t => {
  const dir = repository(t);
  fs.mkdirSync(path.join(dir, 'out'));
  const status = command => builtin('bash-documentation-policy', { cwd: dir, tool_input: { command } }).status;
  for (const name of ['cp', 'mv', 'Copy-Item', 'Move-Item']) {
    assert.equal(status(name + ' ../guide.md out/'), 2, name + ' must check out/guide.md');
    assert.equal(status(name + ' ../README.md out/'), 0, name + ' must allow out/README.md');
    assert.equal(status(name + ' ../README.md ../guide.md out/'), 2, name + ' must check every source');
    assert.equal(status(name + ' ../README.md ../CLAUDE.md out/'), 0, name + ' allowed sources');
  }
});
