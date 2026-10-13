'use strict';
// Writes tasks/manifest-resized.sha256: the SHA-256 of every input the resized study's six tasks use
// (bundles, prompts, graders, hidden tests, references, broken variants, decision points, wheels and
// requirement lists). The pilot's tasks/manifest.sha256 is left as it was. Refuses to overwrite.
// Usage: node tasks/manifest.cjs        Check later with: node tasks/manifest.cjs --check
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const here = __dirname;
const OUT = path.join(here, 'manifest-resized.sha256');
const SKIP = /(^|\/)(private\/env|private\/baseline-tests|grades|cal|__pycache__)(\/|$)|\.log$|calibration\.json$/;
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(here, file))).digest('hex');

function inputs() {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(here, dir), { withFileTypes: true })) {
      const rel = dir + '/' + entry.name;
      if (SKIP.test(rel)) continue;
      if (entry.isDirectory()) walk(rel); else out.push(rel);
    }
  };
  for (const task of ['tablib', 'watson', 'fastapi', 'mlflow']) walk(task);
  for (const line of fs.readFileSync(path.join(here, 'manifest.sha256'), 'utf8').split('\n').filter(Boolean)) out.push(line.slice(66));
  for (const dir of ['restart/wheels', 'public/wheels']) for (const name of fs.readdirSync(path.join(here, dir))) out.push(dir + '/' + name);
  out.push('two_session.cjs', 'fb.cjs', 'calibrate.cjs', 'manifest.cjs', 'restart/private/decision-points.json');
  return [...new Set(out)].sort();
}

if (process.argv.includes('--check')) {
  const lines = fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean);
  const changed = lines.filter(line => sha(line.slice(66)) !== line.slice(0, 64)).map(line => line.slice(66));
  console.log(changed.length ? 'CHANGED: ' + changed.join(', ') : lines.length + ' inputs unchanged');
  process.exitCode = changed.length ? 1 : 0;
} else {
  const files = inputs();
  fs.writeFileSync(OUT, files.map(file => sha(file) + '  ' + file).join('\n') + '\n', { flag: 'wx' });
  console.log(files.length + ' files hashed into ' + path.basename(OUT));
}
