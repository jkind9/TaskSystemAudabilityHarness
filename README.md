# Task-record harness for Claude Code and Codex

This harness makes Claude Code and Codex write a short record of each piece of coding work, and holds them to two limits while they code. Someone who reads only your repository can then see what was asked, what changed and how it was checked.

This repository holds the harness (in [`harness/`](harness/)) and the studies that measured it.

## What it does

- Each piece of work gets a task record. The assistant runs `task.js begin` to write the Goal and Plan, then `task.js finish` to write Files, Checked and Left over. Records go in `task_list/` at the top of your repository, in `open/` and then `done/`. A one-file change needs no record.
- From the second code file in a session, an edit to a file the open task does not list is refused. No code file may grow past 800 lines.
- `finish` reports new duplicate blocks (6 or more repeated lines), complexity, dead code, and stock AI-sounding phrases in the record and changed docs. It refuses to finish only on a new duplicate block or on a file over 800 lines that grew.
- A new session is told about its open task, or what the last task left over. A session that ends with its task still open gets one reminder.
- Each record names the session that began it, so two sessions in one repository each work on their own task.

A finished record, shortened (task 27 of the harness itself):

```markdown
---
id: "27"
title: Add an uninstaller
status: done
files:
  - tools/uninstall.cjs
  - task-system/tests/test_uninstall.js
---
## Goal
node tools/uninstall.cjs removes the install's links and puts back what the install replaced, deleting nothing

## Files
- task-system/tests/test_uninstall.js (+65 -0, 65 lines)
- tools/uninstall.cjs (+40 -0, 40 lines)

## Checked
- node --test task-system/tests/*.js -> 213 passed, 0 failed (2 new in test_uninstall.js)
- new duplicate blocks: 0
- prose patterns: 0 in 178 words
```

## How it works

One source folder serves both assistants. The installer links it into `~/.claude` and `~/.codex`, so a change to the folder reaches both on their next session.

| Part | Where | What it does |
|---|---|---|
| Instructions | `core/AGENTS.md` | 53 lines that every session loads: the rules above, the four task commands, and a short style card for code and writing |
| Hooks | `core/policy.json` | 5 hooks, all run through `tools/dispatch.cjs`: the task gate and the file-size gate run before each edit; a session-start note; a one-line end-of-session reminder; a snapshot of files already changed at session start |
| Task commands | `task-system/task.js` | `begin`, `finish`, `files add` (add a file to the open task) and `adopt` (take over a task a finished session left open) |
| End-of-task checks | `checks/` | Run once by `finish`, comparing the working tree with the last commit |
| Install and uninstall | `tools/install.cjs`, `tools/uninstall.cjs` | Build each assistant's instruction file and hook settings from `core/`, then link them in |

The gates watch the assistants' edit tools. A file written by a shell command is not checked.

## Why use it

The harness was measured with Codex (gpt-6-luna, high reasoning) on six coding tasks, one run each, against the same model with no harness (Study 2, 13 October 2026):

| Measure | No harness | Harness |
|---|---|---|
| Audit score: questions a blind reviewer could answer from the repository alone (of 8) | 3.6 | 5.9 |
| Tasks fully passed | 0 of 6 | 2 of 6 |
| New duplicate blocks | 5 | 0 |
| Changed files left over 800 lines | 7 | 3 |
| Tokens, all six tasks | 11.4M | 16.2M (1.42×) |
| Minutes, all six tasks | 38 | 66 |

On one task the harness did worse: it passed 44.9% of the target tests against 72.1%. With one run per task, any single difference could be chance. The reviewer could tell which runs used the harness, because the records give it away.

An earlier, larger version (v1: 64 KB of instructions and 42 hooks) was tested first, on three small tasks (Study 1). Every setup passed every graded check, and v1 used a median 185% more tokens than no harness. That result is why v2 is 53 lines of instructions and 5 hooks.

Full results, methods and limits: [FINDINGS.md](FINDINGS.md).

## Install

You need:

- Windows 10 or 11. The harness has not been tested on macOS or Linux.
- [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/) (tested on version 22).
- Claude Code, Codex, or both.

Clone onto the same drive as your user folder, usually `C:`. The installer hard-links two files, and Windows cannot hard-link across drives. In PowerShell:

```powershell
git clone https://github.com/jkind9/TaskSystemAudabilityHarness.git "$HOME\TaskSystemAudabilityHarness"
Set-Location "$HOME\TaskSystemAudabilityHarness\harness"
node tools/install.cjs
```

