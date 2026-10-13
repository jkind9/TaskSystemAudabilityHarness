---
id: "09"
title: Add the lean setup and new measures to the Study 2 tooling
status: closed
priority: MED
type: infra
blocked_by: []
blocks: ["10", "11", "12"]
verification_test: follow-up/study-002/tools/selftest.cjs
plan_reviewed: null
files:
  - follow-up/study-002/tools/**
  - follow-up/study-002/measures/**
  - follow-up/study-002/probes/**
docs:
  - follow-up/study-002/README.md
  - FINDINGS.md
baseline_metric:
  source: "follow-up/study-002/tools/environment.cjs, measures/plain_language.cjs (pilot)"
  field: "setups the runner can build; plain-language measure range in the pilot"
  baseline_value: "3 setups (stock, task-only, full); banned phrases 0 per 1,000 words for all 9 sessions"
  target: "4 setups incl. lean with prompt checks; a prose measure that is not zero everywhere; complexity share reported; a probe that refuses a board above a run"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 09 — Add the lean setup and new measures to the Study 2 tooling

## Current state

- Last test: node --test follow-up/study-002/tools/selftest.cjs follow-up/study-002/measures/selftest.cjs -> exit 0 (40/40); probe set 3 (C:/tmp/study2-resized/probes3) -> 3/3 completed, host unchanged
- Next action: none on this record; task 10 chooses and calibrates the six study tasks.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Lean profile is harness commit 41e931c (harness tasks 12-16).

## Clarifications

### Owner decisions, 2026-10-13 (do not reopen)

- Build the lean harness, then run a resized Study 2: stock against lean, full only as a reference.
- Skip the clean re-run of the four contaminated pilot runs; `C:/tmp/study2-clean` stays unused.
- Do not switch the installed default until the lean result is in.
- gpt-6-luna, high reasoning, for every session and review; delegation off; never `--dangerously-bypass-hook-trust`.
- Run folders sit outside any folder tree that has a task board.

## In plain English

The study's runner can build three setups: no custom setup, task tracking only, and the full harness. This task teaches it to build the new lean setup, adds a check that refuses to start if any folder above a run holds a task board (the leak found in the pilot), and changes two measures. The plain-English measure becomes the new prose pattern check, because the old word count was zero for everyone. The code measure gains the share of complexity held in very branchy functions.

## What

- `tools/environment.cjs`: config `lean`. The run's harness clone gets its own `core/policy.json` copied over `policy.json` before rendering; the Codex home gets the clone's `core/AGENTS.md`.
- `tools/prepare.cjs`: prompt checks gain `leanProfile` (text of `core/AGENTS.md` present) and a character count; lean must be under 25,000 characters and show no other profile, skills or session summary. `buildRun` refuses a run folder with a task board above it.
- `tools/isolation.cjs` (new): `boardsAbove(dir)` lists every `task_list/` or `docs/tasks/` in the folders above a run folder; `runner.cjs` checks it again before each session.
- `measures/harness_checks.cjs` (new): exports the harness's `checks/` and word list at the pinned commit into a temporary folder and loads them, so measures use the exact checker the lean setup ran.
- `measures/plain_language.cjs`: banned-phrase count replaced by prose pattern hits per 1,000 words (with a breakdown by pattern); Flesch and sentence length kept.
- `measures/debt.cjs`: adds complexity share before (baseline) and after for the touched Python and JavaScript files.
- `measures/score.cjs`: loads the checks once per pinned commit; expected setup guess for lean is "task tracking only".

## Why

FINDINGS.md "Recommendation for Study 2" items 3 and 5 and "The isolation leak": the setup probes did not check for task boards above the repositories; the banned-phrase measure sat at zero for every setup and could not separate them.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Setups are built in one place | tools/environment.cjs `cloneHarness`, `writeCodexHome` | prepare.cjs `buildRun` | follow-up/study-002/tools/environment.cjs:20,59 |
| Prompt checks and per-setup expectations | tools/prepare.cjs `promptCheck`, `expectedChecks` | buildRun | follow-up/study-002/tools/prepare.cjs:33,45 |
| Session launch | tools/runner.cjs | study sessions | follow-up/study-002/tools/runner.cjs:207 |
| Word list read from the pinned harness commit | measures/plain_language.cjs `loadWordList` | score.cjs | follow-up/study-002/measures/plain_language.cjs:13 |
| Duplicate-block and long-file measures | measures/debt.cjs `scriptMeasures` | score.cjs | follow-up/study-002/measures/debt.cjs:55 |
| Prose and complexity checkers | harness checks/prose.cjs, checks/complexity.cjs | lean task.js finish | C:/Users/jkind/.agents/harness/checks/run.cjs:11-13 (commit 41e931c) |

hyperparameters n/a: tooling, not a run. The run settings are fixed in task 11's protocol.

invariants n/a: no state crosses a process boundary beyond what the runner already records; the frozen manifest records the new prompt checks.

## Verification

- `node --test follow-up/study-002/tools/selftest.cjs`: lean config builds a Codex home whose AGENTS.md equals the clone's core/AGENTS.md and a clone whose policy.json equals core/policy.json; `expectedChecks('lean')` requires leanProfile and no other profile; `boardsAbove` finds a board two folders up and returns none for a clean path; `buildRun`'s guard refuses such a folder.
- `node --test follow-up/study-002/measures/selftest.cjs`: prose measure counts a contrast pattern and a banned word, skips quoted text; complexity share on a known diff; the checks load from the pinned commit with a hash.
- Probes (stock and lean) on the probe fixture before any study session, run folders under `C:/tmp/study2-resized/`.

## Receipts

| field | value |
|---|---|
| closing commit | n/a: the study folder has no git repository |
| files changed | tools/environment.cjs (lean config), tools/prepare.cjs (leanProfile check, 25,000-character limit, board-above guard), tools/isolation.cjs (new), tools/runner.cjs (board-above guard at launch), tools/selftest.cjs (+3 tests), measures/harness_checks.cjs (new), measures/plain_language.cjs (prose patterns replace banned phrases), measures/debt.cjs (complexity share), measures/score.cjs and measures/dryrun.cjs (load the pinned checker; lean's expected guess), measures/selftest.cjs (+3 net tests), probes/make-lean-fixture.cjs, probes/lean-fixture.bundle, probes/prompt-lean.md, follow-up/study-002/README.md, FINDINGS.md |
| test | tools 18/18, measures 22/22 (red first: 3 tooling and 5 measure tests failed before the change); analysis 3/3 |
| before / after | setups: 3 -> 4 (lean); lean prompt 15,889 characters (limit 25,000; stock 12,761); plain-language measure: banned phrases (0 everywhere in the pilot) -> prose patterns; complexity share added; board-above guard: none -> refuses at prepare and at launch |
| result | the runner builds and probes lean at harness ab8f166; probes found 3 harness problems, fixed in harness tasks 17 and 18 before any study session |

Notes / caveats / follow-ups:

- Probe pool this session: 1,033,211 tokens over 7 sessions (2 more skipped as superseded). Ledger probes total 14,157,134.
- The new measures need a harness commit with checks/ (021a95b or later); they cannot re-score the pilot at 4650a11.
- In probe sets 2 and 3 the lean gate probe still read lean.js, because its fixture has an old-style open task the lean instructions do not describe; study repositories start with no board.
- The lean flow fixture has no .gitignore, so its record lists Python cache files; the study repositories ignore them.
