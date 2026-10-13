---
id: "05"
title: Make closed mean committed
status: closed
priority: MED
type: infra
blocked_by: []
blocks: []
verification_test: task-system/tests/test_close_checkpoint.js
plan_reviewed: 2026-10-09 PASS
files:
  - task-system/task.js
  - task-system/checkpoint.js
  - task-system/tests/**
docs:
  - README.md
baseline_metric:
  source: "git cat-file checks on 2026-10-08"
  field: "closed code tasks whose task file is absent from HEAD"
  baseline_value: "6 (project tasks 54, 55, 62, 64, 66; harness task 01)"
  target: "0 for tasks closed after this change"
created: 2026-10-08
last_updated: 2026-10-09
superseded_by: null
---

# Task 05 — Make closed mean committed

## Current state

- Implemented. Next action: final independent diff verdict and owner-authorized checkpoint. No real commit performed. Last check: 17/17 checkpoint cases passed; final fresh-repository case added and under verification.
- Source: HARNESS_WORKFLOW_AUDIT.md findings F3 and F16.
- The existing backlog of six uncommitted closures is an owner action (commit them), not part of this task.

## In plain English

Several pieces of work are marked finished but were never saved into the project's history, so nobody can later rebuild exactly what was checked. This task makes "finished" require a saved checkpoint of that task's own files, or else keeps the task in a "waiting for checkpoint" state that says so.

## What

- `close` checks the Receipts `closing commit` value. It must be a SHA that `git cat-file -e` resolves and that touches at least one path in the task's `files:`. Otherwise the command refuses and suggests `move <id> pending_review` with reason "awaiting checkpoint".
- Add `--commit`: stage only the task's `files:`, `docs:` and the task file itself, commit with a conventional message, write the SHA into Receipts, then close. Never stage paths outside those lists.
- Doc-only and decision tasks with `files:` empty keep today's behaviour.

## Why

On 2026-10-08 six closed tasks across two boards existed only in working trees. In the project repo, the active task owns `src/walkthrough/**`, which overlaps four of them, so their changes are already mixing. The receipts say "no commit was requested" honestly, but the state name `closed` does not.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Worktree mode already commits on move | cmdMove worktree branch | worktree handoff | task-system/task.js:508 |
| Close gate reads receipt placeholders and blank rows, and now missing sections | receiptsUnfilled | cmdMove | task-system/task.js:51; task-system/task.js:490 |
| Task scope lists exist and are parsed | parseFilesList | task-gate, verify | scripts/hooks/task-gate.js:63 |

- Checkpoint logic goes into task-system/checkpoint.js; task.js integrations replace existing lines and stay at or below the committed 961-line size.
- Additional tests cover dirty scoped code/docs, unrelated staged changes, globbed/deleted/new paths, nonancestor or unrelated SHAs, dry-run snapshots, failed commits, process recovery evidence, and worktree handoff ownership.

## Hyperparameters

hyperparameters n/a: CLI change, no experiment.

## Invariants and recovery

| Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|
| Task scope, task-system/file-size.js:57 | checkpoint module | relative files/docs globs using shared matcher, task-system/file-size.js:40 | yes, task frontmatter |
| Git object database | close checkpoint validation | full commit SHA, ancestor of HEAD, touching declared files | yes |
| Git index and worktree | scoped commit | exact enumerated repository paths; no shell interpolation | yes |
| Receipt closing commit | task move | SHA saved before changing lifecycle folder | yes |

Source of truth: Git stores code checkpoints; task frontmatter and folder store workflow state. No process or thread boundary besides Git subprocess argv and exit status. Fresh deployment uses tools/install.cjs:44-45 task-system junction; checkpoint.js is loaded next to task.js. Existing doc/decision tasks with empty files remain compatible. Code tasks require a reachable source checkpoint even with --force. No real repository commit is authorized this session.

`--commit` rejects merge/rebase/conflict state, paths escaping the repository, and unrelated staged paths before writing. It enumerates tracked and nonignored untracked files using Git, matches files/docs with the shared matcher, then stages and commits only explicit literal paths. On a Git failure, report the operation and stop; any scoped staging remains visible and can be retried. An unrelated staged path is never reset or committed. Record SHA before moving; if killed between commit and receipt write, recover SHA from Git log and write the receipt manually before retrying. If killed after receipt and before move, retry close. The source checkpoint predates the closing task metadata. Ordinary close leaves the final task move/receipt dirty until an owner-authorized board checkpoint. Worktree handoff retains its existing post-move commit, scoped to files/docs plus BOTH old and new task paths, so the receipt and move survive merge and cleanup. Any failure of that metadata commit stops before PR, merge or teardown.

Require a recorded SHA to be an ancestor of HEAD, touch files scope, and have no remaining changes in declared files/docs compared with HEAD. This prevents an unrelated old checkpoint masking dirty implementation. Ordinary close and dry-run never create commits. `--commit --dry-run` validates scope but writes nothing. Worktree handoff must use the same scoped commit helper rather than git add -A, and stop on commit failure before PR/merge/cleanup. Recovery after post-move commit failure: retain branch/worktree, inspect git status and staged paths, commit only the enumerated files/docs plus old/new task paths, then manually merge from the primary checkout after confirming the metadata commit; do not retry close on a task already in closed/. If interrupted between git mv and status write, repair destination frontmatter to match its folder and the Current state block to name interrupted handoff, then perform the same scoped metadata commit. Emit recovery guidance on failure; no automatic teardown may run while ANY tracked or untracked path remains dirty, including unrelated changes. A successful local merge may retain a dirty worktree and branch with a clear message; never force-remove it. Reject --commit on commands other than close or move closed.

## Verification

- **Contract test:** `task-system/tests/test_close_checkpoint.js` in a throwaway Git repo asserts: close refuses an unresolvable or empty SHA; close refuses a SHA that touches none of `files:`; `--commit` stages only declared paths (an unrelated dirty file stays unstaged) and records the SHA; a doc-only task with empty `files:` closes as before. Red first.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | task-system/task.js; task-system/checkpoint.js; task-system/tests/test_close_checkpoint.js; README.md; this task and local journal |
| test | RED: 6 failed, 3 passed on unchanged source. GREEN: 17/17 passed, with fresh-repository 18th case added. Independent review drove staged-deletion, old/new metadata, metadata-only commit, merge and Windows argument-limit regressions. Final suite count recorded in completion addendum. |
| before / after | Source-task close accepted missing/unrelated/stale SHAs; now refuses before ordinary transition. Scoped source commits and worktree metadata persistence tested in disposable repositories. Historical uncommitted closures remain owner action. |
| result | Acceptance complete. Scoped checkpoint and staged-index regressions pass; finished diff review PASS. Commit records declared source and docs without unrelated staged or working-tree changes. |


### Independent diff review, 2026-10-09

PASS after fixing five reproduced cases: staged deletions/renames, metadata-only commits, merge receipts, Windows path-list length and unborn HEAD. Final18th fresh-repository case passed separately; combined suite is included in final harness verification. No unresolved Task05 findings; awaiting checkpoint.

Final verification: all 19 checkpoint cases passed in the 135-test combined suite. Required code review additionally caught staged code hidden by a restored working copy; Task09 added RED/GREEN code/docs cases and fixed cached-index validation. Both final reviews now approve. Awaiting checkpoint.


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Acceptance complete. Scoped checkpoint and staged-index regressions pass; finished diff review PASS. Commit records declared source and docs without unrelated staged or working-tree changes. Earlier no-commit and awaiting-checkpoint notes describe historical states.
