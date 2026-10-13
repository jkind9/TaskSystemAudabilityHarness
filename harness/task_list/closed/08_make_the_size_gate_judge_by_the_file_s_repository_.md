---
id: "08"
title: Make the size gate judge by the file's repository and its committed size
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_size_gate_scope.js
plan_reviewed: null
files:
  - scripts/hooks/file-size-gate.js
  - task-system/tests/**
  - task-system/task.js  # only to undo the line-packing Task 03 was forced into
docs:
  - README.md
baseline_metric:
  source: "Claude harness-fix session, 2026-10-09"
  field: "wrong size-gate decisions observed"
  baseline_value: "2 (named another repo's Task 65 as the splitter; refused regrowth of task.js after it had been shrunk 961 to 958 lines)"
  target: "0; growth past the committed size of an oversized file still refused"
created: 2026-10-09
last_updated: 2026-10-09
superseded_by: null
---

# Task 08 — Make the size gate judge by the file's repository and its committed size

## Current state

- Implementation exists; independent review completed on 2026-10-09.
- Awaiting source checkpoint. Existing oversized files are preserved; this change does not claim to split them.
- See Receipts and Task09 for regression findings and dispositions.

## In plain English

The check that stops long code files from growing had two faults. It looked up the active task in whatever project the session started in, not the project that owns the file. And it refused any single edit that added a line, even after the same work had already made the file shorter, which pushed the code into denser, harder-to-read lines. This task fixes both, while still refusing any growth past the file's last saved size.

## What

- Resolve the repository from the target file's folder, and read that repository's board for the `shrinks:` escape.
- Allow a write when the resulting line count is at or under the larger of the current size and the size at HEAD. Growth beyond the committed size is still refused.

## Why

On 2026-10-09 the gate named the project's Task 65 while a harness file was being edited, and it refused the Task 03 start-guard lines after the file had been shrunk by three lines; the guard had to be packed into longer lines to get through.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Root comes from the process folder | file-size-gate | PreToolUse dispatch | scripts/hooks/file-size-gate.js:36 |
| Boards are read relative to the process folder | activeTasks | splitter check | scripts/hooks/file-size-gate.js:74-76 |
| Growth is measured against the on-disk size only | file-size-gate | every Write/Edit | scripts/hooks/file-size-gate.js:32-34 |
| Same repo-resolution fix already exists in the task gate | repoRootOf | task-gate | scripts/hooks/task-gate.js (Task 04) |

## Hyperparameters

hyperparameters n/a: hook change, no experiment.

## Invariants and recovery

invariants n/a: stateless hook; the committed size is read from Git on each call.

## Verification

- **Contract test:** `task-system/tests/test_size_gate_scope.js` in throwaway repos: an oversized committed file shrunk on disk may regrow up to its HEAD size (exit 0) but not past it (exit 2); an oversized new uncommitted file may not grow; the splitter message names the active task of the file's own repository, not the session's. Red first.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | scripts/hooks/file-size-gate.js; task-system/tests/test_size_gate_scope.js; task-system/task.js; README.md |
| test | Size-scope regression suite passed within independent 89-test run; independent source review found no remaining reproduced defect in this change. |
| before / after | Gate checks target repository and permits an oversized committed file to regain its HEAD line count after shrinking. CLI remains below its original 961-line size. |
| result | Acceptance complete. Target-repository and committed-size ceiling regressions pass; final code and diff reviews approve. |


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Acceptance complete. Target-repository and committed-size ceiling regressions pass; final code and diff reviews approve. Earlier no-commit and awaiting-checkpoint notes describe historical states.
