'use strict';
// Builds the lean probe fixture as a git bundle: a tiny Python package with one test and no task board,
// so a change that needs two code files must open a task (lean: task.js begin, then finish).
// Run once; refuses to overwrite.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { git } = require('../tools/lib.cjs');

const out = path.join(__dirname, 'lean-fixture.bundle');
if (fs.existsSync(out)) throw new Error('lean-fixture.bundle already exists');
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-probe-fixture-'));
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
git(['init', '-q', '-b', 'main'], repo);
git(['config', 'core.autocrlf', 'false'], repo);
write('README.md', '# Helpers\n\nSmall arithmetic helpers.\n');
write('conftest.py', '');
write('src/__init__.py', '');
write('src/helpers.py', 'def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n');
write('tests/test_helpers.py', 'from src.helpers import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n');
git(['add', '.'], repo);
git(['-c', 'user.name=Probe', '-c', 'user.email=probe@study.invalid', 'commit', '-qm', 'Lean probe fixture'], repo);
git(['bundle', 'create', out, 'main'], repo);
fs.rmSync(repo, { recursive: true, force: true });
console.log('wrote', out);
