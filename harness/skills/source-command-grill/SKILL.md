---
name: source-command-grill
description: "Argue against my own work before it is accepted - find where it breaks, then say whether it stands."
---


# /grill — make the work prove itself

`/grill $ARGUMENTS`

`$ARGUMENTS` names what to attack: a file, a claim, a number, a commit range. With no
argument, attack the current uncommitted diff.

This is not a code review checklist. It is the opposite posture from writing the code:
assume it is wrong and go looking for the input that shows it.

## Steps

### 1. State what is being claimed

Write the claim in one sentence, in the form that could be false. "This change makes the
resume path safe when the process dies mid-write." "ZNCC on grey reaches 0.969 on the
21-category slate." A claim you cannot state precisely cannot be attacked, and that is
itself the finding.

### 2. Attack it on five fronts

For each, either name a concrete failing input or write "no defect found" — never a hedge.

1. **The boundary.** Empty, one, the maximum, one past the maximum, negative, unsorted,
   duplicated, unicode, a path with a space in it.
2. **The interrupted run.** Kill the process after each write or state change. What is on
   disk? Does the next run resume, refuse, or silently do half the job?
3. **The wrong input.** Feed it something malformed and check it *fails* rather than
   producing a plausible number. A test that only proves the happy path proves nothing about
   the failure path.
4. **The thing next door.** What else reads this file, this field, this table? Was that
   consumer updated? Name it by path.
5. **The provenance.** For any number: where did it come from, what run produced it, and does
   the file it came from still say that today? Open the file and read the value. Do not
   quote it from memory or from earlier in this conversation.

### 3. Attack the tests too

Would the test still pass if the change were reverted? If yes, it tests nothing. Say so.

### 4. Verdict

One of three, plainly:

- **Stands** — with the strongest attack you made and why it failed.
- **Breaks** — with the input that breaks it, and what the fix is.
- **Unproven** — the claim cannot be checked with what is here, and this is what would be
  needed to check it.

"Unproven" is a real answer. Reaching for "stands" because nothing obvious broke is the
failure this command exists to prevent.

## Harder variants

- `/grill scrap` — "knowing what you know now, throw this away and write the version you
  would have written first." Do it, then compare the two honestly, then say which wins and
  why. Sometimes the answer is the original.
- `/grill fresh` — spawn a `diff-reviewer` agent on the diff **without** telling it what the
  change was meant to do. Withholding the intent is the point: a reviewer who knows the goal
  inherits the author's blind spot.

## Where this fits

`/grill` is for after the code works and before it is accepted. It is not a replacement for
`code-reviewer` (quality) or `security-reviewer` (vulnerabilities), and it is not the task
system's `diff-reviewer` gate, which is a separate fresh-context pass required before closing
a HIGH or CRITICAL task. Use it whenever the first working answer arrives and is about to be
taken as the final one.
