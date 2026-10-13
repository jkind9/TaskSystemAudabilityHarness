---
id: "17"
title: Let the lean checks run where Node cannot start other programs
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_lean_nospawn.js
plan_reviewed: null
files:
  - checks/**
  - core/AGENTS.md
  - task-system/tests/test_lean_*.js
  - task-system/lean.js
docs:
  - README.md
baseline_metric:
  source: "Study 2 lean probe probe-lean-gates-s1 (C:/tmp/study2-resized/probes/results), 2026-10-13"
  field: "lean finish records with the comparison checks run, inside Codex's sandbox"
  baseline_value: "0 of 2 (both said: other checks not run: git cannot start (EPERM))"
  target: "all checks recorded inside the sandbox; Python complexity marked approximate"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 17 — Let the lean checks run where Node cannot start other programs

## Current state

- Last test: node tools/validate.cjs -> exit 0 (23 checks); node --test task-system/tests/*.js -> 184/184; sandboxed finish (codex sandbox, workspace-write) -> exit 0 with all checks
- Next action: none; closed with commit e63a511; re-probe lean in Study 2 at the new commit.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner approved committing harness fixes once validate and tests pass.

## In plain English

At the end of each task the lean setup compares the work with the last saved version of the code to count copied blocks and overly branchy functions. Inside one assistant's safety sandbox the tool doing this could not start any helper program, so the comparison was skipped. Now the tool reads the saved version directly from the project's history folder and compares the files itself, so the numbers are recorded inside the sandbox too.

## What

- `checks/gitread.cjs` (new): reads HEAD's tree and blobs from `.git` (loose objects; version-2 pack indexes, offset and reference deltas; packed refs; detached HEAD; worktree `.git` files) and lists working files by `.gitignore` and `.git/info/exclude`.
- `checks/linediff.cjs` (new): line diff (common start/end trimmed, longest-common-subsequence table up to 4 million cells, else "all replaced"); added runs, their line numbers, removed count; line endings ignored.
- `checks/run.cjs`: `changes()` uses both, with the git program only as a fallback reader; the unified-diff parser is gone.
- `checks/complexity.cjs`: when Python cannot start, Python functions get an approximate keyword count with the same decision points as `complexity.py`; results carry `method`, and the record notes "approximate".
- `core/AGENTS.md`: one sentence saying the two commands are all that is needed (the probe read the full task system's HOWTO and `lean.js` first).

## Why

The first lean probe (Study 2, 2026-10-13) finished two tasks; both records said "other checks not run: git cannot start (EPERM)". Running `codex sandbox -- node probe.cjs` with no model showed that inside the sandbox Node cannot start git, Python, cmd or Node itself (all EPERM), while the model's own PowerShell commands can.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Changed-file list and diff came from the git program | checks/run.cjs `changes` | runChecks, lean finish | checks/run.cjs:45-63 (commit 41e931c) |
| Python complexity needed a Python process | checks/complexity.cjs `pythonFunctions` | runChecks, Study 2 measures | checks/complexity.cjs:52 (commit 41e931c) |
| Line endings normalised when reading the working tree | checks/run.cjs `readText` | changes | checks/run.cjs:41 (commit 41e931c) |

hyperparameters n/a: not an experiment.

invariants n/a: read-only; no new state.

## Verification

`task-system/tests/test_lean_nospawn.js` (6 tests): HEAD read from `.git` equals `git show` for every file after `git gc --aggressive` (pack with deltas) plus a loose commit; packed refs and a detached HEAD; the working-file list equals `git ls-files` plus `git ls-files --others --exclude-standard` with a negation, an anchored and a nested pattern, and a force-added ignored file; line diff cases; approximate Python complexity equals the AST count on plain code; `finish` with git and Python off PATH writes the same Files and Checked lines as with them. Live: `codex sandbox -c sandbox_mode="workspace-write" -- node task.js finish ...` in a scratch repository exited 0 and recorded both files and all checks.

## Receipts

| field | value |
|---|---|
| closing commit | e63a511 (owner approved the commit 2026-10-13) |
| files changed | checks/gitread.cjs (new), checks/linediff.cjs (new), checks/run.cjs, checks/complexity.cjs, core/AGENTS.md (+1 sentence), task-system/tests/test_lean_nospawn.js (new), task-system/tests/test_lean_checks.js (diff-parser test removed with the parser), README.md |
| test | validate.cjs pass, 23 checks; task-system tests 184/184 (was 179); sandboxed finish exit 0 |
| before / after | lean finish inside Codex's sandbox: before "other checks not run: git cannot start (EPERM)"; after files, duplicate blocks, complexity share (approximate), dead code status and prose patterns recorded |
| result | the lean checks run in the sandbox the study uses |

Notes / caveats / follow-ups:

- Not supported by the reader (the git program fallback covers them where it can start): SHA-256 repositories and the reftable ref format.
- Approximate Python complexity counts a lambda's branches toward the enclosing function; the AST count does not.
- Dead code stays "not checked" in the sandbox: vulture needs Python.
