---
id: "06"
title: Replace the restart summary with a handoff built from the active task
status: pending_review
priority: MED
type: infra
blocked_by: []
blocks: []
verification_test: task-system/tests/test_session_handoff.js
plan_reviewed: null
files:
  - scripts/hooks/session-end.js
  - scripts/lib/session-handoff.js
  - task-system/tests/**
docs:
  - README.md
baseline_metric:
  source: "session summary injected at start of the 2026-10-08 Claude re-check session"
  field: "handoff fields filled (next action, last check, open decisions)"
  baseline_value: "0 of 3 filled; 9 of 10 'Tasks' lines were monitor notifications"
  target: "3 of 3 filled or explicitly 'none'; no tool notifications in user intent"
created: 2026-10-08
last_updated: 2026-10-09
superseded_by: null
---

# Task 06 — Replace the restart summary with a handoff built from the active task

## Current state

- Implemented and verified in the working tree. Next action: review the diff and create the harness checkpoint before closure.
- Last check: node --test task-system/tests/test_session_handoff.js; 14 passed, 0 failed, exit 0.
- Open decisions: none recorded. Named follow-up: harness checkpoint commit and finished-diff review.
- Source: HARNESS_WORKFLOW_AUDIT.md findings F11 and F18.
- Depends on tasks carrying a short "Current state" block at the top (working rule 7 in the audit's final plan). Task files 02 to 07 on this board already have one.

## In plain English

When a new session starts, it is given a summary of the last one. Today that summary lists which files were touched and some background notifications, and leaves the "what to do next" part blank. This task builds the summary from the active task's own short status block instead, so the next session knows what was done, what was checked and what comes next.

## What

- At session end, find the active task (or the most recently moved task) in the session's repository and copy its "Current state" block into the summary.
- Add the last test or check command seen in the transcript with its exit code.
- Drop `<task-notification>` and other tool-generated messages from the "user intent" lines.
- Leave fields as "none recorded" rather than blank placeholders.

## Why

Measured on 2026-10-08: the injected summary had empty "Notes for Next Session" and "Context to Load" fields, and nine of its ten task lines were background-monitor events. A new session had to rebuild state by reading files.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Transcript fragments are extracted here | extractSessionSummary | session-end main | scripts/hooks/session-end.js:39 |
| Placeholder handoff fields are written here | main | next SessionStart | scripts/hooks/session-end.js:240; scripts/hooks/session-end.js:253-254 |
| Active task lookup pattern | task-gate | PreToolUse | scripts/hooks/task-gate.js:51-65 |

## Hyperparameters

hyperparameters n/a: hook change, no experiment.

## Invariants and recovery

| Producer/owner | Consumer | Representation | Survives restart? |
|---|---|---|---|
| Repository task files | session-end and next SessionStart | Frontmatter status plus verbatim Current state; scripts/hooks/task-gate.js:62 | Yes; task files remain authoritative |
| Transcript tool invocation/result | generated handoff | Command plus observed integer exit code, paired by call id; scripts/hooks/session-end.js:39 | Yes, summary is advisory |
| Human-authored session text | next session | Text outside ECC summary markers; scripts/hooks/session-end.js:231 | Yes; repeated Stop replaces only generated text |

Source of truth: repository-local task files and transcript results. Never infer task completion or exit zero from assistant prose. Multiple active tasks produce an explicit warning instead of choosing one. With no active task, use the newest recorded lifecycle move in the board journal when available, otherwise the most recently updated pending/closed task. No available task and absent checks each say none recorded.
The only boundary is the Stop child process writing its advisory session file. No task state is modified. If interrupted, the next Stop reconstructs generated content from sources; human notes outside summary markers must remain byte-for-byte. Fresh installs use the existing session directory and existing SessionStart consumer. Old marker-bearing summaries update in place; legacy unmarked files retain their human sections. No generated placeholder sections are added.

## Verification

- **Contract test:** `task-system/tests/test_session_handoff.js` runs the hook on a recorded transcript fixture with one active task and asserts the output contains that task's Current state block, the last check command and exit code, and no `<task-notification>` text; with no active task it prints "none recorded". Red first.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | scripts/hooks/session-end.js; scripts/lib/session-handoff.js; task-system/tests/test_session_handoff.js; README.md |
| test | RED: 0/9 original integration assertions passed; GREEN: node --test task-system/tests/test_session_handoff.js, 14 passed, 0 failed, exit 0. Literal dollar replacement regression also failed before its fix. |
| before / after | Before: 0/3 restart fields and 9/10 notification intent lines. After fixture: task state, next action and open decisions recorded or explicitly none (3/3); 0 notification intent lines. |
| result | Source committed; all 17 handoff cases and finished reviews pass. Pending a fresh stop/start session demonstrating that the next action is recovered from the generated handoff alone. |

Limitations: only recognizable test/check commands are selected. No observed exit and multi-command wrapper ambiguity remain none recorded. Legacy unmarked session text is retained in full because its human ownership is unknown. Session replacement writes a sibling temporary file then renames; injected rename failure preserves old notes and cleans the temporary file. Source task files remain authoritative.

Final verification: Task09 fixed actual Codex custom-tool records/output envelopes and removed the owned legacy placeholder that prevented SessionStart acceptance. All 17 handoff cases passed in the 135-test suite. Final code and diff reviews approve. Awaiting checkpoint.


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Source committed; all 17 handoff cases and finished reviews pass. Pending a fresh stop/start session demonstrating that the next action is recovered from the generated handoff alone. Earlier no-commit and awaiting-checkpoint notes describe historical states.
