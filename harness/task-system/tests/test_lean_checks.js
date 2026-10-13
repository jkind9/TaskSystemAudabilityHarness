'use strict';
// End-of-task checks used by the lean profile's `task.js finish`. Each check is tested firing and
// staying quiet. Run: node --test task-system/tests/test_lean_checks.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CHECKS = path.resolve(__dirname, '..', '..', 'checks');
const { newDuplicateBlocks } = require(path.join(CHECKS, 'duplicates.cjs'));
const { functionComplexity, complexityShare } = require(path.join(CHECKS, 'complexity.cjs'));
const { prosePatterns } = require(path.join(CHECKS, 'prose.cjs'));
const { deadCode } = require(path.join(CHECKS, 'deadcode.cjs'));

const block = n => Array.from({ length: n }, (_, i) => '  total = total + values[' + i + ']');

test('duplicates: a 6-line block pasted twice counts once, as one block', () => {
  const lines = [...block(8), 'print(total)', ...block(8)];
  const found = newDuplicateBlocks([{ path: 'a.py', before: '', addedRuns: [lines] }]);
  assert.equal(found.count, 1);
  assert.equal(found.examples[0].file, 'a.py');
});

test('duplicates: an added block copied from existing code counts', () => {
  const found = newDuplicateBlocks([{ path: 'b.py', before: block(6).join('\n') + '\n', addedRuns: [block(6)] }]);
  assert.equal(found.count, 1);
});

test('duplicates: 5 repeated lines, blank or bracket-only lines do not count', () => {
  const quiet = newDuplicateBlocks([{ path: 'c.py', before: '', addedRuns: [[...block(5), 'x = 1', ...block(5)], ['}', '', ')', '}', '', ')', '}', '', ')', '}', '', ')']] }]);
  assert.equal(quiet.count, 0);
});


test('complexity: python functions get McCabe-style scores; share counts only those over 10', () => {
  const branches = Array.from({ length: 11 }, (_, i) => '    if x == ' + i + ':\n        return ' + i).join('\n');
  const source = 'def simple(x):\n    return x\n\ndef branchy(x):\n' + branches + '\n    return -1\n';
  const scores = functionComplexity({ 'm.py': source });
  assert.equal(scores.ok, true, scores.reason);
  const byName = Object.fromEntries(scores.functions['m.py'].map(f => [f.name, f.cc]));
  assert.equal(byName.simple, 1);
  assert.equal(byName.branchy, 12);
  assert.equal(complexityShare(scores.functions), 12 / 13);
});

test('complexity: python source with non-ASCII text is scored (stdin read as UTF-8, not the Windows code page)', () => {
  const scores = functionComplexity({ 'u.py': 'def f(x):\n    return "名字" if x else "é"\n' });
  assert.equal(scores.ok, true, scores.reason);
  assert.deepEqual(scores.functions['u.py'].map(f => [f.name, f.cc]), [['f', 2]]);
});

test('complexity: no function over 10 gives a share of 0, and no functions gives null', () => {
  const scores = functionComplexity({ 'q.py': 'def f(a):\n    return a and a\n', 'empty.py': 'X = 1\n' });
  assert.equal(complexityShare(scores.functions), 0);
  assert.equal(complexityShare({ 'empty.py': [] }), null);
});

test('complexity: javascript functions are scored approximately', () => {
  const js = 'function f(a) {\n  if (a) return 1;\n  for (const x of a) { if (x && a) return 2; }\n  return 0;\n}\nconst g = (b) => {\n  return b;\n};\n';
  const scores = functionComplexity({ 'f.js': js });
  const byName = Object.fromEntries(scores.functions['f.js'].map(f => [f.name, f.cc]));
  assert.equal(byName.f, 5);
  assert.equal(byName.g, 1);
});

test('prose: a banned word is a hit, the same word in quotes or backticks is not', () => {
  assert.equal(prosePatterns('We leverage the cache.').hits.length, 1);
  assert.equal(prosePatterns('The checker flags "leverage" and `leverage` as examples.').hits.length, 0);
});

test('prose: contrast cliche, three same openings, one-line closer and bold labels fire', () => {
  const kinds = text => prosePatterns(text).hits.map(h => h.pattern);
  assert.deepEqual(kinds("It's not a cache, it's a ledger of reads."), ['contrast']);
  assert.deepEqual(kinds('Tests run first. Tests run fast. Tests run often.'), ['same-opening']);
  assert.deepEqual(kinds('The storage keeps a version marker and old files load.\n\nThat changes everything.'), ['one-line-closer']);
  assert.deepEqual(kinds('- **Speed:** fast\n- **Size:** small\n- **Cost:** low\n'), ['bold-labels']);
});

test('prose: near misses stay quiet', () => {
  const quiet = text => prosePatterns(text).hits.length;
  assert.equal(quiet('It is not cached, so the second read hits the disk.'), 0);
  assert.equal(quiet('Tests run first. Then the build runs. Tests run again at the end.'), 0);
  assert.equal(quiet('Old files load unchanged; tested by test_read_old_format with 3 fixtures.'), 0);
  assert.equal(quiet('- **Speed:** fast\n- Size: small\n- Cost: low\n'), 0);
  assert.equal(prosePatterns('one two three').words, 3);
});

test('dead code: a missing tool is reported as not checked, never as zero', () => {
  const result = deadCode({ root: process.cwd(), python: [path.join(CHECKS, 'nothing.py')], javascript: [] }, { pythonExe: 'python-that-does-not-exist' });
  assert.equal(result.count, null);
  assert.match(result.note, /vulture not installed/);
});
