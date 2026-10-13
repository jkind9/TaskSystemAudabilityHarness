---
id: "07"
title: Set reviewer models explicitly and record per-task model and token totals
status: pending_review
priority: MED
type: infra
blocked_by: []
blocks: []
verification_test: task-system/tests/test_usage.js
plan_reviewed: null
files:
  - agents/plan-reviewer.md
  - agents/diff-reviewer.md
  - task-system/usage.js
  - task-system/tests/**
  - task-system/task.js  # journal "start <id>" so usage.js can find task windows
docs:
  - README.md
baseline_metric:
  source: "Claude transcripts for mobile_depth_estimation_tracking, 2026-10-08"
  field: "share of subagent messages on Opus; tasks with token totals in receipts"
  baseline_value: "475 of 475 subagent messages Opus (100%); 0 tasks with measured token totals"
  target: "general-purpose lookups off Opus; every task closed after this change has model and token totals with coverage stated"
created: 2026-10-08
last_updated: 2026-10-09
superseded_by: null
---

# Task 07 — Set reviewer models explicitly and record per-task model and token totals

## Current state

- Implementation exists; independent review completed on 2026-10-09.
- Awaiting checkpoint. Task09 final review passed; accounting coverage limits remain documented. Production cost improvement and complete per-task spend remain unmeasured; no model productivity claim is made.
- See Receipts and Task09 for regression findings and dispositions.

## In plain English

Every helper the assistant launches currently runs on the most expensive model, including simple searches, and nobody can say how many tokens a given piece of work cost. This task names a model for each kind of helper and adds a small script that totals the tokens and models used for a task from the session logs, so cost can be compared with results.

## What

- Add explicit `model:` to `agents/plan-reviewer.md` and `agents/diff-reviewer.md` (Opus; they guard HIGH work).
- Document in README that broad searches go to the built-in Explore agent or Sonnet, not general-purpose on Opus.
- New `task-system/usage.js <task-id>`: read Claude transcripts for the repo (main and `subagents/`), keep the last usage record per message ID, attribute messages to the task by the journal's start and move times, and print model counts, fresh input, cache reads, output and the share of messages it could not attribute.

## Why

On 2026-10-08 all 475 subagent messages ran on Opus (9 general-purpose, 5 plan reviewers, 4 diff reviewers), each starting from about 80,000 tokens. No task records what it cost, so no workflow change can be judged on cost against quality.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Reviewers declare no model and inherit the global one | agent frontmatter | Agent tool | agents/plan-reviewer.md:2; agents/diff-reviewer.md:2; C:/Users/jkind/.claude/settings.json:297 |
| Only code-reviewer names a model | agent frontmatter | Agent tool | agents/code-reviewer.md:5 |
| Task timing is in the journal | journal | audit | task-system/task.js:175 |
| No usage script exists | searched task-system/ and scripts/ for "usage" and "cache_read" | none | none found |

## Hyperparameters

hyperparameters n/a: tooling change, no experiment.

## Invariants and recovery

invariants n/a: read-only over transcripts; writes nothing but its own output.

## Verification

- **Contract test:** `task-system/tests/test_usage.js` on a fixture transcript with a repeated message ID, a subagent file and a message outside any task window asserts: duplicates counted once, subagent tokens included, the outside message reported as unattributed, totals equal hand-computed values.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | agents/plan-reviewer.md; agents/diff-reviewer.md; task-system/usage.js; task-system/task.js; task-system/tests/test_usage.js; README.md |
| test | Three original usage tests passed in independent 89-test run. Cross-project token contamination found by independent review is corrected and pinned in Task09. |
| before / after | Reviewer files carry explicit Claude models; usage computes journal-window message totals with duplicates and subagents handled. Codex token totals remain outside this tool coverage. |
| result | Source committed and regression tests pass. Pending complete parent/child accounting and actual per-task cost acceptance; current usage reports Claude-only coverage. |


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Source committed and regression tests pass. Pending complete parent/child accounting and actual per-task cost acceptance; current usage reports Claude-only coverage. Earlier no-commit and awaiting-checkpoint notes describe historical states.
