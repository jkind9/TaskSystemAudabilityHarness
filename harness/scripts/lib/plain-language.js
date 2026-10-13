/**
 * Shared plain-language wordlist + scanner.
 *
 * Single source of truth for the banned-phrase list from
 * rules/communication-style.md. Consumed by:
 *   - scripts/hooks/plain-language-audit.js  (Stop, soft nudge on chat + docs)
 *   - scripts/hooks/plain-language-gate.js   (PreToolUse, blocks .md writes)
 * Edit the list HERE only — two drifting copies is exactly the failure this
 * file exists to prevent.
 *
 * High precision on purpose: single adjectives that are legitimate in
 * technical writing ("robust", "significant", "comprehensive") are OMITTED so
 * the block/nudge stays trustworthy and never gets ignored. Matched
 * case-insensitively with letter-boundary lookarounds (so apostrophes/spaces
 * inside a phrase are fine).
 */

const OFFENDERS = [
  // hedge prefaces
  'honestly', 'to be honest', 'frankly', 'let me be clear', 'the reality is',
  'the honest truth',
  // importance inflation
  "it's important to note", 'it is important to note', "it's worth noting",
  'worth noting', 'notably', 'crucially', 'fundamentally',
  // hollow openers
  'great question', "let's dive in", 'at its core', 'in essence',
  'essentially', 'simply put',
  // consultant-speak (inflected forms listed out — the boundary lookarounds
  // are exact-word on purpose, so "leverage" alone would miss "leveraging")
  'leverage', 'leverages', 'leveraged', 'leveraging',
  'utilize', 'utilizes', 'utilized', 'utilizing',
  'utilise', 'utilises', 'utilised', 'utilising',
  'facilitate', 'facilitates', 'facilitated', 'facilitating',
  'seamless', 'seamlessly', 'delve into', 'delve', 'delves', 'delved', 'delving',
  'navigate the complexities', 'myriad', 'plethora',
  // empty summaries
  'in conclusion', 'to summarize', 'to sum up',
  // contrast cliche
  "it's not just", "this isn't about",
];

function toRegex(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?<![A-Za-z])' + escaped + '(?![A-Za-z])', 'i');
}

const RULES = OFFENDERS.map((p) => ({ re: toRegex(p), label: p }));

/** Return the distinct offender labels found in text (empty array if clean). */
function scan(text) {
  if (!text) return [];
  const hits = new Set();
  for (const { re, label } of RULES) if (re.test(text)) hits.add(label);
  return [...hits];
}

module.exports = { OFFENDERS, RULES, scan, toRegex };
