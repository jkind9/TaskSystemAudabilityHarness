#!/usr/bin/env node
"use strict";
/*
 * Task CLI — drives the SAME frontmatter model the JS hooks enforce, so the CLI and the
 * gates share one source of truth (no separate `.active_task` pointer to drift).
 *
 * State lives in the task file's frontmatter + the folder it sits in:
 *   open/  pending_review/  closed/  archive/      (the folder is the board; git is the history)
 * The ACTIVE task is the single file in <root>/open/ with `status: in_progress` — exactly what
 * task-gate.js (binds a code write to that task's `files:`) and task-complete-gate.js (receipts +
 * `docs:` at Stop) read. `start`/`new` keep the "exactly one in_progress" invariant by demoting
 * any other in_progress task back to `open`.
 *
 * Usage (run from inside a project):
 *   node ~/.claude/task-system/task.js list
 *   node ~/.claude/task-system/task.js new "fix the X bug" --files src/x.py,tests/test_x.py --docs src/README.md
 *   node ~/.claude/task-system/task.js start 12
 *   node ~/.claude/task-system/task.js move 12 pending_review
 *   node ~/.claude/task-system/task.js move 12 closed          # refused until receipts are filled
 *   node ~/.claude/task-system/task.js start 12 --worktree     # isolate in its own git worktree+branch
 *
 * Node stdlib only. Never mutates state on a read command. Exits non-zero with a message on error.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SCRIPT_DIR = __dirname;
const SIZE = require(path.join(SCRIPT_DIR, "file-size.js"));  // the 800-line rule: start/lint/verify/audit + the size gate share it
const TEMPLATE = path.join(SCRIPT_DIR, "template.md");
const README_TEMPLATE = path.join(SCRIPT_DIR, "readme_template.md");
const CONSTITUTION_TEMPLATE = path.join(SCRIPT_DIR, "constitution_template.md");

const STATES = ["open", "pending_review", "closed", "stale", "archive"];
const STATUS_FOR = { open: "open", pending_review: "pending_review", closed: "closed", stale: "stale", archive: "archived" };
// statuses a file may carry per folder (lint); open/ also holds in_progress + blocked.
const ALLOWED_STATUS = {
  open: ["open", "in_progress", "blocked"],
  pending_review: ["pending_review"],
  closed: ["closed"],
  stale: ["stale"],
  archive: ["archived", "superseded", "archive"],
};
// receipts placeholder markers — kept in sync with task-complete-gate.js so the CLI's close-refusal
// and the Stop gate key off the same "receipts not filled" signal. Only ever tested against the
// "## Receipts" SECTION (via receiptsUnfilled) — a "(path)" in prose elsewhere is not a receipt.
const RECEIPT_MARKERS = /\(fill in\)|\(to be filled|\(path\)|\(computed\)/i;
// "Receipts not filled" = the ## Receipts section still carries a placeholder marker, OR a table
// row whose value cell is blank (deleting the "(fill in)" text must not count as filling it in).
// Kept in sync with receiptsUnfilled() in task-complete-gate.js.
function receiptsUnfilled(text) {
  const sec = sectionBody(String(text), "Receipts");
  if (!sec) return false;
  if (RECEIPT_MARKERS.test(sec)) return true;
  const lines = sec.split("\n");
  const isSep = (l) => { const m = l.match(/^\s*\|(.+)\|\s*$/); return !!m && m[1].split("|").every((c) => /^\s*:?-+:?\s*$/.test(c)); };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\|(.+)\|\s*$/);
    if (!m || isSep(lines[i])) continue;
    if (i + 1 < lines.length && isSep(lines[i + 1])) continue; // header row (even a blank "| | |" one)
    const cells = m[1].split("|").map((s) => s.trim());
    if (cells.length < 2) continue;
    if (cells.slice(1).join("").trim() === "") return true; // blank value cell(s)
  }
  return false;
}
const DEFAULT_BASE = "main";

function die(msg) { process.stderr.write(String(msg).replace(/\n?$/, "\n")); process.exit(1); }
function say(msg) { process.stdout.write(String(msg).replace(/\n?$/, "\n")); }

// the project + its task folder; never a board above the repository's top folder (locate.js)
const { locate } = require(path.join(SCRIPT_DIR, "locate.js"));
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

let LOC = locate();
let ROOT = LOC.root;
let TASK_ROOT = LOC.taskRoot;

function relRoot(p) { try { return path.relative(ROOT, p).replace(/\\/g, "/"); } catch { return p; } }
function today() { return new Date().toISOString().slice(0, 10); }

// frontmatter
// strip a UTF-8 BOM and normalize CRLF: a BOM breaks the "---" frontmatter probe, and a
// trailing \r breaks every `(.*)$` frontmatter value match (JS `.` excludes \r).
function readText(p) { return fs.readFileSync(p, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n"); }
function frontmatter(text) {
  const fm = {};
  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      for (const line of text.slice(3, end).split("\n")) {
        const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
        if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  return fm;
}
// list-valued key (files:/docs:), block or inline form, stripping inline " # comments".
function listKey(text, key) {
  const head = text.slice(0, 4000).split("\n");
  const reBlock = new RegExp("^\\s*" + key + ":\\s*$");
  const reInline = new RegExp("^\\s*" + key + ":\\s*\\[(.*)\\]\\s*$");
  let i = head.findIndex((l) => reBlock.test(l) || reInline.test(l));
  if (i === -1) return [];
  const inline = head[i].match(reInline);
  const strip = (s) => String(s).replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim();
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

// task enumeration
function* taskFiles() {
  for (const state of STATES) {
    const folder = path.join(TASK_ROOT, state);
    if (!isDir(folder)) continue;
    const files = fs.readdirSync(folder).filter((f) => /\.md$/.test(f) && /^[0-9A-Za-z]/.test(f) && f !== "README.md");
    files.sort();
    for (const f of files) yield { state, file: f, path: path.join(folder, f) };
  }
}
function idOf(file) { return path.basename(file).split("_", 1)[0].replace(/\.md$/, ""); }
function normId(v) { return String(v).trim().replace(/^0+/, "") || "0"; }
function titleOf(p, fm) {
  if (fm.title) return fm.title;
  const stem = path.basename(p, ".md").split("_");
  return stem.length > 1 ? stem.slice(1).join(" ").replace(/_/g, " ") : path.basename(p, ".md");
}
// Resolve an id to its single task file. A duplicated id is REFUSED (never "first match wins" —
// show/start/move on the wrong file silently corrupts the board); renumber one copy first.
function findTask(id) {
  const want = normId(id);
  const hits = [];
  for (const t of taskFiles()) if (normId(idOf(t.file)) === want) hits.push(t);
  if (hits.length > 1) {
    die("task id " + id + " is ambiguous — " + hits.length + " files carry it:\n" +
      hits.map((t) => "  " + relRoot(t.path)).join("\n") +
      "\nrenumber one first:  task.js renumber <file-path> <new-id>");
  }
  return hits[0] || null;
}
// Append-only local audit trail for board mutations. task_list/ is gitignored by design (plain
// moves, no commit noise), so this journal is the only durable record of moves/renumbers.
function journal(line, taskRoot = TASK_ROOT) {
  // Local "YYYY-MM-DD HH:MM:SS" — the journal doubles as a timesheet, so date-only is not enough.
  const stamp = new Date().toLocaleString("sv-SE");
  try { fs.appendFileSync(path.join(taskRoot, ".journal.log"), stamp + " " + line + "\n"); } catch {}
}
function nextId() {
  const ids = [];
  for (const t of taskFiles()) { const n = parseInt(idOf(t.file), 10); if (!isNaN(n)) ids.push(n); }
  const n = ids.length ? Math.max(...ids) + 1 : 0;
  return String(n).padStart(2, "0");
}
function slugify(title) {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s.slice(0, 50) || "task";
}
function activeTask() {
  for (const t of taskFiles()) {
    if (t.state !== "open") continue;
    if (/^\s*status:\s*in_progress/m.test(readText(t.path).slice(0, 2000))) return t;
  }
  return null;
}
function setStatus(text, status) {
  let out = text.replace(/^status:.*$/m, "status: " + status);
  out = out.replace(/^last_updated:.*$/m, "last_updated: " + today());
  return out;
}
// make `target` the single in_progress task; demote any other in_progress in open/ back to open.
function makeActive(target) {
  for (const t of taskFiles()) {
    if (t.state !== "open" || t.path === target.path) continue;
    const text = readText(t.path);
    if (/^\s*status:\s*in_progress/m.test(text.slice(0, 2000))) {
      fs.writeFileSync(t.path, text.replace(/^status:.*$/m, "status: open"));
      say("  (demoted task " + idOf(t.file) + " → open; only one task is in_progress)");
    }
  }
  let text = setStatus(readText(target.path), "in_progress");
  journal("start " + idOf(target.file));  // opens the task's time window for usage.js
  if (!/^##\s+in plain english\b/im.test(text)) {
    text = insertPlainSection(text);
    say('  (added an empty "## In plain English" section — fill it before you build;');
    say("   the completion gate blocks a code-changing session while it is unfilled)");
  }
  fs.writeFileSync(target.path, text);
}

// Insert the required "## In plain English" scaffold into a legacy task file (after the H1
// title if there is one, else after the frontmatter). Backfills old tasks as they are started.
function insertPlainSection(text) {
  const SCAFFOLD =
    "\n## In plain English\n\n" +
    "_(Replace this paragraph before work starts. 2–5 sentences for a reader with NO project\n" +
    "context: what is the objective, and how will it be done? No acronyms, no file paths, no\n" +
    "invented names.)_\n";
  const lines = text.split("\n");
  let at = lines.findIndex((l) => /^#\s/.test(l));
  if (at === -1) {
    // no H1: insert after the closing --- of the frontmatter
    let dashes = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^---\s*$/.test(lines[i])) dashes++;
      if (dashes === 2) { at = i; break; }
    }
  }
  if (at === -1) return text + "\n" + SCAFFOLD;
  lines.splice(at + 1, 0, SCAFFOLD);
  return lines.join("\n");
}

// git + worktree (opt-in; dormant unless --worktree is used)
function git(args, opts = {}) {
  try {
    const out = execFileSync("git", args, { cwd: opts.cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, stdout: out, stderr: "" };
  } catch (e) {
    if (opts.check) die("git " + args.join(" ") + " failed:\n" + (e.stderr || e.stdout || e.message));
    return { code: e.status == null ? 1 : e.status, stdout: e.stdout ? String(e.stdout) : "", stderr: e.stderr ? String(e.stderr) : "" };
  }
}
function inGitRepo() { return git(["rev-parse", "--is-inside-work-tree"]).code === 0; }
function ghAvailable() { try { execFileSync("gh", ["--version"], { stdio: "pipe" }); return true; } catch { return false; } }
function primaryRoot() {
  const c = git(["rev-parse", "--git-common-dir"]);
  if (c.code !== 0) return ROOT;
  let gd = c.stdout.trim();
  if (!path.isAbsolute(gd)) gd = path.resolve(process.cwd(), gd);
  return path.dirname(gd);
}
function currentBranch(cwd) { const o = git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd }); return o.code === 0 ? o.stdout.trim() : ""; }
function refExists(ref) { return git(["rev-parse", "--verify", "--quiet", ref], { cwd: primaryRoot() }).code === 0; }
function worktreesDir() { const b = primaryRoot(); return path.join(path.dirname(b), path.basename(b) + ".worktrees"); }
function worktreePath(id) { return path.join(worktreesDir(), "task-" + id); }
function slugOf(file) { const p = path.basename(file, ".md").split("_"); return p.length > 1 ? p.slice(1).join("_") : path.basename(file, ".md"); }
function branchName(file, fm) { const typ = (fm.type || "task").trim() || "task"; return typ + "/" + idOf(file) + "-" + slugOf(file); }
function sectionBody(text, name) {
  const head = text.match(new RegExp("^##\\s+" + name + "\\s*$", "m"));
  if (!head) return "";
  const start = head.index + head[0].length;
  const nxt = text.slice(start).match(/^##\s+/m);
  return text.slice(start, nxt ? start + nxt.index : text.length).trim();
}
function handoffBrief(p, fm, branch, base) {
  const text = readText(p);
  const lines = ["task " + idOf(p) + ": " + titleOf(p, fm) + "  [" + (fm.type || "task") + "]", ""];
  const what = sectionBody(text, "What"); if (what) lines.push(what, "");
  lines.push("── To validate, check ──", sectionBody(text, "Verification") || "(no Verification section was written)", "");
  const receipts = sectionBody(text, "Receipts");
  if (receipts && !receiptsUnfilled(text)) lines.push("Receipts:", receipts, "");
  const stat = git(["diff", "--stat", base + "..." + branch], { cwd: primaryRoot() }).stdout.trim();
  lines.push("Files changed on this branch:", stat || "(none yet)", "");
  let foot = "Branch: " + branch; if (fm.owner) foot += "   ·   Review: " + fm.owner;
  lines.push(foot);
  return lines.join("\n");
}
function makeWorktree(state, taskPath, file, base) {
  if (!inGitRepo()) die("not in a git repo — the --worktree convention needs git.");
  const fm = frontmatter(readText(taskPath));
  const branch = branchName(file, fm);
  const wt = worktreePath(idOf(file));
  if (fs.existsSync(wt)) die("a worktree for task " + idOf(file) + " already exists:\n  " + wt + "\nwork there, or remove it:  git worktree remove " + wt);
  if (refExists("refs/heads/" + branch)) git(["worktree", "add", wt, branch], { cwd: primaryRoot(), check: true });
  else { if (!refExists(base)) die("base branch '" + base + "' not found — pass --base <branch>."); git(["worktree", "add", wt, "-b", branch, base], { cwd: primaryRoot(), check: true }); }
  // ensure the worktree carries the task file and marks it in_progress (the gate guards per-worktree).
  const wtTask = path.join(wt, LOC.conv, state, file);
  if (!fs.existsSync(wtTask)) { fs.mkdirSync(path.dirname(wtTask), { recursive: true }); fs.writeFileSync(wtTask, readText(taskPath)); }
  fs.writeFileSync(wtTask, setStatus(readText(wtTask), "in_progress"));
  journal("start " + idOf(file), path.join(wt, LOC.conv));  // usage windows belong to the worktree board
  return { branch, wt };
}
function inWorktreeFor(branch) { return inGitRepo() && primaryRoot() !== path.resolve(ROOT) && currentBranch(ROOT) === branch; }
function openOrUpdatePr(branch, base, brief, draft, dryRun) {
  const title = branch + "  ·  " + brief.split("\n")[0];
  const push = ["push", "-u", "origin", branch];
  const existing = ghAvailable() ? gh(["pr", "list", "--head", branch, "--json", "url", "--jq", ".[0].url"], ROOT).stdout.trim() : "";
  const create = ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body", brief].concat(draft ? ["--draft"] : []);
  if (dryRun) {
    say("[dry-run] would:");
    say("  git -C " + ROOT + " " + push.join(" "));
    say("  " + (existing ? "(PR already open: " + existing + ")" : "gh " + create.slice(0, 7).join(" ") + " --body <brief>"));
    say("\n--- handoff brief ---\n" + brief);
    return;
  }
  git(["-C", ROOT].concat(push));
  if (!ghAvailable()) { say("pushed. (no gh CLI — open the PR manually; brief below.)\n\n" + brief); return; }
  if (existing) {
    if (!draft) gh(["pr", "ready", branch], ROOT);
    gh(["pr", "edit", branch, "--body", brief], ROOT);
    say("PR refreshed: " + existing);
  } else {
    const res = gh(["pr", "create", "--base", base, "--head", branch, "--title", title, "--body", brief].concat(draft ? ["--draft"] : []), ROOT);
    say((res.stdout || res.stderr).trim());
  }
}
function gh(args, cwd) { try { const o = execFileSync("gh", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); return { stdout: o, stderr: "" }; } catch (e) { return { stdout: e.stdout ? String(e.stdout) : "", stderr: e.stderr ? String(e.stderr) : "" }; } }
function localMerge(branch, base, message, primary) {
  const worktrees = path.join(path.dirname(primary), path.basename(primary) + ".worktrees");
  let target = null, wtDir = "";
  for (const line of git(["worktree", "list", "--porcelain"], { cwd: primary }).stdout.split("\n")) {
    if (line.startsWith("worktree ")) wtDir = line.slice("worktree ".length).trim();
    else if (line.startsWith("branch ") && line.endsWith("/" + base)) target = wtDir;
  }
  let temp = null;
  if (target === null) {
    temp = path.join(worktrees, "_merge_base");
    if (fs.existsSync(temp)) git(["worktree", "remove", "--force", temp], { cwd: primary });
    git(["worktree", "add", temp, base], { cwd: primary, check: true });
    target = temp;
  } else if (git(["status", "--porcelain"], { cwd: target }).stdout.trim()) {
    return { ok: false, msg: "'" + base + "' is checked out at " + target + " with uncommitted changes — clean it or merge manually." };
  }
  const res = git(["merge", "--no-ff", branch, "-m", message], { cwd: target });
  const ok = res.code === 0;
  if (!ok) git(["merge", "--abort"], { cwd: target });
  if (temp) git(["worktree", "remove", "--force", temp], { cwd: primary });
  return { ok, msg: (res.stdout + res.stderr).trim() };
}
function teardownWorktree(branch, wt, primary) {
  git(["worktree", "remove", "--force", wt], { cwd: primary });
  git(["worktree", "prune"], { cwd: primary });
  git(["branch", "-D", branch], { cwd: primary });
}

// --------------------------------------------------------------------------- //
// commands
// --------------------------------------------------------------------------- //
function ensureTaskRoot() {
  const created = !isDir(TASK_ROOT);
  for (const s of STATES) fs.mkdirSync(path.join(TASK_ROOT, s), { recursive: true });
  const readme = path.join(TASK_ROOT, "README.md");
  if (!isFile(readme) && isFile(README_TEMPLATE)) fs.writeFileSync(readme, readText(README_TEMPLATE));
  // seed a project constitution alongside the README (never overwrites; sits at the task
  // root, outside the state folders, so taskFiles() never enumerates it).
  const constitution = path.join(TASK_ROOT, "CONSTITUTION.md");
  if (!isFile(constitution) && isFile(CONSTITUTION_TEMPLATE))
    fs.writeFileSync(constitution, readText(CONSTITUTION_TEMPLATE).replace(/{{CREATED}}/g, today()));
  return created;
}
function listBlock(items, indent) { return items.length ? items.map((x) => indent + "- " + x).join("\n") : indent + "# (none yet — declare the paths this task touches)"; }

function cmdInit() { const created = ensureTaskRoot(); say((created ? "Created" : "Already set up:") + " " + relRoot(TASK_ROOT) + "/"); say("Folders: " + STATES.join("/  ") + "/"); }

function cmdNew(a) {
  if (!isFile(TEMPLATE)) die("template not found: " + TEMPLATE);
  if (!a.noStart && !a.worktree) refuseToSteal(a, "new");
  ensureTaskRoot();
  const id = nextId();
  const file = id + "_" + slugify(a.title) + ".md";
  const dest = path.join(TASK_ROOT, "open", file);
  if (fs.existsSync(dest)) die("already exists: " + relRoot(dest));
    for (const t of taskFiles()) if (normId(idOf(t.file)) === normId(id))
    die("computed id " + id + " already exists (" + relRoot(t.path) + ") — board ids are corrupt; run: task.js lint");
  const files = (a.files || "").split(",").map((s) => s.trim()).filter(Boolean);
  const docs = (a.docs || "").split(",").map((s) => s.trim()).filter(Boolean);
  const text = readText(TEMPLATE)
    .replace(/{{ID}}/g, id).replace(/{{TITLE}}/g, a.title).replace(/{{TYPE}}/g, a.type || "infra")
    .replace(/{{PRIORITY}}/g, a.priority || "MED").replace(/{{FILENAME}}/g, file).replace(/{{CREATED}}/g, today())
    .replace(/{{FILES}}/g, listBlock(files, "  ")).replace(/{{DOCS}}/g, listBlock(docs, "  "));
  fs.writeFileSync(dest, text);
  journal("new " + id + " open/" + file);
  say("Created task " + id + ": " + a.title);
  say("  " + relRoot(dest));
  const unreviewed = require(path.join(SCRIPT_DIR, "guards.js")).needsReviewToStart(text);
  if (unreviewed && a.force && !a.noStart) journal("force-start " + id + " without a PASS plan review");
  if (a.worktree && (!unreviewed || a.force)) return startInWorktree("open", dest, file, a.base || DEFAULT_BASE);
  if (a.noStart || (!a.force && unreviewed)) { say("  (not started" + (a.noStart ? "" : ": a HIGH/CRITICAL task needs a PASS plan review first") + " — run: task.js start " + id + ")"); return; }
  makeActive({ state: "open", file, path: dest });
  say("  active task is now this one (status: in_progress). Fill in What / Why / How and the files:/docs: lists before you build.");
}

function startInWorktree(state, p, file, base) {
  const { branch, wt } = makeWorktree(state, p, file, base);
  const id = idOf(file);
  say("Task " + id + " → worktree on branch '" + branch + "' (off " + base + ")");
  say("  worktree:  " + wt);
  say("  work here: cd " + wt);
  say("  the worktree's task is in_progress; the gate guards it independently.");
  say("  finish:    node ~/.claude/task-system/task.js move " + id + " closed   # pushes + opens a PR");
}

// The in_progress slot is a lock shared by every session in this checkout. start/new used to
// demote whatever held it silently; that stole the lock from a peer mid-edit three times in one
// week. Now they refuse unless --take, and a take is journaled so the steal is on record.
function refuseToSteal(a, verb) {
  const held = activeTask();
  if (!held) return;
  const heldId = idOf(held.file);
  if (a.take) { journal("take " + verb + " (lock taken from " + heldId + ")"); say("  (taking the lock from task " + heldId + " — journaled)"); return; }
  die("task " + heldId + " is in_progress and holds the lock. Finish it (task.js move " + heldId + " pending_review|closed),\n" +
      "or pass --take to steal the lock on purpose (journaled). Peers in this directory share the lock.");
}

function cmdStart(a) {
  const t = findTask(a.id);
  if (!t) die("no task with id " + a.id);
  if (t.state !== "open") die("task " + a.id + " is in " + t.state + "/, not open/. Move it back first:  task.js move " + a.id + " open");
  if (!a.worktree && !(activeTask() && activeTask().path === t.path)) refuseToSteal(a, "start " + a.id);
  const reviewRefusal = require(path.join(SCRIPT_DIR, "guards.js")).startRefusal(readText(t.path), a.id);  // HIGH/CRITICAL need a PASS plan review
  if (reviewRefusal) { if (!a.force) die(reviewRefusal); journal("force-start " + a.id + " without a PASS plan review"); }
    const over = SIZE.oversizedReservations(readText(t.path), ROOT);
  if (over.length) {
    say("note: " + over.length + " reserved file(s) are over the " + SIZE.LIMIT + "-line limit and may not GROW:");
    for (const o of over.slice(0, 6)) say("  " + o.path + "  (" + o.lines + " lines)");
    if (over.length > 6) say("  ... +" + (over.length - 6) + " more");
    say("  Put new code in a new module under " + SIZE.LIMIT + " lines. If this task is splitting one of them,");
    say("  add that path under a shrinks: key in " + relRoot(t.path) + " — verify then requires it smaller at close.");
  }
  if (a.worktree) return startInWorktree(t.state, t.path, t.file, a.base || DEFAULT_BASE);
  makeActive(t);
  say("Now working on task " + idOf(t.file) + ": " + titleOf(t.path, frontmatter(readText(t.path))) + "  (status: in_progress)");
}

function cmdCurrent() { const t = activeTask(); if (!t) return say("none"); say(idOf(t.file) + " — " + titleOf(t.path, frontmatter(readText(t.path))) + "  [" + t.state + "/" + t.file + "]"); }

function cmdList(a) {
  if (!isDir(TASK_ROOT)) { say("No " + LOC.conv + "/ in " + relRoot(ROOT) + " yet. Create the first task with:"); say('  node ~/.claude/task-system/task.js new "short title"'); return; }
  const states = a.all ? STATES : [a.state || "open"];
  for (const state of states) {
    const rows = [...taskFiles()].filter((t) => t.state === state);
    say("\n" + state + " (" + rows.length + "):");
    for (const t of rows) { const fm = frontmatter(readText(t.path)); const active = /^\s*status:\s*in_progress/m.test(readText(t.path).slice(0, 2000)) ? " *" : ""; say("  " + idOf(t.file).padStart(3) + "  [" + (fmVal(fm, "priority") || "?").padStart(4) + "]  " + titleOf(t.path, fm).slice(0, 80) + active); }
  }
  const act = activeTask();
  say("\nactive task: " + (act ? idOf(act.file) + " — " + titleOf(act.path, frontmatter(readText(act.path))) : "none"));
}

function cmdShow(a) { const t = findTask(a.id); if (!t) die("no task with id " + a.id); say(relRoot(t.path) + "  (state: " + t.state + ")\n"); say(readText(t.path)); }

function cmdMove(a) {
  const t = findTask(a.id);
  if (!t) die("no task with id " + a.id);
  const dest = a.state;
  if (!STATES.includes(dest)) die("unknown state '" + dest + "'. one of: " + STATES.join(", "));
  if (dest === t.state) die("task " + a.id + " is already in " + t.state + "/");
  const fm = frontmatter(readText(t.path));
  const branch = branchName(t.file, fm);
  const base = a.base || DEFAULT_BASE;

  // a worktree task's transitions run from inside its worktree
  if (["pending_review", "closed"].includes(dest) && inGitRepo() && fs.existsSync(worktreePath(idOf(t.file))) && !inWorktreeFor(branch)) {
    const wt = worktreePath(idOf(t.file));
    die("task " + idOf(t.file) + " is being worked in its worktree on '" + branch + "'.\nrun its transitions from there:\n  cd " + wt + "\n  node ~/.claude/task-system/task.js move " + idOf(t.file) + " " + dest);
  }
  const worktreeHandoff = inGitRepo() && inWorktreeFor(branch) && ["pending_review", "closed"].includes(dest);

  if (worktreeHandoff && a.dryRun) {
    if (dest === 'closed') require('./checkpoint').closeCheckpoint({ root: ROOT, text: readText(t.path), taskPath: t.path, commit: a.commit, dryRun: true, id: idOf(t.file) });
    const brief = handoffBrief(t.path, fm, branch, base);
    if (dest === "closed" && a.localMerge) { say("[dry-run] would commit, clean-merge '" + branch + "' into " + base + ", then remove the worktree."); say("\n--- handoff brief ---\n" + brief); }
    else openOrUpdatePr(branch, base, brief, dest === "pending_review", true);
    say("\n(dry-run: no file moved, nothing committed)");
    return;
  }

  let text = readText(t.path);
  if (dest === "closed" && !a.force && (receiptsUnfilled(text) || !sectionBody(text, "Receipts"))) {
    die("Receipts are not filled in yet — don't close a task without writing up what happened.\nFill the Receipts table at the bottom of:\n  " + relRoot(t.path) + "\nthen close it again (or pass --force if you really mean to).");
  }
  if (dest === 'closed') text = require('./checkpoint').closeCheckpoint({ root: ROOT, text, taskPath: t.path, commit: a.commit, dryRun: a.dryRun, id: idOf(t.file) });
  if (a.dryRun) { say("[dry-run] would move task " + idOf(t.file) + ": " + t.state + "/ -> " + dest + "/ (no changes made)"); return; }
  text = setStatus(text, STATUS_FOR[dest]);
  text = text.split(LOC.conv + "/" + t.state + "/" + t.file).join(LOC.conv + "/" + dest + "/" + t.file);
  const destPath = path.join(TASK_ROOT, dest, t.file);
  fs.mkdirSync(path.join(TASK_ROOT, dest), { recursive: true });
  // prefer `git mv` so history follows the file; fall back to fs.
  if (inGitRepo() && git(["mv", t.path, destPath], { cwd: ROOT }).code === 0) fs.writeFileSync(destPath, text);
  else { fs.writeFileSync(destPath, text); try { fs.unlinkSync(t.path); } catch {} }
  journal("move " + idOf(t.file) + " " + t.state + "->" + dest + " " + dest + "/" + t.file);
  say("Moved task " + idOf(t.file) + ": " + t.state + "/ → " + dest + "/");

  if (worktreeHandoff) {
    const primary = primaryRoot();
    const wtDir = worktreePath(idOf(t.file));
    require("./checkpoint").commitHandoff(ROOT, text, [t.path, destPath], "chore(board): task " + idOf(t.file) + " to " + dest);
    const brief = handoffBrief(destPath, fm, branch, base);
    if (dest === "closed" && a.localMerge) {
      const subject = "merge: " + branch + ", task " + idOf(t.file) + " — " + titleOf(destPath, fm);
      const r = localMerge(branch, base, subject + "\n\n" + brief, primary);
      if (r.ok && require("./checkpoint").worktreeClean(ROOT)) { teardownWorktree(branch, wtDir, primary); say("  clean-merged into " + base + "; worktree + branch removed."); say("  cd " + primary + "   (you were inside the now-removed worktree)"); }
      else say(r.ok ? "  Merged; dirty worktree and branch retained. Save remaining changes before cleanup." : "  NOT merged — branch + worktree left intact:\n  " + r.msg.replace(/\n/g, "\n  "));
    } else {
      openOrUpdatePr(branch, base, brief, dest === "pending_review", false);
      if (dest === "closed") say("  after the PR merges: node ~/.claude/task-system/task.js cleanup " + idOf(t.file));
    }
  }
}

// strip an inline " # comment" from a frontmatter scalar (status:/priority: often carry one)
function fmVal(fm, key) { return String(fm[key] || "").split("#")[0].trim(); }
function loadBoard() {
  const all = [];
  for (const t of taskFiles()) {
    const text = readText(t.path);
    const fm = frontmatter(text);
    all.push({ ...t, text, fm, id: normId(fm.id || idOf(t.file)) });
  }
  return all;
}

// board invariants, shared by lint (full report) and ready (one-line health summary)
function collectLint(all) {
  const errors = [], warns = [];
  let legacy = 0;
  // 1. unique IDs (the ID is the canonical reference for blocked_by/supersedes)
  const byId = new Map();
  for (const t of all) {
    if (byId.has(t.id)) errors.push("duplicate id " + t.id + ":  " + relRoot(byId.get(t.id).path) + "  AND  " + relRoot(t.path));
    else byId.set(t.id, t);
  }
  // 2. status <-> folder agreement (files with no YAML frontmatter at all are pre-convention
  //    legacy — count them in one summary line instead of warning per file)
  for (const t of all) {
    const st = fmVal(t.fm, "status");
    if (st && !ALLOWED_STATUS[t.state].includes(st)) errors.push("task " + t.id + ": status '" + st + "' but sits in " + t.state + "/  (" + relRoot(t.path) + ")");
    else if (!st && Object.keys(t.fm).length === 0) legacy++;
    else if (!st) warns.push("task " + t.id + ": frontmatter has no status: (" + relRoot(t.path) + ")");
  }
  // 3. at most one in_progress
  const act = all.filter((t) => t.state === "open" && fmVal(t.fm, "status") === "in_progress");
  if (act.length > 1) errors.push("more than one in_progress task: " + act.map((t) => t.id).join(", "));
  // 4. blocked_by / superseded_by targets exist; open tasks blocked on finished work get a warning
  for (const t of all) {
    for (const b of listKey(t.text, "blocked_by")) {
      const target = byId.get(normId(b));
      if (!target) { if (t.state === "open") errors.push("task " + t.id + " blocked_by " + b + " — no such task"); }
      else if (t.state === "open" && ["closed", "stale", "archive"].includes(target.state))
        warns.push("task " + t.id + " blocked_by " + b + " which is " + target.state + " — unblocked; clear its blocked_by");
    }
    const sup = fmVal(t.fm, "superseded_by");
    if (sup && sup !== "null" && !byId.has(normId(sup))) warns.push("task " + t.id + " superseded_by " + sup + " — no such task");
  }
  // 5. closed => receipts filled (section-scoped: markers or blank table cells in ## Receipts only)
  for (const t of all) {
    if (t.state === "closed" && receiptsUnfilled(t.text)) errors.push("closed task " + t.id + " has unfilled receipts (marker or blank cell) (" + relRoot(t.path) + ")");
  }
  // 6. a shrinks: path no files: glob reserves — the task promised a shrink it could never
  //    edit. Oversized files themselves are reported once each, repo-wide, by `audit` (S
  //    findings); repeating them per task here would drown every other lint line.
  for (const t of all) {
    if (t.state !== "open") continue;
    for (const s of SIZE.unreservedShrinks(t.text))
      errors.push("task " + t.id + " shrinks: " + s + " but no files: glob reserves it (" + relRoot(t.path) + ")");
  }
  return { errors, warns, legacy };
}

function cmdLint() {
  if (!isDir(TASK_ROOT)) die("no task folder at " + relRoot(TASK_ROOT));
  const all = loadBoard();
  const { errors, warns, legacy } = collectLint(all);
  if (legacy) say("note:  " + legacy + " pre-convention file(s) with no YAML frontmatter (legacy, skipped)");
  for (const w of warns) say("warn:  " + w);
  for (const e of errors) say("ERROR: " + e);
  say("\nlint: " + all.length + " tasks, " + errors.length + " error(s), " + warns.length + " warning(s)");
  if (errors.length) process.exit(1);
}

// The README's "Next execution sequence" table is the plan of record: rows like
// "| 5 | **74** — ..." in order, struck-through (~~**74**~~) when done. Ids in that order.
function sequenceOrder() {
  const readme = path.join(TASK_ROOT, "README.md");
  if (!isFile(readme)) return [];
  const out = [];
  for (const line of readText(readme).split("\n")) {
    if (!/^\|\s*\S+\s*\|/.test(line)) continue;
    const cells = line.split("|");
    if (cells.length < 3) continue;
    const cell = cells[2];
    if (/~~/.test(cell)) continue;
    for (const m of cell.matchAll(/\*\*(\d+)\*\*/g)) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

