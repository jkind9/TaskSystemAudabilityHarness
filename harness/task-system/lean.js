"use strict";
// Lean task flow: a task record written twice, each with one command (FINDINGS.md item 1).
//   begin "<title>" --files a,b [--goal "<text>"] [--plan "<text>"]
//       writes task_list/open/<id>_<slug>.md from core/task-template.md as the in_progress task,
//       and prints what the last finished task left over.
//   finish --checked "<command> -> <result>" [--left "<text>"]
//       runs checks/run.cjs once, writes Files, Checked and Left over, sets status: done and moves
//       the file to task_list/done/. Refuses (task stays open) only for a new duplicate block or a
//       code file over 800 lines.
//   files add <path>[,<path>...]
//       adds each path not yet listed to the open task's files: list, so widening scope is one call.
//   adopt <id>
//       moves an open task to this session, for when the session that began it has ended.
// A record belongs to the session that began it (session:, lean-board.js). Every command acts on
// this session's task only, so parallel sessions on one board never block or finish each other.
// Called from task.js, which passes the board it located (never above the repository; locate.js).
const fs = require("fs");
const os = require("os");
const path = require("path");
const HARNESS = path.resolve(__dirname, "..");
const TEMPLATE = path.join(HARNESS, "core", "task-template.md");
const { runChecks } = require(path.join(HARNESS, "checks", "run.cjs"));
const { readText, section, FILES_BLOCK, filesOf, sessionId, ownerOf, tasks, openIn, othersIn, lastDoneIn, globMatch, claimedElsewhere } = require("./lean-board.js");
const usage = require("./usage.js");
const FLAGS = { begin: ["--files", "--goal", "--plan"], finish: ["--checked", "--left"], files: [], adopt: [] };

function die(msg) { process.stderr.write(String(msg).replace(/\n?$/, "\n")); process.exit(1); }
function say(msg) { process.stdout.write(String(msg).replace(/\n?$/, "\n")); }

function parse(cmd, argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (FLAGS[cmd].includes(argv[i])) a[argv[i].slice(2)] = argv[++i] ?? "";
    else if (argv[i].startsWith("--")) die("unknown flag " + argv[i] + " for " + cmd + " — nothing was changed.");
    else a._.push(argv[i]);
  }
  return a;
}

const journal = (taskRoot, line) => fs.appendFileSync(path.join(taskRoot, ".journal.log"), new Date().toLocaleString("sv-SE") + " " + line + "\n");

function begin(a, { taskRoot }) {
  const title = a._[0];
  if (!title) die('begin needs a title:  task.js begin "<title>" --files a,b --goal "<one line>" --plan "<steps>"');
  const files = String(a.files || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!files.length) die("begin needs --files: the paths (or globs) this task will change, comma-separated.");
  const session = sessionId();
  const held = openIn(taskRoot, session);
  if (held) die("Task " + held.id + " is still open" + (session ? " in this session" : "") + ". Finish it first:  task.js finish --checked \"<command> -> <result>\" --left \"<what is left>\"");
  const id = claimId(taskRoot);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "task";
  const text = readText(TEMPLATE).replace(/{{ID}}/g, id).replace(/{{TITLE}}/g, title).replace(/{{CREATED}}/g, new Date().toISOString().slice(0, 10))
    .replace("{{SESSION}}", session).replace("{{FILES}}", files.map(f => "  - " + f).join("\n")).replace("{{GOAL}}", a.goal || title).replace("{{PLAN}}", a.plan || "1. " + title);
  const dest = path.join(taskRoot, "open", id + "_" + slug + ".md");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text, { flag: "wx" });
  journal(taskRoot, "begin " + id + " open/" + path.basename(dest) + (session ? " session " + session : ""));
  say("Task " + id + " begun: " + path.relative(process.cwd(), dest).replace(/\\/g, "/") + " (files: " + files.join(", ") + ")");
  warnShared(taskRoot, session, files);
  const last = lastDoneIn(taskRoot);
  const left = last && section(readText(last.path), "Left over");
  if (left && !/^none\.?$/i.test(left)) say("Left over from task " + last.id + ": " + left);
}

