'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function writeChanged(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== value) fs.writeFileSync(file, value);
}
// v2: both assistants get the same short text: core/AGENTS.md (what is enforced, the task
// commands, the style card) and core/machine.md (notes for this machine). The general rules in
// rules/ are no longer loaded (v1 loaded them; FINDINGS.md "The lean harness as built (v2)").
const POLICY = 'core/policy.json';
function instructionTexts() {
  const source = root.replace(/\\/g, '/');
  const text = '# Shared harness (v2)\n\nEdit the source at ' + source + ', then run `node tools/render.cjs`. Both assistants use this source.\n\n'
    + read('core/AGENTS.md') + '\n\n' + read('core/machine.md')
    + '\n\n# Tool adapters\n\nUse the available skill loader or read the named SKILL.md directly. Use the native agent tool for delegation. Claude slash commands are compatibility entry points; Codex uses the equivalent source-command skills.\n';
  return { claude: text, codex: text };
}
function instructionText() { return instructionTexts().codex; }
function isClaudeInstructionFile(file) { return /[\\/]\.claude[\\/]CLAUDE\.md$/i.test(file); }
function render() {
  require('./propagation-state.cjs').recover(root);
  const texts = instructionTexts();
  writeChanged(path.join(root, 'generated', 'INSTRUCTIONS.md'), texts.codex);
  writeChanged(path.join(root, 'generated', 'CLAUDE.md'), texts.claude);
  for (const name of fs.readdirSync(path.join(root, 'agents')).filter(n => n.endsWith('.md'))) {
    const raw = read('agents/' + name);
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error('Missing agent frontmatter: ' + name);
    const desc = match[1].match(/^description:\s*(.+)$/m)?.[1] || name;
    const instructions = match[2];
    const agentName = name.replace(/\.md$/, '');
    // JSON quoted strings are valid TOML basic strings, including escaped newlines.
    writeChanged(path.join(root, 'generated', 'codex-agents', agentName + '.toml'), 'name = ' + JSON.stringify(agentName) + '\ndescription = ' + JSON.stringify(desc.replace(/^"|"$/g, '')) + '\ndeveloper_instructions = ' + JSON.stringify(instructions) + '\n');
  }
  for (const name of fs.readdirSync(path.join(root, 'commands')).filter(n => n.endsWith('.md'))) {
    const raw = read('commands/' + name);
    const command = name.replace(/\.md$/, '');
    const description = raw.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^"|"$/g, '') || 'Run the shared /' + command + ' workflow.';
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
    const skillName = 'source-command-' + command;
    writeChanged(path.join(root, 'skills', skillName, 'SKILL.md'), '---\nname: ' + skillName + '\ndescription: ' + JSON.stringify(description) + '\n---\n\n' + body);
  }
  const policy = JSON.parse(read(POLICY));
  const events = [...new Set(['SessionStart', 'UserPromptSubmit', ...policy.hooks.map(h => h.event)])];
  for (const provider of ['claude', 'codex']) {
    const hooks = {};
    for (const event of events) {
      hooks[event] = [{ matcher: '*', hooks: [{ type: 'command', command: 'node "' + path.join(root, 'tools', 'dispatch.cjs').replace(/\\/g, '/') + '" ' + provider + ' ' + event, timeout: event === 'SessionEnd' ? 3 : 300 }] }];
    }
    writeChanged(path.join(root, 'generated', provider + '-hooks.json'), JSON.stringify({ hooks }, null, 2) + '\n');
  }
  // Restore instruction parity even if an editor replaced a linked file atomically.
  const install = path.join(root, 'installation.json');
  if (fs.existsSync(install)) {
    for (const file of JSON.parse(fs.readFileSync(install, 'utf8')).instructions) writeChanged(file, isClaudeInstructionFile(file) ? texts.claude : texts.codex);
  }
  return {
    instructionsSha256: hash(texts.codex), bytes: Buffer.byteLength(texts.codex),
    claudeInstructionsSha256: hash(texts.claude), claudeBytes: Buffer.byteLength(texts.claude),
    agents: fs.readdirSync(path.join(root, 'agents')).filter(n => n.endsWith('.md')).length,
  };
}
module.exports = { root, render, hash, instructionText, instructionTexts, isClaudeInstructionFile, writeChanged, POLICY };
if (require.main === module) console.log(JSON.stringify(render()));
