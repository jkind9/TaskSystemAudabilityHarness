'use strict';
function createCache(loader) {
  const values = new Map();
  const failures = new Map();
  const active = new Map();
  return {
    get(key) {
      if (values.has(key)) return Promise.resolve(values.get(key));
      if (failures.has(key)) return Promise.reject(failures.get(key));
      if (active.has(key)) return active.get(key);
      const p = Promise.resolve().then(() => loader(key)).then(value => { values.set(key, value); return value; }, error => { failures.set(key, error); throw error; });
      active.set(key, p);
      p.then(() => active.delete(key), () => active.delete(key));
      return p;
    },
    invalidate(key) { values.delete(key); failures.delete(key); },
    clear() { values.clear(); failures.clear(); }
  };
}
module.exports = { createCache };