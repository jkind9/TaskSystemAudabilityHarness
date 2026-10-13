# What does the harness buy, and at what cost?

Assessment date: 12 October 2026. This document reviews the completed Luna study and proposes the next comparison. It contains no new benchmark results. The completed study's protocol, graders and raw evidence remain unchanged. See the [completed study](../README.md) for its measurements.

## What the first study can tell us

The installed bundle added substantial token usage and elapsed time on three small, fully specified coding problems. It changed some task-record and test-order behavior. It did not improve measured functional correctness: all 18 sessions passed. That is evidence of overhead on these problems, not evidence that the harness never helps.

Full versus control had a median matched increase of 185.4% in total tokens, 150.8% in fresh input tokens and 52.1% in elapsed time across six pairs. Total tokens include cached input. These percentages are not a monetary cost estimate. Setup, external review and unavailable automatic approval model usage were excluded. Maintenance effort, human review time, later defects and recovery after interruption were not measured.

| Question | What actually happened | Consequence |
|---|---|---|
| Were the problems hard enough? | Every run passed and finished in under three minutes. Even the ledger was a small local implementation with a supplied storage contract. | The tasks left no observed correctness failures for the harness to prevent. Assigned difficulty did not establish difficulty for Luna. |
| Did both sides get the same request? | The same task prompt was used for each configuration. All measured sessions used Luna/high, with three configurations rather than two different models. | The configuration was the intervention. The control retained native runtime instructions and built-in skills. |
| Did we force task use? | The common prompt said, "Keep task records honest if you use them." Harness instructions prescribed the workflow. Only the easy baseline had a local board; medium and hard did not. | We measured whether installed guidance induced task use, incompletely. We did not consistently exercise a required task lifecycle. |
| Was the prompt raw? | It specified functions, files, schemas, validation and error behavior. It also requested tests, README updates and verification. | Much of the requirements discovery and good working practice was already supplied to every condition. It was not a short real-world issue request. |
| Did we test planning? | No separate planning phase or plan assessment was required. The model could plan internally. No large repository, dependency chain or real session restart was tested. | We cannot assess the value of task decomposition, plan review, handoff or recovery. |
| Did we test the whole workflow? | Delegation and commits were forbidden equally. The installed hook profile was minimal. | Specialist review, scoped commits and several other claimed benefits were outside the study. |
| Did we compare a small task-only harness? | No. The conditions were control, instructions/catalog, and instructions/catalog plus installed hooks and memory. | We cannot yet choose empirically between task-only and full. |

The prompt text is preserved in [protocol.json](../protocol.json). Hook evidence also needs caution: nine events were recorded as blocked while the sessions still edited files. The audit did not distinguish hook execution failure from refusal or retain enough input to prove the scope seen by the gate. Native enforcement remains unproven. Full runs also received unrelated or previous-trial session summaries, so they were not independent, clean hook-only comparisons.

## Benefits to test separately

Task records can provide a durable account of scope, decisions, tests and unfinished work. Guards can prevent an undeclared edit or unsupported closure. Planning and fresh review can catch a wrong owner, missing consumer, migration failure or incomplete recovery path before those become expensive. Session handoff can reduce repeated discovery after a restart. These are mechanisms and hypotheses, not benefits established by the first study.

Record creation alone is not a quality improvement. A plan is useful if it prevents a defect or reduces work. A hook is useful if it prevents a real mistake with acceptable interruption cost. A large catalog is useful if relevant guidance is found and improves the result. Counting documents, hook invocations or planning words cannot establish those outcomes.

## Public datasets worth using

Use published tasks and independent execution checks, while retaining a small local suite for task tracking and session recovery. These benchmarks provide standard tasks; none establishes that our particular task gates and handoff integration work.

