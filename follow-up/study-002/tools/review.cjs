'use strict';
// Blind-review mode of the runner: one reviewer session per packet id from the frozen packet manifest
// (follow-up/study-002/reviews/packets.json, written by measures/blind.cjs before any review starts).
// The runner is the only writer of review usage in the budget ledger (kind "review", 4M allowance).
//
// Manifest entry: { id, prompt: {file, sha256}, schema: {file, sha256} | null, packet: {file, sha256},
// dependsOn: [ids] }. Paths are relative to reviews/. A dependent review receives the final message of
// each dependency after its packet (for example, the key scorer receives the blind auditor's answers).
// The manifest's SHA-256 is pinned in reviews/packets.pin.json at the first review; later reviews
// refuse if it changed. Each review runs stock Codex (no instructions, hooks or custom skills), read-only,
// in an empty private folder with private CODEX_HOME, HOME and TEMP under reviews/runs/<id>/.
// Usage: node tools/runner.cjs review <protocol.json> <packet-id>
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib.cjs');
const budget = require('./budget.cjs');
const environment = require('./environment.cjs');
const host = require('./host.cjs');

const PACKET_ID = /^[a-z0-9][a-z0-9-]{2,40}$/;

const reviewsDir = studyDir => path.join(studyDir, 'reviews');
const runDirOf = (studyDir, id) => path.join(reviewsDir(studyDir), 'runs', id);

/** Check a manifest file reference still has its frozen bytes; returns its absolute path. */
function checkedFile(studyDir, ref) {
  const file = path.resolve(reviewsDir(studyDir), ref.file);
  if (!file.startsWith(reviewsDir(studyDir) + path.sep)) throw new Error('Manifest path escapes reviews/: ' + ref.file);
  if (!fs.existsSync(file) || lib.digest(file) !== ref.sha256) throw new Error(ref.file + ' changed since the packet manifest was written');
  return file;
}

const RETRY = '-retry1';
const readResult = (studyDir, id) => {
  const file = path.join(runDirOf(studyDir, id), 'result.json');
  return fs.existsSync(file) ? lib.readJson(file) : null;
};
/** The result that stands for a packet: its retry's, if a retry was attempted, else the original's. */
const effectiveResult = (studyDir, id) => (fs.existsSync(runDirOf(studyDir, id + RETRY)) ? readResult(studyDir, id + RETRY) : readResult(studyDir, id));

/**
 * Everything one review needs, after every frozen-input check. Throws on any mismatch.
 * `<id>-retry1` re-runs packet <id> once, only if the original finished without starting a model thread
 * (same rule as pilot sessions); it gets its own folder and ledger id.
 */
function plan(studyDir, reviewId) {
  if (!PACKET_ID.test(reviewId || '')) throw new Error('Bad packet id: ' + reviewId);
  const retry = reviewId.endsWith(RETRY);
  const packetId = retry ? reviewId.slice(0, -RETRY.length) : reviewId;
  const manifestFile = path.join(reviewsDir(studyDir), 'packets.json');
  const manifestSha256 = lib.digest(manifestFile);
  const pinFile = path.join(reviewsDir(studyDir), 'packets.pin.json');
  if (fs.existsSync(pinFile) && lib.readJson(pinFile).manifestSha256 !== manifestSha256) throw new Error('The packet manifest changed after the first review');
  const packet = lib.readJson(manifestFile).packets.find(entry => entry.id === packetId);
  if (!packet) throw new Error('Packet id not in the packet manifest: ' + packetId);
  if (fs.existsSync(runDirOf(studyDir, reviewId))) throw new Error('Review already attempted; ids are never replayed: ' + reviewId);
  if (retry) {
    const original = readResult(studyDir, packetId);
    if (!original) throw new Error('Retry needs a finished original review: ' + packetId);
    if (original.threadId) throw new Error('Retry refused: the original review started a model thread');
  }
  const files = {
    prompt: checkedFile(studyDir, packet.prompt),
    schema: packet.schema ? checkedFile(studyDir, packet.schema) : null,
    packet: checkedFile(studyDir, packet.packet)
  };
  const dependencies = (packet.dependsOn || []).map(id => {
    const done = effectiveResult(studyDir, id);
    if (!done || done.status !== 'completed') throw new Error(`Review ${packetId} depends on ${id}, which has not finished`);
    return { id, final: done.final };
  });
  return { studyDir, reviewId, packet, files, dependencies, manifestSha256 };
}

