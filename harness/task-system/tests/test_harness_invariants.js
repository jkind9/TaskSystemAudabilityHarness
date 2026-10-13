#!/usr/bin/env node
"use strict";
/*
 * Scratch-repo probes for the task-harness invariants (task 275 hardening).
 * Builds a throwaway git repo, drives the REAL hooks + CLI against it, and asserts:
 *   1. completion gate blocks a blank receipt cell even with no "(fill in)" marker left
 *   2. completion gate does NOT flag "(path)" in prose outside the ## Receipts section
 *   3. tests floor: a test file dirty-since-before-the-session does not count (snapshot-aware)
 *   4. tests floor: a test updated this session passes
 *   5. tests floor: when verification_test: is a real path, an unrelated test does not count
 *   6. CLI: a duplicated id makes show/start/move refuse, naming every path
 *   7. CLI: renumber (by path) fixes the duplicate; lint returns to 0 errors
 *   8. lint: closed task with a blank receipt cell errors; a blank table HEADER row does not
 *   9. CLI: list strips inline "# comments" from priority values
 *  10. task-gate regression: off-scope 2nd code write blocks (exit 2), in-scope write passes
 *
 * Run:  node ~/.claude/task-system/tests/test_harness_invariants.js
 * Exit 0 = all probes pass. No deps; leaves nothing behind (scratch dir is removed).
 */
const { execFileSync, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = os.homedir();
const TASKJS = path.join(HOME, ".claude", "task-system", "task.js");
const COMPLETE_GATE = path.join(HOME, ".claude", "scripts", "hooks", "task-complete-gate.js");
const TASK_GATE = path.join(HOME, ".claude", "scripts", "hooks", "task-gate.js");
const PLAN_LINT = path.join(HOME, ".claude", "scripts", "task-plan-lint.js");

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log("PASS  " + name); }
  else { failed++; console.log("FAIL  " + name + (detail ? "  -- " + detail : "")); }
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", input: opts.input || "", cwd: opts.cwd, env: process.env });
}
function runGate(gate, cwd, sid) {
  return sh("node", [gate], { cwd, input: JSON.stringify({ session_id: sid }) });
}
function runTaskGate(cwd, filePath) {
  return sh("node", [TASK_GATE], { cwd, input: JSON.stringify({ tool_input: { file_path: filePath } }) });
}
function cli(cwd, args) { return sh("node", [TASKJS].concat(args), { cwd }); }
function sha1(p) { return crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); }
function writeSnapshot(sid, root, files) {
  const dir = path.join(os.tmpdir(), "claude-docs-gate");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, sid + ".json"), JSON.stringify({ root, session_id: sid, files }));
}

const PLAIN = "## In plain English\n\nThis is a scratch probe task used only by the harness self-test. " +
  "It exists so the completion gate has a realistic task file to judge during the probe run.\n\n";
function taskFile(o) {
  return "---\nid: \"" + o.id + "\"\ntitle: " + o.title + "\nstatus: " + o.status +
    "\npriority: " + (o.priority || "MED") + "\ntype: infra\n" +
    (o.vt ? "verification_test: " + o.vt + "\n" : "") +
    "created: 2026-07-20\nlast_updated: 2026-07-20\nfiles:\n" +
    (o.files || []).map(f => "  - " + f).join("\n") + "\n---\n\n# Task " + o.id + " - " + o.title + "\n\n" +
    PLAIN + (o.body || "");
}
const FILLED_RECEIPTS = "## Receipts\n\n| field | value |\n|---|---|\n| closing commit | abc123 |\n| result | done |\n";
const BLANK_CELL_RECEIPTS = "## Receipts\n\n| field | value |\n|---|---|\n| closing commit | abc123 |\n| result | |\n";

