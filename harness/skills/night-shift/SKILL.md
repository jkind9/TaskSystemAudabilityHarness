---
name: night-shift
description: "Run a task board unattended: one fresh Opus worker per task, launched from the board's own queue, verified from the repository (never from the worker's account), blind-reviewed after close, findings filed as the next task. Trigger: /night-shift [first task id]. Use when the user hands over a queue of task-system tasks to run overnight or while away."
---

# /night-shift — the board runs itself, one worker at a time

The board is already the queue (`task.js ready`), the spec (the task file), the lock (one
`in_progress`) and the audit (receipts, lint, journal). This skill is the operator that
turns it: it launches a worker per task, checks the worker's work from the repository, gets a
blind review of the closed diff, files what the review finds, and moves on. First run:
2026-09-07/08 on GenWA, five tasks closed, ~5% of a Max plan's usage, no stops.

The orchestrator (you, running this skill) never implements. Its tokens go to launching,
verifying with cheap commands, filing tasks and writing accounts. Reviews, browser drives
and anything that reads large files go to Opus subagents.

## 0. Preconditions (stop and report if any is false)

```
node ~/.claude/task-system/task.js list      # exactly the expected task in_progress, or none
node ~/.claude/task-system/task.js ready     # the queue
node ~/.claude/task-system/task.js lint      # exit 0
git status --short                           # no tracked changes, no stray code files
git log --oneline -3                         # HEAD is the handover's HEAD or later
ListAgents                                   # no other session alive in this working directory
```

Read the rule file (`~/.claude/rules/task-management.md`), the board README's sequence
table and testing standard, the two or three most recently closed tasks' Receipts (that is
the standard a close must meet), and the memory files for the project. Measure the baseline
yourself and write it down: full deterministic suite, frontend tests, build (with its known
warnings). Every later comparison is against your own numbers.

## 1. Owner rulings

Collect them before launching anything and put them verbatim into every brief they affect:
which option of a two-option task to take, the queue order, the model and billing (Max
subscription: never `--bare`, it needs an API key), what the workers must never touch (GPU,
live model server, human-review tasks), and that an owner decision found mid-task is filed as
a task with Write (`status: open`, never `task.js new`), not made.

## 2. The brief

Thin, because the task file is the spec. Compose it from `brief-template.md` in this
folder: id and title, HEAD, whether the task is open or in_progress, whether the plan is
reviewed, the measured baseline, the planning ritual if `plan_reviewed` is null, red-first
implementation with named mutants, validation never below baseline, the browser drive rule,
blind diff review with a blind pass per fix commit, docs, receipts, close, `chore(board)`,
the never-touch list, and the account format. Add the one task-specific bullet (an owner's
ruling, or a named follow-up quoted from a prior review). Keep it under 900 words.

While the owner is using the app in the same checkout, every server a worker starts for a
browser drive must take its own `--port` and `--db` under the worker's temp directory; the
default port and records database belong to the owner's instance (one board, one backend).

Two things learned the hard way: state in the brief when a pre-step is already done (a worker
handed "fix X first" will redo X unless told X landed at commit Y); and tell the worker what
the demo/mock mode cannot exercise (on GenWA `--mock` replays a fixture and never touches the
store, so browser drives serve the real board with the model replaced by a script).

## 3. Launch

One worker at a time. The single `in_progress` task is the shared lock; two workers in one
directory corrupt each other. `task.js start` and `task.js new` now refuse while another
task holds the lock (`--take` steals it and journals the steal), so a worker cannot take it
by accident. Pick the task with `node ~/.claude/task-system/task.js ready --next` (the first
ready id in the README sequence-table order, else HIGH before MED, bugs first).

`run.sh <id> <brief> [scratchpad]` in this folder does the launch below and refuses if a
task is already in_progress. By hand:

```
SP=<your scratchpad>; rm -f "$SP/<id>.done"
(nohup sh -c "claude -p \"\$(cat '$SP/brief-<id>.txt')\" --model claude-opus-5 \
  --permission-mode auto --output-format json > '$SP/<id>.json' 2> '$SP/<id>.stderr'; \
  echo \$? > '$SP/<id>.done'" > /dev/null 2>&1 &)
```

Then a background waiter, relaunched if the tool's 10-minute cap kills it:

```
until [ -f "$SP/<id>.done" ]; do sleep 30; done; cat "$SP/<id>.done"
```

The JSON output only fills at exit. The worker's live text is its transcript in
`~/.claude/projects/<project>/<session>.jsonl` (the newest file that is not your own
session); tail that to see it working. Logs never go in the repository.

Your own turn cannot end while the worker has dirty code in the shared tree: the completion
gate reads `git status`, not who wrote it. Wait; never write `docs n/a` or edit the worker's
task to clear it.

## 4. Verify from the repository, never from the account

When the waiter fires, one command runs every repository check and exits 1 on the first
class of failure (folder, status, receipts, no in_progress, lint, clean tree, typed commits
since the launch HEAD, a `chore(board)` commit, and the suite not below the baseline):

```
node ~/.claude/task-system/task.js verify <id> --since <launch HEAD>   --baseline <n> --suite ".venv/Scripts/python.exe -m pytest -q"
```