/** Events from events.jsonl, skipping a line cut short by a kill. */
function readEvents(runDir) {
  const file = path.join(runDir, 'events.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}

/**
 * Recover a review whose runner died: kill any Codex child, remove the login link, record the review as
 * recovered_aborted with whatever usage its events show (else unknown), and release the study lock.
 * `where` = { studyDir, resultsDir, ledger, studyId }.
 */
function recoverReviewIn(where, reviewId) {
  const runDir = runDirOf(where.studyDir, reviewId);
  const journalFile = path.join(runDir, 'journal.json');
  const journal = fs.existsSync(journalFile) ? lib.readJson(journalFile) : null;
  if (!journal || ['completed', 'incomplete', 'failed', 'timed_out', 'recovered_aborted'].includes(journal.state)) throw new Error('Nothing to recover for ' + reviewId);
  if (lib.pidAlive(journal.parentPid)) throw new Error('Runner process still alive');
  if (lib.pidAlive(journal.childPid)) lib.killTree(journal.childPid);
  fs.rmSync(path.join(runDir, 'codex-home', 'auth.json'), { force: true });
  const events = readEvents(runDir);
  const usage = lib.usageFromEvents(events, null).usage;
  const threadId = events.find(e => e.type === 'thread.started')?.thread_id || null;
  const ledgerId = where.studyId + '.review.' + reviewId;
  const totalTokens = lib.totalTokens(usage);
  lib.atomicJson(path.join(runDir, 'result.json'), { packetId: reviewId, status: 'recovered_aborted', threadId, usage, totalTokens, final: '', priorState: journal.state });
  if (!budget.load(where.ledger).entries.some(e => e.id === ledgerId)) budget.record('review', ledgerId, totalTokens, 'recovered review', where.ledger);
  lib.atomicJson(journalFile, { ...journal, priorState: journal.state, state: 'recovered_aborted', recoveredAt: new Date().toISOString() });
  const lock = path.join(where.resultsDir, 'study.lock');
  if (fs.existsSync(lock) && JSON.parse(fs.readFileSync(lock, 'utf8')).id === 'review:' + reviewId) fs.rmSync(lock, { force: true });
}

function recoverReview(protocolFile, reviewId) {
  const ctx = require('./runner.cjs').context(protocolFile);
  recoverReviewIn({ studyDir: path.dirname(protocolFile), resultsDir: ctx.resultsDir, ledger: ctx.ledger, studyId: ctx.protocol.studyId }, reviewId);
}

function pinManifest(studyDir, manifestSha256) {
  const pinFile = path.join(reviewsDir(studyDir), 'packets.pin.json');
  if (fs.existsSync(pinFile)) return;
  fs.writeFileSync(pinFile, JSON.stringify({ manifestSha256, pinnedAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
}

/** Prompt, then the packet, then each dependency's output under a neutral heading (no ids). */
function composePrompt(reviewPlan) {
  const parts = [fs.readFileSync(reviewPlan.files.prompt, 'utf8').trimEnd(), fs.readFileSync(reviewPlan.files.packet, 'utf8').trimEnd()];
  reviewPlan.dependencies.forEach((dependency, index) => {
    parts.push(`## Input from an earlier review step${reviewPlan.dependencies.length > 1 ? ' ' + (index + 1) : ''}\n\n` + String(dependency.final).trimEnd());
  });
  return parts.join('\n\n') + '\n';
}

function reviewArgs(protocol, workDir, schemaFile) {
  return ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', workDir, '-m', protocol.model,
    '--disable', 'hooks', '--disable', 'multi_agent', ...(schemaFile ? ['--output-schema', schemaFile] : []), '--json', '-'];
}

/** Private stock environment for one review: CODEX_HOME (host skills off), HOME, TEMP, empty work folder. */
function buildReviewEnvironment(protocol, runDir) {
  for (const name of ['tmp', 'work']) fs.mkdirSync(path.join(runDir, name), { recursive: true });
  environment.buildHome(path.join(runDir, 'home'), null);
  environment.writeCodexHome(path.join(runDir, 'codex-home'), { config: 'stock', model: protocol.model, reasoning: protocol.reasoning, clone: null });
  return { codexHome: path.join(runDir, 'codex-home'), runDir, cwd: path.join(runDir, 'work') };
}

async function runReview(protocolFile, packetId) {
  const runner = require('./runner.cjs');
  const ctx = runner.context(protocolFile);
  if (ctx.kind !== 'session') throw new Error('Reviews run only under the pilot protocol');
  const studyDir = path.dirname(protocolFile);
  const reviewPlan = plan(studyDir, packetId);
  const room = budget.assertRoom('review', ctx.protocol.budget, ctx.ledger);
  const release = runner.acquireLock(ctx, 'review:' + packetId);
  const runDir = runDirOf(studyDir, packetId);
  try {
    pinManifest(studyDir, reviewPlan.manifestSha256);
    fs.mkdirSync(runDir, { recursive: true });
    const started = Date.now();
    const journal = { packetId, state: 'attempted', parentPid: process.pid, childPid: null, startedAt: new Date(started).toISOString(), budgetBefore: room };
    lib.atomicJson(path.join(runDir, 'journal.json'), journal);
    const target = buildReviewEnvironment(ctx.protocol, runDir);
    target.args = reviewArgs(ctx.protocol, target.cwd, reviewPlan.files.schema);
    const prompt = composePrompt(reviewPlan);
    fs.writeFileSync(path.join(runDir, 'prompt-sent.md'), prompt, { flag: 'wx' });
    const outcome = await runner.launch(ctx, target, runDir, prompt, journal);
    let result;
    try { result = collectReview(ctx, reviewPlan, runDir, target, outcome, started); }
    catch (error) {
      // Never lose the usage or the record: fall back to what the events alone show.
      const events = readEvents(runDir);
      const usage = lib.usageFromEvents(events, null).usage;
      result = { packetId, status: 'failed', threadId: events.find(e => e.type === 'thread.started')?.thread_id || null, usage, totalTokens: lib.totalTokens(usage),
        final: '', failure: 'collect: ' + error.message, exitCode: outcome.exitCode, credentialAliasRemoved: outcome.aliasRemoved };
    }
    lib.atomicJson(path.join(runDir, 'result.json'), result);
    budget.record('review', ctx.protocol.studyId + '.review.' + packetId, result.totalTokens, path.relative(lib.studyRoot, path.join(runDir, 'result.json')), ctx.ledger);
    Object.assign(journal, { state: result.status, endedAt: new Date().toISOString(), exitCode: result.exitCode, failure: result.failure });
    lib.atomicJson(path.join(runDir, 'journal.json'), journal);
    console.log(JSON.stringify({ packetId, status: result.status, totalTokens: result.totalTokens, elapsedSeconds: result.elapsedSeconds }));
    if (result.status !== 'completed') process.exitCode = 1;
  } finally { release(); }
}

function collectReview(ctx, reviewPlan, runDir, target, outcome, started) {
  const events = readEvents(runDir);
  const threadId = events.find(e => e.type === 'thread.started')?.thread_id || null;
  const native = lib.transcriptInfo(target.codexHome, threadId);
  if (native.transcript) fs.copyFileSync(native.transcript, path.join(runDir, 'transcript.jsonl'));
  const accounting = lib.usageFromEvents(events, native.lastTranscriptCounter);
  const final = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').at(-1)?.item.text || '';
  fs.writeFileSync(path.join(runDir, 'output.txt'), final, { flag: 'wx' });
  const status = outcome.timedOut ? 'timed_out' : outcome.failure ? 'failed'
    : outcome.exitCode === 0 && events.some(e => e.type === 'turn.completed') ? 'completed' : 'incomplete';
  return {
    packetId: reviewPlan.reviewId, status, threadId, manifestSha256: reviewPlan.manifestSha256,
    packetSha256: reviewPlan.packet.packet.sha256, promptSha256: reviewPlan.packet.prompt.sha256, schemaSha256: reviewPlan.packet.schema?.sha256 ?? null,
    dependsOn: reviewPlan.dependencies.map(d => d.id), elapsedSeconds: (Date.now() - started) / 1000,
    usage: accounting.usage, usageSource: accounting.source, totalTokens: lib.totalTokens(accounting.usage), context: native.context, final,
    actionCounts: events.reduce((acc, e) => { if (e.type === 'item.completed' && e.item?.type) acc[e.item.type] = (acc[e.item.type] || 0) + 1; return acc; }, {}),
    hostUnchanged: host.sameSnapshot(host.snapshot(), ctx.frozen.hostAtPrepare),
    credentialAliasRemoved: outcome.aliasRemoved, exitCode: outcome.exitCode, timedOut: outcome.timedOut, failure: outcome.failure
  };
}

module.exports = { plan, pinManifest, composePrompt, reviewArgs, runReview, recoverReview, recoverReviewIn, effectiveResult, PACKET_ID };
