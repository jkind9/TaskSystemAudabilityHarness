'use strict';
// A run must not sit below any folder that holds a task board. In the pilot, run folders sat inside
// this study's folder; the harness task tool searched upward, found the study's own task_list/, and
// two runs read the study plan or another run's plan (FINDINGS.md, "The isolation leak").
const fs = require('node:fs');
const path = require('node:path');

const BOARDS = ['task_list', path.join('docs', 'tasks')];

/** Every task board in the folders above dir (dir itself excluded), nearest first. */
function boardsAbove(dir) {
  const found = [];
  for (let p = path.dirname(path.resolve(dir)); ; p = path.dirname(p)) {
    for (const board of BOARDS) if (fs.existsSync(path.join(p, board))) found.push(path.join(p, board));
    if (path.dirname(p) === p) return found;
  }
}

function assertNoBoardAbove(dir) {
  const found = boardsAbove(dir);
  if (found.length) throw new Error('Refusing: a task board above ' + dir + ' could leak into the run: ' + found.join(', '));
}

module.exports = { boardsAbove, assertNoBoardAbove };
