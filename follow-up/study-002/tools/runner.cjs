'use strict';
// Runs one pilot or probe session, journaled, with all evidence captured. Sessions are named
// <run-id>-s<n>; a retry is <run-id>-s<n>-retry1 and is allowed only when the original never started a
// model thread. Usage:
//   node tools/runner.cjs run <protocol.json> <session-id>
//   node tools/runner.cjs skip <protocol.json> <session-id> "<reason>"
//   node tools/runner.cjs recover <protocol.json> <session-id> [--verified-no-child]
//   node tools/runner.cjs review <protocol.json> <packet-id>[-retry1]   (blind review; see review.cjs)
//   node tools/runner.cjs recover-review <protocol.json> <packet-id>     (after a review runner died)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const lib = require('./lib.cjs');
const budget = require('./budget.cjs');
const environment = require('./environment.cjs');
const host = require('./host.cjs');
const { takeSnapshot, workingTreeHash } = require('./snapshot.cjs');
const classify = require('./classify.cjs');
const { assertNoBoardAbove } = require('./isolation.cjs');

const TERMINAL = new Set(['completed', 'incomplete', 'failed', 'interrupted', 'timed_out', 'recovered_aborted', 'not_run']);
const SESSION_ID = /^([a-z0-9][a-z0-9-]*?)-s([12])(-retry1)?$/;

function parseSession(id) {
  const match = SESSION_ID.exec(id);
  if (!match) throw new Error('Session ids look like <run>-s1, <run>-s2 or <run>-s1-retry1: ' + id);
  return { id, runId: match[1], n: Number(match[2]), retry: Boolean(match[3]), originalId: match[1] + '-s' + match[2] };
}

function context(protocolFile) {
  const protocol = lib.readJson(protocolFile);
  const resultsDir = path.join(path.dirname(protocolFile), 'results');
  const frozen = lib.readJson(path.join(resultsDir, 'frozen.json'));
  if (lib.digest(protocolFile) !== frozen.protocolSha256) throw new Error('protocol.json changed after preparation');
  for (const [name, sha] of Object.entries(frozen.toolHashes)) {
    if (lib.digest(path.join(__dirname, name)) !== sha) throw new Error('Tool changed after preparation: ' + name);
  }
  const kind = protocol.kind === 'probe' ? 'probe' : 'session';
  return { protocol, resultsDir, frozen, kind, ledger: path.join(lib.studyRoot, 'budget.json') };
}

const sessionDir = (ctx, folderId, n, retry) => path.join(ctx.resultsDir, folderId, 'sessions', 's' + n + (retry ? '-retry1' : ''));
const journalOf = dir => (fs.existsSync(path.join(dir, 'journal.json')) ? lib.readJson(path.join(dir, 'journal.json')) : null);
const resultOf = dir => (fs.existsSync(path.join(dir, 'result.json')) ? lib.readJson(path.join(dir, 'result.json')) : null);

/** Which folder a run's sessions use: the spare once a session-1 retry has happened. */
function runFolder(ctx, runId) {
  return journalOf(sessionDir(ctx, runId + '-spare', 1, true)) ? runId + '-spare' : runId;
}

/** The record that fills a session slot: the retry if one exists, else the original. */
function slotRecord(ctx, runId, n) {
  const original = sessionDir(ctx, runId, n, false);
  const retryDir = n === 1 ? sessionDir(ctx, runId + '-spare', 1, true) : sessionDir(ctx, runId, 2, true);
  return journalOf(retryDir) ? { dir: retryDir, journal: journalOf(retryDir) } : { dir: original, journal: journalOf(original) };
}

function assertOrder(ctx, session) {
  if (!ctx.frozen.order.includes(session.originalId)) throw new Error('Session not in the frozen order: ' + session.originalId);
  for (const id of ctx.frozen.order) {
    if (id === session.originalId) return;
    const earlier = parseSession(id);
    const slot = slotRecord(ctx, earlier.runId, earlier.n);
    if (!slot.journal || !TERMINAL.has(slot.journal.state)) throw new Error('Earlier session is not finished: ' + id);
    if (lib.pidAlive(slot.journal.childPid)) throw new Error('Earlier session process still alive: ' + id);
  }
  throw new Error('Session not in the frozen order: ' + session.originalId);
}

