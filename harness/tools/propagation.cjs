'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { root, render, hash } = require('./render.cjs');
const { begin, recover, atomicWrite } = require('./propagation-state.cjs');
// Provider hashes differ because Claude loads its rules and style natively.
function validateHookContexts(contexts, revision) {
  const behavior = {};
  for (const provider of ['claude', 'codex']) {
    const expected = provider === 'claude' ? revision.claudeInstructionsSha256 : revision.instructionsSha256;
    const context = contexts[provider];
    assert.equal(typeof context, 'string');
    const marker = context.match(/^Shared harness loaded; instructions SHA256 ([^.]+)\. Source: ([^\n]+)$/m);
    assert(marker, 'Missing loaded instruction hash for ' + provider);
    assert.equal(marker[1], expected, 'Wrong loaded instruction hash for ' + provider);
    behavior[provider] = context.replace(marker[0], 'Shared harness loaded; Source: ' + marker[2]);
  }
  assert.equal(behavior.claude, behavior.codex, 'Provider hook behavior differs');
}
module.exports = { validateHookContexts };
if (require.main === module) {
recover(root);
const token = 'HARNESS_PROBE_' + crypto.randomBytes(8).toString('hex');
const instruction = path.join(root, 'core/machine.md');
const policyFile = path.join(root, 'core', 'policy.json');
const hookId = 'harness-propagation-' + token;
const hookRelative = 'scripts/hooks/' + hookId + '.js';
const hookFile = path.join(root, hookRelative);
const originalInstruction = fs.readFileSync(instruction), originalPolicy = fs.readFileSync(policyFile);
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-propagation-'));
const installation = JSON.parse(fs.readFileSync(path.join(root, 'installation.json')));
const report = { token, before: render(), checks: [] };
const scriptContent = "const fs = require('node:fs'); const i=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:i.hook_event_name,additionalContext:'Shared hook validation token: " + token + "'}}));\n";
begin(root, token, scriptContent);
try {
  atomicWrite(instruction, originalInstruction.toString('utf8') + '\nHarness validation token: ' + token + '\n');
  fs.writeFileSync(hookFile, scriptContent, { flag: 'wx' });
  const policy = JSON.parse(originalPolicy);
  policy.hooks.push({ id: hookId, event: 'UserPromptSubmit', matcher: '*', args: ['node', hookRelative], timeout: 10 });
  atomicWrite(policyFile, JSON.stringify(policy, null, 2) + '\n');
  report.changed = render();
  assert.notEqual(report.before.instructionsSha256, report.changed.instructionsSha256);
  assert.notEqual(report.before.claudeInstructionsSha256, report.changed.claudeInstructionsSha256);
  const { isClaudeInstructionFile } = require('./render.cjs');
  for (const file of installation.instructions) assert.equal(hash(fs.readFileSync(file)), isClaudeInstructionFile(file) ? report.changed.claudeInstructionsSha256 : report.changed.instructionsSha256);
  report.checks.push('One instruction source edit reaches both installed instruction files');
  const hookResults = {};
  for (const provider of ['claude', 'codex']) {
    const result = spawnSync(process.execPath, [path.join(root, 'tools/dispatch.cjs'), provider, 'UserPromptSubmit'], { input: JSON.stringify({ cwd: fixture, session_id: 'propagation-' + provider, prompt: 'Validate shared source' }), encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert(context.includes(token)); hookResults[provider] = context;
  }
  validateHookContexts(hookResults, report.changed);
  report.checks.push('One hook source edit produces matching behavior and correct provider-specific instruction hashes');
  const codex = process.argv[2] || 'codex.exe';
  const prompt = spawnSync(codex, ['debug', 'prompt-input', 'Validate loaded harness'], { cwd: fixture, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000, windowsHide: true });
  assert.equal(prompt.status, 0, prompt.stderr); assert(prompt.stdout.includes(token));
  report.checks.push('Native Codex prompt loader contains the changed instruction token');
  for (const provider of ['claude', 'codex']) {
    const live = spawnSync(process.execPath, [path.join(root, 'tools/live-probe.cjs'), provider, 'Return only the Harness validation token stated in your loaded global instructions. Do not use tools.', codex], { encoding: 'utf8', timeout: 120000, windowsHide: true });
    assert.equal(live.status, 0, live.stderr);
    const native = JSON.parse(fs.readFileSync(path.join(root, 'state/' + provider + '-live.json')));
    assert.equal(native.response.trim(), token);
    const ledger = fs.readFileSync(path.join(root, 'state/hook-runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert(ledger.some(r => r.provider === provider && r.session === native.session && r.event === 'SessionStart'));
    assert(ledger.some(r => r.provider === provider && r.session === native.session && r.hooks.some(h => h.id === hookId && h.status === 0)));
    report[provider + 'Session'] = native.session;
    report.checks.push('Native ' + provider + ' model sees the changed token and its native hook invokes the changed source');
  }
  console.log(JSON.stringify({ status: 'pass', token, checks: report.checks }));
} finally {
  recover(root, true);
  report.restored = render();
  assert.equal(report.restored.instructionsSha256, report.before.instructionsSha256);
  report.restoration = 'Original instruction and hook policy restored identically for both assistants';
  fs.writeFileSync(path.join(root, 'state/propagation.json'), JSON.stringify(report, null, 2) + '\n');
}

}
