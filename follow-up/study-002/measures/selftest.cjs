'use strict';
// Contract tests for the value measures (task 04). No model calls.
// Run: node --test follow-up/study-002/measures/selftest.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const evidence = require('./evidence.cjs');
const plain = require('./plain_language.cjs');
const debt = require('./debt.cjs');
const correctness = require('./correctness.cjs');
const recovery = require('./recovery.cjs');
const audit = require('./auditability.cjs');
const cost = require('./cost.cjs');
const blind = require('./blind.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'study2-measures-'));
const PINNED = 'ab8f166a90442095faf6990f0d2c5bff43210e4e';
const checks = () => require('./harness_checks.cjs').loadChecks(PINNED);

/** A unified diff adding the given files (path -> lines). */
function addDiff(files) {
  return Object.entries(files).map(([file, lines]) => [
    `diff --git a/${file} b/${file}`, 'new file mode 100644', 'index 0000000..1111111', '--- /dev/null', `+++ b/${file}`,
    `@@ -0,0 +1,${lines.length} @@`, ...lines.map(line => '+' + line)
  ].join('\n')).join('\n') + '\n';
}

test('diff parsing: added, modified and deleted files with their added runs', () => {
  const text = addDiff({ 'src/new.py': ['a = 1', 'b = 2'] }) + [
    'diff --git a/src/old.py b/src/old.py', 'index 1..2 100644', '--- a/src/old.py', '+++ b/src/old.py',
    '@@ -1,3 +1,3 @@', ' keep', '-gone', '+came', ' keep2',
    'diff --git a/README.md b/README.md', 'deleted file mode 100644', '--- a/README.md', '+++ /dev/null', '@@ -1 +0,0 @@', '-x'
  ].join('\n') + '\n';
  const files = evidence.parseDiff(text);
  assert.deepEqual(files.map(f => [f.path, f.status, f.added, f.removed]), [['src/new.py', 'added', 2, 0], ['src/old.py', 'modified', 1, 1], ['README.md', 'deleted', 0, 1]]);
  assert.deepEqual(files[0].addedRuns, [['a = 1', 'b = 2']]);
});

test('plain language: prose patterns from the pinned harness checker, per 1,000 words', () => {
  const filler = Array.from({ length: 385 }, () => 'word').join(' ') + '.';
  const text = 'We leverage this. ' + filler + " It's not a cache, it's a ledger.";
  const result = plain.measureText(text, checks());
  assert.equal(result.patternHits, 2);
  assert.deepEqual(result.byPattern, { 'word-list': 1, contrast: 1 });
  assert.equal(result.patternsPer1000, Math.round((2 / result.words) * 100000) / 100);
});

test('plain language: quoted and code text is skipped; no words is unknown, not 0', () => {
  assert.equal(plain.measureText('The list names "leverage" and `leverage()` as examples.', checks()).patternHits, 0);
  assert.equal(plain.measureText('', checks()).patternsPer1000, null);
});

test('plain language: Flesch reading ease and sentence length on a known sentence', () => {
  const r = plain.measureText('The cat sat on the mat. The dog ran.', checks());
  assert.equal(r.sentences, 2);
  assert.equal(r.words, 9);
  assert.equal(r.avgSentenceLength, 4.5);
  assert.ok(r.flesch > 100 && r.flesch < 125, 'one-syllable words in short sentences score very high: ' + r.flesch);
  assert.equal(plain.measureText('', checks()).flesch, null, 'no words -> unknown, not 0');
});

test('harness checks: loaded from the pinned harness commit, with a hash of the files used', () => {
  const loaded = checks();
  assert.equal(loaded.commit, PINNED);
  assert.match(loaded.sha256, /^[0-9a-f]{64}$/);
  assert.equal(typeof loaded.prosePatterns, 'function');
  assert.throws(() => require('./harness_checks.cjs').loadChecks('main'), /full commit/);
});

test('debt: complexity share of the touched code before (baseline) and after', () => {
  const repo = tmp();
  require('../tools/lib.cjs').git(['init', '-q'], repo);
  fs.writeFileSync(path.join(repo, 'm.py'), 'def f(x):\n    return x\n');
  const lib = require('../tools/lib.cjs');
  lib.git(['add', '.'], repo);
  lib.git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base'], repo);
  const baselineCommit = lib.git(['rev-parse', 'HEAD'], repo).trim();
  const branches = Array.from({ length: 11 }, (_, i) => '    if x == ' + i + ':\n        return ' + i).join('\n');
  fs.appendFileSync(path.join(repo, 'm.py'), '\ndef g(x):\n' + branches + '\n    return -1\n');
  const diff = lib.git(['diff', baselineCommit], repo);
  const r = debt.scriptMeasures(evidence.parseDiff(diff), repo, { checks: checks(), baselineCommit });
  assert.deepEqual(r.complexityShare, { before: 0, after: 12 / 13, files: 1 });
  assert.equal(debt.scriptMeasures(evidence.parseDiff(diff), repo).complexityShare, null, 'no checker given -> unknown');
});

test('debt: the same 6-line block added twice is 1 duplicate; 5 lines is none', () => {
  const block = ['alpha = compute(1)', 'beta = compute(2)', 'gamma = alpha + beta', 'delta = gamma * 2', 'epsilon = delta - 1', 'print(epsilon)'];
  const files = evidence.parseDiff(addDiff({ 'src/a.py': block, 'src/b.py': [...block, 'tail_line = 0'] }));
  assert.equal(debt.duplicateBlocks(files).total, 1);
  const short = evidence.parseDiff(addDiff({ 'src/a.py': block.slice(0, 5), 'src/b.py': block.slice(0, 5) }));
  assert.equal(debt.duplicateBlocks(short).total, 0);
  const longer = [...block, 'zeta = 9', 'eta = 10'];
  assert.equal(debt.duplicateBlocks(evidence.parseDiff(addDiff({ 'src/a.py': longer, 'src/b.py': longer }))).total, 1, 'one long copied block is one duplicate, not three windows');
});

test('debt: script counts lines, tests added, test-file duplicates separately and files over 800 lines', () => {
  const repo = tmp();
  fs.mkdirSync(path.join(repo, 'src'));
  fs.writeFileSync(path.join(repo, 'src', 'big.py'), 'x = 1\n'.repeat(801));
  const block = ['def test_one():', '    db = make_db()', '    db.insert({"a": 1})', '    rows = db.all()', '    assert len(rows) == 1', '    db.close()'];
  const diff = addDiff({ 'src/big.py': ['x = 1'], 'tests/test_a.py': [...block, 'def test_two():', '    pass'], 'tests/test_b.py': block });
  const r = debt.scriptMeasures(evidence.parseDiff(diff), repo);
  assert.equal(r.linesAdded, 15);
  assert.deepEqual(r.filesOver800, ['src/big.py']);
  assert.equal(r.testsAdded, 3);
  assert.deepEqual([r.duplicateBlocks.source, r.duplicateBlocks.test], [0, 1]);
});

test('debt rubric: six items 0-2; a missing or out-of-range item makes the total unknown', () => {
  const items = Object.fromEntries(debt.RUBRIC.map(name => [name, { score: 2, reason: 'ok' }]));
  assert.equal(debt.rubricTotal({ rubric: items }).total, 12);
  assert.equal(debt.rubricTotal({ rubric: { ...items, dead_code: { score: 3 } } }).total, null);
  const { duplication, ...missing } = items;
  assert.equal(debt.rubricTotal({ rubric: missing }).total, null);
});

test('correctness: restart groups, public resolution, Study 1 checks', () => {
  const ok = { ok: true }, bad = { ok: false };
  assert.deepEqual(correctness.fromRestart({ groups: { part1: ok, part2: bad, compat: ok, regression: ok }, wholeTaskPass: false }),
    { wholeTaskPass: false, categoriesPassed: 3, categoriesTotal: 4, missed: ['part2'] });
  assert.equal(correctness.fromPublic({ resolved: true, f2pPassRate: 1, patchNotApplied: false }).wholeTaskPass, true);
  assert.equal(correctness.fromPublic({ resolved: false, f2pPassRate: 0.5, patchNotApplied: true }).missed[0], 'patch did not apply');
  assert.deepEqual(correctness.fromStudyOne({ stdout: JSON.stringify({ passed: 25, total: 26 }) }), { wholeTaskPass: false, categoriesPassed: 25, categoriesTotal: 26, missed: ['1 of 26 checks'] });
});

/** A Codex transcript: two read calls, then a task-file patch, then a code patch. */
function transcriptFixture() {
  const file = path.join(tmp(), 't.jsonl');
  const count = total => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: total - 10, output_tokens: 10 } } } });
  const call = input => JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input } });
  fs.writeFileSync(file, [
    count(1000), call('const r = await tools.exec_command({cmd: "Get-Content README.md"}); text(r.output);'),
    count(3000), call('const a = await tools.exec_command({cmd: "rg storage"}); const b = await tools.exec_command({cmd: "ls"});'),
    count(6000), call('text(await tools.apply_patch("*** Begin Patch\\n*** Update File: C:/r/task_list/open/01_x.md\\n@@\\n-a\\n+b\\n*** End Patch"));'),
    count(8000), call('text(await tools.apply_patch("*** Begin Patch\\n*** Update File: C:/r/tinydb/table.py\\n@@\\n-a\\n+b\\n*** End Patch"));'),
    count(9000)
  ].join('\n'));
  return file;
}

