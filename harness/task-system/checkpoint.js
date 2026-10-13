'use strict';
// Git checkpoints for task closure. Operates on explicit paths; never stages a whole checkout.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { listKey, globMatch } = require('./file-size');
function git(root, args, input) {
  const r = spawnSync('git', ['--literal-pathspecs', ...args], { cwd: root, input, encoding: 'utf8', windowsHide: true });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('Git ' + args[0] + ' failed: ' + r.stderr.trim());
  return r.stdout;
}
const splitPaths = output => output.split('\0').filter(Boolean);
function changedPaths(root) {
  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (head.error) throw head.error;
  if (head.status === 0) return splitPaths(git(root, ['diff', '--relative', '--name-only', '--no-renames', '-z', 'HEAD']));
  return [...splitPaths(git(root, ['diff', '--relative', '--name-only', '--no-renames', '-z'])), ...splitPaths(git(root, ['diff', '--cached', '--relative', '--name-only', '--no-renames', '-z']))];
}
function scopeOf(root, text, taskPaths) {
  const patterns = [...listKey(text, 'files'), ...listKey(text, 'docs')];
  for (const pattern of patterns) {
    const parts = pattern.replace(/\\/g, '/').split('/');
    if (path.isAbsolute(pattern) || /^[A-Za-z]:/.test(pattern) || parts.includes('..') || parts.includes('.git')) {
      throw new Error('Task scope must stay within its repository: ' + pattern);
    }
  }
  const extras = taskPaths.map(p => path.relative(root, p).replace(/\\/g, '/'));
  const matches = p => extras.includes(p) || patterns.some(pattern => globMatch(pattern, p));
  const files = [...splitPaths(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])), ...changedPaths(root)];
  return { paths: [...new Set(files.filter(matches))], matches };
}
function stagedPaths(root) {
  const top = git(root, ['rev-parse', '--show-toplevel']).trim();
  return splitPaths(git(top, ['diff', '--cached', '--name-only', '--no-renames', '-z'])).map(p => path.relative(root, path.join(top, p)).replace(/\\/g, '/'));
}
function checkOperation(root) {
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const markerPath = git(root, ['rev-parse', '--git-path', marker]).trim();
    if (fs.existsSync(path.resolve(root, markerPath))) throw new Error('Finish the existing Git operation before committing a task: ' + marker);
  }
  if (git(root, ['ls-files', '-u']).trim()) throw new Error('Resolve Git conflicts before committing a task.');
}
/** Commit declared files/docs and task metadata, preserving unrelated changes. */
function commitScoped(root, text, taskPaths, message) {
  checkOperation(root);
  const scope = scopeOf(root, text, taskPaths);
  const staged = stagedPaths(root);
  const unrelated = staged.filter(p => !scope.matches(p));
  if (unrelated.length) throw new Error('Unrelated staged paths prevent a scoped task commit: ' + unrelated.join(', '));
  if (!scope.paths.length) throw new Error('No task paths found for checkpoint.');
  const present = new Set(splitPaths(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])));
  const stagePaths = scope.paths.filter(p => present.has(p));
  if (stagePaths.length) git(root, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], stagePaths.join('\0') + '\0');
  const changed = git(root, ['diff', '--cached', '--name-only']).trim();
  if (changed) git(root, ['commit', '-m', message, '--only', '--pathspec-from-file=-', '--pathspec-file-nul'], scope.paths.join('\0') + '\0');
  return git(root, ['rev-parse', 'HEAD']).trim();
}
function checkpointSha(text) {
  const receipts = text.split(/^## Receipts[^\n]*\n/m)[1]?.split(/^## /m)[0] || '';
  const value = (receipts.match(/^\s*\|\s*closing commit\s*\|([^|]*)\|/im) || [])[1] || '';
  return (value.match(/\b[0-9a-f]{7,40}\b/i) || [])[0];
}
function validateCheckpoint(root, text) {
  const sha = checkpointSha(text);
  if (!sha) throw new Error('No closing commit SHA recorded.');
  git(root, ['cat-file', '-e', sha + '^{commit}']);
  git(root, ['merge-base', '--is-ancestor', sha, 'HEAD']);
  const changed = splitPaths(git(root, ['diff-tree', '--relative', '--root', '-m', '--first-parent', '--no-commit-id', '--name-only', '-r', '-z', sha]));
  if (!changed.some(p => listKey(text, 'files').some(g => globMatch(g, p)))) throw new Error('Closing commit touches no declared files.');
  const scope = scopeOf(root, text, []);
  const dirty = new Set([
    ...splitPaths(git(root, ['diff', '--cached', '--relative', '--name-only', '--no-renames', '-z', sha])),
    ...splitPaths(git(root, ['diff', '--relative', '--name-only', '--no-renames', '-z', sha])),
    ...splitPaths(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])),
  ]);
  if ([...dirty].some(scope.matches)) throw new Error('Declared files or docs still differ from the recorded checkpoint.');
}
// Why git cannot make a checkpoint here, or null when it can. In the Study 2 pilot Codex's sandbox
// refused to start git (spawnSync git EPERM), so a finished task could never close; a plain folder
// has no repository to commit to. Either way the close goes ahead and the journal records why.
function gitUnavailable(root) {
  const r = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.error) return 'git cannot start (' + (r.error.code || r.error.message) + ')';
  if (r.status !== 0 && /not a git repository/i.test(r.stderr)) return 'not a git repository';
  return null;
}
const GIT_REFUSED_WRITE = /Permission denied|EPERM|EACCES|index\.lock/i;
function withoutCheckpoint({ text, taskPath, dryRun, id }, reason) {
  process.stderr.write('note: closing task ' + id + ' without a git checkpoint: ' + reason + '. Commit its files later.\n');
  const journal = path.join(path.dirname(path.dirname(taskPath)), '.journal.log');
  if (!dryRun) fs.appendFileSync(journal, new Date().toLocaleString('sv-SE') + ' close ' + id + ' without a git checkpoint: ' + reason + '\n');
  return text;
}
/** Return updated receipts; dry-run validates without staging, committing or writing. */
function closeCheckpoint(request) {
  const { root, text, taskPath, commit, dryRun, id } = request;
  if (!listKey(text, 'files').length) return text;
  const unavailable = gitUnavailable(root);
  if (unavailable) return withoutCheckpoint(request, unavailable);
  try {
    scopeOf(root, text, [taskPath]);
    if (commit) {
      checkOperation(root);
      const scope = scopeOf(root, text, [taskPath]);
      const staged = stagedPaths(root);
      if (staged.some(p => !scope.matches(p))) throw new Error('Unrelated staged paths prevent a scoped task commit.');
      const dirtyFiles = [...changedPaths(root), ...splitPaths(git(root, ['ls-files', '--others', '--exclude-standard', '-z']))];
      if (!dirtyFiles.some(p => listKey(text, 'files').some(g => globMatch(g, p)))) {
        validateCheckpoint(root, text);
        return text;
      }
      if (dryRun) return text;
      if (!/^\s*\|\s*closing commit\s*\|/im.test(text)) throw new Error('Add a closing commit row to Receipts before --commit.');
      const sha = commitScoped(root, text, [taskPath], 'chore: checkpoint task ' + id);
      const updated = text.replace(/(^\s*\|\s*closing commit\s*\|)[^\n]*/im, '$1 ' + sha + ' |');
      validateCheckpoint(root, updated);
      fs.writeFileSync(taskPath, updated);
      return updated;
    }
    validateCheckpoint(root, text);
    return text;
  } catch (error) {
    if (commit && GIT_REFUSED_WRITE.test(error.message)) return withoutCheckpoint(request, 'git refused to write: ' + error.message.split('\n')[0]);
    throw new Error('Awaiting checkpoint: ' + error.message + '\nUse move ' + id + ' pending_review, or close ' + id + ' --commit after reviewing its scope.');
  }
}
function worktreeClean(root) { return !git(root, ['status', '--porcelain=v1', '--untracked-files=all']).trim(); }
function commitHandoff(root, text, taskPaths, message) {
  try { return commitScoped(root, text, taskPaths, message); }
  catch (error) { throw new Error(error.message + '\nHandoff stopped; branch and worktree retained. Task already moved: inspect git status, repair its status if interrupted, commit only declared files/docs and old/new task paths, then merge manually. Do not rerun close or cleanup while changes remain.'); }
}
module.exports = { closeCheckpoint, commitScoped, commitHandoff, worktreeClean };