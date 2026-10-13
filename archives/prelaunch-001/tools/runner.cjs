'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');

const root = path.resolve(__dirname, '..');
const results = path.join(root, 'results');
const protocolFile = path.join(root, 'protocol.json');
const homeRoot = 'C:/Users/jkind/.codex';
const runtimeRoot = path.join(homeRoot, 'benchmark-runtimes');
const harnessRoot = 'C:/Users/jkind/.agents/harness';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = file => hash(fs.readFileSync(file));

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
  try {
    const fd = fs.openSync(temporary, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function treeFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const volatileDirectories = new Set(['.git', 'state', 'node_modules', '.cache', 'cache', 'tmp', 'temp']);
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      if (entry.isDirectory() && volatileDirectories.has(entry.name.toLowerCase())) return [];
      const item = path.join(directory, entry.name);
      return entry.isDirectory() ? treeFiles(item) : [item];
    });
}
function hashTree(directory) {
  return hash(treeFiles(directory).map(file => path.relative(directory, file).replaceAll('\\', '/') + '\0' + digest(file)).join('\n'));
}

function hostSnapshot() {
  const files = [
    path.join(homeRoot, 'config.toml'), path.join(homeRoot, 'AGENTS.md'), path.join(homeRoot, 'hooks.json'),
    'C:/Users/jkind/.claude/CLAUDE.md', path.join(harnessRoot, 'policy.json')
  ];
  const snapshot = Object.fromEntries(files.map(file => [file, fs.existsSync(file) ? digest(file) : 'missing']));
  snapshot[harnessRoot] = fs.existsSync(harnessRoot) ? hashTree(harnessRoot) : 'missing';
  return snapshot;
}

function normalizeUsage(source) {
  if (!source || typeof source !== 'object') return null;
  const usage = {
    input_tokens: source.input_tokens ?? source.inputTokens ?? null,
    cached_input_tokens: source.cached_input_tokens ?? source.cachedInputTokens ?? null,
    output_tokens: source.output_tokens ?? source.outputTokens ?? null,
    reasoning_output_tokens: source.reasoning_output_tokens ?? source.reasoningOutputTokens ?? null
  };
  return Object.values(usage).some(value => value !== null) ? usage : null;
}

function usageFromEvents(events, lastTranscriptCounter) {
  const completed = events.filter(event => event.type === 'turn.completed').at(-1);
  const usage = normalizeUsage(completed?.usage);
  if (usage) return { usage, source: 'turn.completed', turnCompleted: true };
  const fallback = lastTranscriptCounter?.total_token_usage || lastTranscriptCounter?.cumulative_token_usage ||
    lastTranscriptCounter?.last_token_usage || lastTranscriptCounter?.token_usage || lastTranscriptCounter;
  return { usage: normalizeUsage(fallback), source: fallback ? 'last_transcript_counter' : null, turnCompleted: false };
}
function safeRunDir(runId) {
  if (!/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(runId)) throw new Error('Invalid run id');
  return path.join(results, runId);
}

function assertRunUnattempted(directory) {
  const evidence = ['journal.json', 'result.json', 'events.jsonl', 'stderr.log', 'recovery.json']
    .filter(name => fs.existsSync(path.join(directory, name)));
  if (evidence.length) throw new Error('Refusing to replace attempted run evidence: ' + evidence.join(', '));
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || '').slice(0, 1000));
  return result.stdout;
}

function argumentsFor(protocol, run, condition, repo) {
  return ['exec', '--approve-for-me', '--sandbox', 'workspace-write', '-C', repo, '-m', protocol.model,
    '--disable', 'multi_agent', condition.mode === 'full' ? '--enable' : '--disable', 'hooks', '--json', '-'];
}

function envFor(home) {
  const env = { ...process.env, CODEX_HOME: home };
  delete env.OPENAI_API_KEY;
  delete env.AZURE_OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  return env;
}

function conditionFor(protocol, run) {
  const condition = protocol.conditions.find(item => item.id === run.condition);
  if (!condition) throw new Error('Unknown run condition: ' + run.condition);
  return condition;
}

function runtimeHashes(home) {
  const fileHash = name => {
    const file = path.join(home, name);
    return fs.existsSync(file) ? digest(file) : null;
  };
  return { configSha256: fileHash('config.toml'), agentsSha256: fileHash('AGENTS.md'), hooksSha256: fileHash('hooks.json') };
}

