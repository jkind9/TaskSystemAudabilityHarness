'use strict';
// The harness's own end-of-task checkers (checks/ and the shared word list) at a pinned commit,
// exported from git into a temporary folder and loaded from there. The study measures prose patterns
// and complexity share with exactly the code the lean setup ran, never with a hand copy.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('../tools/lib.cjs');
const { HOST_HARNESS } = require('../tools/environment.cjs');

const EXTRA = ['scripts/lib/plain-language.js'];

/** { commit, sha256, prosePatterns, functionComplexity, complexityShare } for a full 40-character commit. */
function loadChecks(commit, harness = HOST_HARNESS) {
  if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error('Pinned harness commit must be a full commit SHA, got: ' + commit);
  const names = [...lib.git(['ls-tree', '-r', '--name-only', commit, 'checks'], harness).split('\n').filter(Boolean), ...EXTRA].sort();
  const dir = path.join(os.tmpdir(), 'study2-harness-checks', commit);
  const parts = [];
  for (const name of names) {
    const text = lib.git(['show', commit + ':' + name], harness);
    const file = path.join(dir, name);
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== text) throw new Error('Cached checker differs from commit ' + commit + ': ' + file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, text);
    parts.push(name + '\0' + text);
  }
  const { prosePatterns } = require(path.join(dir, 'checks', 'prose.cjs'));
  const { functionComplexity, complexityShare } = require(path.join(dir, 'checks', 'complexity.cjs'));
  return { commit, sha256: lib.hash(parts.join('\0')), files: names, prosePatterns, functionComplexity, complexityShare };
}

module.exports = { loadChecks };
