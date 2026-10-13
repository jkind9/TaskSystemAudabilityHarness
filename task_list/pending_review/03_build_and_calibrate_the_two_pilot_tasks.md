---
id: "03"
title: Build and calibrate the two pilot tasks
status: pending_review
priority: HIGH
type: experiment
blocked_by: []
blocks: ["05"]
verification_test: follow-up/study-002/tasks/calibrate.cjs
plan_reviewed: 2026-10-12 PASS
files:
  - follow-up/study-002/tasks/**
  - follow-up/study-002/README.md
docs:
  - follow-up/study-002/README.md
  - follow-up/study-002/tasks/restart/prompt-1.md
  - follow-up/study-002/tasks/restart/prompt-2.md
  - follow-up/study-002/tasks/public/prompt.md
  - follow-up/study-002/tasks/public/prompt.original.md
baseline_metric:
  source: "Study 1 README.md Results table"
  field: "share of runs that failed the independent grader"
  baseline_value: "0 of 18 runs failed (all tasks at the correctness ceiling)"
  target: "each pilot task's starter fails and reference passes its grader; difficulty unknown until task 05"
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 03 — Build and calibrate the two pilot tasks

## Current state

- Last test: node follow-up/study-002/tasks/calibrate.cjs -> exit 0 (public calibration from saved result; --public re-runs it in Docker)
- Next action: none on this task (pending_review only because closing needs a git checkpoint and the study folder has no git repository). Next in sequence: task 02 (runner), which must follow the two runner requirements listed in follow-up/study-002/README.md.
- Open decisions: none
- Handoff note: built and calibrated by Claude, 2026-10-12. The FeatureBench grader runs in WSL Ubuntu (it needs Linux); its Docker image uses 27.9 GB, delete after the pilot (owner).

## In plain English

The pilot needs two coding jobs. One comes from a public benchmark, so results can be compared with the field and graded by someone else's tests. The other is a multi-step change we write ourselves in a small real project; it is split across two sessions, so we can see whether each setup picks up the work correctly after a break. For each job we check that the grader fails the untouched code and passes a known-good solution before any paid run.

## Clarifications

### Session 2026-10-12

- Task mix: one public FeatureBench task plus one self-written multi-step task with a session break (owner chose the recommended option).
- Budget: stop the pilot at about 25M total tokens (owner).
- Runtime: Luna only (owner).
- Restart split: two requests with a clean session end between (owner).
- Public image: every FeatureBench fast-split image is 10.18-18.28 GB compressed, so the 6 GB rule excluded all. Owner chose to pull the smallest (pypa/packaging, instance 0 in dataset order), check free space before and after, delete it after the pilot and compact Docker's disk if needed (2026-10-12).

## What

Under `follow-up/study-002/tasks/`:

1. `public/` — one FeatureBench fast-split instance: repo URL and base commit, the problem statement used verbatim as the prompt, Docker image name and digest, grading command, and a script that applies a run's diff to a clean checkout inside the container and returns pass/fail per test.
2. `restart/` — one self-written task in a small real open-source repository: frozen repo commit, a two-part request (`prompt-1.md`, `prompt-2.md`), hidden grader tests kept outside the run repo, our reference solution, and an answer key of the decisions session 1 should leave behind (for task 04's recovery measures).
3. `calibrate.cjs` — for each task: grader on the starter must fail; grader on the reference must pass; grader must reject at least 3 deliberately broken variants (pattern from Study 1, README "Graders are outside submitted repositories").

## Why

Study 1's three tasks were fully specified small functions; every run passed, leaving no room for the harness to help (follow-up/README.md, "What the first study can tell us"). The owner's questions are about planning, auditability, technical debt and plain language on harder work, which needs a multi-step change and a session break.

## How

**Reuse evidence**

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Graders live outside the run repo and are calibrated against reference and broken variants | Study 1 experiments/<task>/grade.cjs and selftest.cjs | tools/evaluate.cjs | experiments/medium/selftest.cjs:7-11 (reference and mutants graded); experiments/medium/grade.cjs:15 |
| FeatureBench is the first public candidate for feature-level work | follow-up/README.md | this plan | follow-up/README.md "Public datasets worth using" (FeatureBench row) |
| Nothing comparable: no two-session task exists | searched experiments/ and follow-up/ for restart/continuation tasks | — | protocol.json:9 tasks are easy, medium, hard, all single-session |

**Public task selection rules** (apply in order, record every rejected candidate and why):
1. FeatureBench dataset version pinned (record version and commit of the dataset repo).
2. Python or JavaScript repository; the smallest fast-split Docker image (see Clarifications: all are 10 GB or more).
3. The reference patch touches at least 3 files.
4. Starter fails and reference passes when we run the official grading in Docker on this machine.
5. Pick the first candidate that passes, in dataset order. Do not pick based on how any configuration performs.

**Self-written restart task rules:**
1. A small, permissively licensed JavaScript or Python repo (about 2k–15k lines, existing test suite that runs offline in under 2 minutes). Freeze the commit.
2. The change must cross a producer and its consumers and need backward compatibility. Example shape: change a stored or exchanged data format, migrate old data, update every reader, keep the old format readable.
3. `prompt-1.md`: "Plan the whole change and complete part 1 (the producer side and migration). Stop when part 1 is done; another session will finish the rest." `prompt-2.md`: "Finish the change requested earlier: <same full request>. A previous session did part 1." Both prompts are plain issue-style requests: no test-first instructions, no file lists, no hints about task tracking.
4. Hidden grader categories: part 1 behaviour, part 2 behaviour, backward compatibility, untouched-behaviour regressions.
5. Answer key: the 3–6 decisions part 1 forces (for example, version field name, migration trigger) so task 04 can check whether session 2 kept them.

## Hyperparameters

| name | value | source |
|---|---|---|
| number of pilot tasks | 2 (1 public + 1 restart) | confirmed 2026-10-12 (owner) |
| public dataset | FeatureBench, fast split, pinned version | confirmed 2026-10-12 (owner chose the mixed option naming FeatureBench) |
| public image size cap | smallest fast-split image only (pypa/packaging, 10.18 GB compressed) | deviates from the planned 6 GB limit because every fast-split image is 10.18-18.28 GB, confirmed 2026-10-12 |
| restart split | two requests, clean session end between | confirmed 2026-10-12 (owner) |
| broken variants per task | at least 3 | inherited Study 1 calibration (README.md "13 deliberately broken variants" across 3 tasks) |

## Invariants and recovery

invariants n/a: builds static, frozen task inputs and graders; no running state. The grader must never be copied into a run repository, and reference solutions must never be reachable from a run's HOME, CODEX_HOME or repo.

## Verification

- `node follow-up/study-002/tasks/calibrate.cjs` exits 0 only when, for both tasks: starter fails at least one category in every group, reference passes all, each broken variant fails at least one category.
- Docker image digest and dataset version recorded; second calibration run gives identical results.
- Before/after: Study 1 had 0 of 18 failures. Target: calibrated graders exist; the actual Luna failure rate is measured in task 05.

## Receipts

| field | value |
|---|---|
| closing commit | n/a: the study folder has no Git repository; inputs are pinned by SHA-256 in follow-up/study-002/tasks/manifest.sha256 |
| files changed | follow-up/study-002/tasks/** (public: instance.json, prompt.md, prompt.original.md, baseline.bundle, grade.cjs, calibrate.cjs, wheels/, private/; restart: baseline.bundle, prompt-1.md, prompt-2.md, grade.cjs, calibrate.cjs, wheels/, private/), follow-up/study-002/README.md |
| test | node follow-up/study-002/tasks/calibrate.cjs exit 0: restart 6 of 6 variants as expected; public 5 of 5 (run in Docker via WSL, saved 2026-10-12T17:22Z) |
| before / after | Study 1: 0 of 18 runs failed a grader (no room to show a benefit). After: both pilot graders fail the starter, pass the reference (restart 248/248 tests; public resolved, 100% target tests) and reject every broken variant (restart 4 of 4; public 3 of 3, including one that passes 99% of target tests). Luna's real failure rate is measured in task 05 |
| result | two calibrated pilot tasks ready; selection by dataset order (public) and by fixed rules (restart), before any run |

Notes / caveats / follow-ups:

- Public prompt: six /testbed container paths replaced with repository-relative wording; original kept as prompt.original.md.
- Public image size rule changed with the owner's approval (all fast-split images are 10.18-18.28 GB compressed); C: went from 61 GB to 44 GB free.
- Runner requirements found during calibration (passed to task 02): clone run repos with core.autocrlf=false; build each run's Python environment offline from tasks/<task>/wheels/.
- The restart task's hidden tests were written by the same assistant that wrote the reference; an independent check of requirement-to-test agreement is a follow-up for Study 2.
