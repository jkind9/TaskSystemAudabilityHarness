// Stop hook (lean profile). If the repository has an open task, refuse once with one line naming
// the command that finishes it. The dispatcher allows the next stop and logs it (STOP_REFUSAL_LIMIT).
// Quiet with no open task and outside a git repository. Fails open on an internal error.
const { openTask } = require('../../task-system/lean-board.js');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const inp = JSON.parse(d || '{}');
    const task = openTask(inp.cwd || process.cwd());
    if (!task) { console.log(d); process.exit(0); }
    console.error('[Hook] Task ' + task.id + ' is still open. Run: node "$HOME/.claude/task-system/task.js" finish --checked "<command> -> <result>" --left "<what is left, or none>"');
    process.exit(2);
  } catch { console.log(d); process.exit(0); }
});
