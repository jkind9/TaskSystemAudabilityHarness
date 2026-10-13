#!/usr/bin/env node
// hyperparam-audit.js — cross-experiment hyperparameter consistency report (task 67).
// Usage: node ~/.claude/scripts/hyperparam-audit.js [rootDir] [--json]
//
// Walks rootDir (default: cwd) and collects hyperparameter declarations from:
//   - .py files: the module-level HYPERPARAMETERS = { ... } dict (best-effort
//     line parse; a multi-line value is recorded as its first line + "…")
//   - .json files: a top-level "hyperparameters" object (result/receipt files)
//
// Then reports, for every key seen in 2+ sources, whether the values agree.
// Divergent keys are listed with each distinct value and the files carrying it —
// a deviation from prior use is either a mistake or a decision needing a stated
// reason in the task's ## Hyperparameters table; this report is how you find out
// which, BEFORE the run. Read-only; always exits 0. --json for machine output.
//
// Skipped: .git, node_modules, __pycache__, venv dirs, build/dist, and any
// "archive" directory (superseded material is not precedent).

'use strict';
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'build', 'dist', 'archive', '.mypy_cache', '.pytest_cache']);
const PY_LIMIT = 2 * 1024 * 1024;
const JSON_LIMIT = 20 * 1024 * 1024;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const root = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());

// key -> Map(normalizedValue -> {display, sources: []})
const seen = new Map();
let sourceCount = 0;

function record(key, rawValue, source) {
  const display = String(rawValue).trim();
  const norm = display.toLowerCase().replace(/^["'(\[]+|["')\],]+$/g, '').replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim();
  if (!seen.has(key)) seen.set(key, new Map());
  const byVal = seen.get(key);
  if (!byVal.has(norm)) byVal.set(norm, { display, sources: [] });
  byVal.get(norm).sources.push(source);
}

// Best-effort extraction of the HYPERPARAMETERS dict body from Python source:
// brace-depth scan from the first "HYPERPARAMETERS" assignment.
function extractPyDict(text) {
  const m = text.match(/\bHYPERPARAMETERS\b[^=\n]*=\s*\{/);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    i++;
  }
  return text.slice(start, i - 1);
}

function harvestPy(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  if (!text.includes('HYPERPARAMETERS')) return;
  const body = extractPyDict(text);
  if (!body) return;
  sourceCount++;
  const rel = path.relative(root, file).replace(/\\/g, '/');
  for (const line of body.split('\n')) {
    const e = line.match(/^\s*["']([^"']+)["']\s*:\s*(.+?)\s*$/);
    if (!e) continue;
    let val = e[2].replace(/,\s*$/, '');
    // A value that opens more than it closes continues on later lines.
    const opens = (val.match(/[([{]/g) || []).length;
    const closes = (val.match(/[)\]}]/g) || []).length;
    if (opens > closes) val = val + ' …';
    record(e[1], val, rel);
  }
}

function harvestJson(file) {
  let text;
  try {
    if (fs.statSync(file).size > JSON_LIMIT) return;
    text = fs.readFileSync(file, 'utf8');
  } catch { return; }
  if (!text.includes('"hyperparameters"')) return;
  let obj;
  try { obj = JSON.parse(text); } catch { return; }
  const hp = obj && typeof obj === 'object' ? obj.hyperparameters : null;
  if (!hp || typeof hp !== 'object' || Array.isArray(hp)) return;
  sourceCount++;
  const rel = path.relative(root, file).replace(/\\/g, '/');
  for (const [k, v] of Object.entries(hp)) {
    record(k, typeof v === 'string' ? v : JSON.stringify(v), rel);
  }
}

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name.toLowerCase())) walk(full);
      continue;
    }
    if (!e.isFile()) continue;
    if (/\.py$/i.test(e.name)) {
      try { if (fs.statSync(full).size <= PY_LIMIT) harvestPy(full); } catch { /* skip */ }
    } else if (/\.json$/i.test(e.name)) {
      harvestJson(full);
    }
  }
}

walk(root);

const report = { root: root.replace(/\\/g, '/'), sources: sourceCount, consistent: [], divergent: [], singletons: [] };
for (const [key, byVal] of [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const values = [...byVal.values()];
  const total = values.reduce((n, v) => n + v.sources.length, 0);
  if (total < 2) { report.singletons.push(key); continue; }
  if (values.length === 1) { report.consistent.push({ key, value: values[0].display, sources: total }); continue; }
  report.divergent.push({
    key,
    values: values.map((v) => ({ value: v.display, sources: v.sources })),
  });
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('hyperparam-audit: ' + sourceCount + ' declaration source(s) under ' + report.root);
  if (sourceCount === 0) {
    console.log('  no HYPERPARAMETERS dicts or "hyperparameters" JSON objects found');
  }
  if (report.divergent.length) {
    console.log('\nDIVERGENT (same key, different values — each needs a stated reason or a fix):');
    for (const dRow of report.divergent) {
      console.log('  ' + dRow.key);
      for (const v of dRow.values) {
        console.log('    = ' + v.value.slice(0, 90));
        for (const s of v.sources) console.log('        ' + s);
      }
    }
  } else if (sourceCount > 0) {
    console.log('  no divergent keys');
  }
  if (report.consistent.length) {
    console.log('\nCONSISTENT (' + report.consistent.length + ' key(s) agreeing across sources):');
    for (const c of report.consistent) console.log('  ' + c.key + ' = ' + String(c.value).slice(0, 70) + '   [' + c.sources + ' sources]');
  }
  if (report.singletons.length) {
    console.log('\nSINGLE-SOURCE (no precedent to compare): ' + report.singletons.join(', '));
  }
}
process.exit(0);
