'use strict';
// FeatureBench instances for the resized study (task 10): extract one from the pinned dataset, build its
// starting repository with FeatureBench's own Level-1 steps, grade a diff with `fb eval`, and calibrate.
// The pilot's tasks/public/ keeps its own grade.cjs as evidence; new instances use this file.
// Usage:
//   node tasks/fb.cjs extract <index> <task-dir>     instance.json, prompt.original.md, private/{mask,test}.patch
//   node tasks/fb.cjs baseline <task-dir>            baseline.bundle and private/reference-solution.patch (Docker)
//   node tasks/fb.cjs prompt <task-dir>              prompt.md with the pilot's /testbed rewrites
//   node tasks/fb.cjs grade <task-dir> <label> <patch-file>
//   node tasks/fb.cjs calibrate <task-dir>           starter, reference and up to 3 drop-one-file variants
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DATASET_REVISION = '76b4a4566e04f4bcc13c35125d4f301791efa736';
const FB_COMMIT = '8d4e347ec57546685c5a87e8676bf575db022ea6';
const PARQUET = '$HOME/.cache/huggingface/hub/datasets--LiberCoders--FeatureBench/snapshots/' + DATASET_REVISION + '/data/fast-00000-of-00001.parquet';
const FB_DIR = '$HOME/fb-study/FeatureBench';

function toWsl(windowsPath) {
  const resolved = path.resolve(windowsPath).replace(/\\/g, '/');
  return '/mnt/' + resolved[0].toLowerCase() + resolved.slice(2);
}
function wsl(script) {
  // The script goes in on stdin: wsl.exe argument passing drops line breaks and ~ expansion.
  const r = spawnSync('wsl', ['-d', 'Ubuntu', '--', 'bash', '-ls'], { input: script + '\n', encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60 * 1000 });
  if (r.error) throw r.error;
  return { status: r.status, out: (r.stdout + r.stderr).replace(/\0/g, '') };
}
function docker(args, options = {}) {
  const r = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024, ...options });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('docker ' + args[0] + ' failed: ' + r.stderr.slice(0, 2000));
  return r.stdout;
}
const readInstance = dir => JSON.parse(fs.readFileSync(path.join(dir, 'instance.json'), 'utf8'));

function extract(index, dir) {
  fs.mkdirSync(path.join(dir, 'private'), { recursive: true });
  const out = toWsl(dir);
  const r = wsl([
    'set -e', `cd ${FB_DIR} && test "$(git rev-parse HEAD)" = "${FB_COMMIT}"`,
    `uv run python - <<'PY'`,
    'import json, pyarrow.parquet as pq, os',
    `rows = pq.read_table(os.path.expandvars("${PARQUET}")).to_pylist()`,
    `r = rows[${Number(index)}]`,
    `out = "${out}"`,
    'open(out + "/private/mask.patch", "w", newline="").write(r["patch"])',
    'open(out + "/private/test.patch", "w", newline="").write(r["test_patch"])',
    'open(out + "/prompt.original.md", "w", newline="").write(r["problem_statement"])',
    `meta = {k: r[k] for k in ("instance_id", "repo", "base_commit", "image_name", "FAIL_TO_PASS", "PASS_TO_PASS", "repo_settings")}`,
    `meta.update(dataset="LiberCoders/FeatureBench", split="fast", dataset_version="v1.1", dataset_revision="${DATASET_REVISION}", featurebench_tool_commit="${FB_COMMIT}", index=${Number(index)})`,
    'open(out + "/instance.json", "w").write(json.dumps(meta, indent=2) + "\\n")',
    'PY'
  ].join('\n'));
  if (r.status !== 0) throw new Error('extract failed: ' + r.out.slice(-2000));
  return readInstance(dir);
}

