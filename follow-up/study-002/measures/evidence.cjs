'use strict';
// Turns a run folder into one shape every measure reads, for Study 1 runs (results/<id>/) and Study 2
// pilot runs (follow-up/study-002/results/<run>/sessions/s<n>/). Also parses unified diffs.
//
// Evidence = { id, source, task, config, sessions: [{ n, status, usage, totalTokens, elapsedSeconds, final,
//   transcript, diffText }], diffText (end of the last session), repoDir, baselineCommit }
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../tools/lib.cjs');
const { diffFromBaseline } = require('../tools/snapshot.cjs');

const C_ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/** Undo git's C-style quoting ("caf\303\251.md"): octal escapes are UTF-8 bytes. */
function cUnquote(quoted) {
  const body = quoted.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') { bytes.push(...Buffer.from(body[i], 'utf8')); continue; }
    const octal = /^[0-7]{3}/.exec(body.slice(i + 1));
    if (octal) { bytes.push(parseInt(octal[0], 8)); i += 3; }
    else { bytes.push(C_ESCAPES[body[i + 1]] ?? body.charCodeAt(i + 1)); i += 1; }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Strip git's "a/" or "b/" prefix and C-style quoting from a diff header path. */
function headerPath(raw) {
  let value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) value = cUnquote(value);
  return value === '/dev/null' ? null : value.replace(/^[ab]\//, '');
}

/**
 * Parse a unified git diff. Returns one entry per file:
 * { path, status: added|deleted|modified|renamed|binary, added, removed, addedRuns: [[line, ...]] }
 * addedRuns are maximal runs of consecutive added lines within hunks (a removed or context line ends a run).
 */
function parseDiff(text) {
  const files = [];
  let current = null, inHunk = false, run = null;
  const endRun = () => { if (run && run.length) current.addedRuns.push(run); run = null; };
  for (const line of String(text).split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) endRun();
      // The +++/--- headers (or "rename to") give the exact path later; this is the fallback for binary files.
      const quoted = /^diff --git (?:"(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*")$/.exec(line);
      const plain = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      const fallback = quoted ? headerPath(quoted[1]) : plain ? plain[2] : line.slice(11);
      current = { path: fallback, status: 'modified', added: 0, removed: 0, addedRuns: [] };
      files.push(current); inHunk = false; continue;
    }
    if (!current) continue;
    if (!inHunk) {
      if (line.startsWith('new file mode')) current.status = 'added';
      else if (line.startsWith('deleted file mode')) current.status = 'deleted';
      else if (line.startsWith('rename to ')) { const to = line.slice(10).trim(); current.status = 'renamed'; current.path = to.startsWith('"') ? cUnquote(to) : to; }
      else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) current.status = current.status === 'modified' ? 'binary' : current.status;
      else if (line.startsWith('+++ ')) { const p = headerPath(line.slice(4)); if (p) current.path = p; }
      else if (line.startsWith('--- ')) { const p = headerPath(line.slice(4)); if (p && current.status === 'deleted') current.path = p; }
      if (line.startsWith('@@')) inHunk = true;
      continue;
    }
    if (line.startsWith('@@')) { endRun(); continue; }
    if (line.startsWith('+')) { current.added++; (run ||= []).push(line.slice(1)); }
    else if (line.startsWith('-')) { current.removed++; endRun(); }
    else if (line.startsWith('GIT binary patch')) { endRun(); inHunk = false; current.status = 'binary'; }
    else endRun();
  }
  if (current) endRun();
  return files;
}

const readIf = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const readJsonIf = file => (fs.existsSync(file) ? lib.readJson(file) : null);

