'use strict';
// Scores every pilot run with all six measures: correctness, planning and recovery, auditability,
// technical debt, plain language and cost. Reads graded evidence (results/<run>/grade.json) and the parsed
// blind-review answers (reviews/answers.json from `blind.cjs collect`). Missing inputs are reported as
// unknown with a reason, never as 0. Mechanism checks (hook blocks, reads of harness instructions by the
// task-only setup) are reported beside the measures as prerequisites, not results.
// Usage: node measures/score.cjs <protocol.json | pilot/composition.json> <out.json> [--checks-commit <full sha>]
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../tools/lib.cjs');
const evidence = require('./evidence.cjs');
const correctness = require('./correctness.cjs');
const recovery = require('./recovery.cjs');
const audit = require('./auditability.cjs');
const debt = require('./debt.cjs');
const plain = require('./plain_language.cjs');
const cost = require('./cost.cjs');
const { loadChecks } = require('./harness_checks.cjs');

// The lean setup is task tracking with a lighter workflow, so its right guess is "task tracking only".
const EXPECTED_GUESS = { stock: 'no custom setup', 'task-only': 'task tracking only', full: 'full custom harness', lean: 'task tracking only' };

/** Parsed review output of one kind for one run, or { unknown: reason }. */
function reviewOf(answers, runId, kind) {
  const entry = answers?.[runId]?.[kind];
  if (!entry) return { unknown: 'no ' + kind + ' review' };
  if (entry.status !== 'completed') return { unknown: kind + ' review ' + entry.status, entry };
  if (!entry.parsed) return { unknown: kind + ' review reply was not JSON: ' + entry.parseError, entry };
  return { parsed: entry.parsed, entry };
}

function scoreRun(studyDir, runId, answers, checks, pointIds) {
  const ev = evidence.studyTwoRun(studyDir, runId);
  const files = evidence.parseDiff(ev.diffText || '');
  const auditReview = reviewOf(answers, runId, 'audit');
  const keyReview = reviewOf(answers, runId, 'key');
  const clarityReview = reviewOf(answers, runId, 'clarity');
  const recoveryReview = reviewOf(answers, runId, 'recovery');
  // No answers file yet (blind.cjs collect not run): reviewer tokens are unknown, not 0.
  const reviewTokens = answers ? ['audit', 'key', 'clarity', 'recovery'].map(k => answers[runId]?.[k]).filter(Boolean).map(e => ({ totalTokens: e.totalTokens })) : null;
  const correct = correctness.measure(ev);
  const recoveryScript = recovery.measure(ev);
  let decisions = null;
  if (recoveryScript.applicable) {
    try { decisions = recoveryReview.parsed ? recovery.decisionSummary(recoveryReview.parsed, pointIds(ev.task)) : { unknown: recoveryReview.unknown }; }
    catch (error) { decisions = { unknown: 'recovery review invalid: ' + error.message }; }
  }
  return {
    runId, task: ev.task, config: ev.config, sessions: ev.sessions.map(s => ({ n: s.n, status: s.status, threadId: s.threadId })),
    correctness: correct,
    recovery: recoveryScript.applicable ? { ...recoveryScript, decisions, missedAtEnd: correct.missed ?? null } : { applicable: false },
    auditability: keyReview.parsed ? audit.scoreKey(keyReview.parsed) : { score: null, unknown: keyReview.unknown },
    setupGuess: auditReview.parsed ? { guess: auditReview.parsed.setup_guess, right: auditReview.parsed.setup_guess === EXPECTED_GUESS[ev.config] } : { unknown: auditReview.unknown },
    debt: { script: ev.diffText === null ? { unknown: 'no snapshot' } : debt.scriptMeasures(files, ev.repoDir, { checks, baselineCommit: ev.baselineCommit }), rubric: auditReview.parsed ? debt.rubricTotal(auditReview.parsed) : { total: null, unknown: auditReview.unknown } },
    plainLanguage: { script: plain.measureRun(ev, files, checks), clarity: clarityReview.parsed ? clarityReview.parsed.rating : null, clarityUnknown: clarityReview.unknown ?? null },
    cost: cost.measure(ev, reviewTokens),
    mechanism: {
      blocked: ev.sessions.flatMap(s => s.blockedCalls).reduce((acc, b) => ({ ...acc, [b.kind]: (acc[b.kind] || 0) + 1 }), {}),
      cloneInstructionReads: ev.sessions.map(s => s.cloneInstructionReads?.count ?? null)
    }
  };
}

/** `file` is a pilot protocol or pilot/composition.json (runs from several frozen protocols). */
/** checksCommit overrides the runs' pinned harness commit for the checker only (recorded in the output). */
function scoreAll(file, checksCommit) {
  const set = evidence.studySet(file);
  const commits = [...new Set(set.runs.map(r => r.protocol.harnessCommit))];
  if (commits.length !== 1) throw new Error('Runs use different harness commits: ' + commits.join(', '));
  const checks = loadChecks(checksCommit || commits[0]);
  const answersFile = path.join(set.reviewsStudyDir, 'reviews', 'answers.json');
  const answers = fs.existsSync(answersFile) ? lib.readJson(answersFile) : null;
  const pointIds = task => (recovery.decisionPoints(task) || []).map(p => p.id);
  const runs = set.runs.map(r => ({ ...scoreRun(r.studyDir, r.runId, answers, checks, pointIds), protocol: path.relative(lib.studyRoot, r.protocolFile) }));
  return { generatedAt: new Date().toISOString(), checker: { commit: checks.commit, sha256: checks.sha256, files: checks.files, runsPinnedCommit: commits[0] }, reviewsAvailable: Boolean(answers), runs };
}

module.exports = { scoreAll, scoreRun, EXPECTED_GUESS };
if (require.main === module) {
  const [protocolFile, out] = process.argv.slice(2);
  const at = process.argv.indexOf('--checks-commit');
  try {
    if (!protocolFile || !out) throw new Error('Usage: score.cjs <protocol.json | pilot/composition.json> <out.json>');
    const report = scoreAll(path.resolve(protocolFile), at > 0 ? process.argv[at + 1] : null);
    lib.atomicJson(path.resolve(out), report);
    console.log(JSON.stringify({ runs: report.runs.length, reviewsAvailable: report.reviewsAvailable }));
  } catch (error) { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; }
}
