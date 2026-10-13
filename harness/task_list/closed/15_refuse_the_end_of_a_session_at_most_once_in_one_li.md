---
id: "15"
title: Refuse the end of a session at most once, in one line
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_stop_once.js
plan_reviewed: null
files:
  - tools/dispatch.cjs
  - tools/validate.cjs
  - scripts/hooks/task-complete-gate.js
  - task-system/tests/test_stop_once.js
docs:
  - README.md
baseline_metric:
  source: "harness task 11 receipts; FINDINGS.md item 8"
  field: "end-of-session refusals before a session may end; lines in the refusal"
  baseline_value: "up to 3 refusals; 7-30 lines per refusal"
  target: "at most 1 refusal of 1 line naming the command; the give-up logged with what was missing"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 15 — Refuse the end of a session at most once, in one line

## Current state

- Last test: node tools/validate.cjs -> exit 0 (22 checks); node --test task-system/tests/*.js -> 156/156
- Next action: none; closed with commit f37ddf8.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner approved committing once validate and tests pass.

## In plain English

When an assistant tries to finish while its task record is incomplete, the harness stops it and explains what is missing. It used to stop it up to three times with a long explanation each time, and that pressure once led an assistant to edit a file it had been told to leave alone. Now it stops the assistant once, with a single line saying what is missing and the exact command to run, and lets the next attempt through while writing down what was still missing.

## What

`tools/dispatch.cjs`: `STOP_REFUSAL_LIMIT` 3 → 1; the give-up audit record gains `missing` (the refusal text). `scripts/hooks/task-complete-gate.js`: the five multi-line refusal blocks become one line: `TASK COMPLETION GATE: task <id>: <problems>. Fix that, then run: node ~/.claude/task-system/task.js move <id> pending_review (or write "still open because <reason>" in the task). This is the only refusal; ...`. The checks themselves are unchanged. `tools/validate.cjs`: the cap check now expects refuse, allow, refuse, allow, refuse.

## Why

FINDINGS.md item 8. Harness task 11 bounded the loop at 3 refusals, but in the Claude probe one refusal was enough to make the model edit a task file its prompt forbade. The long refusal text (rules, catalogue names, Right-BICEP) is paid for on every re-send of the conversation.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Consecutive Stop refusal counter | tools/dispatch.cjs | Stop event, both runtimes | tools/dispatch.cjs:179-200 (before) |
| Refusal message text | scripts/hooks/task-complete-gate.js | dispatcher passes stderr as the reason | scripts/hooks/task-complete-gate.js:142-183 (before) |
| Tests pin "unfilled receipts", "no test file added/updated this session", "none match verification_test" | test_harness_invariants.js | — | task-system/tests/test_harness_invariants.js:87,104,117 |

hyperparameters n/a: not an experiment.

invariants n/a: same per-session counter file as task 11, only the limit changes. Backward compatibility: the phrases other tests pin are kept inside the one line.

## Verification

`task-system/tests/test_stop_once.js`: (1) the gate's stderr on an unfinished task is exactly one non-empty line containing "unfilled receipts" and `node ~/.claude/task-system/task.js move 01 pending_review`; (2) for Claude and Codex, four Stops in one session go refuse, allow, refuse, allow, and the two give-ups are logged with `missing` containing "unfilled receipts"; (3) a finished task is allowed at the first Stop in both runtimes. Red-first: 1 and 2 failed before the change; 3 passed before and after.

## Receipts

| field | value |
|---|---|
| closing commit | f37ddf8 (owner approved the commit 2026-10-13) |
| files changed | tools/dispatch.cjs (limit 1, missing logged), scripts/hooks/task-complete-gate.js (one-line refusal, -26 lines), tools/validate.cjs (cap check), task-system/tests/test_stop_once.js (new), README.md |
| test | validate.cjs pass, 22 checks; task-system tests 156/156 |
| before / after | refusals before a stuck session may end: 3 → 1; refusal length: 7-30 lines → 1 line |
| result | one nudge naming the command; the rest goes to the log |

Notes / caveats / follow-ups:

- The one line can be long when several things are missing for several tasks; it names each task once.
