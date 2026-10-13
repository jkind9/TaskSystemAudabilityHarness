---
description: Turn a plan (or the plan just discussed) into task files under docs/tasks/open with frontmatter + receipts, satisfying the task gate
argument-hint: [plan text | path to a plan .md | empty to use the plan from this conversation]
---

# Plan → Tasks

Convert a plan into per-task files that conform to the canonical task system
(see `~/.claude/rules/task-management.md`). This is the front door that satisfies the
first-code-write task gate: after running it, at least one task is `status: in_progress`,
so code work flows freely.

## Phase 0 — Locate the task folder

1. Determine the repo's task convention, in this order:
   - If `docs/tasks/open/` exists → use `docs/tasks/`.
   - Else if `task_list/open/` exists → use `task_list/`.
   - Else create `docs/tasks/open/` and `docs/tasks/closed/` and a minimal
     `docs/tasks/README.md` from the canonical template referenced in
     `task-management.md` §7 (the PairsTrading `docs/tasks/README.md` is the reference).
2. Note the existing ID scheme by listing the folder. Continue it (ordinals `01,02,…`,
   or prefixed `E1,D3,…`). Do not collide with existing IDs in `open/` or `closed/`.

## Phase 1 — Get the plan

Resolve `$ARGUMENTS`:

| Input | Action |
|---|---|
| Empty | Use the plan just produced/discussed in THIS conversation. If there is none, ask the user for one sentence per step. |
| Path to a `.md` | Read it; treat its steps/phases as the plan. |
| Free-form text | Treat as the plan. |

Break the plan into **discrete, separately-shippable steps**. Each step that meets the
task-creation trigger in `task-management.md` §2 (a decision to lock, a bug that moves an
acceptance gate, or >1 session of work) becomes one task file. Fold true sub-steps into a
parent task's `How` checklist — do **not** create a file per trivial sub-step.

## Phase 2 — Write one file per task

For each step, write `<folder>/open/<ID>-<kebab-slug>.md` with this exact shape
(fill every frontmatter field you can infer; leave honest placeholders otherwise):

```markdown
---
id: <ID>
title: <one line>
status: in_progress        # FIRST task = in_progress; the rest = open
priority: <CRITICAL|HIGH|MED|LOW>
type: <decision|bug|refactor|infra>
files:                     # REQUIRED — repo-relative globs this task is allowed to touch.
  - <path/or/glob>         #   The code gate blocks any code write outside the in_progress task's files.
  - <another/path/**>      #   Be generous but honest: list the dirs/files this step will edit.
  - <tests/.../test_*.py>  #   Include the test file(s): the completion gate's tests floor expects one touched.
docs:                      # README(s)/docs the changed code lives under; the completion gate blocks
  - <path/to/README.md>    #   session end if a code-changing task's declared docs aren't updated (escape: docs n/a:).
blocked_by: []
blocks: []
verification_test: <path to the contract test, or "to be created">
baseline_metric:
  source: "<results file / metric source, or 'n/a'>"
  field: "<the metric this step moves>"
  baseline_value: "<number with units, or 'unmeasured'>"
  target: "<threshold for success>"
created: <today YYYY-MM-DD>
last_updated: <today YYYY-MM-DD>
superseded_by: null
---

## What
<the change in code-level terms; files/functions when known>

## Why
<root cause / motivation; cross-link to results, prior tasks, memory>

## How
<specific code locations, tests to add, expected before/after; sub-steps as a checklist>

## Verification
1. Contract test: <name the test file and the EXACT assertion>. Walk Right-BICEP (what: Right result,
   Boundary, Inverse, Cross-check, Error) + CORRECT (which boundaries: empty/one/many, range,
   does-it-mutate-input) and keep the rows that apply. Catalogue: task README "Testing standard".
2. Rigour: confirm the test FAILS without the change (red-first) or have it reviewed — not
   green-by-construction. (Return/output-type correctness is mypy's job, not a test's.)
3. Before/after: baseline = <number>; target = <number>. (Receipts record the after-value.)
   <If this step genuinely needs no test — rename/comment/pure-doc — write "tests n/a: <reason>".>

## Receipts (filled in when closed)
| Field | Value |
|---|---|
| Closing commit SHA | (fill in) |
| Files changed | (fill in) |
| Test status | (fill in) |
| Before measurement | <baseline> |
| After measurement | (fill in) |
| Delta | (fill in) |
| Decision-gate outcome | (fill in) |
```

Rules:
- Mark **exactly one** task `status: in_progress` — the one you'll start first
  (respect `blocked_by` ordering). The rest are `open`. More than one in_progress task
  blocks the code gate, so keep it to one active task.
- **Every task MUST have a `files:` list.** The code gate binds each code write to the
  in_progress task's `files:`; a task with no `files:`, or a write outside them, is blocked.
  List the files/dirs (globs OK, repo-relative) the step will edit — **including the test
  file(s)**. Update `files:` if scope grows mid-task rather than working around the gate.
- **Account for docs and tests at close.** The completion gate blocks session end when a
  code-changing task has no updated `docs:` or no test touched this session. Give each task a
  `docs:` list and a test in `files:`; for a change that needs neither, the one-line escapes are
  `docs n/a: <reason>` / `tests n/a: <reason>`.
- Set `blocked_by:`/`blocks:` between the steps you just created so the dependency
  order is explicit.
- Dates: get today's date from the environment context; do not invent one.

## Phase 3 — Report

Print a table: ID · title · status · blocked_by. State which task is `in_progress`
(the one the gate will now let you work under) and which file to open first.

Do **not** start implementing in this command — its job is only to create the task files.
Hand back to the user / main loop to begin the `in_progress` task.
