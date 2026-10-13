'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

async function grade(repoRoot) {
  const checks = [];
  const add = (name, fn) => {
    try { fn(); checks.push({ name, pass: true }); }
    catch (error) { checks.push({ name, pass: false, error: `${error.name}: ${error.message}` }); }
  };
  let mergeIntervals;
  try {
    const target = path.join(repoRoot, 'src', 'index.js');
    delete require.cache[require.resolve(target)];
    ({ mergeIntervals } = require(target));
  } catch (error) {
    return { passed: 0, failed: 1, total: 1, checks: [{ name: 'module exports mergeIntervals', pass: false, error: `${error.name}: ${error.message}` }] };
  }
  add('exports a function', () => assert.equal(typeof mergeIntervals, 'function'));
  if (typeof mergeIntervals === 'function') {
    add('empty input', () => assert.deepEqual(mergeIntervals([]), []));
    add('one interval', () => assert.deepEqual(mergeIntervals([[2, 6]]), [[2, 6]]));
    add('already sorted disjoint intervals', () => assert.deepEqual(mergeIntervals([[1, 2], [5, 7]]), [[1, 2], [5, 7]]));
    add('sorts unsorted intervals', () => assert.deepEqual(mergeIntervals([[8, 9], [-2, 0], [3, 4]]), [[-2, 0], [3, 4], [8, 9]]));
    add('merges partial overlap', () => assert.deepEqual(mergeIntervals([[1, 5], [3, 8]]), [[1, 8]]));
    add('merges touching intervals', () => assert.deepEqual(mergeIntervals([[1, 3], [3, 6]]), [[1, 6]]));
    add('merges nested intervals', () => assert.deepEqual(mergeIntervals([[1, 10], [3, 4], [5, 8]]), [[1, 10]]));
    add('merges duplicate intervals', () => assert.deepEqual(mergeIntervals([[2, 4], [2, 4]]), [[2, 4]]));
    add('handles negative endpoints', () => assert.deepEqual(mergeIntervals([[-8, -3], [-5, 1]]), [[-8, 1]]));
    add('preserves zero-length interval', () => assert.deepEqual(mergeIntervals([[4, 4]]), [[4, 4]]));
    add('keeps separated groups distinct', () => assert.deepEqual(mergeIntervals([[1, 2], [2, 3], [7, 8], [10, 12]]), [[1, 3], [7, 8], [10, 12]]));
    add('returns sorted output', () => assert.deepEqual(mergeIntervals([[9, 10], [1, 1], [4, 5]]), [[1, 1], [4, 5], [9, 10]]));
    add('returns a fresh outer array', () => { const input = [[1, 2]]; assert.notStrictEqual(mergeIntervals(input), input); });
    add('returns fresh interval pairs', () => { const input = [[1, 2]]; assert.notStrictEqual(mergeIntervals(input)[0], input[0]); });
    add('does not mutate ordinary input', () => { const input = [[4, 6], [1, 2]]; const before = structuredClone(input); mergeIntervals(input); assert.deepEqual(input, before); });
    add('accepts frozen outer array and pairs', () => { const input = Object.freeze([Object.freeze([1, 3]), Object.freeze([3, 4])]); assert.deepEqual(mergeIntervals(input), [[1, 4]]); });
    add('rejects null outer value with TypeError', () => assert.throws(() => mergeIntervals(null), TypeError));
    add('rejects non-array outer value with TypeError', () => assert.throws(() => mergeIntervals({}), TypeError));
    add('rejects sparse outer array with TypeError', () => { const input = []; input.length = 1; assert.throws(() => mergeIntervals(input), TypeError); });
    add('rejects pair with wrong length', () => assert.throws(() => mergeIntervals([[1]]), TypeError));
    add('rejects non-array pair', () => assert.throws(() => mergeIntervals([[1, 2].slice(0), { 0: 1, 1: 2, length: 2 }]), TypeError));
    add('rejects NaN endpoint', () => assert.throws(() => mergeIntervals([[NaN, 2]]), TypeError));
    add('rejects infinite endpoint', () => assert.throws(() => mergeIntervals([[1, Infinity]]), TypeError));
    add('rejects unsafe integer endpoint', () => assert.throws(() => mergeIntervals([[Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1]]), TypeError));
    add('uses RangeError for reversed endpoints', () => assert.throws(() => mergeIntervals([[3, 2]]), RangeError));
  }
  const passed = checks.filter(check => check.pass).length;
  return { passed, failed: checks.length - passed, total: checks.length, checks };
}

module.exports = { grade };
if (require.main === module) grade(path.resolve(process.argv[2] || '.')).then(result => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed) process.exitCode = 1;
});