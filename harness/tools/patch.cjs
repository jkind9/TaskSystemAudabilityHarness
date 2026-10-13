'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Codex's own matcher (codex-rs apply-patch seek_sequence) finally compares lines with typographic
// punctuation and odd spaces replaced by plain ASCII; match the same way so we rebuild what it applies.
const PLAIN = [[/[‐-―−]/g, '-'], [/[‘-‛]/g, "'"], [/[“-‟]/g, '"'], [/[  -   　]/g, ' ']];
const plain = s => PLAIN.reduce((text, [from, to]) => text.replace(from, to), s.trim());
function seek(lines, pattern, start, eof) {
  const first = eof ? lines.length - pattern.length : start;
  for (const normalize of [s => s, s => s.trimEnd(), s => s.trim(), plain]) {
    for (let i = Math.max(start, first); i <= lines.length - pattern.length; i++) {
      if (pattern.every((line, offset) => normalize(line) === normalize(lines[i + offset]))) return i;
    }
  }
  return -1;
}
// Reconstruct the proposed content so the SAME Claude gates see Codex patch edits.
function editsFromPatch(patch, cwd) {
  if (typeof patch !== 'string' || !patch.startsWith('*** Begin Patch')) throw new Error('Unsupported patch input');
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  const edits = [];
  for (let i = 1; i < lines.length; i++) {
    const header = lines[i].match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (!header) continue;
    const operation = header[1], source = path.resolve(cwd, header[2]);
    const old = fs.existsSync(source) ? fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n') : '';
    let target = source, content = old, unrebuilt = false;
    const body = [];
    while (i + 1 < lines.length && !/^\*\*\* (Add|Update|Delete) File:|^\*\*\* End Patch/.test(lines[i + 1])) body.push(lines[++i]);
    if (operation === 'Add') content = body.filter(l => l.startsWith('+')).map(l => l.slice(1)).join('\n') + '\n';
    else if (operation === 'Delete') content = '';
    else try {
      const original = old.split('\n');
      if (original.at(-1) === '') original.pop();
      let cursor = 0;
      const replacements = [];
      for (let j = 0; j < body.length;) {
        if (body[j].startsWith('*** Move to: ')) { target = path.resolve(cwd, body[j++].slice(13)); continue; }
        if (body[j].startsWith('@@')) {
          const anchor = body[j++].slice(2).trim();
          if (anchor) { const pos = seek(original, [anchor], cursor, false); if (pos < 0) throw new Error('Patch anchor absent: ' + anchor); cursor = pos + 1; }
        }
        let before = [], after = [];
        let eof = false;
        while (j < body.length && !body[j].startsWith('@@') && !body[j].startsWith('*** Move to:')) {
          const l = body[j++];
          if (l.startsWith('*** End of File')) { eof = true; continue; }
          if (l.startsWith(' ') || l.startsWith('-')) before.push(l.slice(1));
          if (l.startsWith(' ') || l.startsWith('+')) after.push(l.slice(1));
        }
        if (!before.length) { if (after.length) replacements.push({ pos: original.length, length: 0, after }); continue; }
        let pos = seek(original, before, cursor, eof);
        if (pos < 0 && before.at(-1) === '') {
          before = before.slice(0, -1);
          if (after.at(-1) === '') after = after.slice(0, -1);
          pos = seek(original, before, cursor, eof);
        }
        if (pos < 0) throw new Error('Patch context absent for ' + source);
        replacements.push({ pos, length: before.length, after });
        cursor = pos + before.length;
      }
      for (const replacement of replacements.sort((a, b) => a.pos - b.pos).reverse()) original.splice(replacement.pos, replacement.length, ...replacement.after);
      if (original.at(-1) !== '') original.push('');
      content = original.join('\n');
    } catch (error) {
      // Codex applies or rejects a patch it cannot match by itself. Refusing here only cost a
      // re-read and a retry (13 times in 9 Study 2 sessions), so let it through: the gates still
      // judge the file's path, against its current content, and the dispatcher logs it.
      if (!/^Patch (context|anchor) absent/.test(error.message)) throw error;
      unrebuilt = true;
      content = old;
      const move = body.find(l => l.startsWith('*** Move to: '));
      if (move) target = path.resolve(cwd, move.slice(13));
    }
    edits.push({ tool_name: 'Write', tool_input: { file_path: target, content }, source, operation, ...(unrebuilt ? { unrebuilt: true } : {}) });
    if (target !== source) edits.push({ tool_name: 'Write', tool_input: { file_path: source, content: '' }, source, operation: 'Delete' });
  }
  if (!edits.length) throw new Error('Patch has no file operations');
  return edits;
}
module.exports = { editsFromPatch };