/** Codex appends [projects.'<path>'] trust sections to config.toml; ignore them when comparing. */
function configWithoutProjects(text) {
  return text.split(/(?=^\[)/m).filter(section => !section.startsWith('[projects.')).join('').trimEnd() + '\n';
}

function assertReady(ctx, session, folderId) {
  const runSpec = ctx.protocol.runs.find(r => r.id === session.runId);
  if (!runSpec || !runSpec.sessions.includes(session.n)) throw new Error('Session not in protocol: ' + session.id);
  const prepared = ctx.frozen.runs[folderId];
  const runDir = path.join(ctx.resultsDir, folderId);
  const repo = path.join(runDir, 'repo');
  const codexHome = path.join(runDir, 'codex-home');
  // The prepared config has no [projects.*] sections, so stripping them must give the frozen bytes back.
  const config = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  if (lib.hash(configWithoutProjects(config)) !== prepared.codexHome.configSha256) throw new Error('config.toml changed after preparation (beyond Codex project trust entries)');
  for (const [name, key] of [['AGENTS.md', 'agentsSha256'], ['hooks.json', 'hooksSha256']]) {
    const file = path.join(codexHome, name);
    if ((fs.existsSync(file) ? lib.digest(file) : null) !== prepared.codexHome[key]) throw new Error(name + ' changed after preparation');
  }
  if (session.n === 1) {
    if (lib.git(['rev-parse', 'HEAD'], repo).trim() !== prepared.baselineCommit || lib.git(['status', '--porcelain'], repo).trim()) throw new Error('Repo is not at its clean baseline');
    if (workingTreeHash(repo) !== prepared.baselineTreeSha256) throw new Error('Repo tree differs from baseline');
  } else {
    const first = slotRecord(ctx, session.runId, 1);
    const firstResult = first.journal && resultOf(first.dir);
    if (!first.journal || !TERMINAL.has(first.journal.state)) throw new Error('Session 1 is not finished');
    if (first.journal.state === 'not_run' || !firstResult?.snapshot) throw new Error('Session 1 left no snapshot; record session 2 as not run');
    if (workingTreeHash(repo) !== firstResult.snapshot.workingTreeSha256) throw new Error('Repo changed since session 1 ended');
  }
  if (!host.sameSnapshot(host.snapshot(), ctx.frozen.hostAtPrepare)) throw new Error('Host settings or harness changed since preparation');
  return { runSpec, runDir, repo, codexHome, prepared };
}

function assertSlotFree(ctx, session) {
  const target = session.retry && session.n === 1 ? sessionDir(ctx, session.runId + '-spare', 1, true) : sessionDir(ctx, session.runId, session.n, session.retry);
  if (fs.existsSync(target)) throw new Error('Session already attempted; ids are never replayed: ' + session.id);
  if (session.retry) {
    const original = resultOf(sessionDir(ctx, session.runId, session.n, false));
    if (!original) throw new Error('Retry needs a finished original session');
    if (original.threadId) throw new Error('Retry refused: the original session started a model thread');
  }
  return target;
}

function acquireLock(ctx, id) {
  const file = path.join(ctx.resultsDir, 'study.lock');
  fs.writeFileSync(file, JSON.stringify({ id, pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' });
  return () => fs.rmSync(file, { force: true });
}

function sessionArgs(ctx, ready) {
  return ['exec', '--approve-for-me', '-C', ready.repo, '-m', ctx.protocol.model,
    ready.runSpec.config === 'stock' ? '--disable' : '--enable', 'hooks', '--disable', 'multi_agent', '--json', '-'];
}

/**
 * One Codex process with a per-launch credential alias, a timeout and a process-tree kill.
 * `target` = { codexHome, runDir, cwd, args }: sessions pass a run folder, reviews a review folder.
 */
async function launch(ctx, target, dir, prompt, journal) {
  const eventsFile = path.join(dir, 'events.jsonl'), stderrFile = path.join(dir, 'stderr.log');
  const alias = path.join(target.codexHome, 'auth.json');
  const save = () => lib.atomicJson(path.join(dir, 'journal.json'), journal);
  const outcome = { exitCode: null, signal: null, timedOut: false, failure: null, aliasRemoved: false };
  let child = null, closed = null, streams = [];
  try {
    if (fs.existsSync(alias)) throw new Error('Credential alias already exists');
    fs.linkSync('C:/Users/jkind/.codex/auth.json', alias);
    journal.state = 'credential-linked'; save();
    journal.state = 'launching'; journal.args = target.args; save();
    child = spawn(ctx.protocol.codexExe, target.args, { cwd: target.cwd, env: environment.runEnv(target.runDir), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    closed = new Promise(resolve => { child.once('error', e => { outcome.failure = e.message; resolve({}); }); child.once('close', (code, signal) => resolve({ code, signal })); });
    journal.childPid = child.pid || null; journal.state = child.pid ? 'running' : 'spawn-failed'; journal.spawnedAt = new Date().toISOString(); save();
    streams = [pipeline(child.stdout, fs.createWriteStream(eventsFile)), pipeline(child.stderr, fs.createWriteStream(stderrFile))];
    child.stdin.on('error', e => { if (e.code !== 'EPIPE') outcome.failure ||= e.message; });
    child.stdin.end(prompt);
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), ctx.protocol.timeoutMs); });
    const first = await Promise.race([closed, deadline]);
    if (first === 'timeout') { outcome.timedOut = true; journal.state = 'timed-out'; save(); lib.killTree(child.pid); }
    clearTimeout(timer);
    const end = await closed;
    outcome.exitCode = end.code ?? null; outcome.signal = end.signal ?? null;
    for (const s of await Promise.allSettled(streams)) if (s.status === 'rejected') outcome.failure ||= 'stream: ' + s.reason.message;
  } catch (error) {
    outcome.failure ||= error.message;
    if (child?.pid && closed) { lib.killTree(child.pid); await closed; await Promise.allSettled(streams); }
  } finally {
    fs.rmSync(alias, { force: true });
    outcome.aliasRemoved = !fs.existsSync(alias);
  }
  return outcome;
}

function copyIfExists(from, to) {
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true });
}

