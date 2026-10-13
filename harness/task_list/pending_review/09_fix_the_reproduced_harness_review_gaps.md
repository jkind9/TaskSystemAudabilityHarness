---
id: "09"
title: Fix the reproduced harness review gaps
status: pending_review
priority: HIGH
type: bug
blocked_by: []
blocks: []
verification_test: task-system/tests/test_review_regressions.js
plan_reviewed: 2026-10-09 PASS
files:
  - task-system/task.js
  - task-system/usage.js
  - task-system/checkpoint.js
  - scripts/lib/session-handoff.js
  - scripts/hooks/session-end.js
  - task-system/tests/**
  - tools/install.cjs
  - tools/propagation.cjs
  - tools/dispatch.cjs
docs:
  - README.md
baseline_metric:
  source: independent source review and isolated reproductions, 2026-10-09
  field: actionable defects in Tasks 02/03/04/07
  baseline_value: 7 reproduced defects
  target: 0 reproduced defects in the seven regression inputs
created: 2026-10-09
last_updated: 2026-10-09
superseded_by: null
---

# Task09 - Fix the reproduced harness review gaps

## Current state

- Implementation and independent reviews complete. Full 135 tests, 33 invariant probes and 18 local adapter checks pass.
- Fresh native Codex model and hooks verified. Claude live probe blocked by weekly quota; temporary source edits restored byte-for-byte.
- Next action: owner-authorized source checkpoint, then fresh Claude verification and starting-context measurement after quota availability. Do not close against uncommitted source.
- Open decisions: additional directories, duplicated Claude command skills and complete Codex usage accounting remain explicit follow-up work in Tasks 02/07.
## In plain English

Review found seven cases where the harness behaves differently from its rules even though its tests pass. Add tests for these cases and fix the commands, installation and counting logic. Existing work and settings must survive the changes.

## What

Also reject uncheckpointed staged code/docs when the working copy has been restored to the recorded checkpoint. This independent Task05 code-review finding is fixed under this active task; root owns checkpoint.js and test_close_checkpoint.js during Task09.


Also fix the handoff parser to read actual Codex response_item payload custom_tool_call(name=exec,input=JavaScript) and custom_tool_call_output(call_id,output), and migrate the old owned [Session context goes here] placeholder so SessionStart does not reject a useful summary. Fix new HIGH worktree review bypass and force-start journal omission; upgrade migration of obsolete Claude instructions; missing fresh-install plain-language output style; provider-specific propagation hashes; usage from unrelated projects; quoted text false positives and combined-stream redirect false negatives in the documentation hook.

## Why

The seven independent review findings prove the existing 89-test suite does not fully pin the intended workflow. The HIGH review bypass can silently start code without a reviewed plan. The other findings undermine duplication, verification or cost claims.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| New worktree returns before review check | cmdNew | makeWorktree | task-system/task.js:399 |
| Provider hook output contains its own instruction hash | dispatch | propagation probe | tools/dispatch.cjs:158; tools/propagation.cjs:42 |
| Installer preserves replaced bindings and has undo operations | preserve | install and rollback | tools/install.cjs:21; tools/install.cjs:79 |
| Claude renderer assumes native style selection | instructionTexts | install settings | tools/render.cjs:26; tools/install.cjs:55 |
| Usage reads all project folders | transcriptFiles and report | CLI JSON and receipts | task-system/usage.js:100 |
| Documentation rule parses shell writes | documentWrites | builtin dispatch | tools/dispatch.cjs:59 |

- Add regression tests first in task-system/tests/test_review_regressions.js or existing declared suites. Run RED before source changes.
- Guard new before makeWorktree; allow explicit force and journal it. Keep task.js at or below its committed 961 lines.
- Before render, independently snapshot bytes of every live instruction target (old installation targets and obsolete ~/.claude/AGENTS.md), because hardlinks share inodes with generated files. Restore those bytes on rollback, not only renamed hardlinks. Migrate the obsolete binding through backup+undo, preserving original bytes in an independent backup. Add an injected later-install-failure fixture proving original instruction bytes and settings are restored. Select existing plain-language style for clean installs without overriding an owner's chosen outputStyle.
- Validate propagation against each provider's expected hash; compare shared behavioral portions only. Keep native probe behavior unchanged.
- Filter usage to the board's repository using transcript cwd or explicit project selection, including inherited parent directory for subagents. Unknown-origin sessions must be reported as unattributed rather than counted by time alone. Keep multiple sessions from the same repo distinct.
- Tokenize shell operators outside quotes; recognize &> and &>> plus current redirect/cp/mv/tee writes. Test quoted read-only phrases, literal filenames, real combined redirect writes. No silent command execution in parser.
- Update README with actual verification limits and concrete behavior. Run all targeted suites and renderer/validator; record native propagation separately from local parity.

## Invariants and recovery

| Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|
| Task priority and review | cmdNew and worktree creation | frontmatter PASS and optional explicit force | task persists, refusal leaves existing state unchanged |
| Installer preserve/undo | filesystem bindings and settings | backed-up original file and settings bytes, tools/install.cjs:21,43 | backup survives; normal failure reverses writes |
| Runtime renderer | propagation checks | provider-specific SHA256 strings | yes generated adapters |
| Transcript cwd/project identity | usage report | repository path and parent-session identity | read-only |
| Shell command text | documentation hook | tokens and quote/operator boundaries | stateless per request |

Source of truth: shared source files and repository-local task frontmatter. Git and hook subprocess boundaries carry argv and JSON/stdout/exit status. Installer failure must restore old binding and settings; backups remain available after process death. Fresh installation selects a real installed output style; upgrades preserve existing output-style preferences. Refused review checks cannot create a worktree or change active task. Usage never joins unrelated repository tokens by time alone. Existing Codex models remain native. No real commits this session; use disposable Git fixtures only.

## Hyperparameters

hyperparameters n/a: harness correctness, no model experiment.

## Verification

- Contract tests assert new HIGH --worktree with no PASS creates no worktree and does not activate; forced creation journals override; upgrade removes obsolete binding while backing up its bytes; fresh install selects style and preserves existing preference; hook output verifies against provider-specific expected hash; other-project 1000 tokens excluded from this project's 1-token fixture; quoted read commands return0 and &>/&>> forbidden document writes return2.
- Baseline seven reproduced defects; target zero on those exact inputs, with RED results before changes and GREEN results in receipts.
- Regression: original89 tests, handoff suite, checkpoint suite,33 invariant probes and18 local validation checks. Native fresh-session propagation is a separate measurement, never inferred from local parity.

## Receipts

| field | value |
|---|---|
| closing commit | 2cd9102d6931f1fa8568d722a069e3b293d92d67 |
| files changed | task-system/task.js; task-system/usage.js; task-system/checkpoint.js (root owner); tools/install.cjs; tools/propagation.cjs; tools/dispatch.cjs; scripts/lib/session-handoff.js; scripts/hooks/session-end.js; task-system/tests/test_review_regressions.js; task-system/tests/test_session_handoff.js; task-system/tests/test_usage.js; task-system/tests/test_instruction_load.js; task-system/tests/test_close_checkpoint.js (root owner); README.md |
| test | RED: combined review/handoff run 14 passed and 9 new failures. Actual Codex text-item envelope regression separately failed before parser change. GREEN: 50 targeted tests passed, exit 0; instruction-load plus review/handoff 30 passed, exit 0. Root owns staged-index checkpoint RED/GREEN evidence. |
| before / after | Seven initial review cases plus two handoff cases failed before changes; zero failures on the same fixtures after changes. Actual Codex array envelope and staged checkpoint regression added during review. |
| result | Source committed; full regression and finished reviews pass. Pending fresh Claude native propagation after weekly quota availability. Starting-context and accounting acceptance remain owned by Tasks02 and07. |
### Verification caveat

The first RED run incorrectly imported the original side-effecting propagation module before its main guard existed. That import began a probe and failed at the known provider-context equality assertion, before native model invocations. Its finally block restored rendered provider hashes exactly to their before values, and no probe token or recovery journal remained. The failed partial report was preserved at C:/Users/jkind/AppData/Local/Temp/ecc-task09-failed-propagation.json. The previous untracked native receipt was overwritten and is not recoverable from Git. This failed run is not native propagation evidence. Root will run fresh native propagation after stable source reviews. The corrected module now exports a require-safe validation helper; all subsequent regression runs execute only disposable installer fixtures and local helper checks.

Installer fixtures independently snapshot instruction bytes before simulated rendering through old hardlinks. They assert obsolete instruction removal, independent backup bytes, output-style default and preserved preference, and restoration of original live bytes/settings after an injected late metadata-write failure. Usage fixture excludes 1000 unrelated input tokens and 500 unattributed input tokens, while counting 1 parent plus 2 inherited subagent tokens. Shell fixtures cover quoted read-only text, literal greater-than filenames, ordinary/combined redirects and multiple tee destinations. The parser does not execute shell text or claim coverage of every shell grammar.
### Finished-review corrections

Final code and diff reviews found two more concrete inputs. Quoted Windows absolute README paths lost their backslashes and were falsely blocked. Worktree activation wrote no start event, so its task usage had no time window. Added RED fixtures (0/2 passed), then fixed quote escape rules and journal ownership. Both fixtures now pass; the worktree test checks both new and start activation, asserts no primary-board start event, and confirms 1 input token appears in its 1 recorded worktree window. JavaScript syntax checks for dispatch.cjs and task.js pass. All five affected behavior suites now pass 50/50, exit 0. Task CLI remains 958 lines, below the committed 961-line ceiling. A transient source-edit replacement corrupted dispatch.cjs while implementing the quoting fix; it was repaired before any renderer/native probe and the syntax checks and regression rerun above validate the repaired file.
### Literal copy/move directory targets

Final code review reproduced a copy into an existing directory that would write a forbidden loose document even though the shell hook checked only the directory operand. RED: the new literal-directory test failed on cp ../guide.md out/ (returned 0, expected 2). GREEN: the hook now resolves each source basename under an existing literal destination directory for cp, mv, Copy-Item and Move-Item. The fixture checks forbidden guide.md, allowed README.md/CLAUDE.md and multiple source operands for all four commands. node --check tools/dispatch.cjs passes; review and hook suites pass 21/21, exit 0. No general shell expansion or recursive-directory content inspection was added.

### Final verification, 2026-10-09

- Full regression command: node --test over every task-system/tests/test_*.js except the standalone test_harness_invariants.js. Result: 135 passed, 0 failed, exit 0.
- Standalone node task-system/tests/test_harness_invariants.js: 33 passed, 0 failed, exit 0.
- node tools/render.cjs and node tools/validate.cjs: renderer completed; 18 local behavioral/parity checks passed, exit 0. Final Codex instruction SHA256 22943f3910f0deb88976cc7f6f4370ad617757193f6791725299db503e03bf77; Claude bd37e7336d11dd1a82943a527c054fa9fc7b4788b4fc9e9598c00622df3e7e10.
- Fresh diff-reviewer PASS; required code-reviewer APPROVE with no remaining actionable findings after independently verifying literal-directory copy/move regressions 21/21. Earlier TypeScript/JavaScript review found staged-index closure defect; root added RED/GREEN case 19 and fixed it under this task.
- Native propagation: three checks passed (source reaches installed files, adapters use correct provider hashes, native Codex prompt loader sees temporary token). Fresh Claude model returned weekly-limit response, exit 1, before validation response; reset reported 11 October 20:00 Europe/London. No retry against the same quota.
- Independent fresh Codex model probe exited0 and returned C:/Users/jkind/.agents/harness. Session 01a11fde-0465-7d41-8589-b8b289cfc318 has successful SessionStart, UserPromptSubmit, Stop and SessionEnd hook receipts. state/propagation.json is explicitly partial, not a two-provider native success.
- Temporary instruction and policy probe edits restored byte-for-byte against independent pre-probe snapshots; no pending recovery journal. The earlier failed import receipt remains separately saved in the operating-system temp folder.
- task.js 957 lines, below its original 961. No real source commit, PR, merge or worktree cleanup performed.
- Coverage: whole-harness code coverage and fresh Claude main/helper starting-token targets remain unmeasured. This Codex session's complete parent/child token total is unavailable; usage.js reports Claude-only coverage rather than inventing a total.

Awaiting checkpoint and fresh Claude native verification after quota availability. Earlier Tasks 02–08 keep their own acceptance caveats; project Task 65 active state was never changed. This session changes no product source.

### Verified source hashes

These identify the uncommitted source checked in the final regression run.

| path | SHA-256 |
|---|---|
| task-system/task.js | 17f31493be2303d6387350493785d300f9613e61314ad17b4b8a7e2a1d8f38e9 |
| task-system/guards.js | 3a4cf1c6424c4a61b9bcb2d04a63fe96d9c3c903bdec139b4c6f0dd27c82a10a |
| task-system/checkpoint.js | aacba39d38ea57a9800493ddd776dc13e496e1677e7f479c6980de1221fbc41c |
| task-system/usage.js | 2023c3f303a575bfaef921d7debacda658a1fc754b78328bb37bf6d7dab2713a |
| tools/render.cjs | 8e62b6cb501caf0c68855122e306fdd5d48eed1e051fef188435c32079e7497b |
| tools/install.cjs | 9fdc34ed510ec22dd8a55946faf0da0cfc25fa069177510a61926425338db5e3 |
| tools/dispatch.cjs | cbd81e6dc646705bc45fb4ab1e3724361073c3fd41085b7958a5a32bd1b7a00b |
| tools/validate.cjs | debcee44233c95274877ac777c48aa3d585ccb78d4f271a795796b096a33c677 |
| tools/propagation.cjs | c40e473855e6e3e167d46754d7850e035edcd9a7f060535d20707b62019b0e7c |
| scripts/hooks/task-gate.js | bd66ebbe47be26e3552562b6ead619afe59d232280040c8cb78bd46ba76de65f |
| scripts/hooks/file-size-gate.js | 4865fd72c378b01b27bc999539798684ceb083bd091cc2ca3767d574a4464c8f |
| scripts/hooks/session-end.js | 7f3184b19021503cfe71e5f2423a62de91e05c543815675aebb9ce5cef7c85ff |
| scripts/lib/session-handoff.js | a874b922bd87e5acd70e6e8582e15fbe1f485458a583ae3dd2994901de6ea223 |
| agents/plan-reviewer.md | 3a6a3ef703388ba1691b55b3a037652fb3dc53f5be217ab3796592a7f7a7ba35 |
| agents/diff-reviewer.md | 4706cc6bc9849adac8d713593136e1aaf1b53bcc7f68f1c97efff324ec21ee33 |
| task-system/tests/test_close_checkpoint.js | c37a83bdd91fc2ddd93ba62ca877f1e875cc189c736e322bb89a8dad6e0c0e99 |
| task-system/tests/test_dry_run.js | 62ccfe25a1e172f8cbac1319d554636403672299d24afa40072489eaf1a37f55 |
| task-system/tests/test_harness_invariants.js | 3db2a20ecb8d83dfc01c800c23127686109befed600a65c473db4716079a7a39 |
| task-system/tests/test_hook_scope.js | 29e14f478e1c55c6e9848b3c974fbd69bff7c9d8b4acbb8c3be5bb749eac383a |
| task-system/tests/test_instruction_load.js | 2b3ad236d38b876a698c00a474dceea689cb50bd6ed4b48e390837fc3e6920e8 |
| task-system/tests/test_review_regressions.js | 043729c1e4c56a902fcc4fd8cdb2401994d1da458a3cdd4efe11a4e7f4e08e13 |
| task-system/tests/test_session_handoff.js | d6005fdba677a87999a0b7cce9cc133e1ce8c33b36d96751aa8c704c3208e9de |
| task-system/tests/test_size_gate_scope.js | 3df9bf86da11f0535f72af30fe5e88276821a84f0975a5fe4f176dfa2c28f3ff |
| task-system/tests/test_transition_guards.js | bfc7427e8dcbf1aa3f42bd9754acb28e48bb725ce13aca42dc3f26aa69834b4d |
| task-system/tests/test_usage.js | 491ee177bc3d8170945d4cce80eab06ebbc2ef58a473339d899daeba07973f9a |


### Authorized checkpoint, 2026-10-09

The owner requested commits. Source checkpoint: `2cd9102d6931f1fa8568d722a069e3b293d92d67`. All 25 recorded source hashes matched the final verified versions before staging. Security-reviewer PASS; staged secret-pattern scan found zero hits. No code changed after the 135-test, 33-invariant and 18-adapter checks. Windows CRLF line endings were accounted for in the whitespace check.

Current disposition: Source committed; full regression and finished reviews pass. Pending fresh Claude native propagation after weekly quota availability. Starting-context and accounting acceptance remain owned by Tasks02 and07. Earlier no-commit and awaiting-checkpoint notes describe historical states.
