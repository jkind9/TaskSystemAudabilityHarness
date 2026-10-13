# Study 2 pilot: does a working harness help on harder, multi-step work?

Study 1 found that the shared harness added a median 185% total tokens and 52% elapsed time with no correctness gain, on three small, fully specified tasks. Its gates also never stopped anything in Codex, so it never tested a working harness. This pilot runs Luna (gpt-6-luna, high reasoning) on two harder tasks under three setups: **stock** (no custom setup), **task-only** (the task-tracking system alone) and **full** (the whole shared harness). It measures correctness, how well a second session picks up the work, auditability, technical debt, plain language and cost.

The pilot checks that the setup works and that the tasks are hard enough. Two tasks cannot decide whether to keep the harness; task 06 decides whether a larger Study 2 is worth running.

The work is tracked as tasks 02–06 in [`../../task_list/`](../../task_list/README.md), which also explains how Claude and GPT hand the work to each other.

## Status

| Part | Task | State |
|---|---|---|
| Pilot tasks and graders | 03 | built and calibrated (12 October 2026) |
| Isolated runner | 02 | built and probed (12 October 2026); pending review |
| Value measures | 04 | built and dry-run on Study 1 (12 October 2026); pending review |
| Pilot run | 05 | done 12 October 2026: 9 sessions, graded, 21 blind reviews; pending review |
| Analysis | 06 | done 12 October 2026: recommendation below; pending review |
| Lean setup, isolation check and new measures | 09 | built and probed 13 October 2026; see "Resized study: tooling" |
| Six tasks chosen and calibrated | 10 | done 13 October 2026 |
| Resized study run (12 main runs; full reference cut by budget) | 11 | done 13 October 2026; pending review (owner decision on the full runs) |
| Analysis and decision | 12 | done 13 October 2026: lean meets the rule |

## The two pilot tasks (`tasks/`)

Inputs are hashed in `tasks/manifest.sha256`. Everything under a `private/` folder (reference solutions, broken variants, hidden tests) must never be copied into a run's repository, home folder or prompt.

### Public task: FeatureBench, `pypa/packaging` metadata

- **Instance:** `pypa__packaging.013f3b03.test_metadata.e00b5801.lv1`, the first instance of the FeatureBench v1.1 fast split (dataset revision `76b4a456…`, tool commit `8d4e347e…`). It was chosen by dataset order before any run, not by how a setup performs. Details are in `tasks/public/instance.json`.
- **Starting repository:** `tasks/public/baseline.bundle`. It was rebuilt with FeatureBench's own preparation steps inside its Docker image: copy the project, apply the mask that removes the implementation, delete the target test file, clear bytecode, then start a fresh git repository.
- **Prompt:** `tasks/public/prompt.md`. This is FeatureBench's problem statement (`prompt.original.md`) with its six `/testbed` container paths replaced by repository-relative wording, because our runs work in a Windows clone, not inside the container.
- **Grader:** `node tasks/public/grade.cjs <label> <diff-file>`. It runs FeatureBench's own `fb eval` in WSL Ubuntu, against the Docker image `libercoders/featurebench-specs_packaging-instance_c393a6a8` (27.9 GB unpacked), because the tool needs Linux. It reports whether the task was resolved and the pass rate of the target tests.
- **Calibration:**

  | Variant | Result |
  |---|---|
  | starter (empty diff) | not resolved |
  | reference | resolved, 100% of target tests pass |
  | three variants, each missing one of the reference's three files | not resolved (0%, 3.4% and 99% of target tests pass) |

### Restart task: TinyDB timestamps and a versioned storage format

