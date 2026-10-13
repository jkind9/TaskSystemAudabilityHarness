---
id: "23"
title: Make finish --checked name a check that ran
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
  - task-system/lean.js
  - core/AGENTS.md
  - task-system/tests/test_lean_flow.js
  - task-system/tests/test_lean_hooks.js
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

# Task 23 — Make finish --checked name a check that ran

## Current state

- Last test: node --test task-system/tests/*.js -> 194/194; node tools/validate.cjs -> exit 0 (23 checks)
- Next action: none; closed with commit fabc699.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Gap (c) from the resized Study 2; owner decision 2026-10-13: "finish --checked must name a check that ran, or say plainly that no test exists; 'not run' alone is refused once with the exact command to use."

## In plain English

When the assistant closes a piece of work it must say how it checked the work. In the study it could write "tests not run" and the record was accepted, so some records say nothing was checked. Now closing asks for a check that actually ran, or a plain statement that no test exists. If it gets neither, it refuses once and shows the exact command to use; a second try goes through and the record says plainly that no check was named.

## What

`task-system/lean.js` `finish`: before the end-of-task checks, judge `--checked`.
- Accepted: it starts with "no test exists" (a reason may follow); or at least one `;`-separated part reads `<command> -> <result>` (or `→`) where the command is not none/n/a/nothing and the result does not say not run, did not run, skipped, not executed, or could not run/start.
- Otherwise: refuse with one message naming `finish --checked "<command you ran> -> <result>"` and `--checked "no test exists: <why>"`, and journal `finish-unchecked <id>`. If the journal already holds that line for this task, accept and write the Checked line as `<text>` followed by "(no check named; accepted after one refusal)".
- `core/AGENTS.md`: name the "no test exists: <why>" form beside the finish command.

## Why

Resized Study 2: lean records accepted "tests not run" (restart-lean session 1: `git diff --check -> passed; tests not run`; public-lean Left over: "pytest was not run"). Lean ran tests in 4 of 9 sessions. FINDINGS.md "Resized Study 2: result", point 4.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| finish validates only that --checked is present | task-system/lean.js `finish` | task.js finish | task-system/lean.js:85 (commit 83f52ef) |
| Journal per board | task-system/lean.js `journal` | begin, finish, files add | task-system/lean.js:36 |
| Refuse-once pattern used elsewhere | lean-stop-gate.js + dispatcher STOP_REFUSAL_LIMIT | Stop hook | scripts/hooks/lean-stop-gate.js:1 |

Existing tests that pass "none -> nothing" as a check move to the "no test exists" form or a real command.

hyperparameters n/a: not an experiment.

invariants n/a: one journal line per refusal on the project's own board; no other state.

## Verification

`task-system/tests/test_lean_flow.js`:
- "finish refuses a check that did not run, once, naming the command": `--checked "tests not run"` and `--checked "pytest -> not run"` exit non-zero, stderr names `finish --checked "<command you ran> -> <result>"` and `no test exists`, task stays open; the same call again exits 0 and Checked reads "(no check named; accepted after one refusal)".
- "finish accepts a check that ran or a plain no-test statement": `"git diff --check -> passed; tests not run"` and `"no test exists: config only"` both exit 0 on the first try.
- Red-first: the refusal test fails before the change.

## Receipts

| field | value |
|---|---|
| closing commit | fabc699 (owner approved committing once validate and tests pass, 2026-10-13) |
| files changed | task-system/lean.js, core/AGENTS.md (49 lines), task-system/tests/test_lean_flow.js, task-system/tests/test_lean_hooks.js (placeholder "none -> nothing" checks moved to "no test exists: example task"), README.md |
| test | task-system tests 194/194 (2 new, red-first: the refusal test failed before the change); validate.cjs pass, 23 checks |
| before / after | the 11 lean records from the resized Study 2, judged by the new rule: before, all 11 accepted; after, 1 refused once ("not run -> awaiting YAML tests", tablib-lean 01), 10 accepted |
| result | done |

Notes / caveats / follow-ups:

- The rule follows the owner's wording: any check that ran counts. 7 of the 11 study records named only `git diff --check`, `py_compile` or `compileall`, and still pass. Whether to require a test command (or "no test exists") is an open question for the owner, recorded in task 20.
- Found while checking real strings: "not run" in the command position (`not run -> awaiting YAML tests`) slipped through the first version; both sides are now judged, and the test covers it.
