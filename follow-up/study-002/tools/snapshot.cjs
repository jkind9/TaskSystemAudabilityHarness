'use strict';
// End-of-session repository snapshot: HEAD, status, a full binary diff from the frozen baseline
// (untracked files included) and a working-tree hash. Uses a temporary index outside the repo,
// so the run's own index and files are never touched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { git, treeHash, hash, atomicJson } = require('./lib.cjs');

/** Working-tree hash that ignores .git and caches; the session-2 pre-launch check compares it. */
function workingTreeHash(repo) {
  return treeHash(repo);
}

function diffFromBaseline(repo, baselineCommit) {
  const index = path.join(os.tmpdir(), 'study2-index-' + process.pid + '-' + Date.now());
  try {
    const env = { GIT_INDEX_FILE: index };
    git(['read-tree', baselineCommit], repo, env);
    git(['add', '-A', '--', '.'], repo, env);
    return git(['diff', '--cached', '--binary', '--no-color', baselineCommit], repo, env);
  } finally {
    fs.rmSync(index, { force: true });
  }
}

function takeSnapshot(repo, baselineCommit, outDir) {
  if (fs.existsSync(outDir)) throw new Error('Snapshot already exists: ' + outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const head = git(['rev-parse', 'HEAD'], repo).trim();
  const status = git(['status', '--porcelain=v1', '-uall'], repo);
  const diff = diffFromBaseline(repo, baselineCommit);
  fs.writeFileSync(path.join(outDir, 'status.txt'), status, { flag: 'wx' });
  fs.writeFileSync(path.join(outDir, 'diff-from-baseline.patch'), diff, { flag: 'wx' });
  const meta = { head, baselineCommit, workingTreeSha256: workingTreeHash(repo), diffSha256: hash(diff), takenAt: new Date().toISOString() };
  atomicJson(path.join(outDir, 'snapshot.json'), meta);
  return meta;
}

module.exports = { takeSnapshot, diffFromBaseline, workingTreeHash };