// Two sessions can begin at the same moment and both see the same highest id. Creating a folder
// succeeds for only one caller, so each begin gets its own number.
function claimId(taskRoot) {
  const numbers = tasks(taskRoot).map(t => parseInt(t.id, 10)).filter(n => !isNaN(n));
  fs.mkdirSync(path.join(taskRoot, ".ids"), { recursive: true });
  for (let n = numbers.length ? Math.max(...numbers) + 1 : 0; ; n++) {
    const id = String(n).padStart(2, "0");
    try { fs.mkdirSync(path.join(taskRoot, ".ids", id)); return id; }
    catch (e) { if (e.code !== "EEXIST") throw e; }
  }
}

// Files another session's open task also lists: say so once per task, so the two sessions agree an order.
function warnShared(taskRoot, session, files) {
  for (const other of othersIn(taskRoot, session)) {
    const listed = filesOf(readText(other.path));
    const shared = files.filter(f => listed.some(g => globMatch(g, f) || globMatch(f, g)));
    if (shared.length) say("Note: open task " + other.id + " in another session also lists " + shared.join(", ") + ". Edits there can collide: ask the user which session goes first, or use a worktree.");
  }
}

const share = value => (value === null || value === undefined ? "n/a (no functions)" : String(Math.round(value * 100) / 100));
function checkedLines(checked, c) {
  if (!c.git) return ["- " + checked, "- other checks not run: " + c.reason];
  const dead = c.deadCode.count === null ? "not checked (" + c.deadCode.note + ")" : c.deadCode.count + (c.deadCode.examples?.length ? " (" + c.deadCode.examples.join("; ") + ")" : "");
  const hits = c.prose.hits.map(h => h.pattern + ' "' + h.text.slice(0, 40) + '"');
  return [
    "- " + checked,
    "- new duplicate blocks: " + c.duplicates.count,
    "- complexity share (functions over 10): " + share(c.complexity.after) + " (was " + share(c.complexity.before) + ")" + (c.complexity.note ? "; " + c.complexity.note : ""),
    "- dead code on added lines: " + dead,
    "- prose patterns: " + c.prose.hits.length + " in " + c.prose.words + " words" + (hits.length ? ": " + hits.slice(0, 5).join(", ") : ""),
    ...(c.unreadable.length ? ["- folders that could not be read, skipped: " + c.unreadable.join(", ")] : []),
    ...(c.overLimit.length ? ["- over 800 lines, not grown: " + c.overLimit.map(f => f.path + " (" + f.lines + ", was " + f.was + ")").join(", ")] : []),
  ];
}
function replaceSection(text, name, body) {
  const pattern = new RegExp("(^## " + name + ")[ \\t]*\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))", "m");
  return pattern.test(text) ? text.replace(pattern, "$1\n\n" + body + "\n\n") : text.replace(/\n*$/, "\n\n## " + name + "\n\n" + body + "\n");
}

