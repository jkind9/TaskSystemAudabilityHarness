'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, render, POLICY } = require('./render.cjs');
const { envKeysOf, retireEnv, installVersion } = require('./install-version.cjs');
const USAGE = 'usage: node tools/install.cjs [--version <tag>] [home] [installation.json]';
const args = [];
let version = null;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--version' || arg.startsWith('--version=')) {
    version = arg === '--version' ? process.argv[++i] : arg.slice('--version='.length);
    if (!version || version.startsWith('-')) { console.error('--version needs a tag.\n' + USAGE); process.exit(1); }
  } else if (arg.startsWith('-')) { console.error('Unknown option ' + arg + '.\n' + USAGE); process.exit(1); }
  else args.push(arg);
}
if (args.length > 2) { console.error('Too many arguments.\n' + USAGE); process.exit(1); }
const home = args[0] || require('node:os').homedir();
const installationFile = args[1] || path.join(root, 'installation.json');
if (version) process.exit(installVersion({ root, tag: version, home, installationFile, spawnSync }));
const backup = path.join(home, '.agents', 'harness-backups', new Date().toISOString().replace(/[:.]/g, '-'));
const undo = [];
const instructionSnapshots = new Map();
// Snapshot independent bytes BEFORE render, which can write through installed hardlinks.
function snapshotInstructions() {
  const previous = path.join(root, 'installation.json');
  const live = fs.existsSync(previous) ? JSON.parse(fs.readFileSync(previous, 'utf8')).instructions || [] : [];
  for (const target of new Set([...live, path.join(home, '.claude', 'CLAUDE.md'), path.join(home, '.codex', 'AGENTS.md'), path.join(home, '.claude', 'AGENTS.md')])) {
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
    const relative = path.relative(home, target);
    const outside = relative.startsWith('..') || path.isAbsolute(relative);
    const saved = path.join(backup, outside ? '.external-instructions/' + instructionSnapshots.size : relative);
    fs.mkdirSync(path.dirname(saved), { recursive: true });
    fs.copyFileSync(target, saved);
    instructionSnapshots.set(target, saved);
  }
}
function removeBinding(target) {
  if (!fs.existsSync(target)) return;
  try { fs.unlinkSync(target); } catch (error) {
    if (!fs.lstatSync(target).isSymbolicLink()) throw error;
    fs.rmdirSync(target);
  }
}
function preserve(target) {
  if (!fs.existsSync(target)) { undo.push(() => removeBinding(target)); return; }
  const relative = path.relative(home, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Backup target outside home');
  const dest = path.join(backup, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (instructionSnapshots.has(target)) {
    const binding = path.join(backup, '.bindings', relative);
    fs.mkdirSync(path.dirname(binding), { recursive: true });
    fs.renameSync(target, binding);
    undo.push(() => { removeBinding(target); fs.renameSync(binding, target); });
  } else {
    fs.renameSync(target, dest);
    undo.push(() => { removeBinding(target); fs.renameSync(dest, target); });
  }
}
function link(target, source, directory) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && fs.realpathSync(target).toLowerCase() === fs.realpathSync(source).toLowerCase()) return;
  preserve(target);
  if (directory) fs.symlinkSync(source, target, 'junction');
  else fs.linkSync(source, target);
}
function saveConfig(file, content) {
  if (fs.existsSync(file)) {
    const destination = path.join(backup, path.relative(home, file));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file, destination);
    const previous = fs.readFileSync(file);
    undo.push(() => fs.writeFileSync(file, previous));
  } else undo.push(() => removeBinding(file));
  fs.writeFileSync(file, content);
}
try {
  snapshotInstructions();
  const revision = render();
  preserve(path.join(home, ".claude", "AGENTS.md"));
  for (const dir of ['scripts', 'rules', 'skills', 'commands', 'task-system', 'output-styles']) {
    for (const provider of ['claude', 'codex']) if (!(dir === 'rules' && provider === 'claude')) link(path.join(home, '.' + provider, dir), path.join(root, dir), true);
  }
  // v2 loads no general rules: Claude would read every .md under ~/.claude/rules, so that link is
  // moved into the backup. ~/.codex/rules stays: it holds Codex's own approvals (rules/default.rules).
  const claudeRules = path.join(home, '.claude', 'rules');
  if (fs.lstatSync(claudeRules, { throwIfNoEntry: false })) preserve(claudeRules);
  link(path.join(home, '.agents', 'skills'), path.join(root, 'skills'), true);
  link(path.join(home, '.claude', 'agents'), path.join(root, 'agents'), true);
  link(path.join(home, '.codex', 'agents'), path.join(root, 'generated', 'codex-agents'), true);
  // One instruction file per assistant. Claude's omits the rules and style it loads natively.
  const instructions = [path.join(home, '.claude', 'CLAUDE.md'), path.join(home, '.codex', 'AGENTS.md')];
  link(instructions[0], path.join(root, 'generated', 'CLAUDE.md'), false);
  link(instructions[1], path.join(root, 'generated', 'INSTRUCTIONS.md'), false);
  const settingsFile = path.join(home, '.claude', 'settings.json');
  const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
  if (!Object.hasOwn(settings, 'outputStyle')) settings.outputStyle = 'plain-language';
  settings.hooks = JSON.parse(fs.readFileSync(path.join(root, 'generated', 'claude-hooks.json'), 'utf8')).hooks;
  const policyEnv = JSON.parse(fs.readFileSync(path.join(root, POLICY), 'utf8')).env;
  settings.env = { ...retireEnv(settings.env, envKeysOf(installationFile, root, spawnSync), policyEnv), ...policyEnv };
  // Its hooks and assets are now loaded through the shared adapter; avoid double execution.
  if (settings.enabledPlugins) for (const name of Object.keys(settings.enabledPlugins)) if (/^(everything-claude-code|ecc)@/.test(name)) settings.enabledPlugins[name] = false;
  saveConfig(settingsFile, JSON.stringify(settings, null, 2) + '\n');
  link(path.join(home, '.codex', 'hooks.json'), path.join(root, 'generated', 'codex-hooks.json'), false);
  const configFile = path.join(home, '.codex', 'config.toml');
  let config = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : '';
  const firstTable = config.search(/^\s*\[/m);
  const header = firstTable < 0 ? config : config.slice(0, firstTable);
  config = header.replace(/^[ \t]*(?:project_doc_max_bytes|"project_doc_max_bytes"|'project_doc_max_bytes')\s*=[^\r\n]*(?:\r?\n|$)/gm, '') + (firstTable < 0 ? '' : config.slice(firstTable));
  config = 'project_doc_max_bytes = 131072\n' + config;
  // Existing native plugin integrations and approval settings are preserved.
  saveConfig(configFile, config);
  // Even an empty folder marks this install, so uninstall.cjs never restores a later reinstall's copies.
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(installationFile, JSON.stringify({ home, backup, instructions, env: Object.keys(policyEnv), revision }, null, 2) + '\n');
  console.log(JSON.stringify({ installed: root, backup, ...revision }));
} catch (error) {
  for (const restore of undo.reverse()) { try { restore(); } catch (failure) { console.error('Rollback failed:', failure.message); } }
  for (const [target, saved] of instructionSnapshots) {
    try { fs.writeFileSync(target, fs.readFileSync(saved)); } catch (failure) { console.error('Instruction byte restoration failed:', failure.message); }
  }
  throw error;
}
