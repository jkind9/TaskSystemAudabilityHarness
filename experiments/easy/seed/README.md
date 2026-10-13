# Merge touching intervals

Implement `mergeIntervals(intervals)` in `src/index.js`. The input is an array of two-item arrays `[start, end]`. Both endpoints must be safe integers and `start` must be no greater than `end`.

Return a new array sorted by start. Merge intervals that overlap or touch: `[1, 3]` and `[3, 5]` become `[1, 5]`. Keep disjoint intervals separate. The empty input returns a new empty array. Do not change the input or any pair in it; the input and pairs may be frozen.

Throw `TypeError` when the outer value is not a dense array, a pair is not a two-item array, or an endpoint is not a safe integer. Throw `RangeError` when a valid pair has `start > end`. Validate the complete input before returning a result.

Run the public tests with `node test/mergeIntervals.test.js` from this directory. The implementation uses CommonJS and exports `{ mergeIntervals }`.