'use strict';

function createCache(loader) {
  // Starter stub: implement the contract in ../README.md.
  return {
    get() { return Promise.reject(new Error('not implemented')); },
    invalidate() {},
    clear() {}
  };
}

module.exports = { createCache };