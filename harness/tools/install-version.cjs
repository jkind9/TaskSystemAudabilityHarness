'use strict';
// Install a named version in place, and retire settings env keys another version set.
// A version is a git tag. `install.cjs --version <tag>` checks the tag out in this folder and runs
// that version's own installer, so the hook command (this folder's tools/dispatch.cjs) never
// changes and Codex's stored hook trust stays valid. Untracked and ignored files
// (rules/default.rules, skills/.system, generated/, state/) stay in place.
const fs = require('node:fs');
const path = require('node:path');

/** Env keys the previous install set: installation.json's `env`, or v1's policy for a record v1 wrote. */
function envKeysOf(file, root, spawnSync) {
  if (!fs.existsSync(file)) return [];
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(record.env)) return record.env;
  const v1 = spawnSync('git', ['show', 'v1:policy.json'], { cwd: root, encoding: 'utf8', windowsHide: true });
  return v1.status === 0 ? Object.keys(JSON.parse(v1.stdout).env || {}) : [];
}

/** The settings env without keys a previous install set that the new policy does not set. */
function retireEnv(settingsEnv = {}, previousKeys, policyEnv = {}) {
  return Object.fromEntries(Object.entries(settingsEnv).filter(([key]) => !previousKeys.includes(key) || key in policyEnv));
}

/** Check out `tag` here and run its installer. Returns the exit code. */
function installVersion({ root, tag, home, installationFile, spawnSync }) {
  const git = (...args) => spawnSync('git', ['-c', 'core.longpaths=true', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  const fail = message => { console.error(message); return 1; };
  if (!tag || git('rev-parse', '--verify', '--quiet', 'refs/tags/' + tag + '^{commit}').status !== 0) {
    return fail('Unknown version ' + tag + '. Versions: ' + git('tag', '--list').stdout.trim().split('\n').join(', '));
  }
  const changed = git('status', '--porcelain', '--untracked-files=no').stdout.split('\n').filter(Boolean)
    .map(line => line.slice(3).replace(/^"|"$/g, '')).filter(file => !/^skills\/(synced|source-command-[^/]+)\//.test(file));  // synced skills, and render's own outputs
  if (changed.length) return fail('Not switching to ' + tag + ': commit or stash these tracked changes first: ' + changed.join(', '));
  const previousKeys = envKeysOf(installationFile, root, spawnSync);
  const checkout = git('checkout', '-q', '--detach', tag);
  if (checkout.status !== 0) return fail('git checkout ' + tag + ' failed: ' + checkout.stderr.trim());
  // v1's installer cannot retire keys v2 set (ECC_TASK_FLOW), so do it here, before that installer
  // runs: if the switch stops now, the checked-out version's plain installer is all that is left.
  // v1 reads root policy.json; v2 has only core/policy.json.
  const policyFile = ['policy.json', 'core/policy.json'].map(f => path.join(root, f)).find(f => fs.existsSync(f));
  const policyEnv = JSON.parse(fs.readFileSync(policyFile, 'utf8')).env;
  const settingsFile = path.join(home, '.claude', 'settings.json');
  if (fs.existsSync(settingsFile)) {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, env: retireEnv(settings.env, previousKeys, policyEnv) }, null, 2) + '\n');
  }
  const finish = 'node tools/install.cjs ' + JSON.stringify(home) + ' ' + JSON.stringify(installationFile);
  const child = spawnSync(process.execPath, [path.join(root, 'tools', 'install.cjs'), home, installationFile], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (child.status !== 0) return fail('This folder is now at ' + tag + ' but its installer failed. Fix the error above, then finish with that version\'s own installer (no --version): ' + finish);
  console.log('Installed ' + tag + ' from ' + root + ' (HEAD detached at ' + tag + '; to return: git checkout main, then node tools/install.cjs).');
  return 0;
}

module.exports = { envKeysOf, retireEnv, installVersion };
