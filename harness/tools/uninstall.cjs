'use strict';
// Undo tools/install.cjs. Nothing is deleted: links are removed, files in use are moved into a new
// backup folder, and what the install replaced is moved back from the install's backup folder.
const fs = require('node:fs');
const path = require('node:path');
const USAGE = 'usage: node tools/uninstall.cjs [home] [installation.json]';
const args = process.argv.slice(2);
if (args.length > 2 || args.some(arg => arg.startsWith('-'))) { console.error(USAGE); process.exit(1); }
const home = args[0] || require('node:os').homedir();
const installationFile = args[1] || path.resolve(__dirname, '..', 'installation.json');
// Without a record a second run would move the files the first run put back.
if (!fs.existsSync(installationFile)) { console.error('No install record at ' + installationFile + ': nothing to undo.'); process.exit(1); }
// Every path install.cjs links, writes or moves away, relative to home.
const touched = [
  ...['scripts', 'skills', 'commands', 'task-system', 'output-styles', 'agents'].flatMap(dir => ['.claude/' + dir, '.codex/' + dir]),
  '.claude/rules', '.codex/rules', '.agents/skills', '.claude/CLAUDE.md', '.claude/AGENTS.md', '.codex/AGENTS.md',
  '.claude/settings.json', '.codex/hooks.json', '.codex/config.toml',
];
const backups = path.join(home, '.agents', 'harness-backups');
// Reinstalls back up the harness's own files, so the state before the harness is in the first
// folder after the last uninstall.
const names = fs.existsSync(backups) ? fs.readdirSync(backups).sort() : [];
const original = names.slice(names.findLastIndex(name => name.endsWith('-uninstall')) + 1)
  .find(name => fs.statSync(path.join(backups, name)).isDirectory());
const saved = path.join(backups, new Date().toISOString().replace(/[:.]/g, '-') + '-uninstall');
fs.mkdirSync(saved, { recursive: true });
for (const relative of touched) {
  const target = path.join(home, relative);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat) continue;
  if (stat.isSymbolicLink()) { fs.unlinkSync(target); continue; }
  fs.mkdirSync(path.dirname(path.join(saved, relative)), { recursive: true });
  fs.renameSync(target, path.join(saved, relative));
}
for (const relative of original ? touched : []) {
  const copy = path.join(backups, original, relative);
  if (fs.lstatSync(copy, { throwIfNoEntry: false })) fs.renameSync(copy, path.join(home, relative));
}
fs.rmSync(installationFile);
console.log(JSON.stringify({ uninstalled: home, restoredFrom: original ? path.join(backups, original) : null, saved }));
