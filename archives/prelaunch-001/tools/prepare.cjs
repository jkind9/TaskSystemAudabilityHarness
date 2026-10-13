'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const results = path.join(root, 'results');
const protocolFile = path.join(root, 'protocol.json');
const harnessRoot = 'C:/Users/jkind/.agents/harness';
const codexHome = 'C:/Users/jkind/.codex';
const runtimeRoot = path.join(codexHome, 'benchmark-runtimes');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = file => hash(fs.readFileSync(file));

function filesBelow(directory) {
  if (!fs.existsSync(directory)) return [];
  const volatileDirectories = new Set(['.git', 'state', 'node_modules', '.cache', 'cache', 'tmp', 'temp']);
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isDirectory() && volatileDirectories.has(entry.name.toLowerCase())) return [];
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(item) : [item];
  });
}
function treeHash(directory) {
  return hash(filesBelow(directory).map(file => path.relative(directory, file).replaceAll('\\', '/') + '\0' + digest(file)).join('\n'));
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + ' exited ' + result.status + ': ' + (result.stderr || '').slice(0, 2000));
  return result.stdout;
}

function validateProtocol(protocol) {
  if (!/^[a-z0-9][a-z0-9_-]{3,80}$/i.test(protocol.studyId)) throw new Error('Invalid studyId');
  if (protocol.model !== 'gpt-6-luna' || protocol.reasoning !== 'high') throw new Error('Study model must remain gpt-6-luna/high');
  if (!Number.isInteger(protocol.timeoutMs) || protocol.timeoutMs < 1 || protocol.timeoutMs > 720000) throw new Error('Per-run timeout must be from 1 to 720000 ms');
  if (protocol.tasks.map(task => task.id).sort().join(',') !== 'easy,hard,medium') throw new Error('Protocol must define easy, medium and hard tasks');
  if (protocol.conditions.map(item => item.id).sort().join(',') !== 'control,full,instructions') throw new Error('Protocol must define control, instructions and full conditions');
  if (protocol.repetitions !== 2 || protocol.runs.length !== 18) throw new Error('Protocol must define 18 runs across two repetitions');
  if (!fs.existsSync(protocol.codexExe)) throw new Error('Pinned Codex executable is missing');
}

function runtimeHashes(home) {
  const fileHash = name => {
    const file = path.join(home, name);
    return fs.existsSync(file) ? digest(file) : null;
  };
  return { configSha256: fileHash('config.toml'), agentsSha256: fileHash('AGENTS.md'), hooksSha256: fileHash('hooks.json') };
}
function hookTrust(config, home) {
  const lines = config.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === '[hooks.state]');
  if (start < 0) throw new Error('Installed Codex config has no hooks trust section');
  const section = [];
  for (const line of lines.slice(start)) {
    if (section.length && /^\[[^\]]+\]$/.test(line) && !line.startsWith('[hooks.state.')) break;
    section.push(line);
  }
  const trust = section.join('\n').trimEnd();
  if (!trust.includes('trusted_hash')) throw new Error('Installed hook trust section has no trusted entries');
  return trust.replaceAll('C:\\Users\\jkind\\.codex', home.replaceAll('/', '\\'));
}
function discoverSkills(directory = path.join(harnessRoot, 'skills')) {
  return filesBelow(directory).filter(file => path.basename(file) === 'SKILL.md')
    // Codex's built-in system skills are outside the custom skill catalog controls.
    .filter(file => !file.split(path.sep).includes('.system'))
    .map(file => file.replaceAll('\\', '/')).sort();
}

