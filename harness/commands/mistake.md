---
description: Turn a mistake I just made into a dated rule in the right CLAUDE.md so it does not recur.
---

# /mistake — write the lesson down where it will be read

`/mistake $ARGUMENTS`

`$ARGUMENTS` is what went wrong, in the user's words. It may be as short as "you used the
wrong python" or as long as a paste of the failure.

The point is that a correction given in chat is forgotten at the end of the session. A rule
in `CLAUDE.md` is loaded into every future session. This command moves the correction from
the first place to the second.

## Steps

### 1. Find the actual cause, not the symptom

Look back through this session for the specific action that went wrong. Name it: the tool
call, the file, the assumption. If the session does not contain it, say so and ask rather
than inventing a plausible cause. **Do not write a rule against a cause you have not located.**

Ask one question of the evidence: would the rule you are about to write have prevented *this
specific* failure? If not, it is a slogan, not a rule.

### 2. Pick the file

| Kind of mistake | Goes in |
|---|---|
| Only true in this repo (paths, data layout, which numbers are canonical, build commands) | `<repo>/CLAUDE.md` |
| True everywhere I work (habits, tool choices, output style) | `~/.claude/CLAUDE.md` |
| A rule that must *block*, not merely advise | a hook — see `~/.claude/scripts/hooks/`, and say so instead of writing prose |

The third row matters. A rule that has already been written down once and broken anyway does
not need writing down more emphatically; it needs a gate. Say that plainly rather than adding
a second paragraph of prose on top of the first.

### 3. Write the rule

One rule. Specific, checkable, and short enough to survive being read at speed:

- **Bad:** "Be careful with file paths."
- **Good:** "Dataset roots live under `C:\tmp`, never inside the repo. `datasets/` in the repo
  holds loaders only."

Append it under a `## Learned rules` heading, with the date and one clause of evidence:

```markdown
## Learned rules

- **2026-08-22** — Quote result numbers only from `experiments/paper/current_results.md`.
  A number was taken from a stale `experiments/results/*.json` and reached section 5 of the
  manuscript.
```

The evidence clause is what stops the file rotting: a year from now it says whether the rule
is still earning its place.

### 4. Prune while you are in there

Read the neighbouring rules. If the new one supersedes an older one, edit the old one out
rather than stacking. A `CLAUDE.md` that grows without pruning stops being read.
Report what you added and what you removed.

## What not to do

- Do not apologise in the file. It is a rule sheet, not a log.
- Do not add a rule the repo already enforces in code or in a hook — check first.
- Do not write a general principle when the mistake was specific. Specific rules get followed.
