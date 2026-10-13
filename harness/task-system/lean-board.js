"use strict";
// Lean task board reads shared by task.js begin/finish and the lean hooks: every task file, the
// open (in_progress) task and the last finished one. Hooks pass the session folder; only a folder
// inside a git repository has a board (the board never sits above the repository; locate.js).
const fs = require("fs");
const path = require("path");
const { locate } = require("./locate.js");

const readText = p => fs.readFileSync(p, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
const section = (text, name) => (text.match(new RegExp("^## " + name + "[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))", "m")) || [])[1]?.trim() || "";
const title = text => (text.match(/^title:\s*(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "") || "";

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
const openIn = taskRoot => tasks(taskRoot).find(t => t.folder === "open" && /^status:\s*in_progress/m.test(readText(t.path)));
const lastDoneIn = taskRoot => tasks(taskRoot).filter(t => t.folder === "done").sort((x, y) => parseInt(y.id, 10) - parseInt(x.id, 10))[0];

/** The board of the repository holding cwd, or null outside a repository. */
function boardOf(cwd) { return repoTop(cwd) ? locate(cwd, "").taskRoot : null; }
const openTask = cwd => { const b = boardOf(cwd); return b ? openIn(b) : undefined; };
const lastDone = cwd => { const b = boardOf(cwd); return b ? lastDoneIn(b) : undefined; };

module.exports = { readText, section, title, tasks, openIn, lastDoneIn, boardOf, openTask, lastDone };
