---
id: "10"
title: Make Codex honour harness refusals and record Codex test results
status: closed
priority: MED
type: bug
blocked_by: []
blocks: []
verification_test: tools/validate.cjs
plan_reviewed: null
files:
  - tools/dispatch.cjs
  - tools/validate.cjs
  - scripts/lib/session-handoff.js
  - task-system/tests/test_session_handoff.js
docs:
  - README.md
baseline_metric:
  source: "isolated Codex 0.162.0-alpha.17.2 probes, 2026-10-12, plus hook-runs.jsonl vs session transcripts"
  field: "harness refusals that Codex actually enforced"
  baseline_value: "0 of 10 traced real refusals; 0 of 3 exit-2 patch probes; 0 of 1 exit-2 Stop probe"
  target: "dispatcher emits the JSON form Codex enforced in 1 of 1 patch probe and 1 of 1 Stop probe"
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 10 — Make Codex honour harness refusals and record Codex test results

## In plain English

When the harness refuses an action in Codex, such as editing a file no task covers or ending a session with an unfinished record, Codex currently ignores the refusal and carries on. Codex only obeys a refusal written in a particular structured form, so the harness will send that form to Codex. Separately, the end-of-session summary never records which test Codex last ran or whether it passed; two small matching mistakes cause that, and both will be corrected.

## What

1. `tools/dispatch.cjs`: when the provider is Codex and a PreToolUse hook refuses (or fails), print `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":<the hook's stderr text>}}` on stdout and exit 0. For a Codex Stop refusal, print `{"decision":"block","reason":<stderr text>}` and exit 0. The reason is never empty. Claude keeps exit 2, which Claude enforces. The same applies to the top-level error path.
2. `scripts/lib/session-handoff.js`: `CHECK_COMMAND` also matches `*.test.js`/`*.spec.ts`-style files, `x_test.py`, and `go|cargo|dotnet test`; `transcriptSummary` pairs calls by `call_id` before `id`; the Codex `exec` parser accepts a quoted `"cmd"` key.
3. Added after the live Claude Haiku probe (owner asked for both runtimes to be checked): Claude Code writes no exit code for a clean Bash/PowerShell run, so the summary never showed a passing exit. Exit 0 is now read only from Claude's own result shape (`is_error: false`, `interrupted: false`, has `stdout`, no `backgroundTaskId`). Claude's Windows `PowerShell` tool was invisible to both the summary and the dispatcher's shell-write policy (`inputsFor` mapped only Codex shell names to Bash); both now include it.

## Why

Probes with an isolated CODEX_HOME and only one hook installed showed Codex ignores exit-2 refusals: an `apply_patch` refused by the real harness dispatcher was applied, both from a code-mode `exec` script (gpt-6-luna) and as a direct call (gpt-5.5). The model was told it succeeded. The same probe with stdout `permissionDecision: "deny"` was enforced, and the model quoted the reason. For Stop, exit 2 let the session end; `{"decision":"block"}` made Codex continue with the reason injected as a hook prompt. In real sessions, 10 of 10 traceable task-gate refusals (Oct 9 fixture, Oct 12 Luna study) were ignored. So the Luna study's "full" condition never had working gates.

The summary bug: real Codex transcripts from Oct 9 give `lastCheck: null` for `node test/clamp.test.js` (pattern miss), and once matched, exit code stays null because Codex records carry both `id` (`ctc_...`) and `call_id`, and outputs pair by `call_id` only.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Dispatcher returns exit 2 with no stdout on any refusal | tools/dispatch.cjs | Codex and Claude native hook adapters | tools/dispatch.cjs:191-193 |
| Dispatcher already passes a hook's own JSON deny through | tools/dispatch.cjs | same | tools/dispatch.cjs:200-202 |
| Top-level error path exits 2 | tools/dispatch.cjs | same | tools/dispatch.cjs:223-226 |
| Validator asserts Codex refusals exit 2 (masked the bug) | tools/validate.cjs | `node tools/validate.cjs` | tools/validate.cjs:17-24, :71, :113 |
| Check-command pattern | scripts/lib/session-handoff.js | session-end.js summary | scripts/lib/session-handoff.js:8 |
| Call pairing key | scripts/lib/session-handoff.js | same | scripts/lib/session-handoff.js:143 |
| Codex exec command extraction | scripts/lib/session-handoff.js | same | scripts/lib/session-handoff.js:85 |
| Test fixtures use only `call_id` and `node --test` | task-system/tests/test_session_handoff.js | node --test | task-system/tests/test_session_handoff.js:75, :86, :200 |

