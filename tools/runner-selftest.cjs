'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { atomicJson, assertRunUnattempted, argumentsFor, normalizeUsage, usageFromEvents, assertPriorComplete, assertPidExited, recordRecoveredAttempt } = require('./runner.cjs');
const { configText, hookTrust, runtimeHashes, discoverSkills } = require('./prepare.cjs');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-runner-selftest-'));
try {
  const attempted = path.join(temp, 'attempted');
  fs.mkdirSync(attempted);
  fs.writeFileSync(path.join(attempted, 'journal.json'), '{"state":"attempted"}');
  assert.throws(() => assertRunUnattempted(attempted), /Refusing to replace attempted run evidence/);
  fs.writeFileSync(path.join(attempted, 'recovery.json'), '{}');
  assert.throws(() => assertRunUnattempted(attempted), /recovery.json/);

  const journal = path.join(temp, 'journal.json');
  atomicJson(journal, { state: 'launching', childPid: 1234 });
  assert.deepEqual(JSON.parse(fs.readFileSync(journal, 'utf8')), { state: 'launching', childPid: 1234 });
  assert.equal(fs.readdirSync(temp).some(name => name.endsWith('.tmp')), false);

  assert.deepEqual(normalizeUsage({
    input_tokens: 90, cached_input_tokens: 12, output_tokens: 30, reasoning_output_tokens: 8
  }), { input_tokens: 90, cached_input_tokens: 12, output_tokens: 30, reasoning_output_tokens: 8 });
  assert.deepEqual(usageFromEvents([], {
    input_tokens: 99, cached_input_tokens: 15, output_tokens: 33, reasoning_output_tokens: 9
  }), { usage: { input_tokens: 99, cached_input_tokens: 15, output_tokens: 33, reasoning_output_tokens: 9 },
    source: 'last_transcript_counter', turnCompleted: false });
  assert.deepEqual(usageFromEvents([], {
    total_token_usage: { input_tokens: 150, output_tokens: 45 },
    last_token_usage: { input_tokens: 50, output_tokens: 15 }
  }).usage, { input_tokens: 150, cached_input_tokens: null, output_tokens: 45, reasoning_output_tokens: null });

  const preparedRuns = path.join(temp, 'ordered');
  fs.mkdirSync(path.join(preparedRuns, 'first'), { recursive: true });
  const priorJournal = path.join(preparedRuns, 'first', 'journal.json');
  fs.writeFileSync(priorJournal, JSON.stringify({ state: 'running', parentPid: null, childPid: null }));
  const order = { runs: [{ id: 'first' }, { id: 'second' }] };
  assert.throws(() => assertPriorComplete(order, 'second', preparedRuns), /not terminal/);
  fs.writeFileSync(priorJournal, JSON.stringify({ state: 'completed', parentPid: null, childPid: null }));
  assert.doesNotThrow(() => assertPriorComplete(order, 'second', preparedRuns));
  assert.throws(() => assertPidExited(process.pid, 'runner parent'), /still active/);

  const recoveryRoot = path.join(temp, 'recovery-results');
  const recoveredRun = { id: 'first-cell', task: 'easy', condition: 'control', repetition: 1 };
  const nextRun = { id: 'next-cell', task: 'easy', condition: 'instructions', repetition: 1 };
  const recoveryProtocol = { studyId: 'recovery-selftest', runs: [recoveredRun, nextRun] };
  const recoveredDirectory = path.join(recoveryRoot, recoveredRun.id);
  fs.mkdirSync(recoveredDirectory, { recursive: true });
  const recovered = recordRecoveredAttempt(recoveryProtocol, recoveredRun, recoveredDirectory, {
    runId: recoveredRun.id, state: 'attempted', parentPid: null, childPid: null,
    startedAt: new Date().toISOString(), hostSnapshotBefore: null
  }, { resultRoot: recoveryRoot, modelCallStarted: false, credentialAliasRemoved: true, hostSnapshotAfter: {} });
  assert.equal(recovered.status, 'recovered_aborted');
  assert.equal(recovered.result.modelCallStarted, false);
  assert.equal(recovered.result.usage, null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(recoveryRoot, 'study-journal.json'), 'utf8')).attempts[0].status, 'recovered_aborted');
  assert.doesNotThrow(() => assertPriorComplete(recoveryProtocol, nextRun.id, recoveryRoot));
  assert.throws(() => assertRunUnattempted(recoveredDirectory), /journal.json|result.json/);

  const skillRoot = path.join(temp, 'skills');
  const customSkill = path.join(skillRoot, 'custom', 'SKILL.md');
  const systemSkill = path.join(skillRoot, '.system', 'imagegen', 'SKILL.md');
  fs.mkdirSync(path.dirname(customSkill), { recursive: true });
  fs.mkdirSync(path.dirname(systemSkill), { recursive: true });
  fs.writeFileSync(customSkill, 'custom');
  fs.writeFileSync(systemSkill, 'builtin');
  assert.deepEqual(discoverSkills(skillRoot), [customSkill.replaceAll('\\', '/')]);
  const runtimeHome = path.join(temp, 'runtime');
  fs.mkdirSync(runtimeHome);
  fs.writeFileSync(path.join(runtimeHome, 'config.toml'), 'model = "gpt-6-luna"');
  assert.equal(runtimeHashes(runtimeHome).agentsSha256, null);
  assert.equal(typeof runtimeHashes(runtimeHome).configSha256, 'string');

  const toml = configText({ model: 'gpt-6-luna', reasoning: 'high' }, ['C:/skills/example/SKILL.md'], true, '');
  assert(toml.indexOf('skills.config =') >= 0);
  assert(toml.indexOf('skills.config =') < toml.indexOf('[windows]'));
  assert(toml.includes('enabled = true'));
  const installed = String.raw`[hooks.state]
[hooks.state.'C:\Users\jkind\.codex\hooks.json:pre_tool_use:0:0']
trusted_hash = 'sha256:test'
[tui]
value = true`;
  const trust = hookTrust(installed, 'C:/runtime');
  assert(trust.includes('[hooks.state.'));
  assert(trust.includes('trusted_hash'));
  assert(!trust.includes('[tui]'));
  assert(trust.includes('C:\\runtime\\hooks.json'));

  const protocol = { model: 'gpt-6-luna' };
  const control = argumentsFor(protocol, {}, { mode: 'control' }, 'C:/runs/easy/repo');
  assert(control.includes('--approve-for-me'));
  assert(!control.includes('--sandbox'));
  assert(!control.includes('workspace-write'));
  assert(control.includes('multi_agent'));
  assert(control.includes('--disable'));
  assert(!control.includes('--enable'));
  const full = argumentsFor(protocol, {}, { mode: 'full' }, 'C:/runs/easy/repo');
  assert(full.includes('--enable'));

  const protocolFile = path.join(__dirname, '..', 'protocol.json');
  const codexExe = JSON.parse(fs.readFileSync(protocolFile, 'utf8')).codexExe;
  assert(fs.existsSync(codexExe), 'Pinned Codex executable must exist for argument preflight');
  const emptyHome = path.join(temp, 'empty-codex-home');
  fs.mkdirSync(emptyHome);
  const probeEnv = { ...process.env, CODEX_HOME: emptyHome };
  for (const name of ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']) delete probeEnv[name];
  const preflight = spawnSync(codexExe, argumentsFor(protocol, {}, { mode: 'control' }, temp), {
    cwd: temp, env: probeEnv, input: '', encoding: 'utf8', windowsHide: true, timeout: 15000
  });
  assert.ifError(preflight.error);
  assert.notEqual(preflight.status, 0, 'Empty-prompt preflight must stop before a model call');
  const preflightText = (preflight.stderr || '') + (preflight.stdout || '');
  assert.match(preflightText, /prompt|stdin|empty/i, 'CLI must reach prompt validation with no-auth empty input');
  assert.doesNotMatch(preflightText, /cannot be used with|unexpected argument.*sandbox/i,
    'CLI must not reject the argument combination before prompt validation');
  process.stdout.write('runner self-test passed\n');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