function cmdReady(a) {
  a = a || {};
  if (!isDir(TASK_ROOT)) die("no task folder at " + relRoot(TASK_ROOT));
  const all = loadBoard();
  const byId = new Map(all.map((t) => [t.id, t]));
  const PRI = { CRITICAL: 0, HIGH: 1, MED: 2, LOW: 3 };
  const rank = (t) => { const p = fmVal(t.fm, "priority").toUpperCase(); return p in PRI ? PRI[p] : 9; };
  const ready = [], blocked = [];
  for (const t of all.filter((t) => t.state === "open")) {
    const unresolved = listKey(t.text, "blocked_by").map(normId)
      .filter((b) => { const x = byId.get(b); return x && ["open", "pending_review"].includes(x.state); });
    (unresolved.length ? blocked : ready).push({ t, unresolved });
  }
  ready.sort((a, b) => rank(a.t) - rank(b.t));
  if (a.next) {
    // first ready task in the README sequence order; else CRITICAL/HIGH before MED/LOW, bugs before the rest
    const seq = sequenceOrder();
    const readyIds = ready.map((r) => normId(r.t.id));
    let pick = seq.map(normId).find((id) => readyIds.includes(id));
    if (!pick) {
      const bug = (t) => (fmVal(t.fm, "type").toLowerCase() === "bug" ? 0 : 1);
      const sorted = ready.slice().sort((x, y) => rank(x.t) - rank(y.t) || bug(x.t) - bug(y.t));
      pick = sorted.length ? normId(sorted[0].t.id) : null;
    }
    if (!pick) die("nothing is ready");
    const t = ready.find((r) => normId(r.t.id) === pick).t;
    say(pick + "  " + titleOf(t.path, t.fm) + (seq.map(normId).includes(pick) ? "  (README sequence)" : "  (by priority; not in the README sequence)"));
    return;
  }
  say("ready to start (" + ready.length + " — no unresolved blockers):");
  for (const { t } of ready) {
    const mark = fmVal(t.fm, "status") === "in_progress" ? " *ACTIVE*" : "";
    say("  " + t.id.padStart(3) + "  [" + (fmVal(t.fm, "priority") || "?").padStart(4) + "]  " + titleOf(t.path, t.fm).slice(0, 80) + mark);
  }
  if (blocked.length) {
    say("\nstill blocked (" + blocked.length + "):");
    for (const { t, unresolved } of blocked) say("  " + t.id.padStart(3) + "  waits on: " + unresolved.join(", "));
  }
  const pr = all.filter((t) => t.state === "pending_review");
  if (pr.length) {
    const days = (t) => { const d = Date.parse(fmVal(t.fm, "last_updated") || fmVal(t.fm, "created")); return isNaN(d) ? null : Math.floor((Date.now() - d) / 86400000); };
    pr.sort((a, b) => (days(b) || 0) - (days(a) || 0));
    say("\npending_review — awaiting a human (" + pr.length + "):");
    for (const t of pr) { const d = days(t); say("  " + t.id.padStart(3) + "  " + (d === null ? "  ?d" : String(d).padStart(3) + "d") + "  " + titleOf(t.path, t.fm).slice(0, 76)); }
  }
  // one-line board health so drift is visible without a separate lint run
  const { errors, warns } = collectLint(all);
  if (errors.length || warns.length) say("\nboard health: " + errors.length + " error(s), " + warns.length + " warning(s) — run: task.js lint");
  else say("\nboard health: clean");
}