function finish(a, { root, taskRoot }) {
  const session = sessionId();
  const t = openIn(taskRoot, session);
  if (!t) die("no open task to finish in this session (begin one with: task.js begin \"<title>\" --files a,b)." + elsewhereNote(taskRoot, session));
  if (!a.checked) die('finish needs --checked "<command you ran> -> <its result>", for example --checked "python -m pytest -q -> 42 passed".');
  const named = namesACheck(a.checked);
  const unchecked = "finish-unchecked " + t.id;
  if (!named && !journaled(taskRoot, unchecked)) {
    journal(taskRoot, unchecked);
    die("Task " + t.id + " not finished: --checked names no check that ran. Run one and say what it showed, for example\n" +
      '  node "$HOME/.claude/task-system/task.js" finish --checked "<command you ran> -> <result>" --left "<what is left, or none>"\n' +
      'or, if this change has nothing to test:  --checked "no test exists: <why>"');
  }
  const shown = "`" + a.checked + "`" + (named ? "" : " (no check named; accepted after one refusal)");
  let text = readText(t.path);
  // Another session's files are that session's work: they are neither listed nor judged here.
  const skip = claimedElsewhere(othersIn(taskRoot, session).flatMap(o => filesOf(readText(o.path))), filesOf(text));
  const c = runChecks({ root, taskText: text, skip });
  if (c.refusals.length) die("Task " + t.id + " not finished:\n  " + c.refusals.join("\n  ") + "\nFix these, then run finish again.");
  const files = c.git ? c.files.map(f => "- " + f.path + " (+" + f.added + " -" + f.removed + ", " + f.lines + " lines)").join("\n") || "- none changed" : "- not listed: " + c.reason;
  const checkedBody = checkedLines(shown, c);
  checkedBody.splice(1, 0, costLine(taskRoot, t.id));
  text = replaceSection(text, "Files", files);
  text = replaceSection(text, "Checked", checkedBody.join("\n"));
  text = replaceSection(text, "Left over", a.left || "None.");
  text = text.replace(/^status:.*$/m, "status: done").replace(/\n+$/, "\n");
  const dest = path.join(taskRoot, "done", t.file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
  fs.unlinkSync(t.path);
  journal(taskRoot, "finish " + t.id + " done/" + t.file);
  say("Task " + t.id + " done: " + path.relative(process.cwd(), dest).replace(/\\/g, "/"));
  say(checkedBody.slice(1).join("\n"));
}

// Minutes from begin to now and the Claude tokens used in that time (usage.js), measured here so
// the model takes no extra step: each step re-sends the whole conversation (Study 2), so asking the
// model to measure would cost far more than this one line. Codex keeps no transcript Node can read.
// Only the sessions that owned the task are counted (begin and adopt name them in the journal), so a
// parallel session's tokens stay with its own tasks; a task with no named owner counts every session.
function costLine(taskRoot, id) {
  let journalText = "";
  try { journalText = fs.readFileSync(path.join(taskRoot, ".journal.log"), "utf8"); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  const owners = [...new Set(journalText.split(/\r?\n/).map(l => l.match(/ (?:begin|adopt) (\S+) .*?\bsession (\S+)/)).filter(m => m && m[1] === id).map(m => m[2]))];
  const windows = usage.taskWindows(journalText, id);
  const minutes = windows.reduce((sum, w) => sum + (w.to - w.from), 0) / 60000;
  const time = windows.length ? Math.round(minutes) + " min from begin to finish" : "time not measured (no begin in the journal)";
  const n = x => x.toLocaleString("en-US");
  let tokens;
  try {
    const r = usage.report({ id, board: taskRoot, projects: path.join(os.homedir(), ".claude", "projects"), session: owners.length ? owners : null });
    const all = r.total;
    tokens = all.messages
      ? "Claude tokens " + n(all.freshInput + all.cacheRead + all.output) + " (fresh input " + n(all.freshInput) + ", cache read " + n(all.cacheRead)
        + ", output " + n(all.output) + "; " + r.sessions.length + " session" + (r.sessions.length === 1 ? "" : "s") + ")"
      : "Claude tokens: none found (Codex sessions are not read)";
  } catch (e) {
    if (!["EPERM", "EACCES", "ENOENT"].includes(e.code)) throw e;
    tokens = "Claude tokens not measured: " + e.code + " reading the transcripts";
  }
  return "- cost: " + time + "; " + tokens;
}

// --checked must name a check that ran ("<command> -> <result>", any ;-separated part) or say
// "no test exists". Study 2 lean records accepted "tests not run" as the only check.
const NOT_A_COMMAND = /^(none|n\/?a|nothing|-+)$/i;
const NOT_RUN = /\b(not run|(did|was|were|could) not (run|start)|(didn|wasn|weren|couldn)['’]t (run|start)|skipped|not executed)\b/i;
function namesACheck(checked) {
  if (/^\s*no tests? exists?\b/i.test(checked)) return true;
  return checked.split(";").some(part => {
    const m = part.match(/^(.*?)(?:->|→)(.*)$/);
    if (!m) return false;
    const command = m[1].replace(/`/g, "").trim(), result = m[2].trim();
    return Boolean(command && result) && !NOT_A_COMMAND.test(command) && !NOT_RUN.test(command) && !NOT_RUN.test(result);
  });
}
const journaled = (taskRoot, line) => {
  try { return fs.readFileSync(path.join(taskRoot, ".journal.log"), "utf8").split(/\r?\n/).some(l => l.endsWith(" " + line)); }
  catch (e) { if (e.code === "ENOENT") return false; throw e; }
};

function filesAdd(a, { taskRoot }) {
  const [action, ...words] = a._;
  if (action !== "add") die('usage:  task.js files add <path>[,<path>...]');
  const paths = words.flatMap(w => w.split(",")).map(s => s.trim()).filter(Boolean);
  if (!paths.length) die('files add needs a path:  task.js files add tests/test_a.py');
  const session = sessionId();
  const t = openIn(taskRoot, session);
  if (!t) die("no open task in this session. Start one with:  task.js begin \"<title>\" --files " + paths.join(",") + " --goal \"<one line>\" --plan \"<steps>\"" + elsewhereNote(taskRoot, session));
  const text = readText(t.path);
  const block = text.match(FILES_BLOCK);
  if (!block) die("task " + t.id + " has no files: list to add to (" + t.file + ").");
  const listed = filesOf(text);
  const added = [...new Set(paths)].filter(p => !listed.includes(p));
  fs.writeFileSync(t.path, text.replace(block[0], block[0] + added.map(p => "  - " + p + "\n").join("")));
  journal(taskRoot, "files add " + t.id + " " + (added.join(",") || "(none new)"));
  say("Task " + t.id + " files: " + [...listed, ...added].join(", "));
  warnShared(taskRoot, session, added);
}

// One task, one session at a time: a task may pass to a later session (the first one ended, or its
// context filled up), but adopting it takes it from the old session, which can no longer write under it.
function adopt(a, { taskRoot }) {
  const id = a._[0];
  if (!id) die("usage:  task.js adopt <id>   (moves an open task to this session once the session that held it has ended)");
  const session = sessionId();
  if (!session) die("this shell has no session id (CLAUDE_CODE_SESSION_ID, CODEX_SESSION_ID or CODEX_THREAD_ID), so task " + id + " has no session to move to. Nothing was changed.");
  const t = tasks(taskRoot).find(x => x.folder === "open" && parseInt(x.id, 10) === parseInt(id, 10) && /^status:\s*in_progress/m.test(readText(x.path)));
  if (!t) die("no open task " + id + " on this board. Nothing was changed.");
  const text = readText(t.path), was = ownerOf(text);
  if (was === session) return say("Task " + t.id + " already belongs to this session.");
  const held = openIn(taskRoot, session);
  if (held && held.path !== t.path) die("Task " + held.id + " is open in this session. Finish it first; a session works on one task at a time. Nothing was changed.");
  const stamped = was || /^session:/m.test(text) ? text.replace(/^session:.*$/m, "session: " + session) : text.replace(/^status:.*$/m, "$&\nsession: " + session);
  fs.writeFileSync(t.path, stamped);
  journal(taskRoot, "adopt " + t.id + " session " + session + " (was " + (was || "none") + ")");
  say("Task " + t.id + " now belongs to this session" + (was ? " (was " + was + ")" : "") + ". Its files: " + filesOf(stamped).join(", "));
}

// The open tasks held by other sessions, named so the caller does not finish or change them.
function elsewhereNote(taskRoot, session) {
  const ids = othersIn(taskRoot, session).map(t => t.id);
  return ids.length ? "\nOpen in other sessions: " + ids.join(", ") + ". Leave those to their sessions; if the user says one has ended, run task.js adopt <id>." : "";
}

/** Entry from task.js: cmd is "begin", "finish", "files" or "adopt", argv the words after it, board from locate(). */
function run(cmd, argv, board) {
  const a = parse(cmd, argv);
  if (cmd === "files") return filesAdd(a, board);
  if (cmd === "adopt") return adopt(a, board);
  return cmd === "begin" ? begin(a, board) : finish(a, board);
}
module.exports = { run };