test('recovery: discovery before the first code edit (task-record edits do not count)', () => {
  const r = recovery.firstCodeEdit(transcriptFixture());
  assert.deepEqual(r, { found: true, tokensBefore: 8000, toolCallsBefore: 3, commandsBefore: 3 });
  const none = path.join(tmp(), 'none.jsonl');
  fs.writeFileSync(none, '');
  assert.deepEqual(recovery.firstCodeEdit(none), { found: false, tokensBefore: null, toolCallsBefore: 0, commandsBefore: 0 });
});

test('recovery: decision verdicts are counted; unknown verdicts are refused', () => {
  const r = recovery.decisionSummary({ points: [
    { id: 'conversion-owner', verdict: 'kept' }, { id: 'layout-boundary', verdict: 'duplicated' },
    { id: 'format1-meta', verdict: 'changed' }, { id: 'unknown-format-error', verdict: 'kept' }, { id: 'marker-after-drop', verdict: 'not_decided_in_session_1' }
  ] }, ['conversion-owner', 'layout-boundary', 'format1-meta', 'unknown-format-error', 'marker-after-drop']);
  assert.deepEqual(r, { kept: 2, changed: 1, duplicated: 1, notDecided: 1, total: 5 });
  assert.throws(() => recovery.decisionSummary({ points: [{ id: 'conversion-owner', verdict: 'maybe' }] }, ['conversion-owner']), /verdict/);
});

