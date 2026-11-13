'use strict';
// Deploy harness/ from this repository to the harness installed on this PC (the live harness,
// ~/.agents/harness). Harness changes are made and committed here and never by hand in the live
// copy: the install links ~/.claude and ~/.codex to it, so every running session sees a change there
// at once.
//
// Run from this repository: node tools/deploy-harness.cjs [--check] [--live <folder>]
//   1. Refuse uncommitted changes under harness/ here, or any uncommitted change in the live copy.
//   2. Find the commit here whose harness/ matches the live copy. Refuse when none does: the live
//      copy was then changed outside this repository.
//   3. Apply the difference to a throwaway clone of the live copy, commit it, check the clone's files
//      match harness/, and run the harness tests in the clone. A failing change never reaches the
//      running sessions.
//   4. Fast-forward the live copy to that commit, render the instructions, and refresh
//      harness-history.bundle here.
// --check stops after step 3. --live names another installed copy; the self-test uses it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const USAGE = 'Usage: node tools/deploy-harness.cjs [--check] [--live <folder>]';
const MAX = 256 * 1024 * 1024;

function stop(message) { console.error(message); process.exit(1); }
function run(command, args, options) {
  const r = spawnSync(command, args, { maxBuffer: MAX, ...options });
  if (r.status !== 0) stop(command + ' ' + args.join(' ') + ' failed in ' + options.cwd + ':\n' + String(r.stderr || r.stdout).trim());
  return r.stdout;
}
const git = (cwd, ...args) => run('git', args, { cwd, encoding: 'utf8' }).trim();

function parse(args) {
  const out = { check: false, live: path.join(os.homedir(), '.agents', 'harness') };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') out.check = true;
    else if (args[i] === '--live' && args[i + 1]) out.live = path.resolve(args[++i]);
    else stop('Unknown or incomplete argument ' + JSON.stringify(args[i]) + '. ' + USAGE);
  }
  return out;
}

const { check, live } = parse(process.argv.slice(2));
const here = git(process.cwd(), 'rev-parse', '--show-toplevel');
const dirty = git(here, 'status', '--porcelain', '--', 'harness');
if (dirty) stop('harness/ has uncommitted changes. Commit them, then deploy:\n' + dirty);
const liveDirty = git(live, 'status', '--porcelain');
if (liveDirty) stop('The live harness has uncommitted changes. Make changes in harness/ here, not in ' + live + ':\n' + liveDirty);

const target = git(here, 'rev-parse', 'HEAD:harness');
const current = git(live, 'rev-parse', 'HEAD^{tree}');
const head = git(here, 'rev-parse', '--short', 'HEAD');
if (target === current) { console.log('Nothing to deploy: ' + live + ' already matches harness/ at ' + head + '.'); process.exit(0); }
const base = git(here, 'rev-list', 'HEAD', '--', 'harness').split('\n').find(c => git(here, 'rev-parse', c + ':harness') === current);
if (!base) stop('The live harness at ' + live + ' has changes that did not come from this repository: its files match no commit of harness/ here.\n'
  + 'Bring those changes into harness/ and commit them, then deploy again (docs/maintenance.md, "If the live harness was changed directly").');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-deploy-'));
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));  // stop() exits past any finally
const clone = path.join(temp, 'harness');
// The clone keeps the tags test_install_version.js needs, and checks files out with the live copy's
// line endings: Git for Windows defaults core.autocrlf to true, and this PC's live copy sets false.
const eol = spawnSync('git', ['config', 'core.autocrlf'], { cwd: live, encoding: 'utf8' }).stdout.trim();
git(temp, 'clone', '-q', '--no-hardlinks', ...(eol ? ['-c', 'core.autocrlf=' + eol] : []), live, clone);
run('git', ['apply', '--index'], { cwd: clone, input: run('git', ['diff', '--binary', base + ':harness', 'HEAD:harness'], { cwd: here }) });
const changes = git(here, 'log', '--reverse', '--format=- %s (%h)', base + '..HEAD', '--', 'harness');
git(clone, 'commit', '-q', '-m', 'deploy: harness/ from ' + path.basename(here) + ' ' + head + '\n\n' + changes);
if (git(clone, 'rev-parse', 'HEAD^{tree}') !== target) stop('The deploy clone does not match harness/ at ' + head + '; the live harness is unchanged.');

const tests = ['task-system/tests', 'scripts/hooks/tests'].flatMap(d => fs.readdirSync(path.join(clone, d)).filter(f => f.endsWith('.js')).map(f => d + '/' + f));
const env = { ...process.env };
delete env.ECC_TASK_FLOW;      // test_harness_invariants.js expects the full-flow wording
delete env.NODE_TEST_CONTEXT;  // set under node --test; the child would report to that runner instead
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: clone, env, encoding: 'utf8', maxBuffer: MAX });
const summary = (result.stdout.match(/^# (tests|pass|fail) \d+$/gm) || []).join(', ').replace(/# /g, '');
if (result.status !== 0) stop('Harness tests failed in the deploy clone (' + summary + '); the live harness is unchanged.\n' + (result.stdout.match(/^not ok .*$/gm) || []).join('\n'));
console.log('Tests in a clone of the live harness: ' + summary + '.');
if (check) { console.log('Check only: ' + head + ' is ready to deploy to ' + live + '.'); process.exit(0); }

git(live, 'fetch', '-q', clone, 'HEAD');
git(live, 'merge', '-q', '--ff-only', 'FETCH_HEAD');
run(process.execPath, ['tools/render.cjs'], { cwd: live, encoding: 'utf8' });
git(live, 'bundle', 'create', path.join(here, 'harness-history.bundle'), '--all');
console.log('Deployed ' + head + ' to ' + live + ' as ' + git(live, 'rev-parse', '--short', 'HEAD') + '. Commit harness-history.bundle here, then push.');
