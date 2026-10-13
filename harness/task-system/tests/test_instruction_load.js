// Instruction load regression tests (v2): each assistant gets one short text built from core/.
// The general rules are no longer installed; the style card in core/AGENTS.md replaces them.
// Run: node --test task-system/tests/test_instruction_load.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const render = require(path.join(ROOT, 'tools', 'render.cjs'));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test('render exposes a Claude text and a Codex text', () => {
  assert.strictEqual(typeof render.instructionTexts, 'function');
  const texts = render.instructionTexts();
  assert.ok(texts.claude.length > 0 && texts.codex.length > 0);
});

test('both texts carry core/AGENTS.md and the machine notes, and nothing from the v1 instructions or rules', () => {
  const texts = render.instructionTexts();
  for (const [name, text] of Object.entries(texts)) {
    assert.ok(text.includes(read('core/AGENTS.md')), name + ': core/AGENTS.md');
    assert.ok(text.includes(read('core/machine.md')), name + ': core/machine.md');
    assert.ok(!text.includes('# Shared rules'), name);
    assert.ok(!text.includes('Task workflow (all projects)'), name);
    assert.ok(!text.includes('Everything Claude Code'), name);
    assert.ok(text.length < 25000, name + ': ' + text.length + ' characters');
  }
});

test('install no longer targets ~/.claude/AGENTS.md', () => {
  // Upgrade migration may mention the obsolete path, but it is never a live target.
  if (!fs.existsSync(path.join(ROOT, 'installation.json'))) return;
  const install = JSON.parse(read('installation.json'));
  assert.ok(!install.instructions.some(f => /[\\/]\.claude[\\/]AGENTS\.md$/i.test(f)));
});

test('every web rule is limited to web files by a paths filter', () => {
  for (const name of fs.readdirSync(path.join(ROOT, 'rules', 'web')).filter(n => n.endsWith('.md'))) {
    assert.match(read('rules/web/' + name), /^---\npaths:\n/, name);
  }
});

test('the installed Claude file holds the Claude text and no duplicate AGENTS.md exists', () => {
  const home = os.homedir();
  const claudeFile = path.join(home, '.claude', 'CLAUDE.md');
  if (!fs.existsSync(path.join(ROOT, 'installation.json')) || !fs.existsSync(claudeFile)) return;
  assert.strictEqual(fs.readFileSync(claudeFile, 'utf8'), render.instructionTexts().claude);
  assert.ok(!fs.existsSync(path.join(home, '.claude', 'AGENTS.md')));
});