function tomlString(value) { return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"'; }

function configText(protocol, skillFiles, enabled, trust) {
  const entries = skillFiles.map(file => '{ path = ' + tomlString(file) + ', enabled = ' + String(enabled) + ' }').join(',');
  const common = [
    'model = ' + tomlString(protocol.model),
    'model_reasoning_effort = ' + tomlString(protocol.reasoning),
    'service_tier = "default"',
    'project_doc_max_bytes = 131072',
    'skills.config = [' + entries + ']',
    '[windows]',
    'sandbox = "unelevated"'
  ].join('\n');
  return common + '\n' + (trust || '');
}

function git(args, cwd) { return run('git', args, cwd); }

function baseline(task, directory) {
  const seed = path.join(root, 'experiments', task.id, 'seed');
  const seedSha256 = treeHash(seed);
  if (fs.existsSync(directory)) {
    if (!fs.existsSync(path.join(directory, '.git'))) throw new Error('Existing task baseline is not a Git repo');
    if (git(['status', '--porcelain'], directory).trim()) throw new Error('Existing task baseline is dirty: ' + task.id);
    if (treeHash(directory) !== seedSha256) throw new Error('Existing task baseline differs from seed: ' + task.id);
    return { head: git(['rev-parse', 'HEAD'], directory).trim(), seedSha256, reused: true };
  }
  fs.mkdirSync(directory, { recursive: true });
  fs.cpSync(seed, directory, { recursive: true, filter: source => !source.split(path.sep).includes('.git') });
  git(['init'], directory);
  git(['add', '--all'], directory);
  run('git', ['-c', 'user.name=Harness Study', '-c', 'user.email=harness-study@invalid', 'commit', '-m', 'Frozen ' + task.id + ' baseline'], directory);
  if (git(['status', '--porcelain'], directory).trim()) throw new Error('Created baseline is dirty');
  return { head: git(['rev-parse', 'HEAD'], directory).trim(), seedSha256, reused: false };
}

function hostSnapshot() {
  const paths = [
    path.join(codexHome, 'config.toml'), path.join(codexHome, 'AGENTS.md'), path.join(codexHome, 'hooks.json'),
    'C:/Users/jkind/.claude/CLAUDE.md', path.join(harnessRoot, 'policy.json')
  ];
  const snapshot = Object.fromEntries(paths.map(file => [file, fs.existsSync(file) ? digest(file) : 'missing']));
  snapshot[harnessRoot] = fs.existsSync(harnessRoot) ? treeHash(harnessRoot) : 'missing';
  return snapshot;
}

function prepare() {
  const bytes = fs.readFileSync(protocolFile);
  const protocol = JSON.parse(bytes.toString('utf8'));
  validateProtocol(protocol);
  fs.mkdirSync(results, { recursive: true });
  const frozenPath = path.join(results, 'frozen.json');
  const prior = fs.existsSync(frozenPath) ? json(frozenPath) : null;
  const studyJournal = path.join(results, 'study-journal.json');
  if (fs.existsSync(studyJournal) && json(studyJournal).attempts.length) throw new Error('Measured runs have started; frozen inputs cannot be replaced');

  const toolHashes = Object.fromEntries(fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs')).sort().map(name =>
    [name, digest(path.join(__dirname, name))]));
  const taskInputs = {};
  for (const task of protocol.tasks) {
    const directory = path.join(root, 'experiments', task.id);
    taskInputs[task.id] = { treeSha256: treeHash(directory), seedSha256: treeHash(path.join(directory, 'seed')) };
  }
  if (prior && Object.entries(prior.taskInputs).some(([id, data]) => taskInputs[id]?.treeSha256 !== data.treeSha256)) {
    throw new Error('Experiment inputs changed after preparation; use a new study id');
  }
  const baselines = {};
  const baselineRoot = path.join(results, 'baselines');
  for (const task of protocol.tasks) baselines[task.id] = baseline(task, path.join(baselineRoot, task.id));
  if (prior && Object.entries(prior.baselines).some(([id, data]) => baselines[id]?.head !== data.head)) {
    throw new Error('Task baseline changed; refusing overwrite');
  }

  const skillFiles = discoverSkills();
  if (!skillFiles.length) throw new Error('No installed custom skills found');
  const installedConfig = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  const hostAtPrepare = hostSnapshot();
  if (prior && JSON.stringify(prior.hostSnapshotAtPrepare) !== JSON.stringify(hostAtPrepare)) {
    throw new Error('Installed configuration changed since preparation');
  }
  const homes = {}, promptSnapshots = {};
  for (const spec of protocol.runs) {
    const task = protocol.tasks.find(item => item.id === spec.task);
    const condition = protocol.conditions.find(item => item.id === spec.condition);
    if (!task || !condition) throw new Error('Run has invalid task or condition: ' + spec.id);
    const directory = path.join(results, spec.id);
    const repo = path.join(directory, 'repo');
    const home = path.join(runtimeRoot, protocol.studyId, spec.id);
    const promptFile = path.join(directory, 'prompt.json');
    if (fs.existsSync(directory)) {
      if (!prior) throw new Error('Existing run directory has no frozen manifest; refusing reuse: ' + spec.id);
      if (!fs.existsSync(repo) || !fs.existsSync(promptFile) || !fs.existsSync(home)) throw new Error('Existing run directory is incomplete; refusing overwrite: ' + spec.id);
      if (git(['rev-parse', 'HEAD'], repo).trim() !== baselines[task.id].head || git(['status', '--porcelain'], repo).trim()) {
        throw new Error('Existing run repository is dirty or has a different baseline: ' + spec.id);
      }
      if (json(promptFile).promptSha256 !== hash(task.prompt)) throw new Error('Existing prompt differs: ' + spec.id);
      const frozenPrompt = prior.promptSnapshots?.[spec.id];
      if (!frozenPrompt || digest(promptFile) !== frozenPrompt.snapshotFileSha256) throw new Error('Existing prompt snapshot changed: ' + spec.id);
      if (fs.existsSync(path.join(directory, 'journal.json'))) throw new Error('Run was attempted and cannot be prepared again: ' + spec.id);
      const hashes = runtimeHashes(home);
      const expected = prior.privateHomes?.runs?.[spec.id];
      if (!expected || JSON.stringify(hashes) !== JSON.stringify({ configSha256: expected.configSha256, agentsSha256: expected.agentsSha256, hooksSha256: expected.hooksSha256 })) {
        throw new Error('Private runtime configuration changed: ' + spec.id);
      }
      homes[spec.id] = { path: home, ...hashes };
      promptSnapshots[spec.id] = prior.promptSnapshots?.[spec.id];
      continue;
    }
    if (fs.existsSync(home)) throw new Error('Private runtime home already exists; refusing reuse: ' + spec.id);
    fs.mkdirSync(directory, { recursive: true });
    git(['clone', '--no-hardlinks', path.resolve(baselineRoot, task.id), repo], root);
    fs.mkdirSync(home, { recursive: true });
    const installed = condition.mode !== 'control';
    const trust = condition.mode === 'full' ? hookTrust(installedConfig, home) : '';
    const config = configText(protocol, skillFiles, installed, trust);
    fs.writeFileSync(path.join(home, 'config.toml'), config, { flag: 'wx' });
    if (installed) fs.copyFileSync(path.join(codexHome, 'AGENTS.md'), path.join(home, 'AGENTS.md'), fs.constants.COPYFILE_EXCL);
    if (condition.mode === 'full') fs.copyFileSync(path.join(codexHome, 'hooks.json'), path.join(home, 'hooks.json'), fs.constants.COPYFILE_EXCL);

    const args = ['-C', repo, '-m', protocol.model, condition.mode === 'full' ? '--enable' : '--disable',
      'hooks', '--disable', 'multi_agent', 'debug', 'prompt-input', task.prompt];
    const env = { ...process.env, CODEX_HOME: home };
    delete env.OPENAI_API_KEY; delete env.AZURE_OPENAI_API_KEY; delete env.CODEX_API_KEY;
    const output = run(protocol.codexExe, args, repo, env);
    const messages = JSON.parse(output);
    const visible = messages.flatMap(item => item.content || []).map(item => item.text || '').join('\n');
    const checks = {
      sharedHarness: visible.includes('# Shared harness'),
      sharedRules: visible.includes('# Shared rules'),
      customSkills: visible.includes('agent-harness-construction'),
      builtInSkills: visible.includes('imagegen/SKILL.md')
    };
    const expected = condition.mode !== 'control';
    if (checks.sharedHarness !== expected || checks.sharedRules !== expected ||
        checks.customSkills !== expected || !checks.builtInSkills) {
      throw new Error('Prompt isolation failed for ' + spec.id + ': ' + JSON.stringify(checks));
    }
    const snapshot = {
      runId: spec.id, task: spec.task, condition: spec.condition, promptSha256: hash(task.prompt),
      promptMessages: messages, markerChecks: checks, visibleCharacters: visible.length,
      model: protocol.model, reasoning: protocol.reasoning, serviceTier: 'default',
      sandbox: 'workspace-write', approval: 'automatic review', multiAgent: false, hooks: condition.mode === 'full'
    };
    fs.writeFileSync(promptFile, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
    homes[spec.id] = { path: home, ...runtimeHashes(home) };
    promptSnapshots[spec.id] = { promptSha256: snapshot.promptSha256, snapshotFileSha256: digest(promptFile), markerChecks: checks };
  }
  const manifest = {
    studyId: protocol.studyId, protocolSha256: hash(bytes), model: protocol.model, reasoning: protocol.reasoning,
    serviceTier: 'default', sandbox: 'workspace-write', approval: 'automatic review', multiAgent: false,
    timeoutMs: protocol.timeoutMs, taskInputs, baselines, toolHashes,
    skillCatalogSha256: treeHash(path.join(harnessRoot, 'skills')),
    hostSnapshotAtPrepare: prior?.hostSnapshotAtPrepare || hostAtPrepare,
    privateHomes: { root: path.join(runtimeRoot, protocol.studyId), runs: { ...(prior?.privateHomes?.runs || {}), ...homes } },
    promptSnapshots: { ...(prior?.promptSnapshots || {}), ...promptSnapshots },
    preparedAt: prior?.preparedAt || new Date().toISOString()
  };
  if (prior && prior.protocolSha256 !== manifest.protocolSha256) throw new Error('Protocol changed after preparation');
  const temp = frozenPath + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temp, frozenPath);
  process.stdout.write(JSON.stringify({ studyId: protocol.studyId, runs: protocol.runs.length, baselineHeads: Object.fromEntries(Object.entries(baselines).map(([id, value]) => [id, value.head])), protocolSha256: manifest.protocolSha256 }) + '\n');
}

if (require.main === module) {
  try { prepare(); } catch (error) { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; }
}
module.exports = { prepare, validateProtocol, configText, hookTrust, runtimeHashes, treeHash, discoverSkills };
