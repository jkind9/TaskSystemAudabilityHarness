# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

# Video output codec
When writing video files in any project, always use a codec Chromium/VS Code can play:
H.264 for `.mp4` (OpenCV: `cv2.VideoWriter_fourcc(*"avc1")`, check `writer.isOpened()`).
Never use `"mp4v"` (MPEG-4 Part 2) — it produces files that cannot be played inside
VS Code or any Chromium-based viewer. On this machine ffmpeg has no libx264; use
`-c:v h264_mf` for CLI encodes.

# Task workflow (all projects)

Work is tracked as **tasks**. The CLI (`~/.claude/task-system/task.js`) and the enforcing hooks
(`~/.claude/scripts/hooks/`) apply to every project automatically — no per-project setup. State is
the task file's **frontmatter** (`status:` + `files:` + `docs:`) and the folder it sits in: `open/`
(the active task = `status: in_progress`), `pending_review/`, `closed/`, `archive/`.

**Before a 2nd+ code edit there must be one `in_progress` task, and the file must be in its
`files:` list.** A PreToolUse hook blocks otherwise — this is on purpose, not a bug. When you hit
it, or before starting code work:

    node ~/.claude/task-system/task.js list                                  # open tasks + active
    node ~/.claude/task-system/task.js start <id>                            # make an open task active
    node ~/.claude/task-system/task.js new "title" --files src/x.py --docs src/README.md

**A code-changing task can't end the session** with unfilled receipts or un-updated `docs:` — a
Stop hook blocks it. Update the declared docs **this session** (or write a one-line
`docs n/a: <reason>`), fill the **Receipts** table, then move it on:

    node ~/.claude/task-system/task.js move <id> pending_review
    node ~/.claude/task-system/task.js move <id> closed    # refused until receipts are filled

Write each task in plain English: **What** / **Why** / **How** (lead with a **Reuse evidence**
table — every "this already exists / X owns this" claim gets a `file:line`) / **Invariants
and recovery** (HIGH/stateful work; else `invariants n/a: <reason>`) / **Verification** /
**Receipts**.

**Before `task.js start` on a HIGH/CRITICAL task**, review the plan while it's cheap to fix:
`node ~/.claude/scripts/task-plan-lint.js <task-file>` (deterministic checks: scope,
invariants + reuse-evidence coverage, numeric baseline, vague criteria), `/clarify-task <id>`
if anything material is vague (≤5 questions, answers recorded in the file), then the
**plan-reviewer** agent on the task file (fresh context, reads the code and the project
`CONSTITUTION.md` if present, hunts for a plan claim the code contradicts). Fix the plan on
FAIL, then record the verdict — `node ~/.claude/task-system/task.js review <id> PASS|FAIL` —
then start.

**Before closing a HIGH/CRITICAL or stateful task**, review the finished diff the same way the
plan was reviewed: spawn the **diff-reviewer** agent with `git diff` plus the touched paths and
*no* account of what the change was meant to do. Withholding the intent is the whole point — it
stops the reviewer inheriting the author's blind spot. It walks six behavioural surfaces
(state-machine edges, permission boundaries, boundary conditions, concurrency races, external
failure modes, adjacent-feature drift) and reports only defects it can name a failing input for.
Fix each finding or waive it in writing in the Receipts before moving the task to `closed`.

**Board health:** `node ~/.claude/task-system/task.js audit` — read-only drift report
(missing declared docs/tests, HIGH tasks without invariants or a review stamp, stale README
task links, waiver inventory). `CONSTITUTION.md` in the task folder holds the project's
owner-ratified MUST principles; plans conflicting with it fail review.

# Working surfaces (this machine)

Windows. `tmux` and `gh` are not installed, so anything that shells out to them fails —
`scripts/orchestrate-worktrees.js` and `scripts/lib/tmux-worktree-orchestrator.js` are dead
here. Use the replacements below.

| Want | Use | What it does |
|---|---|---|
| Several Claude sessions at once | `/fleet up 3` → `scripts/worktree-fleet.js` | one git worktree + branch + colour-coded Windows Terminal tab each; `status` reconciles against `git worktree list`; `aliases` prints `za`/`zb`/`zc` shortcuts |
| Argue against finished work | `/grill` | five attack fronts, then Stands / Breaks / Unproven — "Unproven" is a real verdict |
| Stop repeating a correction | `/mistake <what went wrong>` | writes one dated, specific rule into the right `CLAUDE.md`, prunes what it supersedes; escalates to a hook when prose has already failed once |
| Repeated work, more than once a day | `/skill-create` | turn it into a skill instead of re-explaining it |
| See where the session stands | status line (`scripts/statusline.js`) | dir, branch, `wt:<worktree>`, `task:<id>`, context left. `task:none` in red means the work has no receipt attached yet |

Use subagents for anything that would fill this context with output you only need the
conclusion of — a broad search, a fresh-context review, a log sweep. The budget in
`rules/agents.md` still holds: roughly 10 subagents per task, counting every `agent()` call
inside a workflow.
