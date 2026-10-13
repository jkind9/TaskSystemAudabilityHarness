---
id: "18"
title: Fix the lean probe findings: unreadable folders, the task.js path, the help line
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
  - checks/gitread.cjs
  - checks/run.cjs
  - core/AGENTS.md
  - task-system/task.js
  - task-system/lean.js
  - scripts/hooks/lean-stop-gate.js
  - scripts/hooks/task-gate.js
  - task-system/tests/test_lean_*.js
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

# Task 18 — Fix the lean probe findings: unreadable folders, the task.js path, the help line

## Current state

- Last test: node tools/validate.cjs -> exit 0 (23 checks); node --test task-system/tests/*.js -> 186/186
- Next action: none; closed with commit 3dfa864; re-probe lean in Study 2 at the new commit.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner approved committing harness fixes once validate and tests pass.

## In plain English

The second round of trial runs of the lean setup showed three small problems. Finishing a task crashed on a temporary folder that the sandbox would not let anyone open. The instructions wrote the tool's path with a shortcut that one command shell does not understand, so the assistant had to work out the path. And the tool's help pointed at its source code, so the assistant read it. This task fixes all three.

## What

- `checks/gitread.cjs`: `workingFiles` skips a folder whose listing fails with EPERM or EACCES and names it in `skipped`; `checks/run.cjs` passes it on as `unreadable`; `task-system/lean.js` writes "folders that could not be read, skipped: ..." into Checked.
- `core/AGENTS.md`, `scripts/hooks/lean-stop-gate.js`, `scripts/hooks/task-gate.js`: the command is `node "$HOME/.claude/task-system/task.js"` (PowerShell and bash both expand `$HOME`; PowerShell does not expand `~` in arguments).
- `task-system/task.js`: the help line shows the lean syntax instead of "see lean.js" (same line count).

## Why

Study 2 probe set 2 (C:/tmp/study2-resized/probes2, harness 1dedd0f), 2026-10-13. probe-lean-flow: `node ~/.claude/task-system/task.js begin` failed with "Cannot find module ...repo~.claude..."; `finish` failed twice with "EPERM: scandir ...pytest-cache-files-0lygi718", and the model then tried to delete the folder. probe-lean-gates: the model ran `task.js --help`, then read 240 lines of lean.js.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Directory walk throws on an unreadable folder | checks/gitread.cjs `workingFiles` | checks/run.cjs `changes` | checks/gitread.cjs:176 (commit 1dedd0f) |
| Tilde path in instructions and refusals | core/AGENTS.md, lean-stop-gate.js, task-gate.js | the model | core/AGENTS.md:14-15, scripts/hooks/lean-stop-gate.js:13, scripts/hooks/task-gate.js:75 (commit 1dedd0f) |
| Help line says "see lean.js" | task-system/task.js USAGE | task.js help | task-system/task.js:879 (commit 1dedd0f) |

hyperparameters n/a: not an experiment.

invariants n/a: no new state.

## Verification

- `test_lean_nospawn.js`: a folder denied to the current user (icacls) is skipped; `workingFiles` lists the rest and `skipped` names it; `runChecks` succeeds and reports it as `unreadable`.
- `test_lean_hooks.js`: both refusals name `node "$HOME/.claude/task-system/task.js"`.
- `test_lean_flow.js`: help shows the begin and finish syntax and no "see lean.js".
- Red-first: all four failed before the change.

## Receipts

| field | value |
|---|---|
| closing commit | 3dfa864 (owner approved the commit 2026-10-13) |
| files changed | checks/gitread.cjs, checks/run.cjs, task-system/lean.js, core/AGENTS.md, scripts/hooks/lean-stop-gate.js, scripts/hooks/task-gate.js, task-system/task.js (help line), task-system/tests/test_lean_{nospawn,hooks,flow}.js, README.md |
| test | validate.cjs pass, 23 checks; task-system tests 186/186 (was 184) |
| before / after | probe-lean-flow: 2 failed finish calls and 1 failed begin; after: covered by tests, to be confirmed in probe set 3 |
| result | finish survives unreadable folders; the command path works in PowerShell; help no longer points at source |

Notes / caveats / follow-ups:

- The unreadable-folder test locks a folder with icacls on Windows (chmod elsewhere).
