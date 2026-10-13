'use strict';
// Grader and calibration shared by the resized study's new two-session tasks (tablib, watson), in the
// shape of tasks/restart/grade.cjs (which stays as the pilot's evidence). A task folder holds
// baseline.bundle, wheels/, private/grader/ (hidden tests by group), private/reference.patch and
// private/mutants/*.patch (each a broken change applied on top of the reference).
// The grader never writes into the graded tree; it puts the tree's package on PYTHONPATH.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}

/**
 * config: { dir, baselineRef, packageInit, pythonPath, graderRequirements, groups: {part1, part2, compat},
 *           regressionDeselect: [test ids relative to tests/, with the reason in the task's README] }
 */
function makeTask(config) {
  const privateDir = path.join(config.dir, 'private');

  /** A Python environment with the task's pinned test dependencies, built offline from wheels/ once. */
  function graderPython() {
    const env = path.join(privateDir, 'env');
    const python = path.join(env, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (fs.existsSync(python)) return python;
    const made = run('python', ['-m', 'venv', env]);
    if (made.status !== 0) throw new Error('venv failed: ' + made.stderr);
    const installed = run(python, ['-m', 'pip', 'install', '-q', '--no-index', '--find-links', path.join(config.dir, 'wheels'), ...config.graderRequirements]);
    if (installed.status !== 0) {
      fs.rmSync(env, { recursive: true, force: true });  // never leave a half-built environment for the next grade
      throw new Error('offline pip install failed: ' + installed.stderr);
    }
    return python;
  }

  /** The baseline's own tests (from the frozen bundle), so a run's edited tests never grade itself. */
  function baselineTests() {
    const target = path.join(privateDir, 'baseline-tests');
    if (fs.existsSync(path.join(target, 'tests'))) return target;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-session-base-'));
    fs.rmdirSync(tmp);
    const cloned = run('git', ['-c', 'core.autocrlf=false', 'clone', '-q', path.join(config.dir, 'baseline.bundle'), tmp, '--branch', config.baselineRef]);
    if (cloned.status !== 0) throw new Error('bundle clone failed: ' + cloned.stderr);
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(path.join(tmp, 'tests'), path.join(target, 'tests'), { recursive: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    return target;
  }

  function counts(output) {
    const count = name => Number((output.match(new RegExp('(\\d+) ' + name)) || [0, 0])[1]);
    return { passed: count('passed'), failed: count('failed'), errors: count('error'), skipped: count('skipped') };
  }

  function runGroup(python, repo, cwd, files, extra = []) {
    const env = { ...process.env, PYTHONPATH: path.resolve(repo, config.pythonPath), PYTHONDONTWRITEBYTECODE: '1' };
    const result = run(python, ['-m', 'pytest', '-q', '-p', 'no:cacheprovider', '-o', 'addopts=', '--rootdir', cwd, ...files, ...extra], { cwd, env });
    const c = counts(result.stdout + result.stderr);
    return { ...c, exit: result.status, ok: result.status === 0 && c.failed === 0 && c.errors === 0 && c.passed > 0,
      tail: (result.stdout + result.stderr).split('\n').slice(-15).join('\n') };
  }

  function grade(repo) {
    if (!fs.existsSync(path.join(repo, config.packageInit))) throw new Error('not a ' + path.basename(config.dir) + ' tree: ' + repo);
    const python = graderPython();
    const groups = {};
    for (const [name, files] of Object.entries(config.groups)) groups[name] = runGroup(python, repo, path.join(privateDir, 'grader'), files);
    groups.regression = runGroup(python, repo, baselineTests(), ['tests'], config.regressionDeselect.flatMap(id => ['--deselect', 'tests/' + id]));
    return { repo: path.resolve(repo), groups, wholeTaskPass: Object.values(groups).every(group => group.ok) };
  }

  /** A fresh clone of the baseline with the given patches applied in order. */
  function variantTree(patches) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'two-session-cal-'));
    fs.rmdirSync(dir);
    const cloned = run('git', ['-c', 'core.autocrlf=false', 'clone', '-q', path.join(config.dir, 'baseline.bundle'), dir, '--branch', config.baselineRef]);
    if (cloned.status !== 0) throw new Error(cloned.stderr);
    for (const patch of patches) {
      const applied = run('git', ['apply', '--whitespace=nowarn', patch], { cwd: dir });
      if (applied.status !== 0) throw new Error('git apply ' + patch + ': ' + applied.stderr);
    }
    return dir;
  }

  /** Starter fails the new-behaviour groups and passes regression; reference passes all; each mutant fails something. */
  function calibrate() {
    const reference = path.join(privateDir, 'reference.patch');
    const variants = [
      { name: 'starter', patches: [], expect: r => !r.groups.part1.ok && !r.groups.part2.ok && !r.groups.compat.ok && r.groups.regression.ok },
      { name: 'reference', patches: [reference], expect: r => r.wholeTaskPass },
      ...fs.readdirSync(path.join(privateDir, 'mutants')).filter(f => f.endsWith('.patch')).sort().map(f => ({
        name: 'mutant:' + f.replace(/\.patch$/, ''), patches: [reference, path.join(privateDir, 'mutants', f)], expect: r => !r.wholeTaskPass
      }))
    ];
    const results = [];
    for (const variant of variants) {
      const tree = variantTree(variant.patches);
      try {
        const report = grade(tree);
        const summary = Object.fromEntries(Object.entries(report.groups).map(([k, g]) => [k, `${g.passed}p/${g.failed}f/${g.errors}e`]));
        results.push({ name: variant.name, asExpected: variant.expect(report), wholeTaskPass: report.wholeTaskPass, summary });
      } finally { fs.rmSync(tree, { recursive: true, force: true }); }
    }
    fs.writeFileSync(path.join(config.dir, 'calibration.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n');
    return results;
  }

  /** Command line: `grade <repo> [out.json]` or `calibrate`. */
  function main(argv) {
    if (argv[0] === 'calibrate') {
      const results = calibrate();
      for (const r of results) console.log((r.asExpected ? 'ok   ' : 'WRONG') + ' ' + r.name.padEnd(40) + JSON.stringify(r.summary));
      return results.every(r => r.asExpected) ? 0 : 1;
    }
    const report = grade(argv[0]);
    const text = JSON.stringify(report, null, 2) + '\n';
    if (argv[1]) fs.writeFileSync(argv[1], text, { flag: 'wx' });
    process.stdout.write(text);
    return 0;
  }

  return { grade, calibrate, main, config };
}

module.exports = { makeTask };
