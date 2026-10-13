'use strict';
// Cost measure: fresh input, cached input, output and reasoning tokens and elapsed time per session,
// summed per run together with every reviewer call made about that run. Unknown usage stays unknown
// (null); it is never counted as zero.

/** One session's usage (task 02 result.json). Total = all input (fresh + cached) + output, as in the ledger. */
function sessionCost(result) {
  if (result?.status === 'not_run') return { freshInput: 0, cachedInput: 0, output: 0, reasoning: 0, total: 0, elapsedSeconds: 0 };
  const usage = result?.usage;
  const known = usage && Number.isInteger(usage.input_tokens) && Number.isInteger(usage.output_tokens);
  const cached = known ? usage.cached_input_tokens ?? 0 : null;
  return {
    freshInput: known ? usage.input_tokens - cached : null,
    cachedInput: cached,
    output: known ? usage.output_tokens : null,
    reasoning: known ? usage.reasoning_output_tokens ?? null : null,
    total: known ? usage.input_tokens + usage.output_tokens : null,
    elapsedSeconds: result?.elapsedSeconds ?? null
  };
}

const sumKnown = values => (values.some(v => v === null || v === undefined) ? null : values.reduce((a, b) => a + b, 0));

/**
 * Per run: sessions summed; reviewer tokens (all review results about this run) reported beside them.
 * `reviewResults` null means the review answers are not available yet: reviewer tokens are unknown.
 */
function runCost(sessionCosts, reviewResults) {
  const field = name => sumKnown(sessionCosts.map(c => c[name]));
  return {
    freshInput: field('freshInput'), cachedInput: field('cachedInput'), output: field('output'), reasoning: field('reasoning'),
    total: field('total'), elapsedSeconds: field('elapsedSeconds'),
    reviewTokens: reviewResults ? sumKnown(reviewResults.map(r => r.totalTokens)) : null, sessions: sessionCosts.length
  };
}

function measure(evidence, reviewResults = null) {
  const sessions = evidence.sessions.map(s => sessionCost(s));
  return { sessions, run: runCost(sessions, reviewResults) };
}

module.exports = { sessionCost, runCost, measure };
