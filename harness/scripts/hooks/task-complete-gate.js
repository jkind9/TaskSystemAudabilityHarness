// Stop hook (task-management system) — completion gate.
// BLOCKS session end (exit 2) when an in_progress task, whose code changed this session,
// either (a) still has unfilled receipts, (b) has not satisfied its `docs:` contract,
// (c) added/changed no test, or (d) lacks a filled "## In plain English" section. Forces the
// loop to close: fill receipts + update the declared docs + touch a test (or waive it) +
// git mv to closed/, or write an explicit escape. Passes otherwise.
//
//   receipts gate — "unfilled receipts" = the "## Receipts" SECTION (scoped — a "(path)" in prose
//                    elsewhere is not a receipt) still contains a placeholder marker OR a table row
//                    with a blank value cell (deleting the marker text must not count as filling
//                    it in; blank table headers before a |---| separator are fine).
//                    Escape: "still open because <reason>".
//   docs gate     — a code-changing task must account for documentation. A declared `docs:` path
//                    is satisfied only when it was updated THIS SESSION (per the docs-snapshot.js
//                    SessionStart baseline — not merely dirty from earlier work). If no baseline is
//                    available it falls back to "dirty == updated". A task that declares no `docs:`
//                    at all is also flagged. Escape: a one-line "docs n/a: <reason>" (also accepts
//                    docs ok/current/reviewed/unchanged/verified).
//   tests gate    — a code change is accountable to a test. FLOOR check: a test file must have
//                    been added/updated THIS SESSION (per the same docs-snapshot baseline — a test
//                    left dirty by an earlier session does not count). When the task's
//                    `verification_test:` is a real path (not prose), the touched test must also
//                    match it or the task's `files:` scope — an unrelated test doesn't discharge a
//                    task that names its contract test.
//                    Escape: a one-line "tests n/a: <reason>" (rename/comment/pure-doc). This
//                    proves tests were *touched*, NOT that they are rigorous — rigour (cover the
//                    boundaries + error path, red-first-or-reviewed, not green-by-construction) is the
//                    Verification test-plan's job and can't be regex-verified. See the task README
//                    "Testing standard" (Right-BICEP / CORRECT) for the catalogue.
//   plain gate    — every in_progress task must carry a "## In plain English" section written for
//                    a reader with NO project context (present, not the template placeholder,
//                    >=60 chars). Checked BEFORE the "still open because" escape: the section is a
//                    property of the task file from the moment work starts, not of its closure.
//                    No escape — if the task is real, it is explainable in plain words.
//
// Fails OPEN on any internal error (never breaks a session). See ~/.claude/rules/task-management.md §0/§6.
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
  try { execSync('git rev-parse --git-dir', { stdio: 'pipe' }); }
  catch { console.log(d); process.exit(0); }
  try {
    const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const changed = execSync('git status --porcelain -uall', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .split('\n').map(s => s.slice(3).trim()).filter(Boolean)
      .map(s => s.includes(' -> ') ? s.split(' -> ')[1] : s)
      .map(s => s.replace(/(^")|("$)/g, ''))
      .map(s => s.replace(/\\/g, '/'));
    const CODE = /\.(ts|tsx|js|jsx|py|go|rs|java|kt|cpp|c|h|hpp|cs|rb|php|swift|dart)$/;
    const changedCode = changed.filter(f => CODE.test(f));
    if (changedCode.length === 0) { console.log(d); process.exit(0); }

    const snapshot = loadSnapshot(sid, root);  // session-start baseline, or null

    const dirs = ['docs/tasks/open', 'task_list/open'];
    const unresolved = [];       // receipts not filled
    const missingDocsDecl = [];  // code-changing task with no docs: declaration and no escape
    const staleDocs = [];        // declared docs not updated THIS session -> {id, path, stale:[...]}
    const missingTests = [];     // code changed but no test touched this session and no escape
    const missingPlain = [];     // no filled "## In plain English" section -> {id, path, why}
    for (const dir of dirs) {
      let files = [];
      try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { continue; }
      for (const f of files) {
        let body = '';
        try { body = fs.readFileSync(dir + '/' + f, 'utf8'); } catch { continue; }
        if (!/^\s*status:\s*in_progress/m.test(body.slice(0, 2000))) continue;
        const idM = body.slice(0, 2000).match(/^\s*id:\s*(.+)$/m);
        const id = idM ? idM[1].trim() : f.replace(/\.md$/, '');
        const tpath = dir + '/' + f;

        // (d) Plain-English gate — deliberately BEFORE the mid-flight escape below; a task can
        // legitimately stay open across sessions, but never without its plain-words section.
        const plainWhy = plainSectionProblem(body);
        if (plainWhy) missingPlain.push({ id, path: tpath, why: plainWhy });

        // Escape: an explicit "still open because <reason>" makes a dangling in_progress intentional.
        const intentional = /still open because\s+\S|continues next session:\s*\S|carry over:\s*\S/i.test(body);
        if (intentional) continue;

        // (a) Receipts gate — section-scoped markers + blank table cells.
        if (receiptsUnfilled(body)) {
          unresolved.push({ id, path: tpath });
        }

        // (b) Docs gate — only for a task whose own code actually changed this session.
        const head = body.slice(0, 4000);
        const filesGlobs = parseListKey(head, 'files').list;
        const taskCodeChanged = filesGlobs.length
          ? changedCode.some(cf => filesGlobs.some(g => globMatch(g, cf)))
          : true; // no files: scope declared — fall back to the global "code changed" signal
        if (!taskCodeChanged) continue;

        // (b) Docs gate. Escape must be a directive at the START of a line (optionally behind
        // list/quote/bold/table markers) — NOT a mid-line prose mention like "...add a `docs n/a:`
        // waiver" (a task that merely documents the escape must not disable the gate).
        const docsEscape = /^[ \t>*_|#-]*docs\s+(n\/?a|ok|current|reviewed|unchanged|verified)\b/im.test(body);
        if (!docsEscape) {
          const docs = parseListKey(head, 'docs');
          if (!docs.present || docs.list.length === 0) {
            missingDocsDecl.push({ id, path: tpath });
          } else {
            const stale = docs.list.filter(doc => !docUpdatedThisSession(doc, changed, snapshot, root));
            if (stale.length) staleDocs.push({ id, path: tpath, stale });
          }
        }

        // (c) Tests gate — a test file must have been touched THIS SESSION (snapshot-aware: a test
        // dirty since before the session doesn't count), or an explicit "tests n/a: <reason>"
        // escape written (same start-of-line rule as the docs escape). When verification_test: is
        // a real path, the touched test must also match it or the files: scope.
        const testsEscape = /^[ \t>*_|#-]*tests?\s+(n\/?a|ok|current|reviewed|covered|existing|unchanged|verified|deferred)\b/im.test(body);
        if (!testsEscape) {
          const touched = changed.filter(isTestFile).filter(f => fileUpdatedThisSession(f, snapshot, root));
          if (touched.length === 0) {
            missingTests.push({ id, path: tpath, why: 'no test file added/updated this session (a test dirty from an earlier session does not count)' });
          } else {
            const vtM = head.match(/^\s*verification_test:\s*(.+)$/m);
            const vt = vtM ? stripVal(vtM[1]) : '';
            const vtIsPath = vt && !/\s/.test(vt) && /[\/\\]|\.[a-z0-9]+$/i.test(vt);
            if (vtIsPath && !touched.some(f => globMatch(vt, f) || filesGlobs.some(g => globMatch(g, f)))) {
              missingTests.push({ id, path: tpath, why: 'test(s) touched (' + touched.join(', ') + ') but none match verification_test: ' + vt + ' or the files: scope' });
            }
          }
        }
      }
    }

    if (unresolved.length === 0 && missingDocsDecl.length === 0 && staleDocs.length === 0 && missingTests.length === 0 && missingPlain.length === 0) {
      console.log(d); process.exit(0);
    }

    // One line, naming the exact command (owner decision 2026-10-13, FINDINGS item 8): the
    // dispatcher refuses only once, so this line is the whole message the assistant gets.
    const problems = {};
    const add = (rawId, text) => { const id = stripVal(rawId); (problems[id] = problems[id] || []).push(text); };
    for (const u of unresolved) add(u.id, 'unfilled receipts');
    for (const u of missingDocsDecl) add(u.id, 'no docs: list (or write "docs n/a: <reason>")');
    for (const u of staleDocs) add(u.id, 'docs not updated this session: ' + u.stale.join(', ') + ' (or write "docs n/a: <reason>")');
    for (const u of missingTests) add(u.id, (u.why || 'no test') + ' (or write "tests n/a: <reason>")');
    for (const u of missingPlain) add(u.id, 'no "## In plain English" section (' + u.why + ')');
    const ids = Object.keys(problems);
    console.error('[Hook] TASK COMPLETION GATE: ' + ids.map(id => 'task ' + id + ': ' + problems[id].join('; ')).join(' | ') +
      '. Fix that, then run: node ~/.claude/task-system/task.js move ' + ids[0] + ' pending_review' +
      ' (or write "still open because <reason>" in the task). This is the only refusal; the next stop is allowed and logged.');
    process.exit(2);
  } catch (e) { console.log(d); process.exit(0); }
});

// Judge the "## In plain English" section of a task file. Returns null when it is filled,
// else a short reason string. "Filled" = the heading exists, its content is not the template
// placeholder, and it carries at least 60 chars of real text. A regex cannot judge plainness —
// that stays on the plain-language audit hook + self-review; this only forces the section to exist.
function plainSectionProblem(body) {
  const lines = String(body).split('\n');
  const i = lines.findIndex(l => /^##\s+in plain english\b/i.test(l));
  if (i === -1) return 'section missing';
  const content = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^##\s/.test(lines[j])) break;
    content.push(lines[j]);
  }
  const text = content.join(' ').replace(/\s+/g, ' ').trim();
  if (/\(replace this paragraph/i.test(text)) return 'still the template placeholder';
  if (text.length < 60) return 'empty or too short (' + text.length + ' chars; needs a real explanation)';
  return null;
}

// A declared doc is satisfied iff a working-tree file matching it changed THIS session.
//   - no matching dirty file at all         -> not updated (stale)
//   - no session baseline (snapshot null)    -> fall back to "dirty == updated"
//   - file clean at session start, dirty now -> updated this session
//   - file dirty at start, content differs   -> updated further this session
//   - file dirty at start, content identical -> NOT updated this session (the per-session fix)
function docUpdatedThisSession(doc, changed, snapshot, root) {
  const matches = changed.filter(cf => globMatch(doc, cf));
  if (matches.length === 0) return false;
  return matches.some(cf => fileUpdatedThisSession(cf, snapshot, root));
}

// A single dirty file counts as "updated this session" iff it was clean at session start, or its
// content hash differs from the SessionStart baseline. No baseline -> fall back to dirty==updated.
// Shared by the docs gate and the tests gate (the snapshot hashes ALL dirty files, not just docs).
function fileUpdatedThisSession(cf, snapshot, root) {
  if (!snapshot) return true;
  const snap = snapshot.files[cf];
  if (snap === undefined) return true;                       // was clean at session start
  if (snap === 'LARGE' || snap === 'NOTFILE') return true;   // couldn't baseline -> don't false-block
  return hashFile(path.join(root, cf)) !== snap;             // content changed since session start
}

// "Receipts not filled" = the ## Receipts section still carries a placeholder marker, OR a table
// row whose value cell is blank (deleting the "(fill in)" text must not count as filling it in).
// Blank header rows (immediately before a |---| separator) are stylistic and fine.
// Kept in sync with receiptsUnfilled() in ~/.claude/task-system/task.js.
function receiptsUnfilled(body) {
  const sec = sectionBody(String(body), 'Receipts');
  if (!sec) return false;
  if (/\(fill in\)|\(to be filled|\(path\)|\(computed\)/i.test(sec)) return true;
  const lines = sec.split('\n');
  const isSep = (l) => { const m = l.match(/^\s*\|(.+)\|\s*$/); return !!m && m[1].split('|').every(c => /^\s*:?-+:?\s*$/.test(c)); };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\|(.+)\|\s*$/);
    if (!m || isSep(lines[i])) continue;
    if (i + 1 < lines.length && isSep(lines[i + 1])) continue; // header row (even a blank "| | |" one)
    const cells = m[1].split('|').map(s => s.trim());
    if (cells.length < 2) continue;
    if (cells.slice(1).join('').trim() === '') return true;    // blank value cell(s)
  }
  return false;
}

// Body of a "## <name>" section, up to the next "## " heading. Mirrors sectionBody() in task.js.
function sectionBody(text, name) {
  const head = text.match(new RegExp('^##\\s+' + name + '\\s*$', 'm'));
  if (!head) return '';
  const start = head.index + head[0].length;
  const nxt = text.slice(start).match(/^##\s+/m);
  return text.slice(start, nxt ? start + nxt.index : text.length).trim();
}

// Load the SessionStart baseline for this session_id (written by docs-snapshot.js). Null if absent
// or for a different repo root. Normalised root compare guards against any session_id reuse.
function loadSnapshot(sid, root) {
  if (!sid) return null;
  try {
    const p = path.join(os.tmpdir(), 'claude-docs-gate', String(sid).replace(/[^A-Za-z0-9_.-]/g, '_') + '.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const norm = s => String(s).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (norm(j.root) !== norm(root)) return null;
    return j && j.files ? j : null;
  } catch { return null; }
}

function hashFile(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return 'NOTFILE';
    if (st.size > 5 * 1024 * 1024) return 'LARGE';
    return crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
  } catch { return 'MISSING'; }
}

// Parse a YAML list-valued key (`files:` / `docs:`) from a frontmatter head. Returns {present, list}.
// Supports inline `key: [a, b]` and block `key:\n  - a\n  - b` forms. Mirrors task-gate.js.
function parseListKey(head, key) {
  const lines = head.split('\n');
  const reBlock = new RegExp('^\\s*' + key + ':\\s*$');
  const reInline = new RegExp('^\\s*' + key + ':\\s*\\[(.*)\\]\\s*$');
  let i = lines.findIndex(l => reBlock.test(l) || reInline.test(l));
  if (i === -1) return { present: false, list: [] };
  const inline = lines[i].match(reInline);
  if (inline) {
    const list = inline[1].split(',').map(stripVal).filter(Boolean);
    return { present: true, list };
  }
  const list = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\s*---\s*$/.test(lines[j])) break;     // end of frontmatter
    const m = lines[j].match(/^\s*-\s*(.+?)\s*$/);
    if (m) { const v = stripVal(m[1]); if (v) list.push(v); continue; }
    if (/^\s*$/.test(lines[j])) continue;        // skip blanks within the block
    if (/^\S/.test(lines[j]) || /^\s*\w[\w-]*:/.test(lines[j])) break;  // next key ends the block
  }
  return { present: true, list };
}

