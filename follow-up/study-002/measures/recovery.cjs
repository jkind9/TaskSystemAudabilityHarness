'use strict';
// Planning and recovery measure for the two-session tasks (restart, tablib, watson):
// (a) repeated discovery: session 2's tokens, tool calls and shell commands before its first code edit;
// (b) part-1 decisions session 2 kept, changed or duplicated (judged by a reviewer against the answer key
//     tasks/<task>/private/decision-points.json);
// (c) grader categories still missed at the end (from correctness).
//
// Limits: an edit is found from apply_patch file headers, and from shell commands that write to a code
// file by name (Set-Content, Out-File, Add-Content, New-Item or a > redirect). A write by a script the
// model ran (for example `python fix.py`) is not seen. Edits to task records and docs do not count.
const fs = require('node:fs');
const path = require('node:path');

const CODE_FILE = /\.(py|pyi|js|cjs|mjs|ts|tsx|jsx|java|go|rs|rb|cs|cpp|c|h|toml|cfg|ini|json|ya?ml)$/i;
const NOT_CODE = /(^|[\\/])(task_list|docs[\\/]tasks)[\\/]/i;
// Patch headers end at an escaped line break (a backslash-n not itself preceded by a backslash, so a
// doubled-backslash path segment such as \\notes is not mistaken for one), a real line break or a quote.
const PATCH_FILE = /\*\*\* (?:Update|Add|Delete) File: (.+?)(?=(?<!\\)\\n|\n|"|$)/g;
// Shell commands inside code-mode calls: exec_command({cmd: "<JSON string>"}).
const SHELL_CMD = /exec_command\(\{\s*cmd:\s*("(?:[^"\\]|\\.)*")/g;
// The target of a shell write: the first path after the cmdlet (or its -Path), or after a > redirect.
const CMDLET_TARGET = /\b(?:Set-Content|Add-Content|Out-File|New-Item)\s+(?:-(?:Path|FilePath|LiteralPath)\s+)?['"]?([^\s'";|]+)/gi;
const REDIRECT_TARGET = /(?<![-=<>])>{1,2}\s*['"]?([^\s'";|&]+)/g;
const VERDICTS = { kept: 'kept', changed: 'changed', duplicated: 'duplicated', not_decided_in_session_1: 'notDecided' };

const isCodePath = file => CODE_FILE.test(file.trim()) && !NOT_CODE.test(file);

function shellCommands(input) {
  const fromCodeMode = [...input.matchAll(SHELL_CMD)].map(match => { try { return JSON.parse(match[1]); } catch { return ''; } });
  let direct = null;
  try { direct = JSON.parse(input); } catch { /* code-mode input is JavaScript, not JSON */ }
  const command = direct && (direct.cmd ?? direct.command);
  return command ? [...fromCodeMode, [].concat(command).join(' ')] : fromCodeMode;
}

/** Does this tool-call input edit a code file? Only patch headers and shell write targets count. */
function editsCode(input) {
  for (const match of input.matchAll(PATCH_FILE)) if (isCodePath(match[1])) return true;
  return shellCommands(input).some(cmd => [...cmd.matchAll(CMDLET_TARGET), ...cmd.matchAll(REDIRECT_TARGET)].some(m => isCodePath(m[1])));
}

function commandCount(payload, input) {
  if (payload.type === 'function_call') return /shell|exec_command/.test(payload.name || '') ? 1 : 0;
  return (input.match(/exec_command\(/g) || []).length;
}

/** Discovery cost before the first code edit in one session transcript. */
function firstCodeEdit(transcriptFile) {
  let tokens = null, calls = 0, commands = 0;
  for (const line of fs.readFileSync(transcriptFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const payload = entry.payload || {};
    if (entry.type === 'event_msg' && payload.type === 'token_count' && payload.info?.total_token_usage) {
      const usage = payload.info.total_token_usage;
      tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      continue;
    }
    if (!['custom_tool_call', 'function_call'].includes(payload.type)) continue;
    const input = String(payload.input ?? payload.arguments ?? '');
    if (editsCode(input)) return { found: true, tokensBefore: tokens, toolCallsBefore: calls, commandsBefore: commands };
    calls++;
    commands += commandCount(payload, input);
  }
  return { found: false, tokensBefore: null, toolCallsBefore: calls, commandsBefore: commands };
}

/** Counts from the recovery reviewer's verdicts; every answer-key point must appear exactly once. */
function decisionSummary(review, pointIds) {
  const out = { kept: 0, changed: 0, duplicated: 0, notDecided: 0, total: 0 };
  const seen = new Set();
  for (const point of review?.points || []) {
    if (!pointIds.includes(point.id) || seen.has(point.id)) throw new Error('Unexpected or repeated decision point: ' + point.id);
    const key = VERDICTS[point.verdict];
    if (!key) throw new Error('Unknown verdict for ' + point.id + ': ' + point.verdict);
    seen.add(point.id); out[key]++; out.total++;
  }
  if (seen.size !== pointIds.length) throw new Error('Missing decision points: ' + pointIds.filter(id => !seen.has(id)).join(', '));
  return out;
}

/** Scripted part for a two-session run; the decision summary is added once the review exists. */
function measure(evidence) {
  const second = evidence.sessions.find(s => s.n === 2);
  if (!second) return { applicable: false };
  if (!second.transcript) return { applicable: true, discovery: null, reason: 'session 2 has no transcript (status ' + second.status + ')' };
  return { applicable: true, discovery: firstCodeEdit(second.transcript) };
}

/** The answer key of part-1 choices for a two-session task (tasks/<task>/private/decision-points.json), or null. */
function decisionPoints(task) {
  const file = path.join(__dirname, '..', 'tasks', task, 'private', 'decision-points.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).points : null;
}

module.exports = { firstCodeEdit, decisionSummary, measure, editsCode, decisionPoints };
