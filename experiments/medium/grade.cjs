'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); }
const CHECK_TIMEOUT_MS = 250;
const unhandledRejections = [];
process.on('unhandledRejection', reason => unhandledRejections.push(reason));
function protectCache(cache) {
  return new Proxy(cache, {
    get(target, property) {
      const method = Reflect.get(target, property, target);
      if (typeof method !== 'function') return method;
      if (property === 'get') return (...args) => {
        const pending = method.apply(target, args);
        if (pending && typeof pending.then === 'function') pending.catch(() => {});
        return pending;
      };
      return method.bind(target);
    }
  });
}
async function grade(repoRoot) {
  const checks = [];
  const add = async (name, fn) => {
    const initialUnhandled = unhandledRejections.length;
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
    });
    try {
      await Promise.race([Promise.resolve().then(fn), timeout]);
      await new Promise(resolve => setImmediate(resolve));
      if (unhandledRejections.length > initialUnhandled) {
        const reason = unhandledRejections[initialUnhandled];
        throw new Error(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
      checks.push({ name, pass: true });
    } catch (error) {
      checks.push({ name, pass: false, error: `${error.name}: ${error.message}` });
    } finally {
      clearTimeout(timer);
    }
  };
  let createCache;
  try {
    const target = path.join(repoRoot, 'src', 'index.js');
    delete require.cache[require.resolve(target)];
    ({ createCache } = require(target));
  } catch (error) {
    return { passed: 0, failed: 1, total: 1, checks: [{ name: 'module exports createCache', pass: false, error: `${error.name}: ${error.message}` }] };
  }
  const makeCache = loader => protectCache(createCache(loader));
  await new Promise(resolve => setImmediate(resolve));
  unhandledRejections.length = 0;
  await add('exports a factory function', async () => assert.equal(typeof createCache, 'function'));
  if (typeof createCache === 'function') {
    await add('rejects a non-function loader synchronously', async () => assert.throws(() => createCache(null), TypeError));
    await add('returns the three cache methods', async () => { const c = makeCache(() => 1); assert.equal(typeof c.get, 'function'); assert.equal(typeof c.invalidate, 'function'); assert.equal(typeof c.clear, 'function'); });
    await add('invalid empty key returns a rejected Promise', async () => { const c = makeCache(() => 1); const p = c.get(''); assert.ok(p instanceof Promise); await assert.rejects(p, TypeError); });
    await add('invalid non-string key returns a rejected Promise', async () => { const c = makeCache(() => 1); await assert.rejects(c.get(1), TypeError); });
    await add('invalid get does not call loader', async () => { let calls = 0; const c = makeCache(() => ++calls); await assert.rejects(c.get(''), TypeError); assert.equal(calls, 0); });
    await add('miss resolves loader value', async () => { const c = makeCache(key => `value:${key}`); assert.equal(await c.get('a'), 'value:a'); });
    await add('loader receives the requested key once', async () => { const seen = []; const c = makeCache(key => { seen.push(key); return 7; }); await c.get('a'); await flush(); assert.deepEqual(seen, ['a']); });
    await add('same-key pending calls return the identical Promise', async () => { const gate = deferred(); const c = makeCache(() => gate.promise); const a = c.get('x'); const b = c.get('x'); a.catch(() => {}); b.catch(() => {}); assert.strictEqual(a, b); gate.resolve(1); await Promise.all([a, b]); });
    await add('same-key pending calls invoke loader once', async () => { const gate = deferred(); let calls = 0; const c = makeCache(() => { calls += 1; return gate.promise; }); const a = c.get('x'); const b = c.get('x'); a.catch(() => {}); b.catch(() => {}); await flush(); assert.equal(calls, 1); gate.resolve(1); await a; });
    await add('different keys load independently', async () => { const gates = { a: deferred(), b: deferred() }; const seen = []; const c = makeCache(key => { seen.push(key); return gates[key].promise; }); const a = c.get('a'); const b = c.get('b'); await flush(); assert.deepEqual(seen.sort(), ['a', 'b']); gates.a.resolve(1); gates.b.resolve(2); assert.deepEqual(await Promise.all([a, b]), [1, 2]); });
    await add('successful value is cached', async () => { let calls = 0; const c = makeCache(() => ++calls); assert.equal(await c.get('x'), 1); assert.equal(await c.get('x'), 1); assert.equal(calls, 1); });
    await add('cached value is reused after Promise turn', async () => { let calls = 0; const c = makeCache(() => ++calls); await c.get('x'); await flush(); await c.get('x'); assert.equal(calls, 1); });
    await add('loader runs in the next microtask', async () => { let calls = 0; const c = makeCache(() => { calls += 1; return 1; }); const p = c.get('x'); assert.equal(calls, 0); await p; assert.equal(calls, 1); });
    await add('rejection reaches caller', async () => { const c = makeCache(() => Promise.reject(new Error('offline'))); await assert.rejects(c.get('x'), /offline/); });
    await add('rejected load is evicted for retry', async () => { let calls = 0; const c = makeCache(() => (++calls === 1 ? Promise.reject(new Error('first')) : 'second')); await assert.rejects(c.get('x'), /first/); assert.equal(await c.get('x'), 'second'); assert.equal(calls, 2); });
    await add('synchronous loader throw becomes rejection', async () => { const c = makeCache(() => { throw new Error('sync failure'); }); await assert.rejects(c.get('x'), /sync failure/); });
    await add('synchronous loader throw does not poison retry', async () => { let calls = 0; const c = makeCache(() => { calls += 1; if (calls === 1) throw new Error('once'); return 'ok'; }); await assert.rejects(c.get('x'), /once/); assert.equal(await c.get('x'), 'ok'); });
    await add('invalidate rejects invalid keys synchronously', async () => { const c = makeCache(() => 1); assert.throws(() => c.invalidate(''), TypeError); assert.throws(() => c.invalidate(null), TypeError); });
    await add('invalidate removes a cached value', async () => { let calls = 0; const c = makeCache(() => ++calls); await c.get('x'); assert.equal(c.invalidate('x'), undefined); assert.equal(await c.get('x'), 2); });
    await add('invalidate allows a new load while old load is pending', async () => { const old = deferred(); const fresh = deferred(); let calls = 0; const c = makeCache(() => (++calls === 1 ? old.promise : fresh.promise)); const oldP = c.get('x'); c.invalidate('x'); const freshP = c.get('x'); assert.notStrictEqual(oldP, freshP); await flush(); assert.equal(calls, 2); old.resolve('old'); fresh.resolve('fresh'); await Promise.all([oldP, freshP]); });
    await add('old success cannot overwrite a newer cached value', async () => { const old = deferred(); const fresh = deferred(); let calls = 0; const c = makeCache(() => (++calls === 1 ? old.promise : fresh.promise)); const oldP = c.get('x'); c.invalidate('x'); const freshP = c.get('x'); await flush(); fresh.resolve('fresh'); await freshP; old.resolve('old'); await oldP; assert.equal(await c.get('x'), 'fresh'); });
    await add('old rejection cannot delete a newer in-flight load', async () => { const old = deferred(); const fresh = deferred(); let calls = 0; const c = makeCache(() => (++calls === 1 ? old.promise : fresh.promise)); const oldP = c.get('x'); c.invalidate('x'); const freshP = c.get('x'); await flush(); old.reject(new Error('old failure')); await assert.rejects(oldP, /old failure/); const again = c.get('x'); assert.strictEqual(again, freshP); assert.equal(calls, 2); fresh.resolve('fresh'); await freshP; });
    await add('clear returns undefined and removes all cached keys', async () => { let calls = 0; const c = makeCache(key => `${key}:${++calls}`); await c.get('a'); await c.get('b'); assert.equal(c.clear(), undefined); assert.deepEqual(await Promise.all([c.get('a'), c.get('b')]), ['a:3', 'b:4']); });
    await add('clear allows new loads while earlier loads are pending', async () => { const oldA = deferred(); const oldB = deferred(); let calls = 0; const c = makeCache(key => (++calls <= 2 ? (key === 'a' ? oldA.promise : oldB.promise) : `${key}:fresh`)); const a = c.get('a'); const b = c.get('b'); c.clear(); const freshA = c.get('a'); const freshB = c.get('b'); await flush(); assert.deepEqual(await Promise.all([freshA, freshB]), ['a:fresh', 'b:fresh']); oldA.resolve('old-a'); oldB.resolve('old-b'); await Promise.all([a, b]); assert.equal(calls, 4); });
    await add('pre-clear success cannot repopulate a key', async () => { const old = deferred(); let calls = 0; const c = makeCache(() => (++calls === 1 ? old.promise : 'fresh')); const p = c.get('x'); c.clear(); assert.equal(await c.get('x'), 'fresh'); old.resolve('old'); await p; assert.equal(await c.get('x'), 'fresh'); assert.equal(calls, 2); });
    await add('pre-clear rejection cannot delete a newer value', async () => { const old = deferred(); let calls = 0; const c = makeCache(() => (++calls === 1 ? old.promise : 'fresh')); const p = c.get('x'); c.clear(); assert.equal(await c.get('x'), 'fresh'); old.reject(new Error('old')); await assert.rejects(p, /old/); assert.equal(await c.get('x'), 'fresh'); assert.equal(calls, 2); });
    await add('invalidate one key preserves other cached keys', async () => { let calls = 0; const c = makeCache(key => `${key}:${++calls}`); await c.get('a'); await c.get('b'); c.invalidate('a'); assert.equal(await c.get('a'), 'a:3'); assert.equal(await c.get('b'), 'b:2'); });
    await add('empty string values are cached as successful values', async () => { let calls = 0; const c = makeCache(() => { calls += 1; return ''; }); assert.equal(await c.get('x'), ''); assert.equal(await c.get('x'), ''); assert.equal(calls, 1); });
  }
  const passed = checks.filter(check => check.pass).length;
  return { passed, failed: checks.length - passed, total: checks.length, checks };
}
module.exports = { grade };
if (require.main === module) grade(path.resolve(process.argv[2] || '.')).then(result => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed) process.exitCode = 1;
});