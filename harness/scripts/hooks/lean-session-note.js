// SessionStart hook (lean profile). One line of context so a new session can pick up the work
// without reading the board: this session's open task, or else what the last finished task left
// over, then any task open in another session, which this session must leave alone.
// Prints nothing with no board, outside a git repository, or on an internal error.
const { readText, section, title, openTask, openElsewhere, lastDone } = require('../../task-system/lean-board.js');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const inp = JSON.parse(d || '{}');
    const cwd = inp.cwd || process.cwd(), session = inp.session_id || '';
    const open = openTask(cwd, session);
    const done = !open && lastDone(cwd);
    const left = done && section(readText(done.path), 'Left over');
    const notes = [];
    if (open) notes.push('Open task ' + open.id + ' "' + title(readText(open.path)) + '" (' + open.folder + '/' + open.file + '); run task.js finish when it is done.');
    else if (left && !/^none\.?$/i.test(left)) notes.push('Last finished task ' + done.id + ' "' + title(readText(done.path)) + '" left over: ' + left.replace(/\s+/g, ' '));
    const others = openElsewhere(cwd, session).map(t => t.id + ' "' + title(readText(t.path)) + '"');
    if (others.length) notes.push('Open in another session, so do not finish or change: ' + others.join(', ') + '. If the user says that session has ended, task.js adopt <id> moves the task to this session.');
    if (notes.length) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: notes.join(' ') } }));
  } catch { /* no note */ }
  process.exit(0);
});
