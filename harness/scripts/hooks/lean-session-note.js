// SessionStart hook (lean profile). One line of context so a new session can pick up the work
// without reading the board: the open task, or else what the last finished task left over.
// Prints nothing with no board, outside a git repository, or on an internal error.
const { readText, section, title, openTask, lastDone } = require('../../task-system/lean-board.js');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const cwd = JSON.parse(d || '{}').cwd || process.cwd();
    const open = openTask(cwd);
    const done = !open && lastDone(cwd);
    const left = done && section(readText(done.path), 'Left over');
    let note = '';
    if (open) note = 'Open task ' + open.id + ' "' + title(readText(open.path)) + '" (' + open.folder + '/' + open.file + '); run task.js finish when it is done.';
    else if (left && !/^none\.?$/i.test(left)) note = 'Last finished task ' + done.id + ' "' + title(readText(done.path)) + '" left over: ' + left.replace(/\s+/g, ' ');
    if (note) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: note } }));
  } catch { /* no note */ }
  process.exit(0);
});