Run the frontend tests and the build beside it when the diff touches `ui/`.

Then, in parallel: run the full suite, frontend tests and build yourself (background), and
spawn ONE `diff-reviewer` agent with `model: opus` on `git diff <launch HEAD>..HEAD --
<code dirs>` with the touched paths and no account of the intent. Give it two or three
explicit questions shaped for the task: "is the runtime path byte-identical over these
scenarios (a differential against `git archive <launch HEAD>` is the strongest answer)",
"can any new refusal fire on a record the current writers produce", "did a deleted test leave
a branch unpinned". Those questions found every real defect of the first night.

Read the worker's account last (`json.load(...)['result']`, with `PYTHONIOENCODING=utf-8`),
and only to learn what it filed and what it waived.

## 5. Disposition

| review says | do |
|---|---|
| no findings | append the review record to the closed task's Receipts, `chore(board)`, next task |
| MEDIUM in the task's own new code, small | file a task with Write (HIGH if it is a contract for a second caller of a package weak models will drive; MED otherwise), one row in the sequence table with one sentence of reason, record the review in the closed task's Receipts, `chore(board)`, run it next |
| pre-existing mechanism the diff did not create | file it, or fold it into an existing open task that owns the decision; record; continue |
| CRITICAL, dirty tree, failed lint, suite below baseline, rate-limit error in the JSON, worker exited with the task `in_progress` and no `still open because` line | stop the queue, write the account |

Never reopen a closed task for a follow-up; the audit trail is cleaner as a new id that names
the review that found it. Every re-ordering respects `blocked_by`, is written into the
sequence table with a reason, and is committed before the next launch.

## 6. Accounts

One per task as it closes, in the receipts' shape: task, closing commits, your own test
counts against the baseline, before/after, the worker's review rounds and yours, result. One
final account in the morning: which tasks closed with which commits, what was filed, what
stopped the queue and why, what the owner must decide. Append progress to the project's
handover memory after every close, so a context reset loses nothing.

## 7. Where the time goes, and what to cut

Measured on the first night (five workers, 70–98 min wall each, 131–211 turns):

| cost | share | cut it by |
|---|---|---|
| an interactive browser drive through the Playwright MCP tools (up to 19 min on task 109) | 5–19 min | a checked-in `@playwright/test` harness that serves the real board with the scripted model (GenWA task 129); a task adds one spec and runs it in seconds |
| serial subagent reviews inside the worker (5–12 per task, 4–9 min each, one after another) | 35–50 min | batch: fix every finding of a round, then ONE blind pass on the batch, not one per fix. Cap at three rounds; the fourth files a task. Run the review in the background while docs and receipts are written. |
| full-suite runs (5–10 per worker at ~105 s) | 10–18 min | iterate on the touched test files; full suite at two points only (before the first commit, before close). `pytest-xdist` is installed in the GenWA venv: `-n auto` gives 1738 passed in 25 s against 105 s serial (measured 2026-09-08); the brief says so. On a fresh venv: `pip install pytest-xdist`. |
| plan-review loops on a task filed the same night (114: six rounds, five FAIL, mostly doc anchors) | 10–25 min | file with function names as anchors, not line numbers; ask the plan reviewer to fix advisories in place and return FAIL only for a claim the code contradicts; cap at two rounds |
| the orchestrator's own review after each close (15–23 min, serial) | ~20 min per task | overlap: launch the next worker as soon as the repository checks pass, and run your blind review of the previous task while it works; a finding then queues behind the running worker |
| a fresh worker re-reading the board for a follow-up on the same code | ~15 min | resume the worker that wrote it: `claude -p --resume <session_id> "<findings>"` keeps its context; use it for the same-package follow-up, a fresh worker for a new area |
| worker boot (~90k tokens of rules, memory, hooks) | cost, not time | unavoidable without `--bare`; keep memory files short |

Target with all six applied: about 45 min per worker and no idle gap between workers. The brief template in this folder carries the batching rule, the two-suite rule, the port/db rule and the three reviewer questions; the orchestrator's own review overlaps the next worker.

## 7b. Two lanes: lean and full

The first day's measurement (task 109, a drawer fix): the code took minutes; the ceremony
took two hours: two plan rounds, an interactive browser drive, three serial blind reviews,
mutants, long receipts, and 257 model steps at 4-8 s of latency each. The protocol below was
built for an extraction and applied to a bug. Decide the lane from the task's `type`,
`files:` and whether a route, schema, transaction or port changes, and say the lane in the
brief.

