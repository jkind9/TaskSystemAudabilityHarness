---
id: "04"
title: Define the value measures and blind review
status: pending_review
priority: HIGH
type: experiment
blocked_by: []
blocks: ["05"]
verification_test: follow-up/study-002/measures/selftest.cjs
plan_reviewed: 2026-10-12 PASS
files:
  - follow-up/study-002/measures/**
  - follow-up/study-002/reviews/**
  - follow-up/study-002/tools/review.cjs
  - follow-up/study-002/tools/runner.cjs
  - follow-up/study-002/tools/lib.cjs
  - follow-up/study-002/tools/snapshot.cjs
  - follow-up/study-002/tools/selftest.cjs
  - follow-up/study-002/tools/manifest.sha256
  - follow-up/study-002/README.md
docs:
  - follow-up/study-002/README.md
baseline_metric:
  source: "Study 1 README.md"
  field: "owner outcomes with a defined measure"
  baseline_value: "1 of 6 (cost only; correctness was measured but at ceiling)"
  target: "6 of 6 outcomes have a measure module that passes its selftest; the scripted parts also run on all 18 Study 1 runs"
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 04 — Define the value measures and blind review

## Current state

- Last test: node --test follow-up/study-002/measures/selftest.cjs -> exit 0 (21/21); node --test follow-up/study-002/tools/selftest.cjs -> exit 0 (15/15); node measures/dryrun.cjs 4650a11… -> exit 0 on all 18 Study 1 runs (2026-10-12)
- Next action: owner review. Engineering is done; pending_review only because the study folder has no git repository, so the receipt is a hash list, not a commit. The model-scored parts run in task 05 after all pilot sessions (`blind.cjs build|run|collect`, then `score.cjs`).
- Open decisions: none
- Handoff note: Claude, 2026-10-12. A fresh-context diff review found 6 defects (DR-1 to DR-6) plus one likely; all fixed red-first, see Receipts. Gotcha for the next editor: in this machine's Git Bash, heredocs and python -c collapse doubled backslashes, so write regex or path literals with the editor, not through the shell.

## In plain English

The owner wants to know whether the harness makes work easier to audit, leaves less mess behind, writes plainer English and plans better, and what that costs. This task turns each of those into something we can score the same way for every run, without the scorer knowing which setup produced the work. Where a script can measure it, a script does; where judgement is needed, a reviewer model scores against a fixed checklist with no setup labels.

## Clarifications

### Session 2026-10-12

- Per-session timeout 30 minutes; restart task split as two requests with a clean session end; delegation off in all configs; proposed measurement details accepted (8-question audit form, 6-item debt rubric 0–2, duplicates = 6+ repeated lines, 1 blind review per run, 1 infrastructure retry per session only if no model thread started). Owner answers, 2026-10-12.

## What

Under `follow-up/study-002/measures/`, one module per outcome, each taking a run's evidence folder and returning JSON:

| Outcome | How it is scored | Kind |
|---|---|---|
| Correctness | task 03 grader categories passed; whole-task pass yes/no | script |
| Planning and recovery | (a) session-2 tokens and tool calls before its first file edit (repeated discovery); (b) part-1 decisions from the answer key that session 2 kept or broke; (c) grader categories missed at the end | script + answer key |
| Auditability | a blind auditor sees only the final repository (git log, diff, task files, READMEs, comments; not transcripts) and answers a fixed 8-question form: what changed, why, what was tested and the result, what is unfinished, which decisions were made. Score = answers matching the answer key built from the transcript by a separate scorer | blind model + key |
| Technical debt | script: lines added/removed, files over 800 lines, duplicate blocks of 6+ lines added (simple normalised-line hashing, no network tools), tests added, existing linter errors if the repo has one. Blind reviewer: fixed 6-item rubric (duplication, dead code, naming consistency, error handling, test quality, change scope) each 0–2 | script + blind rubric |
| Plain language | final message and added doc lines: banned-phrase hits per 1,000 words using the harness word list, Flesch reading ease, average sentence length. Blind reviewer rates clarity 1–5 for a reader new to the project | script + blind rating |
| Cost | fresh input, cached input, output, reasoning tokens, all reviewer calls, elapsed seconds; per session and per run | script (from task 02 result.json) |

Also `blind.cjs`: builds anonymised review packets (randomised order, neutral packet ids, no config labels or private paths), first writes a frozen packet manifest (`follow-up/study-002/reviews/packets.json`, one id per packet), then runs each review with `runner.cjs review <packet-id>` (task 02: stock config, its own private CODEX_HOME, HOME and TEMP, 4M review allowance), and stores the raw reviewer output. The runner, not blind.cjs, records review usage in the ledger.

## Why

Study 1 measured cost well but had nothing that could show a benefit: correctness was at ceiling and no measure covered auditability, debt, language or planning (README.md "Limits and next experiments"; follow-up/README.md "What to measure"). Without these, a pilot can only repeat Study 1's cost finding.

## How

**Reuse evidence**

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Banned-phrase word list and scanner | harness scripts/lib/plain-language.js | plain-language-gate.js, plain-language-audit.js | C:/Users/jkind/.agents/harness/scripts/hooks/plain-language-audit.js:32-34 |
| Usage fields per run | Study 1 result.json via tools/runner.cjs `normalizeUsage` | tools/analyse.cjs | tools/runner.cjs:53-62 |
| Blind review of anonymised submissions already done once | private/blind-review.json | README.md | README.md "A blind Luna reviewer read anonymized first-repetition submissions" |
| Test-order measure (failing test before first production edit) | private/supplement.ps1 | results/supplementary.json | README.md "Supplementary test-order measurements" |

Import the plain-language word list from a pinned harness copy (record its SHA-256); do not copy it by hand.

**Blinding:** the full config leaves more task files than stock by design, and a reviewer can infer the setup from them. Do not hide that; instead record the reviewer's guess of the setup for every packet and report how often it was right. The auditability score counts only answers that match the key, so extra files help only if they are accurate.

**Reviewer model:** Luna, high reasoning, delegation off, same prompt for every packet; usage counted in the budget.

## Hyperparameters

| name | value | source |
|---|---|---|
| reviewer model | gpt-6-luna, high | inherited protocol.json:4-5 (owner requirement Luna throughout, confirmed 2026-10-12) |
| audit form | 8 fixed questions | confirmed 2026-10-12 (owner accepted proposal) |
| debt rubric | 6 items scored 0–2 | confirmed 2026-10-12 (owner accepted proposal) |
| duplicate block length | 6 normalised lines | confirmed 2026-10-12 (owner accepted proposal) |
| plain-language word list | harness scripts/lib/plain-language.js at pinned commit | inherited from harness |
| reviews per packet | 1 (pilot) | confirmed 2026-10-12 (owner accepted proposal); task 06 decides whether Study 2 needs more |

## Invariants and recovery

invariants n/a: offline scoring of retained evidence; reviewer raw output is stored once per packet and never overwritten (a re-review gets a new id).

## Verification

- `node follow-up/study-002/measures/selftest.cjs`: each script measure gives the documented value on a small hand-made fixture (for example, a message with 2 banned phrases in 400 words scores 5.0 per 1,000 words; a diff adding the same 6-line block twice reports 1 duplicate).
- Dry run on Study 1 evidence: the scripted parts (cost, plain language, debt script, correctness from Study 1 grades) run on all 18 runs without error. Report the values; they are a reference point, not results. The model-scored parts (auditability, debt rubric, clarity rating) are checked only on fixtures, to save budget.
- Blind packet check: no packet's metadata, file names or paths contain a config label (`stock`, `task-only`, `full-config`, `control`), a run id, or a private home, harness clone or temp path. Ordinary words in code and diffs are not checked; task files stay visible by design (see Blinding).

## Receipts

| field | value |
|---|---|
| closing commit | no git repository in the study folder. SHA-256 (first 16 hex) of measures/: auditability 72c669d8897f38b0, blind c83c00ae6b3252b1, correctness bd6a94286ecea022, cost cc8f131efc268b63, debt 3cb39b6f00364126, dryrun 8f03e3f8280984ae, evidence 612ecb45ccd001dc, forms 4829ed7a52656a81, plain_language 7624e9a36937d9f7, recovery 7b111c1c67df85bf, score 656d4c49e111081d, selftest 522b7a32f763ad5a; tools/manifest.sha256 1904bb725876d7f5… covers the tool files changed by the review fixes |
| files changed | new: measures/{evidence,correctness,recovery,auditability,debt,plain_language,cost,forms,blind,score,dryrun,selftest}.cjs, measures/dryrun-study1.json. Changed after the diff review: tools/review.cjs, tools/runner.cjs, tools/lib.cjs, tools/selftest.cjs, tools/manifest.sha256. README.md section "Value measures" and two review bullets |
| test | measures/selftest.cjs 21/21; tools/selftest.cjs 15/15. Red-first: all measure tests failed before the modules existed; then 4 leak tests (four-backslash paths, URL-encoded links, wrapped paths, per-entry scrub) and 8 review-fix tests each failed before their fix |
| before / after | owner outcomes with a defined measure: 1 of 6 -> 6 of 6 (correctness, planning and recovery, auditability, technical debt, plain language, cost), each with a module that passes its selftest; scripted parts ran on all 18 Study 1 runs (all pass, 0 banned phrases, 0 duplicate blocks; median tokens stock 189,526, instructions 501,336, full 541,997) |
| result | measures ready; blind packets built from probe evidence pass the leak check |

Notes / caveats / follow-ups:

- Diff review (fresh context, no intent given): DR-1 first-code-edit detector counted task-record writes (would bias recovery against task-only and full) -> now only patch headers and shell write targets; DR-2 a dead or failed review left the lock, no ledger entry and a burned id -> `recover-review`, one `-retry1` when no model thread started, collection never loses the record; DR-3 octal-quoted git paths crashed parsing -> decoded; DR-4 failed blind build could not be re-run -> checked in memory before writing; DR-5 an evaluator error scored as 0% -> unknown; DR-6 review tokens 0 before answers existed -> unknown; likely defect with doubled-backslash paths starting with "n" -> fixed and tested.
- The key scorer reads transcripts, so it can see hook messages and harness paths; only the auditor, clarity and recovery packets are blind. Stated in the README.
- No linter is run (none in the offline wheel caches).
- Edits made by a script the model runs (for example `python fix.py`) are not seen by the first-code-edit detector.