- **Repository:** TinyDB v4.9.0 (MIT licence, about 2,300 lines, 219 tests that run in about 1.5 s), frozen in `tasks/restart/baseline.bundle`.
- **Request:** record when each document was created and last changed, and add a format version to the stored data, while keeping old files readable. The request crosses the storage layout, the table API, the document objects and the caching middleware.
- **Two sessions:** session 1 gets `prompt-1.md` ("plan the whole change, do part 1, the storage format, then stop"). Session 2 is a fresh process and gets `prompt-2.md` ("finish the request; an earlier session already worked on it"). Both carry the same request text and no hints about tests or task tracking.
- **Grader:** `node tasks/restart/grade.cjs <repo-dir>` runs four groups:
  - **part 1:** 12 hidden tests for the format.
  - **part 2:** 14 hidden tests for the timestamps.
  - **compatibility:** 5 hidden tests for old-format files.
  - **regression:** TinyDB's own 217 original tests, taken from the frozen baseline, not from the run, minus one that checks the old file layout on purpose.
- **Calibration:**

  | Variant | Result |
  |---|---|
  | starter | fails part 1, part 2 and compatibility; passes regression |
  | reference | passes all 248 tests |
  | four broken variants (writes on read, resets `created` on update, lists the format marker as a table, reads an unknown format as old) | each fails at least one group |

- **Recovery measure input:** `private/decision-points.json` lists five choices that session 1 has to make. Task 04 checks whether session 2 kept them, changed them or duplicated them.

Run `node tasks/calibrate.cjs` to re-check both graders. Add `--public` to re-run the public calibration in Docker, which takes about 2 minutes.

## Requirements these tasks place on the runner (task 02)

- **Line endings:** clone run repositories with `core.autocrlf=false`. Windows line-ending conversion otherwise breaks diffs applied in the Linux grader. This was found while calibrating.
- **Offline test environment:** Codex runs with network off, so `pip install` fails inside a run. Each run repository gets an identical Python virtual environment built offline from `tasks/<task>/wheels/` before the session, outside the git tree. For the public task, also run `pip install --no-build-isolation -e .`.
- **Diffs:** each session's diff is taken against the frozen baseline commit and includes untracked files. That is the input both graders accept.

## Setup probes (task 02, 12 October 2026)

Small paid Luna sessions checked the runner before any pilot run. Tools are in `tools/` (`prepare.cjs` builds run folders and freezes a manifest; `runner.cjs run|skip|recover` runs one session; `node --test tools/selftest.cjs` holds the contract tests). Probe evidence is under `probes/*/results/`.

| Probe | Result |
|---|---|
| Static check of each setup's starting prompt | stock 13k characters, no custom skills; task-only 15.6k with the short task instructions; full 99.4k with the shared instructions and 240 skills from the harness copy. All 252 host skills switched off everywhere. |
| Isolation | A second full session in the same run saw only its own run's summary; nothing from the host's other projects reached any run. The host's settings were unchanged after every session. |
| Undeclared file, stock | Both files written (no gates). |
| Undeclared file, full | The task gate refused `src/b.py`; Codex enforced it and Luna quoted the reason. The completion gate also stopped one session from ending until its task record was updated. |
| Undeclared file, task-only | Luna read the task's declared files and declined to write `src/b.py` without trying, so its instructions changed behaviour before any gate fired. |
| Forced attempt, task-only | The write went through: by design the task gate allows the first code file without a task. Luna then refused to update task records (as the prompt required) and the completion gate refused to let the session end **251 times** until the 10-minute timeout, using **12.1M tokens**. |

Two findings matter for the pilot:

- **The completion gate can loop without end.** It never lets a session end until its demands are met, and it ignores Codex's "already continuing after a stop refusal" flag. Before the harness fix that made Codex obey refusals, this could not happen in Codex. It must be bounded before the pilot, or any run where the model cannot finish its paperwork burns its full time limit. Fixed in harness commit 9640d8f (harness task 11): after three refusals in a row the fourth end-of-session attempt is allowed and logged as a give-up. A re-run of the stuck probe was refused three times and then ended, using 149k tokens instead of 12.1M. The pilot pins harness commit 4650a11, which includes the fix.
- **Enforcement starts at the second code file.** The task gate deliberately lets one code file change without a task. Single-file changes are not policed.

