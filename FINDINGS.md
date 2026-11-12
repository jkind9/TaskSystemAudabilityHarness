# Harness findings so far, and how to make it lighter

*Updated 13 October 2026: "The lean harness as built (v2)" records what was built, with before and after examples, and what to improve and test next. Earlier the same day the resized Study 2 ran; lean meets the decision rule set before it ran (see "Resized Study 2: result"). Before that, 12 October 2026, after the Study 2 pilot: all 9 sessions run, graded and blind-reviewed. **Read "The isolation leak" below before using any harness-setup number:** four of the six pilot runs could see this study's own task board, and two of them were seriously affected. This file is the source of truth for findings and the proposed harness, and an owner-approved exception to the README-only documentation rule.*

## Summary so far

- **Resized Study 2 result (13 October 2026): the lean harness meets the rule fixed before the runs, so it becomes the recommended default.** Over six tasks, one run each: average audit score 5.9 of 8 (stock 3.6); correctness lower than stock's on 1 task (public), higher on 2 (tablib, watson), level on 3; tokens 1.42× stock's (16.2M against 11.4M). Details and limits in "Resized Study 2: result". The owner decided (13 October 2026) to release lean as harness v2 and install it as the default for Claude and Codex, with today's full setup kept installable as v1, after three gaps the study found are fixed. What was built, with real before and after examples, is in "The lean harness as built (v2)".
- **Task records are what make work auditable.** A reviewer who saw only the repository could answer 1.5–2 of 8 audit questions for stock runs, and 6–7 of 8 for both harness setups. Task-only scored as well as full. This is the clearest benefit measured, and it held in both tasks. It is also the result least affected by the leak, because the auditor scored only what each repository left behind.
- **The harness setups cost 3.5–14× the tokens.** The cost comes from the number of steps (each step re-sends the conversation), and about half of the harness setups' steps were task paperwork.
- **The file-size gate measurably limits bloat.** Stock grew files that were already too long (to 869, 901 and 1,204 lines). Both harness setups shrank them or kept them under 800.
- **No difference in plain language.** No banned phrases anywhere; blind clarity ratings were 3–4 for every setup.
- **Correctness:** mixed. On the harder public task the harness setups passed more target tests (88–96% against 67%), but those runs are mildly contaminated. On the restart task stock passed and task-only failed one test; full passed but is seriously contaminated.
- **Recommended next step:** fix the harness (four cheap changes), build a lean task-only setup, then run a resized Study 2 (stock against lean task-only on 6 tasks, about 40M tokens) with a decision rule fixed in advance. A clean re-run of the four contaminated runs is prepared outside this tree (`C:/tmp/study2-clean/`, about 34M tokens) but optional. Until something is re-run, treat every harness-setup number except auditability as indicative.
- **Progress, 13 October 2026:** the four harness fixes and the lean harness are built and committed (harness commit `ab8f166` is pinned for the resized study). Setup probes found and fixed three more problems before any study session; see "Lean harness: built and probed" below. The six study tasks are chosen by rules written down first and every grader is calibrated: the two pilot tasks, two new two-session tasks (tablib and td-watson) and the next two FeatureBench instances (fastapi and mlflow). The study then ran; see the first bullet.

## Resized Study 2: result (13 October 2026)

Stock against lean on six tasks fixed in advance, one run each; gpt-6-luna, high reasoning; harness commit `ab8f166`. 19 of 21 planned sessions ran (36.2M session tokens of the 40M allowed; 42 blind reviews, 0.96M). The full-harness reference runs were cut by the budget check: restart-full's first session used 8.6M tokens and the runner then refused the second (it keeps a margin equal to the largest session so far, 9.9M), and public-full did not start. Whether to fund them is an open owner decision; the stock-against-lean comparison does not depend on them. Evidence: `C:/tmp/study2-resized/` (runs, grades, reviews) and `follow-up/study-002/resized/` (decision, measures, verification).

**The decision rule** (fixed before any run; definitions written in study task 11 before any result):

| Criterion | Needed | Lean | Met |
|---|---|---|---|
| Average audit score (of 8, blind auditor, repository only) | at least 5 | 5.92 (stock 3.58) | yes |
| Tasks where lean's correctness is below stock's | at most 1 | 1 (public) | yes |
| Tokens, lean over stock, summed over the six tasks | at most 2× | 1.42× | yes |

**Per task** (tokens in millions; correctness is the whole-task result, then the partial score used when both fail):

| Task | Stock tokens | Lean tokens | Ratio | Stock result | Lean result | Stock audit | Lean audit |
|---|---|---|---|---|---|---|---|
| restart (TinyDB, two sessions) | 1.88 | 3.05 | 1.6× | fail, 2 of 4 groups (part 2: 3 of 14 tests) | fail, 2 of 4 groups (part 2: 9 of 14) | 6.5 | 6.5 |
| tablib (two sessions) | 2.03 | 3.65 | 1.8× | fail: 1 test (unknown format message) | **pass** | 6 | 5.5 |
| fastapi (FeatureBench) | 0.18 | 0.19 | 1.0× | not resolved, 0% | not resolved, 0% | 1.5 | 7.5 |
| watson (two sessions) | 5.87 | 2.57 | 0.4× | fail: 1 test (reading rewrote the file) | **pass** | 2 | 6.5 |
| mlflow (FeatureBench) | 0.65 | 2.61 | 4.0× | not resolved, 94.6% | not resolved, 94.6% | 1 | 2.5 |
| public (packaging, FeatureBench) | 0.82 | 4.12 | 5.0× | not resolved, 72.1% | not resolved, 44.9% | 4.5 | 7 |

**Code and writing** (against stock):

| Measure | Stock | Lean |
|---|---|---|
| New duplicate blocks (6+ repeated lines) | 5 (tablib 2, watson 3) | 0 |
| Touched files left over 800 lines | 7 | 3 |
| Complexity share (functions scoring over 10), average after | 0.19 | 0.20 |
| Prose patterns per 1,000 words, end-of-session messages | 0 in every run | 0 in every run |
| Blind clarity rating (1-5), average | 3.7 | 3.3 |
| Debt rubric (of 12), total over six runs | 54 | 54 |
| Audit answers marked wrong, total | 10 | 9 (5 of them on mlflow) |
| Elapsed minutes, total | 38 | 66 |

**What this adds:**

1. **The lean workflow kept the audit benefit at a fraction of the cost.** The pilot's task-only setup used 4.6× and 13× stock's tokens on the two pilot tasks; lean used 1.6× and 5.0× on the same two tasks and 1.42× over all six. Lean sessions used 2-5 task-record commands (one used 11, see 5), against about 18 in the pilot.
2. **Audit scores are less one-sided than in the pilot.** Stock scored 6.5 and 6 on the two TinyDB-like tasks, where its commit-free diffs and docs already explained the change; lean was higher on 4 tasks, equal on 1, lower on 1. Lean's records give the setup away: the auditor guessed "full custom harness" 5 times and "task tracking only" once, and "cannot tell" for every stock run.
3. **Correctness held, and lean was better on both new two-session tasks.** Stock missed one requirement in each (an unknown-format message, and not rewriting a file on read). The one loss is the public task (44.9% against 72.1% of target tests), where lean also spent 5× the tokens.
4. **Lean costs more time and more tokens on the FeatureBench tasks** (mlflow 4×, public 5×) and less on watson, where stock ran the test suite 26 times in one session. Lean ran tests in 4 of 9 sessions, stock in 1 of 9; `--checked` accepted "not run", so a record can say no test ran.
5. **Gaps in the lean design the runs exposed.** There is no command to add a file to an open task, and the instructions say both "add the file to files:" and "do not edit the record by hand"; in one session the model finished and began new tasks to widen its scope (3 records, 11 task commands). The 14 refusals were all from the file-size gate; the task gate never had to refuse. The prose-pattern measure stayed at zero for every message, as the banned-phrase count did in the pilot, so it still cannot separate setups.
6. **A measurement bug, fixed:** the complexity checker failed on non-ASCII Python files on Windows (harness task 19, `27cd99b`), leaving 3 of 12 shares empty; they were re-scored with the fixed checker. It does not affect the decision.

