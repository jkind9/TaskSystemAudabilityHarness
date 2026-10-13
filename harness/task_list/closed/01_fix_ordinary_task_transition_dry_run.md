---
id: "01"
title: Fix ordinary task transition dry run
status: closed
priority: HIGH
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_dry_run.js
plan_reviewed: 2026-10-08 PASS
files:
  - task-system/task.js
  - task-system/tests/test_dry_run.js
docs:
  - README.md
baseline_metric:
  source: "F1 disposable-board reproduction, 2026-10-08"
  field: "ordinary dry-run mutations"
  baseline_value: "1 of 1 dry-runs mutated task bytes, directories and journal"
  target: "0 mutations across ordinary transitions"
created: 2026-10-08
last_updated: 2026-10-08
superseded_by: null
---

# Task 01 - Fix ordinary task transition dry run

## In plain English

Previewing a task move currently performs the move on an ordinary task board. Add a return before any write so previewing leaves the board unchanged. Disposable boards will check previews and real moves.

## What

Correct cmdMove in task-system/task.js for ordinary --dry-run transitions, including the close alias. Add task-system/tests/test_dry_run.js and describe its command in README.md. Keep worktree handoff behavior and other CLI semantics intact. Unknown-flag validation, closure-contract hardening and all other audit findings are outside this task.

## Why

HARNESS_WORKFLOW_AUDIT.md F1 (lines 80-86 in mobile_depth_estimation_tracking) identifies a worktree-only return. Task60 receipt line 91 records 16 unintended dry-run closes. At harness HEAD 0d40c2016126604651530b377aad367ff0fa2e4d plus pre-existing edits, CLI SHA256 bff5697f36457fa0a3af72fb45970105a24df691b103b317e72916d78588a5f3, a disposable-board move 01 closed --dry-run exited 0, created closed/01_fixture.md, changed status and appended the journal.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Move owns status, folder and journal writes | cmdMove | move and close commands | task-system/task.js:464; task-system/task.js:948 |
| Worktree preview already returns before writes | cmdMove | worktree handoff | task-system/task.js:483 |
| Parser already recognizes --dry-run | parse | main | task-system/task.js:886 |
| Journal is appended by transitions | journal | cmdMove | task-system/task.js:174; task-system/task.js:501 |
| Scratch CLI probe pattern exists; no ordinary dry-run probe found in dry.run/worktree search | cli and SCRATCH | harness invariants suite | task-system/tests/test_harness_invariants.js:47; task-system/tests/test_harness_invariants.js:69 |

- [x] Plan lint and fresh plan-reviewer PASS before start.
- [x] Add subprocess regression tests first; run on unchanged canonical CLI and retain failures.
- [x] Insert ordinary dry-run preview/return after existing validation and before setStatus/writes. Remove a nearby blank line to avoid any growth of the existing oversized file; no size-rule bypass or broad refactor.
- [x] Test all 20 distinct state-pair previews plus close alias, absent/existing directories and journal, CRLF bytes, error/receipt refusal, forced preview, Git-backed ordinary board and real transitions.
- [x] Run new tests and the existing CLI probe suite; run node tools/render.cjs.
- [x] Update README.md. Obtain fresh diff-reviewer plus code/JavaScript reviews; record findings and dispositions.
- [x] Record source hashes, commands, exits, counts, files and coverage gaps. Close only this task after receipts are filled.

## Invariants and recovery

| Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|
| parse, task-system/task.js:886 | cmdMove, task-system/task.js:464 | boolean dryRun; positional id and state | argv is transient |
| task Markdown, task-system/task.js:153 | findTask and cmdMove, task-system/task.js:162; task-system/task.js:465 | UTF-8 frontmatter status plus board folder | yes, persisted |
| cmdMove, task-system/task.js:492 | task files and Git index, task-system/task.js:500 | status, last_updated, relative self-path, filesystem path | real moves persist; previews must write nothing |
| journal, task-system/task.js:174 | local audit history | append-only text | existing bytes persist; previews must neither create nor append |

