# Task Management — per-task files with receipts (CANONICAL)

This is the canonical engineering-traceability system. It is **not** documentation — it is the
auditable record of what work is open, what shipped, and the receipts that prove it. It is a
deliberate, named exception to the README-only policy in [documentation.md](documentation.md);
that policy governs *documentation*, this rule governs *task tracking*.

Derived from the system that has worked best in practice (the PairsTrading `docs/tasks/` system):
one file per task, YAML frontmatter for grep-able status, five fixed sections, lifecycle folders
moved via `git mv`, and a closure invariant that distinguishes "code shipped" from "task done".

## 0. The task lifecycle contract — your responsibility, hook-enforced (READ FIRST)

Code work is **accountable to a named task**. The hooks enforce the structure; you own the
intent. Three obligations, at three moments:

**BEFORE writing code — establish the task.**
Decide: does an in_progress task already cover this work? If yes, confirm the file you're about
to edit is in its `files:` scope. If no, create/open one (run `/plan-to-tasks`, or write
`docs/tasks/open/<ID>-<slug>.md` / `task_list/open/` with `status: in_progress` AND a `files:`
list naming what it will touch). Exactly **one** task may be in_progress at a time.

**Same moment — scan for what already exists.** Before writing any new function, helper,
dataclass, or module, grep the repo first: search the likely function/class names, file names,
and obvious synonyms for the thing you're about to build. If a block already does the job (or
most of it), use or extend it instead of writing a second one. Here, before the code exists, is
the cheapest place to prevent duplication — the alternative is a later dedup task once the copies
have drifted apart (same-name-different-shape types, two helpers that do one job). Record the
result in the task's How section (§5) as **evidence rows with file:line**, not prose claims.

**Before `start` on a HIGH/CRITICAL task — review the plan while it is cheap to change.**
The pre-start ritual, run by hand. `task.js start` refuses a HIGH/CRITICAL task until step 4
has stamped PASS (`--force` overrides and is journaled):
1. `node ~/.claude/scripts/task-plan-lint.js <task-file>` — deterministic checks: empty
   `files:` (E1), `verification_test` outside the `files:` globs (E2), missing invariants
   coverage on HIGH/CRITICAL (E4), no reuse-evidence row with a real file:line (E5),
   missing or unstamped hyperparameter table on an experiment task (E6/E7),
   undeclared paths in How prose (W1), vague number-free criteria (W2), non-numeric or
   empty `baseline_metric` (W3), missing plan-review stamp (W4).
2. `/clarify-task <id>` when anything material is still vague — a bounded interview (max 5
   questions, recommended option first); each answer is recorded in the task file under
   `## Clarifications / ### Session <date>` and applied to the sections it affects.
3. Spawn the **plan-reviewer** agent (`~/.claude/agents/plan-reviewer.md`) on the task file.
   It reads the code with no shared context and runs six checks — trace each datum
   producer→consumer, trace ownership of every side effect, walk process death at each
   state transition, walk a fresh deploy, hunt for one plan claim the current code
   contradicts, and check the plan against the project's `CONSTITUTION.md` (a conflict
   with a MUST is BLOCKING) — returning PASS/FAIL with file:line findings. On FAIL, fix
   the plan and re-review before implementing.
