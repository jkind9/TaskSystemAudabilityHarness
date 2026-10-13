---
id: "12"
title: Keep the task tool's board inside the repository
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_board_scope.js
plan_reviewed: null
files:
  - task-system/task.js
  - task-system/locate.js
  - task-system/tests/test_board_scope.js
  - tools/validate.cjs
docs:
  - README.md
baseline_metric:
  source: "Study 2 pilot, Harness_Development/follow-up/study-002/pilot/contamination/"
  field: "pilot runs whose task tool read or wrote a board above their repository"
  baseline_value: "4 of 6 harness runs"
  target: "0: a nested repository leaves the outer board byte-identical"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 12 — Keep the task tool's board inside the repository

## Current state

- Last test: node tools/validate.cjs -> exit 0 (21 checks); node --test task-system/tests/*.js -> 144/144
- Next action: none; closed with commit 74af34b.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner approved committing once validate and tests pass. Commit 74af34b went in with this record still the template (a write race); the filled record is in the closing commit.

## In plain English

The task tool looks for the folder of task records by walking up from where it is run. When a project sat inside another project's folder, it found and used the outer project's records, and in a study it read another run's plan. After this change it stops at the top of its own project, creates its own records folder there if needed, and never touches a folder above.

## What

`task.js` used `locate()` to search every parent folder for `docs/tasks/` or `task_list/`. It now calls `task-system/locate.js`, which stops the search at the first folder holding `.git` (a directory or a worktree's `.git` file), and defaults the board to `task_list/` there. With no `.git` anywhere above, the old unlimited search is kept. `.git` is found with `fs.existsSync`, not by running git, so the bound holds in Codex's sandbox where git cannot start. `task.js` shrinks by 15 lines (it is over the 800-line limit).

## Why

FINDINGS.md item 10 and "The isolation leak": 4 of 6 Study 2 harness runs reached the study's board; restart-task-only wrote its plan there and restart-full adopted it. The hooks already judge by the repository top (`task-gate.js:114`, `task-complete-gate.js:52`, `session-handoff.js:14`); only `task.js` searched past it.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Unbounded upward board search | task.js `locate()` | every task.js command via LOC/ROOT/TASK_ROOT | task-system/task.js:75-88 (before 74af34b) |
| Task gate already bounds by repository top | task-gate.js `repoRootOf` | PreToolUse | scripts/hooks/task-gate.js:114 |
| Completion gate reads boards relative to the repo | task-complete-gate.js | Stop | scripts/hooks/task-complete-gate.js:52,64 |
| Board created on first write | task.js `ensureTaskRoot` | new, init | task-system/task.js:340 |

hyperparameters n/a: not an experiment.

invariants n/a: read-only path resolution; no new state. Backward compatibility: a repository with its board at its top folder resolves as before (test 2); a folder outside any repository resolves as before (test 4).

## Verification

- `task-system/tests/test_board_scope.js`: (1) from a subfolder of a repository nested under a folder with an in_progress task, `list` does not show the outer task, `new` creates `task_list/open/` at the repository top, and the outer board is byte-identical; (2) a board at the repository top is found from a subfolder; (3) a worktree-style `.git` file also bounds the search; (4) outside any repository the outer board is still found. Red-first: 1–3 failed on the old `task.js`.
- `tools/validate.cjs` check "A repository nested in a folder with its own board leaves that board untouched": the task gate refuses a second code file in the inner repository (the outer in_progress task does not count), `task.js new` creates the inner board, and the outer board is unchanged. Red-first: on the old `task.js` it failed with "task 01 is in_progress and holds the lock" (it found the outer board).

## Receipts

| field | value |
|---|---|
| closing commit | 74af34b (owner approved the commit 2026-10-13) |
| files changed | task-system/locate.js (new), task-system/task.js (uses it; -15 lines), task-system/tests/test_board_scope.js (new), tools/validate.cjs (new check), README.md |
| test | validate.cjs pass, 21 checks (was 20); task-system tests 144/144 (was 140); both new checks red-first |
| before / after | nested repository: before, task.js listed and wrote the outer board; after, outer board byte-identical and the board is created at the repository top |
| result | the task tool cannot read or write a board above its repository |

Notes / caveats / follow-ups:

- A folder that is not a git repository still searches upward without limit; there is no repository boundary to stop at. The Study 2 runner adds its own probe that no board exists above a run folder.