Source of truth: task frontmatter and its lifecycle folder. Test subprocesses pass argv and exit/stdout/stderr only; they operate on disposable boards. A process killed during preview has no recovery work because there are no writes. Existing real-move partial-failure behavior is unchanged; do not add transaction recovery. Fresh deployment uses canonical source shared by both runtime junctions, then node tools/render.cjs. Preserve all other sessions' locks and pre-existing changes, including the two commit-message edits in task.js. No --take. Backward compatibility is checked by successful real moves, real close, existing CLI probes and unchanged worktree preview branch.

## Hyperparameters

hyperparameters n/a: task CLI correction, no experiment.

## Verification

Contract: task-system/tests/test_dry_run.js snapshots every directory entry and each file's raw bytes before/after ordinary dry-runs; assert deep equality, exit 0 and explicit preview output. Git-backed fixtures also assert unchanged index/status/HEAD. Real moves assert source removal, expected destination status/date/self-path and one journal entry. Invalid/missing/same-state and unfilled-receipt cases assert nonzero exit and no mutation; forced closed preview asserts no mutation.

Baseline: 1 of 1 ordinary closed preview mutated the disposable board. Target: 0 mutations in 20 distinct ordinary transition pairs and close aliases. Show new preservation assertions failing against pre-fix source, then passing; real transitions must pass both times. Relevant CLI suite must pass. Statement/branch coverage of the entire CLI is unavailable unless measured; do not claim 80% from case counts. Worktree PR/local-merge integration is outside this ordinary-transition fix and must be labeled unmeasured.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | task-system/task.js: one dry-run return before setStatus, one nearby blank removed, still 961 lines; task-system/tests/test_dry_run.js: new regression suite; README.md: behavior and test commands; this task added and moved to task_list/closed/01_fix_ordinary_task_transition_dry_run.md; task_list/.journal.log: own new/review/start/move entries. |
| source version | Node v22.21.0. Pre-fix task.js SHA256 bff5697f36457fa0a3af72fb45970105a24df691b103b317e72916d78588a5f3; final SHA256 966ca5d5f03e07d8b16e3514afbafe036e0a382d614fe3cdac5d0cdcbea59b87. Final test SHA256 62ccfe25a1e172f8cbac1319d554636403672299d24afa40072489eaf1a37f55. README SHA256 7b58782fcfe3a9d284079a4c5114684cc55f84503e42c0bb9e4ee0dd804ae1ab. Final Git-generated scoped diff SHA256 96154f9de554d9b0f23a3ea9ed56336ad6a1ece0e91092413d1498874e378543. |
| test commands and outcomes | Commands and logs below. Final transition suite 55 pass, 0 fail, exit 0; existing CLI/hook probes 33 pass, 0 fail, exit 0; syntax checks exit 0; canonical board lint 2 tasks, 0 errors, 0 warnings before closure. |
| before measurement | Disposable move 01 closed --dry-run exited 0 but created closed task, changed frontmatter and appended journal. RED suite: 54 tests, 27 pass, 27 fail; all 27 successful-preview preservation cases failed. |
| after measurement | Final suite: 27 preview preservation cases pass (20 state pairs, 4 close aliases, 1 forced preview, 2 ordinary Git previews); 22 real-transition cases pass; 5 validation-error preservation cases pass; 1 Git environment isolation regression passes. 0 board mutations on successful previews. |
| delta | Preview preservation failures 27 -> 0. Real transition cases stayed passing. |
| reviews | Plan reviewer PASS; PR-1 advisory source citations corrected before stamp/start. Final code-reviewer, diff-reviewer and typescript-reviewer all PASS on final scoped diff. JavaScript reviewer found HIGH inherited Git overrides in fixture subprocesses; corrected by clearing GIT_* case-insensitively and a red-first external-index regression. No finding waived. |
| coverage and token usage | Code statement/branch coverage not measured; 80% whole-CLI coverage is not established. Worktree PR/local-merge integration not executed. Broad harness parity suite not run. Five unique agents and three final-review followups; parent and agent token counters unavailable. Test/probe counts are not coverage percentages. |
| decision-gate outcome | Closed. Source checkpoint recorded; final 135-test regression, 33 invariants and 18 adapter checks pass. |

