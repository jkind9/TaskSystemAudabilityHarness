'use strict';
function mergeIntervals(input) { input.sort((a, b) => a[0] - b[0]); const out = []; for (const pair of input) { const last = out[out.length - 1]; if (last && pair[0] <= last[1]) last[1] = Math.max(last[1], pair[1]); else out.push(pair); } return out; }
module.exports = { mergeIntervals };