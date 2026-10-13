#!/usr/bin/env node

/**
 * Self-test for plain-language-gate.js (PreToolUse, blocking).
 * Run: node ~/.claude/scripts/hooks/tests/test_plain_language_gate.js
 * Exit 0 iff all assertions pass.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, '..', 'plain-language-gate.js');

let failures = 0;
function run(input) {
  return spawnSync('node', [HOOK], { input, encoding: 'utf8' });
}
function check(name, input, wantExit, wantStderrMatch) {
  const r = run(input);
  let ok = r.status === wantExit;
  if (ok && wantStderrMatch) ok = wantStderrMatch.test(r.stderr);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + ' (exit=' + r.status + ')');
  if (!ok) failures++;
}
const payload = (ti) => JSON.stringify({ tool_input: ti });

// 1. New .md with an offender -> block
check('Write new .md with offender blocks', payload({
  file_path: 'C:/tmp/plgate_probe/README.md',
  content: 'We leverage the pipeline to deliver value.',
}), 2, /leverage/);

// 2. New .md clean -> pass
check('Write new .md clean passes', payload({
  file_path: 'C:/tmp/plgate_probe/README.md',
  content: 'The pipeline reads clips and scores them.',
}), 0);

// 3. Edit adding an offender -> block
check('Edit adding offender blocks', payload({
  file_path: 'a/b/notes.md',
  old_string: 'The gate works.',
  new_string: "It's worth noting the gate works.",
}), 2, /worth noting/);

// 4. Edit where the offender is in BOTH old and new (moving legacy text) -> pass
check('Edit moving pre-existing offender passes', payload({
  file_path: 'a/b/notes.md',
  old_string: 'We utilize X here. More prose.',
  new_string: 'More prose. We utilize X here.',
}), 0);

// 5. Overwrite of an existing file that already contains the offender -> pass
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plgate-'));
const legacy = path.join(tmp, 'legacy.md');
fs.writeFileSync(legacy, 'Historically we utilize X.\n');
check('Write keeping pre-existing offender passes', payload({
  file_path: legacy,
  content: 'Historically we utilize X.\nNew clean sentence.\n',
}), 0);
check('Write adding NEW offender to legacy file blocks', payload({
  file_path: legacy,
  content: 'Historically we utilize X.\nWe also delve into Y.\n',
}), 2, /delve/);
fs.rmSync(tmp, { recursive: true, force: true });

// 6. Exempt paths never block
check('task_list path exempt', payload({
  file_path: 'task_list/open/01_x.md',
  content: 'We leverage everything, honestly.',
}), 0);
check('.claude path exempt', payload({
  file_path: 'C:/Users/u/.claude/rules/communication-style.md',
  content: 'banned: leverage, delve',
}), 0);

// 7. Non-md files never block
check('.py file exempt', payload({
  file_path: 'src/x.py',
  content: '# we leverage numpy here',
}), 0);

// 8. Garbage stdin fails open
check('garbage stdin fails open', 'not json at all', 0);

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
