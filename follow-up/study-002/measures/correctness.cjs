'use strict';
// Correctness from the task 03 graders' stored output. Whole-task pass is the headline; categories passed
// are kept for partial credit, never in place of it.
const RESTART_GROUPS = ['part1', 'part2', 'compat', 'regression'];

/** tasks/restart/grade.cjs output: four test groups, each ok or not. */
function fromRestart(grade) {
  const missed = RESTART_GROUPS.filter(name => !grade.groups?.[name]?.ok);
  return { wholeTaskPass: grade.wholeTaskPass === true, categoriesPassed: RESTART_GROUPS.length - missed.length, categoriesTotal: RESTART_GROUPS.length, missed };
}

/** tasks/public/grade.cjs output: FeatureBench's resolved flag and target-test pass rate. */
function fromPublic(grade) {
  const resolved = grade.resolved === true;
  // An evaluator error leaves no pass rate: that is unknown, not a 0% failure.
  if (!resolved && !grade.patchNotApplied && (grade.f2pPassRate === null || grade.f2pPassRate === undefined || grade.errors)) {
    return { wholeTaskPass: null, reason: 'evaluator reported no pass rate' + (grade.errors ? ` (${grade.errors} error)` : ''), grade };
  }
  const missed = grade.patchNotApplied ? ['patch did not apply'] : resolved ? [] : [`target tests ${Math.round((grade.f2pPassRate ?? 0) * 1000) / 10}% passing`];
  return { wholeTaskPass: resolved, categoriesPassed: resolved ? 1 : 0, categoriesTotal: 1, f2pPassRate: grade.f2pPassRate ?? null, missed };
}

/** Study 1 grade.json: the grader's stdout holds { passed, total }. */
function fromStudyOne(grade) {
  const { passed, total } = JSON.parse(grade.stdout);
  return { wholeTaskPass: passed === total, categoriesPassed: passed, categoriesTotal: total, missed: passed === total ? [] : [`${total - passed} of ${total} checks`] };
}

function measure(evidence) {
  if (!evidence.grade) return { wholeTaskPass: null, reason: 'not graded' };
  if (evidence.source === 'study1') return fromStudyOne(evidence.grade);
  // Two-session graders (restart, tablib, watson) report test groups; FeatureBench graders report resolved.
  return evidence.grade.groups ? fromRestart(evidence.grade) : fromPublic(evidence.grade);
}

module.exports = { fromRestart, fromPublic, fromStudyOne, measure, RESTART_GROUPS };
