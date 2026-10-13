# The task system

A small, global task tracker for Claude Code. It lives in `~/.claude/task-system/` (the
`task.js` CLI + templates) plus `~/.claude/scripts/hooks/` (the enforcing hooks), and works
in **every** project with no per-project setup. Work is recorded as tasks; hooks make sure
code isn't changed — or a session ended — without one, and that the docs that describe the
code move with it.

One model, one runtime: state is the task file's **frontmatter** (`status:` + `files:` +
`docs:`) and the folder it sits in. The CLI and every hook read that same state — there is no
separate pointer file. Everything is Node (the only runtime ECC already needs).

## The pieces

| File | Role |
|---|---|
| `task-system/task.js` | the CLI you use to manage tasks (frontmatter-driven) |
| `task-system/template.md` | the blank a new task is created from |
| `scripts/task-plan-lint.js` | **CLI, run by hand** — deterministic plan checks on one task file (scope gaps), before implementation |
| `agents/plan-reviewer.md` | **agent, run by hand** — fresh-context review of a HIGH task's plan against the actual code |
| `scripts/hooks/task-gate.js` | **PreToolUse** — blocks a 2nd+ code edit not matched by the active task's `files:` |
| `scripts/hooks/docs-snapshot.js` | **SessionStart** — baselines the working tree so the docs check is per-session |
| `scripts/hooks/task-complete-gate.js` | **Stop** — blocks ending the session on unfilled receipts or un-updated `docs:` |
| `scripts/hooks/deps-surface.js` | **Stop** — non-blocking: lists modules that import each changed `.py` |
| `scripts/hooks/task-nudge.js` | **Stop** — non-blocking: nudges if code changed with no task touched |

## States are folders

Each task is one Markdown file. The folder it sits in is its state: `open/`,
`pending_review/`, `closed/`, `stale/`, `archive/`. Inside `open/`, the **active** task is
the single file with `status: in_progress` — that's what the gates bind to. The folder is
the board; `git` is the history (if the repo tracks the task folder — check it isn't
gitignored; 24H_Insights ignores `task_list/`, so there the files are the only record).

## The rules the hooks enforce

1. **Before a 2nd+ code edit, there must be one `in_progress` task, and the file must be in
   its `files:` list.** (The first code file in a session is a free single-file escape.)
