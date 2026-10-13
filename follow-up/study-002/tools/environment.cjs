'use strict';
// Builds one run's private environment: harness clone, private HOME/TEMP, private CODEX_HOME
// (config, instructions, hooks, trust) and an offline Python virtual environment.
// The host harness, ~/.codex and ~/.claude are only read, never written.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { git, run, digest, treeFiles, tomlString, toPosix, studyRoot } = require('./lib.cjs');

const HOST_HARNESS = 'C:/Users/jkind/.agents/harness';
const PROFILE = path.join(studyRoot, 'profiles', 'task-only');
const CONFIGS = ['stock', 'task-only', 'full', 'lean'];

/** SKILL.md files under a skills folder, excluding Codex's own .system skills (Study 1 tools/prepare.cjs:67). */
function skillFiles(directory) {
  return treeFiles(directory, new Set(['.git', '.system'])).filter(file => path.basename(file) === 'SKILL.md').map(toPosix).sort();
}

/** Clone the harness at a pinned commit; task-only gets the trimmed policy, lean the clone's own core/policy.json. Rendered with the private HOME. */
function cloneHarness(dest, commit, config, env) {
  // The harness has deep paths (synced skills); run folders are deep too, so long paths must be on.
  git(['-c', 'core.longpaths=true', 'clone', '-q', '-c', 'core.longpaths=true', '--no-hardlinks', HOST_HARNESS, dest], studyRoot);
  git(['-c', 'advice.detachedHead=false', 'checkout', '-q', commit], dest);
  if (config === 'task-only') fs.copyFileSync(path.join(PROFILE, 'policy.json'), path.join(dest, 'policy.json'));
  if (config === 'lean') fs.copyFileSync(path.join(dest, 'core', 'policy.json'), path.join(dest, 'policy.json'));
  const rendered = run(process.execPath, [path.join(dest, 'tools', 'render.cjs')], { cwd: dest, env });
  if (rendered.status !== 0) throw new Error('harness render failed: ' + rendered.stderr);
  return {
    commit: git(['rev-parse', 'HEAD'], dest).trim(),
    policySha256: digest(path.join(dest, 'policy.json')),
    instructionsSha256: digest(path.join(dest, 'generated', 'INSTRUCTIONS.md')),
    hooksSha256: digest(path.join(dest, 'generated', 'codex-hooks.json'))
  };
}

/** Private HOME with ~/.claude/task-system and ~/.claude/scripts pointing at the clone. */
function buildHome(home, clone) {
  fs.mkdirSync(path.join(home, '.claude', 'session-data'), { recursive: true });
  if (clone) {
    for (const name of ['task-system', 'scripts']) fs.symlinkSync(path.join(clone, name), path.join(home, '.claude', name), 'junction');
  }
}

function configToml({ model, reasoning, hostSkills, cloneSkills }) {
  const entries = [
    ...hostSkills.map(file => '{ path = ' + tomlString(file) + ', enabled = false }'),
    ...cloneSkills.map(file => '{ path = ' + tomlString(file) + ', enabled = true }')
  ];
  return [
    'model = ' + tomlString(model),
    'model_reasoning_effort = ' + tomlString(reasoning),
    'service_tier = "default"',
    'project_doc_max_bytes = 131072',
    'skills.config = [' + entries.join(',') + ']',
    '[windows]',
    'sandbox = "unelevated"',
    ''
  ].join('\n');
}

function writeCodexHome(codexHome, { config, model, reasoning, clone }) {
  if (!CONFIGS.includes(config)) throw new Error('Unknown config: ' + config);
  fs.mkdirSync(codexHome, { recursive: true });
  const hostSkills = skillFiles(path.join(HOST_HARNESS, 'skills'));
  // skills.config only switches discovered skills on or off; it cannot add a path. Codex discovers
  // skills under CODEX_HOME/skills, so full links the clone's skill folders there (checked 2026-10-12).
  let cloneSkills = [];
  if (config === 'full') {
    const target = path.join(codexHome, 'skills');
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(path.join(clone, 'skills')).filter(n => !n.startsWith('.')).sort()) {
      const source = path.join(clone, 'skills', name);
      if (fs.statSync(source).isDirectory()) { fs.symlinkSync(source, path.join(target, name), 'junction'); cloneSkills.push(name); }
    }
  }
  fs.writeFileSync(path.join(codexHome, 'config.toml'), configToml({ model, reasoning, hostSkills, cloneSkills: [] }), { flag: 'wx' });
  if (config === 'full') fs.copyFileSync(path.join(clone, 'generated', 'INSTRUCTIONS.md'), path.join(codexHome, 'AGENTS.md'), fs.constants.COPYFILE_EXCL);
  if (config === 'task-only') fs.copyFileSync(path.join(PROFILE, 'AGENTS.md'), path.join(codexHome, 'AGENTS.md'), fs.constants.COPYFILE_EXCL);
  if (config === 'lean') fs.copyFileSync(path.join(clone, 'core', 'AGENTS.md'), path.join(codexHome, 'AGENTS.md'), fs.constants.COPYFILE_EXCL);
  if (config !== 'stock') fs.copyFileSync(path.join(clone, 'generated', 'codex-hooks.json'), path.join(codexHome, 'hooks.json'), fs.constants.COPYFILE_EXCL);
  return { hostSkills: hostSkills.length, cloneSkills: cloneSkills.length };
}

