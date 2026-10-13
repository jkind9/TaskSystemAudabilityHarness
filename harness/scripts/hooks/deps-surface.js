// Stop hook (task-management system). Non-blocking DEPENDENTS reminder.
// When .py files changed this session, list the tracked modules that import each one, so
// callers (and their docs) that may need a matching update are surfaced instead of forgotten.
//
// Matching favours PRECISION (a noisy reminder is an ignored reminder):
//   - absolute import of the module's dotted path  (import a.b.c / from a.b.c import ...)
//   - parent-package import of the name            (from a.b import c)
//   - bare-name / relative import (from . import c / from .c import ...) ONLY when the module
//     name is unique in the repo and >=5 chars (avoids stdlib-shadow + same-name-file collisions).
// Foundational hubs (> NOISE_CAP importers, e.g. a top-level package __init__) are summarised, not dumped.
// Always exits 0 and passes stdin through; fails open on any error. See ~/.claude/rules/task-management.md.
const { execSync, execFileSync } = require('child_process');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try { execSync('git rev-parse --git-dir', { stdio: 'pipe' }); }
  catch { console.log(d); process.exit(0); }
  try {
    const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const changed = execSync('git status --porcelain -uall', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .split('\n').map(s => s.slice(3).trim()).filter(Boolean)
      .map(s => s.includes(' -> ') ? s.split(' -> ')[1] : s)
      .map(s => s.replace(/(^")|("$)/g, ''))
      .map(s => s.replace(/\\/g, '/'));
    const SKIP = /(^|\/)(24h_env|env|venv|\.venv|site-packages|__pycache__|node_modules)\//i;
    const py = changed.filter(f => /\.py$/.test(f) && !SKIP.test(f) && !/backup/i.test(f));
    if (py.length === 0) { console.log(d); process.exit(0); }

    // Module name (last importable segment) -> count, to detect ambiguous / collision-prone names.
    const nameCount = {};
    let tracked = [];
    try {
      tracked = execFileSync('git', ['ls-files', '--', '*.py', ':(exclude)*backup*', ':(exclude)*site-packages*'],
        { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).split('\n').filter(Boolean);
    } catch { tracked = []; }
    for (const t of tracked) { const n = moduleName(t); if (n) nameCount[n] = (nameCount[n] || 0) + 1; }

    const MAX_FILES = 25, MAX_LIST = 15, NOISE_CAP = 40;
    const out = [];
    for (const f of py.slice(0, MAX_FILES)) {
      const dotted = dottedPath(f);          // e.g. VideoModule.io.decode
      if (!dotted) continue;
      const segs = dotted.split('.');
      const name = segs[segs.length - 1];    // last importable segment
      const parent = segs.slice(0, -1).join('.');
      if (!/^[A-Za-z_]\w*$/.test(name)) continue;

      const D = esc(dotted), P = esc(parent), S = name;
      const alts = [];
      // absolute: `import a.b.c` / `from a.b.c import ...`
      alts.push('^[[:space:]]*(from|import)[[:space:]]+' + D + '([^A-Za-z0-9_]|$)');
      // parent import: `from a.b import c`
      if (parent) alts.push('^[[:space:]]*from[[:space:]]+' + P + '[[:space:]]+import[[:space:]]([^#]*[^A-Za-z0-9_])?' + S + '([^A-Za-z0-9_]|$)');
      // bare / relative recall — only for safe, unambiguous names
      const recallOK = parent && nameCount[name] === 1 && name.length >= 5;
      if (recallOK) alts.push('^[[:space:]]*(from|import)[[:space:]]([^#]*[^A-Za-z0-9_])?' + S + '([^A-Za-z0-9_]|$)');
      const pat = '(' + alts.join(')|(') + ')';

      let res = '';
      try {
        res = execFileSync('git', ['grep', '-lE', pat, '--', '*.py', ':(exclude)*backup*', ':(exclude)*site-packages*'],
          { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) { res = (e && e.stdout) ? String(e.stdout) : ''; }  // git grep exits 1 on no match
      const importers = [...new Set(res.split('\n').map(s => s.trim().replace(/\\/g, '/')).filter(Boolean))]
        .filter(s => s.toLowerCase() !== f.toLowerCase()).sort();
      if (importers.length === 0) continue;
      if (importers.length > NOISE_CAP) {
        out.push('[Hook]   ' + f + '  <- widely imported (' + importers.length + ') — foundational module, callers not listed');
        continue;
      }
      const shown = importers.slice(0, MAX_LIST);
      const extra = importers.length > MAX_LIST ? ' (+' + (importers.length - MAX_LIST) + ' more)' : '';
      out.push('[Hook]   ' + f + '  <- ' + importers.length + ' importer(s): ' + shown.join(', ') + extra);
    }
    if (out.length) {
      console.error('[Hook] dependents reminder — changed Python modules and what imports them.');
      console.error('[Hook] Check whether these callers (and their READMEs) need a matching update:');
      for (const l of out) console.error(l);
    }
  } catch (e) {}
  console.log(d);
});

// Repo-relative .py path -> importable dotted path. __init__.py collapses to its package dir.
function dottedPath(relPath) {
  let p = relPath.replace(/\\/g, '/').replace(/\.py$/, '');
  const segs = p.split('/');
  if (segs[segs.length - 1] === '__init__') segs.pop();
  return segs.join('.');
}
function moduleName(relPath) { const dp = dottedPath(relPath); const s = dp.split('.'); return s[s.length - 1] || ''; }
// Escape a dotted path for POSIX ERE (only '.' is special among our chars).
function esc(s) { return String(s).replace(/\./g, '[.]'); }
