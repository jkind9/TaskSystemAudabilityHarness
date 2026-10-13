# Task workflow

Code work in this repository is tracked as **tasks**: one Markdown file per task under `task_list/` (or `docs/tasks/` if the repository already uses that). The task command-line tool is `node ~/.claude/task-system/task.js`. Hooks enforce the rules below; a refusal from a hook is on purpose, not a transient error.

## Before writing code

- Make sure exactly one task is `in_progress` and that the file you are about to edit is listed in its `files:` frontmatter.
- Useful commands:

      node ~/.claude/task-system/task.js init                                 # create task_list/ here
      node ~/.claude/task-system/task.js list                                 # open tasks; * marks the active one
      node ~/.claude/task-system/task.js new "title" --files src/x.py --docs README.md
      node ~/.claude/task-system/task.js start <id>                           # make an open task active

- Before a second code file is edited, the hook refuses any write to a file not in the active task's `files:` list. If the work grows, add the file to `files:` first. Do not retry a refused write unchanged.
- A code file may not grow past 800 lines.
- New documentation goes in an existing README or in a file listed under the task's `docs:`.

## Writing the task

Write the task file in plain English with these sections: **In plain English** (2-5 sentences for someone new to the project), **What**, **Why**, **How** (start with a short table of what already exists that you will reuse, with `file:line`), **Verification** (the test and the exact assertion), and **Receipts**.

Keep a **Current state** section at the top with: last test command and its exit code, the exact next action, and open decisions. Update it before you stop, so a later session can continue from the repository alone.

## Finishing

- A session that changed code cannot end while its task has unfilled receipts, un-updated `docs:` or no added or updated test. Fill the Receipts table (files changed, test result, before and after), update the declared docs, then move the task on:

      node ~/.claude/task-system/task.js move <id> pending_review
      node ~/.claude/task-system/task.js move <id> closed

- If the work continues in a later session, leave the task `in_progress` and write `still open because <reason>` in the receipts.
