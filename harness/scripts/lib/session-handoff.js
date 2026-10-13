'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { stripAnsi } = require('./utils');

const NONE = 'none recorded';
const CHECK_COMMAND = /(?:\b(?:pytest|jest|vitest|eslint|tsc|compileall)\b|--test\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|lint|check|build)\b|(?:^|[\\/\s])(?:test[_-][^\s]*|[^\s\\/]*(?:validate|verify|audit|check|lint)[^\s\\/]*)\.(?:js|cjs|mjs|py)\b|\btask\.js\s+(?:verify|lint|audit)\b|[^\s\\/'"]+[._-](?:test|spec)\.(?:[cm]?[jt]sx?|py)\b|\b(?:go|cargo|dotnet)\s+test\b)/i;

/** Read advisory state without mutating the repository's task board. */
function taskHandoff(cwd) {
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (error.status !== undefined || error.code === 'ENOENT') return { task: null, warning: null };
    throw error;
  }
  const tasks = [];
  const boards = ['docs/tasks', 'task_list'].map(dir => path.join(root, dir));
  for (const board of boards) {
    for (const folder of ['open', 'pending_review', 'closed']) {
      const directory = path.join(board, folder);
      if (!fs.existsSync(directory)) continue;
      for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.md'))) {
        const absolute = path.join(directory, file);
        const text = fs.readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        const frontmatter = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1] || '';
        const field = key => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
        const current = text.match(/^## Current state\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/im)?.[1]?.trim() || NONE;
        tasks.push({ id: field('id') || file.split('_')[0], status: field('status') || NONE,
          title: field('title') || NONE, current, absolute, board, folder,
          relative: path.relative(root, absolute).replace(/\\/g, '/'),
          updated: field('last_updated') || '', mtime: fs.statSync(absolute).mtimeMs });
      }
    }
  }
  const active = tasks.filter(task => task.folder === 'open' && task.status === 'in_progress');
  if (active.length > 1) return { task: null, warning: `multiple in_progress tasks: ${active.map(task => task.id).join(', ')}` };
  if (active.length === 1) return { task: active[0], warning: null };
  const inactive = tasks.filter(task => ['pending_review', 'closed'].includes(task.folder) && task.status === task.folder);
  const moves = [];
  for (const board of boards) {
    const journal = path.join(board, '.journal.log');
    if (!fs.existsSync(journal)) continue;
    for (const line of fs.readFileSync(journal, 'utf8').split(/\r?\n/)) {
      const moved = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) move \S+ \S+->(?:pending_review|closed) (.+)$/);
      if (!moved) continue;
      const task = inactive.find(item => item.board === board && item.absolute === path.resolve(board, moved[2]));
      if (task) moves.push({ stamp: moved[1], task });
    }
  }
  moves.sort((a, b) => b.stamp.localeCompare(a.stamp));
  inactive.sort((a, b) => b.updated.localeCompare(a.updated) || b.mtime - a.mtime || a.relative.localeCompare(b.relative));
  return { task: moves[0]?.task || inactive[0] || null, warning: null };
}

function textContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(block => ['text', 'input_text', 'output_text'].includes(block?.type))
    .map(block => block.text || '').join(' ');
}

function userIntent(text) {
  return stripAnsi(text).replace(/<(task-notification|system-reminder|local-command-stdout|local-command-stderr|external_codex_apps_open_page)\b[^>]*>[\s\S]*?<\/\1>/gi, '').trim();
}

function parseArguments(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch (error) {
    if (error instanceof SyntaxError) return {};
    throw error;
  }
}

