---
id: "06"
title: Analyse the pilot and size Study 2
status: pending_review
priority: MED
type: experiment
blocked_by: ["05"]
blocks: []
verification_test: follow-up/study-002/analysis/selftest.cjs
plan_reviewed: null
files:
  - follow-up/study-002/analysis/**
  - follow-up/study-002/README.md
  - README.md
  - FINDINGS.md
docs:
  - follow-up/study-002/README.md
  - README.md
baseline_metric:
  source: "Study 1 README.md"
  field: "owner outcomes with pilot evidence for stock, task-only and full"
  baseline_value: "1 of 6 outcomes measured (cost)"
  target: "6 of 6 reported per config with the pilot's limits stated; a written go/stop/resize recommendation for Study 2"
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 06 — Analyse the pilot and size Study 2

## Current state

- Last test: node --test follow-up/study-002/analysis/selftest.cjs -> exit 0 (3/3); node analysis/report.cjs pilot/measures.json analysis/pilot.json -> exit 0 (2026-10-12)
- Next action: owner reads FINDINGS.md "Summary so far" and "Recommendation for Study 2", then approves or changes the plan. If approved: file harness tasks for FINDINGS items 10, 2, 3 and 8 in C:/Users/jkind/.agents/harness/task_list, then build the lean task-only setup.
- Open decisions: none (owner chose the recommended plan, 2026-10-13; see Clarifications)
- Handoff note: Claude, 2026-10-12. Found the isolation leak after scoring (run folders inside the study tree; task.js walks up to the study's task_list). Evidence in follow-up/study-002/pilot/contamination/; FINDINGS.md updated as the source of truth (owner instruction).

## In plain English

Put the pilot's numbers side by side for the three setups: correctness, how well the second session picked up the work, how easy the result is to audit, how much mess it left, how plain the writing is, and what it cost. With only two tasks this cannot prove anything, so the main output is a recommendation: whether the full study is worth running, how many tasks it needs, and which setup to drop if the pilot already shows it is not worth its cost.

## Clarifications

### Session 2026-10-13

- Owner chose the recommended plan for the next run: fix the harness (FINDINGS items 10, 2, 3, 8), build the lean task-only harness from the study's findings, then run the resized Study 2 (stock vs lean on 6 tasks, full as reference on 2, about 40M session tokens) with the decision rule fixed in advance. The clean re-run of the four contaminated runs is skipped. The default is not switched to today's task-only; it waits for the lean result (owner, 2026-10-13).

## What

- `analysis/report.cjs`: reads graded and scored runs, writes `analysis/pilot.json` and a table per outcome per config, with matched differences (same task, different config).
- Update `follow-up/study-002/README.md` with results, limits and the recommendation; add a short pointer in the study root `README.md`.
- Recommendation covers: are the tasks hard enough (did any run fail a grader category)? Did anything in the setup break? Which outcomes differ enough between configs to be worth measuring at scale? How many tasks and repetitions Study 2 needs at the cost per run observed, within a budget the owner sets.

## Why

The owner's decision is keep / trim to task-only / remove. A pilot of 2 tasks cannot make that decision, but it can show whether a larger study could, and at what cost.

## How

**Reuse evidence**

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Matched-pair percentage change with observed range | tools/analyse.cjs `compare` | README.md tables | tools/analyse.cjs:9-13 |
| Decision and stopping rules already written | follow-up/README.md | this task | follow-up/README.md:105-111 |

Report per outcome: the value per run, the matched difference vs stock, and in words whether the difference is larger than the variation seen across the two tasks. No significance tests (n = 2). State unknowns as unknown.

## Hyperparameters

| name | value | source |
|---|---|---|
| comparison | matched by task; stock as reference | inherited tools/analyse.cjs method |
| summary statistic | per-run values and matched differences; no pooling claims | n/a pilot of 2 tasks |

## Invariants and recovery

invariants n/a: read-only analysis of frozen evidence; outputs are regenerated from evidence, never hand-edited.

## Verification

- `node follow-up/study-002/analysis/selftest.cjs`: matched differences computed correctly on a hand-made fixture; a missing measure shows as unknown, never 0.
- Every number in the README results table traces to `analysis/pilot.json`.
- Before/after: 1 of 6 outcomes measured → target 6 of 6 reported with limits.

## Receipts

| field | value |
|---|---|
| closing commit | no git repository in the study folder. SHA-256 (first 16 hex): analysis/report.cjs 7c3fe3a88de47d43, analysis/selftest.cjs e840242796b2a64b, analysis/pilot.json 678e5545d5893000, FINDINGS.md 9a868da4a5f58b7c |
| files changed | follow-up/study-002/analysis/{report.cjs, selftest.cjs, pilot.json}; follow-up/study-002/README.md sections "Analysis and recommendation", "Pilot run" (leak), "Disk"; README.md (pointer to FINDINGS.md); FINDINGS.md (results, leak, research, recommendation) |
| test | analysis/selftest.cjs 3/3 (red first: module missing) |
| before / after | owner outcomes with pilot evidence per setup: 1 of 6 -> 6 of 6 (correctness, recovery, auditability, debt, plain language, cost), each with its limits and contamination stated; written resize recommendation with a fixed decision rule |
| result | Recommendation: resize Study 2 (stock vs lean task-only, 6 tasks, about 40M tokens) after four cheap harness fixes; auditability is the robust benefit (+4 to +5.5 of 8) |

Notes / caveats / follow-ups:

- Every harness-setup number except auditability is indicative because of the isolation leak (restart runs seriously, public runs mildly affected).
- Plain-language measure sits at zero banned phrases for every setup (floor effect); replace it in the resized study.
