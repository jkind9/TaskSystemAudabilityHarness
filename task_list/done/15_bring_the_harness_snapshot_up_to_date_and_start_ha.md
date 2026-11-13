---
id: "15"
title: Bring the harness snapshot up to date and start harness changes in this repository
status: done
session: 8afa83f2-bfa8-4ead-80a9-ebb8c01200d9
files:
  - harness/tools/render.cjs
  - harness/core/machine.md
  - docs/maintenance.md
  - FINDINGS.md
  - harness-history.bundle
created: 2026-11-13
---
# Bring the harness snapshot up to date and start harness changes in this repository

## Goal

harness/ matches the live harness with task 28, harness changes start here and deploy to the live harness, all pushed

## Plan

1. Commit task 28 in the live harness. 2. Refresh harness/ and the bundle; FINDINGS entry; commit. 3. Here first: render.cjs header and core/machine.md say where changes start; docs/maintenance.md gets the deploy steps; commit. 4. Deploy to the live harness, check the trees match, render. 5. Refresh the bundle, commit, push.

## Files

- FINDINGS.md (+1 -1, 759 lines)
- harness-history.bundle (+0 -0, 0 lines)

## Checked

- `deploy steps from docs/maintenance.md -> live commit 81617ff, tree check printed deployed; env -u ECC_TASK_FLOW node --test (all harness tests) in the live harness -> 220 pass, 0 fail; same run in harness/ here -> 218 pass, 2 fail (test_install_version.js clones need the live history, documented); ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md -> new header and 'Changing the harness' section, 4,923 bytes`
- cost: 4 min from begin to finish; Claude tokens 2,665,026 (fresh input 23,201, cache read 2,627,130, output 14,695; 1 session)
- new duplicate blocks: 0
- complexity share (functions over 10): n/a (no functions) (was n/a (no functions))
- dead code on added lines: 0
- prose patterns: 0 in 236 words

## Left over

1. Harness not tagged: harness/ is v2.1 plus tasks 26-28 and this change; tagging v2.2 is the owner's call. 2. Open WACV sessions read their instructions at start, so they keep the old 'Edit the source at' header until they restart.
