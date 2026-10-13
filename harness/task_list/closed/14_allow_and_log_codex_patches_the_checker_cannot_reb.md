---
id: "14"
title: Allow and log Codex patches the checker cannot rebuild
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_patch_rebuild.js
plan_reviewed: null
files:
  - tools/patch.cjs
  - tools/dispatch.cjs
  - tools/validate.cjs
  - task-system/tests/test_patch_rebuild.js
docs:
  - README.md
baseline_metric:
  source: "Study 2 pilot, FINDINGS.md item 3 (hook-runs of all 9 sessions)"
  field: "edits refused with 'Patch context absent'"
  baseline_value: "13 refusals in 9 sessions"
  target: "0 refusals for a failed rebuild; scope refusals unchanged"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 14 — Allow and log Codex patches the checker cannot rebuild

## Current state

- Last test: node tools/validate.cjs -> exit 0 (22 checks); node --test task-system/tests/*.js -> 153/153
- Next action: none; closed with commit d7b5886.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner approved committing once validate and tests pass.

## In plain English

Before one assistant changes a file, the harness works out what the file will look like afterwards so its checks can judge it. When it could not work that out, it refused the change, and the assistant had to re-read the file and try again. Now it lets the change through, still checks that the file belongs to the current task, and writes the case to a log. It also treats curly quotes and long dashes as plain ones when matching text, as the assistant itself does.

## What

`tools/patch.cjs`: `seek` gains a fourth comparison that maps typographic dashes, quotes and odd spaces to ASCII after trimming (the same table as Codex's `seek_sequence` normaliser). When an Update hunk's context or anchor is still not found, `editsFromPatch` no longer throws: it returns the file's current content with `unrebuilt: true` (and the Move-to target if any). `tools/dispatch.cjs` logs `{unrebuilt: [paths]}` to `state/hook-runs.jsonl`. Unsupported input and patches with no file operations still refuse.

## Why

FINDINGS.md item 3: the checker refused 13 edits in 9 pilot sessions with "Patch context absent". The hand-checked ones were bad patches that Codex would also reject (one carried PowerShell mojibake). Each refusal cost a refusal message, a re-read and a retry, and every step re-sends the conversation.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Patch rebuild and its throw | tools/patch.cjs `editsFromPatch` | dispatch.cjs `inputsFor`, validate.cjs | tools/patch.cjs:58 (before) |
| Line matching ladder | tools/patch.cjs `seek` | editsFromPatch | tools/patch.cjs:4-12 (before) |
| A throw in inputsFor becomes a refusal | tools/dispatch.cjs main catch | Codex PreToolUse | tools/dispatch.cjs:268-273 |
| Task gate judges by path | scripts/hooks/task-gate.js | PreToolUse | scripts/hooks/task-gate.js:24,98 |

hyperparameters n/a: not an experiment.

invariants n/a: no new state; one log line per unrebuilt patch. Backward compatibility: every existing patch check in validate.cjs still passes.

## Verification

`task-system/tests/test_patch_rebuild.js`: (1) a file with curly quotes, an en dash, a non-breaking space and curly apostrophes is matched by a plain-ASCII patch and rebuilt exactly; (2) a missing line is not invented: the edit is `unrebuilt` with today's content; (3) a declared file with mojibake context is allowed (no deny) and `hook-runs.jsonl` has its `unrebuilt` entry; (4) an undeclared second code file with bad context is refused with "TASK GATE"; (5) non-patch input is still refused. Red-first: 1–3 failed and 4 failed its TASK GATE assertion before the change. `tools/validate.cjs` adds the declared/undeclared pair.

## Receipts

| field | value |
|---|---|
| closing commit | d7b5886 (owner approved the commit 2026-10-13) |
| files changed | tools/patch.cjs (plain-form matching; unrebuilt instead of throw), tools/dispatch.cjs (log), tools/validate.cjs (new check), task-system/tests/test_patch_rebuild.js (new), README.md |
| test | validate.cjs pass, 22 checks; task-system tests 153/153 |
| before / after | a patch with unmatched context on a declared file: before refused ("Patch context absent"); after allowed and logged. Undeclared file: refused before and after (now by the task gate) |
| result | failed rebuilds no longer cost a refusal; scope is still enforced |

Notes / caveats / follow-ups:

- The size gate sees today's content for an unrebuilt file, so a patch whose context does not match can grow a file without the size gate seeing it. Codex rejects a patch whose context does not match, so in practice such a patch does not land.