function collect(ctx, ready, dir, session, outcome, started) {
  let events = [];
  try { events = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)); }
  catch (error) { outcome.failure ||= 'events: ' + error.message; }
  const threadId = events.find(e => e.type === 'thread.started')?.thread_id || null;
  const native = lib.transcriptInfo(ready.codexHome, threadId);
  const accounting = lib.usageFromEvents(events, native.lastTranscriptCounter);
  if (native.transcript) fs.copyFileSync(native.transcript, path.join(dir, 'transcript.jsonl'));
  const snapshot = takeSnapshot(ready.repo, ready.prepared.baselineCommit, path.join(dir, 'snapshot'));
  const clone = path.join(ready.runDir, 'harness');
  copyIfExists(path.join(clone, 'state', 'hook-runs.jsonl'), path.join(dir, 'hook-runs-cumulative.jsonl'));
  copyIfExists(path.join(ready.runDir, 'home', '.claude', 'session-data'), path.join(dir, 'private-session-data'));
  copyIfExists(path.join(ready.runDir, 'tmp', 'claude-docs-gate'), path.join(dir, 'private-docs-gate'));
  const transcript = path.join(dir, 'transcript.jsonl');
  const blocked = fs.existsSync(transcript) ? classify.blockedCalls(transcript) : [];
  const leakReads = fs.existsSync(transcript) && ready.runSpec.config === 'task-only'
    ? classify.folderReads(transcript, ['generated', 'rules', 'skills'].map(n => path.join(clone, n))) : null;
  const status = outcome.timedOut ? 'timed_out' : outcome.failure ? 'failed'
    : outcome.exitCode === 0 && events.some(e => e.type === 'turn.completed') ? 'completed' : 'incomplete';
  const hostAfter = host.snapshot();
  return {
    sessionId: session.id, runId: session.runId, n: session.n, task: ready.runSpec.task, config: ready.runSpec.config, status, threadId,
    elapsedSeconds: (Date.now() - started) / 1000, usage: accounting.usage, usageSource: accounting.source, totalTokens: lib.totalTokens(accounting.usage),
    context: native.context, final: events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').at(-1)?.item.text || '',
    actionCounts: events.reduce((acc, e) => { if (e.type === 'item.completed' && e.item?.type) acc[e.item.type] = (acc[e.item.type] || 0) + 1; return acc; }, {}),
    snapshot, blockedCalls: blocked, cloneInstructionReads: leakReads,
    hostUnchanged: host.sameSnapshot(hostAfter, ctx.frozen.hostAtPrepare),
    hostLeaks: host.leakScan(started, [session.runId, ready.runDir, ready.repo]),
    credentialAliasRemoved: outcome.aliasRemoved, exitCode: outcome.exitCode, exitSignal: outcome.signal, timedOut: outcome.timedOut, failure: outcome.failure
  };
}

