'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache } = require('../src');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('shares a pending load and caches its resolved value', async () => {
  const gate = deferred();
  let calls = 0;
  const cache = createCache(async key => { calls += 1; assert.equal(key, 'item'); return gate.promise; });
  const first = cache.get('item');
  const second = cache.get('item');
  assert.strictEqual(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve(42);
  assert.equal(await first, 42);
  assert.equal(await cache.get('item'), 42);
  assert.equal(calls, 1);
});

test('a rejected load is removed so a later call can retry', async () => {
  let calls = 0;
  const cache = createCache(() => { calls += 1; return calls === 1 ? Promise.reject(new Error('offline')) : 'ready'; });
  await assert.rejects(cache.get('x'), /offline/);
  assert.equal(await cache.get('x'), 'ready');
  assert.equal(calls, 2);
});

test('invalidating pending work prevents it from replacing a newer value', async () => {
  const oldGate = deferred();
  const freshGate = deferred();
  let calls = 0;
  const cache = createCache(() => (++calls === 1 ? oldGate.promise : freshGate.promise));
  const oldRequest = cache.get('x');
  cache.invalidate('x');
  const freshRequest = cache.get('x');
  await Promise.resolve();
  oldGate.resolve('old');
  assert.equal(await oldRequest, 'old');
  freshGate.resolve('fresh');
  assert.equal(await freshRequest, 'fresh');
  assert.equal(await cache.get('x'), 'fresh');
});

test('clear removes cached values', async () => {
  let calls = 0;
  const cache = createCache(() => ++calls);
  assert.equal(await cache.get('x'), 1);
  assert.equal(cache.clear(), undefined);
  assert.equal(await cache.get('x'), 2);
});

test('constructor and invalidation validate their inputs', () => {
  assert.throws(() => createCache(null), TypeError);
  const cache = createCache(() => 1);
  assert.throws(() => cache.invalidate(''), TypeError);
  assert.throws(() => cache.invalidate(null), TypeError);
});