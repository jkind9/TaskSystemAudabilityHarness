'use strict';
// Host checks around every session: (1) the host's settings and harness did not change;
// (2) nothing the session wrote landed in host folders where leaks would show up.
// A full hash of ~/.claude is not used, because the owner's own sessions change it (task 02 PR-9).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest, git, hash } = require('./lib.cjs');

const USER = 'C:/Users/jkind';
const HOST_FILES = [
  USER + '/.codex/config.toml', USER + '/.codex/AGENTS.md', USER + '/.codex/hooks.json',
  USER + '/.claude/CLAUDE.md', USER + '/.agents/harness/policy.json'
];
const LEAK_DIRS = [USER + '/.claude/session-data', USER + '/.codex/sessions', path.join(os.tmpdir(), 'claude-docs-gate')];

function snapshot() {
  const files = Object.fromEntries(HOST_FILES.map(file => [file, fs.existsSync(file) ? digest(file) : 'missing']));
  const harness = USER + '/.agents/harness';
  return {
    files,
    harnessHead: git(['rev-parse', 'HEAD'], harness).trim(),
    harnessStatusSha256: hash(git(['status', '--porcelain=v1'], harness))
  };
}

function sameSnapshot(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function filesChangedSince(directory, sinceMs, depth = 4) {
  if (!fs.existsSync(directory) || depth < 0) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesChangedSince(item, sinceMs, depth - 1);
    try { return fs.statSync(item).mtimeMs >= sinceMs ? [item] : []; } catch { return []; }
  });
}

// Summaries written by the assistant operating the study naturally mention run ids and paths; they are
// not run leaks. A session summary records its working folder ("**Worktree:** <path>"); only a summary
// whose working folder is a run's own repo (…/results/<run>/repo) can be a run leak.
const RUN_REPO = /[\\/]results[\\/][^\\/]+[\\/]repo\b/i;
function isOperatorSummary(file) {
  if (!/session\.tmp$/i.test(file)) return false;
  let head = '';
  try { head = fs.readFileSync(file, 'utf8').slice(0, 2000); } catch { return false; }
  const worktree = head.match(/\*\*Worktree:\*\*\s*(.+)/)?.[1] || '';
  return Boolean(worktree) && !RUN_REPO.test(worktree);
}

/** Host files changed since `sinceMs` whose text mentions any needle (run id, private paths). */
function leakScan(sinceMs, needles) {
  const lowered = needles.filter(Boolean).flatMap(n => [n.toLowerCase(), n.replaceAll('\\', '/').toLowerCase(), n.replaceAll('/', '\\').toLowerCase(), n.replaceAll('\\', '\\\\').toLowerCase()]);
  const hits = [];
  for (const directory of LEAK_DIRS) {
    for (const file of filesChangedSince(directory, sinceMs).filter(f => !isOperatorSummary(f))) {
      let text;
      try { text = fs.readFileSync(file, 'utf8').toLowerCase(); } catch { continue; }
      const found = lowered.filter(needle => text.includes(needle));
      if (found.length) hits.push({ file, matched: [...new Set(found)].slice(0, 3) });
    }
  }
  return hits;
}

module.exports = { snapshot, sameSnapshot, leakScan, LEAK_DIRS };