Setup probes used 13.1M tokens, 12.1M of it in the looping probe. The owner decided (12 October 2026) that probes are counted in their own pool and reported separately; the pilot keeps its full 21M for sessions and 4M for reviews.

## Pilot run (task 05, 12 October 2026)

**How it ran.** Two frozen protocols with byte-identical tools, task inputs and profiles. `protocol.json` holds the first run (restart, task-only). After its first session used 5.0M tokens, the owner raised the session allowance from 21M to 50M. The other five runs were frozen again in `pilot-b/protocol.json`; the first protocol records their slots as "not run, moved". `pilot/composition.json` says which run comes from which protocol. Reviews ran under the first protocol, into `reviews/`. Usage: 36.6M tokens for sessions, 0.56M for 21 reviews (setup probes, 13.1M, are a separate pool). `node pilot/verify-pilot.cjs pilot/composition.json pilot/measures.json` checks that every session is accounted for and that the ledger matches every result; it passed.

**Isolation leak, found after the pilot.** The run folders sat inside this study's folder, and the harness's task tool and task gate search upward for the first task board. Four harness runs reached the study's own `task_list/`. restart-task-only s1 read the study's pilot task (setups, order, measures) and created a task holding its plan there. restart-full s1 then read that plan and adopted it. public-full and public-task-only saw that unrelated task, and public-task-only created another (its first write was refused by the sandbox, its retry approved by Codex's automatic review). Stock runs have no task tool and are unaffected. Evidence copies and hashes are in `pilot/contamination/`; the two run-created tasks are in the study board's `archive/`. The restart harness runs are not clean evidence, and the public harness runs are mildly affected. A clean re-run needs run folders outside this tree (see the root FINDINGS.md). The setup probes did not catch this because they checked session notes and host files, not task boards above the repository.

**Results** (one run per setup per task, so differences can be chance):

| Measure | Task | Stock | Task-only | Full |
|---|---|---|---|---|
| Tokens (all sessions) | restart | 1.84M | 8.46M | 6.48M |
| | public | 0.70M | 9.18M | 9.89M |
| Time | restart | 5.6 min | 15.2 min | 12.1 min |
| | public | 3.9 min | 17.7 min | 20.4 min |
| Correct | restart | pass (248/248) | fail (1 original test) | pass |
| | public (target tests) | 66.7% | 88.1% | 96.3% |
| Auditability (blind, out of 8) | restart | 2 | 6.5 | 6 |
| | public | 1.5 | 6.5 | 7 |
| Debt rubric (blind, out of 12) | restart | 10 | 12 | 12 |
| | public | 8 | 9 | 11 |
| Touched files left over 800 lines | restart | 2 | 1 (shrunk from 831 to 819) | 0 |
| | public | 1 (943 → 1,204) | 0 | 0 |
| Clarity (blind, 1–5) | restart / public | 4 / 3 | 4 / 4 | 4 / 3 |
| Banned phrases per 1,000 words | all | 0 | 0 | 0 |
| Session 2: tokens before first code edit | restart | 80k | 111k | 233k |
| Session 2: part-1 choices kept (of 5) | restart | 5 | 5 | 4 (1 duplicated) |
| Reviewer guessed the setup | both | "cannot tell" twice | right twice | right twice |

Notes:

- The reviewer could tell the harness setups apart from their task files, as expected; the audit score counts only answers that match the key built from the transcripts, so task files help only when they are accurate. No audit answer from a harness run was marked wrong except one on public task-only and one on restart full.
- Task-only's restart failure: `db.all()` reads storage one extra time (`test_read_once`). Its second session could not run the full suite, because Codex's sandbox blocked pytest's temporary folders, so it ran only its own 13 tests.
- The harness's patch checker refused 13 edits it could not rebuild ("Patch context absent"); the hand-checked ones were bad patches, one caused by PowerShell mojibake.
- In the full public run the events show one `collab_tool_call` of type `wait` with no receiving agent; no sub-agent was started.

Files: grades in `results/<run>/grade*.json` and `pilot-b/results/<run>/grade*.json` (summary `pilot/grading.json`); review packets, prompts and raw answers in `reviews/`; all measures in `pilot/measures.json`.

## Analysis and recommendation (task 06, 12 October 2026)

`node analysis/report.cjs pilot/measures.json analysis/pilot.json` lists every outcome per run with its difference from stock on the same task, marked with each run's contamination from the isolation leak. One run per setup per task: no significance tests, and every difference could be chance.

**What the pilot can and cannot say**

| Outcome | Difference from stock | How much to trust it |
|---|---|---|
| Auditability | +4 to +5.5 of 8 for both harness setups, on both tasks | High. Large, the same direction 4 times out of 4, and scored only from what each repository recorded |
| Cost | 3.5–14× the tokens; 2–5× the time | High for direction; the size is inflated in the four contaminated runs |
| Over-long files | harness setups shrank or held files under 800 lines; stock grew three | Moderate. One cheap gate, a visible effect |
| Debt rubric | +1 to +3 of 12 | Low. Small, and the reviewer could see which runs had task records |
| Correctness | public: +21 and +30 points of target tests; restart: task-only failed one test, full passed | Low. One task each, and the runs are contaminated |
| Recovery | no benefit: session 2 spent more before its first edit; full duplicated one design choice | Low. One task, contaminated |
| Plain language | no difference: no banned phrases anywhere, clarity 3–4 for all | Floor effect: the measure cannot tell these setups apart |

**Are the tasks hard enough?** The public task, yes: no setup solved it fully (67–96% of target tests). The restart task is borderline: two of three setups passed it.

**Did anything in the setup break?** Yes. The study's own task board was reachable from the run folders (see "Isolation leak"). It is fixed for any re-run by placing run folders outside this tree; `C:/tmp/study2-clean/` is prepared and checked, and not run. The harness itself should also stop searching at the repository's top folder.

**Recommendation: resize Study 2; do not run it as designed.** At the observed cost, about 9M tokens per harness run, a 10-task study of three setups would cost about 190M tokens. The measure that matters most to the owner, auditability, already shows a large effect that a few tasks can confirm. Spend instead on the lighter design the pilot points to:

1. **Fix the harness first** (cheap, no study budget): keep the task tool and gates inside the repository, make the task tool work without git, allow edits the patch checker cannot rebuild, and cap the end-of-session gate at one nudge.
2. **Build a lean task-only setup**: the task workflow written twice per task, a 20-line style card and an end-of-task check (root FINDINGS.md, "What the end result would look like").
3. **Run a resized study**: stock against lean task-only on 6 tasks (3 two-session and 3 FeatureBench, chosen in advance), plus today's full setup on 2 of them as a reference. Estimated cost: stock about 8M, lean 12M if it meets its target of 2M per task, full about 18M; about 40M with reviews. Replace the banned-phrase measure with the pattern checker from FINDINGS.md item 5, since today's measure sits at zero for everyone.
4. **Decision rule, fixed in advance**: make lean task-only the default if its average audit score is at least 5 of 8, its correctness is not lower than stock's on more than one task, and it uses at most 2× stock's tokens. If audit holds but cost exceeds 3× stock, keep task tracking only for work that needs a record.

**The cheap option now: switch the default to task-only?** On quality, yes: task-only matched full on auditability and showed no measured loss against it. On cost, no saving: task-only cost as much as full (8.5M and 9.2M tokens, against 6.5M and 9.9M), because both share the task workflow. Switching now is a reasonable interim step that removes full's 64 KB of instructions and 240 skills without a measured loss. The real saving needs the lighter workflow in step 2.

**The prepared clean re-run** (`C:/tmp/study2-clean/protocol.json`, 85M allowance on the shared ledger) would confirm the four contaminated harness runs for about 34M tokens. Given the recommendation above, it is optional. Spending that budget on the lean setup answers more.

## Resized study: tooling (task 09, 13 October 2026)

The owner approved a resized Study 2 on 13 October 2026: stock against a new **lean** setup on 6 tasks, with the full harness on the 2 pilot tasks as a reference. Root `FINDINGS.md` describes the lean harness and why it exists.

- **Lean setup** (`tools/environment.cjs`, config `lean`). The run's harness clone copies its own `core/policy.json` over `policy.json` before rendering, and the run's Codex home gets the clone's `core/AGENTS.md`. Nothing comes from `profiles/`, so the lean setup is exactly what the pinned harness commit holds.
- **Prompt checks** (`tools/prepare.cjs`). `leanProfile` must be present for lean and absent for every other setup, and a lean start-up prompt must be under 25,000 characters. Probes measured about 15,900 for lean and 12,800 for stock.
- **No task board above a run** (`tools/isolation.cjs`). `prepare.cjs` refuses to build a run folder, and `runner.cjs` refuses to launch a session, when any folder above the run holds `task_list/` or `docs/tasks/`. This study tree has a board, so resized runs live under `C:/tmp/study2-resized/`. This is the check the pilot's probes lacked.
- **Measures.** `measures/harness_checks.cjs` exports the harness's own `checks/` and word list at the pinned commit and loads them, so the study measures with exactly the code the lean setup ran. The plain-language measure now counts prose patterns per 1,000 words (the word list plus four patterns of AI-sounding writing; quoted text and code skipped) instead of banned phrases, which were 0 for every pilot session. The debt measure adds the complexity share: the share of all cyclomatic complexity in the touched Python and JavaScript files held by functions scoring over 10, at the baseline and at the end. Both need a harness commit with `checks/` (021a95b or later), so they cannot re-score the pilot at 4650a11.
- **Tests:** `node --test tools/selftest.cjs` (18) and `node --test measures/selftest.cjs` (22).

**Setup probes** (probe pool; protocols in `C:/tmp/study2-resized/probes*/`). Three rounds, each at a new harness commit after a fix. The first found that Node cannot start any program inside Codex's sandbox, so the lean checks were skipped; the second found a PowerShell path problem and a crash on an unreadable pytest folder. Both were fixed in the harness (tasks 17 and 18). Round 3, at harness `ab8f166`:

| Probe | Setup | Tokens | What it showed |
|---|---|---|---|
| add a function and its test | stock | 75k | 3 commands; tests pass |
| add a function and its test | lean | 96k | `begin`, edit, test, `finish`: 5 commands; all checks recorded |
| second file outside the open task (old pilot fixture) | lean | 194k | the model put the file under the task before writing; it read `lean.js` first, because the fixture's old-style task is not described in the lean instructions |

Host settings were unchanged after every probe, and no host session data reached any run.

## Resized study: the six tasks (task 10, 13 October 2026)

The selection rules were written into task 10 before any candidate's code was read and before any run. Every grader was calibrated: the starting state fails, the reference passes, and every broken variant fails. `node tasks/calibrate.cjs` re-runs the offline calibrations and checks the saved Docker ones (`--docker` re-runs those too).

| Task | Kind | Source | Grader groups or target | Calibration |
|---|---|---|---|---|
| restart | two sessions | pilot: TinyDB 4.9.0 | part 1, part 2, old format, 217 original tests | pilot (task 03) |
| public | FeatureBench | pilot: pypa/packaging, fast split index 0 | resolved and target-test pass rate | pilot (task 03) |
| tablib | two sessions | tablib 3.10.0 (MIT, about 4,500 lines) | part 1 (JSON, 18 tests), part 2 (YAML, 9), old format (5), 176 original tests | starter fails parts 1, 2 and old format; reference passes all; 5 of 5 broken variants fail |
| watson | two sessions | td-watson 2.1.0 (MIT, about 3,400 lines) | part 1 (frames file, 8), part 2 (notes, 8), old format (4), 335 original tests | same pattern; 5 of 5 broken variants fail |
| fastapi | FeatureBench | fastapi/fastapi, fast split index 1; reference touches 8 files | resolved and target-test pass rate | starter not resolved; reference resolved (100%); 3 drop-one-file variants not resolved |
| mlflow | FeatureBench | mlflow/mlflow `test_client`, index 2; reference touches 4 files | same | same; one drop variant passes 98% of target tests and is still not resolved |

**The two new two-session tasks** follow the restart task's shape. Each request asks for a versioned data format that keeps old files readable (part 1) and a feature that uses it across the code (part 2). Both prompts carry the same request; the first asks for a plan and part 1 only.

- **tablib:** JSON and YAML exports become a versioned document that keeps a dataset's title, headers (also with no rows) and row tags; old files still load; an unknown version raises `UnsupportedFormat` and leaves the target unchanged. Part 1 is JSON, part 2 YAML.
- **watson:** the frames file becomes `{"watson": {"format": 2}, "frames": [...]}` with one object per frame; old files still read and are never rewritten by reading; `merge` reads both. Part 2 adds notes to frames (`stop --note`, `add --note`, log exports, merge conflicts).

Their graders share `tasks/two_session.cjs`: hidden tests by group under `private/grader/`, the repository's own tests taken from the frozen bundle, and broken variants as small patches on top of the reference. Original tests that assert today's file layout are left out of the regression group, each listed with its reason in the task's `grade.cjs` (tablib 7, watson 5; one watson test fails at the baseline on Windows because two frames get the same clock tick). The restart task keeps its own grader as pilot evidence.

**The two new FeatureBench instances** were the next two in dataset order meeting task 03's rules; no candidate was skipped. `tasks/fb.cjs` holds the shared steps: extract the instance from the pinned dataset, build the starting repository with FeatureBench's own Level-1 steps inside its Docker image (copy the project, apply the mask, delete the target tests, clear bytecode, start a fresh git repository), rewrite the prompt's `/testbed` paths with the pilot's four rules (they reproduce the pilot's prompt exactly), grade with `fb eval`, and calibrate. The pilot's `public/grade.cjs` stays as evidence. Each run's offline environment is built from Windows wheels at the package versions installed in the instance's image (`tasks/<task>/image-pip-freeze.txt`); `tasks/<task>/run-requirements.json` lists them with what was changed and why. Dropped: the CUDA PyTorch stack that every FeatureBench image carries in its shared base (no Windows wheels for the `+cu121` builds, about 1.6 GB of other CUDA wheels, and neither project imports torch) and uvloop (Linux only). Added: each project's build backend (pdm-backend, setuptools), because the runner installs the project without build isolation, and the Windows-only `colorama` (both) and `pywin32` (mlflow). Both environments build offline in 1-2 minutes, leave the repository clean, and run pass-to-pass tests (fastapi 3 passed, mlflow 13 passed). `tasks/manifest-resized.sha256` hashes all 359 inputs of the six tasks (`node tasks/manifest.cjs --check`).

**Disk.** fastapi's image is 10.3 GB and mlflow's 14.1 GB. Each was deleted after calibration and will be pulled again to grade the runs. Docker's disk file did not shrink after deletion: C: went from 93 GB to 69 GB free over the two pulls.

## Resized study: run and result (tasks 11-12, 13 October 2026)

**How it ran.** `resized/make-protocol.cjs` wrote `C:/tmp/study2-resized/protocol.json` (outside this tree, which has a task board): stock and lean on the six tasks, full on restart and public, one run each, gpt-6-luna at high reasoning, 30-minute sessions, delegation off, harness `ab8f166`. Order: restart, tablib, fastapi, watson, mlflow, public, with stock and lean alternating which went first, then the two full runs. `resized/run-all.cjs` ran the sessions in that order and stopped at the first runner error. It stopped twice: once when Windows reused a finished session's process ID during the runner's check (the next session had not started, so it was launched by restarting the driver), and once when the budget check refused restart-full's second session. public-full did not start. `measures/grade_runs.cjs` graded the 12 main runs (two-session tasks offline; each FeatureBench image pulled, used and deleted in turn); `measures/blind.cjs` built and ran 42 blind reviews for the runs listed in `resized/main-runs.json`; `measures/score.cjs` scored them; `resized/verify.cjs` checked the books (19 sessions, 36.2M tokens, every ledger entry equal to its session; 42 reviews, 0.96M tokens).

**Result** (`resized/decision.json`, from `resized/decide.cjs` with the rule fixed before any run): lean meets all three criteria. Average audit score 5.92 of 8 (stock 3.58); correctness below stock's on 1 task (public: 44.9% against 72.1% of target tests), above on 2 (tablib and watson, where lean passed and stock failed one test each), level on 3; tokens 1.42× stock's over the six tasks (16.19M against 11.43M; per task 1.0× to 5.0×, and 0.4× on watson). Lean left no new duplicate blocks (stock 5) and 3 touched files over 800 lines (stock 7). The prose-pattern measure was 0 for every end-of-session message, so it did not separate the setups. Root `FINDINGS.md` has the full tables, the limits and the recommendation.

**Re-scoring.** The complexity checker at `ab8f166` failed on non-ASCII Python files, leaving 3 of 12 shares empty. Harness task 19 fixed it; `resized/measures-checker-391fd95.json` is the scoring with the fixed checker (`score.cjs --checks-commit`), and `resized/measures.json` keeps the first one.

**Disk.** The wheel downloads had filled pip's cache (48 GB); free space fell to 19 GB during grading and the cache was purged. Clear it before pulling images.

## Value measures (`measures/`, task 04)

One module per outcome. Each reads a run's evidence (`evidence.cjs` loads Study 1 and Study 2 run folders into one shape) and returns JSON. Missing inputs are reported as unknown with a reason, never as 0.

| Outcome | Module | How it is scored |
|---|---|---|
| Correctness | `correctness.cjs` | Whole-task pass from the task 03 graders; categories passed kept as partial credit. |
| Planning and recovery | `recovery.cjs` | Session 2's tokens, tool calls and shell commands before its first code edit (edits to task records do not count); a reviewer's verdict on each of the five part-1 decisions (kept, changed, duplicated); grader categories still missed at the end. |
| Auditability | `auditability.cjs` | A blind auditor sees only the repository record (commit history and the full diff from the baseline) and answers 8 fixed questions, or "not recorded". A second reviewer, who sees a shortened transcript, writes the answer key and marks each answer. Score = correct + half of partial, out of 8; wrong answers are reported separately. |
| Technical debt | `debt.cjs` | Script: lines added and removed, touched files over 800 lines, duplicate blocks of 6 or more normalised added lines (blank and bracket-only lines ignored; one long copied block counts once), tests added. No linter: none is in the offline wheel caches. Reviewer: 6 items scored 0–2 (duplication, dead code, naming consistency, error handling, test quality, change scope). |
| Plain language | `plain_language.cjs` | End-of-session messages and added documentation lines (task records reported apart): banned-phrase hits per 1,000 words using the harness's own word list, read with `git show` from the pinned harness commit and hashed; Flesch reading ease; average sentence length. Code and URLs are removed first. Reviewer: clarity 1–5 for a reader new to the project. |
| Cost | `cost.cjs` | Fresh input, cached input, output and reasoning tokens and elapsed time per session and per run, plus every reviewer call about the run. |

`forms.cjs` holds the fixed review prompts and output schemas. `score.cjs protocol.json <out.json>` scores every pilot run with all six. `selftest.cjs` holds the contract tests (`node --test measures/selftest.cjs`).

**Blind review packets (`blind.cjs`).** `build` writes four packets per run: audit (repository record), clarity (end-of-session messages and added doc lines), recovery (restart runs: session 1's diff, then session 2's diff on top of it) and key (shortened transcripts; it receives the auditor's answers). Packet ids are random (`rv-` plus 8 hex digits), the order is shuffled, and the packet-to-run map is kept in `reviews/private/key.json`. Every packet is scrubbed of the run's folder, the run id, the study folder and the user's home, including JSON-escaped, URL-encoded and line-wrapped forms; the manifest is not written if a check finds a setup label or run id in packet metadata, or a private path in packet text. Task files stay visible by design, so the auditor also guesses the setup and the report states how often the guess was right. The key scorer reads transcripts, so it can see hook messages; it is not the blind step. `run` sends each packet through `runner.cjs review`; `collect` parses the answers into `reviews/answers.json`. A build from the probe evidence (9 packets) passed the check.

**Dry run on Study 1** (`node measures/dryrun.cjs <harness-commit> measures/dryrun-study1.json`): the scripted measures ran on all 18 runs without error. Reference values only, since Study 1's tasks were small and fully specified:

| Setup (Study 1 name) | Runs passing | Median total tokens | Median Flesch, final message | Banned phrases | Duplicate blocks | Median lines added |
|---|---|---|---|---|---|---|
| stock (control) | 6 of 6 | 189,526 | 38.9 | 0 | 0 | 137 |
| instructions only | 6 of 6 | 501,336 | 51.3 | 0 | 0 | 176 |
| full | 6 of 6 | 541,997 | 49.9 | 0 | 0 | 157 |

The scripted measures cannot tell these setups apart on Study 1's tasks, except on cost and reading ease. That is the reason the pilot adds harder tasks and the reviewer-scored measures.

## Blind reviews (runner `review` mode)

`node tools/runner.cjs review protocol.json <packet-id>` runs one reviewer session. Task 04's `measures/blind.cjs` first writes `reviews/packets.json`: one entry per packet with the SHA-256 of its prompt, its packet text and an optional output schema, plus the ids of earlier reviews whose answers it needs (the answer-key scorer needs the blind auditor's answers). The runner:

- refuses an id that is not in the manifest, an id that was already attempted, and any packet, prompt or schema whose bytes changed;
- pins the manifest's SHA-256 in `reviews/packets.pin.json` at the first review and refuses every later review if the manifest changed;
- runs stock Codex (no custom instructions, hooks or skills, delegation off) with a read-only sandbox in an empty private folder, with its own `CODEX_HOME`, `HOME` and `TEMP` under `reviews/runs/<id>/`. The prompt and packet go in on stdin; no setup names or run ids are in either;
- is the only writer of review usage in the ledger (kind `review`, its own 4M allowance; before the first review it assumes 400,000 tokens), and shares the study lock with sessions, so a review never runs alongside a session.

- allows one retry, `<packet-id>-retry1`, only when the first attempt never started a model thread (the same rule as pilot sessions); a review that depends on it then uses the retry's answer. `blind.cjs run` does this by itself;
- can be recovered after its runner dies: `node tools/runner.cjs recover-review protocol.json <packet-id>` kills any Codex process, removes the login link, records the review as aborted with whatever usage its events show, and releases the study lock.

Evidence per review: `prompt-sent.md`, `events.jsonl`, `transcript.jsonl`, `output.txt` (the raw answer) and `result.json`. A live check on 12 October 2026 (`probes/review-smoke/`) returned schema-shaped JSON for 13,846 tokens.

## Disk

The FeatureBench image takes 27.9 GB. C: had 61 GB free before the pull and 44 GB afterwards (12 October 2026). The owner asked for the image to be deleted after the pilot. It was deleted after grading (12 October 2026); C: went from 41 GB to 97 GB free, so Docker's disk did not need compacting. Re-grading a public run needs the image pulled again (27.9 GB).
