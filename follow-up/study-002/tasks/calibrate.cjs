'use strict';
// Every task's grader is calibrated: the starting state fails, the reference passes, broken variants fail.
// Pilot tasks (task 03): restart and public. Resized study (task 10): tablib and watson (two-session,
// offline) and fastapi and mlflow (FeatureBench, graded in Docker through WSL).
// The offline calibrations run here (about 1 minute each). The Docker ones take minutes per variant and
// need each image pulled, so by default their last saved result is checked; --docker re-runs them.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runNode(dir, args) {
  return spawnSync(process.execPath, args, { cwd: path.join(__dirname, dir), encoding: 'utf8', stdio: 'inherit' }).status === 0;
}
function saved(dir, minimum) {
  const file = path.join(__dirname, dir, 'calibration.json');
  if (!fs.existsSync(file)) { console.log('MISSING ' + dir + ' calibration.json'); return false; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const r of data.results) console.log((r.asExpected ? 'ok    ' : 'WRONG ') + dir + ' ' + r.name + ' (saved ' + data.at + ')');
  return data.results.length >= minimum && data.results.every(r => r.asExpected);
}

const docker = process.argv.includes('--docker');
const checks = [
  ['restart', () => runNode('restart', ['calibrate.cjs'])],
  ['tablib', () => runNode('tablib', ['grade.cjs', 'calibrate'])],
  ['watson', () => runNode('watson', ['grade.cjs', 'calibrate'])],
  ['public', () => (docker ? runNode('public', ['calibrate.cjs']) : saved('public', 5))],
  ['fastapi', () => (docker ? runNode('.', ['fb.cjs', 'calibrate', 'fastapi']) : saved('fastapi', 5))],
  ['mlflow', () => (docker ? runNode('.', ['fb.cjs', 'calibrate', 'mlflow']) : saved('mlflow', 5))],
];
const failed = [];
for (const [name, check] of checks) {
  console.log('== ' + name);
  if (!check()) failed.push(name);
}
console.log(failed.length ? 'NOT CALIBRATED: ' + failed.join(', ') : 'all 6 graders calibrated');
process.exitCode = failed.length ? 1 : 0;
