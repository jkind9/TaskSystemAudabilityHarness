'use strict';
// The pilot's token ledger: the only writer of follow-up/study-002/budget.json.
// Pilot sessions (21M) and reviews (4M) share the owner's 25M cap. Setup probes have their own pool,
// reported separately and unlimited unless the protocol sets budget.probes (owner, 2026-10-12).
// Entries are added once per id and never changed.
const fs = require('node:fs');
const path = require('node:path');
const { atomicJson, readJson, studyRoot } = require('./lib.cjs');

const KINDS = { probe: 'probes', session: 'sessions', review: 'reviews' };
const DEFAULT_FILE = path.join(studyRoot, 'budget.json');

function load(file = DEFAULT_FILE) {
  return fs.existsSync(file) ? readJson(file) : { entries: [] };
}

/** Totals per allowance and the largest single entry so far (the estimate for the next one). */
function totals(ledger) {
  const out = { probes: 0, sessions: 0, reviews: 0, largest: { probes: 0, sessions: 0, reviews: 0 } };
  for (const entry of ledger.entries) {
    const pool = KINDS[entry.kind];
    out[pool] += entry.tokens ?? 0;
    out.largest[pool] = Math.max(out.largest[pool], entry.tokens ?? 0);
  }
  return out;
}

/**
 * Refuse a launch that could push its allowance past the limit.
 * `limits` = { sessions: 21e6, reviews: 4e6, firstReviewEstimate: 4e5, firstSessionEstimate }.
 */
function assertRoom(kind, limits, file = DEFAULT_FILE) {
  const pool = KINDS[kind];
  if (!pool) throw new Error('Unknown budget kind: ' + kind);
  const sums = totals(load(file));
  const firstEstimate = pool === 'reviews' ? limits.firstReviewEstimate : (limits.firstSessionEstimate ?? 0);
  const estimate = sums.largest[pool] || firstEstimate;
  const limit = limits[pool] ?? (pool === 'probes' ? Infinity : undefined);
  if (limit === undefined) throw new Error('No budget limit for ' + pool);
  if (sums[pool] + estimate > limit) {
    throw new Error(`Budget: ${pool} used ${sums[pool]} + estimate ${estimate} would pass ${limit}`);
  }
  return { used: sums[pool], estimate, limit };
}

/** Record one probe, session or review. `tokens` null means usage unknown (kept, counted as 0). */
function record(kind, id, tokens, source, file = DEFAULT_FILE) {
  if (!KINDS[kind]) throw new Error('Unknown budget kind: ' + kind);
  if (!/^[a-z0-9][a-z0-9._-]{0,120}$/i.test(id)) throw new Error('Invalid budget id: ' + id);
  if (tokens !== null && (!Number.isInteger(tokens) || tokens < 0)) throw new Error('Tokens must be a non-negative integer or null');
  const ledger = load(file);
  if (ledger.entries.some(entry => entry.id === id)) throw new Error('Budget entry already recorded: ' + id);
  atomicJson(file, { entries: [...ledger.entries, { kind, id, tokens, unknown: tokens === null, source, at: new Date().toISOString() }] });
}

module.exports = { load, totals, assertRoom, record, DEFAULT_FILE };
