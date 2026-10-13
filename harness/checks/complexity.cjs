'use strict';
// Complexity share: of all the cyclomatic complexity in the touched files' functions, the share
// held by functions scoring over 10 (the "erosion" measure from SlopCodeBench, arXiv 2603.24755).
// Python is scored exactly by complexity.py (stdlib ast). JavaScript and TypeScript are scored by
// an approximate count of branch keywords and operators per function, since Node has no parser.
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const LIMIT = 10;
const PYTHON = /\.py$/i;
const SCRIPT = /\.(?:js|cjs|mjs|jsx|ts|tsx)$/i;
const DECISIONS = /\b(?:if|for|while|case|catch)\b|&&|\|\||\?\?|\?(?![.?])/g;
const STARTS = [
  /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g,
  /\b([A-Za-z_$][\w$]*)\s*[=:]\s*(?:async\s+)?(?:function\b[^(]*\([^)]*\)|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)\s*\{/g,
  /^[ \t]*(?:async\s+|static\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm,
];
const NOT_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with']);

/** Strings and comments blanked to spaces, so offsets stay the same and their text is not counted. */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, m => m.replace(/[^\n]/g, ' '));
}

function bodyEnd(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return i;
  }
  return code.length;
}

function scriptFunctions(source) {
  const code = codeOnly(source);
  const found = new Map();
  for (const start of STARTS) {
    for (const m of code.matchAll(start)) {
      const name = m[1];
      const open = code.indexOf('{', m.index + m[0].length - 1);
      if (NOT_NAMES.has(name) || open < 0 || found.has(open)) continue;
      const body = code.slice(open, bodyEnd(code, open) + 1);
      const line = code.slice(0, m.index).split('\n').length;
      found.set(open, { name, line, cc: 1 + (body.match(DECISIONS) || []).length });
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

/** Python source with strings and comments blanked to spaces (line breaks kept). */
function pythonCodeOnly(source) {
  let out = '', i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '#') { while (i < source.length && source[i] !== '\n') { out += ' '; i++; } continue; }
    if (c !== '"' && c !== "'") { out += c; i++; continue; }
    const quote = source.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
    out += ' '.repeat(quote.length); i += quote.length;
    while (i < source.length && !source.startsWith(quote, i) && (quote.length === 3 || source[i] !== '\n')) {
      const step = source[i] === '\\' ? 2 : 1;
      out += source.slice(i, i + step).replace(/[^\n]/g, ' '); i += step;
    }
    out += ' '.repeat(Math.min(quote.length, source.length - i)); i += quote.length;
  }
  return out;
}

const PY_DECISIONS = /\b(?:if|elif|for|while|except|and|or)\b/g;
/**
 * Approximate McCabe count for Python when the interpreter cannot start (inside Codex's sandbox no
 * program can be started): the decision points complexity.py counts, found as keywords outside
 * strings and comments, with nested functions and classes scored apart. Lambdas count toward the
 * function that holds them, which complexity.py does not do.
 */
function pythonApproximate(source) {
  const lines = pythonCodeOnly(source).split('\n');
  const indent = line => line.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
  const blocks = [];
  lines.forEach((line, start) => {
    const m = line.match(/^[ \t]*(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/);
    if (!m) return;
    let end = start + 1;
    while (end < lines.length && (!lines[end].trim() || indent(lines[end]) > indent(line))) end++;
    blocks.push({ kind: m[1], name: m[2], start, end });
  });
  return blocks.filter(b => b.kind === 'def').map(b => {
    const nested = blocks.filter(c => c.start > b.start && c.start < b.end);
    let cc = 1;
    for (let i = b.start + 1; i < b.end; i++) {
      if (nested.some(c => i >= c.start && i < c.end)) continue;
      cc += (lines[i].match(PY_DECISIONS) || []).length + (/^\s*case\b[^:]*:\s*$/.test(lines[i]) ? 1 : 0);
    }
    return { name: b.name, line: b.start + 1, cc };
  });
}

function pythonFunctions(files, pythonExe) {
  if (!Object.keys(files).length) return { method: null, functions: {} };
  const run = spawnSync(pythonExe, [path.join(__dirname, 'complexity.py')], { input: JSON.stringify({ files }), encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (run.error) return { method: 'approximate (python could not start)', functions: Object.fromEntries(Object.entries(files).map(([name, source]) => [name, pythonApproximate(source)])) };
  if (run.status !== 0) return { method: 'python ast', reason: 'python could not score: ' + run.stderr.trim().split('\n').pop(), functions: {} };
  return { method: 'python ast', functions: JSON.parse(run.stdout) };
}

/** files: { path: source }. Returns { ok, reason, method, functions: { path: [{name, line, cc}] | null } }. */
function functionComplexity(files, { pythonExe = 'python' } = {}) {
  const python = Object.fromEntries(Object.entries(files).filter(([name]) => PYTHON.test(name)));
  const scored = pythonFunctions(python, pythonExe);
  const functions = { ...scored.functions };
  for (const [name, source] of Object.entries(files)) if (SCRIPT.test(name)) functions[name] = scriptFunctions(source);
  return { ok: !scored.reason, reason: scored.reason, method: scored.method, functions };
}

/** Share of complexity held by functions over LIMIT; null when there are no functions. */
function complexityShare(functions) {
  const all = Object.values(functions).filter(Boolean).flat();
  const total = all.reduce((sum, f) => sum + f.cc, 0);
  if (!total) return null;
  return all.filter(f => f.cc > LIMIT).reduce((sum, f) => sum + f.cc, 0) / total;
}

module.exports = { functionComplexity, complexityShare, scriptFunctions, LIMIT, PYTHON, SCRIPT };
