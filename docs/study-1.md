# Study 1: the full harness on three small tasks

Run in October 2026 on harness v1, the full setup before it was cut down to v2. This write-up was the top-level README until 12 November 2026.

The run data under `results/` and `private/` is not in the repository: it is large, and `private/` holds the blind-review keys. Paths into those folders are plain text below, not links.

We ran **18 coding sessions using GPT-6-luna with high reasoning**: three tasks, three harness conditions and two repetitions. Every session passed its independent contract grader and submitted test suite. The study found **no additional correctness benefit on these contracts**. Compared with control, the full harness had a median matched increase of **185.4% in total tokens**, **150.8% in fresh input tokens**, and **52.1% in elapsed time**.

These are observations from three selected tasks, not estimates of general harness effectiveness. All measured coding sessions and nine preparation/review subagents used Luna/high. The fixed model coordinating this chat is outside the measured sessions. Setup, external review and unavailable automatic approval model usage are excluded from the token totals.

## Results

| Condition | Successful runs | Contract categories passed | Median total tokens | Median fresh input | Median seconds |
|---|---:|---:|---:|---:|---:|
| Control | 6/6 | 150/150 | 189.5k | 24.9k | 98.3 |
| Instructions | 6/6 | 150/150 | 501.3k | 46.9k | 115.4 |
| Full | 6/6 | 150/150 | 542.0k | 46.6k | 146.7 |

The 450 category results are nested inside 18 runs on three tasks. They are not 450 independent observations. All attempts completed without timeout. Primary sessions consumed **7,401,411 total tokens**, including cached input. No monetary estimate is made.

The changes below match the same task and repetition. Each comparison has six pairs. Percentages use the first condition as denominator; the median is taken over individual percentage changes. Negative means less usage or time. Ranges are observed variation, not confidence intervals.

| Comparison | Measure | Median change | Observed range |
|---|---|---:|---:|
| Control to instructions | Total tokens | +192.3% | +46.8% to +263.1% |
| Control to instructions | Fresh input | +95.3% | +13.2% to +509.4% |
| Control to instructions | Seconds | +39.3% | -30.2% to +81.6% |
| Instructions to full | Total tokens | -2.1% | -16.9% to +35.0% |
| Instructions to full | Fresh input | +5.3% | -45.9% to +71.1% |
| Instructions to full | Seconds | +23.8% | -6.5% to +40.8% |
| Control to full | Total tokens | +185.4% | +88.1% to +230.4% |
| Control to full | Fresh input | +150.8% | +16.4% to +230.0% |
| Control to full | Seconds | +52.1% | -6.2% to +105.4% |

Instructions increased total tokens in every matched pair. Hooks had a mixed incremental token effect and increased elapsed time in five of six pairs. Elapsed time includes generation, tools, approvals and hooks, so it is not hook runtime alone.

Figure (local only): `results/observations.png`, every run grouped by task and matched repetition.

Each task has its own vertical scale. Lines connect matched runs; shared memory means they cannot be assumed independent. Downloads (local only): SVG figure `results/observations.svg`, selected-metrics CSV `results/run-summary.csv`, complete analysis JSON `results/analysis.json`, and all run tables `results/README.md`.

## What the harness actually did

### Added persistent context

The installed instruction file contains **64,320 bytes**. On the easy task, the initial rendered prompt was approximately **11.9k characters** in control and **96.0k characters** with shared instructions and the custom skill catalog. This adds about 84k characters before task work. Characters are not tokens; native first-response and cumulative token counters are retained separately.

Larger context and repeated model/tool turns plausibly explain higher input usage. This study does not assign a precise share to instruction size, catalog size or changed behavior. Cached input is included in total input, so the headline percentage is not a billing estimate. No dollar comparison is reported. Fresh input is input minus cached input. Reasoning tokens are already included in output.

### Dispatched hooks, with many payloads skipped

