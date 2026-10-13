'use strict';
// Import only harness assets. Credentials, histories and session state stay in place.
const fs = require('node:fs');
const path = require('node:path');
const home = require('node:os').homedir();
const root = path.resolve(__dirname, '..');
const claude = path.join(home, '.claude');
if (fs.existsSync(path.join(root, 'core', 'policy.json'))) throw new Error('The shared source already exists; bootstrap is a one-time import, not a sync command.');
const conflicts = [];
function copyTree(from, to, overwrite = true) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    if (/\.bak|\.new$|^node_modules$|^\.git$/.test(item.name)) continue;
    const source = path.join(from, item.name), target = path.join(to, item.name);
    if (item.isDirectory()) copyTree(source, target, overwrite);
    else if (item.isFile()) {
      if (fs.existsSync(target) && !fs.readFileSync(source).equals(fs.readFileSync(target))) conflicts.push({ source, target, winner: overwrite ? source : target });
      if (overwrite || !fs.existsSync(target)) fs.copyFileSync(source, target);
    }
  }
}
copyTree(path.join(home, '.agents', 'skills'), path.join(root, 'skills'));
copyTree(path.join(home, '.codex', 'skills'), path.join(root, 'skills'), false);
for (const dir of ['skills', 'scripts', 'rules', 'agents', 'commands', 'task-system', 'output-styles']) copyTree(path.join(claude, dir), path.join(root, dir));
fs.mkdirSync(path.join(root, 'instructions'), { recursive: true });
for (const file of ['CLAUDE.md', 'AGENTS.md']) fs.copyFileSync(path.join(claude, file), path.join(root, 'instructions', file));
fs.copyFileSync(path.join(home, '.codex', 'AGENTS.md'), path.join(root, 'instructions', 'codex-original.md'));
const settings = JSON.parse(fs.readFileSync(path.join(claude, 'settings.json'), 'utf8'));
const upstream = JSON.parse(fs.readFileSync(path.join(claude, 'hooks', 'hooks.json'), 'utf8'));
const hooks = [];
const inlineImports = [];
for (const [event, groups] of Object.entries(upstream.hooks)) {
  for (const group of groups) for (const handler of group.hooks) {
    const suffix = handler.command.split('require(s)\\" ').pop();
    let args;
    const normal = handler.command.match(/require\(s\)" (node|shell) (.+)$/);
    const stop = handler.command.match(/\[script,([^\]]+)\]/);
    if (normal) args = [normal[1], ...normal[2].trim().split(/\s+/)];
    else if (stop) args = ['node', 'scripts/hooks/run-with-flags.js', ...[...stop[1].matchAll(/'([^']+)'/g)].map(m => m[1])];
    else throw new Error('Cannot import upstream hook: ' + event + ' ' + suffix.slice(-100));
    hooks.push({ id: 'ecc-' + hooks.length, event, matcher: group.matcher || '*', args, timeout: handler.timeout || 60 });
  }
}
for (const [event, groups] of Object.entries(settings.hooks)) {
  for (const group of groups) for (const handler of group.hooks) {
    const script = handler.command.match(/\.claude\/scripts\/hooks\/([\w.-]+\.js)/);
    if (script) hooks.push({ id: script[1].replace('.js', ''), event, matcher: ['PreToolUse', 'PostToolUse'].includes(event) ? 'Edit|Write' : '*', args: ['node', 'scripts/hooks/' + script[1]], timeout: handler.timeout || 30 });
    else inlineImports.push({ event, matcher: group.matcher, command: handler.command });
  }
}
hooks.push({ id: 'documentation-policy', event: 'PreToolUse', matcher: 'Edit|Write', builtin: 'documentation-policy' });
hooks.push({ id: 'console-warning', event: 'PostToolUse', matcher: 'Edit|Write', builtin: 'console-warning' });
hooks.push({ id: 'bash-documentation-policy', event: 'PreToolUse', matcher: 'Bash', builtin: 'bash-documentation-policy' });
hooks.push({ id: 'pr-created', event: 'PostToolUse', matcher: 'Bash', builtin: 'pr-created' });
hooks.push({ id: 'console-stop-warning', event: 'Stop', matcher: '*', builtin: 'console-stop-warning' });
hooks.push({ id: 'legacy-tmux-devserver', event: 'PreToolUse', matcher: 'Bash', builtin: 'legacy-tmux-devserver', disabled: 'Claude instructions explicitly state tmux is unavailable on this Windows machine.' });
if (inlineImports.length !== 6) throw new Error('Unexpected inline custom hooks; explicitly adapt them before installation.');
fs.writeFileSync(path.join(root, 'instructions/legacy-custom-hooks.json'), JSON.stringify(inlineImports, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'core', 'policy.json'), JSON.stringify({ version: 1, authority: 'Claude local harness, imported 2026-10-01', env: settings.env, hooks }, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'import-report.json'), JSON.stringify({ conflicts, hooks: hooks.length }, null, 2) + '\n');
console.log(JSON.stringify({ root, hooks: hooks.length, conflicts: conflicts.length, authority: 'claude' }));
