'use strict';
// Builds every run folder named in a protocol (plus one spare per run for a session-1 retry), then
// freezes a manifest. Never re-run after any session starts: the manifest is immutable.
// Usage: node tools/prepare.cjs <protocol.json>
const fs = require('node:fs');
const path = require('node:path');
const { studyRoot, readJson, digest, hash, atomicJson, git, run, treeHash } = require('./lib.cjs');
const env = require('./environment.cjs');
const host = require('./host.cjs');
const { assertNoBoardAbove } = require('./isolation.cjs');

const RUN_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;

function validateProtocol(protocol) {
  if (!/^[a-z0-9][a-z0-9-]{3,80}$/.test(protocol.studyId)) throw new Error('studyId');
  if (protocol.model !== 'gpt-6-luna' || protocol.reasoning !== 'high') throw new Error('Pilot model must be gpt-6-luna/high');
  if (!Number.isInteger(protocol.timeoutMs) || protocol.timeoutMs < 1000 || protocol.timeoutMs > 1800000) throw new Error('timeoutMs must be 1s-30min');
  if (!/^[0-9a-f]{40}$/.test(protocol.harnessCommit)) throw new Error('harnessCommit must be a full SHA');
  if (!fs.existsSync(protocol.codexExe)) throw new Error('codexExe missing');
  for (const key of ['sessions', 'reviews', 'firstReviewEstimate']) if (!Number.isInteger(protocol.budget?.[key])) throw new Error('budget.' + key);
  const ids = new Set();
  for (const runSpec of protocol.runs) {
    if (!RUN_ID.test(runSpec.id) || runSpec.id.endsWith('-spare') || ids.has(runSpec.id)) throw new Error('bad or duplicate run id: ' + runSpec.id);
    ids.add(runSpec.id);
    if (!protocol.tasks[runSpec.task]) throw new Error('unknown task: ' + runSpec.task);
    if (!env.CONFIGS.includes(runSpec.config)) throw new Error('unknown config: ' + runSpec.config);
    const prompts = protocol.tasks[runSpec.task].prompts;
    if (!runSpec.sessions.every(n => prompts[String(n)])) throw new Error('missing prompt for ' + runSpec.id);
  }
}

const abs = relative => path.resolve(studyRoot, relative);

/** Static prompt check (no model call). It cannot see SessionStart injections; the runtime probe does. */
function promptCheck(protocol, repo, runEnv, prompt) {
  // The prompt goes in as an argument; Windows caps a command line at 32 KB and the public prompt is ~35 KB.
  // The check inspects only what Codex injects before the prompt, so the prompt's opening is enough.
  const out = run(protocol.codexExe, ['-C', repo, 'debug', 'prompt-input', prompt.slice(0, 4000)], { cwd: repo, env: runEnv });
  if (out.status !== 0) throw new Error('prompt-input failed: ' + out.stderr.slice(0, 500));
  const text = out.stdout;
  return {
    sharedHarness: text.includes('# Shared harness'), taskOnlyProfile: text.includes('Code work in this repository is tracked as **tasks**'),
    leanProfile: text.includes('Write the record twice, one command each'),  // quote-free: prompt-input escapes quotes
    customSkills: text.includes('agent-harness-construction'), sessionSummary: text.includes('Previous session summary'),
    characters: text.length
  };
}

function expectedChecks(config) {
  return {
    stock: { sharedHarness: false, taskOnlyProfile: false, leanProfile: false, customSkills: false, sessionSummary: false },
    'task-only': { sharedHarness: false, taskOnlyProfile: true, leanProfile: false, customSkills: false, sessionSummary: false },
    full: { sharedHarness: true, taskOnlyProfile: false, leanProfile: false, customSkills: true, sessionSummary: false },
    lean: { sharedHarness: false, taskOnlyProfile: false, leanProfile: true, customSkills: false, sessionSummary: false }
  }[config];
}

// FINDINGS.md item 4: the lean setup's start-up prompt must stay under 25,000 characters.
const LEAN_PROMPT_LIMIT = 25000;
function checkPrompt(runId, config, checks) {
  for (const [key, value] of Object.entries(expectedChecks(config))) if (checks[key] !== value) throw new Error(`Prompt check failed for ${runId}: ${key}=${checks[key]}`);
  if (config === 'lean' && !(checks.characters < LEAN_PROMPT_LIMIT)) throw new Error(`Prompt check failed for ${runId}: ${checks.characters} characters, limit 25,000`);
}