All commands below ran with cwd C:/Users/jkind/.agents/harness unless explicitly described otherwise. Runs that spawn children used approved execution outside the sandbox; the sandbox's initial EPERM did not count as a behavioral result.

| command | exit | outcome |
|---|---|---|
| Disposable-board Node stdin reproduction invoking canonical task.js move 01 closed --dry-run | 0 | Defect reproduced on raw-byte/folder/journal snapshot; fixture removed. |
| node scripts/task-plan-lint.js task_list/closed/01_fix_ordinary_task_transition_dry_run.md | 0 | Initially W1 plus expected W4; W1 fixed, plan reviewed, then clean ok before start. |
| node task-system/task.js review 01 PASS; node task-system/task.js start 01 | 0 each | Only this new task activated; no --take. |
| node --test --test-reporter=spec task-system/tests/test_dry_run.js (pre-fix) | 1 | 27 pass, 27 fail. red.log. |
| node --test --test-reporter=spec task-system/tests/test_dry_run.js (first corrected CLI) | 0 | 54 pass. green.log. |
| node --test --test-reporter=spec --test-name-pattern="fixture ignores inherited" task-system/tests/test_dry_run.js (before fixture env correction) | 1 | 0 pass, 1 fail; caller repository changed by external-index contamination. isolation-red.log. |
| node --test --test-reporter=spec task-system/tests/test_dry_run.js (final) | 0 | 55 pass, 0 fail. final-green.log. |
| node task-system/tests/test_harness_invariants.js (before and after CLI correction) | 0 each | 33 pass, 0 fail each. Post-fix invariants.log. Production CLI hash stayed identical through later test-only corrections. |
| node --check task-system/task.js; node --check task-system/tests/test_dry_run.js | 0 each | Syntax valid; final test file also parsed and ran in the final 55-test run. |
| node tools/render.cjs (after CLI/doc edit and after final test correction) | 0 each | Instruction SHA256 f53535ae45eb5e0549179f7b5d663fcc03b7befc3543af0dfd013f6831aafdd3; 64239 bytes; 50 agents. No instruction revision change. |
| git diff --check -- task-system/task.js README.md | 0 | No scoped whitespace defects. |
| git diff --no-index --check -- evidence/empty task-system/tests/test_dry_run.js | 1 | Expected no-index difference exit; no whitespace diagnostics. |
| git diff --check (whole dirty tree) | 1 | Pre-existing trailing whitespace in rules/coding-style.md:136; left unchanged as unrelated. |
| Baseline-vs-current unrelated tracked Git diff comparison | 0 | All 8 pre-existing unrelated diff blocks identical after excluding this task's README/CLI/journal changes. Both runtime task-system junctions resolve to canonical source. |

Preservation: pre-existing task.js commit-message edits remain byte-for-byte in the tested source. Other project boards, including mobile_depth_estimation_tracking's active task, were not changed. Canonical task 00 remains closed. No staging, committing or task-lock takeover was performed in the real checkout.

Evidence is local at C:/Users/jkind/AppData/Local/Temp/task-dryrun-evidence-I6MKLh: pre-edit source, unrelated diff baseline, review diffs and logs. Temporary logs are not a durable source checkpoint; the code and hashes above identify the verified local version. There is no claim of a committed release.

Test construction notes: the first external-index probe inherited Node's nested-test context and did not execute the selected cases. It was corrected by clearing NODE_TEST_CONTEXT and asserting the child reports exactly 2 tests before accepting RED/GREEN. Two guarded edit attempts refused an unexpected whitespace anchor without writing source; a repeat pre-fix run retained the same 27 failures in prefix-repeat.log. The applied CLI correction preserves existing mixed line endings and total line count.

Closure receipt: node task-system/task.js move 01 closed exited 0 and moved only this task. Post-close node task-system/task.js lint exited 0 (2 tasks, 0 errors, 0 warnings); node task-system/task.js current exited 0 and printed none. No active task remains in the canonical harness board. Other project boards were untouched.


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Closed. Source checkpoint recorded; final 135-test regression, 33 invariants and 18 adapter checks pass. Earlier no-commit and awaiting-checkpoint notes describe historical states.
