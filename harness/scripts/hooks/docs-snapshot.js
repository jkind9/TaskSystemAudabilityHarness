// SessionStart hook (task-management system). Doc-staleness baseline.
// Snapshots a content hash of every file that is ALREADY dirty in the working tree at session
// start, keyed by session_id, so the Stop completion gate (task-complete-gate.js) can tell whether
// a task's declared `docs:` were updated THIS SESSION — not merely dirty from earlier, uncommitted
// work (the repo runs a long-lived dirty tree, so "dirty" alone is a false "updated" signal).
//
// Logic the gate relies on: a declared doc is "updated this session" iff
//   - it was clean at session start (absent from this snapshot) but is dirty now, OR
//   - it was dirty at session start (present) AND its content hash differs now.
// Files clean at start and clean now are never satisfied. Writes nothing to stdout (no context
// injection) and fails open (no snapshot) on any error. See ~/.claude/rules/task-management.md.
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  let inp = {};
  try { inp = JSON.parse(d); } catch {}
  const sid = inp && inp.session_id;
  try {
    if (!sid) { process.exit(0); }
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const dirty = execSync('git status --porcelain -uall', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .split('\n').map(s => s.slice(3).trim()).filter(Boolean)
      .map(s => s.includes(' -> ') ? s.split(' -> ')[1] : s)
      .map(s => s.replace(/(^")|("$)/g, ''))
      .map(s => s.replace(/\\/g, '/'));
    const files = {};
    for (const rel of dirty.slice(0, 2000)) files[rel] = hashFile(path.join(root, rel));
    const dir = path.join(os.tmpdir(), 'claude-docs-gate');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, safeName(sid) + '.json'), JSON.stringify({ root, session_id: sid, files }));
    pruneOld(dir);
  } catch (e) {}
  process.exit(0);
});

function hashFile(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return 'NOTFILE';
    if (st.size > 5 * 1024 * 1024) return 'LARGE';
    return crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
  } catch { return 'MISSING'; }
}
function safeName(s) { return String(s).replace(/[^A-Za-z0-9_.-]/g, '_'); }
function pruneOld(dir) {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      try { if (now - fs.statSync(p).mtimeMs > 3 * 24 * 3600 * 1000) fs.unlinkSync(p); } catch {}
    }
  } catch {}
}
