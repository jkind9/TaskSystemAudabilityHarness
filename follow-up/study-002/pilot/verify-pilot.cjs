'use strict';
// Task 05's completeness check over every protocol in pilot/composition.json. Exits 1 on any failure:
// - every session in each protocol's frozen order has a terminal journal; a session that ran left the
//   host unchanged and removed its credential alias;
// - the ledger: each session or review that ran has exactly one entry, equal to its result.json usage;
//   pilot sessions stay within the largest session allowance (the ledger is shared) and reviews within theirs;
// - every run named in the composition has a grade or a recorded reason, and an entry in the measures output.
// Usage: node pilot/verify-pilot.cjs pilot/composition.json <measures.json>
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../tools/lib.cjs');
const budget = require('../tools/budget.cjs');
const runner = require('../tools/runner.cjs');
const review = require('../tools/review.cjs');
const { studySet } = require('../measures/evidence.cjs');

function checkSessions(protocolFile, ledger, failures) {
  const protocol = lib.readJson(protocolFile);
  const ctx = { resultsDir: path.join(path.dirname(protocolFile), 'results') };
  const entryOf = id => ledger.entries.filter(e => e.id === protocol.studyId + '.' + id);
  for (const runSpec of protocol.runs) {
    for (const n of runSpec.sessions) {
      const id = `${runSpec.id}-s${n}`;
      const slot = runner.slotRecord(ctx, runSpec.id, n);
      if (!slot.journal || !runner.TERMINAL.has(slot.journal.state)) { failures.push(`${protocol.studyId} ${id}: no terminal journal`); continue; }
      const result = lib.readJson(path.join(slot.dir, 'result.json'));
      if (result.status === 'not_run') continue;
      if (result.hostUnchanged === false) failures.push(`${id}: host settings changed`);
      if (result.credentialAliasRemoved === false) failures.push(`${id}: credential alias left behind`);
      const ledgerId = path.basename(slot.dir).endsWith('-retry1') ? id + '-retry1' : id;
      const entries = entryOf(ledgerId);
      if (entries.length !== 1) failures.push(`${id}: ${entries.length} ledger entries`);
      else if (entries[0].tokens !== result.totalTokens) failures.push(`${id}: ledger ${entries[0].tokens} != result ${result.totalTokens}`);
    }
  }
  return protocol;
}

function checkReviews(set, ledger, failures) {
  const studyId = lib.readJson(set.reviewProtocolFile).studyId;
  const runsDir = path.join(set.reviewsStudyDir, 'reviews', 'runs');
  for (const id of fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : []) {
    const file = path.join(runsDir, id, 'result.json');
    if (!fs.existsSync(file)) { failures.push(`review ${id}: no result (recover it with runner.cjs recover-review)`); continue; }
    const entries = ledger.entries.filter(e => e.id === studyId + '.review.' + id);
    const tokens = lib.readJson(file).totalTokens;
    if (entries.length !== 1 || entries[0].tokens !== tokens) failures.push(`review ${id}: ledger does not match result (${entries.length} entries)`);
  }
}

function verify(file, measuresFile) {
  const set = studySet(file);
  const failures = [];
  const ledger = budget.load(path.join(lib.studyRoot, 'budget.json'));
  const protocols = [...new Set(set.runs.map(r => r.protocolFile))].map(p => checkSessions(p, ledger, failures));
  checkReviews(set, ledger, failures);
  const totals = budget.totals(ledger);
  const sessionCap = Math.max(...protocols.map(p => p.budget.sessions));
  const reviewCap = Math.max(...protocols.map(p => p.budget.reviews));
  if (totals.sessions > sessionCap) failures.push(`budget: sessions ${totals.sessions} > ${sessionCap}`);
  if (totals.reviews > reviewCap) failures.push(`budget: reviews ${totals.reviews} > ${reviewCap}`);
  const gradingFile = path.join(lib.studyRoot, 'pilot', 'grading.json');
  const grading = fs.existsSync(gradingFile) ? lib.readJson(gradingFile).runs : [];
  const measures = measuresFile && fs.existsSync(measuresFile) ? lib.readJson(measuresFile).runs : [];
  for (const r of set.runs) {
    const graded = fs.existsSync(path.join(r.studyDir, 'results', r.runId, 'grade.json')) || grading.some(g => g.runId === r.runId && g.reason);
    if (!graded) failures.push(`${r.runId}: no grade and no recorded reason`);
    if (!measures.some(m => m.runId === r.runId)) failures.push(`${r.runId}: no measures entry`);
  }
  return { ok: failures.length === 0, failures, totals: { sessions: totals.sessions, reviews: totals.reviews, probes: totals.probes }, caps: { sessions: sessionCap, reviews: reviewCap } };
}

module.exports = { verify };
if (require.main === module) {
  const report = verify(path.resolve(process.argv[2]), process.argv[3] && path.resolve(process.argv[3]));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
