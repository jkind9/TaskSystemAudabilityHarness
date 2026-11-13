---
id: "16"
title: Add a deploy script that moves committed harness changes from here to the PC copy
status: done
session: 8afa83f2-bfa8-4ead-80a9-ebb8c01200d9
files:
  - tools/deploy-harness.cjs
  - tools/deploy-harness-selftest.cjs
  - docs/maintenance.md
  - harness/core/machine.md
  - FINDINGS.md
  - harness-history.bundle
created: 2026-11-13
---
# Add a deploy script that moves committed harness changes from here to the PC copy

## Goal

node tools/deploy-harness.cjs is the only path from harness/ here to ~/.agents/harness: it tests in a clone first and refuses drift or uncommitted work

## Plan

1. Selftest first: deploy, failing test, --check, uncommitted work, drift, unknown argument. 2. Write tools/deploy-harness.cjs. 3. Run the full harness suite in a clone of the live copy to confirm it passes there. 4. Point maintenance.md and core/machine.md at the script; FINDINGS entry. 5. Deploy the machine.md change with the script itself; commit; push.

## Files

- FINDINGS.md (+1 -0, 760 lines)
- harness-history.bundle (+0 -0, 0 lines)

## Checked

- `node --test tools/deploy-harness-selftest.cjs -> 6 pass, 0 fail (6 failed before the script existed; 2 fail with the line-ending fix removed); node tools/deploy-harness.cjs --check -> 220 harness tests pass in a clone of the live copy, live untouched; node tools/deploy-harness.cjs -> live ee02109, trees f5f3db8 match, ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md name the script; rerun -> Nothing to deploy`
- cost: 5 min from begin to finish; Claude tokens 2,501,316 (fresh input 37,385, cache read 2,434,823, output 29,108; 1 session)
- new duplicate blocks: 0
- complexity share (functions over 10): n/a (no functions) (was n/a (no functions))
- dead code on added lines: 0
- prose patterns: 0 in 324 words

## Left over

1. Nothing blocks a direct edit of ~/.agents/harness: the deploy only refuses afterwards. A write gate on that folder would stop it at the time. 2. Harness not tagged (v2.1 plus tasks 26-28 and tasks 15-16 here); tagging v2.2 is the owner's call. 3. Open sessions keep their old instructions until they restart.
