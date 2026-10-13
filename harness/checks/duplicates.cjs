'use strict';
// New duplicate blocks: a window of 6 normalised, meaningful added lines that also appears in an
// earlier added place or in the touched files' code before the change. Consecutive duplicate
// windows form one block, so a 10-line block pasted twice counts once. Same rule as the Study 2
// debt measure (follow-up/study-002/measures/debt.cjs), plus copies of code that already existed.
const crypto = require('node:crypto');

const BLOCK = 6;
const PUNCTUATION_ONLY = /^[\s{}()[\];,:]*$/;
const normalise = line => line.trim().replace(/\s+/g, ' ');
const meaningful = line => !PUNCTUATION_ONLY.test(line);
const hash = text => crypto.createHash('sha1').update(text).digest('hex');
const windows = lines => Array.from({ length: Math.max(0, lines.length - BLOCK + 1) }, (_, i) => hash(lines.slice(i, i + BLOCK).join('\n')));
const clean = lines => lines.map(normalise).filter(meaningful);

/** files: [{ path, before: text before the change, addedRuns: [[added line, ...], ...] }]. */
function newDuplicateBlocks(files) {
  const existing = new Set(files.flatMap(f => windows(clean(String(f.before || '').split('\n')))));
  const seen = new Map();
  const found = { count: 0, examples: [] };
  for (const file of files) {
    file.addedRuns.forEach((run, runIndex) => {
      const lines = clean(run);
      let inBlock = false;
      windows(lines).forEach((key, pos) => {
        const place = { file: file.path, runIndex, pos };
        const repeated = existing.has(key) || (seen.get(key) || []).some(p => p.file !== place.file || p.runIndex !== runIndex || Math.abs(p.pos - pos) >= BLOCK);
        seen.set(key, [...(seen.get(key) || []), place]);
        if (repeated && !inBlock) {
          found.count++;
          if (found.examples.length < 3) found.examples.push({ file: file.path, firstLine: lines[pos].slice(0, 80) });
        }
        inBlock = repeated;
      });
    });
  }
  return found;
}

module.exports = { newDuplicateBlocks, BLOCK };
