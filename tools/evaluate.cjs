'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const protocol = read(path.join(root, 'protocol.json'));
for (const run of protocol.runs.filter(run => !process.argv[2] || run.id === process.argv[2])) {
  const directory = path.join(root, 'results', run.id);
  if (!fs.existsSync(path.join(directory, 'result.json'))) continue;
  const result = read(path.join(directory, 'result.json'));
  const transcriptCopy = path.join(directory, 'transcript.jsonl');
  if (result.transcript && !fs.existsSync(transcriptCopy)) fs.copyFileSync(result.transcript, transcriptCopy, fs.constants.COPYFILE_EXCL);
  const hookCopy = path.join(directory, 'hook-evidence.json');
  if (!fs.existsSync(hookCopy)) {
    const audit = fs.readFileSync('C:/Users/jkind/.agents/harness/state/hook-runs.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    fs.writeFileSync(hookCopy, JSON.stringify(audit.filter(event => result.threadId && event.session === result.threadId), null, 2) + '\n', { flag: 'wx' });
  }
  const repo = path.join(directory, 'repo');
  const checks = [
    ['grade', [path.join(root, 'experiments', run.task, 'grade.cjs'), repo]],
    ['visible-tests', [protocol.tasks.find(task => task.id === run.task).testFile]],
    ['board-lint', ['C:/Users/jkind/.claude/task-system/task.js', 'lint']]
  ];
  for (const [name, args] of checks) {
    const output = path.join(directory, name + '.json');
    if (fs.existsSync(output)) continue;
    const completed = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: name === 'grade' ? 75000 : 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    let parsed = null;
    if (name === 'grade' && !completed.error) {
      try { parsed = JSON.parse(completed.stdout.trim()); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    const evidence = { name, command: [process.execPath, ...args], exitCode: completed.status, signal: completed.signal, executionError: completed.error?.message || null, stdout: completed.stdout || '', stderr: completed.stderr || '', grade: parsed };
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(run.id + ' ' + name + ' exit=' + completed.status + (parsed ? ' ' + parsed.passed + '/' + parsed.total : '') + '\n');
  }
}
