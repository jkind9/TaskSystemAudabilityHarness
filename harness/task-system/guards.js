// Start guard for the task CLI: a HIGH or CRITICAL task needs a PASS plan review before it
// starts. Lives outside task.js, which is over the 800-line limit and may not grow.

const GUARDED = ["HIGH", "CRITICAL"];

// The frontmatter block only, so a "priority:" line in the task body is never read.
function frontmatterOf(text) {
  return (String(text).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
}
function priorityOf(text) {
  return ((frontmatterOf(text).match(/^priority:\s*["']?([A-Za-z]+)/m) || [])[1] || "").toUpperCase();
}
// "PASS" or "FAIL" from a stamp like "plan_reviewed: 2026-10-09 PASS"; null when unstamped.
function reviewVerdict(text) {
  const verdict = (frontmatterOf(text).match(/^plan_reviewed:\s*["']?\S+\s+(PASS|FAIL)\b/im) || [])[1];
  return verdict ? verdict.toUpperCase() : null;
}
function needsReviewToStart(text) {
  return GUARDED.includes(priorityOf(text)) && reviewVerdict(text) !== "PASS";
}
// The message explaining why `start` is refused, or null when the task may start.
function startRefusal(text, id) {
  if (!needsReviewToStart(text)) return null;
  return "task " + id + " is " + priorityOf(text) + " and its plan review is " + (reviewVerdict(text) || "missing") + ".\n"
    + "Run task-plan-lint and the plan-reviewer agent, then record the verdict: task.js review " + id + " PASS\n"
    + "(or pass --force to start anyway; the override is journaled). Nothing was changed.";
}

module.exports = { priorityOf, reviewVerdict, needsReviewToStart, startRefusal };