test('auditability: score counts correct answers, half for partial; wrong answers are reported separately', () => {
  const verdicts = ['correct', 'correct', 'partial', 'wrong', 'not_recorded', 'correct', 'partial', 'not_recorded'];
  const r = audit.scoreKey({ questions: verdicts.map((verdict, i) => ({ number: i + 1, key: 'k', verdict })) });
  assert.deepEqual(r, { score: 4, correct: 3, partial: 2, wrong: 1, notRecorded: 2, of: 8 });
  assert.equal(audit.scoreKey({ questions: verdicts.slice(0, 7).map((verdict, i) => ({ number: i + 1, verdict })) }).score, null, '7 of 8 answers -> unknown');
});

test('auditability: condensed transcript keeps the request, messages and commands, drops injected instructions, and is capped', () => {
  const file = path.join(tmp(), 't.jsonl');
  const msg = (role, text) => JSON.stringify({ type: 'response_item', payload: { type: 'message', role, content: [{ type: 'input_text', text }] } });
  const out = text => JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call_output', output: [{ type: 'input_text', text }] } });
  fs.writeFileSync(file, [msg('developer', 'SECRET INSTRUCTIONS'), msg('user', '<environment_context>x</environment_context>'), msg('user', 'Please add timestamps.'),
    JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: 'tools.exec_command({cmd: "pytest"})' } }),
    out('5 passed ' + 'y'.repeat(5000)), msg('assistant', 'Done: added timestamps.')].join('\n'));
  const text = audit.condensedTranscript([file], { outputChars: 300, totalChars: 100000 });
  assert.ok(text.includes('Please add timestamps.') && text.includes('pytest') && text.includes('Done: added timestamps.'));
  assert.ok(!text.includes('SECRET INSTRUCTIONS') && !text.includes('environment_context'));
  assert.ok(!text.includes('y'.repeat(400)), 'tool output truncated');
  assert.ok(audit.condensedTranscript([file], { outputChars: 300, totalChars: 200 }).length <= 400, 'total cap applied');
  const scrubbed = audit.condensedTranscript([file], { outputChars: 300, scrub: t => t.replace(/y{4000}/, 'SCRUBBED') });
  assert.ok(scrubbed.includes('SCRUBBED'), 'scrub runs on each entry before it is cut');
});

