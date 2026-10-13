'use strict';
function createCache(loader) {
  if (typeof loader !== 'function') throw new TypeError('loader must be a function');
  const values = new Map();
  const active = new Map();
  const keyVersions = new Map();
  let clearVersion = 0;
  const validKey = key => typeof key === 'string' && key.length > 0;
  const tokenFor = key => `${clearVersion}:${keyVersions.get(key) || 0}`;
  return {
    get(key) {
      if (!validKey(key)) return Promise.reject(new TypeError('key must be a nonempty string'));
      if (values.has(key)) return Promise.resolve(values.get(key));
      const token = tokenFor(key);
      const existing = active.get(key);
      if (existing && existing.token === token) return existing.promise;
      let record;
      const promise = Promise.resolve().then(() => loader(key)).then(value => {
        if (tokenFor(key) === token) values.set(key, value);
        return value;
      }).finally(() => {
        if (active.get(key) === record) active.delete(key);
      });
      record = { token, promise };
      active.set(key, record);
      return promise;
    },
    invalidate(key) {
      if (!validKey(key)) throw new TypeError('key must be a nonempty string');
      keyVersions.set(key, (keyVersions.get(key) || 0) + 1);
      values.delete(key);
      return undefined;
    },
    clear() {
      clearVersion += 1;
      values.clear();
      return undefined;
    }
  };
}
module.exports = { createCache };