---
id: "11"
title: Let a session end after three consecutive completion-gate refusals
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: tools/validate.cjs
plan_reviewed: null
files:
  - tools/dispatch.cjs
  - tools/validate.cjs
docs:
  - README.md
baseline_metric:
  source: "Study 2 setup probe probes/enforce2 (Harness_Development/follow-up/study-002), 2026-10-12"
  field: "consecutive end-of-session refusals before a stuck session can end"
  baseline_value: "unbounded: 251 refusals, 12.1M tokens, ended only by the 10-minute timeout"
  target: "at most 3 refusals, then the session may end and the give-up is logged"
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 11 — Let a session end after three consecutive completion-gate refusals

## Current state

- Last test: node tools/validate.cjs -> exit 0 (pass, 20 checks); node --test task-system/tests/*.js -> 140/140 (re-run before commit, 2026-10-12)
- Next action: none; closed with commit 9640d8f.
- Open decisions: none

## In plain English

When a session tries to finish while its task record is incomplete, the harness refuses to let it end. If the assistant cannot or will not complete the record, the harness currently refuses forever, and the session burns time and money until something external stops it. After this change, the harness refuses at most three times in a row; on the fourth try it lets the session end and writes down that it gave up.

## What

`tools/dispatch.cjs`: for the Stop event, keep a per-session count of consecutive refusals in `state/stop-refusals/<hash of provider+session>.json`. A Stop that passes resets the count. A refused Stop with the count already at 3 is allowed instead: the count resets, the audit record gets `gaveUp: true`, and stderr notes that the gate gave up and why. Applies to both Claude and Codex.

## Why

A Study 2 probe (task-only setup, Codex gpt-6-luna) was told not to touch task records; the completion gate (`task-complete-gate`) then refused 251 consecutive Stops until the 10-minute timeout, using 12.1M tokens. Before harness task 10 Codex ignored Stop refusals, so the loop was invisible there; Claude has the same exposure. The gate itself does not read `stop_hook_active`.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Every hook refusal returns through one place | tools/dispatch.cjs `dispatch` | Claude and Codex adapters | tools/dispatch.cjs:203-206 |
| Refusal output per runtime (exit 2 for Claude, JSON block for Codex Stop) | tools/dispatch.cjs `refusal` | same | tools/dispatch.cjs:169-178 |
| Audit log of every event | tools/dispatch.cjs `audit` | Study 2 evidence, hook-runs.jsonl | tools/dispatch.cjs:165-169 |
| Completion gate has no loop guard | scripts/hooks/task-complete-gate.js | Stop | no `stop_hook_active` read (grep 2026-10-12) |
| Validator runs Stop for both runtimes with a fixed session id | tools/validate.cjs `run` | validate | tools/validate.cjs:15 |

The validator's fixed session id would make the new counter carry over between validator runs, so `run()` gets a per-fixture session id.

hyperparameters n/a: not an experiment (the limit of 3 was chosen by the owner).

## Invariants and recovery

| Concern | Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| Consecutive Stop refusals per session | dispatch.cjs (Stop path) | dispatch.cjs next Stop of the same session | `state/stop-refusals/<sha256(provider+session)>.json` `{count, updatedAt}` | yes; a later Stop that passes resets it |

- **Source of truth:** the per-session file; no session id → key on provider + cwd.
- **Concurrency:** one file per session, so parallel sessions never write the same file.
- **Failure after each transition:** if the process dies after counting but before replying, the next Stop sees one extra refusal, which only brings the give-up forward by one; never blocks a session for longer.
- **Backward compatibility:** first three refusals behave exactly as before; outputs unchanged except the fourth.

## Verification

- `node tools/validate.cjs`, new check: four consecutive Stops of one unfinished-task session refuse, refuse, refuse, then allow, for both Claude and Codex; a fifth starts a new count and refuses again. Red-first against the unchanged dispatcher (fourth Stop refuses).
- Live: re-run a forced-attempt probe like probes/enforce2 in Codex and an equivalent Claude Haiku session; target at most 3 refusals and the session ends.

## Receipts

| field | value |
|---|---|
| closing commit | 9640d8f (owner approved the commit 2026-10-12) |
| files changed | tools/dispatch.cjs (Stop refusal counter, give-up path, reset on pass), tools/validate.cjs (per-run session ids; new Stop cap check), README.md |
| test | red-first: the new validator check failed on the unchanged dispatcher (4th Stop refused). After: validate.cjs pass, 20 checks; task-system tests 140/140 |
| before / after | Codex stuck-session scenario (probes/enforce2 fixture and prompt): before 251 refusals, 12.1M tokens, ended by the 10-minute timeout; after 3 refusals, then gave up and ended, 149k tokens. Claude Haiku same scenario: refused once, then it edited the task file and the Stop passed (cap not reached) |
| result | the completion gate can no longer hold a session indefinitely, in either runtime |

Notes / caveats / follow-ups:

- Claude Haiku edited `task_list/` to satisfy the gate although the prompt forbade it: the gate's pressure overrode an explicit user instruction. A behavioural finding for Study 2, not a dispatcher defect.
- The task gate's single-file allowance (first code file needs no task) is unchanged and by design.
