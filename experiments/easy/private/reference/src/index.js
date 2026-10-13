'use strict';
function mergeIntervals(intervals) {
  if (!Array.isArray(intervals)) throw new TypeError('intervals must be an array');
  const copy = [];
  for (let index = 0; index < intervals.length; index += 1) {
    if (!Object.hasOwn(intervals, index)) throw new TypeError('intervals must be dense');
    const pair = intervals[index];
    if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('each interval must be a pair');
    const [start, end] = pair;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) throw new TypeError('endpoints must be safe integers');
    if (start > end) throw new RangeError('interval start must not exceed end');
    copy.push([start, end]);
  }
  copy.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  for (const [start, end] of copy) {
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
module.exports = { mergeIntervals };