4. Record the verdict: `node ~/.claude/task-system/task.js review <id> PASS|FAIL` — stamps
   `plan_reviewed:` in the frontmatter (the template's `null` = never reviewed) and
   journals it, so "a review happened" is auditable, not a memory.
Rationale: the completion gates fire after the code exists,
when a wrong plan has already accumulated cost; this stage is where semantic errors (wrong
owner file, changed data contract with an unmodified consumer) are catchable for free.

**WHILE working — keep the task honest.**
The code gate (`task-gate.js`, PreToolUse on code Write/Edit) binds each write to the single
in_progress task: it blocks unless the file matches that task's `files:` globs. If the work
legitimately grows to new files, **add them to the task's `files:`** — don't route around the gate.
Update the `How` checklist as you go.

The size gate (`file-size-gate.js`, same trigger) binds each write to the 800-line limit: a code
file may not cross it, and one already over it may not grow by a single line. Put the new code in
a new module and import it. If this task *is* the split, add that path under a **`shrinks:`** key
beside `files:` — the gate then allows growth mid-split, and `task.js verify --since <sha>` refuses
to pass unless the file ends up smaller than it started. `verify` also fails any changed code file
that is both over the limit and larger than at `--since`. There is no waiver: the escape is a
promise the tooling measures. `task.js audit` lists every oversized file and its promised owner.

**WHEN done — close the loop.**
The completion gate (`task-complete-gate.js`, Stop) blocks session end if an in_progress task,
whose code changed, still has **unfilled receipts**, an unsatisfied **`docs:`** contract, or **no
test added/updated** this session. To resolve: fill the Receipts table (closing commit, files
changed, before/after, outcome), update the declared docs, add or adjust the test that pins the
change, set `status: closed`, and `git mv` the file to `closed/` (or `pending_review/` if a named
follow-up remains). The tests floor only proves a test was *touched* — write it to catch a bug, not
to pass: cover the behaviour + boundaries + error path, and confirm it fails without the change
(red-first) or have it reviewed (the task README's "Testing standard" carries the Right-BICEP /
CORRECT catalogue). Escapes, one line each: `tests n/a: <reason>` and `docs n/a: <reason>` for a
change that genuinely needs none. If the work genuinely continues next session, leave it
in_progress but write a one-line `still open because <reason>` in the receipts so the dangling
state is intentional, not forgotten (this also exempts it from all three gates).

**When a gate blocks (`[Hook] TASK GATE` / `TASK COMPLETION GATE`): it is a STOP-AND-REDIRECT,
not a transient error. Do NOT retry the identical action — it blocks identically and wastes
tokens.** The block clears only when you change the world (open/scope/close a task). Anti-loop
rule: the next action after a gate block is always a task operation (create it, add the file to
its `files:`, mark exactly one in_progress, or fill receipts + move it) — never the same write.

## 1. Where tasks live

```
docs/tasks/
├── README.md            # the index: convention, lifecycle, template (see §7)
├── CONSTITUTION.md      # owner-ratified MUST principles, semver-versioned (plan review checks plans against it)
├── open/                # active + blocked + in_progress
├── closed/             # shipped with receipts, all follow-ups landed (git mv from open/)
├── pending_review/     # engineering done + verified, but a named non-eng blocker remains
├── stale/              # neither done nor wrong; reason-for-being lapsed (git mv from open/)
└── archive/            # superseded files preserved for history (git mv)
```

- **Default location is `docs/tasks/`.** If a repo already uses `task_list/` at root, keep it —
  first existing convention wins; do not migrate a working folder to satisfy this rule.
- Lifecycle transitions use `git mv` so `git log --follow docs/tasks/<folder>/X.md` shows the full
  history. `closed/`, `pending_review/`, and `stale/` are all **off the open-work surface**.

## 2. When to create a task file

Create a file in `open/` when **any** of:

- (a) a **decision** that needs to be locked (and, where relevant, citation-backed), OR
- (b) a **bug** whose fix would change the project's acceptance gates / definition of done, OR
- (c) an **infra/refactor** task that takes more than one working session.

It is **not** a task file (handle inline / elsewhere) when:

- It's a sub-step of one task → inline checklist in that file's `How` section.
- It's a typo, comment fix, or single-commit cleanup → just do it.
- It's a "we should think about X" with no code/experiment payoff → design notes, not a task.
- It's cross-session recall ("Claude needs to remember X") → `~/.claude/projects/.../memory/`, not here.

This selective trigger is the whole point: the open folder must stay scan-able. Do not file a
task for trivial work, and do not let a task file carry substance that belongs in the receipts.

## 3. File naming

```
<ID>_<short_snake_slug>.md
```

`<ID>` is the canonical reference (`H0a`, `E1`, `D3`, `B7`, or a zero-padded ordinal `06`). The
slug is only for human readability when listing files. The ID is what other tasks cite in
`blocked_by:` / `blocks:` / `supersedes:`. The separator is an **underscore** — `task.js`
derives the id from everything before the first `_`, so a kebab-case name would corrupt id
parsing (this corrects an older version of this rule that said kebab).

## 4. Frontmatter (grep-able status)

```yaml
---
id: H0a
title: Re-hedge β every bar
status: open              # open | in_progress | blocked | pending_review | closed | stale | archived | superseded
priority: HIGH           # CRITICAL | HIGH | MED | LOW
type: decision           # decision | bug | refactor | infra
blocked_by: [H0c]        # task IDs (YAML list, [] if none)
blocks: []               # task IDs (YAML list, [] if none)
verification_test: tests/test_kalman_rehedge.py   # the contract test that proves the change
plan_reviewed: null      # stamped by `task.js review <id> PASS|FAIL`; null = never reviewed
baseline_metric:         # the symptom the change targets, with a real number
  source: "results.md §B6"
  field: "P(win | reverted) − P(win | wrong)"
  baseline_value: "+3 pp"
  target: ">+10 pp gap"
created: 2026-06-01
last_updated: 2026-06-01
superseded_by: null      # task ID if superseded, else null
---
```

Frontmatter invariants (machine-checked where noted):
- `status: closed` ⇒ file is in `closed/`, not `open/` (`task.js lint`).
- `blocked_by: [X]` ⇒ X exists as a file in `open/` (`task.js lint`).
- `superseded_by: Y` ⇒ Y exists and references this file back (`task.js lint`, warning).
- `baseline_metric.baseline_value` is a **number with units**, not a vague description
  (`task-plan-lint.js` W3 — the lint parses the nested block; a digit-free value warns).
- `plan_reviewed:` carries a real `<date> PASS|FAIL` on HIGH/CRITICAL before start
  (`task-plan-lint.js` W4; board-wide via `task.js audit`).

Board-wide drift (declared docs/tests that don't exist, stale README task links, waiver
inventory, constitution presence) is reported read-only by `task.js audit [--json]`.

## 5. The six required sections

Every task file has, in order:

0. **In plain English** — 2–5 sentences for a reader with NO project context: what is the
   objective, and how will it be done? No acronyms, no file paths, no invented names. This is
   the one task-file section held to the human-facing plain-language standard (the rest of the
   file is an engineering record; precise terms belong there). The completion gate blocks a
   code-changing session while this section is missing, still the template placeholder, or
   effectively empty — deliberately no escape: if the task is real, it is explainable in plain
   words. `task.js start` scaffolds the section into legacy files when they are picked up.
1. **What** — the change in code-level terms. Specific files / functions / lines when known.
2. **Why** — the root cause it addresses; what the evidence/literature says. Cross-link.
3. **How** — specific code locations, tests to add, expected before/after. Lead with a **Reuse
   evidence** table: one row per "this already exists / X owns this" claim, with columns
   Claim | Existing owner | Callers/consumers | Evidence, where Evidence is a real `file:line`
   you read. A claim without evidence is a guess — the one-line "reuse scan" this replaces
   allowed keyword-level grepping to pass as tracing, and a plan once named the wrong owner
   file for a behaviour without any gate noticing. If nothing comparable exists, one row
   saying so and what was searched. A task that adds new code without this table is incomplete.
3b. **Invariants and recovery** — required for HIGH/CRITICAL tasks and anything stateful,
   multi-process, or deployed (otherwise one line: `invariants n/a: <reason>`). A table
   tracing each datum that crosses a boundary — Producer/owner | Consumer | Representation
   (units, coordinate space, schema) | Survives restart? — at the same file:line evidence
   standard, plus lines for: source of truth, what crosses each process/thread boundary,
   what recovers if the process dies after each state transition, the fresh-deployment path
   from built artifact to first successful run, and backward compatibility.
3c. **Hyperparameters** — required for experiment tasks (`type: experiment`, or `files:`
   touching an experiment directory); otherwise one line: `hyperparameters n/a: <reason>`.
   A table — name | value | source — enumerating EVERY tunable value the experiment runs
   with: sampling strategy, caps, seeds, model settings, decode/resolution, thresholds,
   aggregation. The failure this section exists to stop: a tunable value that enters the
   code as an unexamined default is a scientific choice nobody flagged as a choice (a
   deterministic stride bank sampling shipped in a submitted paper this way; an external
   reviewer, not a gate, caught it). Sources, machine-checked by `task-plan-lint.js`
   E6/E7: `inherited <receipt-or-file:line>` (prior value reused unchanged — no fresh
   ruling needed), `confirmed <date>` (a new value the user ruled on — new and deviating
   values are the user's call, never assumed), `deviates from <file:line> because
   <reason>, confirmed <date>`, or `n/a <reason>`. Before filling the table, run
   `node ~/.claude/scripts/hyperparam-audit.js <repo root>` — it diffs every
   `HYPERPARAMETERS` dict and receipt JSON in the repo and reports keys whose values
   diverge across sources, so an accidental inconsistency with earlier experiments is
   caught before the run, not after. The script itself must mirror the table in a
   module-level `HYPERPARAMETERS` dict written into the result JSON
   (`hyperparam-gate.js` blocks an experiment entry script without one).
4. **Verification** — the two-part standard, both parts filled with concrete numbers:
   - *Contract test*: name the test file and state the **exact assertion** (not "proves X works").
   - *Before/after on the motivating symptom*: quote the baseline number before any change, and
     state the target. The Receipts record the actual after-measurement at closure.
5. **Receipts** (filled in when closed) — a table: closing commit SHA, files changed, test status,
   before measurement, after measurement, delta, decision-gate outcome. Free-text notes below for
   caveats, follow-ups, surprises.

For a doc-only or no-code sweep, the standard still applies: the "contract test" becomes the
doc-claim ↔ code-reality check; the "before/after" is the sweep result.

## 6. The closure invariant (what makes this auditable)

> A task may not move `open/` → `closed/` unless the Receipts table is fully populated AND every
> named follow-up (citation upgrade, sweep, validation) has either landed or been explicitly waived
> in the receipts.

This is the contract that separates "the code shipped" from "the task is verified-done". If a named
follow-up is outstanding but the engineering is shipped + verified, the file goes to
`pending_review/` (not `closed/`), and its receipts must name what has to land for it to close.

## 7. Bootstrapping a new project

When a project first needs task tracking, create `docs/tasks/README.md` from the canonical template
(the PairsTrading `docs/tasks/README.md` is the reference implementation) and the `open/` + `closed/`
folders. Then file the first task. The `README.md` carries the convention, lifecycle table, and
file template so the system is self-documenting — this is the one place a `docs/tasks/*.md` file
that isn't a per-task file is allowed.

## 8. Relationship to other surfaces

| Surface | Role |
|---|---|
| `docs/tasks/open\|closed\|...` | Authoritative for *what each task is and where it stands* (this rule) |
| `~/.claude/projects/.../memory/*.md` | Claude's cross-session auto-memory ("don't relitigate"). Independent. A closed task may also have a memory entry; they serve different purposes. |
| `README.md` files | User-facing documentation of *how the code works*. Not a task tracker. |
| `~/.claude/plans/*.md` | Multi-session implementation plans. A plan may spawn several task files. |

A finding is **not** a task. Where a finding has a task, link both ways.
