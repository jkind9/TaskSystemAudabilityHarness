'use strict';
// Dry run of the scripted measures (correctness, cost, plain language, debt script) on Study 1's 18 runs.
// The values are a reference point for the pilot, not results: Study 1's tasks were small and fully
// specified. Model-scored parts are not run here, to save budget.
// Usage: node measures/dryrun.cjs <full harness commit with checks/, 41e931c or later> [out.json]
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../tools/lib.cjs');
const evidence = require('./evidence.cjs');
const correctness = require('./correctness.cjs');
const cost = require('./cost.cjs');
const plain = require('./plain_language.cjs');
const debt = require('./debt.cjs');
const { loadChecks } = require('./harness_checks.cjs');

const STUDY_ONE = path.resolve(lib.studyRoot, '..', '..', 'results');

function dryRun(commit) {
  const checks = loadChecks(commit);
  const runs = fs.readdirSync(STUDY_ONE, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(STUDY_ONE, e.name, 'result.json'))).map(e => e.name).sort();
  const rows = runs.map(id => {
    const ev = evidence.studyOneRun(path.join(STUDY_ONE, id));
    const files = evidence.parseDiff(ev.diffText);
    return {
      id, task: ev.task, config: ev.config,
      correctness: correctness.measure(ev), cost: cost.measure(ev).run,
      plainLanguage: plain.measureRun(ev, files, checks), debt: debt.scriptMeasures(files, ev.repoDir)
    };
  });
  return { generatedAt: new Date().toISOString(), source: 'Study 1 results/', checker: { commit, sha256: checks.sha256 }, runs: rows.length, rows };
}

module.exports = { dryRun };
if (require.main === module) {
  const [commit, out] = process.argv.slice(2);
  const report = dryRun(commit);
  if (out) lib.atomicJson(path.resolve(out), report);
  for (const r of report.rows) {
    console.log([r.id.padEnd(22), r.correctness.wholeTaskPass ? 'pass' : 'FAIL', String(r.cost.total).padStart(8),
      'banned/1k msg ' + r.plainLanguage.messages.bannedPer1000, 'flesch ' + r.plainLanguage.messages.flesch,
      '+' + r.debt.linesAdded + '/-' + r.debt.linesRemoved, 'dup ' + r.debt.duplicateBlocks.total, 'tests+ ' + r.debt.testsAdded].join('  '));
  }
}
