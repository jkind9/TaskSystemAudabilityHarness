---
id: "24"
title: Record time and Claude tokens on each task at finish
status: closed
priority: MED
type: feature
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
  - task-system/lean.js
  - task-system/usage.js
  - task-system/tests/test_lean_flow.js
  - task-system/tests/test_usage.js
  - task-system/tests/test_lean_hooks.js
  - task-system/tests/test_lean_nospawn.js
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

# Task 24 — Record time and Claude tokens on each task at finish

## Current state

- Last test: env -u ECC_TASK_FLOW node --test task-system/tests/*.js -> exit 0 (198/198) at 9fe48fe in the installed folder; node tools/validate.cjs -> exit 0 (23 checks on the live install)
- Next action: none; tagged v2.1 and live (task-system/ is linked, no reinstall needed).
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner asked 2026-10-13 after v2 shipped: "where does token use and time get filled in on a task now?" Answer: nowhere. Owner then chose the recommended fix and asked that the repository's docs say what was done and why. Work happens in the worktree C:/Users/jkind/.agents/harness-v21-wip (branch wip-v2-1) so the live install is untouched until the checks pass.

## Clarifications

### Owner decisions, 2026-10-13

- Include the measurement in v2, done by code inside `finish` (no new model steps, no new instruction text), as recommended: time from begin to finish, plus Claude tokens where the transcripts can be read; Codex tokens reported as not measured.

## In plain English

Each finished piece of work should say how long it took and, where the assistant's own logs can be read, how many tokens it used, so the cost of the harness shows up in every record. The closing command works this out by itself from timestamps it already keeps, so the assistant does no extra work and the cost of measuring is a line of output.

## What

- `task-system/usage.js` `taskWindows`: also read the v2 journal lines: `begin <id>` opens a window, `finish <id>` closes it (today it reads only v1's `start` and `move`, so v2 tasks get no window). `report` skips transcript files last written before the task's first window, so a large transcript folder stays fast.
- `task-system/lean.js` `finish`: add one line to Checked: `- cost: <minutes> min from begin to finish; Claude tokens <total> (fresh input <n>, cache read <n>, output <n>; <k> session(s))`. With no Claude messages in the window it says `Claude tokens: none found (Codex sessions are not read)`; if the transcripts cannot be read it says `Claude tokens not measured: <reason>`.

## Why

v1 measured tokens only through a separate command (`usage.js <id>`) run by hand, and it reads only v1 journal lines, so since v2 shipped no task has a cost figure. The owner's goal for the harness is to show whether it pays for its token and time cost (memory: harness-evaluation-goal). Study 2 found the bill comes from steps, because each step re-sends the conversation (FINDINGS.md, "Study 2 pilot", point 1), so the measurement must not add a step or an instruction. Estimated cost inside `finish`: about 30-50 extra tokens of output read once or twice, under 0.5% of a session; about 3 seconds of run time over 533 MB of transcripts.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Windows come only from v1 journal verbs | task-system/usage.js `taskWindows` | `report`, test_usage.js | task-system/usage.js:42 |
| Token totals per window from Claude transcripts, repository-checked | task-system/usage.js `report` | usage.js CLI | task-system/usage.js:117 |
| v2 journal writes begin and finish lines with local timestamps | task-system/lean.js `journal` | usage.js | task-system/lean.js:34 |
| Checked section is built in one place | task-system/lean.js `checkedLines` | `finish` | task-system/lean.js:60 |

Plan: red tests first; then usage.js, then lean.js; README change log (v2.1) and lean-core section; tag v2.1; fast-forward main; reinstall is not needed (no instruction or hook change), but validate runs against the live install.

hyperparameters n/a: not an experiment.

invariants n/a: read-only measurement written into the task record; no new state.

## Verification

- `task-system/tests/test_usage.js` "v2 begin and finish lines make a window": a journal with `begin 07` and `finish 07` gives one window and counts only the messages inside it. Red-first.
- `task-system/tests/test_lean_flow.js` "finish records time and Claude tokens": with HOME and USERPROFILE pointed at a scratch home holding a transcript whose message falls after `begin` and whose cwd is the test repository, the done record's Checked has `- cost: <n> min from begin to finish; Claude tokens 1,110`; with no transcripts it says `none found (Codex sessions are not read)`. Red-first.
- Full suite and validate pass.

## Receipts

| field | value |
|---|---|
| closing commit | 9fe48fe (tagged v2.1). Owner asked for the change 2026-10-13. |
| files changed | task-system/lean.js, task-system/usage.js, task-system/tests/test_lean_flow.js, test_usage.js, test_lean_hooks.js, test_lean_nospawn.js (scratch home for every finish call), README.md (v2.1 change log entry, lean core, token totals) |
| test | task-system tests 198/198 (3 new, red-first: all 3 failed before the change); validate.cjs 23/23 on the live install; live run of the installed begin/finish in a throwaway repository wrote "- cost: 0 min from begin to finish; Claude tokens: none found (Codex sessions are not read)" in 0.5 s |
| before / after | v2 records: no time or token figure; usage.js found no window for any v2 task. After: every finished record has a cost line; usage.js reads begin/finish |
| result | done |

Notes / caveats / follow-ups:

- Codex tokens are not measured. Codex writes rollout files under ~/.codex/sessions; whether finish can read them from inside the Codex sandbox was not probed.
- Sessions are attributed by the repository their transcript started in: a Claude session started in another folder that edits this repository is not counted (usage.js rule since v1).
- Concurrent sessions in one repository are counted together; the line gives the session count.