test('cost: fresh input is input minus cached; unknown usage stays unknown', () => {
  const s = cost.sessionCost({ usage: { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 50, reasoning_output_tokens: 20 }, elapsedSeconds: 12 });
  assert.deepEqual(s, { freshInput: 400, cachedInput: 600, output: 50, reasoning: 20, total: 1050, elapsedSeconds: 12 });
  const run = cost.runCost([s, cost.sessionCost({ usage: null, elapsedSeconds: 5 })], [{ totalTokens: 30 }]);
  assert.equal(run.total, null, 'one unknown session makes the run total unknown');
  assert.equal(run.reviewTokens, 30);
  assert.equal(run.elapsedSeconds, 17);
});

test('blind packets: private paths and run ids are replaced; the leak check finds labels in metadata and private paths in text', () => {
  const runDir = 'C:\\study\\results\\restart-full';
  const text = blind.sanitize(`See ${runDir}\\repo\\README.md and C:/study/results/restart-full/home/x; run restart-full done`, { runDir, runId: 'restart-full' });
  assert.ok(!/restart-full/.test(text), text);
  assert.ok(text.includes('<repo>/README.md'));
  const four = runDir.replaceAll('\\', '\\'.repeat(4)) + '\\'.repeat(4) + 'home';
  const escaped = blind.sanitize('cmd: "' + four + '"', { runDir, runId: 'restart-full' });
  assert.ok(!/study|restart-full/i.test(escaped), 'four-backslash JSON-in-JS paths are scrubbed too: ' + escaped);
  const spaced = { runDir: 'C:\\my study\\results\\restart-full', runId: 'restart-full' };
  const link = blind.sanitize('[a.py](/C:/my%20study/results/restart-full/repo/src/a.py)', spaced);
  assert.equal(link, '[a.py](/<repo>/src/a.py)', 'URL-encoded Markdown links are scrubbed');
  const wrapped = blind.sanitize('C:\\Users\\jkind\\Documents\\04 Personal\n    Coding\\Harness_Development\\follow-up\\study-002\\results\\restart-full\\harness\\src', spaced);
  assert.ok(!/jkind|Harness_Development|study-002|harness\\src/.test(wrapped), 'a path wrapped across lines leaves no private fragment: ' + wrapped);
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'packets'));
  fs.writeFileSync(path.join(dir, 'packets', 'rv-1.md'), 'clean text with the word full in code');
  fs.writeFileSync(path.join(dir, 'packets', 'rv-2.md'), 'path ' + 'C:\\study\\results\\x'.replaceAll('\\', '\\'.repeat(4)));
  const manifest = { packets: [{ id: 'rv-1', packet: { file: 'packets/rv-1.md' } }, { id: 'rv-task-only', packet: { file: 'packets/rv-2.md' } }] };
  fs.writeFileSync(path.join(dir, 'packets', 'rv-3.md'), 'cut path ...\\Harness_Development\\follow-up\\study-002\\res');
  manifest.packets.push({ id: 'rv-3', packet: { file: 'packets/rv-3.md' } });
  const hits = blind.leakCheck(manifest, dir, { runIds: ['restart-full'], privateRoots: ['C:\\study\\results'] });
  assert.deepEqual(hits.map(h => h.where).sort(), ['metadata', 'packets/rv-2.md', 'packets/rv-3.md']);
});

test('blind packets: ids are random and neutral; the order is shuffled with the given random source', () => {
  const ids = blind.packetIds(5);
  assert.equal(new Set(ids).size, 5);
  for (const id of ids) assert.match(id, /^rv-[0-9a-f]{8}$/);
  assert.deepEqual(blind.shuffle([1, 2, 3, 4], () => 0), [2, 3, 4, 1]);
});

