'use strict';
// Runs the resized study's sessions one at a time in frozen order through tools/runner.cjs. Sessions
// that already have a result are skipped. Stops at the first runner error (including a budget refusal)
// and never retries: a failed session is data, and a retry is a decision taken by hand.
// Appends one JSON line per session to <protocol folder>/run-all.log.
// Usage: node resized/run-all.cjs C:/tmp/study2-resized/protocol.json
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const protocolFile = path.resolve(process.argv[2]);
const folder = path.dirname(protocolFile);
const frozen = JSON.parse(fs.readFileSync(path.join(folder, 'results', 'frozen.json'), 'utf8'));
const log = line => fs.appendFileSync(path.join(folder, 'run-all.log'), JSON.stringify({ at: new Date().toISOString(), ...line }) + '\n');
const runner = path.join(__dirname, '..', 'tools', 'runner.cjs');

for (const id of frozen.order) {
  const [, runId, n] = id.match(/^(.+)-s(\d)$/);
  if (fs.existsSync(path.join(folder, 'results', runId, 'sessions', 's' + n, 'result.json'))) continue;
  log({ id, event: 'start' });
  const r = spawnSync(process.execPath, [runner, 'run', protocolFile, id], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const last = (r.stdout || '').trim().split('\n').pop();
  log({ id, event: 'end', exit: r.status, result: last, stderr: (r.stderr || '').slice(-1500) });
  if (r.status !== 0) { console.error('Stopped at ' + id + ' (exit ' + r.status + '): ' + (r.stderr || '').slice(-800)); process.exit(1); }
  console.log(last);
}
console.log('all sessions in the frozen order have a result');
