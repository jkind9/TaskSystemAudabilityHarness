---
id: "10"
title: Choose and calibrate the six tasks for the resized study
status: closed
priority: MED
type: infra
blocked_by: []
blocks: ["11"]
verification_test: follow-up/study-002/tasks/calibrate.cjs
plan_reviewed: null
files:
  - follow-up/study-002/tasks/**
docs:
  - follow-up/study-002/README.md
  - FINDINGS.md
baseline_metric:
  source: "follow-up/study-002/tasks/ (pilot)"
  field: "calibrated tasks"
  baseline_value: "2 (restart, public)"
  target: "6: the 2 pilot tasks, 2 new two-session tasks, 2 new FeatureBench instances, each grader calibrated"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 10 — Choose and calibrate the six tasks for the resized study

## Current state

- Last test: node follow-up/study-002/tasks/calibrate.cjs -> exit 0 ("all 6 graders calibrated"); node follow-up/study-002/tasks/manifest.cjs --check -> exit 0 (359 inputs unchanged)
- Next action: none on this record; task 11 writes the protocol and runs the study.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Selection rules below were written before any study session and before looking at any candidate's code; only the FeatureBench index, repository and setup lists had been read.

## Clarifications

### Owner decisions, 2026-10-13 (do not reopen)

- Six tasks: the two pilot tasks, 2 new two-session tasks (small MIT-licensed Python repositories, built and calibrated like tasks/restart) and 2 new FeatureBench instances (next in the fast split's dataset order meeting task 03's rules).
- Calibrate every grader: the starting state fails, the reference passes, and broken variants fail.
- FeatureBench images are about 28 GB each: check free disk space first and delete each image after its grading.

## Selection rules (fixed 2026-10-13, before any run)

**FeatureBench, 2 new instances.** Task 03's rules, applied in order:
1. Same pins as the pilot: dataset LiberCoders/FeatureBench v1.1, revision 76b4a4566e04f4bcc13c35125d4f301791efa736, fast split; FeatureBench tool commit 8d4e347ec57546685c5a87e8676bf575db022ea6.
2. Walk the fast split in dataset order from index 1 (index 0 is the pilot's packaging task).
3. Accept an instance when its repository is Python or JavaScript, its reference patch touches at least 3 files, and official grading in Docker on this machine gives: empty patch not resolved, reference resolved, and every "drop one reference file" variant not resolved. With more than 3 files, the drop variants are the first 3 files in patch order (bounds calibration time; not a selection criterion).
4. Take the first two accepted instances. Never look at how any setup performs.
5. Disk: check free space before each pull; one image at a time; delete each image after calibration, and pull again for grading the runs.
6. Prompt: the problem statement with its `/testbed` paths reworded as repository-relative, as in the pilot. The run's offline environment is built from wheels for the instance's `pip_packages` and install command; a package with no Windows wheel is recorded as a limitation, not a reason to skip the instance.

**Two-session tasks, 2 new.** Task 03's restart rules:
1. Candidate pool, fixed now and examined in this order: tablib, td-watson, then python-box, schedule. Chosen by me for licence, size and having a stored or exchanged data format, before looking at their code.
2. Accept a candidate when: MIT licence; about 2k-15k lines of source; its own test suite runs offline on Windows in under 2 minutes; it has a stored or exchanged data format written in one place and read in at least two others.
3. The change crosses the producer and its consumers and needs backward compatibility (a format version, old data still readable), split into part 1 and part 2 like tasks/restart. `prompt-1.md` asks to plan the whole change and do part 1, then stop; `prompt-2.md` asks to finish it. Both carry the same request text, no test or file hints, no mention of task tracking.
4. Hidden grader groups: part 1, part 2, backward compatibility, and the repository's own tests as regression. At least 3 broken variants. An answer key of 3-6 decisions part 1 forces, for the recovery review.
5. Take the first two accepted candidates.

## In plain English

The study needs six programming tasks that are fixed before any trial runs: the two from the pilot, two new tasks split across two sessions, and two new tasks from a public benchmark. This task picks them by rules written down first, builds each one's grader, and checks every grader fails the untouched starting code, passes a correct solution, and fails deliberately broken solutions.

## What

Under `follow-up/study-002/tasks/`: two new two-session task folders shaped like `restart/` (baseline bundle, prompts, `grade.cjs`, `calibrate.cjs`, `wheels/`, `private/` with reference, hidden tests, broken variants, decision points) and two new FeatureBench folders shaped like `public/` (instance.json, prompt, baseline bundle, grade.cjs, calibrate.cjs, wheels/, private/). `tasks/calibrate.cjs` covers all six; `tasks/manifest.sha256` hashes every input.

## Why

FINDINGS.md "Recommendation for Study 2": two pilot tasks cannot carry a decision; six fixed in advance can, at about 40M tokens.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Two-session task shape and grader | tasks/restart (grade.cjs, calibrate.cjs, private/) | runner protocols, task 05 grading | follow-up/study-002/tasks/restart/grade.cjs:1 |
| FeatureBench grading through `fb eval` in WSL | tasks/public/grade.cjs | task 05 grading | follow-up/study-002/tasks/public/grade.cjs:24 |
| Calibration for all tasks | tasks/calibrate.cjs | task 03 receipts | follow-up/study-002/tasks/calibrate.cjs:1 |
| Offline run environment from wheels | tools/environment.cjs `buildVenv` | prepare.cjs | follow-up/study-002/tools/environment.cjs:119 |

hyperparameters n/a: task inputs; the run settings are fixed in task 11's protocol.

invariants n/a: static, frozen inputs. Nothing under `private/` may reach a run's repository, home or prompt.

## Verification

`node follow-up/study-002/tasks/calibrate.cjs` exits 0 with every task's starter failing, reference passing and every broken variant failing (FeatureBench variants graded in Docker, then the image deleted).

## Receipts

| field | value |
|---|---|
| closing commit | n/a: the study folder has no git repository; inputs pinned in tasks/manifest.sha256 |
| files changed | tasks/tablib/** and tasks/watson/** (request, prompts, baseline.bundle, grade.cjs, wheels, private/{reference.patch, grader/, mutants/, decision-points.json}); tasks/fastapi/** and tasks/mlflow/** (instance.json, prompt.original.md, prompt.md, baseline.bundle, private/{mask,test,reference-solution}.patch, image-pip-freeze.txt, run-requirements.json, wheels, calibration.json); tasks/two_session.cjs, tasks/fb.cjs, tasks/calibrate.cjs (six tasks), tasks/manifest.cjs, tasks/manifest-resized.sha256; follow-up/study-002/README.md; FINDINGS.md |
| test | calibrate.cjs: all 6 graders calibrated. tablib: starter part1 0/18, part2 1/9, compat 2/5, regression 176/176; reference all pass; 5/5 broken variants fail a group. watson: starter part1 2/8, part2 0/8, compat 3/4, regression 335/335; reference all pass; 5/5 broken variants fail. fastapi and mlflow (Docker, fb eval): starter not resolved, reference resolved (100% target tests), 3/3 drop-one-file variants not resolved |
| before / after | calibrated tasks: 2 -> 6 |
| result | six tasks chosen by rules fixed before any run, each grader calibrated, inputs hashed |

Notes / caveats / follow-ups:

- Candidates examined: tablib (accepted), td-watson (accepted); python-box and schedule not examined. FeatureBench index 1 (fastapi) and 2 (mlflow test_client) accepted; none skipped.
- watson regression leaves out test_push, which fails at the baseline on Windows (two frames share one clock tick), and 4 tests asserting the old file layout or export columns; tablib leaves out 7 layout tests. Each is listed with its reason in the task's grade.cjs.
- The hidden tests for tablib and watson were written by the same assistant that wrote the references, as for the restart task in the pilot; an independent check of requirement-to-test agreement is still open.
- FeatureBench run environments use the image's package versions on Python 3.12 (the images use 3.10 and 3.11); the CUDA PyTorch stack and uvloop are left out (run-requirements.json says why).
- Both FeatureBench images were deleted after calibration; Docker's disk file did not shrink (C: 93 GB -> 73 GB free). Grading the runs needs both pulled again.
