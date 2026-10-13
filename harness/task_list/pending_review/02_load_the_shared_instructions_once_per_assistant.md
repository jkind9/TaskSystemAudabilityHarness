---
id: "02"
title: Load the shared instructions once per assistant
status: pending_review
priority: HIGH
type: infra
blocked_by: []
blocks: []
verification_test: task-system/tests/test_instruction_load.js
plan_reviewed: null
files:
  - tools/render.cjs
  - tools/install.cjs
  - installation.json
  - rules/web/**
  - task-system/tests/**
  - tools/validate.cjs
  - tools/propagation.cjs
  - tools/dispatch.cjs
  - generated/CLAUDE.md
docs:
  - README.md
baseline_metric:
  source: "Claude transcripts for mobile_depth_estimation_tracking, measured 2026-10-08"
  field: "median context tokens on the first assistant message of a session"
  baseline_value: "123939 tokens main session (n=12); 81479 tokens subagent (n=18)"
  target: "below 95000 main; below 55000 subagent"
created: 2026-10-08
last_updated: 2026-10-09
superseded_by: null
---

# Task 02 — Load the shared instructions once per assistant

## Current state

- Implementation exists; independent review completed on 2026-10-09.
- Awaiting source checkpoint, fresh native starting-context measurements, owner decision on 32 additional directories, and disposition of duplicated source-command skills exposed to Claude. These are acceptance gaps, not claimed complete.
- See Receipts and Task09 for regression findings and dispositions.

## In plain English

Every Claude session currently reads the same rule book about three times before it does any work, which fills about a fifth of its memory and costs tokens on every message. This task makes each assistant read one copy, and skips rules that do not apply to the project. Success is measured by how large a fresh session's starting context is.

## What

- Stop installing `~/.claude/AGENTS.md`. Codex reads `~/.codex/AGENTS.md`; Claude reads `~/.claude/CLAUDE.md`.
- Load the rules once in Claude. Recommended: keep the `~/.claude/rules` junction (Claude auto-loads it and the hook messages point there) and render a Claude variant without the inlined `# Shared rules` section. Codex keeps the full render.
- Add `paths:` frontmatter to `rules/web/*.md` so they load only for web files.
- Stop generating `source-command-*` skills for Claude, which already exposes the same 84 commands; keep them for Codex if it needs them.
- Owner decision, not code: prune the 32-entry `additionalDirectories` in `~/.claude/settings.json`, including `C:\Users\jkind\.claude` (line 293, the reason the duplicate is read) and a broken path containing a literal `$USERPROFILE`.

## Why

Measured 2026-10-08: about 192 KB of instruction text loads per Claude session; about 113 KB is an exact duplicate and 14 KB (web rules) is irrelevant to a Python project. Estimated at about 9% of all supplied tokens in that project's transcripts. Every subagent starts at about 80,000 tokens.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| One render text is written to all three instruction files | render | install, propagation | tools/render.cjs:53-56; installation.json:4-8 |
| Install creates the ~/.claude/AGENTS.md link | install | first-time setup | tools/install.cjs:50-51 |
| The render inlines every root rule | instructionText | render | tools/render.cjs:13; tools/render.cjs:18 |
| Command skills are generated from commands | render | skill loaders | tools/render.cjs:35-42 |
| Claude reads the duplicate because ~/.claude is an extra working directory | settings | Claude runtime | C:/Users/jkind/.claude/settings.json:293 |
| Parity is checked by hash of the render | dispatch session-start message, validation | both runtimes | tools/dispatch.cjs:114; validation.json |

Steps: baseline measurement script (reuse the transcript scan in the audit's method); change render to emit a Claude and a Codex text; remove the AGENTS.md target from install and installation; add path filters; update parity checks to compare each runtime to its own expected render; re-measure.

## Hyperparameters

hyperparameters n/a: configuration change, no experiment.

## Invariants and recovery

| Concern | Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| Instruction text per runtime | tools/render.cjs:12 | Claude and Codex at session start | UTF-8 Markdown | yes, files on disk |
| Recorded revision hash | installation.json:9-13 | session-start message, tools/dispatch.cjs:114 | SHA-256 | yes |

- **Source of truth:** harness `instructions/`, `rules/` and `output-styles/`.
- **Failure mid-change:** render rewrites files only when content differs (tools/render.cjs:8-11); a partial run leaves old text, which still works.
- **Backward compatibility:** a Codex session must still see every rule; a Claude session must still see every root rule once. Check both with the existing live probe (`tools/live-probe.cjs`).

## Verification

- **Contract test:** `task-system/tests/test_instruction_load.js` asserts the Claude render contains no `# Shared rules` section, the Codex render contains every root rule heading, install targets do not include `~/.claude/AGENTS.md`, and every `rules/web/*.md` has a `paths:` line. Show it fails before the change.
- **Before/after:** median first-message context from new transcripts, main and subagent, against the baseline above.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | tools/render.cjs; tools/install.cjs; tools/validate.cjs; tools/propagation.cjs; tools/dispatch.cjs; rules/web/**; task-system/tests/test_instruction_load.js; generated adapters and README.md |
| test | Instruction-layout tests passed within the independent 89-test regression run. Upgrade, style and provider-hash defects found in fresh source review are corrected and verified under Task09. |
| before / after | Claude instruction render 14,229 bytes; Codex render 64,320 bytes on 2026-10-09. Starting-token targets have not been measured in fresh main/subagent sessions. |
| result | Source committed. Pending measured fresh main/helper starting context, owner decision on 32 additional directories and duplicated Claude source-command skills. |


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Source committed. Pending measured fresh main/helper starting context, owner decision on 32 additional directories and duplicated Claude source-command skills. Earlier no-commit and awaiting-checkpoint notes describe historical states.
