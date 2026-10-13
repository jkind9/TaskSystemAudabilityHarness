#!/usr/bin/env node
// Token and model totals for one task, read from Claude transcripts.
//
// A task's time windows come from its board journal: "start <id>" (v1) or "begin <id>" (v2) opens a
// window; the next "move <id> ..." or "finish <id>", or a "start" of another task, closes it. Each Claude session with messages
// inside a window is listed on its own line, because concurrent sessions in one checkout cannot
// be told apart by time alone; pass --session to count only the one that did the work.
// Each assistant message is counted once (its last streamed record). Subagent transcripts are
// included under their parent session. Codex sessions are not read.
//
// Usage: node usage.js <task-id> [--board <task_list dir>] [--projects <dir>] [--session <id>] [--json]
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const args = { id: null, board: path.join(process.cwd(), "task_list"), projects: path.join(os.homedir(), ".claude", "projects"), session: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--board") args.board = argv[++i];
    else if (tok === "--projects") args.projects = argv[++i];
    else if (tok === "--session") args.session = argv[++i];
    else if (tok === "--json") args.json = true;
    else if (tok.startsWith("--")) { process.stderr.write("unknown flag " + tok + "\n"); process.exit(1); }
    else args.id = tok;
  }
  if (!args.id) { process.stderr.write("usage: node usage.js <task-id> [--board dir] [--projects dir] [--session id] [--json]\n"); process.exit(1); }
  return args;
}

// Journal stamps are local "YYYY-MM-DD HH:MM:SS"; returns [{from, to}] as Dates for the task.
function taskWindows(journalText, id) {
  const windows = [];
  let openedAt = null;
  for (const line of journalText.split(/\r?\n/)) {
    const m = line.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) (\S+) (\S+)/);
    if (!m) continue;
    const when = new Date(m[1] + "T" + m[2]);
    const [verb, taskId] = [m[3], m[4]];
    const closesThisTask = ((verb === "move" || verb === "finish") && taskId === id) || (verb === "start" && taskId !== id);
    if ((verb === "start" || verb === "begin") && taskId === id && !openedAt) openedAt = when;
    else if (closesThisTask && openedAt) { windows.push({ from: openedAt, to: when }); openedAt = null; }
  }
  if (openedAt) windows.push({ from: openedAt, to: new Date() });
  return windows;
}

// Every transcript file under projectsDir: {file, session, isSubagent}.
function transcriptFiles(projectsDir) {
  const out = [];
  let projects = [];
  try { projects = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(e => e.isDirectory()); } catch { return out; }
  for (const project of projects) {
    const dir = path.join(projectsDir, project.name);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push({ file: path.join(dir, entry.name), session: entry.name.slice(0, -6), isSubagent: false, project: dir });
      const subagents = path.join(dir, entry.name, "subagents");
      if (entry.isDirectory() && fs.existsSync(subagents)) {
        for (const name of fs.readdirSync(subagents).filter(n => n.endsWith(".jsonl"))) out.push({ file: path.join(subagents, name), session: entry.name, isSubagent: true, project: dir });
      }
    }
  }
  return out;
}

// Last usage record per assistant message in one transcript.
function assistantMessages(file) {
  const byId = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    const msg = record.message;
    if (!msg || msg.role !== "assistant" || !msg.usage || msg.model === "<synthetic>" || !record.timestamp) continue;
    byId.set(msg.id || record.uuid, { time: new Date(record.timestamp), model: msg.model, usage: msg.usage });
  }
  return [...byId.values()];
}

function emptyTotals(session) {
  return { session, messages: 0, subagentMessages: 0, freshInput: 0, cacheRead: 0, output: 0, models: {} };
}
function addMessage(totals, message, isSubagent) {
  const u = message.usage;
  totals.messages += 1;
  if (isSubagent) totals.subagentMessages += 1;
  totals.freshInput += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  totals.cacheRead += u.cache_read_input_tokens || 0;
  totals.output += u.output_tokens || 0;
  totals.models[message.model] = (totals.models[message.model] || 0) + 1;
}

