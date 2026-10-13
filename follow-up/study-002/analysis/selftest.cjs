'use strict';
// Contract tests for the pilot report (task 06). Run: node --test follow-up/study-002/analysis/selftest.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const report = require('./report.cjs');

/** A scored run in the shape pilot/measures.json uses, with only the fields the report reads. */
const run = (runId, task, config, { tokens, audit, pass }) => ({
  runId, task, config,
  cost: { run: { total: tokens, elapsedSeconds: 60, reviewTokens: 10 } },
  auditability: { score: audit },
  correctness: { wholeTaskPass: pass },
  debt: { script: { linesAdded: 1, duplicateBlocks: { total: 0 }, filesOver800: [] }, rubric: { total: 10 } },
  plainLanguage: { script: { messages: { bannedPer1000: 0, flesch: 50 } }, clarity: 4 },
  recovery: { applicable: false },
  setupGuess: { right: false }
});

test('matched differences against stock, per task', () => {
  const rows = report.matched([
    run('t-stock', 't', 'stock', { tokens: 100, audit: 2, pass: true }),
    run('t-task-only', 't', 'task-only', { tokens: 400, audit: 6.5, pass: false }),
    run('t-full', 't', 'full', { tokens: 300, audit: 6, pass: true })
  ]);
  assert.deepEqual(rows.tokens.t['task-only'], { value: 400, diffVsStock: 300, ratioVsStock: 4, contamination: 'none' });
  assert.deepEqual(rows.audit.t.full, { value: 6, diffVsStock: 4, ratioVsStock: 3, contamination: 'none' });
  assert.equal(rows.audit.t.stock.diffVsStock, 0);
  assert.equal(rows.pass.t['task-only'].value, 0, 'a fail is 0, a pass is 1');
});

test('a missing measure is unknown, never 0', () => {
  const rows = report.matched([
    run('u-stock', 'u', 'stock', { tokens: 100, audit: null, pass: null }),
    run('u-full', 'u', 'full', { tokens: null, audit: 7, pass: true })
  ]);
  assert.equal(rows.audit.u.stock.value, null);
  assert.equal(rows.audit.u.full.diffVsStock, null, 'no stock value -> no difference');
  assert.equal(rows.tokens.u.full.ratioVsStock, null);
  assert.equal(rows.pass.u.stock.value, null);
  assert.equal(report.cell(rows.audit.u.stock), 'unknown');
});

test('contamination flags are carried into every cell', () => {
  const rows = report.matched([run('restart-full', 'restart', 'full', { tokens: 1, audit: 1, pass: true })],
    { 'restart-full': 'serious' });
  assert.equal(rows.tokens.restart.full.contamination, 'serious');
  assert.match(report.cell(rows.tokens.restart.full), /serious/);
});