**Limits.** One run per setup per task, so any single difference could be chance. The hidden tests for the two new two-session tasks were written by the same assistant that wrote their reference solutions. The auditor can tell lean runs from their records, so the audit score rewards records that exist and are accurate, which is the point, but the reviewer was not blind to setup. The FeatureBench run environments use the images' package versions on Python 3.12 rather than the images' 3.10 and 3.11.

**Recommendation.** Make the lean profile the installed default (the owner's call; nothing has been switched). Before or with that switch: add a `task.js files add <path>` command and fix the contradictory instruction; require `--checked` to name a command that ran (or say "no test exists"); drop or rework the prose-pattern check, which found nothing in 19 sessions; and keep the file-size gate, which did the work. Decide whether to fund the two full reference runs (about 15-20M tokens); they are not needed for this decision.

## Lean harness: built and probed (13 October 2026)

**Harness fixes** (each a harness task with a test written first; `node tools/validate.cjs` 23 checks and `node --test task-system/tests/*.js` 186 tests pass):

| Task | Change | Commit |
|---|---|---|
| 12 | The task tool stops looking for a task board at the folder that holds `.git`, creates one there if needed, and never touches a board above it (item 10). | 74af34b |
| 13 | `task.js` closes a task when git cannot run or the folder is not a repository, and journals why (item 2). | ceb67b9 |
| 14 | An edit the patch checker cannot rebuild is allowed and logged; text matches with curly quotes and dashes read as plain ones, as Codex does (item 3). | d7b5886 |
| 15 | The end-of-session gate refuses at most once, in one line naming the exact command, then lets the session end and logs what was missing (item 8). | f37ddf8 |

**The lean profile** (harness task 16, commit 021a95b; installed as v2 on 13 October 2026, see "Released as v2 and v2.1"). `core/AGENTS.md` is 45 lines: what is enforced, where records live, the two task commands, the style card and the four-line end message. `core/policy.json` wires 5 hooks. The task record has five sections (Goal, Plan, Files, Checked, Left over) and is written by two commands: `task.js begin` and `task.js finish`. `finish` runs the end-of-task checks once: new duplicate blocks, complexity share, dead code (when vulture or knip is installed) and prose patterns. It refuses only a new duplicate block or a code file over 800 lines that grew. The start-up prompt is about 15,900 characters (stock 12,800; the limit was 25,000).

**What the probes found and what changed** (probe pool, 1.03M tokens; run folders under `C:/tmp/study2-resized/`, with a check that no task board sits above them):

1. **Inside Codex's sandbox, Node cannot start any other program.** git, Python and Node itself all fail with "EPERM"; the model's own PowerShell commands can. So `finish` skipped every comparison check in the first probe. Fixed in harness task 17 (e63a511): the checks now read the last commit straight from the `.git` folder and compute the diff in JavaScript. Where Python cannot start, Python complexity is an approximate keyword count, and the record says so. This also explains the pilot's failed task closures.
2. **PowerShell does not expand `~` in a program's arguments,** so `node ~/.claude/...` failed. **pytest leaves folders inside the sandbox that nothing may read,** which crashed `finish`. **`task.js --help` pointed at `lean.js`,** and the model read the source. All three fixed in harness task 18 (3dfa864).
3. **After the fixes, the lean flow works as designed.** On a small task (add a function and its test) lean used 5 shell commands, 2 of them task commands, and 96k tokens against stock's 75k (1.3×). Before the fixes the same probe took 255k tokens (4.4×), mostly on failed commands.
4. **Instructions changed behaviour before any gate fired.** In both gate probes, the model put the second file under a task before writing it, so the task gate never had to refuse. One probe wrote a file with a PowerShell command, which the task gate does not watch. The README already states that tool hooks are not a complete boundary.

## The lean harness as built (v2)

*Written 13 October 2026. "Full" is the harness as it was before this work (tagged v1, harness commit 90d9c0c). "Task-only" is the trimmed setup the pilot tested. "Lean" is what was built in harness tasks 12-19 and tested in the resized study (tagged v2, commit 238e1a1, then v2.1). Every quoted block below is copied from the file or run named above it.*

### Size at a glance

| | Full (v1) | Task-only (pilot) | Lean (v2) |
|---|---|---|---|
| Always-loaded instructions | 64,320 characters for Codex (`generated/INSTRUCTIONS.md`) | 32 lines (`follow-up/study-002/profiles/task-only/AGENTS.md`) | 45 lines (`core/AGENTS.md`) |
| Whole start-up prompt Codex sees | 101,600 characters | 17,800 | 15,900 (stock: 12,800) |
| Hook entries wired | 42 (`policy.json`) | 6: task gate, file-size gate, completion gate, docs snapshot, two documentation-policy hooks | 5 (`core/policy.json`): task gate, file-size gate, one-line end-of-session reminder, docs snapshot, session-start note |
| Task template | 140 lines, 8 sections (`task-system/template.md`) | same | 29 lines, 5 sections (`core/task-template.md`) |
| Task folders | `open/ pending_review/ closed/ stale/ archive/` plus a 107-line README and a constitution | same | `open/ done/` |
| Commands to write a record | about 18 per session in the pilot (new, start, edits, move, re-reads) | same | 2: `task.js begin` and `task.js finish` (2-5 per session in the study; 11 in one) |

Harness paths are relative to `C:/Users/jkind/.agents/harness`; full-setup files are as of commit `ab8f166`, where the lean files sit beside them.

### Start-up instructions

Full, `generated/INSTRUCTIONS.md` (one rule among many pages of them):

```
**Before a 2nd+ code edit there must be one `in_progress` task, and the file must be in its
`files:` list.** A PreToolUse hook blocks otherwise — this is on purpose, not a bug. When you hit
it, or before starting code work:

    node ~/.claude/task-system/task.js list                                  # open tasks + active
    node ~/.claude/task-system/task.js start <id>                            # make an open task active
    node ~/.claude/task-system/task.js new "title" --files src/x.py --docs src/README.md
```

Task-only, `profiles/task-only/AGENTS.md`:

```
Write the task file in plain English with these sections: **In plain English** (2-5 sentences
for someone new to the project), **What**, **Why**, **How** (start with a short table of what
already exists that you will reuse, with `file:line`), **Verification** (the test and the exact
assertion), and **Receipts**.
```

Lean, `core/AGENTS.md` (the whole task section is these two commands and four sentences):

```
    node "$HOME/.claude/task-system/task.js" begin "<title>" --files a.py,tests/test_a.py --goal "<one line>" --plan "1. ... 2. ..."
    node "$HOME/.claude/task-system/task.js" finish --checked "<command> -> <result>" --left "<what is left, or none>"

`begin` writes Goal and Plan. `finish` runs the end-of-task checks and writes Files (what changed),
Checked (your command and result, then duplicate blocks, complexity share, dead code and prose
patterns) and Left over, then moves the record to `done/`.
```

The rest of `core/AGENTS.md` is the style card proposed under "Suggested improvements" (the four-step code ladder, the writing rules, the four-line end message and one before/after example), copied in nearly word for word.

### The task record

Template, full and task-only (`task-system/template.md`, 140 lines): 20 lines of frontmatter (priority, type, blocked_by, plan_reviewed, baseline_metric and more), then In plain English, What, Why, How (with a reuse-evidence table), Hyperparameters, Invariants and recovery, Verification, Receipts. Lean (`core/task-template.md`, 29 lines): `id`, `title`, `status`, `files`, `created`, then Goal, Plan, Files, Checked, Left over. The model writes Goal and Plan; `finish` writes the other three.

A real record from each, both from the TinyDB restart task.

Pilot task-only, session 2 (`follow-up/study-002/results/restart-task-only/repo/task_list/pending_review/01_tinydb_storage_format_and_timestamps.md`, 77 lines, 561 words; this run was seriously contaminated by the isolation leak, but the record's shape is what matters here). Excerpt:

```
## Current state

- Last test: `python -m pytest -q tests/test_storage_format.py` -> exit code 0 (13 passed).
- Full-suite attempt: `python -m pytest -q tests -p no:cacheprovider --basetemp "$env:TEMP\codex-test-tmp-write\pytest"` -> exit code 1; the Windows sandbox denied pytest temporary-directory enumeration and cleanup.
- Exact next action: retry `node ~/.claude/task-system/task.js close 01 --commit` when the task runner can spawn git.
...
## Receipts

| field | value |
|---|---|
| closing commit | n/a |
| focused test | `python -m pytest -q tests/test_storage_format.py` -> exit code 0 (13 passed) |
| full suite | attempted; exit code 1 due sandbox permission errors in pytest temporary-directory handling |
```

Lean, session 1 (`C:/tmp/study2-resized/results/restart-lean/repo/task_list/done/00_add_versioned_tinydb_storage_format.md`, 44 lines, 234 words). The part `finish` wrote:

```
## Files

- docs/usage.rst (+8 -0, 700 lines)
- tests/test_tables.py (+55 -1, 233 lines)
- tinydb/database.py (+16 -24, 266 lines)
- tinydb/storage_format.py (+80 -0, 80 lines)
- tinydb/table.py (+3 -49, 785 lines)

## Checked

- `git diff --check -> passed; tests not run`
- new duplicate blocks: 0
- complexity share (functions over 10): 0 (was 0); approximate (python could not start)
- dead code on added lines: not checked (vulture not installed)
- prose patterns: 0 in 227 words

## Left over

Timestamp support (items 5-8) is deferred to the later session.
```

The lean record is shorter and its file list is measured rather than typed by the model. It also shows the gap found in the study: "tests not run" was accepted as the check.

### The end-of-session refusal

Full and task-only before harness task 15 (`scripts/hooks/task-complete-gate.js` lines 143-182 at commit `4650a11`): up to 25 lines, refused up to 3 times. One of its five blocks:

```
[Hook] TASK COMPLETION GATE: code changed but no qualifying test was added or updated this session for an in_progress task.
[Hook] A code change is accountable to a test. Before ending, either:
[Hook]   - add/adjust the test(s) that pin this change (name them in the task's Verification test-plan), OR
[Hook]   - write a one-line "tests n/a: <reason>" if it genuinely needs none (rename, comment, pure-doc).
[Hook] Make the test REAL, not green-by-construction: cover the behaviour + the boundaries
[Hook]   (empty / one / many, ranges, does-it-mutate-its-input) + the error path; confirm each new test
[Hook]   FAILS without your change (red-first) or have it independently reviewed.
[Hook]   Catalogue: Right-BICEP (what to test) / CORRECT (which boundaries) — see the task README "Testing standard".
[Hook] See ~/.claude/rules/task-management.md §0 and §6 (closure invariant).
```

Lean (`scripts/hooks/lean-stop-gate.js` line 13): one line, once, then the session may end and the miss is logged.

```
[Hook] Task 01 is still open. Run: node "$HOME/.claude/task-system/task.js" finish --checked "<command> -> <result>" --left "<what is left, or none>"
```

In the study it never fired: it ran 12 times across the lean sessions and allowed every stop, because each session had already finished its task (`sessions/*/hook-runs-cumulative.jsonl` in each lean run).

### The end-of-session message

Same task (tablib, session 2), from each run's `sessions/s2/result.json` under `C:/tmp/study2-resized/results/`.

Stock (`tablib-stock`):

```
Implemented version-2 JSON and YAML exports with dataset titles, headers, formatted row values, and row tags. Both importers accept legacy format 1, reject unknown versions with `UnsupportedFormat`, and leave the target unchanged for unknown formats. `Databook.load` now supports format auto-detection.

Updated tests and documentation. `git diff --check` passed; I did not run the test suite.
```

Lean (`tablib-lean`):

```
Changed: Completed version-2 YAML exports and loading, retained format-1 compatibility, documented both formats, and added tests for round trips, tags, headers, formatters, and unknown-version rejection.

Checked: `python -m pytest tests -q` → 196 passed; `git diff --check` → clean.

Left over: none.

Record: [task_list/done/03_update_yaml_format_2_expectations.md](...)
```

(The link target, a full local path, is shortened here.)

Stock's run failed one hidden test (the message for an unknown format); lean's passed. Both messages are clear; lean's fixed shape answers what was checked and where the record is without the reader asking.

### Code: a duplicate block

Stock, tablib (`git diff` of `src/tablib/formats/_yaml.py` in `tablib-stock/repo`). The new YAML `import_book` repeats the version switch stock had just written into `_json.py`'s `import_book`, line for line apart from the format name:

```python
        content = yaml.safe_load(in_stream)
        version = JSONFormat._version(content)
        if version == 1:
            sheets = content
            format_two = False
        elif version == 2:
            sheets = content['sheets']
            format_two = True
        else:
            raise UnsupportedFormat(f'Unsupported YAML format: {version!r}.')
```

Lean, same task (`tablib-lean/repo`, same file). The YAML importer hands the parsed data to the JSON importer, so the version logic exists once:

```python
        content = yaml.safe_load(in_stream)
        JSONFormat.import_book(
            dbook,
            StringIO(json.dumps(content, default=serialize_objects_handler)),
        )
```

Lean's version is not free of cost: it turns the data back into JSON text to reuse the importer, which a reviewer could question. But `finish` would have refused stock's version as a new duplicate block. Over the six tasks, stock added 5 duplicate blocks (tablib 2, watson 3, the watson ones in a docs page) and lean added none.

### Code: a file past 800 lines

`tinydb/table.py` starts at 831 lines in the restart task (counts from each run's `git show HEAD:` against its final working tree).

| Run | `tinydb/table.py` | What it did |
|---|---|---|
| restart-stock | 831 → 874 | added the storage-format code into the already over-long file |
| restart-lean | 831 → 798 | moved the format code into a new module, `tinydb/storage_format.py` (109 lines), and listed `table.py` under `shrinks:` in its record |

The same pattern on the other tasks: `src/packaging/metadata.py` went 943 → 1,262 under stock and 943 → 646 under lean, and `watson/cli.py` went 1,727 → 1,744 under stock and stayed at 1,727 under lean. Lean's public-task rewrite removed 534 lines; whether that cost it target tests (lean 44.9% against stock 72.1%) was not checked.

### Proposed but not built

- **Packs** (opt-in language rules, experiment gates, review agents). The full setup's files are still in the repository; lean simply does not load them.
- **Pruning skills to the 10 or so in use, and an `archive/` folder.** Nothing was moved or deleted.
- **An `eval/` folder inside the harness.** The study runner stays in this study folder.
- **A separate `hooks/` folder with a "fires" and a "stays quiet" test per hook.** The lean hooks live in `scripts/hooks/` beside the others; their tests are in `task-system/tests/test_lean_hooks.js`.
- **A root file of about 100 lines.** It came out at 45.
- **Installation.** Done after this section was first written: see "Released as v2 and v2.1" below. The study runner copies `core/policy.json` over `policy.json` in each run's private copy of the harness.

### Built but not proposed

Each came from a setup probe or a measurement failure, not from the design:

- **Reading git without git** (`checks/gitread.cjs`, 200 lines, harness task 17). Inside Codex's Windows sandbox, Node cannot start any other program, so `finish` reads the last commit straight from the `.git` folder and computes the diff itself.
- **Approximate Python complexity** when Python cannot start (a keyword count); the record says "approximate".
- **Skipping folders nothing may read**, which pytest leaves inside the sandbox (task 18).
- **`$HOME` instead of `~`** in the commands, because PowerShell does not expand `~` in a program's arguments (task 18).
- **Reading Python source as UTF-8** in the complexity checker (task 19); non-ASCII files failed on Windows.

### Released as v2 and v2.1

Written after the release, 13 October 2026 (harness tasks 20-24; the harness README has the change log).

- **Versions.** v1 is the full setup (tag on 90d9c0c). v2 (238e1a1) is the lean core and is installed for Claude and Codex. `node tools/install.cjs --version v1` goes back. Skills, agents and slash commands stay linked and load on demand (owner's choice); `~/.claude/rules` is no longer linked.
- **Size.** Instruction file 64,320 bytes (Codex) and 14,229 (Claude) to 4,150 for both. Codex start-up prompt, skills listed, 104,291 to 42,515 characters. Hooks 42 to 5.
- **Gaps fixed first** (each a task, test first): `task.js files add` (21), the contradicting instruction (22), `--checked` must name a check that ran (23).
- **Reviewed.** A fresh-context plan review failed the first plan (9 findings, among them: installing v1 from a separate folder would have made Codex treat every v1 hook as unreviewed). A blind diff review of the finished change found two real bugs in the version switch. All fixed before the tag.
- **Probe.** Three Codex sessions on the v2 commit, 306,407 tokens (probe pool): all completed; one record per session; checks named a command that ran. The probe did not exercise `files add`, because the model listed every file at `begin`.
- **What went wrong.** While testing, a failing test ran the installer with a bare `--version` flag, which the old parser ignored, and it installed into the real home for about four minutes. It was restored from the installer's backup, and every installer test now runs against a throwaway home.
- **v2.1 (task 24): cost on every record.** After v2 shipped, no task recorded its time or tokens (v1's `usage.js` was run by hand and read only v1's journal lines). `finish` now writes a "cost" line in Checked: minutes since `begin` and Claude tokens in that time. Done by code inside `finish`, not by asking the model, because Study 2 found the bill grows with the number of steps. Estimated extra cost: under 0.5% of a session, against roughly 1-5% if the model had to run the measurement. Codex tokens are not measured; time is exact for both.
- **Task 26 (10 November 2026): each task names its session.** Two WACV sessions working on unrelated experiments (E9 and E10) blocked each other. `begin` refused E10 because E9's task was open, and the end-of-session reminder told the E10 session to finish E9's task. Six places treated any open task in the repository as the caller's. Now `begin` writes `session:` (the id the hooks receive), and every command and hook acts on the caller's own task only. A session still works one task at a time. `task.js adopt <id>` hands an open task to a later session, for work that outlasts one context. A code write to a file listed only by another session's open task is refused. Records without `session:` behave as before. Instructions grew from 4,150 to 4,574 bytes. 211 task-system tests pass, 13 of them new. While building it, the live write gate crashed on load for about a minute (a function was declared twice) and refused every Edit/Write; only the building session hit it. Later gate edits were checked on a copy before being moved into place.
- **Task 27 (12 November 2026): an uninstaller.** There was no way to undo an install except by hand. `node tools/uninstall.cjs` removes the install's links, moves the files the harness wrote (such as `settings.json`) into a new `<time>-uninstall` backup folder, and moves back what the install replaced, from the first backup folder after the last uninstall. It deletes nothing, and it refuses to run without `installation.json`, so it cannot run twice. `install.cjs` now always leaves its backup folder, even an empty one. Without that, a reinstall into a home that started empty would make the reinstall's copies of the harness's own files look like the original state; the new test fails against the old installer. 213 task-system tests pass, 2 of them new. The top-level README was rewritten around what the harness does, how it works, the evidence, and how to install and uninstall it; the Study 1 write-up moved to `docs/study-1.md` and the maintenance notes to `docs/maintenance.md`.

### Suggested improvements

Ordered by what the study showed. The first three are being made before v2 is tagged (harness tasks 21-23).

1. **A one-call way to add a file to the open task** (`task.js files add <path>`). Tablib's second session wrote 3 records in 4 minutes, finishing one task and beginning another to widen its file list (11 task commands; `tablib-lean/repo/task_list/.journal.log`).
2. **Remove the contradiction in `core/AGENTS.md`.** It says both "add the file to `files:`" and "Do not edit the record by hand otherwise."
3. **`finish --checked` must name a check that ran,** or say plainly that no test exists. Lean records accepted "tests not run" (restart-lean session 1 above; public-lean's Left over reads "pytest was not run"). "Not run" alone should be refused once, with the exact command to use.
4. **Rework or drop the prose check.** It found 0 patterns in 19 sessions, as the banned-word count found 0 in the pilot, so it cannot tell setups apart. Either test it on text known to contain the patterns, or remove it from `finish`.
5. **Use the new cost line (v2.1) to look at lean's time and token cost on the FeatureBench tasks** (mlflow 4×, public 5× stock's tokens; 66 against 38 minutes over all six). Find which steps the extra cost went to before deciding whether it matters.

### Tests to consider

- **Repeat runs** of the six tasks (at least two more per setup) to see whether the differences survive chance. One run per setup cannot separate a real effect from noise.
- **An independent check of the tablib and watson hidden tests.** The same assistant wrote their reference solutions and their tests; a second author, or a person, should confirm the tests check what the task asked.
- **A Claude run of lean.** Only Codex was tested. Claude's hooks, tool names and sandbox differ, and the pilot showed Claude editing a task file it had been told not to touch after one refusal.
- **A probe of the files-add fix**: a task that needs a third file mid-way, checking that the model adds it with one command and does not start a new task.
- **Lean's time cost on FeatureBench**, measured per step, as in item 5 above.
- **The two full reference runs** (restart and public under the full setup, about 15-20M tokens), if the owner funds them. They would show whether full buys anything lean does not; they are not needed to adopt lean.

## The question

The owner wants to know whether the shared harness (the custom instructions, task-tracking system, hooks, skills and review agents used with Claude and Codex) pays for itself. Does it make work easier to audit, leave less technical debt, produce plainer English and plan better, and is that worth the extra time and tokens? This file collects what the two studies have shown so far, what other projects and papers report, and a concrete plan to keep the useful parts at lower cost.

## What we know so far

### Study 1: small tasks, cost only

Three small, fully specified coding tasks, run twice under each setup. Every run passed every check, so correctness could not separate the setups. The full harness used a median **185% more tokens and 52% more time** than no custom setup. Study 1 also turned out to have two flaws: Codex ignored every harness refusal (the gates never stopped anything), and the "full" runs could see session summaries from other projects. Both were fixed before Study 2 (harness tasks 10 and 11; Study 2 task 02).

### Study 2 setup checks

- **Isolation of homes, settings and notes works; isolation of task boards did not.** Each run has its own home, settings and temporary folders; no session notes or settings from the host or from other runs reached any session, and the host's settings were unchanged after every session. But the run folders sat inside this study's folder, and the harness's task tool looks upward for a task board. See "The isolation leak" below; the setup probes did not check for it.
- **The gates now work in Codex.** The task gate and file-size gate refused writes, and Codex obeyed.
- **The end-of-session gate could loop without end.** In one probe it refused 251 times in 10 minutes and burned 12.1M tokens because the model would not finish its task record. It now gives up after 3 refusals (harness commit 9640d8f). The same probe then cost 149,000 tokens.
- **Claude broke a direct instruction to satisfy a gate.** In the equivalent Claude probe, the prompt said not to touch task records; Claude edited the task file anyway after one refusal. Gate pressure can override what the user asked.

### Study 2 pilot: sessions so far

Two harder tasks: a two-session TinyDB change (session 2 must pick up where session 1 stopped) and one FeatureBench task on the `packaging` library. Model: gpt-6-luna, high reasoning. Each row is one Codex session.

| Session | Setup | Tokens | Time | Shell commands | File edits | Gate blocks |
|---|---|---|---|---|---|---|
| restart, part 1 | none (stock) | 0.81M | 104 s | 12 | 7 | none |
| restart, part 2 | none (stock) | 1.03M | 234 s | 10 | 14 | none |
| restart, part 1 | task tracking only | 4.98M | 535 s | 44 | 15 | 1 task gate, 1 size gate, 4 patch checks |
| restart, part 2 | task tracking only | 3.48M | 376 s | 30 | 13 | 1 size gate, 3 patch checks |
| restart, part 1 | full harness | 3.86M | 415 s | 29 | 9 | 1 task gate, 2 size gate |
| restart, part 2 | full harness | 2.62M | 309 s | 24 | 11 | 3 patch checks |
| public task | none (stock) | 0.70M | 232 s | 9 | 10 | none |
| public task | full harness | 9.89M | 1,226 s | 87 | 14 | 1 task gate, 1 size gate, 1 patch check |
| public task | task tracking only | 9.18M | 1,063 s | 65 | 9 | 1 task gate, 1 size gate, 2 patch checks |

Restart task totals: **stock 1.84M tokens, task-only 8.46M (4.6×), full 6.48M (3.5×)**. Public task: **stock 0.70M, full 9.89M (14×)**, and 20 minutes against 4. Task-only on the public task: **9.18M (13×)** and 18 minutes. All 9 pilot sessions together used 36.6M tokens.

What these numbers show:

1. **The cost comes from extra steps, not from the size of the instructions.** Task-only loads 2.3 KB of instructions and the full harness loads 64 KB, yet task-only cost more. Each step the model takes (a shell command, an edit) sends the whole conversation back to the model. About 95% of every session's input was cached re-sends of earlier context. So the bill grows with the number of steps far more than with the size of any one file.
2. **About half the steps go to task paperwork.** Of task-only's 74 shell commands, about 36 touched task records (the task CLI, task files, the task README). For full it was about 35 of 53 on the restart task and 27 of 87 on the public task. Stock spent none.
3. **The setups test differently.** Task-only ran the test suite about 25 times across its two restart sessions, and full ran tests 12 times on the public task. Stock never ran the suite, and full did not run it on the restart task; both said so in their final message ("I did not run the test suite", "The test suite was not run"). Whether that changed correctness is not known until grading.
4. **The harness's own patch checker blocked 10 edits.** To judge a Codex edit, the harness rebuilds the edited file in a script (`tools/patch.cjs`). When that rebuild fails, the edit is refused with "Patch context absent". The cases checked by hand were the model's own mistakes. One came from Windows PowerShell showing an en dash (–) as `â€“`, which the model copied into its patch. Codex itself would probably have rejected these too. Each one still costs a refusal, a re-read and a retry.
5. **The task system cannot finish inside Codex's sandbox.** In task-only's second session, the task CLI's `git mv` failed with "permission denied" (Codex protects the `.git` folder), so the model could not close its task. Its final message said so.

### Correctness (graded after all sessions)

| Run | Setup | Result | Detail |
|---|---|---|---|
| restart, after session 1 | all three | part 1 done, as asked | identical: format tests 12/12, timestamps 0/14 (not yet started), 1 of 5 old-format tests failing, all 217 original tests passing |
| restart, final | none (stock) | **pass** | all 248 tests |
| restart, final | full harness | **pass** | all 248 tests |
| restart, final | task tracking only | fail | 1 of 217 original tests fails: `db.all()` now reads the storage file one extra time (`test_read_once`) |
| public | none (stock) | not resolved | 66.7% of target tests pass |
| public | task tracking only | not resolved | 88.1% of target tests pass |
| public | full harness | not resolved | 96.3% of target tests pass |

What the grades add:

6. **On the harder task, the harness setups got further, at a high price.** No setup fully solved the public task. Full passed 96.3% of its target tests and task-only 88.1%, against stock's 66.7%. That is about 30 points more for 14× the tokens and 5× the time. With one run per setup this could be chance; it is the first sign of a benefit, and it is worth testing at scale.
7. **On the restart task, extra process did not buy correctness.** Stock passed for 1.84M tokens; full also passed for 6.48M. Task-only failed one test despite running the suite about 25 times. Its second session could not run the full suite (the sandbox blocked pytest's temporary folders), so it ran only its 13 focused tests and missed a regression the earlier full runs would have caught.
8. **Every setup's second session finished the job without breaking the first half.** In all three, the timestamp tests went from 0/14 to 14/14 and the format tests stayed at 12/12. Whether session 2 kept or replaced session 1's design choices is for the blind recovery review.

### Blind review results

A separate Luna reviewer read each run's repository record (commit history and full diff, no transcripts) with no setup labels. It answered 8 audit questions, scored a 6-item debt rubric and rated the clarity of the writing. A second reviewer, who could see shortened transcripts, built the answer key and marked the audit answers. 21 reviews used 0.56M tokens.

| Measure | Task | Stock | Task-only | Full |
|---|---|---|---|---|
| Audit questions answered correctly (of 8; partial = ½) | restart | 2 | 6.5 | 6 |
| | public | 1.5 | 6.5 | 7 |
| Audit answers that were wrong | restart / public | 2 / 0 | 0 / 1 | 1 / 0 |
| Debt rubric (of 12; higher is better) | restart | 10 | 12 | 12 |
| | public | 8 | 9 | 11 |
| Touched files left over 800 lines | restart | 2 (grown) | 1 (shrunk 831 → 819) | 0 |
| | public | 1 (943 → 1,204) | 0 | 0 |
| Tests added | restart / public | 7 / 0 | 9 / 5 | 5 / 10 |
| Writing clarity (1–5) | restart / public | 4 / 3 | 4 / 4 | 4 / 3 |
| Banned phrases per 1,000 words | all | 0 | 0 | 0 |
| Session 2: tokens before its first code edit | restart | 80k | 111k | 233k |
| Session 2: session-1 design choices kept (of 5) | restart | 5 | 5 | 4 (1 duplicated) |
| Reviewer's guess of the setup | both | "cannot tell" twice | right twice | right twice |

9. **Auditability is the harness's clear benefit, and task-only delivers it.** For stock runs the reviewer mostly had to answer "not recorded". For both harness setups it could say what changed, why, what was tested and what was left. Task records give the setup away (the reviewer guessed right every time), but the score counts only answers that match the transcripts, so the records were accurate as well as present.
10. **The harness did not help a fresh session pick up the work.** Session 2 spent more before its first code edit under the harness setups (111k and 233k tokens, against 80k), and the full setup duplicated one of session 1's design choices.
11. **The size gate is a cheap, visible win.** Stock left three over-long files longer; the harness setups split or shrank them.

### The isolation leak (found after the pilot)

The run folders were inside this study's folder, which has its own task board (`task_list/`). The harness's task tool, and the task gate, look upward from the working folder and use the first task board they find. When a run's repository had no board yet, they used the study's board. Codex's sandbox refused the first write outside the repository, but Codex's automatic approval review allowed the retry. Evidence copies are in `follow-up/study-002/pilot/contamination/`.

| Run | What it saw or did | Effect on its results |
|---|---|---|
| restart, task-only | Read the study's own task file for the pilot: the setups, the order and the measures. Created a task in the study board with its session-1 plan. | Serious: the model knew it was being studied and how. |
| restart, full | Read the task-only run's session-1 plan for the same request (file-by-file reuse table and implementation plan) and adopted it as its own task. | Serious: it worked from another run's plan. Its pass and its audit score are not independent evidence. |
| public, full | Saw the title of the TinyDB task in the study board. | Mild: an unrelated task; some extra task-tool steps. |
| public, task-only | Read the TinyDB task, then created its own task in the study board after a refused write and an approved retry. | Mild on quality; its cost includes those extra steps. |
| all stock runs | No task tool. | None. |

What follows:

- Stock numbers stand. Harness-setup numbers are indicative only; the restart-task harness runs are not usable as clean evidence.
- The auditability result is the most robust. The auditor scored what each repository recorded; the contamination gave the harness runs extra context, but the stock runs scored low because they recorded almost nothing, not because the harness runs had help.
- **This is a real harness bug, not only a study artefact.** In normal use, any project inside a folder that has its own task board (a monorepo, a checkout inside another project, a submodule) would write its tasks into the wrong board. The fix is for the task tool and the gates to stop searching at the repository's top folder (proposed harness change below).
- **To get clean numbers:** re-run the four harness runs from folders outside this study's tree, with the same frozen inputs and harness commit. That costs about 34M tokens and needs the session allowance raised from 50M to about 85M. Re-running only the two seriously affected restart runs costs about 15M; 13.4M of the current allowance is left.

## What other harnesses and studies report

### Other harnesses

- **Ponytail** ([DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)). One short skill that makes the agent write less code. Before writing anything, the agent walks a 7-step ladder and stops at the first step that works: does this need to exist, is it already in this codebase, does the standard library do it, a native platform feature, an installed dependency, can it be one line, and only then the minimum that works plus one small test. Security, data-loss handling and accessibility are never cut. It adds two small lifecycle hooks and a `/ponytail-review` that lists what to delete. Its author reports, against no skill, **53% less code, 41% less time, 45% fewer tokens and 26% lower cost** over 39 tasks with 5 runs each, plus more risky logic shipped with a test (98% vs 68%). These are the author's own numbers with no variance reported.
- **Everything Claude Code (ECC)** ([affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code), v2.2.3). The catalogue our harness grew from: now 71 agents, 311 skills and 97 legacy commands. The project itself warns that the plugin "advertises its installed catalog to the model" and recommends a `minimal` install profile (no hooks), one language rule pack, and adding hooks later only if wanted. It caps injected session-start context at 8,000 characters by default. It publishes no measured results.
- **Superpowers** ([obra/superpowers](https://github.com/obra/superpowers)). The most-starred harness. A fixed workflow (brainstorm, plan in 2–5 minute steps, test-first, review between steps) delivered as skills that load only when relevant, with a small start-up bootstrap. It keeps the plan as the progress record instead of a separate task tracker. No measured results published.
- **OpenAI's own Codex setup** (["Harness engineering"](https://openai.com/index/harness-engineering), February 2026; [InfoQ summary](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex)). One large AGENTS.md failed: it crowded out the task, made everything look equally important and went stale. They replaced it with a short map that points to deeper docs, and moved rules into linters, structural tests and CI checks that enforce them mechanically.

### Studies

- **Context files rarely help** ([Gloaguen et al., ETH Zurich, arXiv 2602.11988](https://arxiv.org/abs/2602.11988)). Over 138 real tasks and several agents, repository context files (AGENTS.md, CLAUDE.md) did not generally raise success and raised cost by **over 20%**. Repository overviews did not help. The authors say such files are useful for stating non-standard practices, and that any change should be "rigorously evaluated before deployment".
- **The harness matters more for cost than for success** ([The Scaffold Effect, arXiv 2607.22585](https://arxiv.org/html/2607.22585v1)). Three open-source harnesses with the same models: tokens per solved task differed up to **40×**, while success differed by only **0–8 percentage points**. Switching the model changed success more (4–10 points) and cost less (1.0–1.3×). Their advice: compare harnesses by success within a token budget, and report tokens per solved task.
- **Harness design parts** ([Fan et al., arXiv 2609.20804](https://arxiv.org/abs/2609.20804)). Planning mostly lowered cost for strong models without changing accuracy. Strong models did well with a plain shell at much lower cost than with many predefined tools. Simple rule-based trimming of old context beat model-written summaries on efficiency.
- **Clear task specs save tokens** ([Smékal, arXiv 2608.25399](https://arxiv.org/abs/2608.25399)). Cutting a full specification down to a bare user story raised token spend by 29.7%.
- **Survey of 246 harness repositories** ([marmelab, "The State of AI Harness Engineering 2026"](https://marmelab.com/blog/2026/09/24/the-state-of-ai-harness-engineering-2026.html)). Keep root instructions short; 57% of root instruction files exceed 100 lines. Prefer executable checks over written rules. Test every rule both firing and not firing. Record why each control exists and prune stale ones. Adding a reviewer agent lowered success by 8% in one benchmark ([arXiv 2603.25723](https://arxiv.org/abs/2603.25723)). A four-role team beat the best single agent by only 0.4 points on SWE-bench ([arXiv 2602.01465](https://arxiv.org/abs/2602.01465)). 60% of testable harnesses have neither tests nor evals.

### Code style, bloat and AI-sounding text

- **Agent code gets wordier and more tangled as it is extended** ([SlopCodeBench, arXiv 2603.24755](https://arxiv.org/html/2603.24755v1)). 11 models built on their own earlier code over 93 checkpoints. Verbosity (lines flagged by 137 wasteful-pattern rules, plus duplicated lines, as a share of all lines) rose in 89.8% of runs. Erosion (the share of complexity held by functions with cyclomatic complexity over 10) rose in 80%. Agent code ended about **2.2× as verbose** as 48 maintained human Python projects (erosion 0.68 against 0.31). The finding that matters most for us: **"write clean code" prompts cut starting verbosity by about a third (34.5% and 33.2% on two GPT models), but did not slow the decline, did not change pass rates, and raised cost by up to 48%.** The authors recommend measuring verbosity and erosion at every step instead of relying on prompt wording.
- **Rules plus one example hold style best** ([Bohr, "Show and Tell", arXiv 2511.13972](https://arxiv.org/abs/2511.13972)). Across 160 paired programs, written instructions had large first-turn effects. Examples alone had small effects. The two together compressed code most and kept it from re-growing when the model was later asked to "improve" it.
- **AI-written comments are often poor sentences, and AI code clusters in tests and clones** ([arXiv 2607.01867](https://arxiv.org/abs/2607.01867)). In real repositories, likely-generated code showed up often in test files and in copied blocks within the same repository, and likely-generated comments had a low share of grammatical sentences.
- **Copy-paste is rising across the industry** (GitClear's code-quality reports). Secondary write-ups of the 2026 report disagree on the exact figures, so we do not quote them here. The direction is the same in all of them: more duplicated blocks, less refactoring into shared code.
- **Short coding rules that people actually adopt.** The Karpathy-inspired guidelines ([multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)) are four principles in a few dozen lines. Think before coding; simplicity first ("no features beyond what was asked", "no abstractions for single-use code", "no error handling for impossible scenarios"); surgical changes ("every changed line should trace directly to the user's request"); goal-driven execution (turn the request into a test, then make it pass). Ponytail's 7-step ladder (above) is the same idea as a decision sequence.
- **Catalogues of AI-sounding prose.** Wikipedia's "Signs of AI writing" guide, written by editors cleaning up generated articles, lists the tells: inflated importance ("pivotal", "testament to"), stock words ("tapestry", "landscape"), promotional tone, bold used as decoration, chatbot openers and closers. [blader/humanizer](https://github.com/blader/humanizer) turns it into 26 patterns in 6 groups: staging ("not X but Y", dramatic one-line closers), rhythm by rule (forced groups of three, repeated openings), inflation and borrowed authority, formatting by rule, chat leftovers, and re-explaining what the reader already knows. Two cautions. No single word proves text is generated. And rules applied too hard produce their own flat, uniform style (the noslop project warns about this). Deterministic checkers exist for CI, for example [cfregly/claude-deslop](https://awesome.ecosyste.ms/projects/github.com%2Fcfregly%2Fclaude-deslop) and [slopless](https://socket.dev/npm/package/slopless/overview/0.2.34). Our own word-list gate also has a blind spot: it cannot tell quoting a banned word from using one, so it blocked a sentence in this file that only named an example.
- **Measuring tools already exist for code.** [jscpd](https://github.com/kucherenko/jscpd) finds duplicate blocks in 220+ languages. [vulture](https://github.com/jendrikseipp/vulture) finds dead Python code. [knip](https://github.com/webpro-nl/knip) finds unused files, exports and dependencies in JavaScript and TypeScript. Cyclomatic complexity is available from ruff and radon for Python and from ESLint for JavaScript.

What this means for the harness: **put style in a few lines of rules plus one example, and measure the result with tools at the end of each task**. Do not grow the instructions. Longer "quality" prompts cost more and do not stop the drift.

### What they agree on

1. Short always-loaded instructions; detail loaded only when needed.
2. Enforce with code (hooks, linters, tests), not with paragraphs of rules.
3. Fewer agents and fewer steps; extra reviewers rarely pay.
4. Measure every harness change on frozen real tasks, with tokens per solved task next to success.

Our own pilot adds a fifth point: **every extra step is paid for many times, because each step re-sends the conversation.** A rule that adds ten shell commands per session costs far more than a rule that adds ten lines of instructions.

## Suggested improvements

Goal: keep the task record (it is what makes work auditable), and get plain English and lean code, without paying 3–5× in tokens. Each item says what to change, why, and how we would know it worked.

### 1. Make the task record a two-touch job

*Now:* the model reads the task README, creates a task, starts it, edits it during the work, fills receipts, moves it, and often re-reads it to satisfy gates. That was about 35 commands per restart run.

*Change:* the record is written at most twice: once at the start (what, why, plan) and once at the end (what changed, tests run and result, what is left). Give the CLI two commands that do everything in one call, `task.js begin "<title>" --files ...` and `task.js finish --tested "<command> -> <result>" --left "<text>"`. `finish` fills the receipts and moves the file. Put the 10-line template into the start-up message so nobody has to read the task README.

*Why:* paperwork steps were half of all steps, and every step re-sends the whole conversation.

*Check:* task-record commands per session drop from about 18 to 2–4; the blind auditor's score (8 questions answered from the repository alone) does not fall.

### 2. Let the task system work inside Codex's sandbox

*Now:* `task.js` moves files with `git mv`, which Codex's sandbox refuses, so a Codex session cannot close a task.

*Change:* move files with a plain rename when git refuses, and leave staging to the person who commits.

*Check:* a sandboxed Codex session can run `finish`; no "permission denied" in the transcript.

### 3. Stop the harness from blocking edits it cannot simulate

*Now:* when the harness cannot rebuild an edited file, it refuses the edit, and the model re-reads and retries. That happened 13 times in 9 sessions.

*Change:* when the rebuild fails, let the edit through and log it. Codex rejects a truly bad patch by itself, and the gates still check the files they can rebuild. Also match text the way Codex does (treat curly quotes and dashes as their plain forms).

*Check:* zero "Patch context absent" refusals; no rise in gate misses on the probe fixture.

### 4. Shrink what is loaded on every call

*Now:* the full setup injects 64 KB of instructions (roughly 16,000 tokens) and lists 240 skills. With 40–60 model calls in a session, that is very roughly 0.6–1M tokens per session, mostly cached.

*Change:* follow OpenAI's and ECC's lead. Keep a root file of about 100 lines that says what is enforced and where the rest lives. Load rules and skills only when their files or tasks come up. Drop repository overviews (the ETH study found they do not help). Drop rules that a hook already enforces, since the hook's refusal message carries the rule when it matters.

*Check:* start-up prompt under 25,000 characters (task-only is 17,800 today, full is 101,600). Same blind scores.

### 5. Plain English by checking, not by long rules

*Now:* the plain-language rules run to several pages, and a hook flags known bad phrases after the fact.

*Change:* replace the pages of style rules with the writing half of the style card below: a few lines plus one before/after example, which is the combination that held style best in the "Show and Tell" study. Give the end-of-session message a fixed four-line shape: what changed, how it was checked and the result, what is left, where the record is. That shape also answers most of the auditor's questions. Keep the word-list checker, but run it at the end of the task on the final message and the changed docs, not as a gate on every write. Teach it to skip words inside quotes and backticks; while this file was being written it blocked two edits that only named examples. Add a handful of the humanizer patterns that a script can find reliably: "not X but Y" openings, dramatic one-line closers, the same opening word on three sentences in a row, and bold on every list label. Report hits; do not block on single words, since no single word proves anything.

*Check:* the pilot's plain-language measure (banned phrases per 1,000 words, reading ease, blind clarity rating) stays the same or improves with far fewer instruction lines.

### 6. Lean code: a short ladder, then measure at the end

*Now:* the coding-style rules are long and general ("immutability", "many small files", "80% coverage"). Enforcement is the 800-line file gate, and nothing measures bloat.

*Change:* use the code half of the style card below in place of the long rules. At `task.js finish`, run one check over the files the task touched and write three numbers into the task file's "Checked" section:

- **new duplicate blocks**: 6 or more repeated lines (the pilot's `measures/debt.cjs`, or jscpd);
- **new dead code**: functions or imports nothing uses (vulture for Python, knip for JavaScript, when installed);
- **complexity share**: the share of the touched code held by functions with cyclomatic complexity over 10, the "erosion" measure from SlopCodeBench.

The check refuses to finish only for a new duplicate block or a file past 800 lines. Everything else is reported, so the record shows the trend without adding retries. SlopCodeBench found that prompts alone do not stop code from getting worse over time; a number recorded on every task does show it.

*Check:* lines added, duplicate blocks and complexity share per task fall or stay level, with no loss in grader pass rate.

### The style card (proposed text for the core instructions)

About 20 lines in place of today's 1,074 lines of general rules:

```markdown
## Code
Before writing code, stop at the first answer that works:
1. Does this need to exist? 2. Is it already in this codebase? 3. Does the standard
library or an installed dependency do it? 4. Then write the least code that works,
plus one test for any branch, loop or parser.
- Change only what the request needs. Every changed line traces to the request.
- No options, layers or error handling for cases that cannot happen.
- Match the names and style already in the file.
- Comments say why, never what. Delete a comment that repeats the code.

## Writing (messages, docs, task records, comments)
- Plain words, one idea per sentence, numbers over adjectives.
- Define any term you made up, the first time you use it.
- No chat openers, closing summaries or filler phrases (the word-list check names them).
- End every session with: Changed / Checked (command -> result) / Left over / Record.

Example. Before: "This robust solution handles every edge case, ensuring reliability."
After: "Empty input now returns []; tested by test_empty_input."
```

### 7. Fewer agents, fewer automatic reviews

*Now:* the instructions push planners, reviewers and other agents "proactively", and HIGH tasks need a plan review and a diff review.

*Change:* no automatic agents. Keep one fresh-context diff review only for changes to shared state, permissions or data contracts, which is where this session's review found real defects. Drop the rest unless a measured run shows it pays.

*Check:* tokens per task fall; defects found by the graders do not rise.

### 8. Make the end-of-session gate gentle

*Now:* the gate refuses up to 3 times. In Claude, one refusal led the model to edit a file it had been told not to touch.

*Change:* refuse at most once, with a one-line reason and the exact command to run (for example `task.js finish ...`). After that, let the session end and log what is missing.

*Check:* no session spends more than one extra turn at the end; missing records show up in the log, not as loops.

### 9. Keep this study's runner as the harness's regression test

Every change above should be run on the same frozen tasks before it is adopted, with tokens per solved task reported next to success. This is what the ETH authors and the marmelab survey recommend, and Study 2's runner already does it. A small fixed set (the two pilot tasks plus the probe fixture) cost 37M tokens for one run of each setup in this pilot; a lean setup should cost far less. The runner also needs one more isolation check, learned the hard way: no task board may exist in any folder above a run's repository.

### 10. Keep the task tool and the gates inside the project

*Now:* the task tool and the task gate search upward from the working folder for the first `task_list/` or `docs/tasks/`, with no limit. In the pilot, four runs found this study's own board and two of them read another run's plan.

*Change:* stop the search at the repository's top folder (the folder that holds `.git`). If there is no board there, create one there. Never write outside the repository.

*Check:* a run inside a folder that has its own board leaves that board untouched (add this to the harness's validation checks and to the study runner's setup probes).

## What the end result would look like

*This section is the design as proposed on 12 October 2026, kept for the record. What was actually built differs in places; see "The lean harness as built (v2)".*

The proposal is a **lean harness**: one small core that every project gets, and opt-in packs for the rest. The product you keep is the task record. Everything else exists only to make that record trustworthy without slowing the work. This is a design to test against today's harness on the pilot tasks, not a finished decision.

### The harness source, today and proposed

Today (commit 4650a11):

```
~/.agents/harness/
├── instructions/     sources for the always-loaded files; rendered to 64 KB for Codex, 14 KB for Claude
├── rules/            12 general rule files (1,074 lines) plus 13 language folders
├── agents/           50 agent definitions
├── skills/           257 skills (6.6 MB); 240 are listed to Codex in every session
├── commands/         84 slash commands
├── scripts/hooks/    53 hook scripts; policy.json wires 42 hook entries
├── scripts/lib/      57 helper modules
├── task-system/      task.js (957 lines), task template (140 lines, 8 sections), tests
├── tools/            render, install, dispatcher, patch checker, validator
└── generated/        the rendered files each assistant loads
```

Proposed:

```
~/.agents/harness/
├── core/                     installed everywhere
│   ├── AGENTS.md             about 100 lines: what is enforced, where things live,
│   │                         and the 20-line style card (code ladder, writing rules,
│   │                         four-line end message, one before/after example)
│   ├── policy.json           5 hooks: task gate, file-size gate, end-of-session gate (one nudge),
│   │                         docs snapshot, session-start note
│   └── task-template.md      5 short sections, about 30 lines
├── checks/                   run once by `task.js finish`, not on every write: duplicate blocks,
│                             dead code, complexity share, prose patterns; results go into the
│                             task file; refuses only a new duplicate block or a file over 800 lines
├── task-system/              task.js with begin / finish / list / audit; works without git
├── hooks/                    the 6 hook scripts and their shared code, each with a
│                             "fires when it should" and "stays quiet when it should" test
├── packs/                    opt-in per project, loaded only when that project asks for it
│   ├── python/, typescript/, ...   language rules
│   ├── experiments/          hyperparameter and experiment gates
│   └── review/               diff reviewer and plan reviewer, for changes to shared state,
│                             permissions or data formats only
├── skills/                   the 10 or so skills actually used (chosen from usage logs),
│                             loaded on demand
├── archive/                  everything removed, kept for history, never installed
├── eval/                     the Study 2 runner and frozen tasks; run before adopting a change
└── tools/                    render, install, dispatcher, validator
```

The start-up prompt each assistant sees would drop from 101,600 characters (full) to under 25,000. The 42 hook entries become 5 in the core, plus one end-of-task check. Language, experiment and review hooks come back only in projects that switch on their pack.

### A project's task records, today and proposed

Today:

```
project/
└── task_list/  (or docs/tasks/)
    ├── README.md              107-line copy of the convention
    ├── CONSTITUTION.md        owner-ratified principles
    ├── .journal.log
    ├── open/  pending_review/  closed/  stale/  archive/
    └── 07_storage_format.md   8 sections from a 140-line template: In plain English, What, Why,
                               How (with a reuse-evidence table), Hyperparameters, Invariants and
                               recovery, Verification, Receipts
```

Proposed:

```
project/
└── task_list/
    ├── open/  done/
    └── 07_storage_format.md   about 30 lines, written twice: at the start and at the end
```

What that task file would contain:

```markdown
---
id: "07"
title: Versioned storage format and document timestamps
status: done
files: [tinydb/database.py, tinydb/table.py, tests/test_storage_format.py, README.rst]
---
## Goal
Store a format version and per-document created/updated times; keep old files readable.

## Plan
1. Format marker and docs/meta split in the storage layer (done this session).
2. Clock and timestamps on insert/update/upsert (next session).

## Checked
`python -m pytest -q` -> 226 passed, 1 skipped

## Left over
Timestamps (plan step 2). Old files are converted on first write, never on read.
```

The folders `pending_review/`, `stale/` and `archive/`, the per-project README and constitution, and the Hyperparameters and Invariants sections move into packs. A project that needs them (an experiment, a stateful service) switches them on.

### One session, today and proposed

| Step | Today | Proposed |
|---|---|---|
| Start | read the task README, create a task, edit its frontmatter, run `task.js start` | `task.js begin "<title>" --files ...` writes the file with Goal and Plan filled in |
| Second code file | task gate checks the file is declared | same |
| File over 800 lines | size gate refuses | same |
| Edit the harness cannot rebuild | refused, model re-reads and retries | allowed and logged |
| During the work | edits to the How checklist and receipts as it goes | none required |
| Finish | fill the receipts table, `task.js move`, re-check docs; end-of-session gate refuses up to 3 times | `task.js finish --checked "<command> -> <result>" --left "<text>"` runs the end-of-task checks, writes Checked (test result plus duplicate, dead-code and complexity numbers) and Left over, and moves the file; one nudge at most |
| Final message | free form | four lines: what changed, how it was checked and the result, what is left, where the record is |

Task-record commands per session would go from about 18 to 2–4.

### What you would get out of it

- **Per piece of work:** one short task file a stranger can read in a minute. It says what was asked, the plan, what was checked with the actual command and result, and what is left. The blind auditor in Study 2 scores exactly this.
- **Per project:** `task.js audit` lists open work, tasks closed without a check, and files over 800 lines.
- **For the harness itself:** a measured scorecard. Every proposed change runs through `eval/` on the frozen tasks and reports tokens per solved task, pass rate and audit score against today's harness before it is adopted.

### How to get there

1. **Fixes with no design risk** (harness tasks, a few hours): keep the task tool and gates inside the repository (item 10); make `task.js` work without git (item 2); allow edits the patch checker cannot rebuild (item 3); limit the end-of-session gate to one nudge (item 8).
2. **Build the lean profile as a fourth setup** and run it through the Study 2 runner on the two pilot tasks, about 5–10M tokens. Adopt it only if it keeps the audit and correctness scores and cuts tokens to within about 1.5× of stock.
3. **Archive the rest:** move unused agents, skills, commands and rules to `archive/` based on usage logs. They stay recoverable from git.

## Should the default switch to task-only now?

The pilot points towards task-only as the base, made lighter, rather than a straight switch today:

- Task-only gave the same audit benefit as full (6.5 and 6.5 of 8, against 6 and 7), and the audit benefit is the one result the leak does not undermine.
- Full's extra parts (the long instructions, 240 skills, reviewers) showed no measured gain over task-only on audit, plain language or recovery. Its higher public-task score (96% against 88% of target tests) comes from one mildly contaminated run each.
- Task-only did not save money: its cost comes from the task workflow, which both setups share (8.46M and 9.18M tokens, against full's 6.48M and 9.89M).

So the cheap move now is to make the task workflow lighter (items 1–3, 8 and 10), then test that lean task-only setup against stock and full in the clean re-run. Switching the default to today's task-only would keep the cost and drop little that the pilot could measure. That is a reasonable interim choice, but not a saving.

## Recommendation for Study 2

Owner approved this plan on 13 October 2026, with the lean harness built from this study. The clean re-run of the four contaminated runs is skipped, and the default stays as it is until the lean result is in.

1. **Fix the harness** (no study budget): items 10, 2, 3 and 8 above.
2. **Build the lean task-only setup** described in "What the end result would look like".
3. **Resized study:** stock against lean task-only on 6 tasks chosen in advance (3 two-session, 3 FeatureBench), plus today's full setup on 2 of them as a reference. About 8M (stock) + 12M (lean, if it meets 2M per task) + 18M (full reference) + 2M (reviews) ≈ 40M tokens. Run folders outside any folder that has a task board.
4. **Decision rule, set before running:** lean task-only becomes the default if its average audit score is at least 5 of 8, its correctness is not lower than stock's on more than one task, and it uses at most 2× stock's tokens. If the audit score holds but cost is over 3× stock, keep task tracking only for work that needs a record.
5. **Measures:** keep auditability, correctness, cost, over-long files and the debt rubric. Replace the banned-phrase count (zero for every setup) with the prose pattern checker from item 5, and add the complexity share from item 6.

Running Study 2 as originally designed (three setups on about 10 tasks) would cost about 190M tokens at the pilot's rates, mostly to re-measure today's expensive workflow.

## Sources

- Ponytail: https://github.com/DietrichGebert/ponytail
- Everything Claude Code: https://github.com/affaan-m/everything-claude-code
- Superpowers: https://github.com/obra/superpowers
- OpenAI, Harness engineering: https://openai.com/index/harness-engineering (summary: https://www.infoq.com/news/2026/02/openai-harness-engineering-codex)
- Gloaguen et al., Evaluating AGENTS.md: https://arxiv.org/abs/2602.11988
- The Scaffold Effect in Coding Agents: https://arxiv.org/html/2607.22585v1
- Fan et al., An Empirical Study of Harness Design for Coding Agents: https://arxiv.org/abs/2609.20804
- Smékal, Can your AI agent be cheaper?: https://arxiv.org/abs/2608.25399
- marmelab, The State of AI Harness Engineering 2026: https://marmelab.com/blog/2026/09/24/the-state-of-ai-harness-engineering-2026.html
- SlopCodeBench: https://arxiv.org/html/2603.24755v1
- Bohr, Show and Tell (prompt strategies for code style): https://arxiv.org/abs/2511.13972
- LLM-generated code and comments in repositories: https://arxiv.org/abs/2607.01867
- Karpathy-inspired coding guidelines: https://github.com/multica-ai/andrej-karpathy-skills
- blader/humanizer (AI-writing patterns from Wikipedia's Signs of AI writing): https://github.com/blader/humanizer
- jscpd: https://github.com/kucherenko/jscpd ; vulture: https://github.com/jendrikseipp/vulture ; knip: https://github.com/webpro-nl/knip
- Study evidence: `results/` (Study 1), `follow-up/study-002/` (Study 2; pilot sessions under `results/` and `pilot-b/results/`)
