'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeIntervals } = require('../src');

test('merges overlap and touching boundaries into sorted fresh intervals', () => {
  const input = [[5, 8], [1, 3], [3, 4], [12, 12]];
  assert.deepEqual(mergeIntervals(input), [[1, 4], [5, 8], [12, 12]]);
  assert.notStrictEqual(mergeIntervals(input), input);
  assert.deepEqual(input, [[5, 8], [1, 3], [3, 4], [12, 12]]);
});

test('empty input returns an empty array', () => {
  assert.deepEqual(mergeIntervals([]), []);
});

test('rejects invalid intervals and distinguishes reversed endpoints', () => {
  assert.throws(() => mergeIntervals([[2, 1]]), RangeError);
  assert.throws(() => mergeIntervals([[0, Infinity]]), TypeError);
});