Steps: change the dispatcher return path for Codex only; update `sameDecision` to compare decisions per runtime (Claude: exit 2 + `[Hook]` stderr; Codex: exit 0 + deny/block JSON whose reason carries the same `[Hook]` lines); add tests with real-shaped Codex records (both `id` and `call_id`, a `*.test.js` command). Re-run the isolated probe through the real dispatcher afterwards.

hyperparameters n/a: not an experiment.

## Invariants and recovery

invariants n/a: stateless per-invocation output format change; no persisted state. Backward compatibility: Claude output unchanged (exit 2); a Codex hook that already printed its own JSON deny keeps passing through (dispatch.cjs:200).

## Verification

- `node tools/validate.cjs`: every refusal check asserts Codex stdout parses to `permissionDecision: "deny"` (PreToolUse) or `decision: "block"` (Stop) with a non-empty reason equal to Claude's `[Hook]` lines, and Codex exit status 0; Claude still exit 2. Red-first: run against the unchanged dispatcher and see these fail.
- `node --test task-system/tests/test_session_handoff.js`: new test with a Codex record carrying both `id` and `call_id`, command `node test/clamp.test.js`, output `{"exit_code":0}` → `Command: node test/clamp.test.js`, `Exit code: 0`. Red-first against the unchanged module.
- Before/after on the real symptom: isolated Codex probe through the real dispatcher, `notes.md` patch. Before: file created. Target: file not created, model quotes the documentation-policy reason. Re-run transcriptSummary on the two Oct 9 fixture sessions: before `null`, target `node test/clamp.test.js` / `0`.

## Receipts

| field | value |
|---|---|
| closing commit | df5c70d (owner approved commit 2026-10-12) |
| files changed | tools/dispatch.cjs, tools/validate.cjs, scripts/lib/session-handoff.js, task-system/tests/test_session_handoff.js, README.md (127 insertions, 26 deletions) |
| test | red-first: validate.cjs failed (Codex refusal exit 2, expected JSON deny); 2 then 2 more new handoff tests failed before their fixes. After: `node --test task-system/tests/*.js` 140/140 pass; `node tools/validate.cjs` pass, 19 checks |
| before / after | Codex refusals enforced: 0 of 10 traced real refusals and 0 of 3 exit-2 probes before; after, live Luna probes refused a code-mode patch (notes.md) and a shell write (notes2.md), files absent, model quoted the reason. Claude Haiku live: Write and shell-write refused, files absent. Summary last check: before `null` on both Oct 9 Codex fixture sessions and `none recorded` exit on Claude; after both runtimes record `node test/sum.test.js`, exit 0 |
| result | Codex enforcement and both runtimes' test recording now work in live sessions |

Notes / caveats / follow-ups:

- Probe method: throwaway CODEX_HOME with byte-identical copies of the installed PreToolUse and Stop adapters, trusted with the hash Codex's own app-server `hooks/list` reports; no trust bypass. Claude probes used the real installed settings with Haiku. Scripts were in the session scratchpad (`probe/run-live.cjs`).
- Stop: `{"decision":"block"}` was shown to make Codex continue with the reason injected (isolated probe); the live harness Stop path for Codex was not separately exercised with a refusing completion gate.
- Claude's PowerShell write refusal is covered by validate.cjs; the live Haiku run happened to use Bash for the shell write.
- Earlier Codex study results (Luna study, Oct 12) ran with non-enforcing gates; its "full" condition did not measure a working harness.
