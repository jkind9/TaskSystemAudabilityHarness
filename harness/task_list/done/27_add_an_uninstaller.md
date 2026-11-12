---
id: "27"
title: Add an uninstaller
status: done
session: 39a01a8e-0e45-4356-bfa4-8b8782c8b3d1
files:
  - tools/uninstall.cjs
  - tools/install.cjs
  - task-system/tests/test_uninstall.js
  - README.md
created: 2026-11-12
---
# Add an uninstaller

## Goal

node tools/uninstall.cjs removes the install's links and puts back what the install replaced, deleting nothing

## Plan

1. install.cjs always leaves its backup folder. 2. uninstall.cjs: refuse without an install record; remove links; move harness-written files to <time>-uninstall; move back the first backup after the last uninstall; remove the record. 3. Tests: restore exact home; second run refuses; reinstall into an empty home then uninstall restores nothing. 4. README line.

## Files

- README.md (+7 -0, 420 lines)
- task-system/tests/test_uninstall.js (+65 -0, 65 lines)
- tools/install.cjs (+2 -0, 125 lines)
- tools/uninstall.cjs (+40 -0, 40 lines)

## Checked

- `env -u ECC_TASK_FLOW node --test task-system/tests/*.js -> 213 passed, 0 failed (2 new in test_uninstall.js); test 2 run against the old install.cjs -> fails, so the backup-folder line is needed; test_harness_invariants.js -> 33 passed; tools/validate.cjs -> pass, 23 checks; uninstall on a scratch install -> links removed, 239 skill folders still in the harness copy, second run exit 1`
- cost: 3 min from begin to finish; Claude tokens: none found (Codex sessions are not read)
- new duplicate blocks: 0
- complexity share (functions over 10): 0 (was 0)
- dead code on added lines: not checked (knip not installed)
- prose patterns: 0 in 178 words

## Left over

1. Not committed. 2. Homes installed into an empty home before this change have no backup folder for that first install; a reinstall's folder is then the first one, and uninstall would bring back the harness's own settings.json (kept, not deleted, in the -uninstall folder either way).
