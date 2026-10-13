---
id: "11"
title: "Run the resized Study 2: stock and lean on six tasks, full on two"
status: pending_review
priority: MED
type: experiment
blocked_by: []
blocks: ["12"]
verification_test: follow-up/study-002/measures/selftest.cjs
plan_reviewed: null
files:
  - follow-up/study-002/measures/**
  - follow-up/study-002/resized/**
docs:
  - follow-up/study-002/README.md
  - FINDINGS.md
baseline_metric:
  source: "FINDINGS.md, Study 2 pilot"
  field: "harness setup tokens against stock; audit score"
  baseline_value: "task-only 4.6x and 13x stock tokens; audit 6.5 of 8 (stock 1.5-2)"
  target: "lean: audit >= 5 of 8 on average, correctness below stock on at most 1 task, tokens <= 2x stock"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 11 — Run the resized Study 2

## Current state

- Last test: node follow-up/study-002/resized/verify.cjs C:/tmp/study2-resized/protocol.json -> exit 0 (no problems); measures/selftest.cjs 25/25; resized/selftest.cjs 3/3
- Next action: owner decides on the two full reference runs (see Open decisions); task 12 writes up the result.
- Prepared 2026-10-13: 28 run folders (14 runs + spares); prompt checks passed (lean 17,988-19,703 characters, stock 14,864-16,578, full 101,353-102,830); 65 GB free on C:.
- Open decisions: the full reference runs. restart-full-s1 ran (8,579,151 tokens); restart-full-s2 was refused by the budget check (sessions used 72,751,812 + largest-session estimate 9,894,982 > cap 76,561,052), and public-full has not started. Options for the owner: raise the session allowance by about 15-20M to finish both, or skip them (runner skip, reason recorded). The stock-vs-lean comparison does not depend on them.
- Handoff note: Claude (Opus 5.5), 2026-10-13. Protocol written by resized/make-protocol.cjs and prepared; sessions started.

## Clarifications

### Owner decisions, 2026-10-13 (do not reopen)

- Stock and lean on all 6 tasks; full on the 2 pilot tasks as a reference; one run each; a balanced, fixed order.
- gpt-6-luna, high reasoning, 30-minute session timeout, delegation off; never --dangerously-bypass-hook-trust.
- Budget: 40M session tokens and 4M for reviews, as new entries on the shared ledger (follow-up/study-002/budget.json), keeping the pilot's entries. If a step would go over budget, stop and ask.
- Never re-run a session id; a failed session is data. Then grade, run the blind reviews, score and verify, as in the pilot.
- Run folders sit outside any folder tree with a task board (C:/tmp/study2-resized/; checked by tools/isolation.cjs at prepare and at every launch).

### Decision rule, fixed before any run (from FINDINGS.md, "Recommendation for Study 2")

Lean becomes the recommended default if (a) its average audit score is at least 5 of 8, (b) its correctness is lower than stock's on no more than one task, and (c) it uses at most 2x stock's tokens (total over the six tasks). If the audit score holds but cost is over 3x stock, keep task tracking only for work that needs a record. Also reported against stock: prose patterns per 1,000 words, duplicate blocks, complexity share, over-long files.

Definitions, written 2026-10-13 after the first session started and before any session finished or any result was seen:
- Correctness on a task is the whole-task pass. Lean is "lower than stock" on a task when stock passes and lean does not; when both fail, when lean's partial score is lower: grader groups passed (two-session tasks, out of 4) or the target-test pass rate (FeatureBench tasks). A session that failed or timed out counts as its graded end state.
- Audit score: the blind auditor's score out of 8 (correct + half of partial), averaged over the six lean runs; a missing score is reported, not counted as 0.
- Tokens: the sum over all sessions of the six lean runs divided by the same sum for the six stock runs (fresh, cached and output tokens, as the ledger counts them). Per-task ratios are reported too.
- Prose patterns per 1,000 words: the end-of-session messages (measures/plain_language.cjs, messages); docs and task records reported separately.

## In plain English

This task runs the trial: the same AI model does six programming tasks once with no custom setup and once with the new lean setup, plus the old full setup on two of them for comparison. Each result is then checked by hidden tests, read by a separate reviewer who does not know which setup produced it, and scored for cost, record quality and code and writing quality. The rule for what counts as success was written down before the first run.

## What

- `resized/make-protocol.cjs` writes `C:/tmp/study2-resized/protocol.json`: 14 runs, 21 sessions, harness commit ab8f166. Order: restart (stock, lean), tablib (lean, stock), fastapi (stock, lean), watson (lean, stock), mlflow (stock, lean), public (lean, stock), then restart-full and public-full.
- `measures/grade_runs.cjs`: grades every run with the six calibrated graders (two-session: final repository and session 1's end state; FeatureBench: final diff through fb eval, one task's image at a time).
- Scoring generalised to six tasks and the lean setup: correctness reads a grade by its shape; decision points come from each task's own file (recovery packets and scores); blind packets scrub "lean"; the right setup guess for lean is "task tracking only".

## Why

FINDINGS.md "Recommendation for Study 2" and the owner's approval of 13 October 2026.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Runner, order and ledger rules | tools/runner.cjs | this task | follow-up/study-002/tools/runner.cjs:59 (assertOrder), :209 (budget.assertRoom) |
| Delegation off for every session | tools/runner.cjs exec arguments | Codex | follow-up/study-002/tools/runner.cjs:123 |
| Pilot grading pattern | pilot/grade-pilot.cjs | pilot | follow-up/study-002/pilot/grade-pilot.cjs:34 |
| Blind packets and reviews | measures/blind.cjs | runner review mode | follow-up/study-002/measures/blind.cjs:105 |
| Scoring | measures/score.cjs | analysis/report.cjs | follow-up/study-002/measures/score.cjs:63 |

## Hyperparameters

| name | value | source |
|---|---|---|
| model | gpt-6-luna | confirmed 2026-10-13 (owner) |
| reasoning | high | confirmed 2026-10-13 (owner) |
| session timeout | 1,800,000 ms (30 min) | confirmed 2026-10-13 (owner) |
| delegation | off (--disable multi_agent) | confirmed 2026-10-13 (owner); follow-up/study-002/tools/runner.cjs:123 |
| runs per setup per task | 1 | confirmed 2026-10-13 (owner) |
| setups | stock and lean on 6 tasks; full on restart and public | confirmed 2026-10-13 (owner) |
| harness commit | ab8f166a90442095faf6990f0d2c5bff43210e4e | task 09 receipts (pinned after harness tasks 17-18) |
| session budget | 40,000,000 new tokens (cap 76,561,052 on the shared ledger) | confirmed 2026-10-13 (owner) |
| review budget | 4,000,000 new tokens (cap 4,558,783) | confirmed 2026-10-13 (owner) |
| first review estimate | 400,000 tokens | inherited protocol.json (pilot) |
| spare folder per run | yes (session-1 retry only when no model thread started) | inherited tools/prepare.cjs:102 |
| run order | interleaved tasks, alternating stock/lean first, full last | resized/make-protocol.cjs (balanced as asked, confirmed 2026-10-13) |

## Invariants and recovery

invariants n/a for new state: the runner's journal, lock, ledger and recovery commands (tools/runner.cjs run|skip|recover) are unchanged from the pilot. A failed or timed-out session stays as data; only a session that never started a model thread may be retried into its spare folder.

## Verification

- `node --test follow-up/study-002/measures/selftest.cjs` (25) and `tools/selftest.cjs` (18).
- Every session accounted for (ledger matches results), as pilot/verify-pilot.cjs did for the pilot.

## Receipts

| field | value |
|---|---|
| closing commit | n/a: the study folder has no git repository |
| files changed | measures/{grade_runs.cjs (new), correctness.cjs, recovery.cjs, blind.cjs, score.cjs (--checks-commit), selftest.cjs}; resized/{make-protocol.cjs, run-all.cjs, main-runs.json, decide.cjs, selftest.cjs, verify.cjs, measures.json, measures-checker-391fd95.json, decision.json, verify.json}. Evidence: C:/tmp/study2-resized/ (protocol.json, results/, reviews/, grading.json, run-all.log, fb-grading.log) |
| test | verify.cjs: 19 sessions ran (36,190,760 tokens), 2 not started (budget), every ledger entry matches its session, 42 reviews (958,988 tokens), 12 main runs graded; measures 25/25; resized 3/3 |
| before / after | pilot task-only 4.6x and 13x stock tokens -> lean 1.42x stock over six tasks; audit: stock 3.58, lean 5.92 of 8 (average) |
| result | decision rule met on all three criteria: lean becomes the recommended default (resized/decision.json) |

Notes / caveats / follow-ups:

- 2026-10-13 13:52 UTC: the driver stopped before public-lean-s1 because the runner found the recorded child PID of tablib-lean-s1 (539548) alive. A minute later no process held that PID; tablib-lean-s1 had completed normally. Windows reuses PIDs, so a short-lived process briefly held it. public-lean-s1 was refused before it started (no journal, no session folder), so it was launched by restarting the driver; this is not a re-run.

- Budget stop: restart-full-s2 refused by the budget check; public-full not started. Owner decision pending (move back to open or close after it).
- Complexity share was re-scored with harness 391fd95 (task 19 fixed a UTF-8 bug that left 3 of 12 shares empty); the runs themselves used ab8f166. measures.json keeps the first scoring.
- PID reuse stopped the driver once (see above); no session was re-run.
- The pip download cache had grown to 48 GB from the wheel downloads; purged during grading, when free space fell to 19 GB.
