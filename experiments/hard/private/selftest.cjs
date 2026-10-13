'use strict';

const path = require('node:path');
const { grade } = require('../grade.cjs');

async function main() {
  const root = path.resolve(__dirname, '..');
  const baseline = await grade(path.join(root, 'seed'));
  if (baseline.failed === 0) throw new Error('the starter baseline unexpectedly passed');

  const reference = await grade(path.join(root, 'private', 'reference'));
  if (reference.failed !== 0 || reference.passed !== reference.total) {
    throw new Error('the correct reference did not pass every grader check');
  }

  const expected = new Map([
    ['conflict-ignored', 'conflicting ID payload rejects and preserves snapshot'],
    ['publish-before-write', 'failed write leaves memory and bytes unchanged and retry may reuse ID'],
    ['unserialized', 'overlapping transfers commit in invocation order and use latest balances'],
    ['reserve-id-on-failure', 'failed write leaves memory and bytes unchanged and retry may reuse ID']
  ]);
  const mutants = [];
  for (const [name, expectedCheck] of expected) {
    const result = await grade(path.join(root, 'private', 'mutants', name));
    const detected = result.checks.some((check) => check.name === expectedCheck && !check.pass);
    if (!detected) throw new Error('mutant ' + name + ' escaped expected check: ' + expectedCheck);
    mutants.push({ name, detected, failedChecks: result.checks.filter((check) => !check.pass).map((check) => check.name) });
  }

  return {
    baselineFails: baseline.failed > 0,
    referencePasses: reference.failed === 0,
    mutantsDetected: mutants.length,
    mutantCount: expected.size,
    mutants
  };
}

main().then((result) => {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}).catch((error) => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
});



