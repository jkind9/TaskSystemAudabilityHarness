---
id: "12"
title: Analyse the resized Study 2 and decide on the lean harness
status: closed
priority: MED
type: decision
blocked_by: []
blocks: []
verification_test: follow-up/study-002/resized/selftest.cjs
plan_reviewed: null
files:
  - follow-up/study-002/resized/**
docs:
  - FINDINGS.md
  - follow-up/study-002/README.md
baseline_metric:
  source: ""
  field: ""
  baseline_value: ""
  target: ""
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 12 — Analyse the resized Study 2 and decide on the lean harness

## Current state

- Last test: node --test follow-up/study-002/resized/selftest.cjs -> exit 0 (3/3); node follow-up/study-002/resized/decide.cjs follow-up/study-002/resized/measures.json -> "lean becomes the recommended default"
- Next action: none on this record. The owner decides whether to install the lean profile as the default and whether to fund the two full reference runs (task 11).
- Open decisions: switch the installed default to lean (owner's call, per the 2026-10-13 decision not to switch before the result); fund or skip restart-full-s2 and public-full.
- Handoff note: Claude (Opus 5.5), 2026-10-13.

## Clarifications

### Owner decisions, 2026-10-13 (do not reopen)

- Decision rule: lean becomes the recommended default if its average audit score is at least 5 of 8, its correctness is lower than stock's on no more than one task, and it uses at most 2x stock's tokens; if audit holds but cost is over 3x, keep task tracking only for work that needs a record. Do not switch the installed default until the lean result is in.

## In plain English

This task applies the success rule written down before the trial to the trial's results, and records the outcome. The lean setup met all three conditions: its work was much easier to audit than the default's, it got the task right as often as the default (worse on one task, better on two), and it used 1.4 times the default's tokens. The recommendation is to make it the default, with a few fixes the trial showed it needs.

## What

`resized/decide.cjs` applied to `resized/measures.json` (12 main runs), written to `resized/decision.json`. Results written to FINDINGS.md ("Resized Study 2: result" and the summary) and follow-up/study-002/README.md.

## Why

FINDINGS.md "Recommendation for Study 2"; owner approval 2026-10-13.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Rule and definitions fixed before results | task 11 Clarifications | this task | task_list/pending_review/11_run_the_resized_study_2_stock_and_lean_on_six_task.md (Clarifications) |
| Scored runs | resized/measures.json from measures/score.cjs | decide.cjs | follow-up/study-002/measures/score.cjs:63 |

hyperparameters n/a: analysis of a finished run (settings in task 11).

invariants n/a: read-only analysis.

## Verification

`resized/selftest.cjs`: the rule's boundaries (5 of 8 and 2x inclusive), "lower than stock" when both fail, and each failing branch. Result: audit 5.92 (met), 1 task lower (met), 1.42x tokens (met).

## Receipts

| field | value |
|---|---|
| closing commit | n/a: the study folder has no git repository |
| files changed | resized/decision.json; FINDINGS.md; follow-up/study-002/README.md; task_list/README.md |
| test | resized/selftest.cjs 3/3 |
| before / after | pilot task-only: 4.6x and 13x stock tokens, audit 6.5 vs 1.5-2; lean: 1.42x stock tokens over six tasks, audit 5.92 vs 3.58 |
| result | lean meets the pre-set rule: recommended as the default, with fixes (task.js files add, require a real check in --checked, rework the prose check) |

Notes / caveats / follow-ups:

- One run per setup per task; the auditor can tell lean runs from their records; the new two-session tasks' hidden tests were written by the reference's author.
- The prose-pattern measure found nothing in 19 sessions, like the banned-phrase count in the pilot.
