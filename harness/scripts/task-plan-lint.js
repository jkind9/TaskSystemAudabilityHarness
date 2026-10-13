#!/usr/bin/env node
// task-plan-lint.js — deterministic plan-level checks on a task file, run BEFORE
// implementation (companion to `task.js lint`, which checks board invariants).
// Usage: node ~/.claude/scripts/task-plan-lint.js <task-file.md> [more.md ...]
// Exit 1 on any ERROR; warnings alone exit 0. This is a CLI, not a hook — it does
// not fail open; a bad input is reported and counted.
//
// Checks (deterministic only — semantic review is the plan-reviewer agent's job):
//   E1  in_progress task with an empty/missing files: list       (open task -> warning)
//   E2  verification_test names a real path not matched by files:
//   E3  no frontmatter / unreadable file
//   E4  HIGH/CRITICAL task with no filled "## Invariants and recovery" section and no
//       `invariants n/a: <reason>` line (error when in_progress, warning otherwise).
//       "Filled" = past the template scaffold AND carries at least one file:line.
//   E5  ## How has no reuse-evidence table row with a real file:line and no
//       "nothing comparable" row (error only for in_progress HIGH/CRITICAL; warning
//       otherwise — the template's own `_file.py:123_` placeholder does not count).
//   E6  experiment task (type: experiment, or files: touching an experiment dir)
//       with no filled "## Hyperparameters" table (name | value | source) and no
//       `hyperparameters n/a: <reason>` line (error when in_progress, warning otherwise)
//   E7  hyperparameter row whose source cell has no stamp: `confirmed YYYY-MM-DD`,
//       `inherited <ref>`, or `n/a`; a `deviates` row must also carry `confirmed`
//   W1  code-like path in ## How prose (not a table row) that no files:/docs: glob
//       matches — table rows are exempt because reuse-evidence rows deliberately
//       cite files the task does not touch.
//   W2  vague adjective (fast/robust/better/...) on a number-free line in
//       ## Verification or baseline_metric.target — spec-kit-style ambiguity check.
//   W3  baseline_metric parsed as a real nested block (the flat frontmatter parsers
//       cannot see it): baseline_value with no digit, or an entirely empty block on
//       a HIGH/CRITICAL task.
//   W4  HIGH/CRITICAL task with no plan_reviewed: stamp (the literal "null" the
//       template ships counts as unstamped). Stamp with: task.js review <id> PASS|FAIL

'use strict';
const fs = require('fs');

function readNormalized(p) {
  let s = fs.readFileSync(p, 'utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n/g, '\n');
}

// Same semantics as the harness hooks (build-spec §4.5): case-insensitive,
// ** crosses '/', * stays within a segment.
function globMatch(glob, path) {
  const g = String(glob).trim().replace(/\\/g, '/');
  const p = String(path).trim().replace(/\\/g, '/');
  if (!g || !p) return false;
  if (g.toLowerCase() === p.toLowerCase()) return true;
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        re += '.*';
        i++;
        if (g[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else re += /[-/\\^$+?.()|[\]{}]/.test(c) ? '\\' + c : c;
  }
  try {
    return new RegExp('^' + re + '$', 'i').test(p);
  } catch {
    return false;
  }
}

// Frontmatter list parser (build-spec §4.6): inline [a, b] or block "- a" form.
function parseListKey(head, key) {
  const inline = head.match(new RegExp('^' + key + ':\\s*\\[([^\\]]*)\\]', 'm'));
  if (inline) {
    const list = inline[1].split(',').map(clean).filter(Boolean);
    return { present: true, list };
  }
  const lines = head.split('\n');
  const start = lines.findIndex((l) => new RegExp('^' + key + ':\\s*$').test(l));
  if (start === -1) return { present: false, list: [] };
  const list = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*$/.test(l)) continue;
    const m = l.match(/^\s+-\s+(.+)$/);
    if (!m) break;
    const v = clean(m[1]);
    if (v) list.push(v);
  }
  return { present: true, list };
}

function clean(v) {
  return v.replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
}

function scalar(head, key) {
  const m = head.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'));
  return m ? clean(m[1]) : '';
}

