'use strict';
// Reads a Codex native transcript and reports (a) every tool call a hook blocked, classified by the
// reason text Codex showed the model, and (b) reads of the harness clone's instruction folders by a
// configuration that should not see them (the known task-only leak, task 02 PR-7).
//
// Limits (stated in the README): a hook that prints a [Hook] line and then times out counts as a
// refusal; a hook that exits with a code other than 2 is not a block at all; a block whose reason has
// neither prefix is reported as unclassified, never guessed.
const fs = require('node:fs');

const BLOCK_MARKERS = ['blocked by PreToolUse hook:', 'Tool call blocked by PreToolUse hook:', 'Command blocked by PreToolUse hook:'];

function classifyReason(reason) {
  const text = String(reason).trim();
  if (text.startsWith('[Hook]')) return 'refusal';
  if (text.startsWith('[Shared harness] Hook execution failed')) return 'failure';
  return 'unclassified';
}

function outputText(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output.map(item => item?.text ?? '').join('\n');
  return JSON.stringify(output ?? '');
}

/** Blocked tool calls found in tool outputs, with the reason Codex reported. */
function blockedCalls(transcriptFile) {
  const out = [];
  for (const line of fs.readFileSync(transcriptFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const payload = entry.payload || {};
    if (!/_output$/.test(payload.type || '')) continue;
    const text = outputText(payload.output);
    for (const marker of BLOCK_MARKERS) {
      const at = text.indexOf(marker);
      if (at < 0) continue;
      const reason = text.slice(at + marker.length).trim();
      out.push({ at: entry.timestamp, callId: payload.call_id, kind: classifyReason(reason), reason: reason.slice(0, 400) });
      break;
    }
  }
  return out;
}

/** Tool-call inputs that mention one of the given folders (for example the clone's generated/ folder). */
function folderReads(transcriptFile, folders) {
  const needles = folders.map(folder => folder.replaceAll('\\', '/').toLowerCase());
  let count = 0;
  const examples = [];
  for (const line of fs.readFileSync(transcriptFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const payload = entry.payload || {};
    if (!['custom_tool_call', 'function_call'].includes(payload.type)) continue;
    const input = String(payload.input ?? payload.arguments ?? '').replaceAll('\\\\', '/').replaceAll('\\', '/').toLowerCase();
    if (needles.some(needle => input.includes(needle))) {
      count++;
      if (examples.length < 5) examples.push(input.slice(0, 200));
    }
  }
  return { count, examples };
}

module.exports = { classifyReason, blockedCalls, folderReads };
