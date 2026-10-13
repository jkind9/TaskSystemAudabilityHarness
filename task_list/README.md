# Study task board

This board tracks preparation, running and analysis of the harness study. Each record names its code scope, verification and receipts. State is recorded in frontmatter and in the containing folder: `open`, `pending_review`, `closed` or `archive`.

## Sequence

Work these in order. `node C:/Users/jkind/.claude/task-system/task.js ready --next` reads this table (ids in bold; struck-through ids are not worked directly).

| Order | Task | Depends on | Who can do it |
|---|---|---|---|
| — | ~~**00**~~ — [Measure the shared harness (Study 1)](pending_review/00_harness_experiments.md) | — | done; owner review |
| — | ~~**01**~~ — [Compare stock, task-only and full (Study 2 parent)](open/01_compare_stock_task_only_and_full.md) | — | parent record; work happens in 02–06 |
| — | ~~**02**~~ — [Build the isolated pilot runner](pending_review/02_build_the_isolated_pilot_runner.md) | — | done 2026-10-12 (pending_review: no git repo) |
| 2 | ~~**03**~~ — [Build and calibrate the two pilot tasks](pending_review/03_build_and_calibrate_the_two_pilot_tasks.md) | — | done 2026-10-12 (pending_review: no git repo to checkpoint) |
| — | ~~**04**~~ — [Define the value measures and blind review](pending_review/04_define_the_value_measures_and_blind_review.md) | — | done 2026-10-12 (pending_review: no git repo) |
| — | ~~**05**~~ — [Run the pilot](pending_review/05_run_the_pilot.md) | 02, 03, 04 | done 2026-10-12; isolation leak found, see FINDINGS.md |
| — | ~~**06**~~ — [Analyse the pilot and size Study 2](pending_review/06_analyse_the_pilot_and_size_study_2.md) | 05 | done 2026-10-12; owner approved the resized study 2026-10-13 |
| — | ~~**09**~~ — [Lean setup and new measures in the tooling](closed/09_add_the_lean_setup_and_new_measures_to_the_study_2.md) | — | done 2026-10-13 |
| — | ~~**10**~~ — [Choose and calibrate the six tasks](closed/10_choose_and_calibrate_the_six_tasks_for_the_resized.md) | 09 | done 2026-10-13 |
| — | ~~**11**~~ — [Run the resized Study 2](pending_review/11_run_the_resized_study_2_stock_and_lean_on_six_task.md) | 10 | done 2026-10-13; owner decision on the full reference runs |
| — | ~~**12**~~ — [Analyse the resized study and decide](closed/12_analyse_the_resized_study_2_and_decide_on_the_lean.md) | 11 | done 2026-10-13: lean meets the rule; owner chose to release it as harness v2 |
| — | ~~**13**~~ — [Update FINDINGS with the lean harness as built](closed/13_update_findings_with_the_lean_harness_as_built_bef.md) | 12 | done 2026-10-13; harness versioning continues in the harness board (tasks 20-23) |

**Source of truth:** [../FINDINGS.md](../FINDINGS.md) holds the current findings, research and proposed lean harness (owner, 2026-10-12). Update it first when results change.

## Handing work between Claude and GPT

The work moves between two assistants. Either one must be able to pick it up cold from this folder alone.

1. **Starting:** run `task.js list` from the study root. If a task is `in_progress`, continue it; otherwise run `task.js ready --next` and `task.js start <id>`. Read that task's **Current state** section first: it holds the exact next action, the last test run and its result, and any open decisions.
2. **While working:** only one task is `in_progress`. Add any new file to that task's `files:` list before writing it. Never edit or delete evidence from an attempted pilot run; a failed run is data.
3. **Stopping (every session, even mid-task):** rewrite the task's **Current state** section so it stands alone:
   - `- Last test: <command> -> exit <n>` (or `none run`)
   - `- Next action: <one concrete step a newcomer can do without asking>`
   - `- Open decisions: <questions for the owner, or none>`
   - `- Handoff note: <anything surprising, who worked last (Claude/GPT), date>`
4. **Owner decisions** go in the task under `## Clarifications` with the date. Do not decide an open owner question yourself; leave it in Open decisions and work on something not blocked by it.
5. **Budget:** the pilot may spend at most about 25M total tokens across all model sessions, including reviewer calls. The runner keeps the running total in `follow-up/study-002/results/budget.json`. Check it before launching any paid session.

## Tools

Use `node C:/Users/jkind/.claude/task-system/task.js list` and `lint` from the study root to inspect this board. Move records through the CLI so folder and frontmatter agree. The [study README](../README.md) explains Study 1's design and results; [follow-up/README.md](../follow-up/README.md) explains why Study 2 exists.

The study folder has no outer Git repository. Each experiment repository has its own frozen baseline commit. The shared harness source lives at `C:/Users/jkind/.agents/harness` (its own Git repository); the pilot copies it per run and never edits it.
