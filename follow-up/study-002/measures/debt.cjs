'use strict';
// Technical-debt measure. Script part, from the diff against the frozen baseline and the final repository:
// lines added and removed, touched files over 800 lines, duplicate blocks of 6+ normalised added lines,
// tests added. Judgement part: a blind reviewer's 6-item rubric, each item 0-2 (2 = no problem).
// No linter is run: the offline wheel caches hold none, and installing one would need the network.
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../tools/lib.cjs');

const BLOCK = 6;
const LONG_FILE = 800;
const RUBRIC = ['duplication', 'dead_code', 'naming_consistency', 'error_handling', 'test_quality', 'change_scope'];
const TEST_PATH = /(^|\/)(tests?|testing)\/|(^|\/)test_[^/]*$|_test\.[a-z]+$|\.test\.[a-z]+$/i;
const TEST_DEF = /^\s*(?:async\s+)?def\s+test_\w*\s*\(|^\s*(?:it|test)\s*\(\s*['"`]/;
const PUNCTUATION_ONLY = /^[\s{}()[\];,:]*$/;

/** Trim and collapse whitespace; blank and punctuation-only lines are dropped (they match everywhere). */
const normalise = line => line.trim().replace(/\s+/g, ' ');
const meaningful = line => !PUNCTUATION_ONLY.test(line);

/**
 * Duplicate blocks among added lines. Every window of BLOCK consecutive meaningful added lines is hashed;
 * a window is a duplicate when the same hash was already seen at a non-overlapping place. Consecutive
 * duplicate windows form one block, so a 10-line block pasted twice counts once.
 */
function duplicateBlocks(diffFiles) {
  const seen = new Map();
  const out = { total: 0, source: 0, test: 0, examples: [] };
  for (const file of diffFiles.filter(f => f.status !== 'deleted')) {
    file.addedRuns.forEach((run, runIndex) => {
      const lines = run.map(normalise).filter(meaningful);
      let inBlock = false;
      for (let pos = 0; pos + BLOCK <= lines.length; pos++) {
        const key = lib.hash(lines.slice(pos, pos + BLOCK).join('\n'));
        const place = { file: file.path, runIndex, pos };
        const earlier = (seen.get(key) || []).some(p => p.file !== place.file || p.runIndex !== runIndex || Math.abs(p.pos - pos) >= BLOCK);
        seen.set(key, [...(seen.get(key) || []), place]);
        if (earlier && !inBlock) {
          out.total++;
          out[TEST_PATH.test(file.path) ? 'test' : 'source']++;
          if (out.examples.length < 5) out.examples.push({ file: file.path, firstLine: lines[pos].slice(0, 120) });
        }
        inBlock = earlier;
      }
    });
  }
  return out;
}

function lineCount(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
}

const SCORED = /\.(py|js|cjs|mjs|jsx|ts|tsx)$/i;

/**
 * Share of cyclomatic complexity held by functions over 10 in the touched Python and JavaScript files,
 * at the baseline commit and in the final repository (the harness checker at the pinned commit).
 * Null when no checker or baseline is given; a share is null when the files hold no functions.
 */
function complexityShare(live, repoDir, { checks, baselineCommit } = {}) {
  if (!checks || !baselineCommit) return null;
  const touched = live.filter(f => SCORED.test(f.path) && fs.existsSync(path.join(repoDir, f.path)));
  const after = Object.fromEntries(touched.map(f => [f.path, fs.readFileSync(path.join(repoDir, f.path), 'utf8')]));
  const before = Object.fromEntries(touched.filter(f => f.status !== 'added').map(f => [f.path, lib.git(['show', baselineCommit + ':' + f.path], repoDir)]));
  const share = files => checks.complexityShare(checks.functionComplexity(files).functions);
  return { before: share(before), after: share(after), files: touched.length };
}

function scriptMeasures(diffFiles, repoDir, complexity) {
  const live = diffFiles.filter(f => f.status !== 'deleted' && f.status !== 'binary');
  return {
    complexityShare: complexityShare(live, repoDir, complexity),
    filesTouched: diffFiles.length,
    linesAdded: diffFiles.reduce((sum, f) => sum + f.added, 0),
    linesRemoved: diffFiles.reduce((sum, f) => sum + f.removed, 0),
    filesOver800: live.map(f => f.path).filter(p => fs.existsSync(path.join(repoDir, p)) && lineCount(path.join(repoDir, p)) > LONG_FILE),
    duplicateBlocks: duplicateBlocks(diffFiles),
    testsAdded: live.flatMap(f => f.addedRuns.flat()).filter(line => TEST_DEF.test(line)).length,
    linter: null
  };
}

/** Rubric total 0-12 from a parsed audit review; null when any item is missing or out of range. */
function rubricTotal(review) {
  const items = Object.fromEntries(RUBRIC.map(name => [name, review?.rubric?.[name]?.score ?? null]));
  const valid = Object.values(items).every(score => Number.isInteger(score) && score >= 0 && score <= 2);
  return { items, total: valid ? Object.values(items).reduce((a, b) => a + b, 0) : null };
}

module.exports = { duplicateBlocks, scriptMeasures, rubricTotal, RUBRIC, BLOCK, TEST_PATH };
