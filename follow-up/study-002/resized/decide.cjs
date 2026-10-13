'use strict';
// Applies the decision rule fixed in task 11 before any result: lean becomes the recommended default if
// its average audit score is at least 5 of 8, its correctness is lower than stock's on at most one task,
// and its tokens are at most 2x stock's (sums over the six tasks). If audit holds but tokens exceed 3x,
// keep task tracking only for work that needs a record. Also tabulates the code and writing measures.
// Usage: node resized/decide.cjs <measures.json> [out.json]
const fs = require('node:fs');

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pass = r => r.correctness?.wholeTaskPass ?? null;
/** Partial correctness when the whole task failed: groups passed (of 4) or the target-test pass rate. */
const partial = r => (num(r.correctness?.f2pPassRate) ?? (num(r.correctness?.categoriesPassed) === null ? null : r.correctness.categoriesPassed / r.correctness.categoriesTotal));

/** True when lean's correctness on a task is lower than stock's, by the task 11 definition. */
function lowerThanStock(lean, stock) {
  if (pass(stock) === true) return pass(lean) !== true;
  if (pass(lean) === true) return false;
  const [l, s] = [partial(lean), partial(stock)];
  return l !== null && s !== null && l < s;
}

const row = r => r && ({
  pass: pass(r), partial: partial(r), audit: num(r.auditability?.score), tokens: num(r.cost?.run?.total),
  patternsPer1000: num(r.plainLanguage?.script?.messages?.patternsPer1000), duplicateBlocks: num(r.debt?.script?.duplicateBlocks?.total),
  complexityAfter: num(r.debt?.script?.complexityShare?.after), filesOver800: Array.isArray(r.debt?.script?.filesOver800) ? r.debt.script.filesOver800.length : null
});

function decide(runs) {
  const tasks = [...new Set(runs.map(r => r.task))];
  const perTask = tasks.map(task => {
    const get = config => runs.find(r => r.task === task && r.config === config);
    const [stock, lean, full] = ['stock', 'lean', 'full'].map(get);
    const s = row(stock), l = row(lean);
    return { task, stock: s, lean: l, full: row(full), leanLower: stock && lean ? lowerThanStock(lean, stock) : null,
      tokenRatio: s?.tokens && l?.tokens !== null ? Math.round((l.tokens / s.tokens) * 100) / 100 : null };
  });
  const leanAudits = perTask.map(t => t.lean?.audit).filter(v => v !== null && v !== undefined);
  const sum = (config, key) => perTask.reduce((a, t) => a + (t[config]?.[key] ?? 0), 0);
  const averageAudit = leanAudits.length ? leanAudits.reduce((a, b) => a + b, 0) / leanAudits.length : null;
  const tokenRatio = sum('stock', 'tokens') ? sum('lean', 'tokens') / sum('stock', 'tokens') : null;
  const lowerCount = perTask.filter(t => t.leanLower === true).length;
  const criteria = {
    audit: { value: averageAudit, missing: perTask.length - leanAudits.length, met: averageAudit !== null && averageAudit >= 5 },
    correctness: { tasksLower: lowerCount, met: lowerCount <= 1 },
    tokens: { ratio: tokenRatio === null ? null : Math.round(tokenRatio * 100) / 100, met: tokenRatio !== null && tokenRatio <= 2 }
  };
  const all = criteria.audit.met && criteria.correctness.met && criteria.tokens.met;
  const verdict = all ? 'lean becomes the recommended default'
    : criteria.audit.met && tokenRatio > 3 ? 'keep task tracking only for work that needs a record'
      : 'lean does not meet the rule; keep the current default';
  return { criteria, verdict, perTask };
}

module.exports = { decide, lowerThanStock };
if (require.main === module) {
  const measures = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const result = decide(measures.runs);
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ generatedAt: new Date().toISOString(), source: process.argv[2], ...result }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result.criteria, null, 2) + '\n' + result.verdict);
}
