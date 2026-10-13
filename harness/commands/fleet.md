---
description: Run 3-5 Claude sessions side by side on this repo, one git worktree each.
---

# /fleet — several Claude sessions on one repo

Each session gets its own git worktree and its own branch, so they never fight over the
working tree. On this machine `tmux` is not installed, so each session opens as a
colour-coded Windows Terminal tab instead.

## Usage

`/fleet $ARGUMENTS`

Arguments map straight onto the script:

| You type | What runs |
|---|---|
| `/fleet` or `/fleet status` | `node ~/.claude/scripts/worktree-fleet.js status` |
| `/fleet up 3` | `... up --count 3` |
| `/fleet up 4 --analysis` | four working worktrees plus one named `analysis` for logs and queries |
| `/fleet plan 3` | `... up --count 3 --dry-run` — prints the plan, creates nothing |
| `/fleet down a` | remove worktree `a` (refuses if it has uncommitted work) |
| `/fleet down --all --force` | tear the whole fleet down, discarding uncommitted work |
| `/fleet aliases` | print PowerShell `za` / `zb` / `zc` shortcuts to paste into `$PROFILE` |

Run the script from the repo root. Worktrees land in a sibling folder,
`<repo>-fleet/<name>`, on branches `fleet/<name>`.

## What to do after launching

Give each tab a job that does not overlap with the others, and say so out loud in each
session. Overlapping jobs is the failure mode: two sessions editing the same file on
different branches produces a merge you have to referee by hand.

A split that works:

- `a` — the change itself
- `b` — the tests for that change
- `c` — an independent review of `a`'s diff, started fresh with no knowledge of the intent
- `analysis` — logs, result files, queries. Read-only. Never edits the repo.

## Rules

1. **One task per worktree.** The task system allows one `in_progress` task per checkout, and
   each worktree is its own checkout, so this works — but write the task file before starting.
2. **Never share a branch between two tabs.** `up` gives each worktree its own branch for
   exactly this reason.
3. **Merge back through the main checkout**, not between fleet worktrees.
4. **`down` before you forget.** A stale worktree with a half-finished branch is the thing that
   confuses the next session. `status` reports drift between the manifest and git.

## Checking on the fleet

`status` reconciles `<repo>/.claude/fleet.json` against `git worktree list` and reports
anything that disagrees. Git is the source of truth; the manifest is a convenience.
The status line shows `wt:<name>` so each session knows which worktree it is in.
