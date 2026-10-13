'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { root, render, hash } = require('./render.cjs');
const { editsFromPatch } = require('./patch.cjs');
const { inputsFor } = require('./dispatch.cjs');
const results = [];
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-harness-test-'));
function check(name, fn) { fn(); results.push({ name, pass: true }); }
function write(relative, text) { const f = path.join(fixture, relative); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
function run(provider, event, tool_name, tool_input, extra = {}) {
  // Session ids are unique per validator run, so per-session dispatcher state never carries over.
  return spawnSync(process.execPath, [path.join(root, 'tools/dispatch.cjs'), provider, event], { input: JSON.stringify({ cwd: fixture, session_id: 'harness-validation-' + provider + '-' + path.basename(fixture), hook_event_name: event, tool_name, tool_input, ...extra }), encoding: 'utf8', cwd: fixture, timeout: 60000, windowsHide: true });
}
const hookLines = text => text.split('\n').filter(l => l.startsWith('[Hook]')).join('\n');
// Codex ignores exit 2 (probed on 0.162.0-alpha.17.2); it only enforces a refusal sent as stdout JSON.
function codexRefusal(result, event) {
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  const reason = event === 'Stop' ? (assert.equal(out.decision, 'block'), out.reason) :
    (assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse'), assert.equal(out.hookSpecificOutput.permissionDecision, 'deny'), out.hookSpecificOutput.permissionDecisionReason);
  assert(reason && reason.trim(), 'Codex refusal needs a non-empty reason');
  return reason;
}
function sameDecision(name, event, claudeInput, codexInput, expected) {
  check(name, () => {
    const a = run('claude', event, claudeInput.tool_name, claudeInput.tool_input);
    const b = run('codex', event, codexInput.tool_name, codexInput.tool_input);
    assert.equal(a.status, expected, a.stderr);
    if (expected === 2) assert.equal(hookLines(codexRefusal(b, event)), hookLines(a.stderr));
    if (expected === 0) { assert.equal(b.status, 0, b.stderr); assert.doesNotThrow(() => JSON.parse(a.stdout)); assert.doesNotThrow(() => JSON.parse(b.stdout)); }
  });
}
try {
  const revision = render();
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'core', 'policy.json'), 'utf8'));
  check('All hook scripts and nested targets exist and JavaScript parses', () => {
    const targets = new Set();
    for (const hook of policy.hooks) {
      assert(!hook.matcher?.includes('tool =='));
      for (const arg of hook.args || []) if (/^scripts\/.*\.(js|sh)$/.test(arg)) targets.add(arg);
    }
    for (const relative of targets) {
      const file = path.join(root, relative); assert(fs.existsSync(file), relative);
      if (file.endsWith('.js')) { const p = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true }); assert.equal(p.status, 0, p.stderr); }
    }
  });
  check('v2 policy: exactly the five core hooks, scripts exist and parse, instructions at most 100 lines', () => {
    const lean = JSON.parse(fs.readFileSync(path.join(root, 'core/policy.json'), 'utf8'));
    assert.deepEqual(lean.hooks.map(h => h.id), ['task-gate', 'file-size-gate', 'lean-stop-gate', 'docs-snapshot', 'lean-session-note']);
    assert.equal(lean.env.ECC_TASK_FLOW, 'lean');
    for (const hook of lean.hooks) {
      const p = spawnSync(process.execPath, ['--check', path.join(root, hook.args[1])], { encoding: 'utf8', windowsHide: true });
      assert.equal(p.status, 0, hook.args[1] + ': ' + p.stderr);
    }
    assert(fs.readFileSync(path.join(root, 'core/AGENTS.md'), 'utf8').trimEnd().split('\n').length <= 100, 'core/AGENTS.md over 100 lines');
    assert(fs.readFileSync(path.join(root, 'core/task-template.md'), 'utf8').trimEnd().split('\n').length <= 32, 'task template over about 30 lines');
  });
  check('Native hook adapters have identical event registrations', () => {
    const a = JSON.parse(fs.readFileSync(path.join(root, 'generated/claude-hooks.json')));
    const b = JSON.parse(fs.readFileSync(path.join(root, 'generated/codex-hooks.json')));
    assert.deepEqual(Object.keys(a.hooks), Object.keys(b.hooks));
    for (const [provider, config] of [['claude', a], ['codex', b]]) for (const groups of Object.values(config.hooks)) for (const group of groups) for (const handler of group.hooks) handler.command = handler.command.replace(' ' + provider + ' ', ' PROVIDER ');
    assert.deepEqual(a, b);
  });
  check('Codex agent instructions equal their Claude source bodies', () => {
    for (const name of fs.readdirSync(path.join(root, 'agents')).filter(n => n.endsWith('.md'))) {
      const raw = fs.readFileSync(path.join(root, 'agents', name), 'utf8').replace(/\r\n/g, '\n');
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
      const toml = fs.readFileSync(path.join(root, 'generated/codex-agents', name.replace('.md', '.toml')), 'utf8');
      assert.equal(JSON.parse(toml.match(/^developer_instructions = (.+)$/m)[1]), body);
    }
  });
  const git = (...args) => { const p = spawnSync('git', args, { cwd: fixture, encoding: 'utf8', windowsHide: true }); assert.equal(p.status, 0, p.stderr); };
  git('init'); write('README.md', 'fixture\n'); git('add', 'README.md'); git('-c', 'user.name=Harness Test', '-c', 'user.email=harness-test@example.invalid', 'commit', '-m', 'fixture');
  write('first.js', 'module.exports = 1;\n');
  const edit = { tool_name: 'Write', tool_input: { file_path: path.join(fixture, 'second.js'), content: 'module.exports = 2;\n' } };
  const patch = { tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Add File: second.js\n+module.exports = 2;\n*** End Patch' } };
  sameDecision('Task scope denies a second code file with no active task in both runtimes', 'PreToolUse', edit, patch, 2);
  write('task_list/open/1-harness.md', '---\nid: 1\nstatus: in_progress\nfiles:\n  - second.js\ndocs: []\n---\n# Test\n\n## Receipts\n\n(fill in)\n');
  sameDecision('Task scope allows the declared file in both runtimes', 'PreToolUse', edit, patch, 0);
  check('A Codex patch the checker cannot rebuild is allowed when declared and refused by scope when not', () => {
    const stale = file => ({ command: '*** Begin Patch\n*** Update File: ' + file + '\n@@\n-no such line\n+x\n*** End Patch' });
    const allowed = run('codex', 'PreToolUse', 'apply_patch', stale('second.js'));
    assert.equal(allowed.status, 0, allowed.stderr); assert.doesNotMatch(allowed.stdout, /deny/);
    assert.match(codexRefusal(run('codex', 'PreToolUse', 'apply_patch', stale('third.js')), 'PreToolUse'), /TASK GATE/);
  });
  sameDecision('An open task refuses the end of a session in both runtimes', 'Stop', { tool_name: '', tool_input: {} }, { tool_name: '', tool_input: {} }, 2);
  check('End-of-session gate refuses once, then allows the next stop in the same session, both runtimes', () => {
    for (const provider of ['claude', 'codex']) {
      const session = { session_id: 'stop-cap-' + provider + '-' + path.basename(fixture) };
      const refused = result => provider === 'claude' ? result.status === 2 : result.status === 0 && /"decision":"block"/.test(result.stdout);
      const outcomes = [1, 2, 3, 4, 5].map(() => refused(run(provider, 'Stop', '', {}, session)));
      assert.deepEqual(outcomes, [true, false, true, false, true], provider + ': refuse once, allow the 2nd, then a new count');
    }
  });
  write('task_list/open/1-harness.md', '---\nid: 1\nstatus: in_progress\nfiles:\n  - huge.js\ndocs: []\n---\n# Test\n');
  const huge = 'module.exports = 1;\n'.repeat(802);
  sameDecision('File-size gate denies oversized new files in both runtimes', 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(fixture, 'huge.js'), content: huge } }, { tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Add File: huge.js\n' + huge.trimEnd().split('\n').map(l => '+' + l).join('\n') + '\n*** End Patch' } }, 2);
  check('Multi-file patch cannot use the single-file task escape', () => {
    const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-multi-'));
    const p = spawnSync('git', ['init', clean], { encoding: 'utf8', windowsHide: true }); assert.equal(p.status, 0);
    const result = spawnSync(process.execPath, [path.join(root, 'tools/dispatch.cjs'), 'codex', 'PreToolUse'], { input: JSON.stringify({ cwd: clean, tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Add File: one.js\n+x\n*** Add File: two.js\n+y\n*** End Patch' } }), encoding: 'utf8', windowsHide: true });
    codexRefusal(result, 'PreToolUse');
  });
  check('A repository nested in a folder with its own board leaves that board untouched', () => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-nested-'));
    const outerTask = path.join(outer, 'task_list/open/01_outer.md');
    fs.mkdirSync(path.dirname(outerTask), { recursive: true });
    fs.writeFileSync(outerTask, '---\nid: "01"\nstatus: in_progress\nfiles:\n  - repo/**\n---\n# Outer\n');
    const inner = path.join(outer, 'repo');
    assert.equal(spawnSync('git', ['init', '-q', inner], { encoding: 'utf8', windowsHide: true }).status, 0);
    fs.writeFileSync(path.join(inner, 'one.js'), '1\n');
    const before = fs.readdirSync(path.join(outer, 'task_list'), { recursive: true }).join('|') + fs.readFileSync(outerTask, 'utf8');
    // The task gate must not count the outer folder's in_progress task for the inner repository.
    const gate = spawnSync(process.execPath, [path.join(root, 'tools/dispatch.cjs'), 'claude', 'PreToolUse'], { input: JSON.stringify({ cwd: inner, tool_name: 'Write', tool_input: { file_path: path.join(inner, 'two.js'), content: '2\n' } }), encoding: 'utf8', cwd: inner, windowsHide: true });
    assert.equal(gate.status, 2, 'second code file with no task in the inner repository is refused');
    const made = spawnSync(process.execPath, [path.join(root, 'task-system/task.js'), 'new', 'Inner task', '--files', 'two.js'], { cwd: inner, encoding: 'utf8', windowsHide: true, env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });
    assert.equal(made.status, 0, made.stderr);
    assert(fs.existsSync(path.join(inner, 'task_list/open')), 'board created at the inner repository top');
    assert.equal(fs.readdirSync(path.join(outer, 'task_list'), { recursive: true }).join('|') + fs.readFileSync(outerTask, 'utf8'), before);
  });
  // v2 wires no shell hook (v1's documentation policy is not installed), so shell writes pass alike.
  check('Claude PowerShell tool writes pass like Bash under v2', () => {
    assert.equal(run('claude', 'PreToolUse', 'PowerShell', { command: 'echo hello > notes.md' }).status, 0);
    assert.equal(run('claude', 'PreToolUse', 'Bash', { command: 'echo hello > notes.md' }).status, 0);
  });
  check('Patch update reconstruction checks resulting content', () => {
    write('update.js', 'const a = 1;\nconst b = 2;\n');
    const edits = editsFromPatch('*** Begin Patch\n*** Update File: update.js\n@@\n const a = 1;\n-const b = 2;\n+const b = 3;\n*** End Patch', fixture);
    assert.equal(edits[0].tool_input.content, 'const a = 1;\nconst b = 3;\n');
  });
  check('Patch matching uses full lines, EOF and insertion-only hunks', () => {
    for (const [old, body, expected] of [
      ['abc\nbc\n', '@@\n-bc\n+ZZ', 'abc\nZZ\n'],
      ['same\nmiddle\nsame\n', '@@\n-same\n+changed\n*** End of File', 'same\nmiddle\nchanged\n'],
      ['first\n', '@@\n+last', 'first\nlast\n'],
      ['  first  \n', '@@\n-first\n+last', 'last\n'],
    ]) { write('match.js', old); assert.equal(editsFromPatch('*** Begin Patch\n*** Update File: match.js\n' + body + '\n*** End Patch', fixture)[0].tool_input.content, expected); }
  });
  check('Codex shell inputs normalize to the same Bash hook input', () => {
    const input = inputsFor({ tool_name: 'exec_command', tool_input: { cmd: 'echo hello' }, cwd: fixture })[0];
    assert.equal(input.tool_name, 'Bash'); assert.equal(input.tool_input.command, 'echo hello');
  });
  sameDecision('Shell writes pass in both runtimes under v2', 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'echo x > notes.md' } }, { tool_name: 'exec_command', tool_input: { cmd: 'echo x > notes.md' } }, 0);
  check('Post-edit rename inspection includes the destination', () => {
    write('destination.js', 'new\n');
    const list = inputsFor({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch', cwd: fixture, tool_input: { command: '*** Begin Patch\n*** Update File: origin.js\n*** Move to: destination.js\n@@\n-old\n+new\n*** End Patch' } });
    assert.equal(list.find(i => i.tool_input.file_path.endsWith('destination.js')).tool_input.content, 'new\n');
  });
  check('Fresh-home install failure rolls back new bindings', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-install-'));
    fs.mkdirSync(path.join(home, '.claude')); fs.writeFileSync(path.join(home, '.claude/settings.json'), '{ invalid');
    const result = spawnSync(process.execPath, [path.join(root, 'tools/install.cjs'), home, path.join(home, 'install.json')], { encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0);
    for (const provider of ['claude', 'codex']) for (const dir of ['skills', 'rules', 'scripts', 'agents', 'task-system']) assert(!fs.existsSync(path.join(home, '.' + provider, dir)), provider + '/' + dir);
    assert.equal(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'), '{ invalid');
  });
  check('Root Codex document limit replaces a final key without a newline', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-config-'));
    fs.mkdirSync(path.join(home, '.codex')); fs.writeFileSync(path.join(home, '.codex/config.toml'), 'project_doc_max_bytes = 32768');
    const result = spawnSync(process.execPath, [path.join(root, 'tools/install.cjs'), home, path.join(home, 'install.json')], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const config = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
    assert.equal((config.match(/project_doc_max_bytes/g) || []).length, 1); assert.match(config, /131072/);
  });
  check('Unsupported patches fail visibly', () => {
    const p = run('codex', 'PreToolUse', 'apply_patch', { command: 'unrecognised format' }); assert.match(codexRefusal(p, 'PreToolUse'), /Unsupported patch/);
  });
  const installationFile = path.join(root, 'installation.json');
  if (fs.existsSync(installationFile)) {
    const install = JSON.parse(fs.readFileSync(installationFile));
    check('Installed global instructions are byte-identical to their generated source', () => {
      const { isClaudeInstructionFile } = require('./render.cjs');
      for (const file of install.instructions) {
        const generated = isClaudeInstructionFile(file) ? 'generated/CLAUDE.md' : 'generated/INSTRUCTIONS.md';
        assert(fs.readFileSync(file).equals(fs.readFileSync(path.join(root, generated))), file);
      }
      assert(!fs.existsSync(path.join(install.home, '.claude', 'AGENTS.md')), 'duplicate ~/.claude/AGENTS.md');
    });
    check('Both homes resolve shared skills, scripts, commands and task system to one directory; only Codex links rules', () => {
      for (const dir of ['skills', 'scripts', 'commands', 'task-system']) for (const provider of ['claude', 'codex']) assert.equal(fs.realpathSync(path.join(install.home, '.' + provider, dir)).toLowerCase(), fs.realpathSync(path.join(root, dir)).toLowerCase());
      assert.equal(fs.realpathSync(path.join(install.home, '.codex', 'rules')).toLowerCase(), fs.realpathSync(path.join(root, 'rules')).toLowerCase());
      assert(!fs.existsSync(path.join(install.home, '.claude', 'rules')), 'v2 does not link ~/.claude/rules');
    });
  }
  const report = { status: 'pass', revision, fixture, checks: results };
  fs.writeFileSync(path.join(root, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'pass', checks: results.length, ...revision }));
} catch (error) { console.error(error); process.exitCode = 1; }
