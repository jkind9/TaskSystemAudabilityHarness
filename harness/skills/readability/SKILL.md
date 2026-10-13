---
name: readability
description: Readability pass over the current diff or a named file/directory — comment quality, variable naming, plain-English human-facing text — plus a VideoModule reuse scan for duplicated code and a staleness check on the READMEs that document the changed files. Trigger with /readability [path|branch].
---

# Readability Pass

It applies fixes directly — it is not a report-only review. Quality and documentation only:
it does not hunt for bugs (use /code-review for that).

## Step 0 — Scope

The argument picks the target; everything after Step 0 is identical for all modes.

| Invocation | Target |
|---|---|
| `/readability` | uncommitted changes: `git diff --name-only` |
| `/readability branch` | the whole branch: `git diff develop...HEAD --name-only` |
| `/readability <path>` | that file, or every code/doc file directly in that directory |

Path mode: resolve the path relative to the repo root (accept absolute too). If it doesn't
exist, say so and stop. In path mode there are no diff hunks — treat the **entire file** as
in scope for Steps 1–3 and 5, and run Step 4's reuse scan on every `def`/`class` the file
defines, not just new ones (existing duplicates are worth surfacing; near-duplicate verdicts
are expected to dominate here — flag, don't refactor, unless the duplicate is exact).

Split the target files into: code (`.py`, `.ts`, `.js`), notebooks (`.ipynb`), and
human-facing docs (`README.md`, other `.md`). Skip generated files, lockfiles, and data.
For notebooks, code cells follow Steps 1–2 and markdown cells follow Step 3; edit them
with NotebookEdit, never by rewriting the raw JSON.

## Step 1 — Comments

For each changed code file, read the changed hunks plus enough surrounding context to judge them.

Keep a comment only if it states something the code cannot show:
- a constraint or invariant ("bank must be seed-purified before coreset"),
- a WHY ("exponential backoff so retries don't hammer the API"),
- a deliberate deviation ("mutation on purpose — this array is 2M elements").

Delete or rewrite:
- narration of the next line ("# increment counter"),
- change-log comments ("# fixed in task 265", "# new approach"),
- reviewer-directed comments ("# this is correct because..."),
- comments that no longer match the code they sit above (comment rot — fix the comment
  or the code, whichever is wrong).

Docstrings on public functions: one plain-English sentence saying what it does and returns.
Match the density and style of the surrounding file — do not add docstrings to a file that
deliberately has none on private helpers.

## Step 2 — Names

For each new or renamed symbol in the diff:
- Names say what the thing IS or DOES: `phase_aligned_scores` not `res2`, `is_gate_open` not `flag`.
- Booleans read as questions: `is_`, `has_`, `should_`, `can_`.
- Units in the name when ambiguous: `timeout_ms`, `window_frames`, `threshold_px`.
- No single letters outside tight math/loop scope; no abbreviations the repo doesn't already use.
- Follow the file's existing convention (this repo: `snake_case` functions/vars,
  `PascalCase` classes, `UPPER_SNAKE_CASE` constants).
- Magic numbers that carry meaning become named constants.

Rename via a proper find-and-replace across the file (and its importers if the symbol is public).
If a public rename would ripple beyond the diff's scope, flag it in the summary instead of doing it.

## Step 3 — Human-facing text

Applies to README lines, markdown cells in notebooks, and user-facing strings touched by the diff.
Standard is `~/.claude/rules/communication-style.md`, enforced highlights:
- Plain phrase first, precise term in parentheses — never a bare coined name.
- No AI-tells: "it's worth noting", "comprehensive", "leverage", "robust", "delve",
  hedge prefaces, empty summary paragraphs.
- Every sentence must be parseable by someone who has read none of the other project files.
- Numbers and specifics beat adjectives ("NMI 0.543 → 0.603" not "a meaningful improvement").

## Step 4 — Reuse scan (VideoModule duplication check)

For every **new** `def` or `class` the diff adds inside this repo:

1. Grep `VideoModule/` for the function name, obvious synonyms, and the operation's
   key nouns (e.g. new `pool_residuals` → grep `residual`, `pool`, `union_pool`).
2. Check the usual homes first: `VideoModule/io/`, `VideoModule/plotting/`,
   `VideoModule/phase_detection/shared_functions.py`, `VideoModule/embeddings/`,
   `VideoModule/motion/`, and the relevant pipeline's `src/`.
3. Verdict per new symbol:
   - **Duplicate** — an existing block does the job: replace the new code with a call to it
     (or extend it with a parameter if the behaviour differs slightly).
   - **Near-duplicate** — same job, different shape, but merging would ripple beyond the
     diff: leave the code, flag it in the summary with both locations.
   - **Genuinely new** — note what was grepped so the task file's Reuse-scan line can cite it.

Do not silently accept two implementations of one job — that is the drift this step exists to stop.

## Step 5 — README staleness

For each directory containing changed code files, walk up to the nearest `README.md`
(this repo keeps one per major `VideoModule/` subpackage — README-only docs policy).

- **Verify claims**: any function signature, flag, default value, or behaviour the README
  states about a changed file must still be true. Fix stale lines in place.
- **Cover additions**: new public functionality gets a one-line entry in the README section
  that already lists its siblings — match the existing format, do not add new sections
  or restructure.
- **No README exists** and the diff adds a public surface worth documenting: flag it in the
  summary; do not create a README unprompted (file-creation policy).

README prose is human-facing — Step 3's standard applies to every line you touch.

## Step 6 — Summary

End with a short plain-English summary:
- what was fixed, grouped as comments / names / prose / duplication / READMEs,
- anything **flagged but not changed** (public renames, near-duplicates, missing READMEs)
  with file:line locations,
- explicitly say "no duplicates found" or "READMEs already accurate" when a step found
  nothing — silence reads as "not checked".

## Constraints

- Behaviour-preserving only. If a fix would change behaviour, flag it instead.
- Respect the task system: code edits need an in_progress task with the files in scope.
- Stay inline — no subagents unless the diff exceeds ~20 code files, then at most one
  `comment-analyzer` agent for the comment pass, results applied inline.