The installer prints one line of JSON that names the backup folder. It changes these files and folders:

- It links the `skills`, `agents`, `commands`, `scripts`, `task-system` and `output-styles` folders in `~/.claude` and `~/.codex` to the harness folder.
- It links `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` and `~/.codex/hooks.json` to files it generates.
- In `~/.claude/settings.json` it sets the hooks and two environment keys. It also picks the plain-language output style if you have none set, and turns off the everything-claude-code plugin if it is on, because the harness already runs its hooks.
- It adds one line to `~/.codex/config.toml`.
- It moves or copies everything it replaces into `~/.agents/harness-backups/<time>/` first.

Then close and reopen Claude Code and Codex. On its next start, Codex may ask you to review the new hook definitions.

Keep the cloned folder where it is. The assistants load the harness from it, so moving or deleting it breaks them. Uninstall first.

**Check it worked**, from the same folder:

```powershell
node tools/validate.cjs
```

It ends with a line containing `"status":"pass"`.

**Update** to a newer version:

```powershell
Set-Location "$HOME\TaskSystemAudabilityHarness\harness"
git pull
node tools/install.cjs
```

## Uninstall

```powershell
Set-Location "$HOME\TaskSystemAudabilityHarness\harness"
node tools/uninstall.cjs
```

The uninstaller deletes nothing:

- It removes the links the installer made.
- It moves the files the harness wrote, such as `settings.json` and `config.toml`, into `~/.agents/harness-backups/<time>-uninstall/`. Copy back from there any setting you added while the harness was installed.
- It puts back what the first install replaced.
- It runs once per install. A second run stops with "nothing to undo".

Close and reopen Claude Code and Codex. You can then delete the cloned folder. Codex command approvals made while the harness was installed are in `harness/rules/default.rules`, if you want to keep them.

## Change the harness

Skip this if you only use the harness.

The hooks and task commands run from the folder the harness was installed from. An edit there changes every running session at once, before any test has run. So the copy you edit and the copy you install are kept apart:

- Edit only `harness/` in this repository, under a task record, and commit.
- Install from a separate git repository with the harness's history. On the owner's PC that is `~/.agents/harness`. To make one, clone the bundle and install from the clone:

  ```powershell
  git clone harness-history.bundle "$HOME\.agents\harness"
  Set-Location "$HOME\.agents\harness"
  node tools/install.cjs
  ```

- Deploy each committed change with the deploy script, from this repository's top folder. Never edit the installed copy by hand.

  ```powershell
  node tools/deploy-harness.cjs --check   # build and test only
  node tools/deploy-harness.cjs           # build, test, then deploy
  ```

The script applies the change to a temporary clone of the installed copy and runs all the harness tests there. Only when they pass does it move the installed copy to the tested commit and rebuild the instructions. It refuses to run when either copy has uncommitted changes. It also refuses when the installed copy matches no commit here, which means someone edited it directly. After a deploy, commit the rewritten `harness-history.bundle` and push. `--live <folder>` deploys to an installed copy other than `~/.agents/harness`.

Steps, and how to recover from a direct edit: [docs/maintenance.md](docs/maintenance.md).

## Repository layout

| Path | What it is |
|---|---|
| [`harness/`](harness/) | The harness. Every change is made here, then deployed. Its own [README](harness/README.md) has the change log |
| `harness-history.bundle` | The installed harness's git history, with tags `v1`, `v2` and `v2.1`. Rewritten by each deploy |
| [`tools/deploy-harness.cjs`](tools/deploy-harness.cjs) | Deploys committed changes from `harness/` to the installed copy; self-test in `tools/deploy-harness-selftest.cjs` |
| [`FINDINGS.md`](FINDINGS.md) | Results, design decisions and what each release changed |
| [`docs/study-1.md`](docs/study-1.md) | Study 1: the v1 harness on three small tasks |
| [`docs/maintenance.md`](docs/maintenance.md) | Deploy steps, recovering from a direct edit of the installed copy, and installing an older version |
| [`follow-up/study-002/`](follow-up/study-002/) | Study 2 tools, protocols and measures |
| `archives/`, `experiments/`, the rest of `tools/`, `protocol.json` | Study 1 tools and inputs |
| `task_list/` | This study's own task records |

Run folders, frozen task inputs and the blind-review keys are not tracked, because they are large or private. See `.gitignore`.