/** Ask Codex's app server for each hook's currentHash (no model call). */
function listHooks(codexExe, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(codexExe, ['app-server'], { cwd, env, windowsHide: true });
    let buffer = '', done = false;
    const finish = (error, value) => { if (done) return; done = true; child.kill(); error ? reject(error) : resolve(value); };
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.id === 1) { send({ method: 'initialized' }); send({ id: 2, method: 'hooks/list', params: { cwds: [cwd] } }); }
        else if (message.id === 2) {
          if (message.error) return finish(new Error('hooks/list: ' + JSON.stringify(message.error)));
          return finish(null, message.result.data.flatMap(entry => entry.hooks));
        }
      }
    });
    child.on('error', finish);
    setTimeout(() => finish(new Error('hooks/list timed out')), 60000);
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'study2-prepare', version: '1' } } });
  });
}

/** Trust exactly the hooks in this CODEX_HOME's hooks.json, using the hashes Codex reports. */
async function trustHooks(codexExe, codexHome, env, cwd) {
  const own = path.join(codexHome, 'hooks.json').toLowerCase().replaceAll('/', '\\');
  const hooks = (await listHooks(codexExe, env, cwd)).filter(hook => hook.sourcePath.toLowerCase().replaceAll('/', '\\') === own);
  if (!hooks.length) throw new Error('hooks/list returned no hooks for ' + own);
  const lines = ['', '[hooks.state]', ...hooks.flatMap(hook => ['', '[hooks.state.' + "'" + hook.key + "'" + ']', 'trusted_hash = ' + tomlString(hook.currentHash)])];
  fs.appendFileSync(path.join(codexHome, 'config.toml'), lines.join('\n') + '\n');
  return hooks.map(hook => ({ key: hook.key, event: hook.eventName, hash: hook.currentHash }));
}

/** Offline Python environment outside the repo; PATH puts it first for the Codex process. */
function buildVenv(venv, task, repo) {
  const made = run('python', ['-m', 'venv', venv]);
  if (made.status !== 0) throw new Error('venv: ' + made.stderr);
  const python = path.join(venv, 'Scripts', 'python.exe');
  const install = run(python, ['-m', 'pip', 'install', '-q', '--no-index', '--find-links', task.wheels, ...task.requirements]);
  if (install.status !== 0) throw new Error('offline pip install: ' + install.stderr);
  if (task.editableInstall) {
    const editable = run(python, ['-m', 'pip', 'install', '-q', '--no-index', '--find-links', task.wheels, '--no-build-isolation', '--no-deps', '-e', repo]);
    if (editable.status !== 0) throw new Error('editable install: ' + editable.stderr);
  }
  return run(python, ['-m', 'pip', 'freeze', '--all']).stdout.split(/\r?\n/).filter(Boolean);
}

/** Environment for Codex and its hooks in this run: every home and temp folder private. */
function runEnv(runDir) {
  const env = { ...process.env };
  for (const key of ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY', 'CODEX_API_KEY']) delete env[key];
  // Windows keeps the search path as "Path"; pass exactly one key so the child cannot see two.
  const searchPath = env.PATH || env.Path || '';
  delete env.PATH; delete env.Path;
  const home = path.join(runDir, 'home'), tmp = path.join(runDir, 'tmp'), venv = path.join(runDir, 'venv');
  return {
    ...env, CODEX_HOME: path.join(runDir, 'codex-home'), HOME: home, USERPROFILE: home, TEMP: tmp, TMP: tmp,
    VIRTUAL_ENV: venv, PATH: path.join(venv, 'Scripts') + path.delimiter + searchPath
  };
}

module.exports = { CONFIGS, HOST_HARNESS, skillFiles, cloneHarness, buildHome, writeCodexHome, trustHooks, buildVenv, runEnv, configToml };
