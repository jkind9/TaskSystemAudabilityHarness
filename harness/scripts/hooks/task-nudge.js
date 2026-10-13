// Stop hook (task-management system). Non-blocking reminders:
//   1. >=2 code files changed this session and no task file touched -> nudge.
//   2. pending_review tasks parked >=14 days -> surface the ageing queue.
// Always exits 0 and passes stdin through. See ~/.claude/rules/task-management.md.
const { execSync } = require('child_process');
const fs = require('fs');
let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try { execSync('git rev-parse --git-dir', { stdio: 'pipe' }); }
  catch { console.log(d); process.exit(0); }
  try {
    const changed = execSync('git status --porcelain -uall', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .split('\n').map(s => s.slice(3).trim()).filter(Boolean)
      .map(s => s.includes(' -> ') ? s.split(' -> ')[1] : s)
      .map(s => s.replace(/(^")|("$)/g, ''));
    const isTask = f => /(^|\/)(docs\/tasks|task_list)\//.test(f);
    const isCode = f => /\.(ts|tsx|js|jsx|py|go|rs|java|kt|cpp|c|h|hpp|cs|rb|php|swift|dart)$/.test(f);
    const codeFiles = changed.filter(isCode);
    const touchedTask = changed.some(isTask);
    if (codeFiles.length >= 2 && !touchedTask) {
      console.error('[Hook] task-management nudge: ' + codeFiles.length + ' code files changed, no task file touched.');
      console.error('[Hook] If this is a tracked decision/bug/multi-session task, update docs/tasks/ (or task_list/) and fill receipts on close. See task-management.md.');
      console.error('[Hook] Trivial one-off? ignore this.');
    }
  } catch (e) {}
  // pending_review ageing: these tasks wait on a HUMAN, so nothing else surfaces them.
  try {
    const AGE_DAYS = 14;
    for (const dir of ['docs/tasks/pending_review', 'task_list/pending_review']) {
      let files = [];
      try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md'); } catch { continue; }
      const aged = [];
      for (const f of files) {
        let head = '';
        try { head = fs.readFileSync(dir + '/' + f, 'utf8').slice(0, 2000); } catch { continue; }
        const m = head.match(/^last_updated:\s*(\d{4}-\d{2}-\d{2})/m) || head.match(/^created:\s*(\d{4}-\d{2}-\d{2})/m);
        const days = m ? Math.floor((Date.now() - Date.parse(m[1])) / 86400000) : null;
        if (days === null || days >= AGE_DAYS) aged.push(f.split('_')[0] + (days === null ? '(?d)' : '(' + days + 'd)'));
      }
      if (aged.length) {
        console.error('[Hook] pending_review ageing: ' + aged.length + ' task(s) have waited >=' + AGE_DAYS + 'd for a human in ' + dir + ': ' + aged.join(', '));
        console.error('[Hook] Review and move them on (closed/stale), or confirm the blocker still stands. Full queue: node ~/.claude/task-system/task.js ready');
      }
    }
  } catch (e) {}
  console.log(d);
});
