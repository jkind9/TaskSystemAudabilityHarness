---
id: "16"
title: Build the lean harness profile
status: closed
priority: MED
type: infra
blocked_by: []
blocks: []
verification_test: task-system/tests/test_lean_flow.js
plan_reviewed: null
files:
  - core/**
  - checks/**
  - task-system/lean.js
  - task-system/lean-board.js
  - task-system/task.js
  - scripts/hooks/lean-stop-gate.js
  - scripts/hooks/lean-session-note.js
  - scripts/hooks/task-gate.js
  - task-system/tests/test_lean_*.js
  - tools/validate.cjs
docs:
  - README.md
baseline_metric:
  source: "Study 2 pilot (Harness_Development/FINDINGS.md): task-only profile"
  field: "task-record commands per session; start-up prompt size; hooks wired"
  baseline_value: "about 18 task commands per session; 15.6k-17.8k characters; 6 hooks (full: 42)"
  target: "2-4 task commands per session; under 25,000 characters; 5 hooks"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 16 — Build the lean harness profile

## Current state

- Last test: node tools/validate.cjs -> exit 0 (23 checks); node --test task-system/tests/*.js -> 179/179
- Next action: none; closed with commit 021a95b; the live check is the Study 2 lean probe (study task 09).
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner decisions 2026-10-13: build lean as a new profile, do not install it as the default, commit once validate and tests pass, pin that commit for the study.

## In plain English

The harness's task records make work easy to audit, but filling them in took about half of every session's steps and several times the tokens of working without the harness. This task builds a lighter version for testing: a short instruction file with a style card, five checks instead of forty-two, a task record written once at the start and once at the end with one command each, and an automatic quality report at the end of each task. It is a separate profile; nothing installed changes.

## What

New, opt-in, nothing installed:

- `core/AGENTS.md` (at most 100 lines): what is enforced, where things live, the two commands, and the 20-line style card from FINDINGS.md (code ladder, writing rules, four-line end message, one before/after example).
- `core/policy.json`: 5 hooks. Task gate (`task-gate.js`), file-size gate (`file-size-gate.js`), end-of-session gate (`lean-stop-gate.js`, one nudge through the dispatcher's limit of 1), docs snapshot (`docs-snapshot.js`), session-start note (`lean-session-note.js`). `env.ECC_TASK_FLOW = "lean"` makes the task gate's refusal name `task.js begin`.
- `core/task-template.md` (about 30 lines): frontmatter (id, title, status, files, created) and sections Goal, Plan, Files, Checked, Left over.
- `task-system/lean.js`, routed from `task.js`: `begin "<title>" --files a,b [--goal ..] [--plan ..]` writes the task in `task_list/open/` as in_progress and prints the last finished task's Left over; `finish --checked "<cmd> -> <result>" [--left "<text>"]` runs the checks once, writes Files, Checked and Left over, sets `status: done` and moves the file to `task_list/done/`.
- `checks/`: `duplicates.cjs` (new duplicate blocks of 6+ normalised added lines, same rule as the Study 2 debt measure), `complexity.cjs` + `complexity.py` (share of cyclomatic complexity held by functions over 10; Python via the stdlib `ast`, JavaScript by an approximate keyword count), `prose.cjs` (the shared word list, skipping quoted and code text, plus four humanizer patterns), `deadcode.cjs` (vulture or knip when installed, else "not checked"), `run.cjs` (the one entry `finish` calls). `finish` refuses only a new duplicate block or a touched file over 800 lines.

## Why

FINDINGS.md "Suggested improvements" 1, 4, 5, 6 and "What the end result would look like": paperwork was about half of the harness setups' steps and each step re-sends the conversation; style rules in prompts cut first-turn verbosity but do not stop drift, so measure at the end of each task instead.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Task gate binds the 2nd+ code file to the in_progress task's `files:` | scripts/hooks/task-gate.js | dispatcher PreToolUse | scripts/hooks/task-gate.js:53,98 |
| 800-line gate | scripts/hooks/file-size-gate.js | dispatcher PreToolUse | scripts/hooks/file-size-gate.js:92 |
| One Stop refusal per session, then allow and log | tools/dispatch.cjs | Stop | tools/dispatch.cjs STOP_REFUSAL_LIMIT (task 15) |
| Session-start dirty-file snapshot | scripts/hooks/docs-snapshot.js | completion gate | scripts/hooks/docs-snapshot.js:24-37 |
| Banned-phrase list, one copy | scripts/lib/plain-language.js `OFFENDERS` | plain-language hooks, Study 2 measure | scripts/lib/plain-language.js:18 |
| Duplicate-block rule (6 normalised lines, a long copy counts once) | Study 2 measures/debt.cjs | pilot debt measure | follow-up/study-002/measures/debt.cjs:26 (separate repository; copied rule, not code) |
| Board location bounded by the repository | task-system/locate.js | task.js | task-system/locate.js:17 (task 12) |
| `task.js` may not grow (over 800 lines) | file-size-gate | — | task-system/task.js is 942 lines |
| Policy is rendered to both runtimes' hook files | tools/render.cjs | install, Study 2 environment.cjs | tools/render.cjs, follow-up/study-002/tools/environment.cjs:24 |

Nothing in `core/` or `checks/` is read by `install.cjs` or the root `policy.json`, so the installed setup is unchanged. `task.js` gains `begin`/`finish` routing at no net line growth; existing commands are unchanged.

hyperparameters n/a: not an experiment (thresholds 6 lines, complexity 10 and 800 lines come from FINDINGS.md items 6 and the existing gate).

invariants n/a: no new long-lived state. `finish` writes only the task file and moves it inside the repository's board; checks read files and git. Where Node cannot start git, the checks that need a "before" state report "not checked" instead of guessing.

## Verification

Each piece is tested firing and staying quiet (`task-system/tests/test_lean_*.js`):

- checks: a pasted 6-line block is counted once and a 5-line one is not; complexity share of a known function set; prose hits a banned word but not the same word in quotes or backticks, and each humanizer pattern fires on an example and not on a near-miss; dead code says "not checked" when the tool is missing.
- flow: `begin` writes Goal/Plan/files and makes the task in_progress, refuses a second open task, prints the last done task's Left over; `finish` writes Files/Checked/Left over with the numbers and moves to `done/`; refuses a new duplicate block and a file over 800 lines, leaving the task open.
- hooks: the stop gate refuses with one line naming `task.js finish` when a task is open and is quiet with none; the session note prints the open task or the last Left over and is quiet with no board; the task gate's refusal names `task.js begin` under `ECC_TASK_FLOW=lean`.
- `tools/validate.cjs`: `core/policy.json` has exactly the 5 hooks and every script exists; `core/AGENTS.md` is at most 100 lines.

## Receipts

| field | value |
|---|---|
| closing commit | 021a95b (owner approved the commit 2026-10-13) |
| files changed | core/AGENTS.md (45 lines), core/policy.json (5 hooks), core/task-template.md (29 lines), checks/{run,duplicates,complexity,deadcode,prose}.cjs + checks/complexity.py, task-system/lean.js, task-system/lean-board.js, task-system/task.js (routing, no net growth), scripts/hooks/lean-stop-gate.js, scripts/hooks/lean-session-note.js, scripts/hooks/task-gate.js (lean hint), task-system/tests/test_lean_{checks,flow,hooks}.js (23 tests), tools/validate.cjs (lean static check), README.md |
| test | validate.cjs pass, 23 checks; task-system tests 179/179 (was 156) |
| before / after | instructions: task-only 2.3 KB + 107-line board README read per run -> core/AGENTS.md 45 lines; hooks 6 -> 5; task template 140 -> 29 lines; task commands per session: about 18 -> 2 by design (begin, finish), to be measured in Study 2 |
| result | lean profile built and tested; not installed |

Notes / caveats / follow-ups:

- Tests were written before the code for each piece; they were not run red first (the modules did not exist yet), except the task-gate hint.
- The checks need git from Node for the "before" state. One pilot session could not start git from Node inside Codex's sandbox; there the checks say "not checked". The Study 2 lean probe shows which happens.
- Dead code is "not checked" on this machine: vulture and knip are not installed, and the harness installs nothing.
- JavaScript complexity is a keyword count per function, not a parse.
- `docs-snapshot` is kept as the owner listed it; no lean check reads it yet.
- Running the prose check on FINDINGS.md finds 12 patterns in 4,050 words, all "bold on every list label".
