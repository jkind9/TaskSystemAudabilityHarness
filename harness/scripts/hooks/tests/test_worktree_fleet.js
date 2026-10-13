#!/usr/bin/env node

/**
 * Contract test for scripts/worktree-fleet.js.
 * Run: node ~/.claude/scripts/hooks/tests/test_worktree_fleet.js
 * Exit 0 iff all assertions pass. Works on a throwaway repo in the OS temp dir.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', '..', 'worktree-fleet.js');

let failures = 0;
function check(name, condition, detail) {
  console.log((condition ? 'ok   ' : 'FAIL ') + name);
  if (!condition) {
    failures++;
    if (detail) console.log('       ' + String(detail).replace(/\n/g, '\n       '));
  }
}

function fleet(cwd, args) {
  return spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

// ---- Arrange: a throwaway repo with one commit on branch "main" -------------

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-test-'));
const repo = path.join(sandbox, 'repo');
fs.mkdirSync(repo);
git(repo, ['init', '-q', '-b', 'main']);
git(repo, ['config', 'user.email', 'test@example.com']);
git(repo, ['config', 'user.name', 'Fleet Test']);
fs.writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
git(repo, ['add', '.']);
git(repo, ['commit', '-q', '-m', 'seed']);

// ---- (a) dry run plans but creates nothing ---------------------------------

const dry = fleet(repo, ['up', '--count', '3', '--dry-run', '--no-launch']);
const plannedLines = (dry.stdout.match(/-> /g) || []).length;
check('dry run exits 0', dry.status === 0, dry.stderr);
check('dry run plans exactly 3 worktrees', plannedLines === 3, dry.stdout);
check('dry run creates nothing on disk',
  !fs.existsSync(path.join(sandbox, 'repo-fleet')), 'repo-fleet exists after dry run');
check('dry run writes no manifest',
  !fs.existsSync(path.join(repo, '.claude', 'fleet.json')));

// ---- (b) real run creates 3 worktrees git knows about ----------------------

const up = fleet(repo, ['up', '--count', '3', '--no-launch']);
check('up exits 0', up.status === 0, up.stderr);

const listed = git(repo, ['worktree', 'list', '--porcelain']).stdout;
const worktreeCount = (listed.match(/^worktree /gm) || []).length;
check('git reports 4 worktrees (main + 3 fleet)', worktreeCount === 4, listed);

const manifest = JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'fleet.json'), 'utf8'));
check('manifest records 3 members', manifest.members.length === 3, JSON.stringify(manifest));
check('manifest names are a,b,c',
  manifest.members.map(m => m.name).join(',') === 'a,b,c', JSON.stringify(manifest.members));
check('each member has its own branch',
  manifest.members.every(m => m.branch === `fleet/${m.name}`));

// ---- up is idempotent: a second run creates nothing new --------------------

const again = fleet(repo, ['up', '--count', '3', '--no-launch']);
check('re-running up exits 0', again.status === 0, again.stderr);
check('re-running up creates nothing new', /Nothing new to create/.test(again.stdout), again.stdout);

// ---- (c) status reports drift instead of crashing --------------------------

const cPath = manifest.members.find(m => m.name === 'c').worktreePath;
fs.rmSync(cPath, { recursive: true, force: true });
const status = fleet(repo, ['status']);
check('status exits 0 with a missing worktree directory', status.status === 0, status.stderr);
check('status names the drift', /DRIFT/.test(status.stdout), status.stdout);
check('status still lists the clean members',
  (status.stdout.match(/clean/g) || []).length === 2, status.stdout);

// ---- (d) down refuses dirty worktrees, obeys --force -----------------------

const aPath = manifest.members.find(m => m.name === 'a').worktreePath;
fs.writeFileSync(path.join(aPath, 'uncommitted.txt'), 'work in progress\n');

const refuse = fleet(repo, ['down', 'a']);
check('down on a dirty worktree exits non-zero', refuse.status !== 0, refuse.stdout);
check('down on a dirty worktree leaves it on disk', fs.existsSync(aPath));
check('down explains why it refused', /uncommitted changes/.test(refuse.stderr), refuse.stderr);

const forced = fleet(repo, ['down', 'a', '--force']);
check('down --force exits 0', forced.status === 0, forced.stderr);
check('down --force removes the worktree', !fs.existsSync(aPath));

const afterManifest = JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'fleet.json'), 'utf8'));
check('manifest drops the removed member',
  !afterManifest.members.some(m => m.name === 'a'), JSON.stringify(afterManifest.members));

// ---- guardrails ------------------------------------------------------------

const tooMany = fleet(repo, ['up', '--count', '9', '--dry-run', '--no-launch']);
check('up refuses --count above the built-in names instead of silently making fewer',
  tooMany.status !== 0 && /above the 5 built-in names/.test(tooMany.stderr),
  tooMany.stdout + tooMany.stderr);

const overCeiling = fleet(repo, ['up', '--names', 'n1,n2,n3,n4,n5,n6,n7,n8,n9', '--dry-run', '--no-launch']);
check('up refuses a named fleet above the hard ceiling', overCeiling.status !== 0, overCeiling.stderr);

const dupes = fleet(repo, ['up', '--names', 'x,x', '--dry-run', '--no-launch']);
check('up refuses duplicate names', dupes.status !== 0, dupes.stderr);

const badName = fleet(repo, ['down', 'zzz']);
check('down on an unknown name exits non-zero', badName.status !== 0, badName.stdout);

const outsideRepo = fleet(os.tmpdir(), ['status']);
check('running outside a git repo exits non-zero', outsideRepo.status !== 0, outsideRepo.stdout);

// ---- Cleanup ---------------------------------------------------------------

try {
  fs.rmSync(sandbox, { recursive: true, force: true });
} catch (err) {
  console.log('note: could not remove sandbox ' + sandbox + ': ' + err.message);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
