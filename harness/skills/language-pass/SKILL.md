---
name: language-pass
description: Prose-only rewrite pass that strips AI-tells, consultant-speak, and unglossed coined jargon from human-facing text — a named file, directory, the current diff, or pasted text. Trigger with /language-pass [path|branch|blank for uncommitted changes]. Use when text needs to sound like a person wrote it. For a full quality pass (names, comments, duplication, READMEs) use /readability instead.
---

# Language Pass

Rewrites human-facing prose in place so it reads like a colleague wrote it.
Standard is `~/.claude/rules/communication-style.md`; the deterministic wordlist
lives in `~/.claude/scripts/lib/plain-language.js`. Prose only — it never
changes code behaviour, names, or structure (that is /readability's job).

## Step 0 — Scope

| Invocation | Target |
|---|---|
| `/language-pass` | uncommitted changes: prose files and prose lines in `git diff --name-only` |
| `/language-pass branch` | the whole branch: `git diff develop...HEAD --name-only` |
| `/language-pass <path>` | that file, or every prose file directly in that directory |
| pasted text in the same message | rewrite the pasted text, return it in a code block |

In-scope surfaces: `.md` files, notebook markdown cells (edit with NotebookEdit,
never raw JSON), docstrings and comments in touched code files, and user-facing
strings. Out of scope: task files under `task_list/`/`docs/tasks/` (engineering
records — except their "In plain English" section, which IS in scope), code
identifiers, anything under `.claude/` that quotes the banned list.

## Step 1 — Deterministic sweep

Run the shared scanner over each in-scope file to find the known offenders:

```
node -e "const{scan}=require(process.env.HOME+'/.claude/scripts/lib/plain-language.js');const fs=require('fs');for(const f of process.argv.slice(1)){const h=scan(fs.readFileSync(f,'utf8'));if(h.length)console.log(f+': '+h.join(', '))}" <files...>
```

(On Windows the home path is `C:/Users/<user>/.claude/...`.) Every hit gets
rewritten — not deleted-and-forgotten: replace the phrase with the plain fact
it was decorating, or cut the sentence if it carried no information.

## Step 2 — Judgment pass (what the wordlist cannot catch)

Read each in-scope file once, as a person with no project context. Fix:

- **Coined shorthand used bare.** Any invented name ("gate collapse",
  "the subset-bias trap") gets a plain phrase first and the short name in
  parentheses, once per file. After that the short name stands.
- **Cross-reference dependency.** A sentence that only parses if you have read
  another file gets the reason inlined. "Per Task 10, X is unscoreable" also
  says why, in place.
- **Restated points.** Two sentences saying the same thing become one.
- **Rhythm-only phrases.** Triplets, em-dash build-ups, empty closers: cut.
- **Adjectives doing a number's job.** "much faster" becomes the measurement
  if it exists nearby; if no number exists, flag it rather than inventing one.

Keep real technical terms (macro-F1, coreset, idempotent) — precision is not
jargon. Keep the author's meaning exactly: this pass changes wording, never
claims. If a sentence is ambiguous enough that rewriting risks changing its
meaning, flag it instead of guessing.

## Step 3 — Verify and summarise

Re-run the Step 1 sweep; it must come back clean on every touched file. Then
report: files touched, offender count before/after, the judgment-pass fixes
grouped by kind, and anything flagged but not changed (ambiguous sentences,
missing numbers) with file:line.

## Constraints

- Meaning-preserving only. Numbers, claims, and caveats survive verbatim.
- Respect the task system: notebook/code-file edits need an in_progress task
  with the files in scope; pure .md edits are not gated but still get listed
  in the summary.
- Stay inline — no subagents. This is a reading-and-rewriting pass, not a
  fan-out job.