/** A Study 1 run: one session; the diff is taken now from the retained repo (HEAD is the baseline). */
function studyOneRun(runDir) {
  const result = lib.readJson(path.join(runDir, 'result.json'));
  const repoDir = path.join(runDir, 'repo');
  const baselineCommit = lib.git(['rev-list', '--max-parents=0', 'HEAD'], repoDir).trim().split('\n')[0];
  const diffText = diffFromBaseline(repoDir, baselineCommit);
  const transcript = path.join(runDir, 'transcript.jsonl');
  return {
    id: result.runId, source: 'study1', task: result.task, config: result.condition,
    sessions: [{ n: 1, status: result.status, usage: result.usage, totalTokens: lib.totalTokens(result.usage), elapsedSeconds: result.elapsedSeconds,
      final: result.final || '', transcript: fs.existsSync(transcript) ? transcript : null, diffText }],
    diffText, repoDir, baselineCommit, grade: readJsonIf(path.join(runDir, 'grade.json'))
  };
}

/**
 * A Study 2 pilot run, using the runner's own rules for which folder fills each session slot
 * (a session-1 retry moves the run to its spare folder).
 */
function studyTwoRun(studyDir, runId) {
  const runner = require('../tools/runner.cjs');
  const resultsDir = path.join(studyDir, 'results');
  const frozen = lib.readJson(path.join(resultsDir, 'frozen.json'));
  const prepared = frozen.runs[runId];
  if (!prepared) throw new Error('Run not in the frozen manifest: ' + runId);
  const ctx = { resultsDir };
  const sessions = prepared.sessions.map(n => {
    const slot = runner.slotRecord(ctx, runId, n);
    const result = slot.journal ? readJsonIf(path.join(slot.dir, 'result.json')) : null;
    const transcript = path.join(slot.dir, 'transcript.jsonl');
    return {
      n, status: result?.status ?? 'missing', usage: result?.usage ?? null, totalTokens: result?.totalTokens ?? null,
      elapsedSeconds: result?.elapsedSeconds ?? null, final: result?.final || '', transcript: fs.existsSync(transcript) ? transcript : null,
      diffText: readIf(path.join(slot.dir, 'snapshot', 'diff-from-baseline.patch')), blockedCalls: result?.blockedCalls ?? [],
      cloneInstructionReads: result?.cloneInstructionReads ?? null, threadId: result?.threadId ?? null
    };
  });
  const last = [...sessions].reverse().find(s => s.diffText !== null);
  const folder = runner.runFolder(ctx, runId);
  return {
    id: runId, source: 'study2', task: prepared.task, config: prepared.config, sessions,
    diffText: last ? last.diffText : null, repoDir: path.join(resultsDir, folder, 'repo'), runDir: path.join(resultsDir, folder),
    baselineCommit: prepared.baselineCommit, grade: readJsonIf(path.join(resultsDir, runId, 'grade.json'))
  };
}

/** Pilot run ids in frozen order (each run once). */
function pilotRunIds(studyDir) {
  const frozen = lib.readJson(path.join(studyDir, 'results', 'frozen.json'));
  return [...new Set(frozen.order.map(id => id.replace(/-s[12]$/, '')))];
}

/**
 * The runs a scoring pass covers. `file` is a pilot protocol (all its runs) or a composition file
 * (pilot/composition.json: runs drawn from several frozen protocols). Returns the protocol whose folder
 * holds the reviews, and each run with the study folder and protocol it ran under.
 */
function studySet(file) {
  const spec = lib.readJson(file);
  const base = lib.studyRoot; // composition paths are relative to follow-up/study-002
  const entries = spec.studies
    ? spec.studies.map(s => ({ protocolFile: path.resolve(base, s.protocol), runs: s.runs }))
    : [{ protocolFile: file, runs: null }];
  const runs = entries.flatMap(({ protocolFile, runs: ids }) => {
    const studyDir = path.dirname(protocolFile);
    const protocol = lib.readJson(protocolFile);
    return (ids || pilotRunIds(studyDir)).map(runId => ({ runId, studyDir, protocolFile, protocol }));
  });
  if (new Set(runs.map(r => r.runId)).size !== runs.length) throw new Error('A run id appears twice in ' + file);
  const reviewProtocolFile = spec.studies ? path.resolve(base, spec.reviewProtocol) : file;
  return { reviewProtocolFile, reviewsStudyDir: path.dirname(reviewProtocolFile), runs };
}

module.exports = { parseDiff, studyOneRun, studyTwoRun, pilotRunIds, studySet };
