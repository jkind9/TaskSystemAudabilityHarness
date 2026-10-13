---
id: "00"
title: Async singleflight cache
status: open
priority: MED
type: bug
files:
  - src/**
  - test/**
docs:
  - README.md
---
# Async singleflight cache

## In plain English
Build a small asynchronous cache that shares one active load for each key and remembers successful results. Add invalidation so an older load cannot restore a value after the caller has asked for fresh data. Test failures and timing-sensitive cases with controlled promises, then document the contract.

## What
Implement `createCache(loader)` in `src/index.js` with the `get`, `invalidate`, and `clear` methods specified in the seed README.

## Why
The starter does not load or cache values. A correct cache also has to stop older pending work from replacing newer data after invalidation.

## How
| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| No cache or invalidation implementation exists in this seed | None | `src/index.js` is the implementation target | Search of seed `src/` and `test/` before implementation |
| The public tests already provide deterministic deferred promises | `test/createCache.test.js` | Cache contract checks | `test/createCache.test.js` |

- Store one in-flight Promise for each current key generation.
- Cache only successful current-generation results; evict failures for retry.
- Make invalidation and clearing safe when earlier loads finish later.
- Use deferred promises in tests so ordering does not depend on timers.
- Keep this README's contract and test command accurate.

## Invariants and recovery
| Producer/owner | Consumer | Representation | Survives restart? |
|---|---|---|---|
| `createCache` owns key generations, active Promises, and cached values | `get`, `invalidate`, `clear` | In-memory maps keyed by nonempty strings; generation tokens are internal | No; the cache is process-local |

`invalidate` advances one key generation. `clear` advances the global generation and drops all values. A pending request may resolve for its original callers after either transition, but only a request from the current generation may update the cache or clear that generation's in-flight entry. Process restart discards all state and starts with an empty cache.

## Verification
Contract test: `node test/createCache.test.js`; assert pending same-key calls share a Promise, successes cache, failures retry, and old completions cannot overwrite newer results after invalidation or clear.
Before/after: baseline `get` always rejects `not implemented`; target is all public tests passing and each stale-completion case preserving the current value.

## Receipts
| field | value |
|---|---|
| closing commit | pending |
| files changed | pending |
| test status | pending |
| before measurement | every `get` rejects `not implemented` |
| after measurement | pending |
| delta | pending |
| decision-gate outcome | pending |