'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

function freshLoad(root) {
  const sourceDir = path.resolve(root, 'src');
  for (const filename of Object.keys(require.cache)) {
    if (filename.startsWith(sourceDir + path.sep)) delete require.cache[filename];
  }
  const modulePath = path.join(sourceDir, 'ledger.js');
  delete require.cache[modulePath];
  const loaded = require(modulePath);
  if (!loaded || typeof loaded.openLedger !== 'function') {
    throw new TypeError('src/ledger.js must export openLedger');
  }
  return loaded.openLedger;
}

class MemoryStorage {
  constructor(value = null) {
    this.value = value;
    this.writes = [];
    this.failNext = null;
    this.beforeWrite = null;
  }

  async read() {
    return this.value;
  }

  async write(value) {
    if (this.beforeWrite) await this.beforeWrite(value);
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.writes.push(value);
    this.value = value;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const initial = () => ({ North: 10, South: 0, Vault: Number.MAX_SAFE_INTEGER });

function tx(id, from = 'North', to = 'South', amount = 1) {
  return { id, from, to, amount };
}

async function opened(openLedger, balances = initial(), storage = new MemoryStorage()) {
  return { storage, ledger: await openLedger({ storage, initialBalances: balances }) };
}

async function expectReject(promise, ErrorType = Error) {
  await assert.rejects(promise, ErrorType);
}

async function runChecks(openLedger) {
  const checks = [];
  async function check(name, operation) {
    let timeout;
    try {
      await Promise.race([
        operation(),
        new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('check timed out')), 3000);
        })
      ]);
      checks.push({ name, pass: true });
    } catch (error) {
      checks.push({
        name,
        pass: false,
        error: error && error.message ? error.message : String(error)
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  await check('accepts class-based storage adapters', async () => {
    class Adapter {
      async read() { return null; }
      async write() {}
    }
    const ledger = await openLedger({ storage: new Adapter(), initialBalances: { North: 1 } });
    assert.deepEqual(ledger.snapshot().balances, { North: 1 });
  });

  await check('empty storage initializes without writing', async () => {
    const { storage, ledger } = await opened(openLedger);
    assert.deepEqual(ledger.snapshot(), {
      version: 1,
      balances: initial(),
      receipts: []
    });
    assert.equal(storage.writes.length, 0);
  });

  await check('initial balances reject empty, unsafe, inherited, and malformed account keys', async () => {
    const badValues = [
      {}, { North: -1 }, { North: 1.25 }, { North: Number.MAX_SAFE_INTEGER + 1 },
      { 'bad-key': 1 }, { constructor: 1 }, { toString: 1 }, null, []
    ];
    for (const initialBalances of badValues) {
      await expectReject(openLedger({ storage: new MemoryStorage(), initialBalances }), TypeError);
    }
  });

  await check('invalid transfer payloads reject without writes', async () => {
    const { ledger, storage } = await opened(openLedger, { North: 5, South: 0 });
    for (const request of [
      tx('', 'North', 'South', 1),
      tx('x', 'North', 'North', 1),
      tx('x', 'North', 'Missing', 1),
      tx('x', 'North', 'South', 0),
      tx('x', 'North', 'South', -1),
      tx('x', 'North', 'South', Number.MAX_SAFE_INTEGER + 1),
      null
    ]) {
      await expectReject(ledger.transfer(request), TypeError);
    }
    assert.equal(storage.writes.length, 0);
  });

  await check('transfer returns a promise even for invalid input', async () => {
    const { ledger } = await opened(openLedger, { North: 5, South: 0 });
    const result = ledger.transfer(null);
    assert.equal(typeof result.then, 'function');
    await expectReject(result, TypeError);
  });

  await check('successful transfer writes complete snapshot before commit', async () => {
    const { ledger, storage } = await opened(openLedger, { North: 10, South: 0 });
    const receipt = await ledger.transfer(tx('a', 'North', 'South', 4));
    assert.deepEqual(receipt, tx('a', 'North', 'South', 4));
    assert.equal(storage.writes.length, 1);
    assert.deepEqual(JSON.parse(storage.value), ledger.snapshot());
    assert.deepEqual(ledger.snapshot().balances, { North: 6, South: 4 });
  });

  await check('in-flight state stays hidden until write resolves', async () => {
    const { storage, ledger } = await opened(openLedger, { North: 10, South: 0 });
    const gate = deferred();
    const entered = deferred();
    storage.beforeWrite = async () => {
      entered.resolve();
      await gate.promise;
    };
    const pending = ledger.transfer(tx('slow'));
    pending.catch(() => {});
    await entered.promise;
    assert.deepEqual(ledger.snapshot().balances, { North: 10, South: 0 });
    gate.resolve();
    await pending;
    assert.deepEqual(ledger.snapshot().balances, { North: 9, South: 1 });
  });

  await check('overlapping transfers commit in invocation order and use latest balances', async () => {
    const { storage, ledger } = await opened(openLedger, { North: 5, South: 0, East: 0 });
    const gate = deferred();
    const entered = deferred();
    storage.beforeWrite = async () => {
      if (storage.writes.length === 0) {
        entered.resolve();
        await gate.promise;
      }
    };
    const first = ledger.transfer(tx('first', 'North', 'South', 4));
    first.catch(() => {});
    await entered.promise;
    const second = ledger.transfer(tx('second', 'North', 'East', 2));
    second.catch(() => {});
    gate.resolve();
    await first;
    await expectReject(second, RangeError);
    assert.deepEqual(ledger.snapshot().balances, { North: 1, South: 4, East: 0 });
    assert.deepEqual(ledger.snapshot().receipts.map((entry) => entry.id), ['first']);
  });

  await check('matching ID and payload reuses receipt without writing', async () => {
    const { ledger, storage } = await opened(openLedger, { North: 5, South: 0 });
    const first = await ledger.transfer(tx('same'));
    const writeCount = storage.writes.length;
    assert.deepEqual(await ledger.transfer(tx('same')), first);
    assert.equal(storage.writes.length, writeCount);
    assert.equal(ledger.snapshot().receipts.length, 1);
  });

  await check('conflicting ID payload rejects and preserves snapshot', async () => {
    const { ledger, storage } = await opened(openLedger, { North: 5, South: 0 });
    await ledger.transfer(tx('same'));
    const before = ledger.snapshot();
    await expectReject(ledger.transfer(tx('same', 'North', 'South', 2)));
    assert.deepEqual(ledger.snapshot(), before);
    assert.equal(storage.writes.length, 1);
  });

  await check('reopen restores snapshot and ignores new initial balances', async () => {
    const storage = new MemoryStorage();
    const first = await openLedger({ storage, initialBalances: { North: 10, South: 0 } });
    await first.transfer(tx('saved', 'North', 'South', 3));
    const reopened = await openLedger({ storage, initialBalances: { North: 0, South: 99 } });
    assert.deepEqual(reopened.snapshot(), first.snapshot());
    const count = storage.writes.length;
    await reopened.transfer(tx('saved', 'North', 'South', 3));
    assert.equal(storage.writes.length, count);
  });

  await check('failed write leaves memory and bytes unchanged and retry may reuse ID', async () => {
    const storage = new MemoryStorage();
    const ledger = await openLedger({ storage, initialBalances: { North: 10, South: 0 } });
    const before = ledger.snapshot();
    const failure = new Error('injected write failure');
    storage.failNext = failure;
    await assert.rejects(ledger.transfer(tx('retry')), (error) => error === failure);
    assert.deepEqual(ledger.snapshot(), before);
    assert.equal(storage.value, null);
    await ledger.transfer(tx('retry'));
    assert.equal(ledger.snapshot().receipts[0].id, 'retry');
  });

  await check('failed operation does not poison serialized queue', async () => {
    const storage = new MemoryStorage();
    const ledger = await openLedger({ storage, initialBalances: { North: 10, South: 0 } });
    storage.failNext = new Error('first write fails');
    const failed = ledger.transfer(tx('first'));
    failed.catch(() => {});
    const succeeds = ledger.transfer(tx('second'));
    succeeds.catch(() => {});
    await expectReject(failed);
    await succeeds;
    assert.deepEqual(ledger.snapshot().receipts.map((entry) => entry.id), ['second']);
  });

  await check('insufficient funds and receiver overflow reject without writes', async () => {
    const { ledger, storage } = await opened(openLedger, {
      North: 1, South: Number.MAX_SAFE_INTEGER
    });
    await expectReject(ledger.transfer(tx('low', 'North', 'South', 2)), RangeError);
    await expectReject(ledger.transfer(tx('overflow', 'North', 'South', 1)), RangeError);
    assert.equal(storage.writes.length, 0);
  });

  await check('caller cannot mutate returned receipt or snapshot', async () => {
    const { ledger } = await opened(openLedger, { North: 5, South: 0 });
    const receipt = await ledger.transfer(tx('copy'));
    receipt.id = 'changed';
    const snapshot = ledger.snapshot();
    snapshot.balances.North = 0;
    snapshot.receipts[0].amount = 99;
    assert.deepEqual(ledger.snapshot(), {
      version: 1,
      balances: { North: 4, South: 1 },
      receipts: [tx('copy')]
    });
  });

  await check('snapshot has exact schema and independent nested copies', async () => {
    const { ledger } = await opened(openLedger, { North: 5, South: 0 });
    await ledger.transfer(tx('copy'));
    const first = ledger.snapshot();
    const second = ledger.snapshot();
    assert.notEqual(first, second);
    assert.notEqual(first.balances, second.balances);
    assert.notEqual(first.receipts, second.receipts);
    assert.deepEqual(Object.keys(first).sort(), ['balances', 'receipts', 'version']);
  });

  await check('saved snapshot must parse and have exact top-level fields', async () => {
    for (const raw of [
      '{',
      JSON.stringify({ version: 1, balances: {}, receipts: [], extra: true }),
      JSON.stringify({ version: 2, balances: {}, receipts: [] }),
      JSON.stringify({ version: 1, balances: {}, receipts: null })
    ]) {
      await expectReject(openLedger({
        storage: new MemoryStorage(raw), initialBalances: { North: 1 }
      }), TypeError);
    }
  });

  await check('saved balances are fully validated, with empty saved balances allowed', async () => {
    const validEmpty = JSON.stringify({ version: 1, balances: {}, receipts: [] });
    const emptyLedger = await openLedger({
      storage: new MemoryStorage(validEmpty), initialBalances: null
    });
    assert.deepEqual(emptyLedger.snapshot(), { version: 1, balances: {}, receipts: [] });
    for (const balances of [
      { North: -1 }, { North: 1.5 }, { North: Number.MAX_SAFE_INTEGER + 1 },
      { 'bad-key': 1 }, { constructor: 1 }
    ]) {
      await expectReject(openLedger({
        storage: new MemoryStorage(JSON.stringify({ version: 1, balances, receipts: [] })),
        initialBalances: { North: 1 }
      }), TypeError);
    }
  });

  await check('saved receipts require exact fields, unique IDs, and valid accounts and amounts', async () => {
    const baseBalances = { North: 4, South: 1 };
    const invalidReceipts = [
      [{ id: '', from: 'North', to: 'South', amount: 1 }],
      [{ id: 'x', from: 'North', to: 'North', amount: 1 }],
      [{ id: 'x', from: 'North', to: 'Missing', amount: 1 }],
      [{ id: 'x', from: 'North', to: 'South', amount: 0 }],
      [{ id: 'x', from: 'North', to: 'South', amount: 1, extra: 1 }],
      [tx('x'), tx('x')]
    ];
    for (const receipts of invalidReceipts) {
      await expectReject(openLedger({
        storage: new MemoryStorage(JSON.stringify({ version: 1, balances: baseBalances, receipts })),
        initialBalances: { North: 1 }
      }), TypeError);
    }
  });

  await check('storage read errors propagate', async () => {
    const failure = new Error('read failure');
    const storage = { async read() { throw failure; }, async write() {} };
    await assert.rejects(openLedger({ storage, initialBalances: { North: 1 } }),
      (error) => error === failure);
  });

  return checks;
}

async function grade(repoRoot) {
  let checks;
  try {
    checks = await runChecks(freshLoad(repoRoot));
  } catch (error) {
    checks = [{
      name: 'load candidate module',
      pass: false,
      error: error && error.message ? error.message : String(error)
    }];
  }
  const passed = checks.filter((entry) => entry.pass).length;
  return {
    passed,
    failed: checks.length - passed,
    total: checks.length,
    checks
  };
}

module.exports = { grade };

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, 'seed'));
  grade(root).then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.failed) process.exitCode = 1;
  });
}


