'use strict';

const { validateBalances, validateSnapshot, isPlainRecord, isAccountName } = require('./codec');

function copyReceipt(receipt) {
  return { id: receipt.id, from: receipt.from, to: receipt.to, amount: receipt.amount };
}

function copyBalances(balances) {
  return Object.fromEntries(Object.entries(balances));
}

function snapshotOf(balances, receipts) {
  return {
    version: 1,
    balances: copyBalances(balances),
    receipts: receipts.map(copyReceipt)
  };
}

function samePayload(receipt, request) {
  return receipt.from === request.from &&
    receipt.to === request.to &&
    receipt.amount === request.amount;
}

/**
 * Open a durable transfer ledger backed by an atomic string storage adapter.
 * A rejected storage.write must leave the previous stored bytes unchanged.
 *
 * @param {{storage: {read: () => Promise<string|null>, write: (value: string) => Promise<void>}, initialBalances: Record<string, number>}} options
 * @returns {Promise<{transfer: (request: {id: string, from: string, to: string, amount: number}) => Promise<{id: string, from: string, to: string, amount: number}>, snapshot: () => {version: 1, balances: Record<string, number>, receipts: Array<{id: string, from: string, to: string, amount: number}>}}>}
 */
async function openLedger({ storage, initialBalances } = {}) {
  if (storage === null || (typeof storage !== 'object' && typeof storage !== 'function') ||
      typeof storage.read !== 'function' ||
      typeof storage.write !== 'function') {
    throw new TypeError('storage must provide async read and write functions');
  }

  const persisted = await storage.read();
  let balances;
  let receipts;
  if (persisted === null) {
    balances = validateBalances(initialBalances, true);
    receipts = [];
  } else {
    if (typeof persisted !== 'string') throw new TypeError('stored snapshot must be a string or null');
    let decoded;
    try {
      decoded = JSON.parse(persisted);
    } catch (error) {
      throw new TypeError('stored snapshot is not valid JSON', { cause: error });
    }
    ({ balances, receipts } = validateSnapshot(decoded));
  }

  const receiptsById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
  let queue = Promise.resolve();

  return {
    async transfer(request) {
      const captured = request && typeof request === 'object'
        ? { id: request.id, from: request.from, to: request.to, amount: request.amount }
        : request;
      const operation = queue.then(async () => {
        if (!isPlainRecord(captured)) throw new TypeError('transfer request must be an object');
        const { id, from, to, amount } = captured;
        if (typeof id !== 'string' || id.length === 0) {
          throw new TypeError('id must be a nonempty string');
        }
        if (!isAccountName(from) || !isAccountName(to) || from === to) {
          throw new TypeError('from and to must be distinct valid accounts');
        }
        if (!Object.prototype.hasOwnProperty.call(balances, from) ||
            !Object.prototype.hasOwnProperty.call(balances, to)) {
          throw new TypeError('account is unknown');
        }
        if (!Number.isSafeInteger(amount) || amount <= 0) {
          throw new TypeError('amount must be a positive safe integer');
        }

        const existing = receiptsById.get(id);
        if (existing) {
          if (!samePayload(existing, { from, to, amount })) {
            throw new Error('transfer id already belongs to a different payload');
          }
          return copyReceipt(existing);
        }

        if (balances[from] < amount) throw new RangeError('insufficient funds');
        const nextFrom = balances[from] - amount;
        const nextTo = balances[to] + amount;
        if (!Number.isSafeInteger(nextFrom) || !Number.isSafeInteger(nextTo)) {
          throw new RangeError('resulting balance is outside the safe integer range');
        }

        const receipt = { id, from, to, amount };
        const nextBalances = Object.assign(Object.create(null), balances, {
          [from]: nextFrom,
          [to]: nextTo
        });
        const nextReceipts = [...receipts, receipt];
        const encoded = JSON.stringify(snapshotOf(nextBalances, nextReceipts));
        receiptsById.set(id, receipt);
        await storage.write(encoded);
        balances = nextBalances;
        receipts = nextReceipts;
        receiptsById.set(id, receipt);
        return copyReceipt(receipt);
      });
      queue = operation.then(() => undefined, () => undefined);
      return operation;
    },

    snapshot() {
      return snapshotOf(balances, receipts);
    }
  };
}

module.exports = { openLedger };


