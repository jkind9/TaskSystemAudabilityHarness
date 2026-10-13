---
id: "21"
title: Add task.js files add to put a file under the open task
status: closed
priority: MED
type: feature
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
  - task-system/lean.js
  - task-system/task.js
  - scripts/hooks/task-gate.js
  - task-system/tests/test_lean_flow.js
  - task-system/tests/test_lean_hooks.js
docs:
  - README.md
baseline_metric:
  source: ""
  field: ""
  baseline_value: ""
  target: ""
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 21 — Add task.js files add to put a file under the open task

## Current state

- Last test: node --test task-system/tests/*.js -> 191/191; node tools/validate.cjs -> exit 0 (23 checks)
- Next action: none; closed with commit 5ff7d94.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Gap (a) from the resized Study 2; owner decision 2026-10-13: fix before tagging v2, test first.

## In plain English

When a piece of work turns out to need one more file, the assistant has no single command to add that file to the work's record, so in the study it finished the record and started a new one just to widen its list. This adds one command that adds a file to the open record, and makes the refusal message name it.

## What

- `task-system/lean.js`: new command `files add <path>[,<path>...]` (paths may also be separate words). Adds each path not already listed to the in_progress task's `files:` block list; prints the new list. Refuses with no open task and with no path.
- `task-system/task.js`: dispatch `files` to lean.js and add it to the usage line, edited in place (the file is 942 lines and may not grow).
- `scripts/hooks/task-gate.js`: under `ECC_TASK_FLOW=lean`, the out-of-scope refusal and the no-`files:` refusal name `task.js files add <path>` instead of asking for a hand edit.

## Why

Resized Study 2: tablib-lean session 2 wrote 3 records in 4 minutes (11 task commands; `C:/tmp/study2-resized/results/tablib-lean/repo/task_list/.journal.log`) because widening scope meant finishing and beginning again.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Lean commands live in lean.js, dispatched from task.js | task-system/lean.js `run` | task.js `main` | task-system/task.js:919; task-system/lean.js:97 |
| Open task = in_progress file in open/ | lean-board.js `openIn` | lean.js, lean hooks | task-system/lean-board.js:27 |
| Task gate reads `files:` as a block or inline list from the frontmatter | task-gate.js `parseFilesList` | task gate | scripts/hooks/task-gate.js:125 |
| Lean refusal wording switch | task-gate.js `ECC_TASK_FLOW === 'lean'` | Codex/Claude sessions | scripts/hooks/task-gate.js:73 |
| task.js may not grow | file-size gate, 800 lines | — | task-system/task.js is 942 lines (wc -l) |

Plan: tests first (red), then lean.js `files`, the task.js dispatch, the gate wording; README lean section.

hyperparameters n/a: not an experiment.

invariants n/a: one file rewrite of the open task's frontmatter; no other state.

## Verification

- `task-system/tests/test_lean_flow.js` "files add puts new paths under the open task": after `begin --files a.py`, `files add b.py,c.py b.py` exits 0 and the record's files list is exactly a.py, b.py, c.py (no duplicate); `files add` with no open task exits non-zero naming `begin`; with no path exits non-zero.
- `task-system/tests/test_lean_hooks.js`: under `ECC_TASK_FLOW=lean`, a write outside the open task's files is refused with `task.js" files add <rel>`; the default message still says "add ... to that task's \"files:\"".
- Red-first: both fail before the change.

## Receipts

| field | value |
|---|---|
| closing commit | 5ff7d94 (owner approved committing once validate and tests pass, 2026-10-13) |
| files changed | task-system/lean.js, task-system/task.js (2 lines edited in place, still 942), scripts/hooks/task-gate.js, task-system/tests/test_lean_flow.js, task-system/tests/test_lean_hooks.js, README.md |
| test | task-system tests 191/191 (was 187; 4 new, red-first: all 4 failed before the change); validate.cjs pass, 23 checks |
| before / after | before: no command adds a file to the open task, the lean gate refusal asked for a hand edit; after: `task.js files add <path>` in one call, and the lean refusal names it with the path |
| result | done |

Notes / caveats / follow-ups:

- Under ECC_TASK_FLOW=lean the task gate no longer points at ~/.claude/rules/task-management.md, which describes the full system.
- Not yet probed with a live model; FINDINGS.md lists a probe of this fix under "Tests to consider".
