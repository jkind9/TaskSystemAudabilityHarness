---
description: Bounded pre-start clarification interview on a task file (max 5 questions); answers are recorded in the task under ## Clarifications and applied to the sections they affect
argument-hint: [task id or path to a task .md | empty to use the active task]
---

# Clarify a task before starting it

Reduce ambiguity in a task plan by asking the owner a few targeted questions and writing the
answers back into the task file — before implementation cost is sunk. Adapted from
spec-kit's `clarify` for the task-file system in `~/.claude/rules/task-management.md`.
Run after `task-plan-lint.js` and before the plan-reviewer agent, on HIGH/CRITICAL tasks or
any plan that feels underspecified.

## Phase 0 — Resolve the task file

`$ARGUMENTS` is a task id (resolve via `node ~/.claude/task-system/task.js show <id>` to get
the path), a path, or empty (use the single `status: in_progress` task in `open/`). Read the
whole file. Also read `<task_root>/CONSTITUTION.md` if it exists — never ask a question the
constitution already answers.

## Phase 1 — Scan for ambiguity

Judge each category as Clear / Partial / Missing **for this task**:

1. **Scope and behaviour** — what exactly changes, what is explicitly out of scope.
2. **Data and representation** — units, coordinate spaces, schemas, formats at each boundary.
3. **Consumers and integration** — who reads/calls the changed thing; migration for them.
4. **Edge cases and failure handling** — empty/one/many, bad input, crashes mid-operation.
5. **Constraints and trade-offs** — locked decisions, rejected alternatives, budgets.
6. **Completion signal** — the measurable number or test that says "done" (the
   `baseline_metric` and `## Verification` sections; vague adjectives are a Missing here).

## Phase 2 — Ask (the hard rules)

- **At most 5 questions total**, one at a time, never revealing later questions.
- Only ask what **materially changes** the implementation, verification, or scope — rank
  candidates by (impact if wrong) × (uncertainty), take the top ones, drop the rest.
- Each question must be answerable with a short multiple choice (2–5 options) or a phrase of
  at most 5 words. Present a **recommended option first**, with one line of reasoning.
  Use the AskUserQuestion tool when available; otherwise plain numbered options.
- Skip the phase entirely (say so) if everything material is already Clear — do not pad.

## Phase 3 — Record and apply each answer immediately

After EACH accepted answer, before the next question:

1. Ensure a `## Clarifications` section exists (create it after `## Why`), with a
   `### Session YYYY-MM-DD` subheading for today.
2. Append one line: `- Q: <question> → A: <final answer>`.
3. Apply the answer to the section it affects (`What`, `How`, `Invariants and recovery`,
   `Verification`, `files:`/`docs:` lists, `baseline_metric`) — **replace** contradicted
   text, don't duplicate it. Keep the plain-language standard in `## In plain English`.
4. Save the file now (not at the end) so an interrupted session loses at most one answer.

## Phase 4 — Close out

Re-run `node ~/.claude/scripts/task-plan-lint.js <task-file>`; if the task is HIGH/CRITICAL,
remind that the plan-reviewer agent + `task.js review <id> PASS|FAIL` come next, then
`task.js start <id>`.
