---
id: "00"
title: Measure the shared harness across small coding experiments
status: pending_review
priority: MED
plan_reviewed: 2026-10-12 PASS
type: infra
files:
  - tools/**
  - experiments/**
  - protocol.json
  - results/**
  - private/**
  - archives/**
docs:
  - README.md
---
# Task 00

## In plain English
Compare the same model solving small problems with increasing difficulty. Define the problems and scoring before the runs, then measure code correctness, workflow behavior and token usage with the installed instructions and hooks switched on or off.

## What
Create three dedicated JavaScript fixtures, independent graders and mutation checks, an isolated runner, a frozen protocol and reproducible analysis. All measured coding sessions use gpt-6-luna with high reasoning and have delegation disabled. Separate study preparation and review subagents also use Luna/high; their usage is excluded from the experimental session totals. The orchestrating chat model is fixed by its runtime and excluded from measured tokens.

## Why
The earlier single-pair pilot showed more input tokens and equal correctness but cannot separate instruction effects from hook effects or generalize across tasks.

## How
| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| A reviewed runner already isolates native CLI sessions and preserves usage | previous pilot run.cjs | study runner | C:/Users/jkind/AppData/Local/Temp/harness-paired-86889d94c4eb4c449e435851c0f8290d/run.cjs:117 |
| The shared dispatcher records hook execution | dispatch.cjs audit | native lifecycle hooks | C:/Users/jkind/.agents/harness/tools/dispatch.cjs:167 |

- Freeze contracts and graders before model execution; validate graders with correct references and broken variants.
- Use control, instructions-only and full conditions with identical baseline repositories, prompts, Luna/high and permissions.
- Counterbalance condition order by task/repetition; retain every attempted run, no selective replacement.
- Record usage, correctness, file changes, task state, hook execution, command and edit activity, and failures.
- Analyse paired effects by task and repeat; disclose small-sample and task-selection limits.

## Invariants and recovery
The protocol, graders and baseline hashes are immutable once execution begins. Credentials stay in private application runtime homes outside this project, with aliases removed after process/stream completion. Durable journals prevent run overwrite; PID checks govern interrupted-run cleanup. Runs stay sequential because full hooks can append shared audit/session state. Original configuration and harness source bytes are checked, never silently restored over concurrent work. Raw evidence survives failed or timed-out model runs. No writes to the real application project or harness source are part of the experiment.

## Hyperparameters
| name | value | source |
|---|---|---|
| model | gpt-6-luna | confirmed 2026-10-12 user request: Luna throughout |
| reasoning | high | inherited prior pilot protocol.json:4 |
| service tier | default | inherited prior pilot run.cjs:31 |
| project document limit | 131072 bytes | inherited prior pilot run.cjs:31 |
| sandbox | workspace-write, Windows unelevated | inherited prior pilot run.cjs:31 and arm-a-result.json context |
| approval | automatic review (--approve-for-me); native on-request policy | inherited prior pilot run.cjs:131 and arm-a-result.json context |
| repetitions | 2 per task/condition | n/a bounded descriptive pilot; proposed scope adopted after optional scope question and stated assumption |
| task levels | 3 | confirmed 2026-10-12 user request: easy to hard |
| conditions | control, instructions, full | n/a ablation design separates rules/catalog from hooks |
| schedule | all 6 condition permutations once | n/a exact counterbalance across 6 task/repetition blocks; protocol.json runs |
| delegates | 0 per measured run | n/a single-agent treatment equally applied |
| attempt timeout | 720000 ms | n/a administrative bound, not a quality target |
| grader categories | easy 26, medium 29, hard 20 | n/a fixed public-contract coverage before paid execution; private/calibration.json |

No learned parameters are tuned. Deterministic case values are fixtures, not model-training hyperparameters.

## Verification
All graders reject their baseline and known broken implementations and accept the reference. Verify prompt isolation, equal baseline hashes, equal contexts and usage accounting. Run deterministic analysis self-checks and independent code review before measured execution. Target 18 preserved attempted runs unless user selects smaller scope. Report full-task success separately from assertion counts; exclude unexposed guardian usage and setup from primary token comparisons.

## Receipts
| field | value |
|---|---|
| closing commit | n/a: no outer Git repository or outer commit requested |
| files changed | protocol, experiment fixtures/graders, tools, raw results, private review/validation artifacts, README and task record |
| test | 18/18 Luna sessions and submitted suites pass; 450/450 contract categories; 13/13 known mutants detected; runner/analysis self-tests PASS; final evidence validation 519/519 |
| before / after | before: one task / one paired pilot; after: 3 tasks x 3 conditions x 2 repetitions = 18 retained completions |
| result | Engineering complete. Named follow-up: owner review of exploratory conclusions before selecting a harness change. No correctness gain observed; full/control median paired total tokens +185.4%, fresh input +150.8%, seconds +52.1%. |


### Pre-launch cohort failure
All 18 initial CLI launches rejected the incompatible --approve-for-me / --sandbox combination before starting a model thread. Logs, old protocol and old tools are preserved in archives/prelaunch-001. This is infrastructure failure, not measured model correctness. The v2 cohort uses the same tasks, graders, prompts, order and Luna settings with the invalid explicit sandbox flag removed. The orchestrator now stops on the first missing model thread. No paid completion was discarded or replaced.


## Current state
All 18 v2 measurements, independent grading, supplementary observations, blinded review and final analysis are complete. Frozen runners, graders and protocol are unchanged. UTF-8 summary normalization preserves raw and earlier enriched bytes. All private runtime setting changes are exact own-repository trust additions; host source/configuration hashes match. No model completion was repeated or repaired.

Next action: owner reviews README conclusions and chooses a future experiment. No further engineering is required for this study.

Last check: node private/validate.cjs — exit 0, 519 checks passed. node tools/analyse.cjs and python private/plot_results.py regenerate descriptive outputs.


## Owner review follow-up, 2026-10-12
The owner questioned task difficulty, optional task use, omitted planning and whether the bulk of the harness should be removed. The read-only assessment in follow-up/README.md documents those limits, current benchmark candidates, task-only dependencies and proposed decision criteria. No further cohort was launched and no global configuration changed. The empirical choice between stock, task-only and full remains outstanding. The task stays pending_review for that decision; the completed cohort and frozen tools remain unchanged.
