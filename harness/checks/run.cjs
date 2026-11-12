'use strict';
// The end-of-task checks, run once by `task.js finish` (lean profile). Compares the working tree
// with the last commit: the files changed, new duplicate blocks, complexity share before and after,
// dead code on added lines, prose patterns in the task record and the docs it changed, and code
// files over 800 lines. Only a new duplicate block or a code file over 800 lines that grew refuses.
// The last commit is read straight from .git and the diff is computed here, because inside Codex's
// Windows sandbox Node cannot start any other program; the git program is only a fallback reader.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { newDuplicateBlocks } = require('./duplicates.cjs');
const { functionComplexity, complexityShare, PYTHON, SCRIPT } = require('./complexity.cjs');
const { deadCode } = require('./deadcode.cjs');
const { prosePatterns } = require('./prose.cjs');
const { headFiles, workingFiles } = require('./gitread.cjs');
const { lineDiff } = require('./linediff.cjs');

const LONG_FILE = Number(process.env.ECC_FILE_SIZE_LIMIT) || 800;
const CODE = /\.(ts|tsx|js|jsx|cjs|mjs|py|go|rs|java|kt|cpp|c|h|hpp|cs|rb|php|swift|dart)$/i;
const DOC = /\.(md|rst|txt)$/i;
const BOARD = /^(task_list|docs\/tasks)\//;

function git(root, args) {
  const r = spawnSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { ok: false, reason: 'git cannot start (' + (r.error.code || r.error.message) + ')' };
  if (r.status !== 0) return { ok: false, reason: 'git ' + args[0] + ' failed: ' + r.stderr.trim().split('\n')[0] };
  return { ok: true, out: r.stdout };
}

/** The last commit's file names and a reader: from .git directly, else from the git program. */
function lastCommit(root) {
  try {
    const head = headFiles(root);
    return { ok: true, names: [...head.files.keys()], read: head.read };
  } catch (error) {
    const list = git(root, ['ls-tree', '-r', '--name-only', 'HEAD']);
    if (!list.ok) return { ok: false, reason: 'cannot read the last commit (' + error.message + '; ' + list.reason + ')' };
    return { ok: true, names: list.out.split('\n').filter(Boolean), read: name => git(root, ['show', 'HEAD:' + name]).out || '' };
  }
}

const readText = file => { try { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const lineCount = text => (text ? text.replace(/\n$/, '').split('\n').length : 0);

/** Changed files outside the task board, with their text before and after and their added lines. */
function changes(root) {
  const head = lastCommit(root);
  if (!head.ok) return head;
  const tracked = new Set(head.names);
  const present = workingFiles(root, tracked);
  const names = [...new Set([...head.names, ...present])].filter(n => !BOARD.test(n)).sort();
  const files = [];
  for (const name of names) {
    const before = tracked.has(name) ? head.read(name).replace(/\r\n/g, '\n') : '';
    const after = readText(path.join(root, name));
    if (before === after) continue;
    if ((before + after).includes('\u0000')) { files.push({ path: name, before: '', after: '', addedRuns: [], addedLines: new Set(), added: 0, removed: 0 }); continue; }
    const diff = lineDiff(before, after);
    files.push({ path: name, before, after, addedRuns: diff.addedRuns, addedLines: new Set(diff.addedLines), added: diff.addedLines.length, removed: diff.removed });
  }
  return { ok: true, files, unreadable: present.skipped };
}

/** Everything `finish` records. taskText is the task file, judged for prose with the changed docs.
 *  skip(path) is true for a changed file that belongs to another session's open task. */
function runChecks({ root, taskText = '', pythonExe = 'python', skip = () => false }) {
  const collected = changes(root);
  const result = { git: collected.ok, reason: collected.reason || '', unreadable: collected.unreadable || [], files: [], refusals: [] };
  const record = prosePatterns(taskText);
  if (!collected.ok) return { ...result, duplicates: null, complexity: null, deadCode: null, prose: record, overLimit: [] };
  const files = collected.files.filter(f => !skip(f.path));
  const code = files.filter(f => CODE.test(f.path) && f.after);
  result.files = files.map(f => ({ path: f.path, added: f.added, removed: f.removed, lines: lineCount(f.after) }));
  // Same rule as the size gate: a file already over the limit at the last commit may stay or
  // shrink; only growth past max(limit, its committed size) refuses.
  result.overLimit = code.map(f => ({ path: f.path, lines: lineCount(f.after), was: lineCount(f.before) })).filter(f => f.lines > LONG_FILE);
  result.duplicates = newDuplicateBlocks(code.map(f => ({ path: f.path, before: f.before, addedRuns: f.addedRuns })));
  const scored = files => functionComplexity(Object.fromEntries(files), { pythonExe });
  const scorable = code.filter(f => PYTHON.test(f.path) || SCRIPT.test(f.path));
  const after = scored(scorable.map(f => [f.path, f.after]));
  const before = scored(scorable.filter(f => f.before).map(f => [f.path, f.before]));
  const method = after.method && after.method !== 'python ast' ? after.method : '';
  result.complexity = { before: complexityShare(before.functions), after: complexityShare(after.functions), note: [after.reason, method].filter(Boolean).join('; ') };
  const dead = deadCode({ root, python: scorable.filter(f => PYTHON.test(f.path)).map(f => path.join(root, f.path)), javascript: scorable.filter(f => SCRIPT.test(f.path)).map(f => path.join(root, f.path)) }, { pythonExe });
  if (dead.count !== null) {
    const rel = file => path.relative(root, file).replace(/\\/g, '/');
    const added = dead.findings.filter(f => code.find(c => c.path === rel(f.file))?.addedLines.has(f.line));
    result.deadCode = { count: added.length, note: dead.note, examples: added.slice(0, 3).map(f => rel(f.file) + ':' + f.line + ' ' + f.text) };
  } else result.deadCode = { count: null, note: dead.note };
  const docs = files.filter(f => DOC.test(f.path)).map(f => f.addedRuns.flat().join('\n')).join('\n\n');
  const docProse = prosePatterns(docs);
  const words = record.words + docProse.words, hits = [...record.hits, ...docProse.hits];
  result.prose = { words, hits, per1000: words ? Math.round((hits.length / words) * 100000) / 100 : null };
  if (result.duplicates.count) result.refusals.push(result.duplicates.count + ' new duplicate block(s), e.g. ' + result.duplicates.examples.map(e => e.file + ': "' + e.firstLine + '"').join('; '));
  for (const f of result.overLimit.filter(f => f.lines > f.was)) result.refusals.push(f.path + ' is ' + f.lines + ' lines (limit ' + LONG_FILE + (f.was > LONG_FILE ? ', was ' + f.was : '') + ')');
  return result;
}

module.exports = { runChecks, changes };
