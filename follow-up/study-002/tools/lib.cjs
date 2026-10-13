'use strict';
// Shared helpers for the Study 2 pilot tools. Most are copied from Study 1's tools/runner.cjs and
// tools/prepare.cjs (which stay frozen); line references are kept so the provenance is checkable.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const studyRoot = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = file => hash(fs.readFileSync(file));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Write JSON atomically (Study 1 tools/runner.cjs:18). */
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
  try {
    const fd = fs.openSync(temporary, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

const VOLATILE = new Set(['.git', 'node_modules', '__pycache__', '.pytest_cache']);
/** Files below a folder in a stable order, skipping VCS and caches (Study 1 tools/runner.cjs:29). */
function treeFiles(directory, skip = VOLATILE) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isDirectory() && skip.has(entry.name)) return [];
    if (entry.isSymbolicLink()) return [];
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? treeFiles(item, skip) : [item];
  });
}
function treeHash(directory, skip = VOLATILE) {
  return hash(treeFiles(directory, skip).map(file => path.relative(directory, file).replaceAll('\\', '/') + '\0' + digest(file)).join('\n'));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}
function git(args, cwd, env) {
  const result = run('git', args, { cwd, env: env ? { ...process.env, ...env } : process.env });
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || '').slice(0, 1500));
  return result.stdout;
}

/** Kill a Windows process tree (Study 1 tools/runner.cjs:176). */
function killTree(pid) {
  if (!pid) return;
  const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) {
    try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

/** Token usage, from turn.completed with a transcript fallback (Study 1 tools/runner.cjs:53-71). */
function normalizeUsage(source) {
  if (!source || typeof source !== 'object') return null;
  const usage = {
    input_tokens: source.input_tokens ?? source.inputTokens ?? null,
    cached_input_tokens: source.cached_input_tokens ?? source.cachedInputTokens ?? null,
    output_tokens: source.output_tokens ?? source.outputTokens ?? null,
    reasoning_output_tokens: source.reasoning_output_tokens ?? source.reasoningOutputTokens ?? null
  };
  return Object.values(usage).some(value => value !== null) ? usage : null;
}
function usageFromEvents(events, lastTranscriptCounter) {
  const completed = events.filter(event => event.type === 'turn.completed').at(-1);
  const usage = normalizeUsage(completed?.usage);
  if (usage) return { usage, source: 'turn.completed' };
  const fallback = lastTranscriptCounter?.total_token_usage || lastTranscriptCounter;
  return { usage: normalizeUsage(fallback), source: fallback ? 'last_transcript_counter' : null };
}
/** Total tokens counted against the budget: all input (fresh + cached) plus output. */
function totalTokens(usage) {
  if (!usage || usage.input_tokens === null || usage.output_tokens === null) return null;
  return usage.input_tokens + usage.output_tokens;
}

/** Find a thread's native transcript in a private CODEX_HOME (Study 1 tools/runner.cjs:190). */
function transcriptInfo(codexHome, threadId) {
  const empty = { transcript: null, transcriptSha256: null, lastTranscriptCounter: null, context: null };
  if (!threadId) return empty;
  const file = treeFiles(path.join(codexHome, 'sessions')).find(item => item.endsWith('.jsonl') && item.includes(threadId));
  if (!file) return empty;
  let lastUsage = null, context = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
    let entry;
    // A process killed at the timeout can leave the last line cut short; skip it rather than lose the rest.
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === 'event_msg' && entry.payload?.type === 'token_count' && entry.payload.info) lastUsage = entry.payload.info;
    if (entry.type === 'turn_context') context = {
      model: entry.payload?.model ?? null, effort: entry.payload?.effort ?? null,
      approval: entry.payload?.approval_policy ?? null, sandbox: entry.payload?.sandbox_policy ?? null
    };
  }
  return { transcript: file, transcriptSha256: digest(file), lastTranscriptCounter: lastUsage?.total_token_usage || lastUsage, context };
}

const tomlString = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
const toPosix = value => value.replaceAll('\\', '/');

module.exports = {
  studyRoot, hash, digest, readJson, atomicJson, treeFiles, treeHash, run, git, killTree, pidAlive,
  normalizeUsage, usageFromEvents, totalTokens, transcriptInfo, tomlString, toPosix
};
