'use strict';
// Plain-language measure: prose-pattern hits per 1,000 words, from the harness's own checker at the pinned
// commit (checks/prose.cjs: the shared word list plus four humanizer patterns; quoted text and code are
// skipped). It replaced the banned-phrase count, which was 0 for every pilot session. Flesch reading ease and
// average sentence length are kept. Applied to the end-of-session messages and to documentation lines added.

/** Prose only: no fenced code, inline code, URLs, Markdown table rules, heading or list markers. */
function prose(text) {
  return String(text || '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .split('\n').map(line => line.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '').replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/, '')).join('\n');
}

const WORD = /[A-Za-z][A-Za-z'’-]*/g;
const wordsOf = text => text.match(WORD) || [];
const wordCount = text => wordsOf(text).length;

/** Sentences: split at . ! ? before a space or line end; each non-empty line also ends a sentence (lists). */
function sentencesOf(text) {
  return text.split('\n').flatMap(line => line.split(/[.!?]+(?=\s|$)/)).filter(part => wordCount(part) > 0);
}

/** Vowel-group syllable estimate (the usual heuristic behind Flesch scores; exact counts need a dictionary). */
function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length);
}

const round = (value, places = 2) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places);

/** All plain-language numbers for one text; checks from harness_checks.loadChecks. Unknown (null) when there are no words, never 0. */
function measureText(text, checks) {
  const body = prose(text);
  const words = wordsOf(body);
  const sentences = sentencesOf(body).length;
  const found = checks.prosePatterns(String(text || ''));
  const byPattern = found.hits.reduce((acc, hit) => ({ ...acc, [hit.pattern]: (acc[hit.pattern] || 0) + 1 }), {});
  const patterns = { patternHits: found.hits.length, patternsPer1000: found.words ? round((found.hits.length / found.words) * 1000) : null, byPattern };
  if (!words.length) return { words: 0, sentences: 0, avgSentenceLength: null, flesch: null, ...patterns };
  const syllableTotal = words.reduce((sum, w) => sum + syllables(w), 0);
  const perSentence = words.length / Math.max(1, sentences);
  return {
    words: words.length, sentences, avgSentenceLength: round(perSentence),
    flesch: round(206.835 - 1.015 * perSentence - 84.6 * (syllableTotal / words.length), 1),
    ...patterns
  };
}

const DOC_FILE = /\.(md|markdown|rst|txt)$/i;
const TASK_RECORD = /(^|\/)(task_list|docs\/tasks)\//;

/**
 * One run: the end-of-session messages, and added documentation lines split into ordinary docs and
 * task records (task records are engineering logs; only their plain-English summary is held to the rule).
 */
function measureRun(evidence, diffFiles, checks) {
  const docLines = kind => diffFiles.filter(f => DOC_FILE.test(f.path) && f.status !== 'deleted' && (kind === 'task' ? TASK_RECORD.test(f.path) : !TASK_RECORD.test(f.path)))
    .flatMap(f => f.addedRuns.flat());
  return {
    checker: { commit: checks.commit, sha256: checks.sha256 },
    messages: measureText(evidence.sessions.map(s => s.final).join('\n\n'), checks),
    docs: measureText(docLines('docs').join('\n'), checks),
    taskRecords: measureText(docLines('task').join('\n'), checks)
  };
}

module.exports = { prose, wordCount, sentencesOf, syllables, measureText, measureRun, DOC_FILE, TASK_RECORD };