| Dataset | What it adds | Proposed role and limits |
|---|---|---|
| [FeatureBench](https://github.com/LiberCoders/FeatureBench) | Feature-level development in existing repositories. The current README documents dataset V1.1 and a 100-instance fast split that needs no GPU. | First candidate for larger feature changes. Audit selected tasks and freeze the data version. The published fast verification timing is from a large server, not an estimate for this Windows machine. |
| [SWE-EVO](https://github.com/SWE-EVO/SWE-EVO) | High-level requirements and sustained changes to real Python projects, including Django and NumPy. Its stated focus includes multi-step planning and software evolution. | Candidate for planning, dependency management and regression preservation. Its documented integrations use OpenHands and SWE-agent, so a native Codex adapter needs validation. |
| [SWE-bench Pro V2](https://github.com/scaleapi/SWE-bench_Pro-os/tree/main/v2) | The current validated public release describes 642 tasks across 11 repositories, with public container images and a HARD-51 subset. | Candidate for repository issue work. Start with an audited subset, not the hardest subset alone. Freeze V2 explicitly; do not mix original and repaired tasks or scores. |
| [Terminal-Bench 4.0](https://www.tbench.ai/news/terminal-bench-4-0) | Multi-step terminal work, environment repair and tasks beyond writing a small function. The release adjusts resources, repairs tasks and removes saturated tasks. | Optional operational stress test. Its published agent timeout is eight hours, so it is unsuitable for an unrestricted first sweep. Shortening that limit creates a custom protocol that must be reported. |
| [SWE-Lancer](https://github.com/openai/frontier-evals/tree/main/project/swelancer) | Real freelance engineering work; the current public implementation documents 198 offline tasks and end-to-end evaluation. | Optional later full-stack check. The documented images are large and valid offline execution requires Linux. Do not assume it will run directly in the current Windows setup. |

SWE-bench Verified is a familiar 500-problem starting point, but it should not be our decisive test. OpenAI reported test-design and training-contamination problems in its [February 2026 audit](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/). Its [July 2026 audit](https://openai.com/index/separating-signal-from-noise-coding-evaluations/) also found substantial problems in the original 731-task Pro split and withdrew its earlier recommendation. The current Pro V2 maintainers describe repairs; that does not independently prove every repaired task is sound. Check starter failure, reference success and requirement-to-test agreement before freezing our subset.

Public task exposure is a remaining risk even with the same model in every configuration. Memorized fixes can hide a benefit from planning. Include newly authored local changes or unused real project tasks, with independently checked requirements, alongside public tasks. Do not select final tasks because a preferred configuration wins on them.

## The next comparison

The primary comparison should have three configurations, all on the same native runtime with Luna/high:

| Configuration | Included | Question answered |
|---|---|---|
| Stock runtime | Built-in instructions, tools and permissions; no shared custom harness | How well does the existing product work alone? |
| Task system only | Short task guidance, task CLI and templates, declared-file and completion checks, required adapter and snapshot support; project-local task recovery | Does durable tracking and enforcement pay for itself? |
| Full shared harness | A frozen version of the current shared instructions, catalog and enabled workflows | Does the remaining bundle add value beyond task tracking? |

Keep permissions, executable, model settings, tool availability and run budgets comparable. Keep all model delegates and reviewers on Luna. Unlike the first study, allow the workflow's planning and review mechanisms under the same available capabilities and limits in each configuration. Count every model call they trigger. Report an additional single-agent comparison only if it answers a separate question; do not silently suppress a claimed benefit in the main workflow comparison.

Use two separate kinds of evaluation:

1. **Normal work:** Give every configuration the same issue or feature request and repository baseline. Do not instruct the stock model to follow the custom task system. Let each configuration determine its workflow. Measure whether task guidance is adopted as well as whether the completed change is correct.
2. **Direct mechanism checks:** Explicitly create the same task state in both task-enabled configurations. Challenge an undeclared edit through both native patch and shell-write routes, a valid edit, an invalid checkpoint and incomplete closure. End and start a real session. Check the actual file bytes, CLI state and final tool disposition. This establishes whether the mechanism works; it does not by itself establish a net productivity benefit.

For planning, include a change that crosses producers and consumers, requires backward compatibility, and needs several dependent steps. Add a controlled second request or real session interruption at a declared boundary. On resumption, provide the same continuation request and repository state policy; each configuration may recover from its own durable artifacts. Measure repeated discovery, lost decisions, missing consumer changes, regression failures and eventual completion. Assess any recorded plan against actual owners, dependencies and recovery paths. A separate planning-only comparison can require a plan from every configuration if we need to isolate the effect of plan review.

Use a small development pilot to validate infrastructure and discover a useful difficulty range for Luna. Select an untouched evaluation set before comparing treatments. Retain both routine work, where overhead matters, and harder work, where a quality benefit has room to appear. Choose the final number of independent tasks and repetitions from pilot variation, the smallest benefit worth paying for and a stated spending limit. Another small set of perfect scores would still leave the main question unanswered.

Before running, freeze task IDs, repository commits, dataset versions, prompts, graders, configurations, order, budgets, interruption rules and failure handling. Isolate session storage and use distinct project identities. Verify actual isolation rather than relying on CODEX_HOME alone. Separate infrastructure failure from model failure, retain all attempts, and publish any retry rule before execution. Never expose reference fixes or hidden graders to the worker. Reapply submitted changes to a clean baseline for final grading.

## What to measure

| Outcome | Measurement |
|---|---|
| Accepted work | Entire requested change passes independent behavior and regression checks, within the declared budget. Keep policy compliance separate from functional quality. |
| Reliability | First-attempt success and success after a fixed permitted repair budget. Retain partial credit for diagnosis, but do not replace whole-task success with assertion counts. |
| Review burden | Condition-blind review time, reproducible defects and required human corrections. Calibrate a Luna review rubric against human judgments. |
| Planning and recovery | Missed dependencies, unsupported plan claims, repeated discovery and correct continuation after a real restart. |
| Guard quality | Expected denials, valid operations incorrectly denied, forbidden writes that still occurred, and time spent recovering from a block. Retain hook input, execution errors and native tool outcome. |
| Cost | Fresh input, cached input, output, all delegate/review usage, elapsed time, human minutes and setup/maintenance effort. Report unknown usage explicitly. Use actual billing or verified rates for money. |
| Value for money | Total cohort cost divided by accepted tasks, including failed attempts. Report quality and cost together; a cheap failed attempt is not a saving. |

Compare matched tasks, report uncertainty across independent tasks and account for repeated attempts on the same task. Do not treat hundreds of nested test assertions as independent evidence. If the confidence range still includes a meaningful loss and a meaningful gain, report the decision as unresolved. Set the acceptable quality loss and required savings before the final comparison; those are owner priorities, not numbers a benchmark can decide for us.

## Can we keep only the task system?

Yes, the source audit supports that architecture. This has not yet been implemented or acceptance-tested as a lean profile.

| Piece | Minimum or optional dependency | Read-only source evidence |
|---|---|---|
| Task CLI | task.js, file-size.js, guards.js, checkpoint.js and three templates; Node and Git for repository operations | C:/Users/jkind/.agents/harness/task-system/task.js:29, :30, :357, :391, :487 |
| Declared-file and file-size checks | task-gate.js; file-size-gate.js and file-size.js. Current policy covers Edit/Write routes, not shell writes. | C:/Users/jkind/.agents/harness/scripts/hooks/task-gate.js:41; policy.json:339 |
| Completion checks | task-complete-gate.js plus docs-snapshot.js for reliable accounting of docs/tests already dirty at session start | C:/Users/jkind/.agents/harness/scripts/hooks/task-complete-gate.js:259; docs-snapshot.js:23 |
| Native Codex patch adapter | Current dispatcher and patch parser, or a smaller equivalent with proven denial behavior | C:/Users/jkind/.agents/harness/tools/dispatch.cjs:10, :179; tools/patch.cjs:13 |
| Reminders and token attribution | Optional. usage.js currently reads Claude transcripts; it is not needed for task state. | C:/Users/jkind/.agents/harness/task-system/usage.js:2 |
| Shared session memory | Not required for task files or their journal. Removing it also removes the current generated prior-session summaries. | C:/Users/jkind/.agents/harness/scripts/hooks/session-start.js:180; task-system/task.js:75, :157 |

The CLI searches ancestor directories for a board, while the gate scopes to the Git root. A lean version needs one explicit project boundary. It should recover from the correct project's task record and journal. The current summary loader tries the exact worktree, then a project-name match, then the most recent readable summary globally. The last two choices can inject another project's context. Evidence: C:/Users/jkind/.agents/harness/scripts/hooks/session-start.js:180-204.

There is also a source-level route gap: the adapter maps shell/exec calls to Bash, while the task and size gates are registered for Edit/Write. Their declared-file checks do not cover shell writes through this dispatch path. The lean design needs to address that gap or state the narrower guarantee explicitly. This source finding is separate from the unproven native patch-denial behavior. Evidence: C:/Users/jkind/.agents/harness/tools/dispatch.cjs:11-22 and policy.json:339-357.

For high-risk work, retain the existing task workflow's plan and diff review contract as on-demand guidance, along with its plan-lint script and required dependencies. Count those Luna reviews in task-only cost. The minimum CLI dependencies above do not describe that entire policy. A CLI-only variant would be a different treatment and must be named separately.

The existing dispatcher invokes the renderer on session start or a submitted prompt. The renderer reconstructs broad instructions, agent outputs, command-derived skills and hook configuration. Editing or deleting generated files alone is therefore not a durable simplification. A task-only profile needs a small canonical rendering/configuration path. Evidence: C:/Users/jkind/.agents/harness/tools/dispatch.cjs:177 and tools/render.cjs:32-68.

Candidates to omit from a task-only profile are the always-loaded broad rules/catalog, generic reminders, continuous-learning observation and shared summary injection. Keep useful specialist guidance available on demand if it earns its place. Native runtime permissions remain in every configuration.

## Decision and stopping rules

The current evidence does not justify paying the full bundle's overhead by default on small, specified work. It also does not establish that task tracking improves net outcomes, or that the bundle should be removed from every kind of work.

The preferred next candidate is a small task-only profile. Test it against both stock and full before changing the global installation. Keep full only where it reduces defects, human effort or recovery failures enough to cover its extra cost. Prefer task-only if it preserves acceptable quality and recovery while saving cost. Prefer stock if task tracking adds no useful outcome and its maintenance and interruption costs outweigh the records it provides. If a component helps only a subset of work, load it for that subset rather than for every session.

No global harness settings were changed for this assessment. No new model benchmark cohort was launched. The next empirical question is whether the task-only profile beats stock on real, multi-step work, and whether anything in the full bundle beats task-only.
