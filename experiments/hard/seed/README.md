# Durable transfer ledger

Implement src/ledger.js so it exports one function: openLedger({ storage, initialBalances }).

storage has two asynchronous methods:

- read() returns either null or the exact JSON string previously stored.
- write(json) atomically replaces the stored string. If its promise rejects, the stored string remains byte-for-byte unchanged.

When read() returns null, validate initialBalances as a nonempty plain object. Account names must match /^[A-Za-z][A-Za-z0-9_]*$/, must not name an inherited Object.prototype property, and balances must be nonnegative safe integers. Opening an empty store must not call write().

When read() returns a string, parse and validate the whole saved snapshot before opening. A saved snapshot has exactly this shape:

    { "version": 1, "balances": { "account": 123 }, "receipts": [] }

It must have exactly the listed fields. Balances may be empty in a saved snapshot. Receipt entries have exactly {id, from, to, amount}. IDs are nonempty strings and unique. Accounts are valid, distinct, and present in balances. Amounts are positive safe integers. Do not infer or replay history from receipts. A valid saved snapshot takes precedence over initialBalances, which is ignored.

transfer({id, from, to, amount}) always returns a promise. Validate the ID, distinct known accounts, and positive safe integer amount. Serialize overlapping calls in invocation order. Check each request against the latest committed balances. Reject insufficient funds and any resulting balance outside the safe integer range.

For a new transfer, persist the complete next snapshot before publishing any change in memory. If write() rejects, reject that transfer, keep the in-memory snapshot unchanged, reserve no receipt ID, and allow later calls to proceed. A repeated ID with the same from, to, and amount returns its original receipt without writing again. Reusing an ID with a different payload rejects. Failed writes do not reserve IDs.

snapshot() is synchronous and returns a fresh {version, balances, receipts} copy of committed data. Returned receipts and snapshots must not let callers mutate ledger state. In-flight transfers are not visible.

Use only Node.js built-ins. Do not use the filesystem, clock, randomness, or external services.

Run the public tests with:

    node test/ledger.test.js

Validation and invalid saved data reject with TypeError (including malformed JSON). Insufficient funds and balance overflow reject with RangeError. Reused IDs with a different payload reject with Error. Propagate the original storage read/write failure unchanged. The storage adapter may be a class instance; only its read and write methods are required. The ledger instance is the only writer; concurrent ledgers over the same adapter are outside this contract.