// verify <id> [--since <sha>] [--baseline <n> --suite "<cmd>"] — the post-close checks an
// orchestrator runs before trusting a worker's account: the file is in closed/ (or pending_review
// with a named follow-up), receipts filled, no in_progress task, board lint clean, git tree clean,
// every commit since <sha> conventionally typed, and the suite (if given) not below <n> passed.
// Exit 1 on the first class of failure; prints every check so the account can quote it.
function cmdVerify(a) {
  const t = findTask(a.id);
  if (!t) die("no task with id " + a.id);
  const text = readText(t.path);
  const fm = frontmatter(text);
  const fails = [];
  const check = (ok, label, detail) => { say((ok ? "  ok    " : "  FAIL  ") + label + (detail ? " — " + detail : "")); if (!ok) fails.push(label); };
  const inClosed = t.state === "closed";
  const inPending = t.state === "pending_review";
  const followUp = /still open because|to close:|must land|named follow-up/i.test(sectionBody(text, "Receipts") || "");
  check(inClosed || (inPending && followUp), "task is in closed/ (or pending_review with a named follow-up)", t.state + "/" + t.file);
  check(fmVal(fm, "status") === t.state || (t.state === "closed" && fmVal(fm, "status") === "closed"), "status matches its folder", "status: " + fmVal(fm, "status"));
  check(!receiptsUnfilled(text), "receipts filled (no placeholder, no blank cell)");
  const active = activeTask();
  check(!active, "no task is in_progress", active ? idOf(active.file) : "");
  const { errors } = collectLint(loadBoard());
  check(errors.length === 0, "board lint has no errors", errors.length ? errors.length + " error(s)" : "");
  if (inGitRepo()) {
    const st = git(["status", "--porcelain", "-uall"]).stdout.split("\n").filter(Boolean);
    const tracked = st.filter((l) => !l.startsWith("??"));
    const strayCode = st.filter((l) => l.startsWith("??") && /\.(py|js|ts|svelte|mjs|cjs)$/.test(l));
    check(tracked.length === 0, "git tree clean (no tracked changes)", tracked.slice(0, 5).join("; "));
    check(strayCode.length === 0, "no untracked code files", strayCode.slice(0, 5).join("; "));
    if (a.since) {
      const log = git(["log", "--format=%h %s", a.since + "..HEAD"]).stdout.split("\n").filter(Boolean);
      const bad = log.filter((l) => !/^\S+ (feat|fix|test|docs|chore|refactor|perf|ci|merge)(\(|:)/.test(l));
      check(log.length > 0, "commits exist since " + a.since, log.length + " commit(s)");
      check(bad.length === 0, "every commit since " + a.since + " is conventionally typed", bad.slice(0, 3).join("; "));
      const board = log.filter((l) => /^\S+ chore\(board\)/.test(l));
      check(board.length > 0, "a chore(board) commit closed the task");
      // the 800-line rule, measured: every shrinks: file is smaller than at --since, and no
      // code file the task changed is both over the limit and larger than at --since
      const linesAt = (p) => { const r = git(["show", a.since + ":" + p]); return r.code === 0 ? SIZE.countLines(r.stdout) : 0; };
      const shrinks = listKey(text, "shrinks");
      for (const p of shrinks) {
        const b = linesAt(p), n = SIZE.linesOnDisk(path.join(ROOT, p));
        check(n < b, "shrinks: " + p + " is smaller than at " + a.since, b + " → " + n + " lines");
      }
      const changed = git(["diff", "--name-only", a.since + "..HEAD"]).stdout.split("\n").map((s) => s.trim()).filter((s) => s && SIZE.isCode(s));
      const grew = changed
        .filter((p) => !shrinks.some((g) => SIZE.globMatch(g, p)))
        .map((p) => ({ p, b: linesAt(p), n: SIZE.linesOnDisk(path.join(ROOT, p)) }))
        .filter((x) => x.n > SIZE.LIMIT && x.n > x.b);
      check(grew.length === 0, "no changed code file over " + SIZE.LIMIT + " lines grew since " + a.since,
        grew.slice(0, 4).map((x) => x.p + " " + x.b + "→" + x.n).join("; "));
    }
  }
  if (a.suite) {
    let out = "";
    try { out = execFileSync(a.suite, { shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }); }
    catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
    const m = out.match(/(\d+) passed/);
    const passed = m ? Number(m[1]) : NaN;
    const failed = /(\d+) failed/.test(out);
    const base = a.baseline ? Number(a.baseline) : NaN;
    check(!failed && !isNaN(passed), "suite ran with no failures", isNaN(passed) ? "could not read a passed count" : passed + " passed");
    if (!isNaN(base)) check(passed >= base, "suite not below the baseline", passed + " vs " + base);
  }
  if (fails.length) die("\nverify " + a.id + ": " + fails.length + " check(s) failed");
  say("\nverify " + a.id + ": all checks passed");
}

// review <id> PASS|FAIL — stamp the plan-review verdict into frontmatter (flat scalar on
// purpose: the line-regex frontmatter() must be able to read it back) and journal it.
// Closes the "a plan review ran but nothing recorded it" hole; task-plan-lint W4 and
// `audit` read the stamp. "plan_reviewed: null" (the template default) = unstamped.
function cmdReview(a) {
  const t = findTask(a.id);
  if (!t) die("no task with id " + a.id);
  const verdict = String(a._[1] || "").toUpperCase();
  if (!["PASS", "FAIL"].includes(verdict)) die("review needs a verdict:  task.js review <id> PASS|FAIL");
  let text = readText(t.path);
  const stamp = "plan_reviewed: " + today() + " " + verdict;
  if (/^plan_reviewed:.*$/m.test(text)) text = text.replace(/^plan_reviewed:.*$/m, stamp);
  else if (/^verification_test:.*$/m.test(text)) text = text.replace(/^(verification_test:.*)$/m, "$1\n" + stamp);
  else if (/^created:.*$/m.test(text)) text = text.replace(/^(created:)/m, stamp + "\n$1");
  else die("task " + a.id + " has no frontmatter to stamp (legacy file?) — add `" + stamp + "` by hand.");
  text = text.replace(/^last_updated:.*$/m, "last_updated: " + today());
  fs.writeFileSync(t.path, text);
  journal("review " + idOf(t.file) + " " + verdict);
  say("Recorded plan review for task " + idOf(t.file) + ": " + verdict);
  if (verdict === "FAIL") say("  fix the plan, re-review, then re-stamp PASS before task.js start.");
}

// audit [--json] — read-only board-wide drift report (spec-kit's `analyze`, adapted).
// Never mutates, always exits 0: it is a report, not a gate (task-plan-lint owns failing).
// Categories: A artifact-reality  B README drift  C governance coverage  W waiver
// inventory  E constitution. Severity-sorted, deterministic per-category ids, capped at 50.
const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
function cmdAudit(a) {
  if (!isDir(TASK_ROOT)) die("no task folder at " + relRoot(TASK_ROOT));
  const all = loadBoard();
  const findings = [];
  const counters = {};
  const add = (cat, severity, summary, where) => {
    counters[cat] = (counters[cat] || 0) + 1;
    findings.push({ id: cat + counters[cat], category: cat, severity, summary, where });
  };
  const live = all.filter((t) => ["open", "pending_review"].includes(t.state));
  const waiverRe = /^[ \t>*_|#-]*((?:docs|tests|invariants)\s+n\/?a\s*:\s*.+|still open because\s+\S.*)$/gim;
  for (const t of live) {
    const isHigh = /^(HIGH|CRITICAL)/.test(fmVal(t.fm, "priority").toUpperCase());
    // A — declared artifacts that do not exist on disk (concrete paths only, no wildcards)
    for (const d of listKey(t.text, "docs")) {
      if (/[*?]/.test(d)) continue;
      if (!fs.existsSync(path.join(ROOT, d)) && !fs.existsSync(d))
        add("A", "HIGH", "task " + t.id + " declares docs: \"" + d + "\" which does not exist", relRoot(t.path));
    }
    const vt = fmVal(t.fm, "verification_test");
    if (vt && !/\s/.test(vt) && (vt.includes("/") || /\.\w+$/.test(vt)) && !fs.existsSync(path.join(ROOT, vt)) && !fs.existsSync(vt))
      add("A", "MEDIUM", "task " + t.id + " verification_test \"" + vt + "\" does not exist (planned, or stale?)", relRoot(t.path));
    // C — governance coverage on HIGH/CRITICAL open tasks (mirrors plan-lint E4/W4 board-wide)
    if (isHigh && t.state === "open") {
      const inv = sectionBody(t.text, "Invariants and recovery");
      const invEscape = /^[ \t>*_|#-]*invariants\s+n\/?a\s*:\s*\S/im.test(t.text);
      const invFilled = !!inv && !/_each datum\/state that crosses a boundary_/.test(inv) && /:\d+/.test(inv);
      if (!invEscape && !invFilled)
        add("C", "HIGH", "HIGH task " + t.id + " has no filled Invariants-and-recovery section and no invariants n/a: line", relRoot(t.path));
      const pr = fmVal(t.fm, "plan_reviewed");
      if (!pr || pr === "null")
        add("C", "MEDIUM", "HIGH task " + t.id + " has no plan_reviewed: stamp (task.js review <id> PASS|FAIL)", relRoot(t.path));
    }
    // W — waiver inventory: every escape-hatch line, surfaced (the audit trail they never had)
    for (const m of t.text.matchAll(waiverRe))
      add("W", "INFO", "task " + t.id + " waiver: " + m[1].trim().slice(0, 90), relRoot(t.path));
  }
  // B — board README references to task files that no longer exist (moved without the link)
  const readmePath = path.join(TASK_ROOT, "README.md");
  if (isFile(readmePath)) {
    const seen = new Set();
    for (const m of readText(readmePath).matchAll(/(open|pending_review|closed|stale|archive)\/([0-9A-Za-z][\w.\-]*\.md)/g)) {
      const refItem = m[1] + "/" + m[2];
      if (seen.has(refItem)) continue;
      seen.add(refItem);
      if (!fs.existsSync(path.join(TASK_ROOT, m[1], m[2])))
        add("B", "MEDIUM", "board README references " + refItem + " which does not exist (moved or deleted)", relRoot(readmePath));
    }
  }
  // S — the 800-line rule, repo-wide: every code file over the limit, and whether a live task
  //     has promised (shrinks:) to make it smaller. An oversized file nobody shrinks is the
  //     drift this report exists to surface; one with an owner is information.
  for (const f of SIZE.oversizedFiles(ROOT)) {
    const owners = live.filter((t) => SIZE.shrinks(t.text, f.path)).map((t) => t.id);
    if (owners.length) add("S", "INFO", f.path + " is " + f.lines + " lines (limit " + SIZE.LIMIT + "); task " + owners.join(", ") + " shrinks it", f.path);
    else add("S", "HIGH", f.path + " is " + f.lines + " lines (limit " + SIZE.LIMIT + ") and no open task shrinks it", f.path);
  }
  // E — constitution presence + versioning
  const constPath = path.join(TASK_ROOT, "CONSTITUTION.md");
  if (!isFile(constPath)) add("E", "INFO", "no CONSTITUTION.md in " + LOC.conv + "/ — task.js init seeds one from the template", relRoot(TASK_ROOT));
  else if (!/^\*\*Version:\*\*|^version:/im.test(readText(constPath)))
    add("E", "INFO", "CONSTITUTION.md has no Version line — amendments are untracked", relRoot(constPath));

  findings.sort((x, y) => (SEV_ORDER[x.severity] ?? 9) - (SEV_ORDER[y.severity] ?? 9));
  const bySev = {};
  for (const f of findings) bySev[f.severity] = (bySev[f.severity] || 0) + 1;
  const metrics = { tasks_scanned: live.length, findings_total: findings.length, by_severity: bySev };
  if (a.json) { say(JSON.stringify({ generated: today(), root: ROOT.replace(/\\/g, "/"), findings, metrics }, null, 2)); return; }
  const CAP = 50;
  say("board audit (read-only) — " + LOC.conv + "/ in " + relRoot(ROOT));
  for (const f of findings.slice(0, CAP)) say("  " + String(f.id).padEnd(4) + " [" + f.severity.padEnd(6) + "] " + f.summary);
  if (findings.length > CAP) say("  ... +" + (findings.length - CAP) + " more (use --json for the full list)");
  say("\naudit: " + live.length + " live task(s), " + findings.length + " finding(s)" +
    (findings.length ? "  " + Object.entries(bySev).map(([k, v]) => k + ":" + v).join("  ") : " — clean"));
}

// renumber <id-or-path> <new-id> — the dedup tool findTask points at when an id is ambiguous.
// Accepts a file path so a DUPLICATED id can still be renumbered (findTask refuses those).
function cmdRenumber(a) {
  const [ref, newRaw] = a._;
  const newId = String(newRaw || "").trim();
  if (!/^[0-9A-Za-z]+$/.test(newId)) die("renumber needs a new id:  task.js renumber <id-or-path> <new-id>");
  let t = null;
  const asPath = path.isAbsolute(ref) ? ref : path.resolve(process.cwd(), ref);
  if (isFile(asPath)) {
    const state = path.basename(path.dirname(asPath));
    if (!STATES.includes(state)) die(ref + " is not inside a task state folder (" + STATES.join("/") + ")");
    t = { state, file: path.basename(asPath), path: asPath };
  } else t = findTask(ref);
  if (!t) die("no task with id or path " + ref);
  for (const o of taskFiles()) if (o.path !== t.path && normId(idOf(o.file)) === normId(newId))
    die("id " + newId + " is already taken: " + relRoot(o.path));
  const oldId = idOf(t.file);
  const rest = t.file.slice(oldId.length); // "_slug.md"
  const destPath = path.join(TASK_ROOT, t.state, newId + rest);
  let text = readText(t.path);
  text = text.replace(new RegExp('^id:\\s*["\']?' + oldId + '["\']?\\s*$', "m"), 'id: "' + newId + '"');
  text = text.replace(new RegExp("^(#\\s+Task\\s+)" + oldId + "\\b", "m"), "$1" + newId);
  if (inGitRepo() && git(["mv", t.path, destPath], { cwd: ROOT }).code === 0) fs.writeFileSync(destPath, text);
  else { fs.writeFileSync(destPath, text); try { fs.unlinkSync(t.path); } catch {} }
  journal("renumber " + oldId + "->" + newId + " " + t.state + "/" + newId + rest);
  say("Renumbered task " + oldId + " -> " + newId + "  (" + relRoot(destPath) + ")");
}

function cmdCleanup(a) {
  const t = findTask(a.id);
  const fm = t ? frontmatter(readText(t.path)) : {};
  const branch = t ? branchName(t.file, fm) : "";
  if (!branch || !inGitRepo()) die("no worktree branch found for task " + a.id + ".");
  const wt = worktreePath(a.id);
  if (!fs.existsSync(wt) && !refExists("refs/heads/" + branch)) die("nothing to clean up for task " + a.id + " (no worktree, no branch '" + branch + "').");
  if (!a.force && ghAvailable()) {
    const merged = gh(["pr", "list", "--head", branch, "--state", "merged", "--json", "url", "--jq", ".[0].url"], primaryRoot()).stdout.trim();
    if (!merged) die("PR for '" + branch + "' is not merged yet (or gh can't see it).\nmerge it first, or pass --force to tear down anyway.");
  }
  teardownWorktree(branch, wt, primaryRoot());
  say("Removed worktree + branch '" + branch + "' for task " + a.id + ".");
}

// --------------------------------------------------------------------------- //
// arg parsing (no deps)
// --------------------------------------------------------------------------- //
const FLAG_WITH_VALUE = new Set(["--type", "--priority", "--base", "--files", "--docs", "--state", "--baseline", "--suite", "--since"]);
function parse(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--all") a.all = true;
    else if (tok === "--no-start") a.noStart = true;
    else if (tok === "--worktree") a.worktree = true;
    else if (tok === '--commit') a.commit = true;
    else if (tok === "--force") a.force = true;
    else if (tok === "--local-merge") a.localMerge = true;
    else if (tok === "--dry-run") a.dryRun = true;
    else if (tok === "--json") a.json = true;
    else if (tok === "--next") a.next = true;
    else if (tok === "--take") a.take = true;
    else if (FLAG_WITH_VALUE.has(tok)) { a[tok.slice(2)] = argv[++i]; }
    else if (tok.startsWith("--")) die("unknown flag " + tok + " — nothing was changed. Run: task.js help");
    else a._.push(tok);
  }
  return a;
}

const USAGE = `task.js — manage a project's task_list/ (frontmatter-driven; the JS gates read the same state)

  init                          create the task folder here  (lean: begin "<title>" --files a,b --goal "<line>" --plan "<steps>" | finish --checked "<command> -> <result>" --left "<text>" | files add <path>[,<path>])
  new "<title>" [opts]          create a task in open/ and start it (status: in_progress)
      --type T --priority P --files a,b --docs c,d --no-start --worktree --base B
  start <id> [--worktree --base B]   make an existing open task the active (in_progress) one
      (refuses while another task is in_progress; --take steals the lock and journals it; same for new)
  current                       show the active task
  list [state] [--all]          list tasks (default open; * marks the in_progress one)
  show <id>                     print a task in full
  move <id> <state> [opts]      move between open/pending_review/closed/stale/archive (git mv + status)
      --force (close w/o receipts)  --base B  --local-merge  --dry-run
  close <id> [--commit]                    alias for: move <id> closed
  ready [--next]                open tasks with no unresolved blockers + pending_review ages + board health
                                (--next: just the first ready id in the README sequence-table order)
  verify <id> [--since SHA] [--baseline N --suite "CMD"]
                                post-close checks: folder, receipts, no in_progress, lint, clean tree,
                                typed commits since SHA, every shrinks: file smaller than at SHA, no changed
                                code file over the line limit grew, suite >= N passed; exit 1 on any failure
  lint                          check board invariants (unique ids, status<->folder, blockers exist,
                                closed=>receipts filled incl. blank cells, one in_progress,
                                shrinks: paths no files: glob reserves); exit 1 on errors
  review <id> PASS|FAIL         stamp plan_reviewed: <date> <verdict> into frontmatter + journal it
                                (run after task-plan-lint + the plan-reviewer agent, before start)
  audit [--json]                read-only board drift report: missing docs:/verification_test paths,
                                HIGH tasks without invariants or a plan-review stamp, stale README
                                task links, waiver inventory, constitution presence, every code file
                                over the line limit (800; ECC_FILE_SIZE_LIMIT) and whether an open task
                                shrinks: it; always exit 0
  renumber <id-or-path> <new>   give a task a new unique id (the dedup tool; accepts a path for duplicated ids)
  cleanup <id> [--force]        remove a worktree + branch after its PR merged

  The 800-line rule: a code file may not grow past the limit (scripts/hooks/file-size-gate.js
  refuses the write); a task that reserves one already over it must list that path under a
  shrinks: key and leave it smaller (start refuses otherwise; verify measures it against --since).
  ECC_FILE_SIZE_LIMIT overrides the limit for one shell.

  moves/new/renumber are journaled to <task_root>/.journal.log (task_list/ is gitignored; the
  journal is the local history).`;

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "begin" || cmd === "finish" || cmd === "files") return require(path.join(SCRIPT_DIR, "lean.js")).run(cmd, rest, LOC);  // lean profile
  const a = parse(rest);
  if (a.commit && !(cmd === 'close' || (cmd === 'move' && a._[1] === 'closed'))) die('--commit is only valid for close or move closed.');
  switch (cmd) {
    case "init": return cmdInit();
    case "new": if (!a._[0]) die('new needs a title:  task.js new "short title"'); a.title = a._[0]; return cmdNew(a);
    case "start": if (!a._[0]) die("start needs a task id"); a.id = a._[0]; return cmdStart(a);
    case "current": return cmdCurrent();
    case "list": a.state = a.state || a._[0]; return cmdList(a);
    case "show": if (!a._[0]) die("show needs a task id"); a.id = a._[0]; return cmdShow(a);
    case "move": if (!a._[0] || !a._[1]) die("move needs an id and a state:  task.js move 12 pending_review"); a.id = a._[0]; a.state = a._[1]; return cmdMove(a);
    case "close": if (!a._[0]) die("close needs a task id"); a.id = a._[0]; a.state = "closed"; return cmdMove(a);
    case "ready": return cmdReady(a);
    case "verify": if (!a._[0]) die("verify needs a task id"); a.id = a._[0]; return cmdVerify(a);
    case "lint": return cmdLint();
    case "review": if (!a._[0] || !a._[1]) die("review needs an id and a verdict:  task.js review 353 PASS"); a.id = a._[0]; return cmdReview(a);
    case "audit": return cmdAudit(a);
    case "renumber": if (!a._[0] || !a._[1]) die("renumber needs an id (or file path) and a new id:  task.js renumber 263 274"); return cmdRenumber(a);
    case "cleanup": if (!a._[0]) die("cleanup needs a task id"); a.id = a._[0]; return cmdCleanup(a);
    case undefined: case "-h": case "--help": case "help": return say(USAGE);
    default: die("unknown command '" + cmd + "'.\n\n" + USAGE);
  }
}
try { main(); } catch (e) { die(e && e.stack ? e.stack : String(e)); }