2. **A code-changing task can't end the session with unfilled receipts** — the `## Receipts`
   section (only that section — a `(path)` in prose elsewhere doesn't count) still shows
   `(fill in)` OR has a table row with a blank value cell (deleting the marker text is not
   filling it in) — unless you write `still open because <reason>`.
3. **A code-changing task can't end the session with un-updated `docs:`** — every declared
   doc must be edited *this session*, or you write a one-line `docs n/a: <reason>`.

All hooks **fail open** (any internal error → they get out of the way) and are read at
startup. A genuine one-off: there's no global off-switch by design — open a throwaway task,
or write the `docs n/a:` / `still open because` escapes.

## The commands

Run from the project root (the CLI finds the project's task folder by looking up from where
you are — and, in a git worktree, it finds that worktree's own task folder):

```
node ~/.claude/task-system/task.js list                 # open tasks + active (* = in_progress)
node ~/.claude/task-system/task.js list --all            # every state
node ~/.claude/task-system/task.js new "short title" --files src/x.py,tests/test_x.py --docs src/README.md
node ~/.claude/task-system/task.js start 12              # make open task 12 the active one
node ~/.claude/task-system/task.js current               # what am I on?
node ~/.claude/task-system/task.js show 12               # print task 12 in full
node ~/.claude/task-system/task.js move 12 pending_review
node ~/.claude/task-system/task.js move 12 closed        # refused until receipts are filled
node ~/.claude/task-system/task.js init                  # just make the task folder here
node ~/.claude/task-system/task.js ready                 # what can start now + pending_review ages + board health
node ~/.claude/task-system/task.js lint                  # board invariant check (exit 1 on errors)
node ~/.claude/task-system/task.js renumber 263 274      # give a task a new unique id (accepts a file path too)
node ~/.claude/task-system/task.js review 12 PASS        # stamp plan_reviewed: <date> PASS after the plan review
node ~/.claude/task-system/task.js audit                 # read-only board drift report (--json for snapshots)
```

`lint` machine-checks what used to be informal: unique task IDs, status↔folder agreement,
at most one `in_progress`, `blocked_by`/`superseded_by` targets exist, and closed tasks
have filled receipts — section-scoped, and a blank table value cell counts as unfilled.
Warnings (not errors) flag open tasks whose blockers are already closed. `ready` is the
"what next" view: unblocked open tasks priority-sorted, blocked tasks with what they wait
on, the pending_review queue oldest-first with days-parked (task-nudge.js prints the same
ageing line at session Stop once a task passes 14 days), and a one-line board-health
summary so drift is visible without a separate lint run.
Run `lint` when picking up a board and before batch-moving files.

Hardening (2026-07-20): a DUPLICATED id makes `show`/`start`/`move` refuse with every
matching path (never first-match-wins) — `renumber` one copy, passing its file path.
`new` refuses to mint an id that already exists in any folder. Every `new`/`move`/
`renumber` appends one line to `<task_root>/.journal.log` — the local history where the
task folder is gitignored. The Stop gate's tests floor is per-session (a test file dirty
since before the session doesn't count) and, when `verification_test:` is a real path,
the touched test must match it or the task's `files:` scope.

`new` makes the next-numbered file in `open/`, fills the template (including your `--files`
and `--docs`), and marks it `in_progress`. `start`/`new` keep the "exactly one in_progress"
invariant by demoting any previously-active task back to `open`.

## Writing a task

Same shape as `template.md`:

- **What** — in plain words, what we're doing and what's different when it's done.
- **Why** — the problem it fixes or the question it answers.
- **How** — lead with a **Reuse evidence** table: one row per "this already exists / X owns
  this" claim, each with a real `file:line` in the Evidence column. A claim without evidence
  is a guess — the failure this replaced (a one-line "reuse scan") allowed keyword-level
  grepping to pass as tracing, and a plan once named the wrong owner file for a behaviour
  without any gate noticing. Then the plan: the `files:` it touches and the `docs:` those
  files live under.
- **Invariants and recovery** — for HIGH/CRITICAL, stateful, multi-process, or deployed
  work: a table tracing each boundary-crossing datum (producer → consumer, representation,
  restart survival, all with file:line), plus source-of-truth, process-death-at-each-
  transition, fresh-deploy, and backward-compatibility lines. For a task with none of that,
  one line: `invariants n/a: <reason>`.
- **Verification** — name the test file and the exact assertion, plus before/after on the
  real number.
- **Receipts** — left with `(fill in)` markers until the task closes, then filled with the
  closing commit, files changed, test result, and the outcome.

Plain words. Say what happened and what the number was. No filler, no invented jargon.

## Reviewing a plan before starting it (HIGH tasks)

The pre-start ritual, run by hand **before** `task.js start` — deliberately not gates yet:

1. `node ~/.claude/scripts/task-plan-lint.js <task-file>` — deterministic checks. Errors:
   an in_progress task with an empty `files:` (E1), a `verification_test` matched by no
   `files:` glob (E2), a HIGH/CRITICAL in_progress task with no filled Invariants section
   and no `invariants n/a:` line (E4) or no reuse-evidence row carrying a real file:line
   (E5). Warnings: undeclared code paths in ## How prose (W1, table rows exempt), vague
   number-free criteria (W2), a non-numeric or empty `baseline_metric` (W3 — the lint has
   its own nested-block parser; the flat frontmatter parsers can't see inside it), and a
   missing plan-review stamp on HIGH/CRITICAL (W4). Exit 1 on errors.
2. `/clarify-task <id>` when anything material is still vague — a bounded interview (≤5
   questions, recommended option first), each answer recorded in the task file under
   `## Clarifications / ### Session <date>` and applied to the sections it affects.
3. Spawn the **plan-reviewer** agent (`~/.claude/agents/plan-reviewer.md`) on the task file.
   It starts with no shared context, reads the actual code, and runs six checks: trace each
   datum producer→consumer, trace control ownership of every side effect, walk process death
   at each state transition, walk a fresh deploy from the built artifact, hunt for one
   plan claim the current code contradicts, and check the plan against the project
   `CONSTITUTION.md` (a conflict with a MUST is BLOCKING). It returns PASS/FAIL with
   file:line-cited findings; fix the plan and re-review on FAIL.
4. Record the verdict so it is auditable: `task.js review <id> PASS|FAIL` — stamps
   `plan_reviewed: <date> <verdict>` (the template's `null` = never reviewed) and journals
   it. `task-plan-lint` W4 and `task.js audit` read the stamp.

Why: the completion-time gates catch missing receipts and stale docs, but by then a wrong
plan has already accumulated implementation cost. These run while the plan is still cheap
to change.

## The constitution and the board audit

- **`<task_root>/CONSTITUTION.md`** — the project's non-negotiable MUST principles, semver-
  versioned with a sync-impact log at the top; seeded from
  `task-system/constitution_template.md` by `task.js init` (never overwritten). Ratifying
  (removing the DRAFT marker) and amending are the owner's acts. The plan-reviewer checks
  every plan against it.
- **`task.js audit [--json]`** — read-only drift report over open + pending_review:
  declared `docs:`/`verification_test` paths that don't exist, HIGH open tasks missing
  invariants coverage or a plan-review stamp, board-README references to task files that
  moved, an inventory of every waiver line (`docs n/a:` / `tests n/a:` / `still open
  because`), and constitution presence. Severity-sorted, capped at 50 findings, always
  exits 0 — it reports, it never gates. `--json` gives machine-readable snapshots for
  before/after comparisons.

## Finishing a task

1. Do the work (the gate is happy — the task is active and the file is in its `files:`).
2. Update the declared `docs:` in the same session (or write `docs n/a: <reason>`).
3. Fill the **Receipts** table.
4. Move it on: `move <id> pending_review` (human checks it) or `move <id> closed`. You can't
   `close` with receipts still showing `(fill in)` — the CLI refuses (use `--force` only if
   you really mean to), and the Stop gate backs it up.

## Working a task in parallel (git worktrees)

When a task is an independent stream — especially if it touches the same docs as other
in-flight work — give it its own worktree + branch. Opt-in; without `--worktree` everything
behaves as above.

```
node ~/.claude/task-system/task.js start 12 --worktree            # branch off main, in its own tree
node ~/.claude/task-system/task.js start 12 --worktree --base develop
```

This makes a branch `<type>/<id>-<slug>` in `<repo>.worktrees/task-12/` and marks that
worktree's copy of the task `in_progress`. Because each worktree is its own checkout, the
gate guards each one independently — one worktree, one active task. `cd` in to work.

Finishing, from **inside the worktree**:

```
node ~/.claude/task-system/task.js move 12 pending_review   # commit + push + draft PR
node ~/.claude/task-system/task.js move 12 closed           # commit + push + open the PR
```

The PR body is a **handoff brief** built from the task's What / Verification / Receipts plus
the branch diff stat. Preview with `--dry-run`. After the PR merges:

```
node ~/.claude/task-system/task.js cleanup 12   # remove the worktree + delete the branch
```

Offline / solo: `move 12 closed --local-merge` merges into the base locally instead of opening
a PR — **only if the merge is clean**; on a conflict it refuses and leaves everything intact.
