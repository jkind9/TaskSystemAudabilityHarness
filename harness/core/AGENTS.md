# Working rules

## What is enforced

- From the second code file you change in a session, each code write must be listed in the open task's `files:`. A refused write is on purpose: start a task with `begin`, or add the file with `files add` (below), then retry. Never retry it unchanged.
- No code file may grow past 800 lines. Put new code in a new module.
- If you end a session with a task still open, you get one reminder to finish it.
- `task.js finish` refuses a new duplicate block (6 or more repeated lines) or a changed code file over 800 lines. Fix it and run `finish` again.

## Task records

One record per piece of work, in `task_list/` at the repository's top folder: `open/` while in progress, `done/` after. A one-file change needs no record. Write the record twice, one command each:

    node "$HOME/.claude/task-system/task.js" begin "<title>" --files a.py,tests/test_a.py --goal "<one line>" --plan "1. ... 2. ..."
    node "$HOME/.claude/task-system/task.js" finish --checked "<command> -> <result>" --left "<what is left, or none>"

`begin` writes Goal and Plan. `finish` runs the end-of-task checks and writes Files (what changed), Checked (your command and result, then duplicate blocks, complexity share, dead code and prose patterns) and Left over, then moves the record to `done/`. `--checked` names a check you ran and what it showed; if the change has nothing to test, write `--checked "no test exists: <why>"`. "Not run" is not a check. If the work needs a file you did not list, add it to the open record (do not begin a new one):

    node "$HOME/.claude/task-system/task.js" files add b.py

Do not edit the record by hand. These three commands are all you need: the other files in `~/.claude/task-system/` describe a larger task system that does not apply here.

If the work continues in a later session, still run `finish` and say what is left in `--left`. The next session sees it at start-up and when it runs `begin`.

## Code

Before writing code, stop at the first answer that works:
1. Does this need to exist? 2. Is it already in this codebase? 3. Does the standard
library or an installed dependency do it? 4. Then write the least code that works,
plus one test for any branch, loop or parser.
- Change only what the request needs. Every changed line traces to the request.
- No options, layers or error handling for cases that cannot happen.
- Match the names and style already in the file.
- Comments say why, never what. Delete a comment that repeats the code.

## Writing (messages, docs, task records, comments)

- Plain words, one idea per sentence, numbers over adjectives.
- Define any term you made up, the first time you use it.
- No chat openers, closing summaries or filler phrases (the prose check names them).
- End every session with four lines:

      Changed: <what changed, in plain words>
      Checked: <command> -> <result>
      Left over: <what is left, or none>
      Record: task_list/done/<file> (or "none" for a one-file change)

Example. Before: "This robust solution handles every edge case, ensuring reliability."
After: "Empty input now returns []; tested by test_empty_input."