async function runSession(protocolFile, id) {
  const ctx = context(protocolFile);
  const session = parseSession(id);
  const dir = assertSlotFree(ctx, session);
  assertOrder(ctx, session);
  const folderId = session.retry && session.n === 1 ? session.runId + '-spare' : runFolder(ctx, session.runId);
  const ready = assertReady(ctx, session, folderId);
  assertNoBoardAbove(ready.repo);  // checked again at launch: a board may have appeared since preparation
  const room = budget.assertRoom(ctx.kind, ctx.protocol.budget, ctx.ledger);
  const release = acquireLock(ctx, id);
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now();
  const journal = { sessionId: id, folder: folderId, state: 'attempted', parentPid: process.pid, childPid: null, startedAt: new Date(started).toISOString(), budgetBefore: room };
  lib.atomicJson(path.join(dir, 'journal.json'), journal);
  try {
    const task = ctx.protocol.tasks[ready.runSpec.task];
    const prompt = fs.readFileSync(path.resolve(lib.studyRoot, task.prompts[String(session.n)]), 'utf8');
    const target = { codexHome: ready.codexHome, runDir: ready.runDir, cwd: ready.repo, args: sessionArgs(ctx, ready) };
    const outcome = await launch(ctx, target, dir, prompt, journal);
    const result = collect(ctx, ready, dir, session, outcome, started);
    lib.atomicJson(path.join(dir, 'result.json'), result);
    budget.record(ctx.kind, ctx.protocol.studyId + '.' + id, result.totalTokens, path.relative(lib.studyRoot, path.join(dir, 'result.json')), ctx.ledger);
    Object.assign(journal, { state: result.status, endedAt: new Date().toISOString(), exitCode: result.exitCode, failure: result.failure });
    lib.atomicJson(path.join(dir, 'journal.json'), journal);
    console.log(JSON.stringify({ id, status: result.status, totalTokens: result.totalTokens, elapsedSeconds: result.elapsedSeconds, blocked: result.blockedCalls.length, hostUnchanged: result.hostUnchanged, hostLeaks: result.hostLeaks.length }));
    if (result.status !== 'completed') process.exitCode = 1;
  } finally { release(); }
}

function skip(protocolFile, id, reason) {
  const ctx = context(protocolFile);
  const session = parseSession(id);
  const dir = assertSlotFree(ctx, session);
  if (!reason || reason.length < 5) throw new Error('A reason is required');
  fs.mkdirSync(dir, { recursive: true });
  lib.atomicJson(path.join(dir, 'journal.json'), { sessionId: id, state: 'not_run', reason, at: new Date().toISOString() });
  lib.atomicJson(path.join(dir, 'result.json'), { sessionId: id, status: 'not_run', reason, threadId: null, totalTokens: 0 });
}

function recover(protocolFile, id, verifiedNoChild) {
  const ctx = context(protocolFile);
  const session = parseSession(id);
  const dir = session.retry && session.n === 1 ? sessionDir(ctx, session.runId + '-spare', 1, true) : sessionDir(ctx, session.runId, session.n, session.retry);
  const journal = journalOf(dir);
  if (!journal || TERMINAL.has(journal.state)) throw new Error('Nothing to recover for ' + id);
  if (lib.pidAlive(journal.parentPid)) throw new Error('Runner process still alive');
  if (!journal.childPid && ['launching', 'spawn-failed'].includes(journal.state) && !verifiedNoChild) throw new Error('Check no Codex child remains, then pass --verified-no-child');
  if (lib.pidAlive(journal.childPid)) lib.killTree(journal.childPid);
  const folder = path.join(ctx.resultsDir, journal.folder);
  fs.rmSync(path.join(folder, 'codex-home', 'auth.json'), { force: true });
  const snapshot = fs.existsSync(path.join(dir, 'snapshot')) ? null : takeSnapshot(path.join(folder, 'repo'), ctx.frozen.runs[journal.folder].baselineCommit, path.join(dir, 'snapshot'));
  lib.atomicJson(path.join(dir, 'result.json'), { sessionId: id, status: 'recovered_aborted', threadId: null, totalTokens: null, snapshot, priorState: journal.state });
  if (!budget.load(ctx.ledger).entries.some(e => e.id === ctx.protocol.studyId + '.' + id)) budget.record(ctx.kind, ctx.protocol.studyId + '.' + id, null, 'recovered: usage unknown', ctx.ledger);
  lib.atomicJson(path.join(dir, 'journal.json'), { ...journal, priorState: journal.state, state: 'recovered_aborted', recoveredAt: new Date().toISOString() });
  fs.rmSync(path.join(ctx.resultsDir, 'study.lock'), { force: true });
}

module.exports = { parseSession, configWithoutProjects, slotRecord, runFolder, assertSlotFree, assertOrder, skip, TERMINAL, context, launch, acquireLock };
if (require.main === module) {
  const [command, protocolFile, id, extra] = process.argv.slice(2);
  const file = protocolFile && path.resolve(protocolFile);
  const fail = error => { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; };
  if (command === 'run') runSession(file, id).catch(fail);
  else if (command === 'skip') { try { skip(file, id, extra); } catch (e) { fail(e); } }
  else if (command === 'recover') { try { recover(file, id, extra === '--verified-no-child'); } catch (e) { fail(e); } }
  else if (command === 'review') require('./review.cjs').runReview(file, id).catch(fail);
  else if (command === 'recover-review') { try { require('./review.cjs').recoverReview(file, id); } catch (e) { fail(e); } }
  else { process.stderr.write('Usage: runner.cjs run|skip|recover|review|recover-review <protocol.json> <session-or-packet-id> [...]\n'); process.exitCode = 2; }
}
