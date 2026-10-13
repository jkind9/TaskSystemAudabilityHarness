'use strict';
// Builds the probe fixture repository as a git bundle: two small Python files and a task board
// with one in-progress task that declares only src/a.py. Run once; refuses to overwrite.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { git } = require('../tools/lib.cjs');

const out = path.join(__dirname, 'fixture.bundle');
if (fs.existsSync(out)) throw new Error('fixture.bundle already exists');
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-fixture-'));
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
git(['init', '-q', '-b', 'main'], repo);
git(['config', 'core.autocrlf', 'false'], repo);
write('README.md', '# Probe fixture\n\nTiny repository used to check the pilot setup.\n');
write('src/a.py', 'def identity(x):\n    return x\n');
write('src/helpers.py', 'def add(a, b):\n    return a + b\n');
write('task_list/README.md', '# Tasks\n');
write('task_list/open/01_add_double.md', [
  '---', 'id: "01"', 'title: Add double', 'status: in_progress', 'priority: LOW', 'type: refactor',
  'files:', '  - src/a.py', 'docs: []', '---', '', '# Task 01 - Add double', '',
  '## In plain English', '', 'Add a small helper that doubles a number.', '',
  '## Receipts', '', '| field | value |', '|---|---|', '| result | still open because this is a probe fixture |', ''
].join('\n'));
git(['add', '.'], repo);
git(['-c', 'user.name=Probe', '-c', 'user.email=probe@study.invalid', 'commit', '-qm', 'Probe fixture'], repo);
git(['bundle', 'create', out, 'main'], repo);
fs.rmSync(repo, { recursive: true, force: true });
console.log('wrote', out);