async function buildRun(protocol, runSpec, runDir) {
  if (fs.existsSync(runDir)) throw new Error('Run folder already exists: ' + runDir);
  assertNoBoardAbove(runDir);
  const task = protocol.tasks[runSpec.task];
  const repo = path.join(runDir, 'repo');
  fs.mkdirSync(path.join(runDir, 'tmp'), { recursive: true });
  git(['-c', 'core.autocrlf=false', 'clone', '-q', '-c', 'core.autocrlf=false', '--branch', task.ref, abs(task.bundle), repo], studyRoot);
  git(['config', 'user.name', 'Study Participant'], repo);
  git(['config', 'user.email', 'participant@study.invalid'], repo);
  const baselineCommit = git(['rev-parse', 'HEAD'], repo).trim();
  const runEnv = env.runEnv(runDir);
  let clone = null;
  if (runSpec.config !== 'stock') clone = env.cloneHarness(path.join(runDir, 'harness'), protocol.harnessCommit, runSpec.config, runEnv);
  env.buildHome(path.join(runDir, 'home'), clone && path.join(runDir, 'harness'));
  const skills = env.writeCodexHome(runEnv.CODEX_HOME, { config: runSpec.config, model: protocol.model, reasoning: protocol.reasoning, clone: path.join(runDir, 'harness') });
  const trust = clone ? await env.trustHooks(protocol.codexExe, runEnv.CODEX_HOME, runEnv, repo) : [];
  const venv = env.buildVenv(path.join(runDir, 'venv'), { wheels: abs(task.wheels), requirements: task.requirements, editableInstall: task.editableInstall }, repo);
  if (git(['status', '--porcelain'], repo).trim()) throw new Error('Repo dirty after preparation (editable install?): ' + runDir);
  const checks = promptCheck(protocol, repo, runEnv, fs.readFileSync(abs(task.prompts[String(runSpec.sessions[0])]), 'utf8'));
  checkPrompt(runSpec.id, runSpec.config, checks);
  const fileSha = name => fs.existsSync(path.join(runEnv.CODEX_HOME, name)) ? digest(path.join(runEnv.CODEX_HOME, name)) : null;
  return {
    runId: runSpec.id, task: runSpec.task, config: runSpec.config, sessions: runSpec.sessions, baselineCommit,
    baselineTreeSha256: treeHash(repo), harnessClone: clone, skills, trust, venvFreeze: venv, promptChecks: checks,
    codexHome: { configSha256: fileSha('config.toml'), agentsSha256: fileSha('AGENTS.md'), hooksSha256: fileSha('hooks.json') }
  };
}

async function prepare(protocolFile) {
  const protocol = readJson(protocolFile);
  validateProtocol(protocol);
  const resultsDir = path.join(path.dirname(protocolFile), 'results');
  const frozenFile = path.join(resultsDir, 'frozen.json');
  if (fs.existsSync(frozenFile)) throw new Error('Already prepared; the manifest is immutable: ' + frozenFile);
  fs.mkdirSync(resultsDir, { recursive: true });
  const runs = {};
  for (const runSpec of protocol.runs) {
    // Spares exist only so a session-1 retry can start from a clean folder; probes skip them.
    for (const id of protocol.spares === false ? [runSpec.id] : [runSpec.id, runSpec.id + '-spare']) {
      process.stderr.write('preparing ' + id + '\n');
      runs[id] = await buildRun(protocol, runSpec, path.join(resultsDir, id));
    }
  }
  const tools = Object.fromEntries(fs.readdirSync(__dirname).filter(n => n.endsWith('.cjs')).sort().map(n => [n, digest(path.join(__dirname, n))]));
  const inputs = Object.fromEntries(Object.entries(protocol.tasks).flatMap(([id, task]) => [
    [id + ':bundle', digest(abs(task.bundle))], ...Object.entries(task.prompts).map(([n, file]) => [id + ':prompt-' + n, digest(abs(file))])
  ]));
  atomicJson(frozenFile, {
    studyId: protocol.studyId, protocolSha256: digest(protocolFile), preparedAt: new Date().toISOString(),
    order: protocol.runs.flatMap(r => r.sessions.map(n => r.id + '-s' + n)),
    budget: protocol.budget, toolHashes: tools, taskInputs: inputs, profileSha256: {
      agents: digest(path.join(studyRoot, 'profiles/task-only/AGENTS.md')), policy: digest(path.join(studyRoot, 'profiles/task-only/policy.json'))
    }, hostAtPrepare: host.snapshot(), runs
  });
  return { resultsDir, runs: Object.keys(runs).length };
}

module.exports = { prepare, validateProtocol, expectedChecks, checkPrompt };
if (require.main === module) {
  prepare(path.resolve(process.argv[2])).then(out => console.log(JSON.stringify(out)))
    .catch(error => { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; });
}
