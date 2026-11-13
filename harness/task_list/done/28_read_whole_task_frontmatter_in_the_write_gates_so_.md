---
id: "28"
title: Read whole task frontmatter in the write gates so parallel sessions stop blocking each other
status: done
session: 8afa83f2-bfa8-4ead-80a9-ebb8c01200d9
files:
  - scripts/hooks/task-gate.js
  - scripts/hooks/file-size-gate.js
  - task-system/lean-board.js
  - task-system/tests/test_lean_owner.js
  - task-system/tests/test_size_gate_scope.js
created: 2026-11-13
---
# Read whole task frontmatter in the write gates so parallel sessions stop blocking each other

## Goal

A record over 2,000 characters keeps its owner and full file list in task-gate; file-size-gate counts only this session's task

## Plan

1. Add frontOf to lean-board.js: frontmatter to the closing --- or to the end; ownerOf uses it. 2. task-gate.js parses frontOf(record) instead of the first 2,000 characters. 3. file-size-gate.js keeps only tasks this session owns. 4. Tests: 40-file record across two sessions, unterminated frontmatter, shrinks escape with two sessions open. 5. Run the full suite and render.

## Files

- scripts/hooks/file-size-gate.js (+9 -6, 107 lines)
- scripts/hooks/task-gate.js (+7 -6, 169 lines)
- task-system/lean-board.js (+5 -5, 63 lines)
- task-system/tests/test_lean_owner.js (+32 -1, 204 lines)
- task-system/tests/test_size_gate_scope.js (+11 -2, 67 lines)

## Checked

- `env -u ECC_TASK_FLOW node --test task-system/tests/*.js scripts/hooks/tests/*.js -> 220 pass, 0 fail (4 new tests failed before the fix); task-gate.js on the live WACV board -> session 181 and 177 writes allowed, a session with no task blocked from 177's files 1 and 35 as another session's`
- cost: 4 min from begin to finish; Claude tokens: none found (Codex sessions are not read)
- new duplicate blocks: 0
- complexity share (functions over 10): 0.15 (was 0.14)
- dead code on added lines: not checked (knip not installed)
- prose patterns: 0 in 143 words

## Left over

1. Not committed. 2. task-complete-gate.js, plain-language-audit.js and task-nudge.js still cut records at 2,000 characters; core/policy.json does not run them, and they read only status and id. 3. test_harness_invariants.js 10a fails when the shell sets ECC_TASK_FLOW=lean, because the test does not clear it (fails the same way before this change). 4. Harness_Development's harness/ copy is not refreshed.
