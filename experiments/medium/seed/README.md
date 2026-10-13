# Async singleflight cache

Implement `createCache(loader)` in `src/index.js`. It returns `{ get, invalidate, clear }`. The loader must be a function or construction throws `TypeError`.

`get(key)` accepts a nonempty primitive string. For an invalid key it returns a rejected Promise with `TypeError` and does not call the loader. For a valid uncached key, `get` immediately reserves and returns one Promise shared by every call for that key while loading. The loader is called with the key in the next microtask. A synchronous loader throw becomes a rejected Promise. A resolved value is cached and returned by later calls.

A rejected load rejects its callers and is removed so a later `get` can retry. `invalidate(key)` requires a nonempty primitive string and throws `TypeError` synchronously for an invalid key. It removes the cached value and starts a new generation for that key. Pending callers still receive their original outcome, but completion from an invalidated load must not change the cache or interfere with a newer load. `clear()` synchronously removes every cached value and starts a new generation for all keys; pending callers keep their original outcome, and their completion cannot repopulate the cache or interfere with newer loads. `invalidate` and `clear` return `undefined`.

Run the public tests with `node test/createCache.test.js` from this directory. The implementation uses CommonJS and exports `{ createCache }`.