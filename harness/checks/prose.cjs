'use strict';
// Prose patterns a script can find reliably (FINDINGS.md item 5): the shared banned-phrase list,
// plus four patterns from blader/humanizer's catalogue of AI-sounding writing. Quoted text, code,
// URLs and headings are skipped, so naming a word as an example is not a hit. No single word
// proves text is generated, so this reports; it never refuses.
const path = require('node:path');
const { OFFENDERS, toRegex } = require(path.join(__dirname, '..', 'scripts', 'lib', 'plain-language.js'));

const APOS = "['’]";
const CONTRAST = [
  new RegExp('\\b(?:it' + APOS + '?s|it is|this is|that' + APOS + '?s)\\s+not\\s+(?:just\\s+|only\\s+|merely\\s+)?[^.;:!?\\n]{1,60}?[,;—–-]\\s*(?:it' + APOS + '?s|it is|but)\\b', 'gi'),
  new RegExp('\\b(?:this|it|that)\\s+isn' + APOS + 't\\s+[^.;:!?\\n]{1,60}?[,;—–-]\\s*(?:it' + APOS + '?s|it is|but)\\b', 'gi'),
  /(?:^|[.!?]\s+)Not\s+[^.;!?\n]{1,60}?,\s*but\b/g,
];
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** Remove what is not the writer's own prose: code, quotes, URLs, link targets, tables, headings. */
function ownProse(text) {
  return String(text || '')
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/"[^"\n]*"|“[^”\n]*”/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .split('\n').filter(line => !/^\s*(?:#{1,6}\s|\|)/.test(line)).join('\n');
}
const wordsOf = text => text.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
const sentencesOf = text => text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => wordsOf(s).length);
const paragraphsOf = text => text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

function wordListHits(text) {
  let masked = text;
  const hits = [];
  for (const phrase of [...OFFENDERS].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(toRegex(phrase).source, 'gi');
    for (const m of masked.matchAll(pattern)) hits.push({ pattern: 'word-list', text: m[0] });
    masked = masked.replace(pattern, m => ' '.repeat(m.length));
  }
  return hits;
}

function sameOpeningHits(paragraphs) {
  const hits = [];
  for (const paragraph of paragraphs.filter(p => !LIST_ITEM.test(p))) {
    let run = 0, last = '';
    for (const sentence of sentencesOf(paragraph.replace(/\s+/g, ' '))) {
      const first = wordsOf(sentence)[0].toLowerCase();
      run = first === last ? run + 1 : 1;
      last = first;
      if (run === 3) hits.push({ pattern: 'same-opening', text: first });
    }
  }
  return hits;
}

/** A short final paragraph (2-6 words, one sentence, no digits) right after one of 8+ words. */
function oneLineCloserHits(paragraphs) {
  if (paragraphs.length < 2) return [];
  const last = paragraphs[paragraphs.length - 1], before = paragraphs[paragraphs.length - 2];
  const words = wordsOf(last).length;
  const closer = words >= 2 && words <= 6 && sentencesOf(last).length === 1 && /[.!]$/.test(last) && !/\d/.test(last) && !LIST_ITEM.test(last);
  return closer && wordsOf(before).length >= 8 ? [{ pattern: 'one-line-closer', text: last }] : [];
}

function boldLabelHits(text) {
  const hits = [];
  let list = [];
  const flush = () => { if (list.length >= 3 && list.every(item => /^\s*(?:[-*+]|\d+[.)])\s+\*\*[^*]+\*\*/.test(item))) hits.push({ pattern: 'bold-labels', text: list.length + ' items' }); list = []; };
  for (const line of text.split('\n')) LIST_ITEM.test(line) ? list.push(line) : flush();
  flush();
  return hits;
}

/** Hits per pattern for one text (a task record, the docs a task changed). Sections are judged apart. */
function prosePatterns(text) {
  const raw = String(text || '').replace(/```[\s\S]*?(?:```|$)/g, ' ');
  const sections = raw.split(/^#{1,6}\s.*$/m);
  const prose = ownProse(raw);
  const hits = [...wordListHits(prose), ...CONTRAST.flatMap(re => [...prose.matchAll(re)].map(m => ({ pattern: 'contrast', text: m[0].trim() })))];
  for (const section of sections) {
    const paragraphs = paragraphsOf(ownProse(section));
    hits.push(...sameOpeningHits(paragraphs), ...oneLineCloserHits(paragraphs));
  }
  hits.push(...boldLabelHits(raw));
  const words = wordsOf(prose).length;
  return { words, hits, per1000: words ? Math.round((hits.length / words) * 100000) / 100 : null };
}

module.exports = { prosePatterns, ownProse };
