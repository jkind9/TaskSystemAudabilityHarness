'use strict';
// Contract tests for the resized study's decision rule. Run: node --test follow-up/study-002/resized/selftest.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, lowerThanStock } = require('./decide.cjs');

const run = (task, config, { pass = true, groups = 4, rate, audit = 6, tokens = 1000 } = {}) => ({
  task, config, auditability: { score: audit }, cost: { run: { total: tokens } },
  correctness: rate === undefined ? { wholeTaskPass: pass, categoriesPassed: groups, categoriesTotal: 4 } : { wholeTaskPass: pass, f2pPassRate: rate }
});

test('lower than stock: a lost pass, or a lower partial score when both fail; never when lean passes', () => {
  assert.equal(lowerThanStock(run('t', 'lean', { pass: false }), run('t', 'stock')), true);
  assert.equal(lowerThanStock(run('t', 'lean', { pass: false, groups: 2 }), run('t', 'stock', { pass: false, groups: 3 })), true);
  assert.equal(lowerThanStock(run('t', 'lean', { pass: false, groups: 3 }), run('t', 'stock', { pass: false, groups: 3 })), false);
  assert.equal(lowerThanStock(run('t', 'lean', { pass: false, rate: 0.6 }), run('t', 'stock', { pass: false, rate: 0.7 })), true);
  assert.equal(lowerThanStock(run('t', 'lean'), run('t', 'stock', { pass: false })), false);
});

test('all three criteria met: lean becomes the default; boundaries 5 of 8 and 2x are inclusive', () => {
  const runs = ['a', 'b'].flatMap(t => [run(t, 'stock', { audit: 2 }), run(t, 'lean', { audit: 5, tokens: 2000 })]);
  const d = decide(runs);
  assert.equal(d.criteria.audit.value, 5);
  assert.equal(d.criteria.tokens.ratio, 2);
  assert.equal(d.verdict, 'lean becomes the recommended default');
});

test('two tasks lower, low audit or high cost each fail the rule; audit held at over 3x keeps tracking for records only', () => {
  const lowerTwice = ['a', 'b', 'c'].flatMap(t => [run(t, 'stock'), run(t, 'lean', { pass: t === 'c' })]);
  assert.equal(decide(lowerTwice).criteria.correctness.met, false);
  assert.equal(decide([run('a', 'stock'), run('a', 'lean', { audit: 4.5 })]).criteria.audit.met, false);
  const costly = decide([run('a', 'stock'), run('a', 'lean', { tokens: 3500 })]);
  assert.equal(costly.verdict, 'keep task tracking only for work that needs a record');
  assert.equal(decide([run('a', 'stock'), run('a', 'lean', { tokens: 2500 })]).verdict, 'lean does not meet the rule; keep the current default');
});
