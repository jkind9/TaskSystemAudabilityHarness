---
id: "04"
title: Judge each hook write by its own repository and fix documentation hook false positives
status: pending_review
priority: HIGH
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_hook_scope.js
plan_reviewed: null
files:
  - scripts/hooks/task-gate.js
  - tools/dispatch.cjs
  - task-system/tests/**
docs:
  - README.md
baseline_metric:
  source: "Claude re-check session in mobile_depth_estimation_tracking, 2026-10-08"
  field: "wrong hook decisions observed in one session"
  baseline_value: "4 (1 scratch-file write blocked by another repo's task; 2 read-only shell commands blocked; 1 owner-requested report edit blocked)"
  target: "0 on the same inputs; real Markdown writes by redirect, tee or cp still blocked outside allowed paths"
created: 2026-10-08
last_updated: 2026-10-09
superseded_by: null
---

# Task 04 — Judge each hook write by its own repository and fix documentation hook false positives

## Current state

- Implementation exists; independent review completed on 2026-10-09.
- Awaiting checkpoint. Task09 final regression and reviews passed; fresh Claude verification remains quota-blocked. Original implementation has no preserved pre-start review stamp.
- See Receipts and Task09 for regression findings and dispositions.

## In plain English

The safety checks that run before each file write sometimes look at the wrong project, and the documentation check blocks harmless read commands and even reports the owner asked for. That pushes the assistant to work around the checks. This task makes each check look at the project the file actually belongs to, recognise real writes only, and allow documents the owner has explicitly asked for.

## What

1. Task gate: find the Git repository from the target file's folder (`git -C <dir>`), not the process working folder. Pass files outside any repository and files under the system temp folder. Count dirty code files only in the target's repository. Read that repository's board.
2. Shell documentation rule: block only when a redirect (`>`, `>>`) or `tee` target is itself a `.md` or `.txt` path outside the allowed list. Ignore `2>/dev/null`, `2>&1` and paths that are only read. Also catch `cp`/`mv`/`Copy-Item` to such a path.
3. Edit documentation rule: also allow paths listed under `docs_allow:` in the active task's frontmatter, so an owner-requested report can be created and amended in the open.

## Why

In one session on 2026-10-08 these hooks made four wrong calls (see baseline) and missed none of the writes they were meant to stop only because none were attempted by other means. The audit report itself could only be amended by a script, which is the behaviour these rules are meant to discourage.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Gate resolves the repo from the process folder | task-gate | PreToolUse dispatch | scripts/hooks/task-gate.js:24; scripts/hooks/task-gate.js:35 |
| Out-of-repo target keeps its absolute path and joins the dirty set | task-gate | single-file escape | scripts/hooks/task-gate.js:36; scripts/hooks/task-gate.js:47-48 |
| Boards are read relative to the process folder | task-gate | active-task lookup | scripts/hooks/task-gate.js:51-55 |
| Shell documentation regex | dispatch builtin | Bash and Codex shell calls | tools/dispatch.cjs:27 |
| Edit documentation allow-list | dispatch builtin | Write, Edit, apply_patch | tools/dispatch.cjs:39-42 |

Write the failing cases first: an out-of-repo scratch `.js` with another repo's task active; `sha256sum README.md; echo x 2>&1`; `grep -n x a.md 2>/dev/null`; an owner-listed report path; and must-still-block cases (`cat > notes.md`, `echo x | tee notes.md`, `cp a notes.md`).

## Hyperparameters

hyperparameters n/a: hook logic change, no experiment.

## Invariants and recovery

| Concern | Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| Hook decision | tools/dispatch.cjs:27; tools/dispatch.cjs:42; scripts/hooks/task-gate.js:31 | Claude and Codex runtimes via generated/claude-hooks.json:27 | exit code 0 or 2 plus stderr | per call, stateless |
| Active task and its file list | task frontmatter in the target repo's board, read at scripts/hooks/task-gate.js:51-65 | task-gate match at scripts/hooks/task-gate.js:63 | `status: in_progress`, `files:` globs | yes |

- **Source of truth:** the board in the target file's repository.
- **Failure:** hooks are stateless; a crash should fail closed only for files inside a repository with a board, and open for scratch files.
- **Backward compatibility:** writes inside the session's own repository must behave exactly as today. Run `test_harness_invariants.js` and a Codex `apply_patch` probe.

## Verification

- **Contract test:** `task-system/tests/test_hook_scope.js` feeds recorded hook inputs to `dispatch.cjs` and asserts exit codes for every case above, red first against current source.
- **Before/after:** the four wrong decisions in the baseline become correct; the three must-block cases still exit 2.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | scripts/hooks/task-gate.js; tools/dispatch.cjs; task-system/tests/test_hook_scope.js; README.md |
| test | Hook-scope suite passed within independent 89-test run. Quote parsing and combined redirect gaps found by independent review are fixed and tested in Task09. |
| before / after | Cross-repository file ownership, scratch writes, requested docs and ordinary read/write shell decisions exercised in disposable repositories. |
| result | Source committed and disposable hook regressions pass. Pending a fresh native write/blocked-write probe through the installed assistant tooling; full Claude native propagation also remains tracked in Task09. The original missing pre-start review stamp remains a historical gap. |


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Source committed and disposable hook regressions pass. Pending a fresh native write/blocked-write probe through the installed assistant tooling; full Claude native propagation also remains tracked in Task09. The original missing pre-start review stamp remains a historical gap. Earlier no-commit and awaiting-checkpoint notes describe historical states.