function shellCommands(name, input) {
  if (/(?:^|[._])(?:Bash|PowerShell|exec_command|shell_command|shell)$/i.test(name)) {
    const command = input.command || input.cmd;
    return typeof command === 'string' ? [command] : [];
  }
  // Codex functions.exec contains JavaScript orchestration, never evaluate it.
  if (!['functions.exec', 'exec'].includes(name)) return [];
  const source = typeof input === 'string' ? input : '';
  return [...source.matchAll(/tools\.exec_command\(\s*\{\s*["']?(?:cmd|command)["']?\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)]
    .map(match => match[1].startsWith('"') ? JSON.parse(match[1]) : match[1].slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
}

/** An observed integer exit is required; tool success flags never imply zero. */
function exitCode(value) {
  if (Array.isArray(value)) {
    const observed = value.map(exitCode).filter(code => code !== null);
    return observed.length === 1 ? observed[0] : null;
  }
  if (value && typeof value === 'object') {
    for (const key of ['exit_code', 'exitCode']) {
      if (Number.isInteger(value[key])) return value[key];
    }
    return exitCode(value.content ?? value.output ?? value.toolUseResult ?? value.text ?? value.value);
  }
  if (typeof value !== 'string') return null;
  const parsed = parseArguments(value);
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) return exitCode(parsed);
  const match = value.match(/(?:Exit code\s*:?\s*|Process exited with code\s+)(-?\d+)\b/i);
  return match ? Number(match[1]) : null;
}

/**
 * Claude Code writes "Exit code N" with is_error only for a non-zero exit; a clean foreground run
 * carries neither. Exit 0 is read only from that exact shape: not an error, not interrupted, not
 * backgrounded. Codex results never take this path (they have no is_error field).
 */
function claudeCleanExit(block, toolUseResult) {
  if (block?.is_error !== false || !toolUseResult || typeof toolUseResult !== 'object') return null;
  if (toolUseResult.interrupted !== false || toolUseResult.backgroundTaskId || !('stdout' in toolUseResult)) return null;
  return 0;
}

/** Claude and Codex calls are paired by id; unrelated output cannot certify a check. */
function transcriptSummary(transcriptPath, log = () => {}) {
  const summary = { userMessages: [], toolsUsed: [], filesModified: [], totalMessages: 0, lastCheck: null };
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return summary;
  const calls = new Map();
  let parseErrors = 0;
  for (const line of fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    let record;
    try { record = JSON.parse(line); } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      parseErrors++;
      continue;
    }
    const entry = record.type === 'response_item' ? record.payload : record;
    if (!entry) continue;
    const message = entry.message || entry;
    if (message.role === 'user' || entry.type === 'user') {
      const intent = userIntent(textContent(message.content));
      if (intent) summary.userMessages.push(intent.slice(0, 200));
    }
    const blocks = Array.isArray(message.content) ? message.content : [];
    const invocations = blocks.filter(block => block?.type === 'tool_use');
    if (entry.type === 'tool_use' || entry.tool_name || ['function_call', 'custom_tool_call'].includes(entry.type)) invocations.push(entry);
    for (const call of invocations) {
      const name = call.name || call.tool_name || '';
      if (name) summary.toolsUsed.push(name);
      const input = call.input || call.tool_input || (['functions.exec', 'exec'].includes(name) ? (call.arguments ?? call.input) : parseArguments(call.arguments));
      const file = input?.file_path;
      if (file && ['Write', 'Edit'].includes(name)) summary.filesModified.push(file);
      const commands = shellCommands(name, input || {});
      const checks = commands.filter(command => CHECK_COMMAND.test(command));
      if (!checks.length) continue;
      const check = { command: checks.at(-1), exitCode: null };
      summary.lastCheck = check;
      // A wrapper with several shell calls has ambiguous output ordering.
      // Codex records carry an item id and a call_id; their outputs link by call_id.
      if (commands.length === 1 && (call.call_id || call.id)) calls.set(call.call_id || call.id, check);
    }
    const results = blocks.filter(block => block?.type === 'tool_result');
    if (['function_call_output', 'custom_tool_call_output'].includes(entry.type)) results.push({ tool_use_id: entry.call_id, content: entry.output });
    for (const result of results) {
      const check = calls.get(result.tool_use_id);
      if (check) check.exitCode = exitCode(record.toolUseResult) ?? exitCode(result) ?? claudeCleanExit(result, record.toolUseResult);
    }
  }
  if (parseErrors) log(`[SessionEnd] Skipped ${parseErrors} unparseable transcript lines`);
  summary.totalMessages = summary.userMessages.length;
  summary.userMessages = summary.userMessages.slice(-10);
  summary.toolsUsed = [...new Set(summary.toolsUsed)].slice(0, 20);
  summary.filesModified = [...new Set(summary.filesModified)].slice(0, 30);
  return summary;
}

function buildHandoffSection(handoff, check) {
  const task = handoff.task;
  const stateField = label => task?.current.match(new RegExp(`^[-*]?\\s*${label}:\\s*(.+)$`, 'im'))?.[1] || NONE;
  return [
    '### Task handoff',
    `Task: ${task ? `${task.id} (${task.status}) — ${task.title}` : NONE}`,
    `Source: ${task?.relative || NONE}`,
    ...(handoff.warning ? [`Warning: ${handoff.warning}`] : []),
    `Current state: ${task?.current || NONE}`,
    `Next action: ${stateField('Next action')}`,
    `Open decisions: ${stateField('Open decisions')}`,
    '', '### Last test or check',
    `Command: ${check?.command || NONE}`,
    `Exit code: ${check?.exitCode ?? NONE}`, ''
  ].join('\n');
}

module.exports = { taskHandoff, transcriptSummary, buildHandoffSection };
