---
id: "02"
title: Build the isolated pilot runner
status: pending_review
priority: HIGH
type: infra
blocked_by: []
blocks: ["05"]
verification_test: follow-up/study-002/tools/selftest.cjs
plan_reviewed: 2026-10-12 PASS
files:
  - follow-up/study-002/tools/**
  - follow-up/study-002/profiles/**
  - follow-up/study-002/probes/**
  - follow-up/study-002/reviews/**
  - follow-up/study-002/budget.json
  - follow-up/study-002/README.md
docs:
  - follow-up/study-002/README.md
baseline_metric:
  source: "Study 1 (README.md 'Injected shared session memory'; harness task 10)"
  field: "configurations proven isolated at runtime and, where hooks are on, enforcing refusals"
  baseline_value: "0 of 18 Study 1 runs isolated from shared session memory; 0 of 10 traced Codex refusals enforced"
  target: "3 of 3 configurations pass the runtime isolation probe and the expected enforcement probe before any pilot session"
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 02 — Build the isolated pilot runner

## Current state

- Last test: node --test follow-up/study-002/tools/selftest.cjs -> exit 0 (12/12, 2026-10-12)
- Next action: owner review. Engineering is done: runner, review mode, budget pools and probes; harness task 11 committed (9640d8f, closed in 4650a11). It sits in pending_review only because the study folder has no git repository, so the receipt is a hash manifest, not a commit.
- Open decisions: none
- Handoff note: Claude, 2026-10-12. Added review mode (tools/review.cjs, dispatched by `runner.cjs review`) and generalised `launch()` so sessions and reviews share one credential, timeout and kill path. Live smoke check of a read-only review with an output schema: probes/review-smoke/r1, 13,846 tokens, schema-shaped answer.

## In plain English

We need a program that runs the same coding request through Luna three ways: with no custom setup, with only the task-tracking system, and with the full shared setup. Each run must be sealed off so nothing from one run (notes, summaries, settings, temporary files) leaks into another, and so the host's real settings are never touched. The program also runs a second session on the same project later, to test picking up where the first left off, saves the project's state after every session, and records every token and second spent, including the reviewers' usage.

## Clarifications

### Session 2026-10-12

- Stop-gate loop: bound it so a session may end after 3 consecutive end-of-session refusals, logging that the gate gave up (owner).
- Budget: setup probes (13.1M so far) are counted and reported separately; the pilot keeps its own 21M sessions + 4M reviews (owner).

## What

New code under `follow-up/study-002/`:

- `tools/prepare.cjs` — reads `follow-up/study-002/protocol.json` (written in task 05) or `follow-up/study-002/probes/protocol.json` (probes), and builds per run: private `CODEX_HOME`, private `HOME`/`USERPROFILE`, private `TEMP`/`TMP`, a harness clone at a pinned commit (task-only and full), the run's repository clone, and a frozen manifest beside the protocol.
- `tools/runner.cjs` — `run <run-id> <1|2>`: one pilot session, journaled; captures events, native transcript, result.json (now including `threadId`), and the end-of-session repository snapshot. `review <packet-id>`: one blind-review session in stock config, in its own private folder under `follow-up/study-002/reviews/`; packet ids come from a frozen packet manifest that task 04's `blind.cjs` writes before any review starts.
- `tools/budget.cjs` — the only writer of `follow-up/study-002/budget.json`, called only by the runner after each probe, session or review. Entries have a kind (`probe`, `session`, `review`) and an id; adding an id twice is refused. Two allowances from the manifest: 21M for probes and sessions together, 4M for reviews.
- `tools/selftest.cjs` — deterministic contract tests (no model calls).
- `profiles/task-only/AGENTS.md` (target under 4 KB) and `profiles/task-only/policy.json` (task-gate, file-size-gate, documentation-policy, bash-documentation-policy on PreToolUse; task-complete-gate on Stop; docs-snapshot on SessionStart).
- `probes/` — its own protocol, evidence and results; never mixed into the pilot's results.
- `README.md` — prepare, run, recover, read evidence.

| Config | Instructions | Custom skills | Hooks | Task CLI |
|---|---|---|---|---|
| stock | none (Codex built-ins only) | off | off | not mentioned |
| task-only | `profiles/task-only/AGENTS.md` | off | task-only policy via the clone's dispatcher | clone's `task-system/task.js` |
| full | clone's rendered `generated/INSTRUCTIONS.md` as AGENTS.md | on (clone) | full policy via the clone's dispatcher | same |

## Why

Study 1 could not show whether a working harness helps: its gates never stopped anything in Codex, and its "full" runs received session summaries from the host and earlier runs (README.md, "Injected shared session memory"), even though its prompt-input isolation check passed. The old runner hard-codes host paths (`tools/runner.cjs:11-13`) and a fixed 18-run protocol (`tools/prepare.cjs:41-43`); it stays frozen as Study 1 evidence.

## How

**Reuse evidence**

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Atomic JSON writes for journals | tools/runner.cjs `atomicJson` | journal, result | tools/runner.cjs:18 |
| Credential alias linked per run and removed after the process tree exits | tools/runner.cjs executeRun | each paid run | tools/runner.cjs:282-296 |
| Process-tree kill on Windows | tools/runner.cjs `killTree` | timeout, interrupt | tools/runner.cjs:176 |
| Usage from `turn.completed` with transcript fallback | tools/runner.cjs `usageFromEvents` | result.json | tools/runner.cjs:64 |
| Transcript discovery and model context | tools/runner.cjs `transcriptInfo` | result.json | tools/runner.cjs:190 |
| Refuse to overwrite an attempted run | tools/runner.cjs `assertRunUnattempted` | executeRun | tools/runner.cjs:77 |
| Refuse out-of-order runs; earlier runs must have exited | tools/runner.cjs `assertPriorComplete` | executeRun | tools/runner.cjs:146-158 |
| Codex config text, explicit skill list, doc size limit, sandbox | tools/prepare.cjs `configText` | prepare | tools/prepare.cjs:76-88 |
| Tree hashing for frozen inputs | tools/prepare.cjs `treeHash` | manifest | tools/prepare.cjs:26 |
| Session summaries follow `HOME`/`USERPROFILE` | harness utils.js `getHomeDir` | session-start, session-end | C:/Users/jkind/.agents/harness/scripts/lib/utils.js:28 |
| Docs snapshot and completion gate use the OS temp folder, not HOME | harness docs-snapshot.js, task-complete-gate.js | Stop gate | C:/Users/jkind/.agents/harness/scripts/hooks/docs-snapshot.js:35; task-complete-gate.js:264 |
| Dispatcher root and audit log follow the clone | harness render.cjs `root`, dispatch.cjs `audit` | every hook event | C:/Users/jkind/.agents/harness/tools/dispatch.cjs:165-169 |
| A Codex refusal reason starts `[Hook]`; a hook execution failure starts `[Shared harness] Hook execution failed` | harness dispatch.cjs (task 10) | Codex, which shows the reason in the transcript | C:/Users/jkind/.agents/harness/tools/dispatch.cjs:200-205 |
| Hook trust hash comes from Codex itself | `codex app-server` `hooks/list` → `currentHash` | private `[hooks.state]` | verified live 2026-10-12 (harness task 10 notes) |

Copy functions into the new tools; Study 1 tools stay byte-identical.

Steps:

1. **Harness clone per run.** `git clone --no-hardlinks C:/Users/jkind/.agents/harness <run>/harness`, checkout the pinned commit, record the SHA. Always run the clone's `tools/render.cjs` (its `generated/` folder is gitignored, so a fresh clone has no instructions). The clone is the committed harness; the host's uncommitted `skills/synced` changes are not in it. Record that as a stated difference from the installed harness. Task-only: replace the clone's `policy.json` with the task-only profile.
2. **Private HOME, TEMP.** Create `<run>/home` with `.claude/task-system` and `.claude/scripts` linked to the clone, an empty `.claude/session-data`, and `<run>/tmp`. Launch Codex with `CODEX_HOME`, `HOME`, `USERPROFILE`, `TEMP` and `TMP` all private (checked live by the reviewer: PowerShell `~` and Node `os.homedir()` follow USERPROFILE; `os.tmpdir()` follows TEMP).
2b. **Skills (found 2026-10-12 before building):** Codex discovers host skills through `~/.agents/skills` (a link to the host harness skills) using the real Windows profile, even with a private USERPROFILE (`codex debug prompt-input` showed custom skills in both cases). So every config's config.toml lists each host skill path with `enabled = false` (Study 1's method, tools/prepare.cjs:67-77); full additionally lists the clone's skills with `enabled = true`.
3. **Hooks.** `hooks.json` points at the clone's `tools/dispatch.cjs` (task-only: SessionStart, PreToolUse, Stop; full: every event of the installed adapter). Trust from `hooks/list` `currentHash`. Never use `--dangerously-bypass-hook-trust`.
4. **Repository snapshot after every session.** Save `snapshot-<n>/`: HEAD SHA, `git status --porcelain=v1 -uall`, and a full diff from the frozen baseline including untracked files, made with a temporary index (`GIT_INDEX_FILE` pointing outside the repo, `git add -A`, `git diff --cached --binary <baseline>`), so the run's own index is untouched. Also a tree hash of the working directory.
4b. **From task 03 calibration (2026-10-12):** clone every run repository with `core.autocrlf=false` (Windows line-ending conversion broke patch application in the Linux grader); before session 1, build the run's Python virtual environment offline from `follow-up/study-002/tasks/<task>/wheels/` outside the git tree (Codex has network off), and for the public task also run `pip install --no-build-isolation -e .`. Record the environment's package list in the manifest.
5. **Session 2.** A new `codex exec` process and thread in the same repo and private dirs. Pre-launch check: session 1 is terminal, its process tree exited, and the repo's working tree hash equals session 1's snapshot (not the clean baseline check of tools/runner.cjs:130-131).
6. **Retries.** The protocol lists, for every session, one optional retry id (`<id>-retry1`). The runner allows a retry id only if the original session's result.json has `threadId: null` (no model thread started). A session-1 retry uses a spare run folder that prepare builds at freeze time from the same frozen inputs (prepare is never re-run after the first session). A session-2 retry reuses the same run folder: the model never started, so the repository and private folders are unchanged, and the pre-launch check still compares the tree hash with session 1's snapshot.
7. **Budget.** Before a probe or session, refuse if the probe+session total plus the largest single session so far would pass 21M. Before a review, refuse if the review total plus the largest review so far would pass 4M; before the first review, use 400,000 tokens as the estimate (a little above Study 1's largest run, about 0.62M total across a whole coding session, scaled down because a review reads one packet). The packet manifest's SHA-256 is recorded at the first review; any later review refuses if it changed. After each one, the runner records its usage once via `budget.cjs`.
8. **Evidence per session.** events.jsonl, stderr.log, native transcript copy, result.json, repository snapshot, the clone's `state/hook-runs.jsonl`, the private `session-data` and `tmp` folders.

**Hook log limit (PR-2).** The dispatcher's `hook-runs.jsonl` records status 2 for both a refusal and an execution failure and does not keep the reason. The runner classifies each blocked tool call from the native transcript instead: the reason Codex shows starts with `[Hook]` for a refusal and `[Shared harness] Hook execution failed` for a failure. A blocked call with neither prefix is reported as unclassified, not guessed.

**Classification limits (PR-19).** A hook that prints a `[Hook]` line and then times out is counted as a refusal; a hook that crashes with an exit code other than 2 is passed by the dispatcher and so is not a block at all; any blocked call whose reason has neither prefix is reported as unclassified. The README states these limits.

**Known treatment leak (PR-7).** On every SessionStart the dispatcher adds "Shared harness loaded… Source: <clone path>" (dispatch.cjs:223) and the clone contains the full instructions. Task-only Luna could read them if it went looking. The runner counts tool calls that read files under the clone's `generated/`, `rules/` or `skills/`, and reports them per session.

**Probes (in `probes/`, counted in the budget as kind `probe`):**
- *Runtime isolation:* one session per config in a scratch repo, asked a trivial question. Pass when the native transcript's injected context contains no host session-data text and no other run's id or repo name, and the private `session-data` holds only this session's summary. Then a second session in the same full-config home must see only the first probe's summary.
- *Enforcement:* with an in-progress task present, ask Luna to write an undeclared second code file. Expected: stock writes it; task-only and full refuse it, the file is absent, and the transcript reason starts with `[Hook]`.
- *Host check:* the five host files and harness tree hash the same before and after (pattern tools/runner.cjs:43-51), and no file in host `~/.claude/session-data`, `~/.codex/sessions` or host `%TEMP%/claude-docs-gate` created or changed during the session mentions the run id or its private paths. A full hash of `~/.claude` is not used because the owner's own sessions change it.

**Review fixes (first plan review, 2026-10-12):** PR-1 runtime isolation probe; PR-2 refusal vs failure from transcript text; PR-3 per-session snapshot; PR-4 single ledger writer `budget.cjs` shared with reviewers; PR-5 retry ids in the protocol and `threadId` in result.json; PR-6 private TEMP; PR-7 leak counted; PR-8 always render; PR-9 host check rewritten; PR-10 probes have their own protocol and results; PR-11 session-2 check uses the snapshot. Second review: PR-16 session-2 retries reuse the run folder, session-1 retries use spare folders built at freeze; PR-17 review mode with its own ids, 4M allowance and the runner as single ledger writer; PR-19 limits stated.

## Invariants and recovery

| Concern | Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| Frozen manifest | prepare.cjs | runner, graders, analysis | JSON with SHA-256 of protocol, tools, clone commit, prompts, configs | yes; immutable once any session is attempted |
| Session journal | runner.cjs (pattern tools/runner.cjs:273-312) | runner recovery, analysis | JSON state: attempted → credential-linked → launching → running → terminal | yes; an attempted session id is never replayed |
| Repository snapshot | runner.cjs | session-2 pre-launch, task 03 grader, task 04 measures | HEAD, porcelain status, binary diff vs baseline, tree hash | yes |
| Budget ledger | budget.cjs | runner pre-launch, blind.cjs, task 05 | JSON entries {kind, id, tokens} | yes; duplicate ids refused |
| Private HOME, CODEX_HOME, TEMP | prepare.cjs | Codex and hooks for that run only | folders under the run folder | yes; reused only by session 2 of the same run |
| Credential alias | runner.cjs (pattern tools/runner.cjs:282-296) | Codex | hard link to host auth.json | removed after the process tree exits; never in evidence |

- **Source of truth:** frozen manifest plus native events; derived files never overwrite raw evidence.
- **Process boundary:** runner → Codex: repo path, prompt on stdin, env (CODEX_HOME, HOME, USERPROFILE, TEMP, TMP). Codex → clone dispatcher: hook input JSON; dispatcher → Codex: refusal JSON.
- **Failure after each transition:** before PID capture → check no Codex child, record `recovered_aborted`; after → kill tree, verify exit, remove alias, take the repository snapshot anyway, record terminal state. Session 2 of that run is then recorded as not run, with the reason.
- **Fresh deployment:** `selftest.cjs` → probes (`prepare.cjs probes` then `runner.cjs`) → task 05.
- **Backward compatibility:** Study 1 files and results unchanged; host check above passes for every probe and session.

hyperparameters n/a: this task builds tools; probe sessions use task 05's model settings, and pilot settings are frozen in task 05's table.

## Verification

- **Contract tests (`selftest.cjs`):** refuses an attempted session id; refuses a review id not in the frozen packet manifest; checks the review allowance separately from the session allowance; records each usage exactly once; refuses session 2 before session 1 is terminal or when the tree hash differs from session 1's snapshot; refuses a retry id when the original has a `threadId`; refuses launch over the ledger allowance; `budget.cjs` refuses a duplicate id; refuses a changed frozen input; the snapshot diff of a fixture repo with a modified, a deleted and an untracked file reproduces all three when applied to the baseline; transcript classification returns refusal, failure and unclassified for three fixture reasons; the auth alias never appears in evidence.
- **Probes:** runtime isolation 3 of 3, enforcement as expected for 3 of 3, host check passes for every probe.
- **Before/after:** baseline above; target 3 of 3.

## Receipts

| field | value |
|---|---|
| closing commit | no git repository in the study folder; SHA-256 manifest `follow-up/study-002/tools/manifest.sha256` (itself c2f1324200fbb44e…): budget.cjs 9c620882…, classify.cjs deee6de1…, environment.cjs 6f7bc3dc…, host.cjs 6300eec7…, lib.cjs 9771417e…, prepare.cjs c055f73a…, review.cjs 69a1b6ea…, runner.cjs 783e600b…, selftest.cjs 311ac7e3…, snapshot.cjs 48e70a98…, profiles/task-only/AGENTS.md 44e3a9f9…, policy.json ee126845…. Harness side: 9640d8f (Stop cap), 4650a11 (task 11 closed) |
| files changed | new: tools/{budget,classify,environment,host,lib,prepare,review,runner,selftest,snapshot}.cjs, tools/manifest.sha256, profiles/task-only/{AGENTS.md,policy.json}, probes/** (protocol, fixture, evidence), README.md sections "Setup probes" and "Blind reviews" |
| test | node --test tools/selftest.cjs -> 12/12 pass (red-first for the 4 review tests: module missing) |
| before / after | configurations proven isolated and enforcing: 0 of 3 -> 3 of 3 isolated (no host or cross-run session data reached any probe); enforcement as expected in stock (wrote both files) and full (task gate refused, Codex obeyed); task-only declined by instruction before any gate fired, and the forced-attempt probe exposed the unbounded Stop loop, now capped (251 refusals/12.1M tokens -> 3 refusals/149k) |
| result | runner ready for the pilot; review mode built and live-checked |

Notes / caveats / follow-ups:

- Enforcement starts at the second code file by design (the task gate allows one code file without a task). Single-file changes are not policed in any setup.
- Task-only's refusal in the probe came from its instructions, not a gate; the forced-attempt probe showed its gates do fire when the model tries.
- After this receipt, task 04's diff review led to fixes in tools/review.cjs (review retry and recover-review), runner.cjs (CLI), lib.cjs (a transcript line cut short is skipped) and selftest.cjs (15 tests). tools/manifest.sha256 was regenerated (1904bb725876d7f5…): lib a1803072…, review 55cb5b50…, runner 6a9846c3…, selftest 6228a277…. Recorded in task 04's receipts.
- The pilot's frozen manifest (prepare.cjs) re-hashes every tools/*.cjs; any tool change after preparation stops the runner.