// Strip a YAML scalar: drop an inline " # comment", trailing whitespace, and surrounding quotes.
function stripVal(s) { return String(s).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').trim(); }

// A changed path counts as a test if it lives under a tests/ dir or follows a test-file naming
// convention: pytest test_*.py / conftest.py; Go/Rust *_test.*; JS/TS *.test.* / *.spec.*.
// Case-insensitive. Used by the tests gate as a floor signal ("a test was touched this session").
function isTestFile(f) {
  const p = String(f).replace(/\\/g, '/').toLowerCase();
  const base = p.split('/').pop();
  if (/(^|\/)tests?\//.test(p)) return true;
  if (base === 'conftest.py') return true;
  if (/^test_.*\.[a-z0-9]+$/.test(base)) return true;
  if (/_test\.[a-z0-9]+$/.test(base)) return true;
  if (/\.(test|spec)\.[a-z0-9]+$/.test(base)) return true;
  return false;
}

// Minimal glob: supports ** (any depth), * (within a segment), exact paths. Case-insensitive.
function globMatch(glob, p) {
  glob = String(glob).replace(/\\/g, '/').trim();
  p = String(p).replace(/\\/g, '/').trim();
  if (glob === p) return true;
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if ('.+^${}()|[]\\'.includes(c)) { re += '\\' + c; }
    else re += c;
  }
  try { return new RegExp('^' + re + '$', 'i').test(p); } catch { return false; }
}
