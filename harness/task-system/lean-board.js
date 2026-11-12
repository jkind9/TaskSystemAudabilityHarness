"use strict";
// Lean task board reads shared by task.js begin/finish and the lean hooks: every task file, the
// open (in_progress) task and the last finished one. Hooks pass the session folder; only a folder
// inside a git repository has a board (the board never sits above the repository; locate.js).
// Each record names the session that began it (session:), so parallel sessions on one board see
// only their own open task. A record with no session, or a caller with no session id, matches
// every session, which is how the board behaved before owners were recorded.
const fs = require("fs");
const path = require("path");
const { locate } = require("./locate.js");

const readText = p => fs.readFileSync(p, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
const section = (text, name) => (text.match(new RegExp("^## " + name + "[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))", "m")) || [])[1]?.trim() || "";
const title = text => (text.match(/^title:\s*(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "") || "";
const FILES_BLOCK = /^files:[ \t]*\n((?:[ \t]+-[^\n]*\n)*)/m;
const filesOf = text => ((text.match(FILES_BLOCK) || [])[1] || "").split("\n").map(l => l.replace(/^[ \t]+-[ \t]*/, "").trim()).filter(Boolean);

/** The id this process's hooks receive as session_id, or "" outside an agent session. */
// Codex first: a Codex worker started from a Claude shell also inherits CLAUDE_CODE_SESSION_ID.
const sessionId = (env = process.env) => env.CODEX_SESSION_ID || env.CODEX_THREAD_ID || env.CLAUDE_CODE_SESSION_ID || "";
/** The session a record names in its frontmatter, or "" for a record from before owners. */
const ownerOf = text => {
  const front = (String(text).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
  return (front.match(/^session:[ \t]*["']?([^"'\s]*)/m) || [])[1] || "";
};
const owns = (session, owner) => !session || !owner || owner === session;

function repoTop(dir) {
  for (let p = path.resolve(dir); ; p = path.dirname(p)) {
    if (fs.existsSync(path.join(p, ".git"))) return p;
    if (path.dirname(p) === p) return null;
  }
}

/** Every task file on the board, from any folder, with its id. */
function tasks(taskRoot) {
  if (!fs.existsSync(taskRoot)) return [];
  return fs.readdirSync(taskRoot, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith("."))
    .flatMap(d => fs.readdirSync(path.join(taskRoot, d.name)).filter(f => /^[0-9A-Za-z].*\.md$/.test(f) && f !== "README.md")
      .map(f => ({ folder: d.name, file: f, path: path.join(taskRoot, d.name, f), id: f.split("_", 1)[0].replace(/\.md$/, "") })));
}
const openTasks = taskRoot => tasks(taskRoot).filter(t => t.folder === "open" && /^status:\s*in_progress/m.test(readText(t.path)));
const openIn = (taskRoot, session = "") => openTasks(taskRoot).find(t => owns(session, ownerOf(readText(t.path))));
const othersIn = (taskRoot, session = "") => openTasks(taskRoot).filter(t => !owns(session, ownerOf(readText(t.path))));
const lastDoneIn = taskRoot => tasks(taskRoot).filter(t => t.folder === "done").sort((x, y) => parseInt(y.id, 10) - parseInt(x.id, 10))[0];

/** The board of the repository holding cwd, or null outside a repository. */
function boardOf(cwd) { return repoTop(cwd) ? locate(cwd, "").taskRoot : null; }
const openTask = (cwd, session = "") => { const b = boardOf(cwd); return b ? openIn(b, session) : undefined; };
const openElsewhere = (cwd, session = "") => { const b = boardOf(cwd); return b ? othersIn(b, session) : []; };
const lastDone = cwd => { const b = boardOf(cwd); return b ? lastDoneIn(b) : undefined; };

/** A task's files: entry against a repository path: ** spans folders, * stays in one, case-insensitive. */
function globMatch(glob, file) {
  const [g, f] = [glob, file].map(s => String(s).replace(/\\/g, "/").trim());
  const re = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?|\*/g, m => (m === "*" ? "[^/]*" : ".*"));
  try { return g === f || new RegExp("^" + re + "$", "i").test(f); } catch { return false; }
}
/** A test for paths another session's open task lists and this session's task does not. */
const claimedElsewhere = (theirs, mine) => file => theirs.some(g => globMatch(g, file)) && !mine.some(g => globMatch(g, file));

module.exports = { readText, section, title, FILES_BLOCK, filesOf, sessionId, ownerOf, owns, tasks, openIn, othersIn, lastDoneIn,
  boardOf, openTask, openElsewhere, lastDone, globMatch, claimedElsewhere };
