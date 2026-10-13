---
id: "13"
title: Update FINDINGS with the lean harness as built: before and after examples, future improvements and tests
status: closed
priority: MED
type: decision
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
  - FINDINGS.md
docs:
  - FINDINGS.md
baseline_metric:
  source: ""
  field: ""
  baseline_value: ""
  target: ""
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 13 — Update FINDINGS with the lean harness as built

## Current state

- Last test: check by hand that each quoted block in the new section matches its source -> all match (tablib record count corrected from 4 to 3 during the check)
- Next action: none; task closed. Harness work continues in the harness board (tasks 21-23, then 20).
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Section "The lean harness as built (v2)" added after "Lean harness: built and probed"; header, summary and the old proposal section now point to it.

## Clarifications

### Owner request, 2026-10-13

- Update FINDINGS.md to describe the lean harness as it was actually implemented, with before and after on specific text examples and code blocks, plus suggested improvements and tests to consider in future. Then version the harness so the lean version becomes v2 (harness task 20).

## In plain English

The findings document describes the lighter harness as a plan. This task rewrites that part to describe what was actually built and tested, with real side-by-side examples of the old and new versions, and lists what to improve and test next.

## What

In FINDINGS.md, replace or follow "What the end result would look like" with "The lean harness as built (v2)":

- Before and after, using real text: the start-up instructions (full ~64 KB / task-only AGENTS.md vs core/AGENTS.md, 45 lines), the task template (140 lines, 8 sections vs 29 lines, 5 sections), one real task record from the pilot vs one from a lean run (e.g. tablib-lean done/ record), the end-of-session refusal (multi-line vs one line), the hook list (42 / 6 vs 5), and one end-of-session message from stock vs lean.
- Before and after on code where the study shows it: a duplicate block stock added (tablib or watson stock) that lean's finish would refuse; a file grown past 800 lines by stock vs kept by lean.
- What was proposed but not built (packs, skill pruning, archive) and what was built that was not proposed (git reader for the sandbox, UTF-8 fix, unreadable-folder handling).
- Suggested improvements from the study: task.js files add, the contradictory instruction, --checked must name a check that ran, rework or drop the prose check, time cost on FeatureBench tasks.
- Tests to consider: repeat runs of the six tasks for variance, an independent check of the new hidden tests, a Claude run of lean (only Codex was tested), a probe for the files-add gap, the full reference runs if funded.

## Why

The owner wants the findings to show concretely what changed and why, as the basis for releasing v2.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Proposed design | FINDINGS.md | this task | FINDINGS.md "What the end result would look like" |
| Built lean profile | harness core/, checks/, task-system/lean.js | Study 2 runner | C:/Users/jkind/.agents/harness/core/AGENTS.md:1 (commit ab8f166) |
| Run evidence | C:/tmp/study2-resized/results | measures | follow-up/study-002/resized/measures-checker-391fd95.json |

hyperparameters n/a: documentation.

invariants n/a: documentation.

## Verification

tests n/a: documentation only. Check: every example quoted in FINDINGS.md is copied from a real file or run (path given next to it), and the new section reads on its own.

## Receipts

| field | value |
|---|---|
| closing commit | n/a: the study folder has no git repository |
| files changed | FINDINGS.md (new section "The lean harness as built (v2)", about 230 lines; header, summary bullet, note on "What the end result would look like") |
| test | tests n/a: documentation. Doc-claim check: every quoted block traced to the file or run path named beside it; stop-gate claim checked against hook-runs-cumulative.jsonl (12 runs, all status 0) |
| before / after | before: FINDINGS described lean only as a proposal; after: it records what was built, with real before/after text, code and numbers |
| result | done |

Notes / caveats / follow-ups:

- The pilot task-only record quoted is from a run seriously contaminated by the isolation leak; the section says so.
- Follow-ups listed in the section (repeat runs, independent hidden-test check, Claude run of lean, prose check, FeatureBench time cost, full reference runs) are suggestions for the owner, not commitments of this task.
