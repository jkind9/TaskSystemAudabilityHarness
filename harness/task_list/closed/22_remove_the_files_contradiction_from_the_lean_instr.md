---
id: "22"
title: Remove the files: contradiction from the lean instructions
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
  - core/AGENTS.md
  - task-system/tests/test_lean_flow.js
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

# Task 22 — Remove the files: contradiction from the lean instructions

## Current state

- Last test: node --test task-system/tests/*.js -> 192/192; node tools/validate.cjs -> exit 0 (23 checks)
- Next action: none; closed with commit 7120df7.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Gap (b) from the resized Study 2; owner decision 2026-10-13: fix before tagging v2, test first.

## In plain English

The short instructions for the lighter setup tell the assistant to add a file to the work's record when a write is refused, and a few lines later tell it never to edit the record by hand. This rewrites both lines to name the one command that adds a file, so the instructions agree with each other.

## What

`core/AGENTS.md`: the "What is enforced" bullet says "start a task or add the file to `files:`"; the "Task records" paragraph says "Do not edit the record by hand otherwise." Replace the first with the `task.js files add <path>` command (task 21) and list that command beside `begin` and `finish`.

## Why

Resized Study 2 (FINDINGS.md, "Resized Study 2: result", point 5): with no command and a rule against hand edits, one session finished and began records to widen scope (3 records, 11 task commands in tablib-lean session 2).

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| The contradictory lines | core/AGENTS.md | Codex and Claude start-up prompt under lean | core/AGENTS.md:5 and core/AGENTS.md:19 |
| The command now exists | task-system/lean.js `filesAdd` | task.js `main` | task-system/lean.js:100 (commit 5ff7d94) |
| Length limit on core/AGENTS.md | tools/validate.cjs | validate | tools/validate.cjs:59 (at most 100 lines) |

hyperparameters n/a: not an experiment.

invariants n/a: instruction text only.

## Verification

`task-system/tests/test_lean_flow.js` "core/AGENTS.md names one way to widen a task": the file contains `task.js" files add`, does not contain "add the file to `files:`", and every `task.js <word>` it names is begin, finish or files. Red-first: fails before the edit.

## Receipts

| field | value |
|---|---|
| closing commit | 7120df7 (owner approved committing once validate and tests pass, 2026-10-13) |
| files changed | core/AGENTS.md (45 -> 49 lines), task-system/tests/test_lean_flow.js, README.md |
| test | task-system tests 192/192 (1 new, red-first: failed before the edit); validate.cjs pass, 23 checks |
| before / after | before: "add the file to `files:`" and "Do not edit the record by hand otherwise"; after: `files add` named in both places, "Do not edit the record by hand" with no exception |
| result | done |

Notes / caveats / follow-ups:

- The start-up prompt grows by about 250 characters; still far under the 25,000 limit.
