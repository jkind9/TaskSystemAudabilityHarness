---
id: "20"
title: Version the harness: tag today's setup v1 and release the lean profile as v2
status: closed
priority: HIGH
type: infra
blocked_by: []
blocks: []
verification_test: task-system/tests/test_install_version.js
plan_reviewed: 2026-10-13 PASS
files:
  - core/**
  - checks/**
  - task-system/**
  - scripts/hooks/**
  - tools/**
  - policy.json
  - instructions/**
docs:
  - README.md
  - core/machine.md
baseline_metric:
  source: "generated/INSTRUCTIONS.md and policy.json at v1 (90d9c0c)"
  field: "Codex instruction file size; hook entries wired"
  baseline_value: "64,320 bytes; 42 hooks"
  target: "under 8,000 bytes; 5 hooks"
created: 2026-10-13
last_updated: 2026-10-13
superseded_by: null
---

# Task 20 — Version the harness: tag today's setup v1 and release the lean profile as v2

## Current state

- Last test: env -u ECC_TASK_FLOW node --test task-system/tests/*.js -> exit 0 (195/195) in the installed folder at 238e1a1; node tools/validate.cjs -> exit 0 (23 checks, including the two that inspect the live install)
- Next action: none; v2 is tagged (238e1a1) and installed for Claude and Codex. To go back: node tools/install.cjs --version v1.
- Open decisions: (1) whether `--checked` should require a test command rather than any check: 7 of 11 lean study records named only `git diff --check` or a compile check, which still passes; (2) the open study decisions in FINDINGS.md (repeat runs, the two full reference runs).
- Handoff note: Claude (Opus 5.5), 2026-10-13. A red test installed into the real home once (16:49Z); restored from the installer's backup before anything else, see Notes. Sessions started before 16:55Z keep their old instructions until restarted; this session's shells also still carry ECC_TASK_FLOW=lean from the accident.

## Clarifications

### Owner request, 2026-10-13

- After the FINDINGS update, apply version control to the harness: the lean version becomes v2.

### Owner decisions, 2026-10-13

- Lean becomes v2; today's full setup becomes v1 and must stay installable by name.
- Fix three gaps first, each its own task, test first: done as tasks 21 (files add, 5ff7d94), 22 (instruction contradiction, 7120df7), 23 (--checked names a check, fabc699).
- After v2 is tagged, validated and probed, install it as the default for Claude and Codex, keeping the installer's backup. v1 must reinstall cleanly from its tag.
- v2 contents (asked 2026-10-13, answer "Keep tools on demand"): skills, agents and slash commands stay linked as in v1; Claude's ~/.claude/rules is no longer linked (the style card replaces the general rules); the owner's graphify and video-codec notes stay in the instructions.

## In plain English

The harness has changed a lot without version numbers. Today's full setup is marked version 1. The lighter setup tested in the study becomes version 2 and is installed for both assistants. Either can be installed again by name, so the old one stays one command away.

## What

1. Tag v1 on 90d9c0c, the last commit where the full setup is what installs (done).
2. In v2, the installed policy and instructions come from `core/`:
   - `tools/render.cjs`: both assistants get one text: a short head, `core/AGENTS.md`, `core/machine.md` (new: the graphify and video-codec notes from `instructions/CLAUDE.md`) and the one-paragraph tool-adapter note. Hook adapters are built from `core/policy.json`.
   - `tools/dispatch.cjs`, `tools/install.cjs`, `tools/propagation.cjs`, `tools/propagation-state.cjs`, `tools/propagation-recovery-test.cjs`, `tools/bootstrap.cjs`, `tools/validate.cjs` read `core/policy.json`. Root `policy.json` is deleted (it stays in v1).
   - `tools/propagation.cjs` and `tools/propagation-state.cjs` inject and remove their token in `core/machine.md` instead of `instructions/CLAUDE.md`, because v2's render no longer reads the latter (review PR-1).
   - `scripts/hooks/file-size-gate.js`: under `ECC_TASK_FLOW=lean`, drop the pointer to ~/.claude/rules/task-management.md, as task 21 did for the task gate (review PR-8).
   - `tools/install.cjs`: does not link `~/.claude/rules`, and moves an existing link there into the backup. `~/.codex/rules` stays linked, because it holds Codex's own command-approval file (`rules/default.rules`).
   - `core/policy.json` authority text says it is the installed policy.
3. `tools/install.cjs --version <tag>` installs a named version **in place**: it refuses unless the tag exists and the folder has no tracked changes outside `skills/synced/`, runs `git checkout --detach <tag>` in this folder, then runs the now-checked-out `tools/install.cjs <home> <installation.json>` (each version installs with its own code). The hook command path (this folder's tools/dispatch.cjs) never changes, so Codex's stored hook trust stays valid (review PR-3), and untracked files stay in place: rules/default.rules, skills/.system, synced-skill edits (PR-9). Without `--version` it installs this folder as checked out, as today. To return from v1, whose installer has no `--version`: `git checkout main` (or `git checkout v2`), then `node tools/install.cjs` (PR-6).
   - Settings env (PR-2): install writes the env keys it set into installation.json (`env`). On each install, keys the previous install set that the new policy lacks are removed from ~/.claude/settings.json env. When the previous installation.json has no `env` (written by v1), the previous keys are read from `git show v1:policy.json`. After a `--version` install of an older version, the wrapper does the same removal itself, since the older installer cannot.
4. `README.md`: a "Versions and change log" section (v1, v2, what changed, how to install each); the opening description and the "Lean profile" section updated to v2.
5. Tests and validate updated for v2 (review PR-4, PR-5): validate's two documentation-policy checks and its "rules linked for both" check describe v1; v2 checks that exactly the five core hooks are wired and that ~/.claude/rules is not linked while ~/.codex/rules is. `test_stop_once.js` moves to the lean stop gate's one-line message. `test_review_regressions.js`'s fixture writes core/policy.json. `test_instruction_load.js` skips its install-record test when installation.json is absent (as its last test already does).
6. Tag v2 on the commit that passes the checks and the probe; fast-forward main to it; install.

## Why

Study 2 (resized) found lean meets the decision rule (FINDINGS.md "Resized Study 2: result": audit 5.92 vs 3.58 of 8, correctness lower than stock on 1 of 6 tasks, 1.42x stock's tokens); the owner chose to release it as v2.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Instruction texts are built from instructions/ and rules/ | tools/render.cjs `instructionTexts` | render, install, validate, test_instruction_load | tools/render.cjs:15 |
| Hook adapters built from root policy.json | tools/render.cjs `render` | generated/*-hooks.json | tools/render.cjs:55 |
| Dispatcher reads root policy.json on every hook call | tools/dispatch.cjs | every installed hook | tools/dispatch.cjs:205 |
| Install links rules for both assistants and merges policy env into Claude settings | tools/install.cjs | live homes | tools/install.cjs:66 and tools/install.cjs:82 |
| Install backs up what it replaces and rolls back on failure | tools/install.cjs `preserve`, `undo` | install | tools/install.cjs:33 |
| render rewrites every instruction file listed in this copy's installation.json | tools/render.cjs `render` | install, validate, session hooks | tools/render.cjs:65 |
| Propagation probe writes a temporary hook into the policy file | tools/propagation.cjs, tools/propagation-state.cjs | validate (live) | tools/propagation.cjs:29; tools/propagation-state.cjs:39 |
| Validate checks doc-policy hooks v2 drops | tools/validate.cjs | — | tools/validate.cjs:126 and tools/validate.cjs:148 |
| Codex approval rules live in rules/default.rules (gitignored) | Codex | ~/.codex/rules link | .gitignore line rules/default.rules |
| Codex trusts each hook by a stored hash of its definition; a changed command needs review again | Codex config.toml [hooks.state] | every Codex hook | README.md:49-51 |
| dispatch merges policy env over the process env, so a key left in settings by another version leaks in | tools/dispatch.cjs | every hook | tools/dispatch.cjs:207 |
| Stop-once test expects the v1 completion gate's message | task-system/tests/test_stop_once.js | — | task-system/tests/test_stop_once.js:41 |
| Lean policy and instructions already exist | core/policy.json, core/AGENTS.md | Study 2 runner lean config | core/policy.json:1; core/AGENTS.md:1 |
| Study runner's lean config copies core/policy.json and core/AGENTS.md from a clone at a pinned commit | Harness_Development follow-up/study-002/tools/environment.cjs | probes | environment.cjs:25 and environment.cjs:79 |

hyperparameters n/a: not an experiment.

## Invariants and recovery

| Datum | Producer/owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| Installed hooks | generated/{claude,codex}-hooks.json from core/policy.json (render, tools/render.cjs:55) | ~/.claude/settings.json hooks, ~/.codex/hooks.json (hardlink) | one dispatcher command per event | yes, files |
| Live hook policy | core/policy.json in the installed copy | tools/dispatch.cjs:205 on every call | JSON, read per call | yes |
| Instructions | generated/CLAUDE.md, generated/INSTRUCTIONS.md | ~/.claude/CLAUDE.md, ~/.codex/AGENTS.md (hardlinks) | Markdown | yes |
| Install record | installation.json in the installed copy (tools/install.cjs:94) | render (rewrites listed files, tools/render.cjs:65), validate | JSON: home, backup, instructions, revision | yes |
| Backups | tools/install.cjs:7 | the owner, on rollback | ~/.agents/harness-backups/<timestamp>/ | yes |
| Codex approvals | rules/default.rules (untracked) | Codex via ~/.codex/rules | Codex rules file | yes; v2 keeps the link |

- Source of truth: the git tag of each version; the installed copy is always C:/Users/jkind/.agents/harness, checked out at the installed version.
- Process boundary: every hook call starts a new Node process that reads the policy fresh, so a change to the installed copy's files takes effect on the next hook call. Hence all work happens in the worktree until install.
- Process death: install.cjs rolls back its own bindings on an exception (existing). If it dies hard mid-install, the backup folder holds every replaced file; rerunning the installer of either version restores a full binding set. If it dies after the checkout and before the checked-out installer runs, the folder is at the new version while the homes are bound to the old one, and the next SessionStart render writes the new version's text into the live instruction files; rerun the same install command to finish (review 2, A-2).
- Fresh deploy: in the installed folder, `node tools/install.cjs --version v2` (or `git checkout main` then `node tools/install.cjs`). From v1: `git checkout v2` then `node tools/install.cjs`.
- Backward compatibility: `--version v1` checks out the v1 tag in place and runs v1's own installer, which relinks ~/.claude/rules and writes the v1 hooks and instructions; the wrapper then removes ECC_TASK_FLOW (a v2-only key) from settings env. Going back to v2 removes ECC_DISABLED_HOOKS (v1-only). The checkout detaches HEAD; main keeps its commits. While v1 is checked out, HEAD is detached and task_list/ shows v1's records; commits made there are left behind when main is checked out again. The README says so (review 2, A-3).
- Untracked and ignored files (rules/default.rules, skills/.system, generated/, state/) are untouched by checkout, so both versions see them. A checkout that would overwrite a local change is refused by git, and the wrapper refuses before that on tracked changes outside skills/synced/.

## Verification

- Contract tests (new or changed, red first where new):
  - `task-system/tests/test_instruction_load.js`: both texts include core/AGENTS.md's "Write the record twice" line and core/machine.md's graphify line; neither includes "# Shared rules" or "Task workflow (all projects)"; both under 25,000 characters.
  - `task-system/tests/test_install_version.js` (new; runs on a throwaway clone of this repository with core.longpaths=true, never on the live folder; the working-tree changes are copied into the clone and committed there, so --version sees a clean tree; review 2, A-1): install into a scratch home links skills, agents, commands, scripts, task-system for both assistants; no ~/.claude/rules; ~/.codex/rules linked; settings env has ECC_TASK_FLOW=lean and no ECC_DISABLED_HOOKS; Claude hook events equal core/policy.json's events plus SessionStart and UserPromptSubmit; an existing ~/.claude/rules link is moved into the backup. Then `--version v1` on the clone: HEAD is the v1 commit, the scratch Claude file holds the v1 text ("Task workflow (all projects)"), ~/.claude/rules is linked, settings env has no ECC_TASK_FLOW, and every hook command still names the clone's tools/dispatch.cjs. `--version` refuses an unknown tag and a tracked change outside skills/synced/.
  - `node tools/validate.cjs` passes with v2 checks; `node --test task-system/tests/*.js` all pass.
- Probe (study runner, probe pool, gpt-6-luna high, outside any task board, C:/tmp/harness-v2-probe/): lean config at the v2 candidate commit on the gates fixture and the lean-flow fixture, plus one new prompt that needs a file added mid-task. The runner's lean config loads core/AGENTS.md and core/policy.json, so it tests v2's rules and gates but not the rendered text with the machine notes; the scratch-home check covers that (review PR-7). Pass: sessions complete; `files add` used where needed (no second record); the Checked line names a command that ran; no harness errors in stderr. Cost cap about 2M tokens.
- Scratch-home check: `codex debug prompt-input` with CODEX_HOME in a scratch home after a v1 install and after a v2 install: v1 includes "# Shared rules"; v2 includes "Write the record twice" and is under 45,000 characters (skills still listed).
- After the real install: `codex app-server` hooks/list in the real home shows every v2 hook trusted (current hash equals the stored one), or the owner is told which need /hooks review.
- Before/after: Codex instruction file 64,320 bytes (v1) -> under 8,000 (v2); hook entries 42 -> 5.

## Receipts

| field | value |
|---|---|
| closing commit | 238e1a1 (tagged v2; review fixes on top of 38905f8, the v2 core); v1 tagged on 90d9c0c. Owner approved committing once validate and tests pass. |
| files changed | core/machine.md (new), core/policy.json, policy.json (deleted), tools/install.cjs, tools/install-version.cjs (new), tools/render.cjs, tools/dispatch.cjs, tools/validate.cjs, tools/propagation.cjs, tools/propagation-state.cjs, tools/propagation-recovery-test.cjs, tools/bootstrap.cjs, scripts/hooks/file-size-gate.js, task-system/tests/test_install_version.js (new), test_instruction_load.js, test_stop_once.js, test_review_regressions.js, README.md |
| test | task-system tests 195/195 (194 at v1; new test_install_version.js red-first: both tests failed before the code); validate.cjs 23/23 on the live install; probe 3 Codex sessions completed (306,407 tokens, probe pool, C:/tmp/harness-v2-probe/); scratch-home installs of v1 and v2 each gave the expected start-up prompt; Codex hooks/list after install: 4 of 4 hooks trusted |
| before / after | Codex instruction file 64,320 -> 4,150 bytes; Claude 14,229 -> 4,150; Codex start-up prompt (scratch home, skills listed) 104,291 -> 42,515 characters; hook entries 42 -> 5 (Claude hook events 8 -> 4); ~/.claude/rules linked -> not linked |
| result | v2 tagged and installed as the default for Claude and Codex; v1 reinstalls by name (install.cjs --version v1), checked in a throwaway clone |

Notes / caveats / follow-ups:

- Plan review 1 (plan-reviewer agent, 2026-10-13): FAIL, 5 blocking and 4 advisory findings (PR-1 to PR-9). All accepted; the in-place install answers PR-3, PR-5, PR-6 and PR-9; the rest are listed under What and Verification.
- Plan review 2 (same agent, 2026-10-13): PASS with advisories A-1 to A-3, folded into Invariants and Verification.
- Diff review (diff-reviewer agent, no intent given, on 90d9c0c..38905f8): DR-1 HIGH (an interrupted switch, recovered as the README said, ran v1's installer with "--version" as the home folder and left the home half v1, half v2) and DR-2 MEDIUM (malformed options became installs). Both fixed in 238e1a1 with tests; the env is now fixed before the older installer runs, and recovery is that version's plain installer.
- Incident, 2026-10-13 16:49Z: the red run of the new option test called `install.cjs --version` with no tag; the parser of that moment ignored the flag and installed into the real home from a temporary clone the test then deleted. ~/.claude and ~/.codex linked to a missing folder for about four minutes. Restored by moving every saved binding back from ~/.agents/harness-backups/2026-10-13T16-49-43-320Z and copying its settings.json (byte-identical to before; validate 23/23 and tests 194/194 on v1 afterwards). The test now points USERPROFILE and HOME at a throwaway folder for every installer call and asserts nothing reached it. Claude Code hot-reloaded the bad settings env into this session, so its shells still carry ECC_TASK_FLOW=lean (tests were run with it unset).
- The probe did not exercise `files add`: given the whole task up front, the model listed all three files at `begin`. The command is covered by unit tests (task 21) only.
- Seen in the probe: `finish` lists `__pycache__/*.pyc` files in Files when the repository does not ignore them. Pre-existing; worth filtering out.
- The v2 install replaced Claude's hook commands, which used the full Node path ("C:/Program Files/nodejs/node.exe"), with the form render writes (`node "..."`), as Codex already used. Claude keeps no hook approvals, so nothing else changed.
- The worktree and branch used for the work (C:/Users/jkind/.agents/harness-v2-wip, branch v2) are removed; the branch name clashed with the tag.
- Study runner caveat (PR-7): at a v2 commit, the runner's task-only config copies its profile over root policy.json, which v2 no longer reads, so task-only would silently run the core policy. Only matters if task-only is run against v2.
