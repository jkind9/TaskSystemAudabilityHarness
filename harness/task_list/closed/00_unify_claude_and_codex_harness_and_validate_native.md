---
id: 00
title: Unify Claude and Codex harness and validate native loading
status: closed
priority: MED
type: infra
files:
  - tools/**
  - scripts/hooks/task-gate.js
  - scripts/hooks/harness-propagation-*.js
  - skills/project-guidelines-example/SKILL.md
docs:
  - README.md
verification_test: tools/validate.cjs
created: 2026-10-01
last_updated: 2026-10-01
blocked_by: []
blocks: []
plan_reviewed: null
baseline_metric:
  baseline_value: 2 separate maintained harnesses
  target: 1 shared source
---

## In plain English

Claude and Codex used separate copies of the working rules, so changes could reach one assistant and miss the other. Both now read one maintained collection. Tests check that both enforce the same task rules and receive the same change. Both assistants run the shared hooks with approved native adapters.

## What

Create the shared source at ~/.agents/harness from the newer Claude assets; preserve Codex-only skills and native execution permission rules. Connect both user homes to the shared assets and generate native configuration adapters.

## Why

The old Codex AGENTS.md omitted Claude's task workflow. Several old custom hook matchers were expressions rather than runtime tool-name matchers. File edits in Codex arrive as patches rather than Claude Write/Edit payloads.

## How

### Reuse evidence

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Task scope gate already exists | scripts/hooks/task-gate.js | both dispatch adapters | scripts/hooks/task-gate.js:1 |
| File-size policy already exists | task-system/file-size.js | file-size gate and task CLI | task-system/file-size.js:1 |
| Profile switches already exist | scripts/lib/hook-flags.js | shared dispatcher and upstream runners | scripts/lib/hook-flags.js:1 |
| Claude instructions are the migration authority | instructions/CLAUDE.md | tools/render.cjs | instructions/CLAUDE.md:1 |

- [x] Import Claude assets and preserve Codex additions.
- [x] Review and fix patch parsing, shell normalization and installer rollback.
- [x] Install directory links and instruction files with backups.
- [x] Validate installed parity and behavioural gates.
- [x] Validate native Claude startup and native Codex discovery.
- [x] Change one shared instruction and hook; prove propagation; restore originals.
- [x] Explicit Codex trust approval, native Codex hook execution, final runtime recheck.

## Invariants and recovery

| Producer/owner | Consumer | Representation | Survives restart? |
|---|---|---|---|
| instructions and rules source | both global instruction files | identical UTF-8 content | yes |
| policy.json | both dispatch adapters | event, matcher, script arguments, profile | yes |
| project task frontmatter | shared task CLI and gates | Markdown plus YAML | yes |
| installation.json | renderer and validation | paths and installation receipt | yes |

Source of truth: the shared assets, not generated output. Directory junctions expose the same physical files. Native hooks execute the same dispatcher with a provider parameter. A failed install restores replaced paths and removes new bindings; backups remain under ~/.agents/harness-backups. A failed propagation test restores the original source and policy in finally. Existing authentication, permissions, project records and non-ECC plugins remain in place. Fresh sessions load the new harness; existing conversational context is not rewritten.

## Hyperparameters

hyperparameters n/a: harness migration, no experiment.

## Verification

Contract test: tools/validate.cjs asserts matching allow/block decisions for both adapters, correct patch reconstruction, rollback and installed source equality. tools/propagation.cjs asserts the changed instruction hash differs from baseline, both installed files equal that hash, both hook outputs match, Codex's native prompt includes the token, and native Claude and Codex report the exact same token and run the changed hook.

Before: two independent harness asset directories and a Codex instruction file without the current task workflow. Target: one maintained source; zero skill loading errors; all supported native adapters trusted and executed. Native Codex currently discovers seven supported adapters and 265 skills with zero loading errors; all seven adapters are trusted and native execution is verified.

## Receipts

| Field | Value |
|---|---|
| Closing commit | 556a1166cb9197cd6fc6dd19f2bac0fc1d6d2b07 |
| Files changed | tools, shared task gate patch bridge, imported skill metadata, README |
| Test status | 18 installed regression checks passed; propagation checks passed |
| Before measurement | 2 independently maintained sources |
| After measurement | 1 shared source, 0 native skill loading errors |
| Delta | remove duplicated maintenance |
| Decision-gate outcome | PASS: installed, reviewed, trusted and verified natively in both assistants |

Native propagation passed in both assistants. Original instruction hash restored. Windows native hook invocation corrected after live testing. Final diff review recorded separately before closure. Runtime limitation: Codex does not expose PostToolUseFailure; this observer remains disabled in the retained minimal profile. Standard/strict parity for that event is outside this verified profile.
