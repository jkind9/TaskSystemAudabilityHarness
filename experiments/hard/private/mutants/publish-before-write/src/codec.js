'use strict';

const RESERVED_ACCOUNT_NAMES = new Set(Object.getOwnPropertyNames(Object.prototype));
const ACCOUNT_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function isAccountName(value) {
  return typeof value === 'string' &&
    ACCOUNT_NAME.test(value) &&
    !RESERVED_ACCOUNT_NAMES.has(value);
}

function validateBalances(value, requireNonempty) {
  if (!isPlainRecord(value)) throw new TypeError('balances must be a plain object');
  const names = Object.keys(value);
  if (requireNonempty && names.length === 0) {
    throw new TypeError('initialBalances must contain at least one account');
  }

  const balances = Object.create(null);
  for (const name of names) {
    const balance = value[name];
    if (!isAccountName(name)) throw new TypeError('invalid account name');
    if (!Number.isSafeInteger(balance) || balance < 0) {
      throw new TypeError('balances must be nonnegative safe integers');
    }
    balances[name] = balance;
  }
  return balances;
}

function validateReceipt(value, balances) {
  if (!hasExactKeys(value, ['id', 'from', 'to', 'amount'])) {
    throw new TypeError('invalid receipt shape');
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new TypeError('receipt id must be a nonempty string');
  }
  if (!isAccountName(value.from) || !isAccountName(value.to) || value.from === value.to) {
    throw new TypeError('receipt accounts must be known and distinct');
  }
  if (!Object.prototype.hasOwnProperty.call(balances, value.from) ||
      !Object.prototype.hasOwnProperty.call(balances, value.to)) {
    throw new TypeError('receipt account is unknown');
  }
  if (!Number.isSafeInteger(value.amount) || value.amount <= 0) {
    throw new TypeError('receipt amount must be a positive safe integer');
  }
  return { id: value.id, from: value.from, to: value.to, amount: value.amount };
}

function validateSnapshot(value) {
  if (!hasExactKeys(value, ['version', 'balances', 'receipts']) || value.version !== 1) {
    throw new TypeError('invalid snapshot shape or version');
  }
  const balances = validateBalances(value.balances, false);
  if (!Array.isArray(value.receipts)) throw new TypeError('receipts must be an array');

  const seen = new Set();
  const receipts = value.receipts.map((receipt) => {
    const valid = validateReceipt(receipt, balances);
    if (seen.has(valid.id)) throw new TypeError('receipt ids must be unique');
    seen.add(valid.id);
    return valid;
  });
  return { version: 1, balances, receipts };
}

module.exports = {
  isAccountName,
  isPlainRecord,
  validateBalances,
  validateReceipt,
  validateSnapshot
};

