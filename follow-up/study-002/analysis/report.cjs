'use strict';
// Pilot report (task 06): every outcome per run, and the matched difference against stock on the same
// task. No pooling and no significance tests: one run per setup per task. Missing values stay unknown.
// Each cell carries the run's contamination level from the isolation leak (pilot/contamination/).
// Usage: node analysis/report.cjs pilot/measures.json analysis/pilot.json
const path = require('node:path');
const lib = require('../tools/lib.cjs');

// From the transcript scan after the pilot (README "Pilot run", isolation leak): what each run saw of the
// study's own task board. Stock runs have no task tool.
const CONTAMINATION = {
  'restart-task-only': 'serious', 'restart-full': 'serious', 'public-full': 'mild', 'public-task-only': 'mild'
};

const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const OUTCOMES = {
  pass: r => (r.correctness?.wholeTaskPass === true ? 1 : r.correctness?.wholeTaskPass === false ? 0 : null),
  publicTargetTests: r => num(r.correctness?.f2pPassRate),
  audit: r => num(r.auditability?.score),
  auditWrong: r => num(r.auditability?.wrong),
  debtRubric: r => num(r.debt?.rubric?.total),
  filesOver800: r => (Array.isArray(r.debt?.script?.filesOver800) ? r.debt.script.filesOver800.length : null),
  duplicateBlocks: r => num(r.debt?.script?.duplicateBlocks?.total),
  linesAdded: r => num(r.debt?.script?.linesAdded),
  testsAdded: r => num(r.debt?.script?.testsAdded),
  clarity: r => num(r.plainLanguage?.clarity),
  bannedPer1000: r => num(r.plainLanguage?.script?.messages?.bannedPer1000),
  messageFlesch: r => num(r.plainLanguage?.script?.messages?.flesch),
  session2TokensBeforeFirstEdit: r => num(r.recovery?.discovery?.tokensBefore),
  decisionsKept: r => num(r.recovery?.decisions?.kept),
  tokens: r => num(r.cost?.run?.total),
  minutes: r => (num(r.cost?.run?.elapsedSeconds) === null ? null : Math.round(r.cost.run.elapsedSeconds / 6) / 10),
  reviewTokens: r => num(r.cost?.run?.reviewTokens)
};

const round = value => (value === null ? null : Math.round(value * 1000) / 1000);

/** outcome -> task -> config -> { value, diffVsStock, ratioVsStock, contamination }. */
function matched(runs, contamination = CONTAMINATION) {
  const out = {};
  for (const [name, get] of Object.entries(OUTCOMES)) {
    out[name] = {};
    for (const task of [...new Set(runs.map(r => r.task))]) {
      const stock = runs.find(r => r.task === task && r.config === 'stock');
      const base = stock ? get(stock) : null;
      out[name][task] = {};
      for (const r of runs.filter(x => x.task === task)) {
        const value = get(r);
        const known = value !== null && base !== null;
        out[name][task][r.config] = {
          value, diffVsStock: known ? round(value - base) : null,
          ratioVsStock: known && base !== 0 ? round(value / base) : null,
          contamination: contamination[r.runId] || 'none'
        };
      }
    }
  }
  return out;
}

/** One table cell: the value, its difference from stock, and a contamination mark. */
function cell(entry) {
  if (!entry || entry.value === null) return 'unknown';
  const diff = entry.diffVsStock === null || entry.diffVsStock === 0 ? '' : ` (${entry.diffVsStock > 0 ? '+' : ''}${entry.diffVsStock})`;
  return entry.value + diff + (entry.contamination === 'none' ? '' : ` [${entry.contamination}]`);
}

function markdown(rows) {
  const lines = ['| Outcome | Task | Stock | Task-only | Full |', '|---|---|---|---|---|'];
  for (const [name, tasks] of Object.entries(rows)) {
    for (const [task, configs] of Object.entries(tasks)) {
      lines.push(`| ${name} | ${task} | ${cell(configs.stock)} | ${cell(configs['task-only'])} | ${cell(configs.full)} |`);
    }
  }
  return lines.join('\n');
}

module.exports = { matched, cell, markdown, OUTCOMES, CONTAMINATION };
if (require.main === module) {
  const [measuresFile, out] = process.argv.slice(2);
  const measures = lib.readJson(path.resolve(measuresFile));
  // The public grader reports a target-test pass rate; correctness.cjs keeps it as f2pPassRate.
  const rows = matched(measures.runs);
  lib.atomicJson(path.resolve(out), { generatedAt: new Date().toISOString(), source: measuresFile, measuresGeneratedAt: measures.generatedAt, contamination: CONTAMINATION, rows });
  console.log(markdown(rows));
}