// ---------------------------------------------------------------- scratch repo
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "task-harness-probe-"));
try {
  execFileSync("git", ["init", "-q"], { cwd: SCRATCH });
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: SCRATCH, encoding: "utf8" }).trim();
  for (const d of ["task_list/open", "task_list/closed", "src", "tests"]) fs.mkdirSync(path.join(SCRATCH, d), { recursive: true });
  const openDir = path.join(SCRATCH, "task_list", "open");
  const closedDir = path.join(SCRATCH, "task_list", "closed");
  fs.writeFileSync(path.join(SCRATCH, "src", "a.py"), "x = 1\n");
  fs.writeFileSync(path.join(SCRATCH, "src", "b.py"), "y = 2\n");
  fs.writeFileSync(path.join(SCRATCH, "tests", "test_other.py"), "def test_other(): pass\n");
  const activePath = path.join(openDir, "01_probe_task.md");

  // -- 1. blank receipt cell blocks even without a marker
  fs.writeFileSync(activePath, taskFile({
    id: "01", title: "probe task", status: "in_progress", files: ["src/a.py"],
    body: "docs n/a: scratch probe\ntests n/a: scratch probe\n\n" + BLANK_CELL_RECEIPTS,
  }));
  let r = runGate(COMPLETE_GATE, SCRATCH, "probe-none");
  check("1 gate blocks blank receipt cell", r.status === 2 && /unfilled receipts/.test(r.stderr), "status=" + r.status);

  // -- 2. "(path)" in prose outside ## Receipts does not block
  fs.writeFileSync(activePath, taskFile({
    id: "01", title: "probe task", status: "in_progress", files: ["src/a.py"],
    body: "The helper probe_video(path) is prose, not a receipt.\n\ndocs n/a: scratch probe\ntests n/a: scratch probe\n\n" + FILLED_RECEIPTS,
  }));
  r = runGate(COMPLETE_GATE, SCRATCH, "probe-none");
  check("2 gate ignores (path) in prose", r.status === 0, "status=" + r.status + " stderr=" + r.stderr.slice(0, 200));

  // -- 3. a test dirty since BEFORE the session does not satisfy the floor
  fs.writeFileSync(activePath, taskFile({
    id: "01", title: "probe task", status: "in_progress", files: ["src/a.py"],
    body: "docs n/a: scratch probe\n\n" + FILLED_RECEIPTS,   // no tests escape
  }));
  writeSnapshot("probe-stale", root, { "tests/test_other.py": sha1(path.join(SCRATCH, "tests", "test_other.py")) });
  r = runGate(COMPLETE_GATE, SCRATCH, "probe-stale");
  check("3 tests floor rejects pre-session-dirty test", r.status === 2 && /no test file added\/updated this session/.test(r.stderr), "status=" + r.status);

  // -- 4. a test updated THIS session passes
  fs.appendFileSync(path.join(SCRATCH, "tests", "test_other.py"), "def test_more(): pass\n");
  r = runGate(COMPLETE_GATE, SCRATCH, "probe-stale");
  check("4 tests floor accepts session-updated test", r.status === 0, "status=" + r.status + " stderr=" + r.stderr.slice(0, 300));

  // -- 5. path-like verification_test: an unrelated test does not count
  fs.writeFileSync(activePath, taskFile({
    id: "01", title: "probe task", status: "in_progress", files: ["src/a.py"], vt: "tests/test_target.py",
    body: "docs n/a: scratch probe\n\n" + FILLED_RECEIPTS,
  }));
  r = runGate(COMPLETE_GATE, SCRATCH, "probe-stale");
  check("5 tests floor enforces verification_test scope", r.status === 2 && /none match verification_test/.test(r.stderr), "status=" + r.status);

  // -- 6. duplicated id: show/start/move refuse and name both paths
  fs.writeFileSync(activePath, taskFile({
    id: "01", title: "probe task", status: "in_progress", files: ["src/a.py"],
    body: "docs n/a: scratch probe\ntests n/a: scratch probe\n\n" + FILLED_RECEIPTS,
  }));
  const dupA = path.join(openDir, "12_first_twin.md");
  const dupB = path.join(openDir, "12_second_twin.md");
  fs.writeFileSync(dupA, taskFile({ id: "12", title: "first twin", status: "open", files: ["src/a.py"], body: FILLED_RECEIPTS }));
  fs.writeFileSync(dupB, taskFile({ id: "12", title: "second twin", status: "open", files: ["src/b.py"], body: FILLED_RECEIPTS }));
  for (const args of [["show", "12"], ["start", "12"], ["move", "12", "closed"]]) {
    r = cli(SCRATCH, args);
    check("6 " + args[0] + " refuses duplicated id", r.status === 1 && /ambiguous/.test(r.stderr) && /first_twin/.test(r.stderr) && /second_twin/.test(r.stderr), "status=" + r.status);
  }

  // -- 7. renumber by path resolves it; lint back to 0 errors
  r = cli(SCRATCH, ["renumber", dupB, "13"]);
  check("7a renumber by path works", r.status === 0 && fs.existsSync(path.join(openDir, "13_second_twin.md")), "status=" + r.status + " " + r.stderr.slice(0, 200));
  r = cli(SCRATCH, ["show", "12"]);
  check("7b show works after dedup", r.status === 0 && /first twin/.test(r.stdout), "status=" + r.status);
  r = cli(SCRATCH, ["lint"]);
  check("7c lint 0 errors after dedup", r.status === 0 && /0 error/.test(r.stdout), "status=" + r.status + " " + r.stdout.slice(-200));
  check("7d journal recorded the renumber", /renumber 12->13/.test(fs.readFileSync(path.join(SCRATCH, "task_list", ".journal.log"), "utf8")));

  // -- 8. lint: blank receipt cell in closed errors; blank table HEADER row does not
  const closedBad = path.join(closedDir, "20_blank_cell.md");
  fs.writeFileSync(closedBad, taskFile({ id: "20", title: "blank cell", status: "closed", files: [], body: BLANK_CELL_RECEIPTS }));
  r = cli(SCRATCH, ["lint"]);
  check("8a lint flags blank closed receipt cell", r.status === 1 && /unfilled receipts/.test(r.stdout), "status=" + r.status);
  fs.writeFileSync(closedBad, taskFile({
    id: "20", title: "blank cell", status: "closed", files: [],
    body: "## Receipts\n\n| | |\n|---|---|\n| closing commit | abc123 |\n| result | done |\n",
  }));
  r = cli(SCRATCH, ["lint"]);
  check("8b lint accepts blank table header row", r.status === 0, "status=" + r.status + " " + r.stdout.slice(-200));

  // -- 9. list strips inline # comments from priority
  fs.writeFileSync(path.join(openDir, "21_commented_priority.md"), taskFile({
    id: "21", title: "commented priority", status: "open", priority: "HIGH   # downgraded later maybe", files: [], body: FILLED_RECEIPTS,
  }));
  r = cli(SCRATCH, ["list"]);
  check("9 list strips inline priority comments", /\[HIGH\]\s+commented priority/.test(r.stdout) && !/downgraded later/.test(r.stdout), r.stdout.slice(0, 300));

  // -- 10. task-gate regression: off-scope 2nd code write blocks, in-scope passes
  r = runTaskGate(SCRATCH, path.join(SCRATCH, "src", "c.py"));
  check("10a task-gate blocks off-scope write", r.status === 2 && /NOT in the scope/.test(r.stderr), "status=" + r.status);
  r = runTaskGate(SCRATCH, path.join(SCRATCH, "src", "a.py"));
  check("10b task-gate allows in-scope write", r.status === 0, "status=" + r.status + " " + r.stderr.slice(0, 200));

  // -- 11. plan-lint E4/E5/W2/W3/W4 (task 353): red on a hollow HIGH plan, green when filled
  const planBad = path.join(SCRATCH, "plan_probe.md");
  fs.writeFileSync(planBad, [
    "---", 'id: "90"', "title: plan probe", "status: in_progress", "priority: HIGH",
    'verification_test: ""', "plan_reviewed: null", "files:", "  - src/a.py", "docs:", "  - src/README.md",
    "baseline_metric:", '  source: "x"', '  field: "y"', '  baseline_value: "much better"', '  target: "even better"',
    "created: 2026-08-16", "---", "",
    "## How", "",
    "| Claim | Existing owner | Callers/consumers | Evidence |", "|---|---|---|---|",
    "| _one row per claim_ | _class/module that owns it_ | _who calls/reads it_ | _file.py:123_ |", "",
    "## Verification", "", "it should be faster and more reliable", "",
  ].join("\n"));
  r = sh("node", [PLAN_LINT, planBad]);
  check("11a plan-lint E4 fires on missing invariants (HIGH in_progress)", r.status === 1 && /E4/.test(r.stdout), "status=" + r.status + " " + r.stdout.slice(0, 300));
  check("11b plan-lint E5 fires; template placeholder row does not count", /E5/.test(r.stdout), r.stdout.slice(0, 300));
  check("11c plan-lint W3 flags non-numeric baseline_value", /W3/.test(r.stdout), r.stdout.slice(0, 400));
  check("11d plan-lint W4 treats plan_reviewed null as unstamped", /W4/.test(r.stdout), r.stdout.slice(0, 400));
  check("11e plan-lint W2 flags vague number-free criterion", /W2/.test(r.stdout), r.stdout.slice(0, 400));
  const planGood = path.join(SCRATCH, "plan_probe_good.md");
  fs.writeFileSync(planGood, [
    "---", 'id: "91"', "title: plan probe good", "status: in_progress", "priority: HIGH",
    'verification_test: ""', "plan_reviewed: 2026-08-16 PASS", "files:", "  - src/a.py", "docs:", "  - src/README.md",
    "baseline_metric:", '  source: "x"', '  field: "y"', '  baseline_value: "+3 pp"', '  target: "0.9 NMI"',
    "created: 2026-08-16", "---", "",
    "## How", "",
    "| Claim | Existing owner | Callers/consumers | Evidence |", "|---|---|---|---|",
    "| helper exists | src/a.py | src/b.py | src/a.py:12 |", "",
    "## Invariants and recovery", "",
    "| Concern | Producer / owner | Consumer | Representation | Survives restart? |", "|---|---|---|---|---|",
    "| probe datum | src/a.py:10 | src/b.py:20 | int | yes |", "",
    "## Verification", "", "AUROC >= 0.8 on the probe set", "",
  ].join("\n"));
  r = sh("node", [PLAN_LINT, planGood]);
  check("11f plan-lint clean on a filled HIGH plan", r.status === 0 && /ok/.test(r.stdout), "status=" + r.status + " " + r.stdout.slice(0, 400));

  // -- 12. task.js review: stamps + journals; refuses a bad verdict
  const revPath = path.join(openDir, "30_review_probe.md");
  fs.writeFileSync(revPath, taskFile({ id: "30", title: "review probe", status: "open", files: ["src/a.py"], body: FILLED_RECEIPTS }));
  r = cli(SCRATCH, ["review", "30", "maybe"]);
  check("12a review refuses a bad verdict", r.status === 1 && /PASS\|FAIL/.test(r.stderr), "status=" + r.status);
  r = cli(SCRATCH, ["review", "30", "pass"]);
  const revText = fs.readFileSync(revPath, "utf8");
  check("12b review stamps plan_reviewed (flat, parser-readable)", r.status === 0 && /^plan_reviewed: \d{4}-\d{2}-\d{2} PASS$/m.test(revText), revText.slice(0, 200));
  check("12c journal recorded the review", /review 30 PASS/.test(fs.readFileSync(path.join(SCRATCH, "task_list", ".journal.log"), "utf8")));

  // -- 13. task.js audit: read-only drift report finds planted defects, exits 0
  fs.writeFileSync(path.join(SCRATCH, "task_list", "README.md"), "# board\nsee open/30_review_probe.md and open/99_ghost.md\n");
  fs.writeFileSync(path.join(openDir, "31_audit_probe.md"), [
    "---", 'id: "31"', "title: audit probe", "status: open", "priority: HIGH", "type: infra",
    "verification_test: tests/test_ghost.py", "files:", "  - src/a.py", "docs:", "  - src/NOPE.md",
    "created: 2026-08-16", "last_updated: 2026-08-16", "---", "", "# Task 31 - audit probe", "",
    PLAIN, "tests n/a: probe waiver", "", FILLED_RECEIPTS,
  ].join("\n"));
  r = cli(SCRATCH, ["audit"]);
  check("13a audit exits 0 (report, not gate)", r.status === 0, "status=" + r.status + " " + r.stderr.slice(0, 200));
  check("13b audit finds the missing declared doc", /src\/NOPE\.md/.test(r.stdout), r.stdout.slice(0, 600));
  check("13c audit finds the stale README task link", /99_ghost\.md/.test(r.stdout), r.stdout.slice(0, 600));
  check("13d audit does not flag the existing README link", !/30_review_probe\.md which does not exist/.test(r.stdout));
  check("13e audit inventories waiver lines", /waiver/.test(r.stdout), r.stdout.slice(0, 600));
  check("13f audit flags HIGH open task without invariants", /31 has no filled Invariants/.test(r.stdout), r.stdout.slice(0, 800));
  r = cli(SCRATCH, ["audit", "--json"]);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch {}
  check("13g audit --json parses and counts findings", !!parsed && parsed.metrics.findings_total >= 5, r.stdout.slice(0, 200));

} finally {
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}
  try { fs.unlinkSync(path.join(os.tmpdir(), "claude-docs-gate", "probe-stale.json")); } catch {}
}

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
