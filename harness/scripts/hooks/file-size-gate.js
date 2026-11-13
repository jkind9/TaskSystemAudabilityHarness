// PreToolUse gate for Write|Edit on code files: a code file may not grow past the limit
// (800 lines; rules/coding-style.md). The rule the task system lacked until 2026-09-10 —
// server.py went 686 -> 5,475 lines in eight days while every gate passed, because every
// gate checked *which* file was written, never *how big* it became.
//
//   pass  - non-code file, or the hook is named in ECC_DISABLED_HOOKS
//   pass  - the file would be at or under the limit after this write
//   pass  - over the limit but no larger than it is on disk now (a shrink, or a same-size edit)
//   pass  - over the limit and growing, but this session's in_progress task lists the file under
//           `shrinks:` — a named splitter may grow a file between two edits (add the import,
//           then delete the block); task.js verify demands the net shrink at close
//   block - a NEW file over the limit
//   block - an existing oversized file grows and no in_progress task shrinks it
//
// The escape is `shrinks:` (a measured promise), never a flag. See rules/task-management.md §0.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const SIZE = require(path.join(__dirname, '..', '..', 'task-system', 'file-size.js'));
const { frontOf, ownerOf, owns } = require(path.join(__dirname, '..', '..', 'task-system', 'lean-board.js'));

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  let inp = {};
  try { inp = JSON.parse(d); } catch { console.log(d); process.exit(0); }
  const tool = inp.tool_name || inp.tool || '';
  const ti = inp.tool_input || {};
  const target = String(ti.file_path || '').replace(/\\/g, '/');
  if (!target || !SIZE.isCode(target)) { console.log(d); process.exit(0); }
  if ((process.env.ECC_DISABLED_HOOKS || '').includes('file-size-gate')) { console.log(d); process.exit(0); }

  try {
    const before = SIZE.linesOnDisk(target);
    const after = resultingLines(tool, ti, target);
    if (after === null || after <= SIZE.LIMIT || after <= before) { console.log(d); process.exit(0); }

    // Judge by the repository that owns the file, not the session's folder. A file shrunk
    // earlier in the same work may regrow up to its committed size, never past it.
    const absTarget = path.resolve(target);
    const root = repoRootOf(path.dirname(absTarget));
    const rel = root ? path.relative(root, absTarget).replace(/\\/g, '/') : target;
    if (root && after <= committedLines(root, rel)) { console.log(d); process.exit(0); }
    const active = root ? activeTasks(root, inp.session_id || '') : [];
    const splitter = active.length === 1 && SIZE.shrinks(active[0].text, rel);
    if (before > 0 && splitter) { console.log(d); process.exit(0); }

    console.error('[Hook] FILE SIZE GATE: STOP-AND-REDIRECT (not a transient error). Do NOT retry this write — it blocks identically.');
    if (before === 0) {
      console.error('[Hook] ' + rel + ' would be a NEW file of ' + after + ' lines; the limit is ' + SIZE.LIMIT + '.');
      console.error('[Hook] Split it into modules under ' + SIZE.LIMIT + ' lines before writing. A file this size is the thing this gate exists to prevent.');
    } else {
      console.error('[Hook] ' + rel + ' is ' + before + ' lines and this write makes it ' + after + '; a file over ' + SIZE.LIMIT + ' lines may not grow.');
      console.error('[Hook] Put the new code in a new module under ' + SIZE.LIMIT + ' lines and import it here (net change to ' + rel + ' <= 0), OR');
      if (active.length === 1)
        console.error('[Hook] if task ' + active[0].id + ' is splitting ' + rel + ', list it under `shrinks:` in ' + active[0].path + ' — task.js verify then requires ' + rel + ' smaller at close than at the launch HEAD.');
      else
        console.error('[Hook] if the active task is splitting ' + rel + ', list it under `shrinks:` in that task file — task.js verify then requires ' + rel + ' smaller at close than at the launch HEAD.');
    }
    if (process.env.ECC_TASK_FLOW !== 'lean') console.error('[Hook] See ~/.claude/rules/task-management.md §0 (file size).');
    process.exit(2);
  } catch (e) { console.log(d); process.exit(0); }  // never hard-fail on an internal error
});

// Line count the file would have after this tool call; null when it cannot be computed
// (the Edit's old_string is absent — the Edit tool will refuse it itself).
function resultingLines(tool, ti, target) {
  if (tool === 'Write' || typeof ti.content === 'string') return SIZE.countLines(String(ti.content || ''));
  let cur = '';
  try { cur = fs.readFileSync(target, 'utf8'); } catch { return null; }
  const oldS = String(ti.old_string || ''), newS = String(ti.new_string || '');
  if (!oldS || !cur.includes(oldS)) return null;
  const next = ti.replace_all ? cur.split(oldS).join(newS) : cur.replace(oldS, () => newS);
  return SIZE.countLines(next);
}

// Top-level folder of the git repository containing dir, or null outside any repository.
function repoRootOf(dir) {
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
}

// Line count of rel at HEAD; 0 when the file is new or the repository has no commit.
function committedLines(root, rel) {
  try { return SIZE.countLines(execFileSync('git', ['show', 'HEAD:' + rel], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })); }
  catch { return 0; }
}

// Every in_progress task file this session owns, across both board conventions in root: {id, path, text}.
// Other sessions' tasks are left out, so parallel sessions do not switch off each other's shrinks: escape.
function activeTasks(root, session) {
  const out = [];
  for (const dir of ['docs/tasks/open', 'task_list/open']) {
    let files = [];
    try { files = fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      let text = '';
      try { text = fs.readFileSync(path.join(root, dir, f), 'utf8'); } catch { continue; }
      const front = frontOf(text);
      if (!/^\s*status:\s*in_progress/m.test(front) || !owns(session, ownerOf(text))) continue;
      const idM = front.match(/^\s*id:\s*["']?([^"'\n]+)["']?\s*$/m);
      out.push({ id: idM ? idM[1].trim() : f.replace(/\.md$/, ''), path: dir + '/' + f, text });
    }
  }
  return out;
}