test('review fixes DR-1: only a write whose target is a code file counts as a code edit', () => {
  const shell = cmd => 'const r = await tools.exec_command({cmd: ' + JSON.stringify(cmd) + '});';
  const patch = body => 'text(await tools.apply_patch(' + JSON.stringify('*** Begin Patch\n' + body + '\n*** End Patch') + '));';
  assert.equal(recovery.editsCode(shell("Set-Content -Path task_list/open/01_fix.md -Value 'Next: edit src/a.py'")), false, 'task record named first');
  assert.equal(recovery.editsCode(patch('*** Update File: C:/r/task_list/open/01.md\n@@\n+- plan: helper -> src/b.py')), false, 'arrow inside a patch line');
  assert.equal(recovery.editsCode(shell('node x.cjs > out.jsonl')), false, '.jsonl is not .json');
  assert.equal(recovery.editsCode(shell('Set-Content -Path src/a.py -Value 1')), true);
  assert.equal(recovery.editsCode(shell("echo x > 'tinydb/table.py'")), true);
  assert.equal(recovery.editsCode(patch('*** Update File: C:\\r\\notes\\table.py\n@@\n-a\n+b')), true, 'a folder starting with n is not a line break');
});

test('review fixes DR-3: git-quoted paths with octal escapes decode to UTF-8', () => {
  const quoted = '"b/caf\\303\\251.md"';
  const diff = ['diff --git ' + quoted.replace('b/', 'a/') + ' ' + quoted, 'new file mode 100644', '--- /dev/null', '+++ ' + quoted, '@@ -0,0 +1 @@', '+hi'].join('\n') + '\n';
  assert.deepEqual(evidence.parseDiff(diff).map(f => [f.path, f.status, f.added]), [['café.md', 'added', 1]]);
});

test('review fixes DR-5: a public grade without a pass rate is unknown, not 0% passing', () => {
  const r = correctness.fromPublic({ resolved: false, f2pPassRate: null, errors: 1 });
  assert.equal(r.wholeTaskPass, null);
  assert.match(r.reason, /evaluator/);
});

test('review fixes DR-6: review tokens are unknown when no review answers exist', () => {
  assert.equal(cost.runCost([cost.sessionCost({ usage: { input_tokens: 1, output_tokens: 1 }, elapsedSeconds: 1 })], null).reviewTokens, null);
  assert.equal(cost.runCost([cost.sessionCost({ usage: { input_tokens: 1, output_tokens: 1 }, elapsedSeconds: 1 })], []).reviewTokens, 0, 'reviews exist but none were about this run');
});

test('review fixes DR-4: the leak check can run on packet texts before anything is written', () => {
  const manifest = { packets: [{ id: 'rv-1', packet: { file: 'packets/rv-1.md' } }] };
  const hits = blind.leakCheck(manifest, file => (file === 'packets/rv-1.md' ? 'see restart-full here' : ''), { runIds: ['restart-full'], privateRoots: [] });
  assert.deepEqual(hits.map(h => h.where), ['packets/rv-1.md']);
});

test('resized study: correctness reads any two-session grade by its groups and any FeatureBench grade by resolved', () => {
  const groups = { part1: { ok: true }, part2: { ok: false }, compat: { ok: true }, regression: { ok: true } };
  assert.deepEqual(correctness.measure({ source: 'study2', task: 'tablib', grade: { groups, wholeTaskPass: false } }).missed, ['part2']);
  assert.equal(correctness.measure({ source: 'study2', task: 'fastapi', grade: { resolved: true, f2pPassRate: 1, errors: 0 } }).wholeTaskPass, true);
});

test('resized study: decision points come from each two-session task, none for FeatureBench tasks', () => {
  for (const task of ['restart', 'tablib', 'watson']) assert.equal(recovery.decisionPoints(task).length, 5, task);
  for (const task of ['public', 'fastapi', 'mlflow']) assert.equal(recovery.decisionPoints(task), null, task);
});

test('resized study: every task has a grader; lean is scrubbed from blind packets', () => {
  const { graderFor } = require('./grade_runs.cjs');
  for (const task of ['restart', 'tablib', 'watson']) assert.match(graderFor(task, { repo: 'r', out: 'o' })[0], new RegExp(task + '/grade\.cjs$'));
  assert.equal(graderFor('public', { label: 'l', diff: 'd', out: 'o' })[0], 'tasks/public/grade.cjs');
  for (const task of ['fastapi', 'mlflow']) assert.deepEqual(graderFor(task, { label: 'l', diff: 'd', out: 'o' })[1].slice(0, 1), ['grade']);
  assert.throws(() => graderFor('nope', {}), /No grader/);
  assert.ok(blind.LABELS.includes('lean'));
});
