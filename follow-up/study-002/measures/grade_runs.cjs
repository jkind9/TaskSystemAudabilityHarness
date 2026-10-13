'use strict';
// Grades every run of a protocol once all its sessions have ended (resized study, task 11; the pilot's
// pilot/grade-pilot.cjs stays as evidence). Two-session tasks: the final repository is graded in place,
// and session 1's end state is rebuilt from its snapshot diff in a scratch clone and graded too.
// FeatureBench tasks: the final diff goes to FeatureBench's evaluator in WSL, which needs that task's
// image pulled, so --tasks limits a call to the tasks whose images are present.
// Grades are written once: results/<run>/grade.json and, for two-session runs, grade-s1.json.
// Usage: node measures/grade_runs.cjs <protocol.json> [--tasks a,b] [--runs x,y]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('../tools/lib.cjs');
const runner = require('../tools/runner.cjs');
const { workingTreeHash } = require('../tools/snapshot.cjs');

const TWO_SESSION = { restart: 'tasks/restart/grade.cjs', tablib: 'tasks/tablib/grade.cjs', watson: 'tasks/watson/grade.cjs' };
const FEATUREBENCH = new Set(['public', 'fastapi', 'mlflow']);

const node = (script, args) => lib.run(process.execPath, [path.join(lib.studyRoot, script), ...args], { timeout: 60 * 60 * 1000 });

/** The grader command for one task, as [script, args]; out is where the grade JSON must end up. */
function graderFor(task, { repo, diff, label, out }) {
  if (TWO_SESSION[task]) return [TWO_SESSION[task], [repo, out]];
  if (task === 'public') return ['tasks/public/grade.cjs', [label, diff, out]];
  if (FEATUREBENCH.has(task)) return ['tasks/fb.cjs', ['grade', path.join(lib.studyRoot, 'tasks', task), label, diff]];
  throw new Error('No grader for task ' + task);
}

function grade(task, inputs) {
  const [script, args] = graderFor(task, inputs);
  const result = node(script, args);
  // fb.cjs prints its grade instead of writing it to a given path.
  if (script === 'tasks/fb.cjs' && result.status === 0) fs.writeFileSync(inputs.out, result.stdout.trim() + '\n', { flag: 'wx' });
  if (!fs.existsSync(inputs.out)) throw new Error(task + ' grader wrote no result: ' + (result.stderr || '').slice(0, 800));
}

/** Session 1's end state rebuilt from its snapshot diff, graded in a scratch clone. */
function gradeSessionOne(task, spec, diffFile, out) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'study2-grade-s1-'));
  try {
    const repo = path.join(scratch, 'repo');
    lib.git(['-c', 'core.autocrlf=false', 'clone', '-q', '-c', 'core.autocrlf=false', '--branch', spec.ref, path.resolve(lib.studyRoot, spec.bundle), repo], scratch);
    if (fs.readFileSync(diffFile, 'utf8').trim()) lib.git(['apply', '--whitespace=nowarn', diffFile], repo);
    grade(task, { repo, out });
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
  fs.mkdirSync(outDir, { recursive: true });
  const diff = path.join(last.dir, 'snapshot', 'diff-from-baseline.patch');
  if (FEATUREBENCH.has(runSpec.task)) {
    grade(runSpec.task, { diff, label: protocol.studyId + '-' + runSpec.id, out: finalOut });
    return { runId: runSpec.id, status: 'graded', from: 's' + last.n };
  }
  const repo = path.join(resultsDir, runner.runFolder(ctx, runSpec.id), 'repo');
  const snapshot = lib.readJson(path.join(last.dir, 'snapshot', 'snapshot.json'));
  if (workingTreeHash(repo) !== snapshot.workingTreeSha256) throw new Error('Repository changed since its last snapshot: ' + runSpec.id);
  grade(runSpec.task, { repo, out: finalOut });
  const firstDiff = path.join(slots.find(s => s.n === 1).dir, 'snapshot', 'diff-from-baseline.patch');
  if (runSpec.sessions.length > 1 && fs.existsSync(firstDiff)) gradeSessionOne(runSpec.task, protocol.tasks[runSpec.task], firstDiff, path.join(outDir, 'grade-s1.json'));
  return { runId: runSpec.id, status: 'graded', from: 's' + last.n };
}

function gradeAll(protocolFile, onlyTasks, onlyRuns) {
  const protocol = lib.readJson(protocolFile);
  const resultsDir = path.join(path.dirname(protocolFile), 'results');
  const summaryFile = path.join(path.dirname(protocolFile), 'grading.json');
  const previous = fs.existsSync(summaryFile) ? lib.readJson(summaryFile).runs : [];
  const runs = protocol.runs.filter(r => (!onlyTasks || onlyTasks.includes(r.task)) && (!onlyRuns || onlyRuns.includes(r.id))).map(r => gradeRun(protocol, resultsDir, r));
  const merged = [...previous.filter(p => !runs.some(r => r.runId === p.runId)), ...runs.filter(r => r.status !== 'already graded')];
  lib.atomicJson(summaryFile, { at: new Date().toISOString(), runs: merged });
  return runs;
}

module.exports = { gradeAll, graderFor, TWO_SESSION, FEATUREBENCH };
if (require.main === module) {
  const list = flag => { const at = process.argv.indexOf(flag); return at > 0 ? process.argv[at + 1].split(',') : null; };
  try { console.log(JSON.stringify(gradeAll(path.resolve(process.argv[2]), list('--tasks'), list('--runs')), null, 2)); }
  catch (error) { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; }
}