| | lean (S: a bug, a wording, a UI fix; M: a feature without a schema or port change) | full (L: an extraction, a port, a schema or transaction change, a startup or lifecycle rule) |
|---|---|---|
| model | Sonnet 5 for S; Opus 5 for M | Opus 5 |
| before code | `task-plan-lint` only; refresh anchors while reading; `start` | one plan round (two if the first FAILs), advisories fixed in place |
| tests | red-first, the named tests only; full suite twice (before the first commit, before close) | the same, plus mutants and a differential against `git archive <launch HEAD>` |
| browser | rendered tests; the e2e harness once it exists; no interactive drive | the same |
| review | ONE blind diff review after the code; a second pass only if the first found a HIGH or CRITICAL | a blind pass per round, three rounds max, the three orchestrator questions asked |
| receipts | five rows, one line each; docs only where a README sentence is now wrong, else `docs n/a: <reason>`; no self-profile | the closed-task standard |
| orchestrator | `task.js verify` + the suite; no separate blind review | verify + suite + one blind Opus review, overlapped with the next worker |
| target | S 25 min, M 45 min | 90 min |

Fewer, bigger steps in every lane: batch shell work (tests, lint, commit in one call), never
re-read a file already read, no exploratory agents when the task file names the owner.
Measure at close with `profile.py` (the orchestrator runs it, not the worker) and paste the
table into the account; the numbers decide the next cut.

## 8. What to build into the harness (user tooling, not project tasks)

- `task.js verify <id> --baseline <n>`: the section-4 checks as one command with a non-zero
  exit, so the orchestrator model only judges reviews.
- `task.js ready --next`: the first ready task in the README's sequence-table order, HIGH
  before MED, bugs before extraction slices.
- `task.js start` that refuses when another task is `in_progress` (the lock steal is the
  oldest recurring incident in the memory files).
- A `scripts/night-shift/run.sh <id>` that composes the brief from the template, launches,
  waits and writes `<id>.done`, so the launch is one deterministic call.

## 9. Two lanes with worktrees (learned 2026-09-08)

Lane A is the main checkout; lane B is `git worktree add <repo>.worktrees/lane-b -b lane-b`.
The shared venv's editable install resolves `import orchestrator` from the directory a
command runs in, so no second venv; run `npm ci` once in the worktree's `ui/`. Each checkout
has its own board copy, so each holds one in_progress task. Rules:

- Lane B closes on its branch; the orchestrator merges `--no-ff lane-b` into main between
  lane-A steps (the append-only `task_list/.journal.log` always conflicts: keep both sides,
  drop duplicates). Then run the suite on main.
- Sync lane B from main (`git merge --ff-only main` in the worktree) ONLY when main has no
  in_progress task; otherwise the worktree's board inherits lane A's lock and `run.sh`
  refuses. If it happens, `git reset --hard <lane-b tip>` (main already contains it).
- Put disjoint files in different lanes: the extraction slices in A (runner, server, store),
  UI and evaluation work in B. Overlapping hunks mean a hand merge and a suite run.
- Stop one worker with `kill "$(cat <id>.pid)"`; never kill every claude process.
- Two lanes can mint the same task id (both filed a "131" on 2026-09-08). Before a lane
  files a task, it must merge main or the orchestrator renumbers at merge
  (`task.js renumber <path> <new id>`) and fixes the references. Cheaper: give each lane an
  id block in its brief, and make the blocks far apart: the lanes cannot see each other's
  new ids until they merge, so "140+" collided within the hour (127 in A and 121 in B both
  filed 142 and 143). Lane A below 160, lane B 160 and above; renumber at merge if it
  still happens.
- Merge lane B into main ONLY from a lane-b commit where lane B has no in_progress task
  (its close commit), never from an arbitrary tip: on 2026-09-08 a merge taken mid-task
  carried 133's in_progress status into main and gave main two active tasks, which blocks
  every code write there. Merge by commit: `git merge --no-ff <close-commit sha>`.

## 10. Measured on the first lean afternoon (2026-09-08, 11:46 to 15:00)

Nine tasks closed in about three hours against one per ninety minutes under the full
protocol: S on Sonnet 8 to 24 min (123, 124, 125, 131); M on Opus about 30 min (107, 133,
129's worker); L on Opus 45 to 80 min (72, 127). The suite went 1748 to 1875 with no
regression on any merge. The one blind review per task is where the value is: it found a
CRITICAL in two small tasks (129: a records guard that compared a relative path; 133: a
carry that let a hand edit erase a finding). Keep it; cut everything around it.

Three more rules from that afternoon:

- The brief must say: "do not end your turn while your review agent is still running;
  wait for it, act on it, then close" (129's worker ended with the review row empty).
- Commit merges with an explicit `-m` message; the "keep the merge's default message"
  flag sometimes trips the bash hook that guards against skipping git hooks, and the
  whole command is refused.
- Lane B leaves `task_list/README.md`'s validation line to the orchestrator and strikes
  only its own row; the journal conflict on every merge is mechanical (keep both sides).
- A renumber made on main must reach lane B before lane B works that task: cherry-pick
  the renumber commit into the worktree (or sync when main is idle). On 2026-09-08 lane B
  was briefed for "144" while its own board still called it 142; the worker opened 142 and
  the merge needed a hand rename. Until it is synced, brief lane B with the id its own
  board shows, or hold the task.
- `merge_lane.py <close-commit> "<message>" [--rename OLD:NEW]` in this folder does the
  merge: refuses while a worker holds code here, keeps both sides of the journal and of a
  README with one conflict hunk, applies a lane's rename, and stops on anything else with
  nothing committed. Run it from the checkout being merged into.
