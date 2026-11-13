// PreToolUse gate for Write|Edit on code files (task-management system).
// LINKAGE model: a code write must belong to the single in_progress task's declared `files:`.
//
//   pass  - non-code file, or a file outside any git repository (scratch, temp)
//   NOTE  - every check below uses the repository that owns the target file, not the
//           session's working folder, so a session in repo A cannot be blocked by repo B's task.
//   pass  - first code file in the session (single-file trivial escape)
//   block - 2nd+ code file and NO task is in_progress         -> open a task
//   block - >1 task in_progress                               -> exactly one active task
//   block - in_progress task has no `files:` declared          -> declare scope
//   block - this file not matched by the in_progress task's `files:` globs -> add it / right task
//   pass  - this file matches the in_progress task's `files:`
//   NOTE  - "the task" means this session's task: one whose session: is this hook's session_id,
//           or that names no session. Another session's open task never blocks this write, and
//           the files it lists do not count toward this session's free first file.
//   block - this file is listed by another session's open task and not by this session's
//           -> ask the user, then `files add` it to this session's task
//
// See ~/.claude/rules/task-management.md §0.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { frontOf, ownerOf, owns, globMatch, claimedElsewhere } = require('../../task-system/lean-board.js');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  let inp = {};
  try { inp = JSON.parse(d); } catch { console.log(d); process.exit(0); }
  const target = ((inp.tool_input && inp.tool_input.file_path) || '').replace(/\\/g, '/');
  const CODE = /\.(ts|tsx|js|jsx|py|go|rs|java|kt|cpp|c|h|hpp|cs|rb|php|swift|dart)$/;
  if (!CODE.test(target)) { console.log(d); process.exit(0); }
  const absTarget = path.resolve(target);
  const root = repoRootOf(path.dirname(absTarget));
  if (!root) { console.log(d); process.exit(0); }

  const block = (lines) => {
    console.error('[Hook] TASK GATE: STOP-AND-REDIRECT (not a transient error). Do NOT retry this write — it will block identically.');
    for (const l of lines) console.error('[Hook] ' + l);
    if (process.env.ECC_TASK_FLOW !== 'lean') console.error('[Hook] See ~/.claude/rules/task-management.md §0.');
    process.exit(2);
  };

  try {
    const rel = path.relative(root, absTarget).replace(/\\/g, '/');

    const changed = execSync('git status --porcelain -uall', { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .split('\n').map(s => s.slice(3).trim()).filter(Boolean)
      .map(s => s.includes(' -> ') ? s.split(' -> ')[1] : s)
      .map(s => s.replace(/(^")|("$)/g, ''));
    const codeFiles = new Set(changed.filter(f => CODE.test(f)));
    // A Codex patch can propose several files before any has landed on disk.
    // Pending paths are relative to the session folder; keep those inside the target's repository.
    for (const pending of JSON.parse(process.env.ECC_PENDING_FILES || '[]')) {
      const pendingRel = path.relative(root, path.resolve(pending)).replace(/\\/g, '/');
      if (CODE.test(pendingRel) && !pendingRel.startsWith('..')) codeFiles.add(pendingRel);
    }
    codeFiles.add(rel);

    // Collect in_progress tasks across both conventions.
    const dirs = ['docs/tasks/open', 'task_list/open'];
    const all = [];  // {id, path, files:[globs], hasFilesKey:bool, owner}
    for (const dir of dirs) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.md')); } catch { continue; }
      for (const f of files) {
        let fm = '';
        try { fm = fs.readFileSync(path.join(root, dir, f), 'utf8'); } catch { continue; }
        // The whole frontmatter: a record that lists many files can run past any fixed cut.
        const front = frontOf(fm);
        if (!/^\s*status:\s*in_progress/m.test(front)) continue;
        const idM = front.match(/^\s*id:\s*(.+)$/m);
        const id = idM ? idM[1].trim() : f.replace(/\.md$/, '');
        const globs = parseFilesList(front);
        all.push({ id, path: dir + '/' + f, files: globs.list, hasFilesKey: globs.present, owner: ownerOf(fm) });
      }
    }
    const session = inp.session_id || '';
    const active = all.filter(a => owns(session, a.owner));
    const others = all.filter(a => !owns(session, a.owner));
    const elsewhere = claimedElsewhere(others.flatMap(a => a.files), active.flatMap(a => a.files));
    // A task is held by one session at a time, so even a free first-file edit may not touch its files.
    if (elsewhere(rel)) {
      block(['This write (' + rel + ') is listed by open task ' + others.find(a => a.files.some(g => globMatch(g, rel))).id + ', which belongs to another session. Ask the user first.',
        'If the user agrees, list it in your own task (task.js files add ' + rel + ', or begin one with --files ' + rel + '), then re-issue the write.']);
    }
    for (const f of codeFiles) if (elsewhere(f)) codeFiles.delete(f);  // another session's changes
    if (codeFiles.size <= 1) { console.log(d); process.exit(0); }  // trivial single-file escape

    if (active.length === 0 && process.env.ECC_TASK_FLOW === 'lean') {
      block(['2nd+ code file this session and no task is open. Start one, then re-issue the write:',
        '  node "$HOME/.claude/task-system/task.js" begin "<title>" --files ' + rel + ',<other files this work changes> --goal "<one line>" --plan "<steps>"']);
    }
    if (active.length === 0) {
      block([
        '2nd+ code file this session and NO task is in_progress.',
        'Open one task and mark it in_progress, then re-issue the write:',
        '  - run /plan-to-tasks to scaffold task files from your plan, OR',
        '  - create docs/tasks/open/<ID>-<slug>.md (or task_list/open/) with "status: in_progress" and a "files:" list.',
        'Your NEXT action must be opening a task — not retrying this write.',
      ]);
    }
    if (active.length > 1) {
      block([
        'More than one task is in_progress (' + active.map(a => a.id).join(', ') + ').',
        'Exactly one task may be active. Move the others back to "status: open", then re-issue.',
      ]);
    }
    const task = active[0];
    if (process.env.ECC_TASK_FLOW === 'lean' && !task.files.some(g => globMatch(g, rel))) {
      block(['This write (' + rel + ') is not in open task ' + task.id + "'s files. If it belongs to this work, add it, then re-issue the write:",
        '  node "$HOME/.claude/task-system/task.js" files add ' + rel]);
    }
    if (!task.hasFilesKey || task.files.length === 0) {
      block([
        'In_progress task ' + task.id + ' declares no "files:" — cannot bind this write to it.',
        'Add a "files:" YAML list (globs, repo-relative) to ' + task.path + ' naming the files this task touches, e.g.:',
        '  files:',
        '    - ' + rel,
        'Then re-issue the write.',
      ]);
    }
    if (!task.files.some(g => globMatch(g, rel))) {
      block([
        'This write (' + rel + ') is NOT in the scope of in_progress task ' + task.id + '.',
        'Task ' + task.id + ' files: [' + task.files.join(', ') + '].',
        'Either add ' + rel + ' to that task\'s "files:" (if it genuinely belongs), or open the correct task for this work.',
        'Do not retry this write until the file is claimed by an in_progress task.',
      ]);
    }
    // File is claimed by the single in_progress task -> allow.
    console.log(d);
    process.exit(0);
  } catch (e) { console.log(d); process.exit(0); }  // never hard-fail on an internal error
});

// Top-level folder of the git repository containing dir (walking up past folders that do not
// exist yet), or null when dir is not inside any repository.
function repoRootOf(dir) {
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  try { return execSync('git rev-parse --show-toplevel', { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
}

// Parse a YAML `files:` block from frontmatter head. Returns {present, list}.
function parseFilesList(head) {
  const lines = head.split('\n');
  let i = lines.findIndex(l => /^\s*files:\s*$/.test(l) || /^\s*files:\s*\[.*\]\s*$/.test(l));
  if (i === -1) return { present: false, list: [] };
  // Inline form: files: [a, b]
  const inline = lines[i].match(/^\s*files:\s*\[(.*)\]\s*$/);
  if (inline) {
    const list = inline[1].split(',').map(stripVal).filter(Boolean);
    return { present: true, list };
  }
  // Block form: subsequent "  - path" lines.
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
