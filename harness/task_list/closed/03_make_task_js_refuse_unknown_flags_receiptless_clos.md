---
id: "03"
title: Make task.js refuse unknown flags, receiptless closure and unreviewed HIGH starts
status: closed
priority: HIGH
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_transition_guards.js
plan_reviewed: null
files:
  - task-system/task.js
  - task-system/guards.js
  - task-system/tests/**
docs:
  - README.md
baseline_metric:
  source: "Claude re-check throwaway-board probe, 2026-10-08"
  field: "unsafe transitions accepted"
  baseline_value: "3 of 3 accepted with exit 0 (typo flag moved task; no-Receipts close; HIGH start with FAIL review)"
  target: "0 of 3 accepted; all ordinary valid transitions still pass"
created: 2026-10-08
last_updated: 2026-10-09
superseded_by: null
---

# Task 03 — Make task.js refuse unknown flags, receiptless closure and unreviewed HIGH starts

## Current state

- Implementation exists; independent review completed on 2026-10-09.
- Awaiting checkpoint. Task09 final regression and reviews passed; fresh Claude verification remains quota-blocked. Original implementation has no preserved pre-start review stamp; no stamp is fabricated retrospectively.
- See Receipts and Task09 for regression findings and dispositions.

## In plain English

The task tool is meant to stop work being marked done without a write-up, and stop risky work starting without a reviewed plan. Today it allows both, and a one-character typo in the "preview only" option performs the real change. This task makes the tool refuse those three cases outright, with a clear message.

## What

1. `parse` rejects any `--flag` it does not know, with a non-zero exit and the list of valid flags, before any command runs.
2. `move <id> closed` (and `close`) refuses a task whose Receipts section is missing, not only one with unfilled markers. `--force` stays as the explicit override and is journaled.
3. `start` refuses a HIGH or CRITICAL task unless `plan_reviewed:` holds a PASS. `--force` overrides and is journaled. The template's `null` counts as not reviewed.

Out of scope: binding the review to a hash of the plan (keep for later), the completion contract for docs and tests (stays in the Stop hook for now).

## Why

All three were reproduced twice on throwaway boards on 2026-10-08, once by the Codex audit and once by the Claude re-check, with exit 0 each time. The rules promise these refusals; the command does not make them.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Unknown flags are silently ignored | parse | main dispatcher | task-system/task.js:877; task-system/task.js:891 |
| Missing Receipts section counts as filled | receiptsUnfilled | cmdMove close check | task-system/task.js:51 |
| Close check and the dry-run return | cmdMove | move, close | task-system/task.js:464; task-system/task.js:490-493 |
| Start has no review check | cmdStart | start, new | task-system/task.js:426 |
| Review stamp format | cmdReview | plan reviewers | task-system/task.js:737 |
| Disposable-board test pattern to reuse | test_dry_run.js | node --test | task-system/tests/test_dry_run.js:10 |

Write the three failing tests first, reusing the fixture helpers from `test_dry_run.js`. Then make the three changes. Keep the file at or under its current 961 lines (it is already over the 800-line limit; extract the guards into a small module if needed).

## Hyperparameters

hyperparameters n/a: CLI correctness change, no experiment.

## Invariants and recovery

| Concern | Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| Task state | task Markdown frontmatter and folder, task-system/task.js:464 | every command and hook | `status:` plus folder | yes |
| Override record | journal, task-system/task.js:175 | audit | append-only text line | yes; harness journal is tracked in Git |

- **Source of truth:** frontmatter plus folder.
- **Failure:** every new refusal happens before any write, so a refused command leaves nothing to recover.
- **Backward compatibility:** existing boards with HIGH tasks already in progress are untouched (the check is on `start` only). Run `task.js audit` on this repo's board and the mobile_depth_estimation_tracking board to list tasks that would now need `--force` to restart.

## Verification

- **Contract test:** `task-system/tests/test_transition_guards.js` asserts: `move 01 closed --dryrun` exits non-zero and every file byte is unchanged; `move 01 closed` on a task with no Receipts section exits non-zero and unchanged; `start 01` on HIGH with `FAIL` or `null` exits non-zero and unchanged; the same three with `--force` succeed and append one journal line each; a HIGH task with `PASS` starts. All refused cases must fail against the current source first.
- **Regression:** `test_dry_run.js` (55) and `test_harness_invariants.js` (33) still pass.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | task-system/task.js; task-system/guards.js; task-system/tests/test_transition_guards.js; README.md |
| test | Transition-guard tests passed within independent 89-test regression run. new --worktree review bypass and forced-new journaling are fixed and tested in Task09. |
| before / after | Unknown flags, missing receipts, and unreviewed HIGH starts now refuse in tested ordinary paths. Worktree new coverage added after independent review. |
| result | Acceptance complete for CLI guard behavior. Final regression and finished reviews pass. Native Claude propagation is tracked separately in Task09; the original missing pre-start review stamp remains a historical gap. |


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Acceptance complete for CLI guard behavior. Final regression and finished reviews pass. Native Claude propagation is tracked separately in Task09; the original missing pre-start review stamp remains a historical gap. Earlier no-commit and awaiting-checkpoint notes describe historical states.
