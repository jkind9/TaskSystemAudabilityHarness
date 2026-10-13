# Experiment results

Descriptive results from three tasks. Difficulty and task identity are confounded.

| Task | Repeat | Condition | Checks | Tokens | Fresh input | Seconds | Board lint | Hook events |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| easy | 1 | control | 5/26 | ? | ? | 0.2 | 0 | 0 |
| easy | 1 | instructions | 5/26 | ? | ? | 0.2 | 0 | 0 |
| easy | 1 | full | 5/26 | ? | ? | 0.2 | 0 | 0 |
| medium | 1 | instructions | 2/29 | ? | ? | 0.2 | 0 | 0 |
| medium | 1 | full | 2/29 | ? | ? | 0.2 | 0 | 0 |
| medium | 1 | control | 2/29 | ? | ? | 0.2 | 0 | 0 |
| hard | 1 | full | 0/20 | ? | ? | 0.2 | 0 | 0 |
| hard | 1 | control | 0/20 | ? | ? | 0.2 | 0 | 0 |
| hard | 1 | instructions | 0/20 | ? | ? | 0.2 | 0 | 0 |
| easy | 2 | full | 5/26 | ? | ? | 0.2 | 0 | 0 |
| easy | 2 | instructions | 5/26 | ? | ? | 0.2 | 0 | 0 |
| easy | 2 | control | 5/26 | ? | ? | 0.2 | 0 | 0 |
| medium | 2 | instructions | 2/29 | ? | ? | 0.2 | 0 | 0 |
| medium | 2 | control | 2/29 | ? | ? | 0.2 | 0 | 0 |
| medium | 2 | full | 2/29 | ? | ? | 0.2 | 0 | 0 |
| hard | 2 | control | 0/20 | ? | ? | 0.2 | 0 | 0 |
| hard | 2 | full | 0/20 | ? | ? | 0.2 | 0 | 0 |
| hard | 2 | instructions | ?/20 | ? | ? | ? | ? | 0 |

## Matched changes

Percentage changes match task and repetition, with the first condition as denominator. Ranges show observed variation, not confidence intervals.

| Comparison | Metric | Pairs | Median change | Observed range |
|---|---|---:|---:|---:|
| control to instructions | totalTokens | 0 | ?% | ?% to ?% |
| control to instructions | freshInputTokens | 0 | ?% | ?% to ?% |
| control to instructions | elapsedSeconds | 5 | -1.8% | -5.5% to 6.8% |
| control to instructions | toolCalls | 0 | ?% | ?% to ?% |
| instructions to full | totalTokens | 0 | ?% | ?% to ?% |
| instructions to full | freshInputTokens | 0 | ?% | ?% to ?% |
| instructions to full | elapsedSeconds | 5 | -3.6% | -8.5% to 6.3% |
| instructions to full | toolCalls | 0 | ?% | ?% to ?% |
| control to full | totalTokens | 0 | ?% | ?% to ?% |
| control to full | freshInputTokens | 0 | ?% | ?% to ?% |
| control to full | elapsedSeconds | 6 | -1.8% | -6.2% to 0.5% |
| control to full | toolCalls | 0 | ?% | ?% to ?% |

## Limits

Success requires CLI completion and every frozen contract category passing. Unknown grades and usage stay unknown. Failed attempts are not replaced. Task-board lint, test activity and hook dispatch are process observations, not functional correctness. Hook wrappers can skip their payload based on profile settings even with zero exit status. Command references do not prove guidance was read or followed. Shell edits may not produce file-change events.

Instructions bundle shared rules and custom skills; full adds installed hooks. Delegation is disabled equally. Two repetitions do not support significance claims. Cache and order effects remain possible despite counterbalancing. Setup and external review are excluded; guardian usage was unavailable.
