---
id: "05"
title: Run the pilot
status: pending_review
priority: HIGH
type: experiment
blocked_by: []
blocks: ["06"]
verification_test: follow-up/study-002/pilot/verify-pilot.cjs
plan_reviewed: 2026-10-12 PASS
files:
  - follow-up/study-002/protocol.json
  - follow-up/study-002/pilot/**
  - follow-up/study-002/pilot-b/**
  - follow-up/study-002/measures/**
  - follow-up/study-002/tools/prepare.cjs
  - follow-up/study-002/reviews/**
  - follow-up/study-002/budget.json
  - follow-up/study-002/results/**
  - follow-up/study-002/README.md
docs:
  - follow-up/study-002/README.md
baseline_metric:
  source: "Study 1 README.md Results"
  field: "matched runs of stock vs task-only vs full on multi-step work with working enforcement"
  baseline_value: "0 matched blocks"
  target: "2 matched blocks (one per pilot task), all sessions retained, within 25,000,000 total tokens"
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 05 — Run the pilot

## Current state

- Last test: node pilot/verify-pilot.cjs pilot/composition.json pilot/measures.json -> exit 0 (all sessions terminal, ledger matches every result; sessions 36,561,052 of 50M, reviews 558,783 of 4M), 2026-10-12
- Next action: owner review. Engineering is done; pending_review only because the study folder has no git repository, so the receipt is a hash list. Analysis continues in task 06.
- Open decisions: CLEAN RE-RUN (raised 2026-10-12 by Claude): four harness runs reached the study's own task board (see Notes). Re-run the four harness runs from folders outside the study tree with the same frozen inputs and harness commit (about 34M tokens; needs the session allowance raised from 50M to about 85M), or only the two seriously affected restart runs (about 15M; 13.4M left), or accept the pilot as indicative.
- Handoff note: Claude, 2026-10-12. All 9 sessions ran, all graded (restart graded at the end and after session 1), 21 blind reviews completed and parsed, all six measures scored. FeatureBench Docker image deleted after grading (C: 41 GB -> 97 GB free; no compaction needed). Results table in follow-up/study-002/README.md "Pilot run".

## Clarifications

### Session 2026-10-12

- Per-session timeout 30 minutes; restart task split as two requests with a clean session end; delegation off in all configs; proposed measurement details accepted (8-question audit form, 6-item debt rubric 0–2, duplicates = 6+ repeated lines, 1 blind review per run, 1 infrastructure retry per session only if no model thread started). Owner answers, 2026-10-12.

### Session 2026-10-12 (later)

- Budget: after restart-task-only-s1 used 5.0M tokens, the owner chose to raise the pilot session allowance to about 50M: freeze a second protocol for the remaining 5 runs with a 50M session allowance on the shared ledger (so all pilot sessions together stay under 50M) and 4M for reviews; same harness commit, tools, prompts and order (owner, via question, 2026-10-12).

## Clarifications log (operator)

- 2026-10-12 (Claude): blocked_by cleared. Tasks 02, 03 and 04 have their engineering done and verified; each sits in pending_review only because the study folder has no git repository to checkpoint. Added pilot/grade-pilot.cjs (runs the task 03 graders on every run), pilot/verify-pilot.cjs and reviews/** to this task's files. They live in pilot/, not tools/, because prepare.cjs freezes every tools/*.cjs and the runner refuses sessions and reviews if one changes; post-session scripts must stay fixable.
- 2026-10-12 (Claude): first prepare failed before freezing (no session, no manifest): the public prompt (35 KB) passed as a command-line argument to codex debug prompt-input exceeded the Windows 32 KB limit (ENAMETOOLONG). Fixed in tools/prepare.cjs (the static check sends the prompt's first 4,000 characters; it inspects only injected context). Partial run folders deleted; prepare re-run.
- 2026-10-12 (Claude): the first launch of public-task-only-s1 exited with an error before creating its session folder (no journal, no Codex process, no ledger entry), so under the runner's rules the id was never attempted. Only the end of the stack trace was kept; re-running the pre-launch checks by hand then passed (host snapshot, config, AGENTS.md, hooks, clean repo, order, slot). Relaunched with full output kept in pilot/public-task-only-s1.runner.log. Cause not established; a momentary host-file mismatch is the likeliest, unproven.
- 2026-10-12 (Claude): restart-full-s1 was launched with a shell `&` instead of a tracked background task; the runner and its Codex child kept running and finished normally (journal completed, lock released).

## What

- `follow-up/study-002/protocol.json`: tasks, configs, order, timeout, budget cap, model settings, prompts (by hash), harness copy commit.
- 9 Luna sessions: public task × 3 configs (1 session each) + restart task × 3 configs (2 sessions each).
- Then grading (task 03 graders) and scoring (task 04 measures, including blind reviews) on every run.

Order (fixed before any run). With 2 tasks and 3 configs full counterbalancing is impossible; the second task uses a rotated order, so no config holds the same position twice (task-only 1st then 3rd, stock 2nd then 1st, full 3rd then 2nd):

| # | Run | Sessions |
|---|---|---|
| 1 | restart / task-only | 1 then 2 |
| 2 | restart / stock | 1 then 2 |
| 3 | restart / full | 1 then 2 |
| 4 | public / stock | 1 |
| 5 | public / full | 1 |
| 6 | public / task-only | 1 |

Session 2 of a restart run starts only after session 1 of the same run ends. Runs go one at a time.

## Why

The owner needs evidence of benefit, not only cost. Study 1 had no working enforcement, no isolation and no task where a benefit could appear (task 01, Why). The pilot checks the new setup end to end at small cost before sizing Study 2.

## How

**Reuse evidence**

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Runner pattern refuses out-of-order runs and checks earlier runs exited | Study 1 tools/runner.cjs `assertPriorComplete` | task 02 runner | tools/runner.cjs:146-158 |
| Runner, isolation, budget ledger | task 02 tools | this task | task_list/open/02_build_the_isolated_pilot_runner.md (What) |
| Tasks and calibrated graders | task 03 | this task | task_list/open/03_build_and_calibrate_the_two_pilot_tasks.md (What) |
| Measures and blind review | task 04 | this task | task_list/open/04_define_the_value_measures_and_blind_review.md (What) |
| Counterbalanced fixed order, sequential runs | Study 1 protocol | analysis | protocol.json `runs`; README.md "All six condition-order permutations occur once" |

Rules during the run:
- Never re-run an attempted session id. A failed or timed-out session is a result. The frozen protocol lists one retry id (`<id>-retry1`) per session; the runner allows it only if the original session's result.json has `threadId: null` (the model never started). No retries for model failures.
- The 25M cap is split: pilot sessions may use up to 21M; 4M is held back for blind reviews and answer-key scoring (task 04). The runner refuses a session when the ledger total + the largest session so far would pass 21M; the remaining runs are recorded as not run. Setup probes from task 02 have their own pool and are reported separately (owner, 2026-10-12).
- If Codex reports a usage-window limit, stop; resume in the next window. Do not change any frozen input in between.
- Grading and blind review run after all sessions, so reviewers never see partial results.

## Hyperparameters

| name | value | source |
|---|---|---|
| model | gpt-6-luna | inherited protocol.json:4; owner confirmed Luna only 2026-10-12 |
| reasoning | high | inherited protocol.json:5 |
| configs | stock, task-only, full | confirmed 2026-10-12 (owner, task 01 Hyperparameters) |
| tasks | 1 public FeatureBench + 1 restart | confirmed 2026-10-12 (owner) |
| repetitions | 1 per task × config | confirmed 2026-10-12 (owner chose the option stating about 9 sessions) |
| budget cap | 25,000,000 total tokens incl. reviewers | confirmed 2026-10-12 (owner) |
| per-session timeout | 1,800,000 ms | deviates from protocol.json:7 because pilot tasks are larger, confirmed 2026-10-12 |
| restart split | two requests, clean end between | confirmed 2026-10-12 (owner) |
| delegation | off in all configs | deviates from task 01 How ("enable equally if supported") because delegate models and usage cannot yet be pinned, confirmed 2026-10-12 |
| sandbox / approvals | workspace-write, automatic review | inherited tools/runner.cjs:91-93 |
| service tier | default | inherited tools/prepare.cjs:81 |
| project doc size limit | 131072 bytes (so the 64 KB full instructions are not cut off) | inherited tools/prepare.cjs:82 |
| Windows sandbox | unelevated | inherited tools/prepare.cjs:84-85 |
| budget split | 21M pilot sessions, 4M reviews; setup probes counted separately (13.1M on 2026-10-12) | confirmed 2026-10-12 (owner) |
| harness clone | committed harness at a pinned SHA (906ce37 or later), rendered in the clone | n/a treatment definition; differs from the installed harness by its uncommitted skills/synced changes (task 02 step 1) |
| infrastructure retries | 1 per session, only if no model thread started | confirmed 2026-10-12 (owner accepted proposal) |

## Invariants and recovery

| Concern | Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| Frozen protocol | this task | runner, graders, analysis | protocol.json + the frozen manifest beside it (task 02) | yes; immutable after the first session starts |
| Session evidence | task 02 runner | task 04 measures, task 06 | per-session folder (events, transcript, result.json, hook log, private session-data) | yes; never overwritten |
| Budget ledger | task 02 `tools/budget.cjs`, called by the runner | this task's stop rule | follow-up/study-002/budget.json | yes |
| Run order position | protocol.json | runner | ordered list | yes; runner refuses an out-of-order run (pattern tools/runner.cjs:146) |

- **Source of truth:** frozen protocol and native events.
- **Failure mid-session:** follow task 02's recovery; the session is terminal and session 2 (if any) is recorded as not run with the reason.
- **Fresh deployment:** task 02 selftest → task 03 calibrate → task 04 selftest → prepare → sessions in order.
- **Backward compatibility:** host settings and Study 1 evidence unchanged (host snapshot check before and after every session).

## Verification

- `node follow-up/study-002/pilot/verify-pilot.cjs protocol.json results/measures.json` checks all of the following and exits 1 on any failure.
- Every planned session has a terminal journal state; host snapshot identical before and after each.
- `budget.json` total ≤ 25,000,000; its `session` and `probe` entries equal the usages in their result.json files, and its `review` entries equal the usages in task 04's stored reviewer results.
- Every run has a grade and a full set of task 04 measure outputs (or a recorded reason it could not be scored).
- Before/after: 0 matched blocks → target 2.

## Receipts

| field | value |
|---|---|
| closing commit | no git repository in the study folder. SHA-256 (first 16 hex): protocol.json 8c2a01568aea7b03, pilot-b/protocol.json 741f94f527c05603, results/frozen.json 323089372c8ea2da, pilot-b/results/frozen.json 7f482af4654c0870, pilot/composition.json 28a188f99386cfb2, pilot/measures.json a32c552eaf6dd1c5, pilot/grading.json 95ba9f141e01edc5, reviews/packets.json 82a246bd9bd705d3, reviews/answers.json 65809a2165bb9975, pilot/grade-pilot.cjs 4c09fb7e4898b349, pilot/verify-pilot.cjs 0acffad4df4f70a0. Harness clone pinned at 4650a11 |
| files changed | protocol.json, pilot-b/protocol.json, pilot/{composition.json, grade-pilot.cjs, verify-pilot.cjs, measures.json, grading.json, *.log}, results/** and pilot-b/results/** (evidence), reviews/** (packets, prompts, raw answers), tools/prepare.cjs (prompt-check length fix before freezing), measures/{evidence,blind,score}.cjs (composition support), README.md "Pilot run" |
| test | verify-pilot -> exit 0; measures selftest 21/21; tools selftest 15/15 |
| before / after | matched blocks of stock vs task-only vs full on multi-step work with working enforcement: 0 -> 2 (restart and public), all sessions retained, 37.1M tokens for sessions and reviews (within the owner-raised 54M) |
| result | Auditability: stock 2 and 1.5 of 8; task-only 6.5 and 6.5; full 6 and 7. Correct: restart stock pass, full pass, task-only fail (1 regression); public none resolved, target tests 66.7% / 88.1% / 96.3%. Tokens: restart 1.84M / 8.46M / 6.48M; public 0.70M / 9.18M / 9.89M |

Notes / caveats / follow-ups:

- Budget: the 21M rule would have run 4 of 9 sessions; the owner raised it to 50M (Clarifications). The second freeze is byte-identical in tools, inputs and profiles (checked).
- ISOLATION LEAK (found after scoring): run folders were inside the study folder; task.js and the task gate search upward for a task board, so four harness runs used the study's task_list/. restart-task-only s1 read study task 05 (pilot design and measures) and created task 07 with its plan in the study board; restart-full s1 read and adopted that plan; public-full saw task 07's title; public-task-only read task 07 and created task 08 (sandbox refused the first write, automatic approval allowed the retry). Stock runs unaffected. Evidence copies with hashes in follow-up/study-002/pilot/contamination/ (07 a2aa97c897b455a7, 08 7d505320bbf66180, CONSTITUTION 281d37308c6b160a); tasks 07 and 08 archived on the study board, the run-created CONSTITUTION.md and empty closed/ and stale/ folders removed from it.
- One run per setup per task: every difference could be chance. Task 06 sizes the follow-up study.
- Setup was visible to the blind reviewer in all four harness runs (task files), as planned; it answered "cannot tell" for both stock runs.