// Unknown origins stay separate; time overlap alone does not attribute work.
function transcriptCwd(file) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch (error) { if (error instanceof SyntaxError) continue; throw error; }
    if (typeof record.cwd === 'string' && path.isAbsolute(record.cwd)) return record.cwd;
  }
  return null;
}
function repositoryOf(directory) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: directory, encoding: 'utf8', windowsHide: true });
  const resolved = path.resolve(result.status === 0 ? result.stdout.trim() : directory);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function boardRepository(board) {
  const absolute = path.resolve(board);
  const directory = path.basename(absolute) === 'tasks' && path.basename(path.dirname(absolute)) === 'docs'
    ? path.dirname(path.dirname(absolute)) : path.dirname(absolute);
  return repositoryOf(directory);
}

function report(args) {
  let journalText = "";
  try { journalText = fs.readFileSync(path.join(args.board, ".journal.log"), "utf8"); } catch { /* no journal: no windows */ }
  const windows = taskWindows(journalText, args.id);
  const inWindow = t => windows.some(w => t >= w.from && t <= w.to);
  const sessions = new Map(), unattributed = new Map();
  const target = boardRepository(args.board), origins = new Map(), repositories = new Map();
  // A transcript last written before the task's first window cannot hold its messages; skipping it
  // keeps this fast as the transcript folder grows.
  const earliest = windows.length ? Math.min(...windows.map(w => w.from.getTime())) : Infinity;
  const transcripts = transcriptFiles(args.projects).filter(t => fs.statSync(t.file).mtimeMs >= earliest);
  for (const transcript of transcripts.filter(t => !t.isSubagent)) origins.set(transcript.project + '/' + transcript.session, transcriptCwd(transcript.file));
  for (const t of transcripts) {
    if (args.session && t.session !== args.session) continue;
    const origin = transcriptCwd(t.file) || origins.get(t.project + '/' + t.session);
    if (origin && !repositories.has(origin)) repositories.set(origin, repositoryOf(origin));
    if (origin && repositories.get(origin) !== target) continue;
    const selected = origin ? sessions : unattributed;
    const identity = t.project + '/' + t.session;
    for (const message of assistantMessages(t.file).filter(m => inWindow(m.time))) {
      if (!selected.has(identity)) selected.set(identity, emptyTotals(t.session));
      addMessage(selected.get(identity), message, t.isSubagent);
    }
  }
  const total = emptyTotals("all");
  for (const s of sessions.values()) {
    for (const key of ["messages", "subagentMessages", "freshInput", "cacheRead", "output"]) total[key] += s[key];
    for (const [model, n] of Object.entries(s.models)) total.models[model] = (total.models[model] || 0) + n;
  }
  return { task: args.id, windows, sessions: [...sessions.values()], unattributed: [...unattributed.values()], total, coverage: "Claude transcripts only; Codex sessions are not read" };
}

function printText(r) {
  console.log("task " + r.task + ": " + r.windows.length + " window(s) from the journal");
  for (const w of r.windows) console.log("  " + w.from.toLocaleString("sv-SE") + " -> " + w.to.toLocaleString("sv-SE"));
  for (const s of [...r.sessions, r.total]) {
    console.log((s.session === "all" ? "TOTAL" : "session " + s.session) + ": " + s.messages + " messages (" + s.subagentMessages + " subagent), fresh input " + s.freshInput + ", cache read " + s.cacheRead + ", output " + s.output + ", models " + JSON.stringify(s.models));
  }
  if (r.sessions.length > 1) console.log("note: " + r.sessions.length + " sessions overlap these windows; use --session <id> to count only the one that did this task's work.");
  if (r.unattributed.length) console.log("unattributed: " + r.unattributed.length + " session(s) without repository evidence; excluded from totals");
  console.log("coverage: " + r.coverage);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const r = report(args);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else printText(r);
}
module.exports = { taskWindows, assistantMessages, report };
