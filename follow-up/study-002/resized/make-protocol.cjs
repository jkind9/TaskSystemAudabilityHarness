'use strict';
// Writes the resized study's frozen protocol (task 11) outside this study tree, which has a task board.
// Settings fixed by the owner on 2026-10-13: stock and lean on all six tasks, full on the two pilot tasks;
// one run each; gpt-6-luna, high reasoning; 30-minute sessions; delegation off (the runner always passes
// --disable multi_agent); 40M new session tokens and 4M for reviews on the shared ledger.
// Order: tasks interleave two-session and FeatureBench work; within each task, stock and lean alternate
// which goes first (3 times each); the two full reference runs come last, so the main comparison is
// complete even if the budget check stops a late, expensive session.
// Usage: node resized/make-protocol.cjs C:/tmp/study2-resized/protocol.json
const fs = require('node:fs');
const path = require('node:path');
const { boardsAbove } = require('../tools/isolation.cjs');
const budget = require('../tools/budget.cjs');

const NEW_SESSIONS = 40000000;
const NEW_REVIEWS = 4000000;
const HARNESS_COMMIT = 'ab8f166a90442095faf6990f0d2c5bff43210e4e';
const fbRequirements = task => require(path.join(__dirname, '..', 'tasks', task, 'run-requirements.json')).requirements;

const TASKS = {
  restart: { bundle: 'tasks/restart/baseline.bundle', ref: 'v4.9.0', wheels: 'tasks/restart/wheels', requirements: ['pytest==8.4.2', 'pytest-cov==6.3.0'], editableInstall: false,
    prompts: { 1: 'tasks/restart/prompt-1.md', 2: 'tasks/restart/prompt-2.md' } },
  tablib: { bundle: 'tasks/tablib/baseline.bundle', ref: 'v3.10.0', wheels: 'tasks/tablib/wheels', editableInstall: true,
    requirements: ['pytest==9.1.1', 'pytest-cov==7.1.0', 'PyYAML==6.0.3', 'openpyxl==3.1.5', 'odfpy==1.4.1', 'xlrd==2.0.2', 'xlwt==1.3.0', 'pandas==3.0.6', 'tabulate==0.10.0', 'setuptools==80.9.0', 'setuptools-scm==8.3.1', 'wheel'],
    prompts: { 1: 'tasks/tablib/prompt-1.md', 2: 'tasks/tablib/prompt-2.md' } },
  watson: { bundle: 'tasks/watson/baseline.bundle', ref: '2.1.0', wheels: 'tasks/watson/wheels', editableInstall: false,
    requirements: ['arrow==1.2.2', 'click==8.1.3', 'click-didyoumean==0.3.1', 'colorama==0.4.6', 'requests==2.28.1', 'pytest==7.1.2', 'pytest-mock==3.8.2', 'pytest-datafiles==2.0.1', 'mock==4.0.3', 'py==1.11.0'],
    prompts: { 1: 'tasks/watson/prompt-1.md', 2: 'tasks/watson/prompt-2.md' } },
  public: { bundle: 'tasks/public/baseline.bundle', ref: 'master', wheels: 'tasks/public/wheels', requirements: ['pytest==8.4.2', 'pretend==1.0.9', 'tomli_w==1.2.0', 'flit_core==3.12.0'], editableInstall: true,
    prompts: { 1: 'tasks/public/prompt.md' } },
  fastapi: { bundle: 'tasks/fastapi/baseline.bundle', ref: 'main', wheels: 'tasks/fastapi/wheels', requirements: fbRequirements('fastapi'), editableInstall: true, prompts: { 1: 'tasks/fastapi/prompt.md' } },
  mlflow: { bundle: 'tasks/mlflow/baseline.bundle', ref: 'main', wheels: 'tasks/mlflow/wheels', requirements: fbRequirements('mlflow'), editableInstall: true, prompts: { 1: 'tasks/mlflow/prompt.md' } }
};
const ORDER = ['restart', 'tablib', 'fastapi', 'watson', 'mlflow', 'public'];

function runs() {
  const out = [];
  ORDER.forEach((task, i) => {
    const sessions = Object.keys(TASKS[task].prompts).map(Number);
    for (const config of i % 2 === 0 ? ['stock', 'lean'] : ['lean', 'stock']) out.push({ id: task + '-' + config, task, config, sessions });
  });
  for (const task of ['restart', 'public']) out.push({ id: task + '-full', task, config: 'full', sessions: Object.keys(TASKS[task].prompts).map(Number) });
  return out;
}

function protocol() {
  const used = budget.totals(budget.load());
  return {
    studyId: 'study2-resized-20261013', kind: 'study',
    codexExe: 'C:/Users/jkind/.vscode/extensions/openai.chatgpt-26.1007.21434-win32-x64/bin/windows-x86_64/codex.exe',
    model: 'gpt-6-luna', reasoning: 'high', timeoutMs: 1800000, harnessCommit: HARNESS_COMMIT,
    budget: { sessions: used.sessions + NEW_SESSIONS, reviews: used.reviews + NEW_REVIEWS, firstReviewEstimate: 400000, firstSessionEstimate: 0 },
    budgetNote: `shared ledger follow-up/study-002/budget.json; at writing, sessions used ${used.sessions} and reviews ${used.reviews}; this study adds ${NEW_SESSIONS} and ${NEW_REVIEWS}`,
    tasks: TASKS, runs: runs()
  };
}

module.exports = { protocol, runs, ORDER };
if (require.main === module) {
  const out = path.resolve(process.argv[2]);
  const boards = boardsAbove(out);
  if (boards.length) throw new Error('A task board sits above the protocol folder: ' + boards.join(', '));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(protocol(), null, 2) + '\n', { flag: 'wx' });
  const p = require(out);
  console.log(p.runs.map(r => r.id + ' (' + r.sessions.length + ')').join(', '));
  console.log('sessions:', p.runs.reduce((n, r) => n + r.sessions.length, 0), 'budget:', JSON.stringify(p.budget));
}