function verifyPrepared(protocol, run, frozen, repo, home) {
  if (digest(protocolFile) !== frozen.protocolSha256) throw new Error('protocol.json changed after preparation');
  for (const [name, sha] of Object.entries(frozen.toolHashes)) {
    if (digest(path.join(__dirname, name)) !== sha) throw new Error('Runner tool changed after preparation: ' + name);
  }
  const promptFile = path.join(safeRunDir(run.id), 'prompt.json');
  const frozenPrompt = frozen.promptSnapshots?.[run.id];
  if (!frozenPrompt || digest(promptFile) !== frozenPrompt.snapshotFileSha256) throw new Error('Prompt snapshot changed after preparation: ' + run.id);
  const input = frozen.taskInputs[run.task];
  if (!input || hashTree(path.join(root, 'experiments', run.task)) !== input.treeSha256) {
    throw new Error('Experiment inputs changed after preparation: ' + run.task);
  }
  if (git(['rev-parse', 'HEAD'], repo).trim() !== frozen.baselines[run.task]?.head) throw new Error('Baseline HEAD changed for ' + run.id);
  if (git(['status', '--porcelain'], repo).trim()) throw new Error('Run repository is dirty: ' + run.id);
  if (JSON.stringify(hostSnapshot()) !== JSON.stringify(frozen.hostSnapshotAtPrepare)) {
    throw new Error('Installed Codex or harness files changed after preparation');
  }
  const expectedHome = frozen.privateHomes?.runs?.[run.id];
  if (!expectedHome || JSON.stringify(runtimeHashes(home)) !== JSON.stringify({
    configSha256: expectedHome.configSha256, agentsSha256: expectedHome.agentsSha256, hooksSha256: expectedHome.hooksSha256
  })) throw new Error('Private runtime configuration changed after preparation: ' + run.id);
}
function assertPidExited(pid, label) {
  if (!pid) return;
  try { process.kill(pid, 0); throw new Error(label + ' PID is still active: ' + pid); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

function assertPriorComplete(protocol, runId, resultRoot = results) {
  const index = protocol.runs.findIndex(run => run.id === runId);
  if (index < 0) throw new Error('Unknown run id: ' + runId);
  const terminal = new Set(['completed', 'incomplete', 'failed', 'interrupted', 'timed_out', 'recovered_aborted']);
  for (const earlier of protocol.runs.slice(0, index)) {
    const file = path.join(resultRoot, earlier.id, 'journal.json');
    if (!fs.existsSync(file)) throw new Error('Earlier run is missing: ' + earlier.id);
    const journal = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!terminal.has(journal.state)) throw new Error('Earlier run is not terminal: ' + earlier.id);
    assertPidExited(journal.childPid, 'Codex child');
    assertPidExited(journal.parentPid, 'Runner parent');
  }
}

function acquireStudyLock(runId) {
  const file = path.join(results, 'study.lock');
  const fd = fs.openSync(file, 'wx');
  try {
    fs.writeFileSync(fd, JSON.stringify({ runId, parentPid: process.pid, createdAt: new Date().toISOString() }));
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  return file;
}

function releaseStudyLock(file, runId) {
  if (!fs.existsSync(file)) return;
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (lock.runId !== runId || lock.parentPid !== process.pid) throw new Error('Study lock ownership changed');
  fs.unlinkSync(file);
}
function killTree(child) {
  if (!child?.pid) return;
  const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
    encoding: 'utf8', windowsHide: true, timeout: 15000
  });
  if (result.error || result.status !== 0) {
    try { child.kill('SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

function parseEvents(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function transcriptInfo(home, threadId) {
  if (!threadId) return { transcript: null, transcriptSha256: null, firstUsage: null, lastUsage: null, lastTranscriptCounter: null, context: null };
  const file = treeFiles(path.join(home, 'sessions')).find(item => item.endsWith('.jsonl') && item.includes(threadId));
  if (!file) return { transcript: null, transcriptSha256: null, firstUsage: null, lastUsage: null, lastTranscriptCounter: null, context: null };
  let firstUsage = null, lastUsage = null, context = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const entry = JSON.parse(line);
    if (entry.type === 'event_msg' && entry.payload?.type === 'token_count' && entry.payload.info) {
      firstUsage ??= entry.payload.info;
      lastUsage = entry.payload.info;
    }
    if (entry.type === 'turn_context') context = {
      model: entry.payload?.model ?? null, effort: entry.payload?.effort ?? null,
      approval: entry.payload?.approval_policy ?? null, sandbox: entry.payload?.sandbox_policy ?? null,
      serviceTier: entry.payload?.service_tier ?? null
    };
  }
  return {
    transcript: file, transcriptSha256: digest(file), firstUsage, lastUsage,
    lastTranscriptCounter: lastUsage?.total_token_usage || lastUsage?.cumulative_token_usage || lastUsage?.last_token_usage || lastUsage?.token_usage || lastUsage, context
  };
}

function updateStudy(protocol, run, status, pid, resultRoot = results) {
  const file = path.join(resultRoot, 'study-journal.json');
  const prior = fs.existsSync(file) ? json(file) : { studyId: protocol.studyId, attempts: [] };
  if (prior.attempts.some(item => item.runId === run.id)) {
    atomicJson(file, { ...prior, attempts: prior.attempts.map(item =>
      item.runId === run.id ? { ...item, status, childPid: pid || item.childPid, updatedAt: new Date().toISOString() } : item) });
  } else {
    atomicJson(file, { ...prior, attempts: [...prior.attempts, { runId: run.id, status, childPid: pid || null, at: new Date().toISOString() }] });
  }
}

function terminalStatus(status) {
  return ['completed', 'incomplete', 'failed', 'interrupted', 'timed_out', 'recovered_aborted'].includes(status);
}

function recordRecoveredAttempt(protocol, run, directory, priorJournal, options = {}) {
  const resultRoot = options.resultRoot || results;
  const resultFile = path.join(directory, 'result.json');
  const journalFile = path.join(directory, 'journal.json');
  const oldResult = fs.existsSync(resultFile) ? json(resultFile) : null;
  const status = oldResult && terminalStatus(oldResult.status) ? oldResult.status
    : terminalStatus(priorJournal.state) ? priorJournal.state : 'recovered_aborted';
  const recoveredAt = new Date().toISOString();
  const modelCallStarted = options.modelCallStarted ?? null;
  const result = oldResult || {
    runId: run.id, task: run.task, condition: run.condition, repetition: run.repetition,
    status, threadId: null, elapsedSeconds: Math.max(0, (Date.parse(recoveredAt) - Date.parse(priorJournal.startedAt || recoveredAt)) / 1000),
    usage: null, usageSource: null, firstUsage: null, lastUsage: null, lastTranscriptCounter: null,
    context: null, toolCalls: 0, actionCounts: {}, final: '', transcript: null, transcriptSha256: null,
    credentialAliasRemoved: options.credentialAliasRemoved === true, timedOut: priorJournal.state === 'timed-out',
    exitCode: null, exitSignal: null, failure: 'Run process stopped before it wrote a complete result; usage and completion are unknown.',
    modelCallStarted, hostSnapshotBefore: priorJournal.hostSnapshotBefore || null,
    hostSnapshotAfter: options.hostSnapshotAfter || null
  };
  atomicJson(resultFile, result);
  const journal = {
    ...priorJournal, runId: run.id, task: run.task, condition: run.condition, repetition: run.repetition,
    previousState: priorJournal.state || null, state: status, recoveredAt,
    credentialAliasRemoved: options.credentialAliasRemoved === true,
    modelCallStarted, recoveryReason: 'Stopped attempt recorded as terminal; this run id cannot be replayed.'
  };
  atomicJson(journalFile, journal);
  updateStudy(protocol, run, status, journal.childPid, resultRoot);
  return { journal, result, status };
}
async function executeRun(runId) {
  const protocol = json(protocolFile);
  const spec = protocol.runs.find(item => item.id === runId);
  if (!spec) throw new Error('Unknown run id: ' + runId);
  const condition = conditionFor(protocol, spec);
  const directory = safeRunDir(runId);
  if (!fs.existsSync(directory)) throw new Error('Prepare the run directory first: ' + runId);
  assertRunUnattempted(directory);
  assertPriorComplete(protocol, runId);
  const frozen = json(path.join(results, 'frozen.json'));
  const repo = path.join(directory, 'repo');
  const home = path.join(runtimeRoot, protocol.studyId, spec.id);
  verifyPrepared(protocol, spec, frozen, repo, home);
  const lockFile = acquireStudyLock(runId);
  const hostBefore = hostSnapshot();
  const journalFile = path.join(directory, 'journal.json');
  const journal = {
    runId, task: spec.task, condition: spec.condition, repetition: spec.repetition,
    state: 'attempted', parentPid: process.pid, childPid: null, startedAt: new Date().toISOString(),
    timeoutMs: protocol.timeoutMs, protocolSha256: frozen.protocolSha256, baselineHead: frozen.baselines[spec.task].head, hostSnapshotBefore: hostBefore
  };
  atomicJson(journalFile, journal);
  updateStudy(protocol, spec, 'attempted', null);

  const alias = path.join(home, 'auth.json');
  const eventsFile = path.join(directory, 'events.jsonl');
  const stderrFile = path.join(directory, 'stderr.log');
  let child = null, closePromise = null, streams = [], exitCode = null, exitSignal = null;
  let timedOut = false, interrupted = false, failure = null;
  const start = Date.now();
  const onInterrupt = () => { interrupted = true; killTree(child); };
  process.once('SIGINT', onInterrupt);
  let aliasRemoved = false;
  try {
    if (fs.existsSync(alias)) throw new Error('Credential alias already exists');
    const credential = path.join(homeRoot, 'auth.json');
    if (!fs.existsSync(credential)) throw new Error('Existing Codex login file is missing');
    fs.linkSync(credential, alias);
    journal.state = 'credential-linked';
    atomicJson(journalFile, journal);
    fs.writeFileSync(eventsFile, '', { flag: 'wx' });
    fs.writeFileSync(stderrFile, '', { flag: 'wx' });
    journal.state = 'launching';
    journal.spawnRequestedAt = new Date().toISOString();
    atomicJson(journalFile, journal);
    child = spawn(protocol.codexExe, argumentsFor(protocol, spec, condition, repo), {
      cwd: repo, env: envFor(home), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    closePromise = new Promise(resolve => {
      child.once('error', error => { failure = error.message; resolve({ code: null, signal: null }); });
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    journal.childPid = child.pid || null;
    journal.state = child.pid ? 'running' : 'spawn-failed';
    journal.spawnedAt = new Date().toISOString();
    atomicJson(journalFile, journal);
    updateStudy(protocol, spec, journal.state, child.pid);
    streams = [
      pipeline(child.stdout, fs.createWriteStream(eventsFile, { flags: 'a' })),
      pipeline(child.stderr, fs.createWriteStream(stderrFile, { flags: 'a' }))
    ];
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') failure ||= error.message; });
    child.stdin.end(protocol.tasks.find(task => task.id === spec.task).prompt);
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), protocol.timeoutMs); });
    const outcome = await Promise.race([closePromise.then(result => ({ kind: 'closed', result })), deadline]);
    if (outcome === 'timeout') {
      timedOut = true;
      journal.state = 'timed-out';
      atomicJson(journalFile, journal);
      killTree(child);
      const result = await closePromise;
      exitCode = result.code; exitSignal = result.signal;
    } else {
      clearTimeout(timer);
      exitCode = outcome.result.code; exitSignal = outcome.result.signal;
    }
    const streamResults = await Promise.allSettled(streams);
    for (const result of streamResults) if (result.status === 'rejected') failure ||= 'Output stream failed: ' + result.reason.message;
  } catch (error) {
    failure ||= error.message;
    if (child?.pid && closePromise) {
      killTree(child);
      await closePromise;
      const streamResults = await Promise.allSettled(streams);
      for (const result of streamResults) if (result.status === 'rejected') failure ||= 'Output stream failed: ' + result.reason.message;
    }
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    if (fs.existsSync(alias)) fs.unlinkSync(alias);
    aliasRemoved = !fs.existsSync(alias);
  }

  let events = [];
  try { if (fs.existsSync(eventsFile)) events = parseEvents(eventsFile); }
  catch (error) { failure ||= 'Could not parse the complete event stream: ' + error.message; }
  const threadId = events.find(event => event.type === 'thread.started')?.thread_id || null;
  const native = transcriptInfo(home, threadId);
  const accounting = usageFromEvents(events, native.lastTranscriptCounter);
  const final = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message').at(-1)?.item.text || '';
  const actionCounts = {};
  for (const event of events) if (event.type === 'item.completed' && event.item?.type) {
    actionCounts[event.item.type] = (actionCounts[event.item.type] || 0) + 1;
  }
  const status = interrupted ? 'interrupted' : timedOut ? 'timed_out' : failure ? 'failed'
    : exitCode === 0 && events.some(event => event.type === 'turn.completed') ? 'completed' : 'incomplete';
  const hostAfter = hostSnapshot();
  const result = {
    runId, task: spec.task, condition: spec.condition, repetition: spec.repetition, status,
    elapsedSeconds: (Date.now() - start) / 1000, usage: accounting.usage, usageSource: accounting.source,
    firstUsage: native.firstUsage, lastUsage: native.lastUsage, lastTranscriptCounter: native.lastTranscriptCounter,
    context: native.context, toolCalls: Object.entries(actionCounts)
      .filter(([type]) => ['command_execution', 'file_change', 'mcp_tool_call'].includes(type))
      .reduce((total, [, count]) => total + count, 0),
    actionCounts, final, transcript: native.transcript, transcriptSha256: native.transcriptSha256,
    credentialAliasRemoved: aliasRemoved, timedOut, exitCode, exitSignal, failure,
    hostSnapshotBefore: hostBefore, hostSnapshotAfter: hostAfter
  };
  atomicJson(path.join(directory, 'result.json'), result);
  journal.state = status;
  journal.childPid = child?.pid || null;
  journal.endedAt = new Date().toISOString();
  journal.credentialAliasRemoved = aliasRemoved;
  journal.exitCode = exitCode;
  journal.exitSignal = exitSignal;
  journal.failure = failure;
  atomicJson(journalFile, journal);
  updateStudy(protocol, spec, status, child?.pid);
  releaseStudyLock(lockFile, runId);
  process.stdout.write(JSON.stringify({ runId, status, elapsedSeconds: result.elapsedSeconds, usage: result.usage, credentialAliasRemoved: aliasRemoved }) + '\n');
  if (status !== 'completed') process.exitCode = interrupted ? 130 : 1;
}
function recover(runId, verifiedNoChild) {
  const protocol = json(protocolFile);
  const run = protocol.runs.find(item => item.id === runId);
  if (!run) throw new Error('Unknown run id: ' + runId);
  const directory = safeRunDir(runId);
  if (!fs.existsSync(directory)) throw new Error('Prepared run directory is missing: ' + runId);
  const journalFile = path.join(directory, 'journal.json');
  const lockFile = path.join(results, 'study.lock');
  const lock = fs.existsSync(lockFile) ? json(lockFile) : null;
  if (lock && lock.runId !== runId) throw new Error('Study lock belongs to another run: ' + lock.runId);
  let journal = fs.existsSync(journalFile) ? json(journalFile) : null;
  if (!journal && !lock) throw new Error('No run journal or matching lock to recover: ' + runId);
  if (lock) assertPidExited(lock.parentPid, 'Runner parent');
  if (journal?.parentPid) assertPidExited(journal.parentPid, 'Runner parent');

  if (!journal) {
    journal = {
      runId, task: run.task, condition: run.condition, repetition: run.repetition,
      state: 'attempted', parentPid: lock.parentPid, childPid: null,
      startedAt: lock.createdAt || new Date().toISOString(), hostSnapshotBefore: null
    };
  }
  if (!journal.childPid && ['launching', 'spawn-failed'].includes(journal.state) && !verifiedNoChild) {
    throw new Error('Spawn/PID gap: verify no owned Codex child remains, then pass --verified-no-child');
  }
  assertPidExited(journal.childPid, 'Codex child');

  const alias = path.join(runtimeRoot, protocol.studyId, runId, 'auth.json');
  if (fs.existsSync(alias)) fs.unlinkSync(alias);
  const safeBeforeLaunch = !journal.childPid && ['attempted', 'credential-linked', 'spawn-failed'].includes(journal.state);
  const callStarted = safeBeforeLaunch ? false : null;
  const recovered = recordRecoveredAttempt(protocol, run, directory, journal, {
    modelCallStarted: callStarted, credentialAliasRemoved: !fs.existsSync(alias), hostSnapshotAfter: hostSnapshot()
  });
  if (lock) fs.unlinkSync(lockFile);
  atomicJson(path.join(directory, 'recovery.json'), {
    runId, recoveredAt: recovered.journal.recoveredAt, priorState: journal.state,
    recoveredStatus: recovered.status, credentialAliasRemoved: !fs.existsSync(alias),
    modelCallStarted: callStarted, evidenceRetained: true, rerunAllowed: false
  });
}
if (require.main === module) {
  const [command, runId, flag] = process.argv.slice(2);
  if (command === 'recover') {
    try { recover(runId, flag === '--verified-no-child'); }
    catch (error) { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; }
  } else if (command === 'run') {
    executeRun(runId).catch(error => { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; });
  } else {
    process.stderr.write('Usage: node tools/runner.cjs run <run-id> | recover <run-id> [--verified-no-child]\n');
    process.exitCode = 2;
  }
}
module.exports = { atomicJson, assertRunUnattempted, argumentsFor, normalizeUsage, usageFromEvents, hostSnapshot, hashTree, assertPriorComplete, assertPidExited, recordRecoveredAttempt };