Across six full runs, the dispatcher recorded **174 lifecycle/tool events**, **729 skipped hook entries**, and **9 events marked blocked**. The other conditions recorded no hook events. The installed profile was `minimal`, which intentionally skips many wrappers. A zero-status wrapper or skipped record does not prove its underlying check ran.

The blocking records were task-gate status 2 entries: three each in `medium-r1-full`, `hard-r1-full` and `hard-r2-full`. Those sessions still completed native file edits. The cache transcript shows `exec` calling `tools.apply_patch`. The audit lacks gate input and execution errors, so it cannot distinguish explicit refusal from hook failure or establish which repository scope was read. **Enforcement is unproven despite recorded blocking.** This study did not run a dedicated forbidden-edit challenge and does not establish that every gate is ineffective.

Each full run retains `hook-evidence.json` and `transcript.jsonl`. `private/mechanisms.json` holds policy, hook inventory, source hashes and static prompt measurements.

### Changed some working behavior

All four harness-treated easy runs moved their task record to `pending_review`. Both controls left it under `open`; one had a folder/status mismatch and the other retained a matching open status. The medium and hard baselines had no local board. In the second medium repetition, instructions and full each created one. The task CLI can walk past a Git root and lint the parent study board, so a zero lint exit without a local board is **not local compliance evidence**.

Supplementary test-order measurements require a positive TAP failure result after a reported test edit and before the first reported production-code edit. This sequence was observed in 0/6 controls, 2/6 instructions runs and 1/6 full runs. These measures were defined after execution began and are not preregistered outcomes. Shell edits may be absent from file-change events; a failing suite does not prove every new assertion failed. Per-run observations, local-board scope and injected summaries are in `results/supplementary.json`.

A blind Luna reviewer read anonymized first-repetition submissions without condition labels. It found no reproducible functional defects or misleading README claims. It flagged a submitted-test gap in the instructions and full cache solutions: neither checked invalidating an already-resolved value and reloading it. Both implementations handled that path and passed the independent grader. This was a read-only, post-hoc review by the same model family, not another independent experiment. See `private/blind-review.json`.

### Injected shared session memory

All six full runs received a previous-session summary; the other twelve received none. The first full run received an unrelated depth-estimation project's task 65 summary. Later runs received earlier study summaries, including an interval summary in a cache run and a cache summary in a ledger run. Their lengths ranged from 1,176 to 2,645 characters.

The installed start hook reads shared host session data even with a private `CODEX_HOME`. All submitted repositories were named `repo`, letting project-name matching connect distinct directories. **Full therefore measures installed hooks plus operational memory, not a clean enforcement-only intervention.** Treatments stayed fixed. See `private/memory-observation.json` and actual injected context in native transcripts.

## Experimental design

Questions set before running: do instructions/catalog change correctness, usage or behavior; do installed hooks add an effect; and do observations differ across tasks with more interacting requirements? Improvement was not assumed.

| Task | Assigned difficulty | Main challenge | Frozen categories |
|---|---|---|---:|
| Merge intervals | Easy | Validation, sorting, boundaries and immutable inputs | 26 |
| Shared asynchronous cache | Medium | Shared requests, failed loads and stale completions | 29 |
| Durable transfer ledger | Hard | Serialized persistence, failed writes, reloads and repeated IDs | 20 |

Difficulty was assigned before results. One task per level confounds difficulty with task identity. The local-board scaffold difference also prevents attributing cross-task differences to difficulty.

| Condition | Shared instructions and custom skill catalog | Installed hooks |
|---|---|---|
| Control | Absent | Off |
| Instructions | Present | Off |
| Full | Present | On |

The first comparison measures a bundle of rules and catalog exposure. The second adds hooks and their actual memory behavior. Built-in runtime skills remain available in all conditions. In-run delegation is disabled equally, so delegation and specialist-review benefits are outside this study.