/** FeatureBench Level-1 preparation (featurebench/infer/runtime.py _initialize_level1), then a bundle. */
function baseline(dir) {
  const instance = readInstance(dir);
  const name = 'study2-fbprep-' + process.pid;
  const fixes = instance.repo === 'mlflow/mlflow' ? 'rm -rf /testbed/libs/skinny/mlflow /testbed/libs/tracing/mlflow' : 'true';
  const f2p = instance.FAIL_TO_PASS.map(t => '"/testbed/' + t.replace(/^\/testbed\//, '') + '"').join(' ');
  docker(['run', '-d', '--name', name, '--entrypoint', 'sleep', instance.image_name, 'infinity']);
  try {
    docker(['cp', path.join(dir, 'private', 'mask.patch'), name + ':/tmp/mask.patch']);
    // Same tree as FeatureBench: mask applied, F2P tests deleted, fixes applied, bytecode cleared. The
    // fixes and bytecode cleanup touch paths the mask does not, so they run first; an "original" commit
    // then lets us diff the reference exactly (without the F2P tests, which the evaluator adds itself).
    const init = 'rm -rf .git && git init -q -b main && git config user.email fb@bench.com && git config user.name FeatureBench';
    const exclude = instance.FAIL_TO_PASS.map(t => "':(exclude)" + t.replace(/^\/testbed\//, '') + "'").join(' ');
    const script = [
      'set -e', 'rm -rf /testbed/* && cp -r /root/my_repo/* /testbed/ && rm -rf /root/my_repo', 'cd /testbed', fixes,
      "find . -type d -name __pycache__ -prune -exec rm -rf -- {} + && find . -type f \\( -name '*.pyc' -o -name '*.pyo' \\) -delete",
      init, 'git add -A', 'git commit -q -m original',
      'git apply --whitespace=fix /tmp/mask.patch', 'rm -f ' + f2p, 'git add -A', 'git commit -q -m masked',
      'git diff --binary HEAD HEAD~1 -- . ' + exclude + ' > /tmp/reference-solution.patch',
      init, 'git add -A && git commit -q -m "Initial commit for FeatureBench evaluation" --allow-empty',
      'git bundle create /tmp/baseline.bundle main',
      'git rev-parse HEAD && git branch --show-current'
    ].join('\n');
    const out = docker(['exec', name, 'bash', '-c', script]);
    docker(['cp', name + ':/tmp/baseline.bundle', path.join(dir, 'baseline.bundle')]);
    docker(['cp', name + ':/tmp/reference-solution.patch', path.join(dir, 'private', 'reference-solution.patch')]);
    const [commit, branch] = out.trim().split('\n').slice(-2);
    const meta = { ...instance, baseline_commit: commit, baseline_ref: branch || 'master' };
    fs.writeFileSync(path.join(dir, 'instance.json'), JSON.stringify(meta, null, 2) + '\n');
    return meta;
  } finally {
    spawnSync('docker', ['rm', '-f', name], { windowsHide: true });
  }
}

/** prompt.md: the problem statement with the pilot's four /testbed rewrites (runs work in a Windows clone). */
const PROMPT_REWRITES = [
  ['under `/testbed/`,', 'in this repository,'],
  ['code under the `/testbed/` directory,', 'code in this repository,'],
  ['/testbed                   #', '.                   #'],
  ['Path: `/testbed/', 'Path: `']
];
function prompt(dir) {
  let text = fs.readFileSync(path.join(dir, 'prompt.original.md'), 'utf8');
  for (const [from, to] of PROMPT_REWRITES) text = text.split(from).join(to);
  if (text.includes('/testbed')) throw new Error('unhandled /testbed path left in ' + dir);
  fs.writeFileSync(path.join(dir, 'prompt.md'), text, { flag: 'wx' });
  return text.length;
}

function grade(dir, label, patchFile) {
  const instance = readInstance(dir);
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(label)) throw new Error('bad label');
  const local = path.join(dir, 'grades', label);
  if (fs.existsSync(local)) throw new Error('grade already exists, refusing to overwrite: ' + label);
  fs.mkdirSync(local, { recursive: true });
  fs.writeFileSync(path.join(local, 'prediction.jsonl'), JSON.stringify({
    instance_id: instance.instance_id, model_name_or_path: label, model_patch: fs.readFileSync(patchFile, 'utf8'), n_attempt: 1, success: true
  }) + '\n', { flag: 'wx' });
  const remote = '$HOME/fb-study/grades/' + path.basename(dir) + '-' + label;
  const run = wsl([
    'set -e', `cd ${FB_DIR} && test "$(git rev-parse HEAD)" = "${FB_COMMIT}"`,
    `test ! -e ${remote} && mkdir -p ${remote}`,
    `cp "${toWsl(path.join(local, 'prediction.jsonl'))}" ${remote}/prediction.jsonl`,
    `uv run fb eval -p ${remote}/prediction.jsonl --split fast --data-version ${instance.dataset_version} --task-id ${instance.instance_id} --n-concurrent 1 >${remote}/eval.log 2>&1 || echo EVAL_EXIT=$?`,
    `cat ${remote}/report.json`
  ].join('\n'));
  fs.writeFileSync(path.join(local, 'wsl-output.txt'), run.out);
  const summary = JSON.parse(run.out.slice(run.out.indexOf('{'))).attempt_1;
  const result = {
    label, instance: instance.instance_id, resolved: summary.resolved_instances === 1, f2pPassRate: summary.pass_rate,
    patchNotApplied: summary.not_applied_patch_empty_instances + summary.not_applied_patch_other_instances > 0,
    errors: summary.error_instances, featurebenchCommit: FB_COMMIT, datasetVersion: instance.dataset_version
  };
  fs.writeFileSync(path.join(local, 'grade.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}

/** Empty patch and drop-one-file variants must not resolve; the reference must. */
function calibrate(dir) {
  const reference = fs.readFileSync(path.join(dir, 'private', 'reference-solution.patch'), 'utf8');
  const fileDiffs = reference.split(/(?=^diff --git )/m).filter(Boolean);
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  const variants = [
    { name: 'starter', patch: '', expectResolved: false },
    { name: 'reference', patch: reference, expectResolved: true },
    ...fileDiffs.slice(0, 3).map((diff, i) => ({
      name: 'drop-' + diff.match(/^diff --git a\/(\S+)/)[1].replace(/[^a-z0-9]+/gi, '-').slice(-50),
      patch: fileDiffs.filter((_, j) => j !== i).join(''), expectResolved: false
    }))
  ];
  const results = [];
  for (const variant of variants) {
    const file = path.join(dir, 'cal', `${stamp}-${variant.name}.patch`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, variant.patch, { flag: 'wx' });
    const r = grade(dir, `cal-${stamp}-${variant.name}`, file);
    results.push({ name: variant.name, resolved: r.resolved, f2pPassRate: r.f2pPassRate, patchNotApplied: r.patchNotApplied, asExpected: r.resolved === variant.expectResolved });
    console.log((results.at(-1).asExpected ? 'ok    ' : 'WRONG ') + variant.name.padEnd(50) + JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(dir, 'calibration.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n');
  return results;
}

module.exports = { extract, baseline, prompt, grade, calibrate };
if (require.main === module) {
  const [cmd, a, b, c] = process.argv.slice(2);
  try {
    if (cmd === 'extract') console.log(JSON.stringify(extract(a, path.resolve(b)), null, 1).slice(0, 600));
    else if (cmd === 'baseline') console.log(JSON.stringify(baseline(path.resolve(a))).slice(0, 400));
    else if (cmd === 'prompt') console.log(prompt(path.resolve(a)) + ' characters');
    else if (cmd === 'grade') console.log(JSON.stringify(grade(path.resolve(a), b, path.resolve(c))));
    else if (cmd === 'calibrate') process.exitCode = calibrate(path.resolve(a)).every(r => r.asExpected) ? 0 : 1;
    else throw new Error('usage: fb.cjs extract|baseline|grade|calibrate ...');
  } catch (error) { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; }
}
