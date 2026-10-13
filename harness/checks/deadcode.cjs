'use strict';
// Dead code in the touched files: vulture for Python, knip for JavaScript, each only when it is
// already installed (the harness installs nothing). A missing tool is reported as "not checked",
// never as zero. Returns every finding; run.cjs keeps the ones on lines the task added.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const run = (exe, args, cwd) => spawnSync(exe, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const FINDING = /^(.+?):(\d+):\s*(.+)$/;

function vulture(root, files, pythonExe) {
  if (!files.length) return { skip: true };
  const probe = run(pythonExe, ['-c', 'import vulture'], root);
  if (probe.error || probe.status !== 0) return { findings: null, notes: ['vulture not installed'] };
  const result = run(pythonExe, ['-m', 'vulture', '--min-confidence', '80', ...files], root);
  const findings = result.stdout.split(/\r?\n/).map(line => line.match(FINDING)).filter(Boolean)
    .map(m => ({ file: path.resolve(root, m[1]), line: Number(m[2]), text: m[3] }));
  return { findings, notes: [] };
}

function knip(root, files) {
  if (!files.length) return { skip: true };
  const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'knip.cmd' : 'knip');
  if (!fs.existsSync(bin)) return { findings: null, notes: ['knip not installed'] };
  const result = run(bin, ['--reporter', 'compact', '--no-progress'], root);
  const wanted = new Set(files.map(f => path.resolve(f).toLowerCase()));
  const findings = result.stdout.split(/\r?\n/).map(line => line.match(FINDING)).filter(Boolean)
    .map(m => ({ file: path.resolve(root, m[1]), line: Number(m[2]), text: m[3] }))
    .filter(f => wanted.has(f.file.toLowerCase()));
  return { findings, notes: [] };
}

/** { count: number | null, note, findings } for the given absolute file paths. */
function deadCode({ root, python, javascript }, { pythonExe = 'python' } = {}) {
  const parts = [vulture(root, python, pythonExe), knip(root, javascript)].filter(p => !p.skip);
  if (!parts.length) return { count: 0, note: 'no Python or JavaScript files touched', findings: [] };
  const notes = parts.flatMap(p => p.notes);
  if (parts.every(p => p.findings === null)) return { count: null, note: notes.join('; '), findings: [] };
  const findings = parts.flatMap(p => p.findings || []);
  return { count: findings.length, note: notes.join('; '), findings };
}

module.exports = { deadCode };
