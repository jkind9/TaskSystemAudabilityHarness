---
id: "25"
title: Untrack skills/synced
status: closed
priority: LOW
type: refactor
blocked_by: []
blocks: []
verification_test: ""
plan_reviewed: null
files:
  - .gitignore
docs:
  - README.md
baseline_metric:
  source: ""
  field: ""
  baseline_value: ""
  target: ""
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 25 — Untrack skills/synced

## Current state

- Last test: env -u ECC_TASK_FLOW node --test task-system/tests/*.js -> exit 0 (198/198) at 66230f6
- Next action: none; closed.
- Open decisions: none
- Handoff note: Claude (Opus 5.5), 2026-10-13. Owner asked to tidy the git tree and untrack everything except the main repo, then chose "untrack skills/synced only".

## Clarifications

### Owner decision, 2026-10-13

- Untrack skills/synced only. Files stay on disk and keep working; history keeps the old copy.

## In plain English

A folder of skills is copied in from the owner's Claude account and changes whenever it syncs. It was tracked, so the repository always showed unrelated edits. This stops tracking it so the repository shows only the harness's own work.

## What

Add `skills/synced/` to `.gitignore` and remove it from the index (`git rm -r --cached skills/synced`). Nothing is deleted from disk.

## Why

225 tracked files that change outside the harness's control kept the working tree dirty (8 modified and 1 new file at the start of this work) and dirtied tracked-file checks during the v1/v2 version switch (task 20 had to exempt them in tools/install-version.cjs).

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Installed skills link points at skills/ as a whole, so ignoring a subfolder changes nothing at runtime | tools/install.cjs | both homes | tools/install.cjs:90 |
| The version switch already exempts skills/synced from its clean-tree check | tools/install-version.cjs | install --version | tools/install-version.cjs:32 |

hyperparameters n/a: not an experiment.

invariants n/a: removes files from the index only.

## Verification

`git ls-files skills/synced` prints nothing; `ls skills/synced` still lists the folder; `git status --short` shows no skills/synced lines; validate and tests pass unchanged (tests n/a: no code changed; the full suite is the regression check).

## Receipts

| field | value |
|---|---|
| closing commit | 2709161 (owner chose this option, 2026-10-13) |
| files changed | .gitignore (skills/synced/ added); 225 files removed from the index, none from disk |
| test | tests n/a: no code changed. Regression check: tests 198/198, validate 23/23, ~/.claude/skills/synced still resolves |
| before / after | git ls-files skills/synced: 225 -> 0; working tree had 8 modified and 1 new synced file, now none |
| result | done |

Notes / caveats / follow-ups:

- History still holds the old synced copy; a clean break would need a history rewrite, not requested.
