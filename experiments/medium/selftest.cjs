'use strict';
const path = require('node:path');
const { grade } = require('./grade.cjs');
(async () => {
  const root = __dirname;
  const baseline = await grade(path.join(root, 'seed'));
  const reference = await grade(path.join(root, 'private', 'reference'));
  const names = ['no_singleflight', 'cache_rejections', 'invalidate_no_generation', 'clear_no_generation'];
  const mutants = {};
  for (const name of names) mutants[name] = await grade(path.join(root, 'private', 'mutants', name));
  const mutantDetected = Object.fromEntries(Object.entries(mutants).map(([name, report]) => [name, report.failed > 0]));
  const result = { baselineRejected: baseline.failed > 0, referenceAccepted: reference.failed === 0, mutantsDetected: mutantDetected, baseline, reference };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.baselineRejected || !result.referenceAccepted || Object.values(mutantDetected).some(detected => !detected)) process.exitCode = 1;
})().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });