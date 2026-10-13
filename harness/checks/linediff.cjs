'use strict';
// Line diff between two texts, so the checks never need to start git: the added lines as runs (a run
// ends at an unchanged line, as git's hunks do), their 1-based line numbers in the new text, and the
// number of removed lines. Line endings are ignored.
// The common start and end are trimmed; the changed middle is matched with a longest-common-subsequence
// table, or treated as fully replaced when it is too large to tabulate (over 4 million cells).
const MAX_CELLS = 4e6;
const split = text => { const lines = String(text || '').replace(/\r\n/g, '\n').split('\n'); if (lines.at(-1) === '') lines.pop(); return lines; };

function lineDiff(beforeText, afterText) {
  const a = split(beforeText), b = split(afterText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const A = a.slice(start, endA), B = b.slice(start, endB);
  const ops = (A.length + 1) * (B.length + 1) > MAX_CELLS ? [...A.map(() => 'del'), ...B.map(line => ['ins', line])] : matchMiddle(A, B);
  const addedRuns = [], addedLines = [];
  let run = null, removed = 0, line = start;
  for (const op of ops) {
    if (op === 'eq') { run = null; line++; }
    else if (op === 'del') removed++;
    else { if (!run) addedRuns.push(run = []); run.push(op[1]); addedLines.push(++line); }
  }
  return { addedRuns, addedLines, removed };
}

/** Edit operations in order: 'eq', 'del', or ['ins', line]. */
function matchMiddle(A, B) {
  const width = B.length + 1;
  const table = new Uint32Array((A.length + 1) * width);
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      table[i * width + j] = A[i] === B[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) { ops.push('eq'); i++; j++; }
    else if (j < B.length && (i === A.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) ops.push(['ins', B[j++]]);
    else { ops.push('del'); i++; }
  }
  return ops;
}

module.exports = { lineDiff };