function section(body, name) {
  for (const part of body.split(/^(?=##\s)/m)) {
    if (new RegExp('^##\\s+' + name + '\\b', 'i').test(part)) return part;
  }
  return '';
}

// Nested one-level block map (baseline_metric:) — the flat scalar() cannot see indented keys.
function parseBlockMap(head, key) {
  const lines = head.split('\n');
  const start = lines.findIndex((l) => new RegExp('^' + key + ':\\s*$').test(l));
  if (start === -1) return { present: false, map: {} };
  const map = {};
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s+([A-Za-z_]+):\s*(.*)$/);
    if (!m) break;
    map[m[1]] = clean(m[2]);
  }
  return { present: true, map };
}

const VAGUE_RE = /\b(fast(er)?|slow(er)?|quick(ly)?|scalable|robust|reliable|efficient(ly)?|intuitive|seamless|better|improved?|significant(ly)?)\b/i;

const PATH_RE = /[A-Za-z0-9_.~-]+(?:\/[A-Za-z0-9_.-]+)+\.(?:py|js|ts|tsx|jsx|go|rs|java|kt|cpp|c|h|hpp|cs|rb|php|swift|dart|yaml|yml|json|sh|ps1)\b/g;

function lintFile(path) {
  const errors = [];
  const warnings = [];
  let text;
  try {
    text = readNormalized(path);
  } catch (e) {
    return { errors: ['E3 cannot read file: ' + e.message], warnings };
  }
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fm) return { errors: ['E3 no YAML frontmatter'], warnings };
  const head = fm[1];
  const body = fm[2];

  const status = scalar(head, 'status');
  const files = parseListKey(head, 'files');
  const docs = parseListKey(head, 'docs');
  const vtest = scalar(head, 'verification_test');

  if (!files.present || files.list.length === 0) {
    const msg = 'files: list is empty — the plan declares no code scope';
    if (status === 'in_progress') errors.push('E1 ' + msg);
    else warnings.push('E1(open) ' + msg);
  }

  const isRealPath = vtest && !/\s/.test(vtest) && (vtest.includes('/') || /\.\w+$/.test(vtest));
  if (isRealPath && files.list.length > 0 && !files.list.some((g) => globMatch(g, vtest))) {
    errors.push(`E2 verification_test "${vtest}" is not matched by any files: glob — the contract test is out of the task's own scope`);
  }

  const how = section(body, 'How');
  const scopeGlobs = files.list.concat(docs.list);
  const seen = new Set();
  for (const line of how.split('\n')) {
    if (/^\s*\|/.test(line)) continue; // table rows: evidence cites out-of-scope files on purpose
    for (const m of line.matchAll(PATH_RE)) {
      const p = m[0];
      if (seen.has(p)) continue;
      seen.add(p);
      if (p.startsWith('~') || /^[A-Za-z]:/.test(p) || p.includes('.claude/')) continue; // harness refs, not repo scope
      if (!scopeGlobs.some((g) => globMatch(g, p))) {
        warnings.push(`W1 "${p}" named in ## How prose but matched by no files:/docs: glob — add it to scope or move the mention into an evidence table row`);
      }
    }
  }

  const priority = scalar(head, 'priority').toUpperCase();
  const isHigh = /^(HIGH|CRITICAL)/.test(priority);

  // E4 — invariants coverage on HIGH/CRITICAL. "Filled" = past the template scaffold
  // (its placeholder row is the tell) AND at least one file:line in the section.
  const inv = section(body, 'Invariants and recovery');
  const invEscape = /^[ \t>*_|#-]*invariants\s+n\/?a\s*:\s*\S/im.test(body);
  const invFilled = !!inv && !/_each datum\/state that crosses a boundary_/.test(inv) && /:\d+/.test(inv);
  if (isHigh && !invEscape && !invFilled) {
    const msg = 'HIGH/CRITICAL task has no filled "## Invariants and recovery" section and no `invariants n/a: <reason>` line';
    if (status === 'in_progress') errors.push('E4 ' + msg);
    else warnings.push('E4(open) ' + msg);
  }

  // E5 — reuse-evidence: at least one table row in ## How carrying a real file:line
  // (the template placeholder `_file.py:123_` does not count), or a "nothing comparable" row.
  const hasEvidenceRow = how.split('\n').some(
    (l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l) && /[\w.~\\/-]+:\d+/.test(l) && !/_file\.py:123_/.test(l)
  );
  const noneRow = /nothing comparable/i.test(how);
  if (!hasEvidenceRow && !noneRow) {
    const msg = '## How has no reuse-evidence table row with a real file:line and no "nothing comparable" row — trace before you build';
    if (isHigh && status === 'in_progress') errors.push('E5 ' + msg);
    else warnings.push('E5' + (isHigh ? '(open)' : '') + ' ' + msg);
  }

  // E6/E7 — hyperparameter declaration on experiment tasks (task 67). An experiment
  // task = type: experiment, or any files: glob whose path contains "experiment".
  // E6: no ## Hyperparameters section with at least one filled row, and no
  //     `hyperparameters n/a: <reason>` escape line.
  // E7: a filled row whose source cell carries no stamp — recognized stamps are
  //     `confirmed YYYY-MM-DD`, `inherited <ref>`, `n/a`; a `deviates` row must
  //     ALSO carry `confirmed` (a deviation from prior use needs a human ruling).
  // Both are errors when in_progress, warnings otherwise (same gating as E1/E4/E5).
  const type = scalar(head, 'type').toLowerCase();
  const isExperiment = type === 'experiment' || files.list.some((g) => /experiment/i.test(g));
  if (isExperiment) {
    const hp = section(body, 'Hyperparameters');
    const hpEscape = /^[ \t>*_|#-]*hyperparameters\s+n\/?a\s*:\s*\S/im.test(body);
    const rows = hp
      .split('\n')
      .filter((l) => /^\s*\|/.test(l))
      .filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))                    // separator
      .filter((l) => !/\|\s*name\s*\|\s*value\s*\|/i.test(l))            // header
      .filter((l) => !/_every tunable value_/.test(l));                  // template placeholder
    const push = (code, msg) => {
      if (status === 'in_progress') errors.push(code + ' ' + msg);
      else warnings.push(code + '(open) ' + msg);
    };
    if (!hpEscape && rows.length === 0) {
      push('E6', 'experiment task has no filled "## Hyperparameters" table and no `hyperparameters n/a: <reason>` line — every tunable value needs a row (name | value | source) before the run');
    }
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      const src = cells[cells.length - 1] || '';
      const stamped = /confirmed\s+\d{4}-\d{2}-\d{2}/i.test(src) || /\binherited\b/i.test(src) || /\bn\/?a\b/i.test(src);
      const deviatesUnruled = /\bdeviates\b/i.test(src) && !/\bconfirmed\b/i.test(src);
      if (!stamped || deviatesUnruled) {
        push('E7', 'hyperparameter row has no source stamp (confirmed <date> / inherited <ref> / n/a; deviates needs confirmed too): "' + row.trim().slice(0, 80) + '"');
      }
    }
  }

  // W2 — vague, number-free acceptance criteria (spec-kit ambiguity check), capped at 3.
  let vague = 0;
  for (const line of section(body, 'Verification').split('\n')) {
    if (vague >= 3) break;
    if (VAGUE_RE.test(line) && !/\d/.test(line)) {
      warnings.push('W2 vague criterion with no number in ## Verification: "' + line.trim().slice(0, 70) + '"');
      vague++;
    }
  }

  // W3 — baseline_metric read as a real nested block.
  const bm = parseBlockMap(head, 'baseline_metric');
  if (bm.present) {
    const bv = bm.map.baseline_value || '';
    const tgt = bm.map.target || '';
    if (bv && !/\d/.test(bv))
      warnings.push('W3 baseline_metric.baseline_value has no digit — the rule is "a number with units": "' + bv.slice(0, 60) + '"');
    if (tgt && VAGUE_RE.test(tgt) && !/\d/.test(tgt))
      warnings.push('W2 baseline_metric.target is vague with no number: "' + tgt.slice(0, 60) + '"');
    if (isHigh && !bv && !tgt && !bm.map.source && !bm.map.field)
      warnings.push('W3 baseline_metric is entirely empty on a HIGH/CRITICAL task — name the motivating symptom and its number');
  }

  // W4 — plan-review stamp on HIGH/CRITICAL ("null" = the template default = unstamped).
  const reviewed = scalar(head, 'plan_reviewed');
  if (isHigh && (!reviewed || reviewed === 'null')) {
    warnings.push('W4 HIGH/CRITICAL task has no plan_reviewed: stamp — run task-plan-lint + the plan-reviewer agent, then: task.js review <id> PASS|FAIL');
  }

  return { errors, warnings };
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node task-plan-lint.js <task-file.md> [more.md ...]');
  process.exit(1);
}
let failed = false;
for (const t of targets) {
  const { errors, warnings } = lintFile(t);
  if (errors.length || warnings.length) {
    console.log(t);
    for (const e of errors) console.log('  ERROR ' + e);
    for (const w of warnings) console.log('  warn  ' + w);
  } else {
    console.log(t + '\n  ok');
  }
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
