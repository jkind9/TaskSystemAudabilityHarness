#!/usr/bin/env node

/**
 * Self-test for hyperparam-gate.js (PreToolUse, blocking) and the E6/E7
 * hyperparameter checks in task-plan-lint.js (task 67).
 * Run: node ~/.claude/scripts/hooks/tests/test_hyperparam_gate.js
 * Exit 0 iff all assertions pass.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, '..', 'hyperparam-gate.js');
const LINT = path.join(__dirname, '..', '..', 'task-plan-lint.js');

let failures = 0;
function runHook(input) {
  return spawnSync('node', [HOOK], { input, encoding: 'utf8' });
}
function check(name, input, wantExit, wantStderrMatch) {
  const r = runHook(input);
  let ok = r.status === wantExit;
  if (ok && wantStderrMatch) ok = wantStderrMatch.test(r.stderr);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + ' (exit=' + r.status + ')');
  if (!ok) failures++;
}
const payload = (ti) => JSON.stringify({ tool_input: ti });

const ENTRY_NO_DICT = [
  'import argparse',
  'def main():',
  '    ap = argparse.ArgumentParser()',
  '    ap.add_argument("--stride", type=int, default=4)',
  'if __name__ == "__main__":',
  '    main()',
].join('\n');
const ENTRY_WITH_DICT = 'HYPERPARAMETERS = {\n    "stride": 4,\n}\n' + ENTRY_NO_DICT;

// ---- hook: Write cases ----------------------------------------------------

check('Write experiment entry .py without dict blocks', payload({
  file_path: 'C:/repo/supplement_experiments/score_new.py',
  content: ENTRY_NO_DICT,
}), 2, /HYPERPARAM/);

check('Write experiment entry .py with dict passes', payload({
  file_path: 'C:/repo/supplement_experiments/score_new.py',
  content: ENTRY_WITH_DICT,
}), 0);

check('Write same content outside an experiments dir passes', payload({
  file_path: 'C:/repo/src/tool.py',
  content: ENTRY_NO_DICT,
}), 0);

check('Write non-entry module in experiments dir passes', payload({
  file_path: 'C:/repo/experiments/util.py',
  content: 'def helper(x):\n    return x + 1\n',
}), 0);

check('Write entry .py with escape line passes', payload({
  file_path: 'C:/repo/experiments/probe.py',
  content: '# hyperparams n/a: pure plotting script, no tunable values\n' + ENTRY_NO_DICT,
}), 0);

check('Write test file in experiments dir passes', payload({
  file_path: 'C:/repo/experiments/tests/test_score.py',
  content: ENTRY_NO_DICT,
}), 0);

check('Write non-py passes', payload({
  file_path: 'C:/repo/experiments/notes.md',
  content: ENTRY_NO_DICT,
}), 0);

check('Malformed stdin fails open', 'not json', 0);

// ---- hook: Edit cases (target on disk) ------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpgate-'));
const expDir = path.join(tmp, 'experiments');
fs.mkdirSync(expDir);

const declared = path.join(expDir, 'declared.py');
fs.writeFileSync(declared, ENTRY_WITH_DICT);
check('Edit of script that already declares dict passes', payload({
  file_path: declared,
  old_string: 'default=4',
  new_string: 'default=8',
}), 0);

const undeclared = path.join(expDir, 'undeclared.py');
fs.writeFileSync(undeclared, ENTRY_NO_DICT);
check('Edit of undeclared entry script blocks', payload({
  file_path: undeclared,
  old_string: 'default=4',
  new_string: 'default=8',
}), 2, /HYPERPARAM/);

check('Edit adding the dict to an undeclared script passes', payload({
  file_path: undeclared,
  old_string: 'import argparse',
  new_string: 'import argparse\nHYPERPARAMETERS = {"stride": 4}',
}), 0);

// ---- lint: E6/E7 ----------------------------------------------------------

function lintTask(name, frontExtra, body) {
  const p = path.join(tmp, name + '.md');
  fs.writeFileSync(p, [
    '---',
    'id: "T1"',
    'title: probe',
    'status: in_progress',
    'priority: MED',
    'type: infra',
    frontExtra,
    'docs: []',
    '---',
    '',
    '# Task T1 — probe',
    '',
    body,
  ].join('\n'));
  return spawnSync('node', [LINT, p], { encoding: 'utf8' });
}
function checkLint(name, r, wantExit, wantOutMatch, wantOutAbsent) {
  let ok = r.status === wantExit;
  if (ok && wantOutMatch) ok = wantOutMatch.test(r.stdout);
  if (ok && wantOutAbsent) ok = !wantOutAbsent.test(r.stdout);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + ' (exit=' + r.status + ')');
  if (!ok) failures++;
}

const EXP_FILES = 'files:\n  - experiments/score_new.py';
const HOW = '## How\n\n| Claim | Existing owner | Callers/consumers | Evidence |\n|---|---|---|---|\n| nothing comparable exists | - | - | searched experiments/ |\n';

checkLint('lint: experiment task without Hyperparameters section -> E6 error',
  lintTask('t_e6', EXP_FILES, HOW), 1, /E6/);

checkLint('lint: unstamped hyperparameter row -> E7 error',
  lintTask('t_e7', EXP_FILES, HOW +
    '\n## Hyperparameters\n\n| name | value | source |\n|---|---|---|\n| stride | 4 | looked reasonable |\n'),
  1, /E7/);

checkLint('lint: stamped rows pass clean',
  lintTask('t_ok', EXP_FILES, HOW +
    '\n## Hyperparameters\n\n| name | value | source |\n|---|---|---|\n| stride | 4 | inherited experiments/phys_ad_eval.py:493 |\n| cap | 1000 | deviates from receipt_v1.json because randomized draw, confirmed 2026-08-30 |\n'),
  0, null, /E[67]/);

checkLint('lint: deviates row without confirmed -> E7 error',
  lintTask('t_dev', EXP_FILES, HOW +
    '\n## Hyperparameters\n\n| name | value | source |\n|---|---|---|\n| cap | 1000 | deviates from receipt_v1.json |\n'),
  1, /E7/);

checkLint('lint: escape line passes',
  lintTask('t_esc', EXP_FILES, HOW + '\nhyperparameters n/a: doc-only sweep, no script runs\n'),
  0, null, /E[67]/);

checkLint('lint: section with only placeholder row -> E6 error',
  lintTask('t_ph', EXP_FILES, HOW +
    '\n## Hyperparameters\n\n| name | value | source |\n|---|---|---|\n| _every tunable value_ | _value_ | _where it came from_ |\n'),
  1, /E6/);

checkLint('lint: non-experiment task needs no section',
  lintTask('t_nonexp', 'files:\n  - src/util.py', HOW), 0, null, /E[67]/);

// ---------------------------------------------------------------------------

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? 'ALL OK' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
