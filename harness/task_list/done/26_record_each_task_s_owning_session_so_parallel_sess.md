---
id: "26"
title: Record each task's owning session so parallel sessions don't block each other
status: done
files:
  - task-system/lean-board.js
  - task-system/lean.js
  - task-system/task.js
  - scripts/hooks/task-gate.js
  - scripts/hooks/lean-stop-gate.js
  - scripts/hooks/lean-session-note.js
  - checks/run.cjs
  - task-system/tests/test_lean_owner.js
  - task-system/tests/test_lean_flow.js
  - task-system/tests/test_lean_hooks.js
  - task-system/tests/test_lean_nospawn.js
  - core/task-template.md
  - core/AGENTS.md
  - README.md
  - task-system/usage.js
created: 2026-11-10
---
# Record each task's owning session so parallel sessions don't block each other

## Goal

A task belongs to the session that began it; other sessions' open tasks no longer block begin, writes, stop or finish.

## Plan

1. begin stamps session: from CLAUDE_CODE_SESSION_ID or CODEX_SESSION_ID/CODEX_THREAD_ID; unstamped records match every session. 2. lean-board: openIn by owner, othersIn, shared globMatch and files parser. 3. begin/finish/files add act on own task; begin and files add warn on files another open task lists; ids claimed with mkdir. 4. adopt <id> moves an open task to this session. 5. task-gate, stop gate, session note and finish checks use the owner. 6. tests for two sessions on one board. 7. docs: AGENTS.md, README, render.

## Files

- README.md (+28 -6, 413 lines)
- checks/run.cjs (+4 -3, 99 lines)
- core/AGENTS.md (+8 -4, 53 lines)
- core/task-template.md (+1 -0, 30 lines)
- scripts/hooks/lean-session-note.js (+12 -8, 24 lines)
- scripts/hooks/lean-stop-gate.js (+4 -3, 17 lines)
- scripts/hooks/task-gate.js (+19 -20, 168 lines)
- task-system/lean-board.js (+31 -3, 63 lines)
- task-system/lean.js (+77 -18, 239 lines)
- task-system/task.js (+2 -2, 942 lines)
- task-system/tests/test_lean_flow.js (+3 -3, 209 lines)
- task-system/tests/test_lean_hooks.js (+1 -1, 83 lines)
- task-system/tests/test_lean_nospawn.js (+1 -1, 125 lines)
- task-system/tests/test_lean_owner.js (+173 -0, 173 lines)
- task-system/usage.js (+1 -1, 166 lines)

## Checked

- `env -u ECC_TASK_FLOW node --test task-system/tests/*.js -> 211 passed, 0 failed (13 new in test_lean_owner.js); node task-system/tests/test_harness_invariants.js -> 33 passed; node tools/validate.cjs -> pass, 23 checks; new globMatch vs the committed one on 16 paths -> 0 differ; two sessions through tools/dispatch.cjs in a scratch repo -> B's write to A's a.py refused, A's write refused after C adopted, A's stop refused and B's not`
- cost: 20 min from begin to finish; Claude tokens: none found (Codex sessions are not read)
- new duplicate blocks: 0
- complexity share (functions over 10): 0.49 (was 0.49)
- dead code on added lines: not checked (knip not installed)
- prose patterns: 0 in 692 words
- over 800 lines, not grown: task-system/task.js (942, was 942)

## Left over

1. Codex: confirm which shell variable Codex sets (CODEX_SESSION_ID or CODEX_THREAD_ID) and that it equals the hook session_id; until then a Codex record may carry an id its hooks do not send. 2. Not committed. 3. test_harness_invariants 10a fails whenever the shell has ECC_TASK_FLOW=lean (it expects the v1 message); this predates task 26. 4. Open records begun before this change have no session: and still block every session until their own session runs task.js adopt <id>.
