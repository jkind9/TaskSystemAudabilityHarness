---
id: "13"
title: Let task.js close a task when git cannot run
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_no_git.js
plan_reviewed: null
files:
  - task-system/checkpoint.js
  - task-system/tests/test_no_git.js
docs:
  - README.md
baseline_metric:
  source: "Study 2 pilot, restart-task-only session 2 events.jsonl"
  field: "close attempts refused because git could not run"
  baseline_value: "2 of 2 (Awaiting checkpoint: spawnSync git EPERM)"
  target: "0: close succeeds and the journal names the reason"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 13 — Let task.js close a task when git cannot run

## Current state

- Last test: node --test task-system/tests/*.js -> 148/148; node tools/validate.cjs -> exit 0 (21 checks)
- Next action: none; closed with commit ceb67b9.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner approved committing once validate and tests pass.

## In plain English

When a task is finished, the task tool saves the work in version control before marking the task done. Inside one assistant's safety sandbox the version-control program could not start at all, so finished tasks could never be marked done. After this change the task is marked done anyway, and the tool writes down that nothing was saved and why, so a person can save it later.

## What

`task-system/checkpoint.js`: `closeCheckpoint` first asks `gitUnavailable(root)`. If git cannot start (spawn error) or the folder is not a repository, it skips the checkpoint, prints a note and appends `close <id> without a git checkpoint: <reason>` to the board journal (not on `--dry-run`). With `--commit`, a git write refused with Permission denied / EPERM / EACCES / index.lock takes the same path. Where git works, the existing checkpoint rule is unchanged. `task.js` is untouched (it is over 800 lines).

## Why

FINDINGS.md item 2. In the pilot, restart-task-only session 2 ran `close 01` and `close 01 --commit`; both failed with `Awaiting checkpoint: spawnSync git EPERM`, so its task stayed in pending_review and its final message said so. The same rule refuses every close in a folder with no repository (this study's own board). The move step already fell back to a file move (`task.js` cmdMove, `git mv` then `fs` write).

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Close requires a git checkpoint | checkpoint.js `closeCheckpoint` | task.js cmdMove (close and dry-run) | task-system/checkpoint.js:80 (before), task-system/task.js:460,472 |
| Moves fall back to plain file moves | task.js cmdMove | move, close | task-system/task.js:479-480 |
| Journal is `<board>/.journal.log` | task.js `journal` | usage.js, audit | task-system/task.js:154 |

hyperparameters n/a: not an experiment.

invariants n/a: no new state; one journal line per no-git close. Backward compatibility: where git works, every existing checkpoint test still passes (test_close_checkpoint.js) and test 4 here pins the refusal.

## Verification

`task-system/tests/test_no_git.js`: (1) a plain folder: `close 01` exits 0, the file is in `closed/`, journal has "without a git checkpoint: not a git repository"; (2) git removed from PATH in a real repository: `move 01 pending_review` and `close 01` exit 0, journal has "git cannot start"; (3) `close --dry-run` with no git leaves the task in `open/` and journals nothing; (4) with working git and no commit receipt, close is still refused with "Awaiting checkpoint". Red-first: 1–3 failed before the change, 4 passed before and after.

## Receipts

| field | value |
|---|---|
| closing commit | ceb67b9 (owner approved the commit 2026-10-13) |
| files changed | task-system/checkpoint.js (gitUnavailable, withoutCheckpoint), task-system/tests/test_no_git.js (new), README.md |
| test | task-system tests 148/148 (was 144); validate.cjs pass, 21 checks |
| before / after | close with git unable to start: before refused ("Awaiting checkpoint: spawnSync git EPERM"); after closes and journals the reason |
| result | a Codex session in its sandbox, or any non-git folder, can close a task |

Notes / caveats / follow-ups:

- A git write refusal is recognised by message text; a refusal worded differently still refuses the close, which is the strict side.
