# Shared Claude and Codex harness

This is harness **v2**. `core/` holds what every session loads: `core/AGENTS.md`
(what is enforced, the four task commands, a short style card for code and
writing), `core/machine.md` (notes for this machine) and `core/policy.json` (five
hooks). `skills/`, `agents/`, `commands/`, `scripts/` and `task-system/` are the
rest of the maintained source. Authentication, permissions, sessions and project
task records remain in their original locations.

## Versions and change log

Each version is a git tag. Install one by name, in this folder:

    node tools/install.cjs --version v2     # or v1

This checks the tag out here (HEAD becomes detached) and runs that version's own
installer. The hook command stays this folder's `tools/dispatch.cjs`, so Codex
keeps its hook approvals, and untracked files (`rules/default.rules`, which holds
Codex's command approvals, `skills/.system`, `generated/`, `state/`) stay in
place. It refuses a tag that does not exist and any tracked change outside
`skills/synced/` and the generated `skills/source-command-*`. v1's installer has
no `--version`, so to return from v1 run `git checkout main` and then
`node tools/install.cjs`. While v1 is checked out, `task_list/` shows v1's
records, and commits made there are left behind when main is checked out again.
Each install records the settings env keys it set in `installation.json` and
removes keys a previous install set that the new version does not use (v2 sets
`ECC_TASK_FLOW=lean`; v1 set `ECC_DISABLED_HOOKS`). If a switch stops after
the checkout, the folder already holds the new version and the settings env is
already adjusted; finish with that version's own installer, without `--version`:
`node tools/install.cjs`. (Rerunning `--version` there would reach v1's installer,
which does not know the option.) `--version=<tag>` also works; any other option is
refused. Run `node --test task-system/tests/test_install_version.js`.

**v2.1 (13 October 2026, harness task 24): each task records its time and tokens.**
v1 and v2 records said nothing about cost. v1 had a separate command
(`usage.js <id>`) run by hand, and it read only v1's journal lines, so after v2
shipped no task had a cost figure at all. Each finished record now carries one
line in Checked:

    - cost: 14 min from begin to finish; Claude tokens 1,234,567 (fresh input 12,345, cache read 1,200,000, output 22,222; 1 session)

Why: the point of the harness study is to show whether the harness pays for its
token and time cost, and a cost on every real task lets v1 and v2 be compared
on ordinary work without another study. How: `finish` works the line out itself
from the journal's `begin` time and Claude's own transcripts (`usage.js`). The
model takes no extra step and the start-up instructions are unchanged. Study 2
found that the bill comes from steps, since each step re-sends the whole
conversation; asking the model to measure would have cost roughly 1-5% of a
session, against an estimated under 0.5% for one more line of `finish` output
(about 3 seconds of reading over 533 MB of transcripts). Limits: time is exact
for both assistants; tokens are Claude's only, because Codex keeps no transcript
`finish` can read from inside its sandbox, so a Codex record says "none found
(Codex sessions are not read)". Two sessions working in the same folder at once
are counted together (the line says how many sessions). The count stops just
before the session's final message.

**v2 (13 October 2026, harness task 20).** The lean setup tested in the Study 2
resized run (Harness_Development/FINDINGS.md, "Resized Study 2: result" and
"The lean harness as built (v2)"): over six tasks it reached an average audit
score of 5.92 of 8 against stock's 3.58, was less correct than stock on 1 of 6
tasks, and used 1.42 times stock's tokens.
- Instructions: one 4,157-byte text for both assistants (`core/AGENTS.md`,
  `core/machine.md`), against v1's 64,320 bytes for Codex and 14,229 for Claude.
  The general rules under `rules/` are no longer loaded: `~/.claude/rules` is not
  linked (an existing link moves into the backup). `~/.codex/rules` stays linked
  for Codex's approvals file.
- Hooks: 5 (`core/policy.json`: task gate, file-size gate, one-line
  end-of-session reminder, docs snapshot, session-start note) against 42.
- Task records: `task.js begin`, `task.js finish`, `task.js files add` and
  `task.js adopt`; each record names the session that began it, so parallel
  sessions in one repository each work their own task (task 26); a
  30-line record with Goal, Plan, Files, Checked and Left over, in `open/` then
  `done/`. `finish` runs the end-of-task checks (duplicate blocks, complexity,
  dead code, prose patterns), refuses a new duplicate block or a grown file over
  800 lines, and needs `--checked` to name a check that ran (tasks 16-19, 21-23).
- Kept from v1: skills, agents and slash commands stay linked and load on demand
  (owner's choice, 13 October 2026); the patch checker, the dispatcher and the
  fixes from tasks 10-15.
- Removed from what installs (still in the repository and in v1): the
  instructions in `instructions/`, the rules in `rules/`, root `policy.json`, the
  task workflow with receipts, plan and diff reviews, and the documentation,
  hyperparameter and plain-language hooks.

**v1 (tag on 90d9c0c).** The full setup as installed until 13 October 2026:
`instructions/` plus every rule in `rules/` (Codex) or loaded natively from
`~/.claude/rules` (Claude), root `policy.json` with 42 hooks, and the task
workflow with receipts, `pending_review/` and `closed/`. It includes harness
tasks 0-23; tasks 21-23 changed only the lean files.

## How v2 is built and installed

Both homes point at these directories. Native Codex agents and global instruction
files are generated using `node tools/render.cjs`; session and prompt hooks also
render them. Each assistant gets one instruction file with the same text:
Codex's `~/.codex/AGENTS.md` (`generated/INSTRUCTIONS.md`) and Claude's
`~/.claude/CLAUDE.md` (`generated/CLAUDE.md`). There is no `~/.claude/AGENTS.md`.
Claude still loads the plain-language output style natively. Run
`node --test task-system/tests/test_instruction_load.js` to check this. Start a new session after changing instructions, agents, skills or
hook registrations. Already loaded conversation context is not rewritten.

`core/policy.json` lists the hooks for both providers, with the same profile
settings. `tools/dispatch.cjs` reads it on every hook call.
The dispatcher adapts Codex patches to the file inputs used by Claude's gates.
Legacy expression matchers are replaced by valid tool matchers. Unsupported patch
shapes fail visibly instead of bypassing the gates. Shell-based editing still
requires task discipline; tool hooks are not a complete security boundary.
Claude's Windows PowerShell tool and Codex's shell tools get the same shell-write
checks as Bash.

The two assistants enforce a refusal differently. Claude obeys exit code 2.
Codex (checked on 0.162.0-alpha.17.2) ignores exit code 2 and carries on, so for
Codex the dispatcher prints the refusal as JSON instead: a `deny` decision before a
tool call, or a `block` decision at session end, each carrying the hook's reason.
Live checks on 12 October 2026 with Claude Haiku and Codex gpt-6-luna refused a
file-tool write, a shell write and, for Codex, a code-mode patch; each model quoted
the reason. Before this change, every traced Codex refusal had been ignored.

The end-of-session gate refuses at most once. In v2 it is `lean-stop-gate.js`: while a task is
open, one line naming `task.js finish`. (v1's completion gate named what was missing per task and
`task.js move <id> pending_review`.) If the session tries to end again, it is allowed: the
dispatcher logs `gaveUp: true` and `missing: <that line>` in `state/hook-runs.jsonl`. A Stop that
passes resets the count; counts are kept per session in `state/stop-refusals/`. History: with no
limit, a Codex probe on 12 October 2026 was refused 251 times and used 12.1M tokens. A limit of
three cut that to 149k tokens, but Claude Haiku, refused once, edited a task file its prompt had
told it not to touch. The owner chose one nudge on 13 October 2026.

Run `node tools/validate.cjs` to check parity and behavioural regression tests.
Run `node tools/install.cjs` to install the generated adapters and directory links;
the installer preserves replaced files under `~/.agents/harness-backups/`.
Run `node tools/uninstall.cjs` to undo it (harness task 27). It removes the links,
moves the files the harness wrote (such as `settings.json`) into a new
`<time>-uninstall` backup folder, and moves back what the install replaced, from
the first backup folder after the last uninstall. It deletes nothing, and it
refuses to run without `installation.json`, so it cannot run twice. Codex
approvals made while installed stay in `rules/default.rules`. Run
`node --test task-system/tests/test_uninstall.js`.
Source hooks are read on every invocation. Codex requires native `/hooks` trust of
the adapter definitions; changed definitions must be reviewed again. The stable
adapter loads policy changes without changing its registered command.

The obsolete tmux-only dev-server blocker is explicitly disabled: the current
Claude instructions say tmux is unavailable on this Windows machine. Other custom
inline hooks are adapted to named builtins. The imported `minimal` profile remains
in effect for both assistants; hooks restricted to `standard` or `strict` remain
disabled by that profile. Native Codex execution permission rules are preserved.

Codex command skills are generated from the same `commands/` Markdown that Claude
uses. Agent bodies are identical; model/tool configuration remains native to each
runtime. Patch reconstruction follows Codex's line-based patch semantics; unknown
forms are rejected visibly rather than passed through without validation.
Lines match the way Codex matches them: exactly, then ignoring trailing and
leading spaces, then with curly quotes, dashes and odd spaces read as their plain
forms. When a patch's context still cannot be found, the edit is allowed and
logged with `unrebuilt` in `state/hook-runs.jsonl`; Codex applies or rejects it
itself. The gates still judge that file's path against its current content, so an
undeclared file is still refused. Before this, 13 edits in 9 Study 2 sessions were
refused only because the checker could not rebuild them. Run
`node --test task-system/tests/test_patch_rebuild.js`.

Never edit the generated files. Prefer the shared source path when editing harness
assets. Changes through a directory junction also update the shared source.

Installed validation: 21 behavioural and parity checks pass. A temporary change
to one instruction and one hook reached fresh native Claude and Codex sessions.
Both models returned the exact same token, and both native runtimes executed the
changed hook. Original sources were restored. See state/propagation.json and
validation.json for receipts. Codex discovers seven trusted adapters and 265
skills with no loading errors. Native commands use Node from PATH to avoid a
Windows failure when a quoted executable path is followed by quoted arguments.

Codex 0.159.2 does not register the upstream PostToolUseFailure event. That observer
is disabled by the retained minimal profile. Full parity for that event under
standard/strict profiles is unverified.

Task move previews (`move <id> <state> --dry-run` and `close <id> --dry-run`)
leave task files, lifecycle folders and the journal unchanged. They report the
planned move after checking the ordinary transition requirements.
Run `node --test task-system/tests/test_dry_run.js` for disposable-board preview
and real-move checks. Run `node task-system/tests/test_harness_invariants.js`
for the existing task CLI and hook checks.

The sections from here to "Review regression checks" describe v1 features. Their code is still
here and `task.js` still runs them, but v2 does not install the hooks or instructions that use
them; v2 records work with `begin`, `finish` and `files add` ("The lean core" below).

## What the task command refuses

`task.js` refuses an unknown flag before doing anything, so a typo such as
`--dryrun` cannot perform a real move. Closing refuses a task with no Receipts
section as well as one with unfilled receipts. `start` refuses a HIGH or CRITICAL
task unless `plan_reviewed:` holds a PASS, and `new` creates such a task without
starting it. `--force` overrides the last two and the start override is
journaled. The review check lives in `task-system/guards.js` because `task.js`
is over the 800-line limit. Run `node --test task-system/tests/test_transition_guards.js`.

## Models and token totals

`plan-reviewer` and `diff-reviewer` name `model: opus`, as every other agent
file already names its model. `~/.claude/settings.json` sets
`CLAUDE_CODE_SUBAGENT_MODEL=sonnet`, so agents without a model line (built-in
general-purpose and Explore searches) run on Sonnet; an agent's own `model:`
line still wins.

`node ~/.claude/task-system/usage.js <id>` totals Claude tokens and models for
a task. It reads the task's windows from the board journal: v1's `start` (closed
by the next move of that task or start of another) and v2's `begin` (closed by
`finish`). It counts each assistant message once, subagents included, and skips
transcript files last written before the task began. In v2, `finish` runs it
itself and writes the result into the record (see "The lean core"). Sessions
that overlap a window are listed separately; add `--session <id>` to count only
the one that did the work. Codex sessions are not read. Run
`node --test task-system/tests/test_usage.js`.

## Which repository a hook judges

The task gate judges each code write by the git repository that contains the
file, not by the folder the session started in. A session opened in one project
can write scratch files and files in another repository; each is checked against
the active task of its own board. Files outside any repository pass.

The documentation rules block writes that create loose `.md`, `.txt` or `.ipynb`
files. READMEs, agent instruction files, task boards, archives and this harness
are always allowed. Any other document is allowed once a task in the same
repository lists it under `docs:`, which records that the owner asked for it.
The shell rule looks only at paths a command writes (redirect targets, `tee`,
`cp`/`mv` destinations), so commands that only read Markdown pass.
Run `node --test task-system/tests/test_hook_scope.js` for both.

`task.js` follows the same boundary. Inside a git repository it looks for a
board only between the current folder and the folder that holds `.git`, and
creates `task_list/` there if none exists. It never reads or writes a board in a
folder above the repository. It finds `.git` on disk, so this holds even where
git cannot start. Outside any repository it still searches every folder above.
This closes a leak found in the Study 2 pilot: run repositories nested inside
the study folder read and wrote the study's own board. Run
`node --test task-system/tests/test_board_scope.js`.

The size gate uses the same rule for finding the repository and its board. A
file over 800 lines may regrow up to its committed (HEAD) size, so work that
shrinks a long file first can then add lines; it may never pass the committed
size. Run `node --test task-system/tests/test_size_gate_scope.js`.

## Restart handoff

At each Stop, the session summary reads the active task in the current git
repository. It copies the task's Current state and reports its recorded next
action and open decisions. With no active task, it uses the latest recorded move
to pending review or closed, then falls back to the most recently updated task
in those folders. Multiple active tasks produce a warning. Missing information
says `none recorded`.

The summary pairs shell calls with their results in Claude and Codex transcripts.
It records the latest recognized test or check command and an observed exit code.
Recognized checks include test runners and files named like `x.test.js`,
`x.spec.ts`, `test_x.py` or `x_test.py`. Codex results are matched by their call id.
Claude reports no exit code for a clean run, so exit 0 is recorded only when Claude's
own result shows a foreground run that was neither interrupted nor an error.
An absent exit code stays unknown. A wrapper containing several shell commands
also stays unknown because its combined output cannot reliably identify one
command's exit. Background notifications are removed from user intent.

Repeated Stops replace the generated summary while preserving human notes outside
its markers. Legacy files without markers retain their existing text when the
new generated block is added. Tests use disposable repositories and an in-process
session-directory substitution, so they cannot overwrite real session files.
Run `node --test task-system/tests/test_session_handoff.js`.

## Saved checkpoints before closure

A task with a nonempty `files:` list can close only when its Receipts name a
reachable Git commit that changed a declared file and still matches its declared
files and docs. Dirty or newer source cannot reuse an older receipt. `--force`
does not skip this check. Tasks with an empty `files:` list keep the existing
receipt checks.

Where git cannot make a checkpoint, closing goes ahead without one. That covers
a folder that is not a git repository, git failing to start (Codex's sandbox
refused to start it in the Study 2 pilot, so no task there could close), and
`--commit` when git refuses to write its own files. `task.js` prints a note and
journals `close <id> without a git checkpoint: <reason>`; commit the files later.
Moves already fell back to a plain file move when `git mv` fails. Run
`node --test task-system/tests/test_no_git.js`.

Use `move <id> pending_review` while awaiting a checkpoint. When committing is
authorized, `close <id> --commit` commits only declared files, docs and task
metadata. It refuses unrelated staged changes and an unfinished Git operation.
`--commit --dry-run` validates scope without writing. Large scopes stream literal
path lists to Git, so spaces and Windows command-length limits are supported.
With no source change it reuses a valid receipt instead of creating a metadata-only
commit. Source-only checkpoints leave ordinary closing metadata dirty until a
later board commit.

Worktree handoffs also commit the task move and receipt. A failed handoff retains
the branch and worktree and prints recovery guidance. After a local merge, a dirty
worktree stays in place. Inspect its remaining changes before cleanup. To recover
an interrupted move, repair status to match the lifecycle folder, then commit only
declared files/docs and old/new task paths before merging from the primary checkout.
Run `node --test task-system/tests/test_close_checkpoint.js`.
## Review regression checks

New HIGH tasks stay open until their plan review passes, including when a
worktree was requested. An explicit force start records the override in the
journal. Installation snapshots instruction bytes before rendering, because
existing hardlinks can otherwise change the backup before it is saved. It
backs up and removes the obsolete Claude instruction file. A later failure
restores the original instruction bindings, bytes and settings. A clean install
selects the installed plain-language style; an existing preference is preserved.

Propagation compares each provider's reported hash with that provider's expected
instructions, then compares the shared hook behavior. Importing its validation
helper cannot start a probe. Native propagation still requires fresh native
sessions; passing local fixtures does not establish that result.

Token totals include only sessions with evidence that they belong to the task
board's repository. Subagents can inherit their parent's repository. Sessions
without a recorded location are listed as unattributed and excluded from totals.
The documentation hook recognizes quoted words and combined stream redirects
without executing shell text. It checks the command forms covered by its tests;
it does not parse every possible shell expression.

The handoff parser also reads Codex's actual custom call records and text-item
result arrays. Only observed integer exit codes count. Migration removes the
old generated session placeholder that otherwise prevents the next session
from loading a useful summary, while preserving human notes.
Run `node --test task-system/tests/test_review_regressions.js` and
`node --test task-system/tests/test_session_handoff.js`.

Worktree activation records its start on the worktree's own task board, so usage
windows follow the checkout where the work happens. Quoted Windows paths retain
ordinary backslashes; an absolute README path remains allowed.

Copy and move commands targeting an existing literal directory check each source
basename under that directory. Copying a loose guide is blocked while copying a
README remains allowed. Recursive directory contents and shell expansions are
outside this check's verified scope.

## The lean core (installed in v2)

Built from the Study 2 pilot (harness task 16) and installed from v2 on. The Study
2 runner's lean setup copies `core/policy.json` over `policy.json` in a run's own
harness clone and `core/AGENTS.md` into that run's Codex home; at a v2 commit its
task-only setup would also run the core policy, because v2 no longer reads a root
`policy.json`.

- `core/AGENTS.md` (53 lines): what is enforced, where task records live, the
  four task commands (`begin`, `finish`, `files add`, `adopt`; it no longer says both
  "add the file to files:" and "do not edit the record by hand"), and a short style card for code and writing with one
  before/after example and a four-line end message.
- `core/policy.json`: five hooks. The task gate and the file-size gate as in
  the full setup; `lean-stop-gate.js`, which refuses the end of a session once
  while a task is open and names the `finish` command; `docs-snapshot.js` (a
  record of which files were already changed at session start; no lean check
  reads it yet); and `lean-session-note.js`, which tells a new session about the
  open task or what the last finished task left over.
  `ECC_TASK_FLOW=lean` makes the task gate's refusal name `task.js begin`.
- `core/task-template.md` (30 lines): Goal, Plan, Files, Checked, Left over.
- `task.js begin "<title>" --files a,b --goal ".." --plan ".."` writes the
  record as the open task. `task.js finish --checked "<command> -> <result>"
  --left ".."` runs `checks/run.cjs` once, writes Files, Checked (with a cost
  line: minutes since `begin` and Claude tokens in that time, from `usage.js`;
  v2.1) and Left over,
  and moves the record to `task_list/done/`. `--checked` must name a check that
  ran: some `;`-separated part reads `<command> -> <result>` with neither side
  saying not run or skipped, or the text starts with "no test exists". Otherwise
  `finish` refuses once with the exact command; a second try is accepted and the
  record adds "(no check named; accepted after one refusal)". A whitespace or
  compile check still counts as a check (in the study, 7 of 11 lean records
  named only those). `task.js files add <path>[,<path>]`
  adds paths to the open record's `files:` list, so widening the work is one
  call (in the resized Study 2 one session finished and began records three times
  to do this). All three live in `task-system/lean.js`. Under
  `ECC_TASK_FLOW=lean`, the task gate's refusal for a file outside the open
  record names `files add` with that file's path.
- Owners (harness task 26). `begin` writes `session:` into the record: the
  shell's `CODEX_SESSION_ID`, `CODEX_THREAD_ID` or `CLAUDE_CODE_SESSION_ID`,
  the same id the hooks receive as `session_id`. Codex is read first because a
  Codex worker started from a Claude shell inherits the Claude id. Every command
  and hook then acts on the caller's own task. Another session's open task does
  not refuse `begin`, a write or the end of a session. The files it lists do not
  use up the free first code file, and `finish` neither lists nor judges them.
  A code write to a file that only another session's open task lists is
  refused, even as a free first file; listing it in your own task (after asking
  the user) allows it.
  `begin` and `files add` print a note when another open task lists the same
  file. A session still works one task at a time. `task.js adopt <id>` moves an
  open task to the current session, for work that runs over several sessions
  one after another (a context reset or `/clear` starts a new session id); the
  old session then counts as another session and can no longer write under it.
  A record with no `session:` (older records, or a shell with no id) belongs to
  every session, as before. `begin` claims its number by creating
  `task_list/.ids/<id>`, so two sessions that begin at once get different
  numbers. The cost line counts the sessions that `begin` and `adopt` name in
  the journal, so a parallel session's tokens stay with its own task.
- `checks/` compares the working tree with the last commit: new duplicate blocks
  (6 or more repeated lines, counted once per block), the share of complexity
  held by functions scoring over 10 before and after (Python exactly through its
  `ast` module; JavaScript approximately), dead code on added lines (vulture or
  knip only when already installed, else "not checked"), and prose patterns
  (the shared word list, skipping quoted and code text, plus four patterns: a
  "not X, it's Y" contrast, three sentences in a row with the same first word, a
  short closing line after a long paragraph, and bold on every list label).
  `finish` refuses only a new duplicate block or a code file over 800 lines that
  grew; everything else is reported. The checks start no other program for
  the comparison: inside Codex's Windows sandbox Node cannot start any program
  (git, Python and Node itself all fail with EPERM; found in the first lean
  probe, harness task 17). `checks/gitread.cjs` reads the last commit straight
  from `.git` (loose objects, pack files with deltas, packed refs) and lists
  working files by `.gitignore`; `checks/linediff.cjs` computes the diff. The
  git program is only a fallback reader. Where Python cannot start, Python
  complexity is an approximate keyword count, and the record says so.
  `checks/complexity.py` reads its input as UTF-8 bytes; reading it as text used
  the Windows code page and failed on any non-ASCII source (harness task 19).
  Folders nothing may read (pytest leaves some inside the sandbox) are
  skipped and named in the record. Commands are written as
  `node "$HOME/.claude/task-system/task.js"`, which works in PowerShell and
  bash; PowerShell does not expand `~` in a program's arguments.

Run `node --test task-system/tests/test_lean_checks.js`, `test_lean_nospawn.js`,
`node --test task-system/tests/test_lean_flow.js` and
`node --test task-system/tests/test_lean_hooks.js`.
