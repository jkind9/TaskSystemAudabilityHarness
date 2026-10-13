---
id: "01"
title: Compare stock, task-only and full on repository work and recovery
status: open
priority: HIGH
type: infra
blocked_by: ["02", "03", "04", "05", "06"]
plan_reviewed: 2026-10-12 PASS
files:
  - follow-up/study-002/**
docs:
  - follow-up/study-002/README.md
  - README.md
verification_test: follow-up/study-002/tools/selftest.cjs
baseline_metric:
  source: README.md completed study
  field: valid task-only matched comparisons
  baseline_value: "0 comparisons"
  target: ">=1 preserved matched block; report limits"
---
# Task 01

## Current state

- Last test: none run
- Next action: none on this record. It is the parent of the pilot tasks 02–06; work the next one in the sequence table in task_list/README.md. Close this record after task 06 decides whether the full Study 2 runs.
- Open decisions: none on this record (see tasks 05 and 06)
- Handoff note: split into 02–06 by Claude on 2026-10-12 after the owner chose the pilot design (1 FeatureBench task + 1 self-written two-session task, Luna only, about 25M token cap). Harness task 10 (harness commit df5c70d) fixed Codex ignoring refusals, a precondition this record listed as "native refusals are unproven".

## In plain English
Find out whether task tracking and the wider guidance improve real repository changes enough to cover their cost. Compare the same model with the normal runtime, a small task setup and the full shared setup. First verify that isolation and edit checks actually work. Preserve failed attempts and report when the evidence cannot support a conclusion.

## What
Create a separate study under follow-up/study-002. Reuse reviewed runner contracts and raw evidence conventions without modifying the first study. Validate three isolated configurations, direct native enforcement and real end/start recovery. Prefer audited public repository tasks with independent executable verifiers. Freeze inputs before paid measurement. Use Luna/high for workers and model reviewers.

## Why
The first cohort has 18/18 successes on three small specified contracts. It does not compare task-only or test substantial planning. Native refusals are unproven and shared memory crossed project boundaries. The owner requests an efficient evaluation that may justify keeping full, keeping only tasks, or removing custom guidance.

## How
| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Runner already journals attempts and aliases credentials with cleanup | tools/runner.cjs | old paid CLI cohort | tools/runner.cjs:273, tools/runner.cjs:295, tools/runner.cjs:345 |
| Frozen protocol verification exists but is specific to first cohort | tools/prepare.cjs | first runner | tools/prepare.cjs:120 |
| Shared dispatcher maps native edits and invokes configured gates | shared tools/dispatch.cjs | provider hook configuration | C:/Users/jkind/.agents/harness/tools/dispatch.cjs:10 |
| Task CLI supports checkpoints without broad skill guidance | task-system/task.js | task gates and task users | C:/Users/jkind/.agents/harness/task-system/task.js:487 |
| Installed summary matching can fall back to another project | session-start.js | full SessionStart hook | C:/Users/jkind/.agents/harness/scripts/hooks/session-start.js:186 |

- Review this plan before start. No global harness edits.
- Check local infrastructure and select lightweight public repository instances before investing in adapters or downloads.
- New owners are follow-up/study-002/tools/prepare.cjs (configuration copies, task inputs, private homes and frozen manifest), runner.cjs (attempt and process lifecycle, native session execution, evidence capture), grade.cjs (clean replay and independent verification), selftest.cjs (contracts). Old tools stay frozen and are not called to run this cohort.
- Full uses a non-hardlinked canonical harness copy per run. Remove only clone installation destinations before rendering. Route hooks to the private clone; isolate home-derived state through explicit clone-only path instrumentation and per-run temp/state paths. Record instrumented file hashes and verify no host summary or global audit is read/written. Native hook definitions require validated private trust, never a trust-bypass flag.
- Task-only has a dedicated short instruction file, narrow hook policy and task-state recovery. Native scope checks have a declared Edit/Write guarantee; explicitly probe shell writes and disclose any uncovered route. Do not silently add repaired enforcement to full.
- Continuation is a second genuine native exec process/thread using the same within-run repository and private state after clean session end. It is not the old recover function and not a replacement attempt. Interrupted processes remain retained incomplete attempts; verify all owned children exit before alias cleanup or another launch.
- Delegation support must be established before freeze. If native delegates can be pinned to Luna/high and all usage captured, enable them equally. Otherwise record unsupported delegation as an explicit limitation and include no claim about specialist delegation benefit.
- Establish stock/task-only/full private runtime homes and isolated hook state. Record any change needed for isolation as a treatment deviation; never silently repair full semantics.
- Validate native patch and shell-write dispositions against expected task state. Keep errors separate from policy refusal and record input plus actual resulting files.
- Freeze a small screening protocol and independent graders before measured tasks; calibrate starter and accepted patch. Expand only when the predeclared difficulty and infrastructure checks justify the cost.
- Exercise at least one real process end/start continuation, using each configuration's own durable artifacts and the same continuation request.
- Count all exposed Luna calls, fresh/cached/output usage, elapsed time, complete-task correctness, workflow compliance and recovery separately.
- Preserve raw events/transcripts, all failures, immutable inputs and deviations. Produce a plain-English report supporting or withholding a removal recommendation.

## Invariants and recovery
Existing boundary owners: tools/runner.cjs:263 (durable attempt and credential lifecycle), tools/runner.cjs:203 (native transcript capture), tools/prepare.cjs:136 (frozen input manifest), C:/Users/jkind/.agents/harness/scripts/lib/utils.js:38 (shared hook state root). The new cohort must preserve their contracts while replacing the unisolated state path.

| Producer/owner | Consumer | Representation | Survives restart? |
|---|---|---|---|
| Frozen study manifest | preparer, runner, grader | JSON with baseline, prompt, grader and executable SHA256 | yes, immutable after first measured attempt |
| Runner journal | orchestrator, recovery check | attempt ID, parent/child PID, phase, terminal disposition | yes; no replacement of attempted run |
| Native CLI | usage analysis and reviewer | original JSONL and native transcript; all exposed child threads retained | yes |
| Per-run private hook state | same run continuation only | private files under unique run identity | yes within run; never shared between runs |
| Existing auth file | transient private CLI alias | link outside published evidence; contents never logged | removed only after owned process tree and streams finish |

Source of truth: immutable manifest and native events; derived summaries never overwrite raw evidence. Child processes receive per-run configuration and scope. If the runner dies before PID capture, stop and inspect owned processes before cleanup. If it dies after capture, verify child exit before removing the credential alias or starting another run. Partial attempts remain failures/incomplete evidence under their original IDs. Fresh deployment is preparation, deterministic tests, reference calibration, native probes, input freeze, then sequential measured attempts. Backward compatibility: old tools, results, global configuration and real application project are read-only. No global settings restoration may overwrite concurrent work.

## Hyperparameters
| name | value | source |
|---|---|---|
| model | gpt-6-luna | confirmed 2026-10-12 explicit owner requirement Luna throughout |
| reasoning | high | inherited protocol.json:5 |
| service tier | default | inherited tools/prepare.cjs:76 |
| sandbox and approval | workspace-write with automatic approval review | inherited tools/runner.cjs:90 |
| configurations | stock, task-only, full | confirmed 2026-10-12 owner instruction to proceed with proposed comparison |
| initial scope | infrastructure probes then a small fixed repository-task screening cohort | n/a administrative staged design; exact manifest frozen before paid measurement |
| per-attempt timeout | 1,800,000 ms for the pilot | deviates from protocol.json:7, confirmed 2026-10-12 (see task 05) |
| isolation | unique per-run identity and state; same-run continuation retained | n/a validity invariant |
| delegation | off in all configs for the pilot | deviates from the earlier plan to enable it equally, confirmed 2026-10-12 (see task 05) |
| scheduling | sequential counterbalanced order, frozen before cohort | n/a prevents shared host races and selective ordering |

No unrecorded tunable defaults. Any measured-cohort caps, sampling and repair allowances must be written into the manifest before it is frozen.

## Verification
Contract test: follow-up/study-002/tools/selftest.cjs must reject attempted-run overwrite, changed frozen input and unsafe cleanup; distinguish execution error from refusal; require native session identity and known usage or explicit unknown. Reference calibration must fail the starter and pass the accepted solution on each scored task. Native probes must retain both recorded disposition and resulting file bytes. Before/after: 0 existing valid task-only matched blocks; target >=1 preserved block with independent grades and all three configurations, with no claim of population certainty. Check host settings/source hashes before and after. All evidence must remain inspectable under the requested folder.

## Receipts
| field | value |
|---|---|
| closing commit | still open because preparation, measurement and analysis are in progress |
| files changed | none yet; new cohort only |
| test | pending |
| before measurement | 0 task-only comparisons; previous cohort 18/18 passed |
| after measurement | pending |
| delta | pending |
| outcome | pending; never infer benefit from more documents or hook invocations |
## Plan review correction
Initial review FAIL identified old runner isolation, task-only preparation, continuation and delegation gaps. The How section now explicitly assigns new owners and clone instrumentation; none of these capabilities is claimed to exist in the old runner. Recovery must enumerate and verify owned descendants, not only the main PID, before cleanup. One matched block is only a screening/infrastructure target; no keep/remove population claim follows from it. Cohort-specific sampling, stopping and uncertainty are frozen before measurement.
