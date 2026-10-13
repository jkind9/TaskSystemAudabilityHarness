#!/usr/bin/env node

/**
 * Stop Hook: Plain-language audit for human-facing text.
 *
 * Runs at the end of each turn and scans the two surfaces a HUMAN reads for the
 * AI-tells / consultant-speak that rules/communication-style.md bans:
 *   1. the assistant's final chat message (the reply the user actually reads);
 *   2. lines ADDED this session to human-readable docs (README*.md and other
 *      prose .md) — task files, plans, changelogs and code are excluded;
 *   3. the "## In plain English" section of in_progress task files — the ONE
 *      task-file surface that must read plain (the rest of a task file is an
 *      engineering record and stays exempt). Read directly from open/ because
 *      task_list/ is often gitignored and invisible to git diff.
 *
 * It emits a soft, NON-BLOCKING warning naming the flagged phrases so the next
 * message can be rewritten or the doc edited. It is deliberately non-blocking
 * (exit 0, warn on stderr, echo stdin): a chat reply is already sent when Stop
 * fires and cannot be un-sent, so a hard block would only trap. Same soft-nudge
 * shape as check-console-log.js.
 *
 * Scope is honest: this catches KNOWN verbal tics only. It cannot judge novel
 * coined shorthand or unglossed domain jargon — that stays on the rule + a
 * self-review habit, and the warning says so.
 *
 * Cross-platform (Windows, macOS, Linux).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const { readFile, isGitRepo } = require('../lib/utils');
// Wordlist + scanner are shared with plain-language-gate.js (PreToolUse,
// blocking) — edit the list in ../lib/plain-language.js, not here.
const { scan } = require('../lib/plain-language');

const MAX_STDIN = 5 * 1024 * 1024;

// Last assistant message text from the session transcript (Claude Code JSONL).
function lastAssistantText(transcriptPath) {
  const content = readFile(transcriptPath);
  if (!content) return '';
  const lines = content.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const role = entry.type || entry.role || entry.message?.role;
    if (role !== 'assistant') continue;
    const c = entry.message?.content ?? entry.content;
    const text =
      typeof c === 'string'
        ? c
        : Array.isArray(c)
        ? c
            .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
            .map((b) => b.text || '')
            .join('\n')
        : '';
    if (text.trim()) return text;
  }
  return '';
}

// Lines added this session to human-readable docs (README + prose .md only).
function addedDocLines() {
  if (!isGitRepo()) return '';
  let diff = '';
  try {
    diff = execSync('git diff HEAD --unified=0', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return '';
  }
  const added = [];
  let keep = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '');
      keep =
        /\.md$/i.test(path) &&
        !/task_list\//.test(path) &&
        !/docs\/tasks\//.test(path) &&
        !/\.claude[/\\]plans[/\\]/.test(path) &&
        !/changelog/i.test(path);
      continue;
    }
    if (/^(---|@@|diff |index |new file|deleted file|rename )/.test(line)) continue;
    if (keep && line.startsWith('+')) added.push(line.slice(1));
  }
  return added.join('\n');
}

// Jargon tells for the plain section ONLY. High precision: each one is a shape that
// plain prose never needs, not a vocabulary judgement.
const JARGON_TELLS = [
  { re: /`[^`]+`/, label: 'backticked identifier' },
  { re: /\b\w+\.(py|js|ts|tsx|md|json|ya?ml|csv|ipynb)\b/i, label: 'file path' },
  { re: /[§→≥≤×λσΔ]/, label: 'math/section symbol' },
];

// Scan the "## In plain English" section of each in_progress task file.
// Returns [{file, hits:[...]}]; never throws.
function plainSectionHits() {
  const out = [];
  for (const dir of ['task_list/open', 'docs/tasks/open']) {
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      let body = '';
      try { body = fs.readFileSync(dir + '/' + f, 'utf8'); } catch { continue; }
      if (!/^\s*status:\s*in_progress/m.test(body.slice(0, 2000))) continue;
      const lines = body.split('\n');
      const i = lines.findIndex((l) => /^##\s+in plain english\b/i.test(l));
      if (i === -1) continue; // absence is the completion gate's job, not this nudge's
      const content = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^##\s/.test(lines[j])) break;
        content.push(lines[j]);
      }
      const text = content.join('\n');
      const hits = scan(text);
      for (const { re, label } of JARGON_TELLS) if (re.test(text)) hits.push(label);
      const acronyms = new Set(text.match(/\b[A-Z]{3,}\b/g) || []);
      if (acronyms.size >= 3) hits.push('acronym-dense (' + [...acronyms].join(', ') + ')');
      if (hits.length) out.push({ file: dir + '/' + f, hits });
    }
  }
  return out;
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  let transcriptPath = '';
  try {
    transcriptPath = JSON.parse(data).transcript_path || '';
  } catch {}

  let chatHits = [];
  let docHits = [];
  let taskHits = [];
  try {
    chatHits = scan(transcriptPath ? lastAssistantText(transcriptPath) : '');
    docHits = scan(addedDocLines());
    taskHits = plainSectionHits();
  } catch {
    // never let the audit break the Stop chain
  }

  if (chatHits.length || docHits.length || taskHits.length) {
    console.error(
      '[Hook] PLAIN-LANGUAGE: human-facing text has flagged phrases (rules/communication-style.md).'
    );
    if (chatHits.length)
      console.error('[Hook]   chat reply: ' + chatHits.join(', '));
    if (docHits.length)
      console.error('[Hook]   added doc lines: ' + docHits.join(', '));
    for (const t of taskHits)
      console.error(
        '[Hook]   "In plain English" section of ' + t.file + ': ' + t.hits.join(', ') +
          ' — that section is for a reader with no context; move the technical detail to What/How.'
      );
    console.error(
      '[Hook]   Rewrite plainly (next message / edit the doc). Also self-check ' +
        'for invented shorthand + unglossed jargon — this hook cannot catch new coinages.'
    );
  }

  console.log(data); // echo stdin, exit 0 — non-blocking soft nudge
});
