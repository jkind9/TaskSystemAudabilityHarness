---
id: "19"
title: Read Python source as UTF-8 in the complexity checker
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
  - checks/complexity.py
  - task-system/tests/test_lean_checks.js
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

# Task 19 — Read Python source as UTF-8 in the complexity checker

## Current state

- Last test: node --test task-system/tests/*.js -> 187/187; node tools/validate.cjs -> exit 0 (23 checks)
- Next action: none; closed with commit 27cd99b.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Found while scoring the resized Study 2; owner approved committing harness fixes once validate and tests pass.

## In plain English

The checker that measures how branchy the code is sends the files to a small Python helper. On Windows that helper read the files in the local character set, so any file containing characters outside plain English text made it fail and no number was recorded. It now reads the files as UTF-8.

## What

`checks/complexity.py` `main`: `json.loads(sys.stdin.buffer.read().decode("utf-8"))` instead of `json.load(sys.stdin)`.

## Why

Scoring the resized Study 2 at harness ab8f166 left the complexity share empty for 3 of 12 runs (restart-stock, tablib-stock, tablib-lean): their touched files contain non-ASCII text (tablib's tests have Chinese strings), and the helper failed with "UnicodeEncodeError ... surrogates not allowed".

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Python complexity helper reads JSON from stdin | checks/complexity.py `main` | checks/complexity.cjs `pythonFunctions` | checks/complexity.py:45 (commit ab8f166) |
| Node writes the input as UTF-8 | checks/complexity.cjs `pythonFunctions` (spawnSync input string) | — | checks/complexity.cjs:96 (commit ab8f166) |

hyperparameters n/a: not an experiment.

invariants n/a: no state.

## Verification

`task-system/tests/test_lean_checks.js` "python source with non-ASCII text is scored": a function returning "名字" or "é" scores cc 2 with ok true. Red-first: failed before the change with the UnicodeEncodeError above.

## Receipts

| field | value |
|---|---|
| closing commit | 27cd99b (owner approved the commit 2026-10-13) |
| files changed | checks/complexity.py, task-system/tests/test_lean_checks.js, README.md |
| test | task-system tests 187/187 (was 186); validate.cjs pass, 23 checks |
| before / after | Python files with non-ASCII text: before no score (null); after scored |
| result | the complexity share is recorded for any UTF-8 Python file |

Notes / caveats / follow-ups:

- Lean sessions in Codex's sandbox were not affected: Python cannot start there, so they used the approximate count. The bug affected the Study 2 measure, which runs on the host.
