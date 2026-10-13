'use strict';
// Checks the resized study's books (task 11): every session in the frozen order has a result or is
// listed as not started; each ledger entry equals its session's recorded tokens; every review answer
// has a ledger entry; the 12 main runs are graded. Usage: node resized/verify.cjs <protocol.json>
const fs = require('node:fs');
const path = require('node:path');
const budget = require('../tools/budget.cjs');

const protocolFile = path.resolve(process.argv[2]);
const folder = path.dirname(protocolFile);
const protocol = JSON.parse(fs.readFileSync(protocolFile, 'utf8'));
const frozen = JSON.parse(fs.readFileSync(path.join(folder, 'results', 'frozen.json'), 'utf8'));
const ledger = new Map(budget.load().entries.map(e => [e.id, e]));
const problems = [], sessions = [];
for (const id of frozen.order) {
  const [, runId, n] = id.match(/^(.+)-s(\d)$/);
  const file = path.join(folder, 'results', runId, 'sessions', 's' + n, 'result.json');
  if (!fs.existsSync(file)) { sessions.push({ id, status: 'not started' }); continue; }
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = ledger.get(protocol.studyId + '.' + id);
  if (!entry) problems.push(id + ': no ledger entry');
  else if (entry.tokens !== result.totalTokens) problems.push(id + ': ledger ' + entry.tokens + ' != result ' + result.totalTokens);
  sessions.push({ id, status: result.status, tokens: result.totalTokens });
}
const main = JSON.parse(fs.readFileSync(path.join(__dirname, 'main-runs.json'), 'utf8')).studies[0].runs;
for (const run of main) if (!fs.existsSync(path.join(folder, 'results', run, 'grade.json'))) problems.push(run + ': not graded');
const reviewRuns = fs.existsSync(path.join(folder, 'reviews', 'runs')) ? fs.readdirSync(path.join(folder, 'reviews', 'runs')) : [];
for (const id of reviewRuns) if (![...ledger.keys()].some(k => k.endsWith('review.' + id))) problems.push('review ' + id + ': no ledger entry');
const studyTokens = sessions.reduce((sum, s) => sum + (s.tokens || 0), 0);
const reviewTokens = [...ledger.values()].filter(e => e.kind === 'review' && e.id.startsWith(protocol.studyId)).reduce((sum, e) => sum + (e.tokens || 0), 0);
console.log(JSON.stringify({ sessions, studyTokens, reviews: reviewRuns.length, reviewTokens, problems }, null, 2));
process.exitCode = problems.length ? 1 : 0;
