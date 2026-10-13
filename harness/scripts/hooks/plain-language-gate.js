#!/usr/bin/env node

/**
 * PreToolUse Hook: Plain-language gate for human-facing markdown — BLOCKING.
 *
 * Fires on Write/Edit of .md files and blocks (exit 2) when the text being
 * ADDED contains a banned phrase from rules/communication-style.md (the shared
 * list in ../lib/plain-language.js). The block reason names the phrases, so
 * the model rewrites and retries — unlike the Stop-hook audit, this catches
 * jargon BEFORE it lands in a file, and it also covers subagents (hooks fire
 * on their tool calls; output styles and CLAUDE.md do not reach them).
 *
 * Only NEW text blocks. An offender that already exists in the file (Edit
 * old_string, or the current content of a file being overwritten) never
 * blocks — editing a legacy file must not trap.
 *
 * Exempt paths (engineering records, or files that quote the banned list):
 *   task_list/  docs/tasks/  anything under .claude/  changelog  archive/
 *   node_modules/
 *
 * Fail open: any internal error passes the tool through untouched.
 */

const fs = require('fs');
const { scan } = require('../lib/plain-language');

const MAX_STDIN = 5 * 1024 * 1024;

function isExempt(p) {
  const np = p.replace(/\\/g, '/');
  return (
    !/\.md$/i.test(np) ||
    /(^|\/)task_list\//i.test(np) ||
    /(^|\/)docs\/tasks\//i.test(np) ||
    /(^|\/)\.claude\//i.test(np) ||
    /changelog/i.test(np) ||
    /(^|\/)archive\//i.test(np) ||
    /(^|\/)node_modules\//i.test(np)
  );
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  let hits = [];
  try {
    const inp = JSON.parse(data);
    const ti = inp.tool_input || {};
    const target = ti.file_path || '';
    if (target && !isExempt(target)) {
      // New text vs. pre-existing text: only phrases the write INTRODUCES block.
      let added = '';
      let existing = '';
      if (typeof ti.new_string === 'string') {
        added = ti.new_string;
        existing = typeof ti.old_string === 'string' ? ti.old_string : '';
      } else if (typeof ti.content === 'string') {
        added = ti.content;
        try {
          existing = fs.readFileSync(target, 'utf8');
        } catch {
          existing = ''; // new file — everything is new text
        }
      }
      const before = new Set(scan(existing));
      hits = scan(added).filter((h) => !before.has(h));
    }
  } catch {
    hits = []; // fail open
  }

  if (hits.length) {
    console.error(
      '[Hook] PLAIN-LANGUAGE GATE: this write adds banned phrases to a human-facing doc ' +
        '(rules/communication-style.md): ' + hits.join(', ')
    );
    console.error(
      '[Hook] Rewrite those phrases in plain words and retry the write. ' +
        'Say the fact once, plainly — no hedge prefaces, importance-inflation, or consultant-speak.'
    );
    process.exit(2);
  }

  console.log(data);
  process.exit(0);
});
