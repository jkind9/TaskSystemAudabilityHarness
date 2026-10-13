'use strict';
function mergeIntervals(input) { const out = []; for (const pair of input) { const last = out[out.length - 1]; if (last && pair[0] <= last[1]) last[1] = Math.max(last[1], pair[1]); else out.push(pair.slice()); } return out; }
module.exports = { mergeIntervals };