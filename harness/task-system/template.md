---
id: "{{ID}}"
title: {{TITLE}}
status: open
priority: {{PRIORITY}}
type: {{TYPE}}
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
{{FILES}}
docs:
{{DOCS}}
baseline_metric:
  source: ""
  field: ""
  baseline_value: ""
  target: ""
created: {{CREATED}}
last_updated: {{CREATED}}
superseded_by: null
---

# Task {{ID}} — {{TITLE}}

## In plain English

_(Replace this paragraph before work starts. 2–5 sentences for a reader with NO project
context: what is the objective, and how will it be done? No acronyms, no file paths, no
invented names — the completion gate blocks a code-changing session while this is missing
or still the placeholder.)_

## What

One short paragraph in plain words: what are we actually doing, and what is
different once it's done?

## Why

What problem does this fix, or what question does it answer? Why is it worth the time?

## How

**Reuse evidence** — every "this already exists / lives here / is owned by X" claim gets a
row, with a real `file:line` in the Evidence column. A claim without evidence is a guess:
the plan-shaped failure this table exists to stop is keyword-level grepping passed off as
tracing (a plan once named the wrong file as the owner of a behaviour and no gate noticed).
If nothing comparable exists, write one row saying so and what you searched.

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| _one row per claim_ | _class/module that owns it_ | _who calls/reads it_ | _file.py:123_ |

The concrete plan: which files (the `files:` list above) get added or changed, the approach,
and anything this depends on. List every README/doc the changed code lives under in `docs:` —
the completion gate blocks the session from ending if you change this task's code but don't
update its declared docs this session (escape: a one-line `docs n/a: <reason>`).

## Hyperparameters

_Required when this task runs or writes an experiment (type: experiment, or `files:`
touching an experiment directory); otherwise replace this section's body with one line:
`hyperparameters n/a: <reason>`. A tunable value that never gets written down here is a
scientific choice nobody flagged as a choice — how frames are sampled, caps, seeds, model
settings, decode/resolution all shape results silently. Enumerate EVERY one. Only new or
deviating values need a fresh human ruling; inheriting a prior receipt's value unchanged
is a valid source. Run `node ~/.claude/scripts/hyperparam-audit.js <repo root>` first —
any key that diverges from prior use must carry a `deviates ... confirmed <date>` row,
and the ruling comes from the user, not from the model's judgment._

| name | value | source |
|---|---|---|
| _every tunable value_ | _value_ | _confirmed YYYY-MM-DD / inherited receipt-or-file:line / deviates from file:line because reason, confirmed YYYY-MM-DD / n-a reason_ |

The script itself mirrors this table in a module-level `HYPERPARAMETERS` dict (value +
provenance per entry, written into the result JSON) — the write-time hook blocks an
experiment entry script without one.

## Invariants and recovery

_Required for HIGH/CRITICAL tasks and anything stateful, multi-process, or deployed; for a
task with none of that, replace this section's body with one line: `invariants n/a: <reason>`.
Same evidence standard as the reuse table — an owner cell without a file:line is a guess._

| Concern | Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| _each datum/state that crosses a boundary_ | _file:line_ | _file:line_ | _units, coordinate space, schema_ | _how, or why not_ |

- **Source of truth:** _which file/store wins on disagreement_
- **Process/thread boundary:** _what crosses it, in what format_
- **Failure after each state transition:** _walk a kill at each step — what recovers, what dangles_
- **Fresh-deployment path:** _from built artifact to first successful run, using only documented commands_
- **Backward compatibility:** _what existing data/config must keep working, and how that is checked_

For HIGH tasks, the pre-start ritual (each step while the plan is still cheap to change):
1. `node ~/.claude/scripts/task-plan-lint.js <this file>` — deterministic checks (scope,
   invariants/reuse coverage, numeric baseline, vague criteria).
2. `/clarify-task <id>` if anything material is still vague — up to 5 recorded questions.
3. Spawn the `plan-reviewer` agent on this file — fresh context, reads the actual code
   (and the project `CONSTITUTION.md`, if present), hunts for a claim the code contradicts.
4. Record the verdict: `node ~/.claude/task-system/task.js review <id> PASS|FAIL` — the
   stamp lands in `plan_reviewed:` above; `null` means "never reviewed".

## Verification

How we'll know it worked — and it must be a *real* check, not one written to pass.

- **Contract test(s):** name the test file(s) and the **exact assertion(s)**. Walk **Right-BICEP**
  for *what* to test (Right result, Boundary, Inverse, Cross-check, Error) and **CORRECT** for
  *which boundaries* (empty / one / many, ranges, does-it-mutate-its-input). You don't need every
  row — name the ones that apply and why. Full catalogue: the "Testing standard" section of the
  project task README.
- **Rigour — not green-by-construction:** confirm each new test FAILS without the change
  (red-first), or have the tests independently reviewed. A test that passes no matter what the code
  does is worse than none. Scale the depth to how load-bearing the logic is — don't pad a trivial
  change with a dozen tautological tests.
- **Before/after on the real symptom:** quote the baseline number before the change and the target;
  the Receipts record the measured after.

The completion gate expects a test to have been added/updated when code changed. If this change
genuinely warrants none (rename, comment, pure-doc), write a one-line `tests n/a: <reason>`
(mirrors `docs n/a:`).

## Receipts

_(filled in when the task is closed — leave the (fill in) markers until then; a blank value
cell also counts as unfilled, so deleting a marker is not filling it in)_

| field | value |
|---|---|
| closing commit | (fill in) |
| files changed | (fill in) |
| test | (fill in) |
| before / after | (fill in) |
| result | (fill in) |

Notes / caveats / follow-ups:

-
