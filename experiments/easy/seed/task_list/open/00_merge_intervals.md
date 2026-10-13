---
id: "00"
title: Merge touching intervals
status: open
priority: MED
type: bug
files:
  - src/**
  - test/**
docs:
  - README.md
---
# Merge touching intervals

## In plain English
Write a small function that combines intervals when they overlap or meet at an endpoint. It must return sorted results and leave the caller's data unchanged. Add tests for normal inputs and invalid values, then document how to run them.

## What
Implement `mergeIntervals(intervals)` in `src/index.js`. Preserve the CommonJS export and the contract in the seed README.

## Why
The starter returns an empty result for every input. Callers need deterministic interval union behavior and clear errors for malformed data.

## How
| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| No interval-merging implementation exists in this seed | None | `src/index.js` is the implementation target | Search of seed `src/` and `test/` before implementation |

- Validate all entries and endpoint values before producing output.
- Sort and merge overlapping or touching intervals into newly allocated pairs.
- Cover empty, sorting, merging, immutability, frozen input, and error cases.
- Keep this README's contract and test command accurate.

## Invariants and recovery
invariants n/a: pure in-memory function with no persistent state or external side effects.

## Verification
Contract test: `node test/mergeIntervals.test.js`; assert touching and overlapping inputs return the specified sorted union, frozen inputs remain unchanged, and malformed values throw the specified error class.
Before/after: baseline returns `[]` for all input; target is every public test passing with the complete contract implemented.

## Receipts
| field | value |
|---|---|
| closing commit | pending |
| files changed | pending |
| test status | pending |
| before measurement | starter returns `[]` for all inputs |
| after measurement | pending |
| delta | pending |
| decision-gate outcome | pending |