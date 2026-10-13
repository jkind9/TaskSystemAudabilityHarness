'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { openLedger } = require('../src/ledger');

class MemoryStorage {
  constructor(value = null) {
    this.value = value;
    this.writes = [];
    this.nextFailure = null;
  }

  async read() {
    return this.value;
  }

  async write(value) {
    this.writes.push(value);
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = null;
      throw failure;
    }
    this.value = value;
  }
}

function request(id, from = 'Ada', to = 'Bea', amount = 1) {
  return { id, from, to, amount };
}

test('opening an empty store validates balances and does not write', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  assert.deepEqual(ledger.snapshot(), { version: 1, balances: { Ada: 8, Bea: 2 }, receipts: [] });
  assert.equal(storage.writes.length, 0);
});

test('commits a transfer to storage and then exposes it in the snapshot', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  const receipt = await ledger.transfer(request('t1', 'Ada', 'Bea', 3));
  assert.deepEqual(receipt, request('t1', 'Ada', 'Bea', 3));
  assert.deepEqual(ledger.snapshot(), {
    version: 1, balances: { Ada: 5, Bea: 5 }, receipts: [receipt]
  });
  assert.deepEqual(JSON.parse(storage.value), ledger.snapshot());
});

test('same ID and payload returns the original receipt without another write', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  const receipt = await ledger.transfer(request('t1'));
  const writes = storage.writes.length;
  assert.deepEqual(await ledger.transfer(request('t1')), receipt);
  assert.equal(storage.writes.length, writes);
});

test('same ID with a different payload rejects without changing state', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  await ledger.transfer(request('t1'));
  const before = ledger.snapshot();
  await assert.rejects(ledger.transfer(request('t1', 'Ada', 'Bea', 2)), Error);
  assert.deepEqual(ledger.snapshot(), before);
});

test('reopens committed balances and receipts, ignoring initial balances', async () => {
  const storage = new MemoryStorage();
  const first = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  await first.transfer(request('t1', 'Ada', 'Bea', 3));
  const second = await openLedger({ storage, initialBalances: { Ada: 0, Bea: 0 } });
  assert.deepEqual(second.snapshot(), first.snapshot());
  const writes = storage.writes.length;
  await second.transfer(request('t1', 'Ada', 'Bea', 3));
  assert.equal(storage.writes.length, writes);
});

test('write failure leaves memory and stored bytes unchanged and does not reserve ID', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  const before = ledger.snapshot();
  storage.nextFailure = new Error('disk rejected');
  await assert.rejects(ledger.transfer(request('retry-me')), /disk rejected/);
  assert.deepEqual(ledger.snapshot(), before);
  assert.equal(storage.value, null);
  await ledger.transfer(request('retry-me'));
  assert.equal(ledger.snapshot().receipts.length, 1);
});

test('a rejected queued write does not poison later transfers', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  storage.nextFailure = new Error('disk rejected');
  const failed = ledger.transfer(request('bad'));
  const following = ledger.transfer(request('good'));
  await assert.rejects(failed);
  await following;
  assert.deepEqual(ledger.snapshot().receipts.map((entry) => entry.id), ['good']);
});

test('serializes overlapping calls in invocation order against committed funds', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 5, Bea: 0, Cy: 0 } });
  const first = ledger.transfer(request('first', 'Ada', 'Bea', 4));
  const second = ledger.transfer(request('second', 'Ada', 'Cy', 2));
  await first;
  await assert.rejects(second, RangeError);
  assert.deepEqual(ledger.snapshot().balances, { Ada: 1, Bea: 4, Cy: 0 });
});

test('snapshot hides an in-flight write until it resolves', async () => {
  let release;
  const storage = new MemoryStorage();
  const originalWrite = storage.write.bind(storage);
  storage.write = async (value) => {
    await new Promise((resolve) => { release = resolve; });
    await originalWrite(value);
  };
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  const pending = ledger.transfer(request('pending'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ledger.snapshot().balances, { Ada: 8, Bea: 2 });
  release();
  await pending;
  assert.deepEqual(ledger.snapshot().balances, { Ada: 7, Bea: 3 });
});

test('receipts and nested snapshots are defensive copies', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  const receipt = await ledger.transfer(request('t1'));
  receipt.amount = 99;
  const snapshot = ledger.snapshot();
  snapshot.balances.Ada = 0;
  snapshot.receipts[0].id = 'changed';
  assert.deepEqual(ledger.snapshot(), {
    version: 1, balances: { Ada: 7, Bea: 3 }, receipts: [request('t1')]
  });
});

test('rejects bad account names, unsafe balances, and empty initial balances', async () => {
  for (const initialBalances of [{}, { 'bad-key': 1 }, { constructor: 1 }, { Ada: -1 }, { Ada: 1.5 }, { Ada: Number.MAX_SAFE_INTEGER + 1 }]) {
    const storage = new MemoryStorage();
    await assert.rejects(openLedger({ storage, initialBalances }), TypeError);
    assert.equal(storage.writes.length, 0);
  }
});

test('rejects invalid transfers without persisting them', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({ storage, initialBalances: { Ada: 8, Bea: 2 } });
  for (const bad of [
    request('', 'Ada', 'Bea', 1),
    request('x', 'Ada', 'Ada', 1),
    request('x', 'Missing', 'Bea', 1),
    request('x', 'Ada', 'Bea', 0),
    request('x', 'Ada', 'Bea', Number.MAX_SAFE_INTEGER + 1)
  ]) {
    await assert.rejects(ledger.transfer(bad), TypeError);
  }
  assert.equal(storage.writes.length, 0);
});

test('rejects insufficient funds and receiving-balance overflow', async () => {
  const storage = new MemoryStorage();
  const ledger = await openLedger({
    storage, initialBalances: { Ada: 1, Bea: Number.MAX_SAFE_INTEGER }
  });
  await assert.rejects(ledger.transfer(request('low', 'Ada', 'Bea', 2)), RangeError);
  await assert.rejects(ledger.transfer(request('overflow', 'Ada', 'Bea', 1)), RangeError);
  assert.equal(storage.writes.length, 0);
});

test('fails closed on malformed saved snapshots and propagates read errors', async () => {
  for (const value of [
    '{', JSON.stringify({ version: 2, balances: {}, receipts: [] }),
    JSON.stringify({ version: 1, balances: { Ada: -1 }, receipts: [] }),
    JSON.stringify({ version: 1, balances: { Ada: 1 }, receipts: [{ id: 'x', from: 'Ada', to: 'Missing', amount: 1 }] }),
    JSON.stringify({ version: 1, balances: { Ada: 1, Bea: 1 }, receipts: [
      request('x'), request('x')
    ] })
  ]) {
    await assert.rejects(openLedger({ storage: new MemoryStorage(value), initialBalances: { Ada: 1 } }), TypeError);
  }
  const failing = { async read() { throw new Error('read failed'); }, async write() {} };
  await assert.rejects(openLedger({ storage: failing, initialBalances: { Ada: 1 } }), /read failed/);
});
