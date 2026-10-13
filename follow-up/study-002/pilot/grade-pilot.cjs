'use strict';
// Grades every pilot run with the task 03 graders, after all sessions have ended (task 05).
// Restart runs: the final repository (after session 2) is graded in place; session 1's end state is also
// graded, rebuilt in a scratch clone from session 1's snapshot diff. Public runs: the final diff goes to
// FeatureBench's evaluator in WSL. Grades are written once: results/<run>/grade.json (final) and
// grade-s1.json (restart session 1). A run with nothing to grade gets a reason in pilot/grading.json.
// Usage: node pilot/grade-pilot.cjs pilot/composition.json
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('../tools/lib.cjs');
const runner = require('../tools/runner.cjs');
const { workingTreeHash } = require('../tools/snapshot.cjs');

const node = (script, args) => lib.run(process.execPath, [path.join(lib.studyRoot, script), ...args], { timeout: 45 * 60 * 1000 });

function gradeRestart(repo, out) {
  const graded = node('tasks/restart/grade.cjs', [repo, out]);
  if (!fs.existsSync(out)) throw new Error('restart grader wrote no result: ' + graded.stderr.slice(0, 800));
}

/** Session 1's end state rebuilt from its snapshot diff, graded in a scratch clone. */
function gradeRestartSessionOne(protocol, diffFile, out) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'study2-grade-s1-'));
  try {
    const repo = path.join(scratch, 'repo');
    const task = protocol.tasks.restart;
    lib.git(['-c', 'core.autocrlf=false', 'clone', '-q', '-c', 'core.autocrlf=false', '--branch', task.ref, path.resolve(lib.studyRoot, task.bundle), repo], scratch);
    if (fs.readFileSync(diffFile, 'utf8').trim()) lib.git(['apply', '--whitespace=nowarn', diffFile], repo);
    gradeRestart(repo, out);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

function gradeRun(protocol, resultsDir, runSpec) {
  const ctx = { resultsDir };
  const outDir = path.join(resultsDir, runSpec.id);
  const finalOut = path.join(outDir, 'grade.json');
  if (fs.existsSync(finalOut)) return { runId: runSpec.id, status: 'already graded' };
  const slots = runSpec.sessions.map(n => ({ n, ...runner.slotRecord(ctx, runSpec.id, n) }));
  const last = [...slots].reverse().find(s => fs.existsSync(path.join(s.dir, 'snapshot', 'diff-from-baseline.patch')));
  if (!last) return { runId: runSpec.id, status: 'not graded', reason: 'no session left a snapshot' };
  const diff = path.join(last.dir, 'snapshot', 'diff-from-baseline.patch');
  if (runSpec.task === 'public') {
    node('tasks/public/grade.cjs', ['pilot-' + runSpec.id, diff, finalOut]);
    if (!fs.existsSync(finalOut)) return { runId: runSpec.id, status: 'grader failed' };
    return { runId: runSpec.id, status: 'graded', from: 's' + last.n };
  }
  const repo = path.join(resultsDir, runner.runFolder(ctx, runSpec.id), 'repo');
  const snapshot = lib.readJson(path.join(last.dir, 'snapshot', 'snapshot.json'));
  if (workingTreeHash(repo) !== snapshot.workingTreeSha256) throw new Error('Repository changed since its last snapshot: ' + runSpec.id);
  gradeRestart(repo, finalOut);
  const first = slots.find(s => s.n === 1);
  const firstDiff = path.join(first.dir, 'snapshot', 'diff-from-baseline.patch');
  if (runSpec.sessions.length > 1 && fs.existsSync(firstDiff)) gradeRestartSessionOne(protocol, firstDiff, path.join(outDir, 'grade-s1.json'));
  return { runId: runSpec.id, status: 'graded', from: 's' + last.n };
}

/** `file` is a protocol or pilot/composition.json; only the runs it names are graded. */
function gradeAll(file) {
  const { studySet } = require('../measures/evidence.cjs');
  const summary = studySet(file).runs.map(r => {
    const runSpec = r.protocol.runs.find(spec => spec.id === r.runId);
    return { ...gradeRun(r.protocol, path.join(r.studyDir, 'results'), runSpec), protocol: path.relative(lib.studyRoot, r.protocolFile) };
  });
  lib.atomicJson(path.join(lib.studyRoot, 'pilot', 'grading.json'), { at: new Date().toISOString(), runs: summary });
  return summary;
}

module.exports = { gradeAll, gradeRestartSessionOne };
if (require.main === module) {
  try { console.log(JSON.stringify(gradeAll(path.resolve(process.argv[2])), null, 2)); }
  catch (error) { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; }
}
