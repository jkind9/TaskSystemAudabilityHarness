"use strict";
/*
 * File-size rules shared by task.js (start / lint / verify / audit) and the PreToolUse
 * hook scripts/hooks/file-size-gate.js. One source of truth for the limit, what counts as
 * a code file, and how a task declares that it is a named splitter of an oversized file.
 *
 * The rule (rules/coding-style.md "800 max", now enforced):
 *   - a code file may not GROW past LIMIT lines — the PreToolUse gate refuses that write;
 *   - a task that is deliberately splitting such a file lists it under `shrinks:`, which
 *     lets the gate through and makes `task.js verify` demand the file is smaller at close
 *     than at the launch HEAD. Touch an oversized file to split it, leave it smaller.
 *
 * Enforcement is at the moment of harm (the write), not at `start`: refusing to start a task
 * because it reserves a long file it is not responsible for would block ordinary work.
 * `start` says which reserved files may not grow; `audit` reports every oversized file
 * repo-wide (S findings) and whether an open task has promised to shrink it.
 *
 * ECC_FILE_SIZE_LIMIT overrides the limit for one shell; there is deliberately no per-task
 * waiver — the escape is `shrinks:`, which is a promise `verify` measures, not a pass.
 */
const fs = require("fs");
const path = require("path");

const LIMIT = Number(process.env.ECC_FILE_SIZE_LIMIT) > 0 ? Number(process.env.ECC_FILE_SIZE_LIMIT) : 800;
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cpp|c|h|hpp|cs|rb|php|swift|dart|svelte)$/i;
// folders never scanned for oversized files (generated, vendored, virtual)
const SKIP_DIRS = new Set([".git", ".venv", "venv", "node_modules", "dist", "build", "__pycache__", ".worktrees", "graphify-out", ".pytest_cache", ".mypy_cache", ".ruff_cache"]);

function isCode(p) { return CODE.test(String(p)); }
function isGlob(p) { return /[*?]/.test(String(p)); }
function countLines(text) {
  if (!text) return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}
function linesOnDisk(p) { try { return countLines(fs.readFileSync(p, "utf8")); } catch { return 0; } }

// Minimal glob: ** (any depth), * (within a segment), exact paths. Case-insensitive. Same
// semantics as task-gate.js so `files:` means one thing everywhere.
function globMatch(glob, p) {
  glob = String(glob).replace(/\\/g, "/").trim();
  p = String(p).replace(/\\/g, "/").trim();
  if (glob === p) return true;
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (".+^${}()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  try { return new RegExp("^" + re + "$", "i").test(p); } catch { return false; }
}

// A list-valued frontmatter key (files:/shrinks:), block or inline form, inline comments stripped.
function listKey(text, key) {
  const head = String(text).slice(0, 4000).split("\n");
  const reBlock = new RegExp("^\\s*" + key + ":\\s*$");
  const reInline = new RegExp("^\\s*" + key + ":\\s*\\[(.*)\\]\\s*$");
  const i = head.findIndex((l) => reBlock.test(l) || reInline.test(l));
  if (i === -1) return [];
  const strip = (s) => String(s).replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim();
  const inline = head[i].match(reInline);
  if (inline) return inline[1].split(",").map(strip).filter(Boolean);
  const out = [];
  for (let j = i + 1; j < head.length; j++) {
    if (/^\s*---\s*$/.test(head[j])) break;
    const m = head[j].match(/^\s*-\s*(.+?)\s*$/);
    if (m) { const v = strip(m[1]); if (v) out.push(v); continue; }
    if (/^\s*$/.test(head[j])) continue;
    if (/^\S/.test(head[j]) || /^\s*\w[\w-]*:/.test(head[j])) break;
  }
  return out;
}

// Does this task's `shrinks:` cover the repo-relative path?
function shrinks(taskText, rel) { return listKey(taskText, "shrinks").some((g) => globMatch(g, rel)); }

// Concrete (non-glob) code paths in `files:` that are over LIMIT on disk and not in `shrinks:`.
function oversizedReservations(taskText, root) {
  const out = [];
  for (const f of listKey(taskText, "files")) {
    if (isGlob(f) || !isCode(f)) continue;
    const n = linesOnDisk(path.join(root, f));
    if (n > LIMIT && !shrinks(taskText, f)) out.push({ path: f, lines: n });
  }
  return out;
}

// `shrinks:` entries no `files:` glob reserves — the task could never edit them.
function unreservedShrinks(taskText) {
  const files = listKey(taskText, "files");
  return listKey(taskText, "shrinks").filter((s) => !files.some((g) => globMatch(g, s)));
}

// Every code file under root over LIMIT, as {path (repo-relative, forward slashes), lines}.
function oversizedFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.endsWith(".egg-info") || (e.name.startsWith(".") && e.name !== ".")) continue;
        walk(path.join(dir, e.name));
      } else if (e.isFile() && isCode(e.name)) {
        const full = path.join(dir, e.name);
        const n = linesOnDisk(full);
        if (n > LIMIT) out.push({ path: path.relative(root, full).replace(/\\/g, "/"), lines: n });
      }
    }
  };
  walk(root);
  out.sort((a, b) => b.lines - a.lines);
  return out;
}

module.exports = { LIMIT, CODE, SKIP_DIRS, isCode, isGlob, countLines, linesOnDisk, globMatch, listKey, shrinks, oversizedReservations, unreservedShrinks, oversizedFiles };
