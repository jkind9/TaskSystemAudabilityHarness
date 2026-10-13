'use strict';
function createCache(loader) { const values = new Map(); return { get(key) { if (values.has(key)) return Promise.resolve(values.get(key)); return Promise.resolve().then(() => loader(key)).then(value => { values.set(key, value); return value; }); }, invalidate(key) { values.delete(key); }, clear() { values.clear(); } }; }
module.exports = { createCache };