Each task/condition has two repetitions from the same committed baseline, with identical task prompt, model alias, reasoning, CLI version and observed permissions. All six condition-order permutations occur once across six task/repetition blocks. The schedule is fixed and counterbalanced, not randomly sampled. Runs execute sequentially to avoid shared hook-state races. Contracts, order and the 12-minute administrative timeout are in [protocol.json](../protocol.json).

Graders are outside submitted repositories. Before paid execution, all accepted their correct reference, rejected their starter, and detected all **13 deliberately broken variants**. Calibration does not prove exhaustive coverage. No submitted solution was repaired after scoring.

## Evidence and deviations

The native executable was `codex-cli 0.162.0-alpha.17.2` at a fixed versioned path. Its SHA-256 was recorded at mechanism capture, rather than enforced on every launch. All observed contexts identified Luna/high, workspace-write, network off and on-request approval under automatic approval review. The alias was fixed; an underlying model-weight revision was not exposed. `results/frozen.json` records protocol, source, tools, baselines, configuration and prompt hashes.

Each run retains raw events/results, native transcript, usage counters, generated source/tests/docs, independent grade and submitted test output. **All 519 final consistency checks passed**, covering frozen inputs, grader category identities, native usage agreement, equal contexts, baseline commit identity, login cleanup and unchanged host source/configuration. Private CLI configs gained only their own repository trust entry; original setting bytes and instruction/hook hashes were checked separately. See `private/validation.json`.

Retained deviations:

1. Eighteen initial CLI launches rejected incompatible flags before any model thread started. Their protocol, tools and logs remain in `archives/prelaunch-001`. The corrected v2 cohort kept the same contracts, graders, order and model settings. No paid completion was discarded or replaced.
2. The frozen runner omitted session identity from summaries. Identity was recovered from native events while preserving `result.raw.json`; frozen tools stayed unchanged.
3. Default PowerShell decoding altered one apostrophe in a derived response copy. UTF-8 normalization restored every original field, retained earlier enriched copies, and added only identity metadata. Usage and submissions were unaffected.
4. Shared memory and ancestor-board lookup were discovered during execution. Treatments stayed fixed; interpretation and supplementary measurements were corrected. After completion, supplementary failure detection was refined to require a positive TAP failure count instead of treating any shell error as a failed test.

Registration, review evidence and observations are under `private/`. Development/review effort is excluded from session usage, not presented as zero-cost work.

## Limits and next experiments

All tasks reached the grader's correctness ceiling. This demonstrates no measured correctness gain here; it does not establish that the harness cannot help with ambiguity, larger repositories, restarts or collaboration. Two repetitions and three selected tasks do not support significance tests or population claims. Shared memory creates dependence between full runs. Cache state, order, approvals and model variation remain possible influences despite counterbalancing.

The evidence supports testing a smaller instruction/catalog bundle next. It also supports a separate forbidden-edit test retaining hook input, errors and final tool disposition. A later comparison should give each run a distinct project identity and isolated memory, then add memory as its own condition. More tasks near the model's failure boundary would leave room to observe correctness benefits. These are proposed experiments; this study did not modify the harness to implement them.

## Follow-up assessment

The first study reached a correctness ceiling and did not compare a task-only profile or require large-scale planning. [The follow-up assessment](../follow-up/README.md) answers those limits, reviews current public benchmarks and proposes a stock / task-only / full comparison. It also traces which task-system dependencies can stand apart from the broad harness. This is a proposed evaluation, not a new set of results.

## Reanalyse existing results

From the repository's top folder:

```powershell
node tools/analyse.cjs
powershell -File private/supplement.ps1
python private/plot_results.py
node private/validate.cjs
```

The plot exporter uses Matplotlib 3.10.8. Node was 22.21.0 on Windows x64. The metadata repair is retained as `private/normalize_results.ps1`; raw results remain authoritative. Completed paid attempts cannot be overwritten. Use a new study directory and unique ID for another cohort.

Original harness source and global configuration were read-only inputs. Full hooks appended their normal audit/session state. Temporary login aliases stayed outside this folder and were removed after each process and its streams finished. No real application source was changed for this study.
