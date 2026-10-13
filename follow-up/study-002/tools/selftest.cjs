'use strict';
// Contract tests for the pilot tools. No model calls. Run: node follow-up/study-002/tools/selftest.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('./lib.cjs');
const budget = require('./budget.cjs');
const { takeSnapshot, workingTreeHash } = require('./snapshot.cjs');
const classify = require('./classify.cjs');
const runner = require('./runner.cjs');
const { configToml } = require('./environment.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'study2-selftest-'));
const LIMITS = { sessions: 1000, reviews: 100, firstReviewEstimate: 40, firstSessionEstimate: 0 };

test('budget: separate allowances, first-review estimate, duplicate ids refused, unknown usage kept', () => {
  const file = path.join(tmp(), 'budget.json');
  budget.assertRoom('session', LIMITS, file);
  budget.record('session', 'p.a-s1', 600, 'x', file);
  assert.throws(() => budget.assertRoom('session', LIMITS, file), /would pass 1000/, 'largest session (600) + used (600) > 1000');
  assert.doesNotThrow(() => budget.assertRoom('review', LIMITS, file), 'reviews use their own allowance');
  budget.record('review', 'r1', 70, 'x', file);
  assert.throws(() => budget.assertRoom('review', LIMITS, file), /would pass 100/);
  assert.throws(() => budget.record('session', 'p.a-s1', 1, 'x', file), /already recorded/);
  budget.record('probe', 'probe-1', null, 'unknown', file);
  assert.equal(budget.load(file).entries.at(-1).unknown, true);
  assert.equal(budget.totals(budget.load(file)).sessions, 600);
  budget.record('probe', 'probe-2', 5000, 'big probe', file);
  assert.equal(budget.totals(budget.load(file)).probes, 5000, 'probes have their own pool');
  assert.throws(() => budget.assertRoom('session', LIMITS, file), /would pass 1000/, 'probe usage does not change the session check');
  assert.doesNotThrow(() => budget.assertRoom('probe', LIMITS, file), 'probes unlimited unless budget.probes is set');
  assert.throws(() => budget.assertRoom('probe', { ...LIMITS, probes: 5500 }, file), /would pass 5500/);
});

test('budget: first review is checked against the stated estimate', () => {
  const file = path.join(tmp(), 'budget.json');
  assert.throws(() => budget.assertRoom('review', { ...LIMITS, reviews: 30 }, file), /estimate 40/);
});

test('snapshot: diff from baseline reproduces modified, deleted and untracked files', () => {
  const repo = path.join(tmp(), 'repo');
  fs.mkdirSync(repo);
  lib.git(['init', '-q'], repo);
  lib.git(['config', 'core.autocrlf', 'false'], repo);
  fs.writeFileSync(path.join(repo, 'keep.txt'), 'a\n');
  fs.writeFileSync(path.join(repo, 'gone.txt'), 'b\n');
  lib.git(['add', '.'], repo);
  lib.git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base'], repo);
  const base = lib.git(['rev-parse', 'HEAD'], repo).trim();
  fs.writeFileSync(path.join(repo, 'keep.txt'), 'a changed\n');
  fs.rmSync(path.join(repo, 'gone.txt'));
  fs.mkdirSync(path.join(repo, 'new'));
  fs.writeFileSync(path.join(repo, 'new', 'file.py'), 'print(1)\n');
  const before = lib.git(['status', '--porcelain'], repo);
  const snap = takeSnapshot(repo, base, path.join(repo, '..', 'snap'));
  assert.equal(lib.git(['status', '--porcelain'], repo), before, 'run index untouched');
  assert.equal(snap.workingTreeSha256, workingTreeHash(repo));
  const copy = path.join(repo, '..', 'copy');
  lib.git(['-c', 'core.autocrlf=false', 'clone', '-q', '-c', 'core.autocrlf=false', repo, copy], repo);
  lib.git(['checkout', '-q', base], copy);
  lib.git(['apply', path.join(repo, '..', 'snap', 'diff-from-baseline.patch')], copy);
  assert.equal(fs.readFileSync(path.join(copy, 'keep.txt'), 'utf8'), 'a changed\n');
  assert.equal(fs.existsSync(path.join(copy, 'gone.txt')), false);
  assert.equal(fs.readFileSync(path.join(copy, 'new', 'file.py'), 'utf8'), 'print(1)\n');
  assert.throws(() => takeSnapshot(repo, base, path.join(repo, '..', 'snap')), /already exists/);
});

test('classify: refusal, failure and unclassified reasons', () => {
  assert.equal(classify.classifyReason('[Hook] TASK GATE: STOP'), 'refusal');
  assert.equal(classify.classifyReason('[Shared harness] Hook execution failed: task-gate: ETIMEDOUT'), 'failure');
  assert.equal(classify.classifyReason('something else'), 'unclassified');
  const file = path.join(tmp(), 't.jsonl');
  const out = text => JSON.stringify({ timestamp: 't', payload: { type: 'custom_tool_call_output', call_id: 'c', output: [{ type: 'input_text', text }] } });
  fs.writeFileSync(file, [out('Command blocked by PreToolUse hook: [Hook] Documentation policy: no'),
    out('Tool call blocked by PreToolUse hook: [Shared harness] Hook execution failed: x'), out('fine'),
    JSON.stringify({ payload: { type: 'custom_tool_call', input: 'read C:\\run\\harness\\generated\\INSTRUCTIONS.md' } })].join('\n'));
  assert.deepEqual(classify.blockedCalls(file).map(b => b.kind), ['refusal', 'failure']);
  assert.equal(classify.folderReads(file, ['C:/run/harness/generated']).count, 1);
});

test('session ids and Codex project-trust stripping', () => {
  assert.deepEqual(runner.parseSession('restart-full-s2'), { id: 'restart-full-s2', runId: 'restart-full', n: 2, retry: false, originalId: 'restart-full-s2' });
  assert.equal(runner.parseSession('public-stock-s1-retry1').retry, true);
  assert.throws(() => runner.parseSession('x-s3'), /Session ids/);
  const base = configToml({ model: 'm', reasoning: 'high', hostSkills: ['a/SKILL.md'], cloneSkills: [] }) + "\n[hooks.state]\n\n[hooks.state.'k']\ntrusted_hash = \"h\"\n";
  const after = base + "\n[projects.'C:\\\\r']\ntrust_level = \"trusted\"\n";
  assert.equal(runner.configWithoutProjects(after), base);
  assert.notEqual(runner.configWithoutProjects(after.replace('model = "m"', 'model = "other"')), base);
});

/** A minimal prepared study folder: protocol, frozen manifest with current tool hashes, run folders. */
function fakeStudy() {
  const root = tmp();
  const protocolFile = path.join(root, 'protocol.json');
  const protocol = { studyId: 'fake-study', kind: 'probe', budget: LIMITS, runs: [{ id: 'a', task: 't', config: 'stock', sessions: [1, 2] }, { id: 'b', task: 't', config: 'stock', sessions: [1] }] };
  fs.writeFileSync(protocolFile, JSON.stringify(protocol));
  const tools = Object.fromEntries(fs.readdirSync(__dirname).filter(n => n.endsWith('.cjs')).map(n => [n, lib.digest(path.join(__dirname, n))]));
  lib.atomicJson(path.join(root, 'results', 'frozen.json'), { protocolSha256: lib.digest(protocolFile), toolHashes: tools, order: ['a-s1', 'a-s2', 'b-s1'], runs: {} });
  const ctx = { protocol, resultsDir: path.join(root, 'results'), frozen: lib.readJson(path.join(root, 'results', 'frozen.json')) };
  const finish = (folder, s, extra = {}) => {
    const dir = path.join(ctx.resultsDir, folder, 'sessions', s);
    fs.mkdirSync(dir, { recursive: true });
    lib.atomicJson(path.join(dir, 'journal.json'), { state: 'completed', childPid: null });
    lib.atomicJson(path.join(dir, 'result.json'), { status: 'completed', threadId: 'thread-1', ...extra });
  };
  return { protocolFile, ctx, finish };
}

test('order: a later session cannot start before earlier ones finish', () => {
  const { ctx, finish } = fakeStudy();
  assert.throws(() => runner.assertOrder(ctx, runner.parseSession('a-s2')), /not finished: a-s1/);
  finish('a', 's1');
  assert.doesNotThrow(() => runner.assertOrder(ctx, runner.parseSession('a-s2')));
  assert.throws(() => runner.assertOrder(ctx, runner.parseSession('b-s1')), /not finished: a-s2/);
  assert.throws(() => runner.assertOrder(ctx, runner.parseSession('zz-s1')), /not in the frozen order/);
});

test('retries: only when the original never started a model thread; ids never replayed', () => {
  const { ctx, finish } = fakeStudy();
  assert.throws(() => runner.assertSlotFree(ctx, runner.parseSession('a-s1-retry1')), /finished original/);
  finish('a', 's1');
  assert.throws(() => runner.assertSlotFree(ctx, runner.parseSession('a-s1')), /never replayed/);
  assert.throws(() => runner.assertSlotFree(ctx, runner.parseSession('a-s1-retry1')), /started a model thread/);
  finish('b', 's1', { threadId: null, status: 'failed' });
  const target = runner.assertSlotFree(ctx, runner.parseSession('b-s1-retry1'));
  assert.match(target.replaceAll('\\', '/'), /b-spare\/sessions\/s1-retry1$/, 'session-1 retry uses the spare folder');
  fs.mkdirSync(target, { recursive: true });
  lib.atomicJson(path.join(target, 'journal.json'), { state: 'completed' });
  assert.equal(runner.runFolder(ctx, 'b'), 'b-spare', 'later sessions follow the spare');
  assert.equal(runner.slotRecord(ctx, 'b', 1).dir, target);
});

test('skip records a session as not run, with a reason, once', () => {
  const { protocolFile } = fakeStudy();
  runner.skip(protocolFile, 'b-s1', 'budget cap reached');
  assert.throws(() => runner.skip(protocolFile, 'b-s1', 'again please'), /never replayed/);
  assert.throws(() => runner.skip(protocolFile, 'a-s2', ''), /reason/);
});

/** A frozen packet manifest with two packets; the second depends on the first's output. */
function fakeReviews() {
  const studyDir = tmp();
  const reviews = path.join(studyDir, 'reviews');
  fs.mkdirSync(path.join(reviews, 'packets'), { recursive: true });
  const write = (name, text) => { fs.writeFileSync(path.join(reviews, name), text); return { file: name, sha256: lib.digest(path.join(reviews, name)) }; };
  const prompt = write('prompt-audit.md', 'Answer the form.');
  const schema = write('schema-audit.json', '{"type":"object"}');
  const p1 = write('packets/rv-aaa.md', 'packet one');
  const p2 = write('packets/rv-bbb.md', 'packet two');
  const manifest = { packets: [
    { id: 'rv-aaa', prompt, schema, packet: p1, dependsOn: [] },
    { id: 'rv-bbb', prompt, schema: null, packet: p2, dependsOn: ['rv-aaa'] }
  ] };
  lib.atomicJson(path.join(reviews, 'packets.json'), manifest);
  return { studyDir, reviews };
}

test('review: only ids in the frozen packet manifest; the manifest is pinned at the first review', () => {
  const review = require('./review.cjs');
  const { studyDir, reviews } = fakeReviews();
  assert.throws(() => review.plan(studyDir, 'rv-zzz'), /not in the packet manifest/);
  const first = review.plan(studyDir, 'rv-aaa');
  assert.equal(first.packet.id, 'rv-aaa');
  review.pinManifest(studyDir, first.manifestSha256);
  assert.ok(fs.existsSync(path.join(reviews, 'packets.pin.json')));
  const manifest = lib.readJson(path.join(reviews, 'packets.json'));
  lib.atomicJson(path.join(reviews, 'packets.json'), { packets: [...manifest.packets, { id: 'rv-ccc', prompt: manifest.packets[0].prompt, packet: manifest.packets[0].packet, dependsOn: [] }] });
  assert.throws(() => review.plan(studyDir, 'rv-aaa'), /packet manifest changed/);
});

test('review: changed packet, prompt or schema bytes are refused', () => {
  const review = require('./review.cjs');
  const { studyDir, reviews } = fakeReviews();
  fs.appendFileSync(path.join(reviews, 'schema-audit.json'), ' ');
  assert.throws(() => review.plan(studyDir, 'rv-aaa'), /schema-audit.json changed/);
  const other = fakeReviews();
  fs.appendFileSync(path.join(other.reviews, 'packets', 'rv-bbb.md'), 'x');
  assert.throws(() => review.plan(other.studyDir, 'rv-bbb'), /rv-bbb.md changed/);
});

test('review: ids never replayed; a dependent review waits for its dependency and receives its output', () => {
  const review = require('./review.cjs');
  const { studyDir, reviews } = fakeReviews();
  assert.throws(() => review.plan(studyDir, 'rv-bbb'), /depends on rv-aaa, which has not finished/);
  const done = path.join(reviews, 'runs', 'rv-aaa');
  fs.mkdirSync(done, { recursive: true });
  lib.atomicJson(path.join(done, 'result.json'), { status: 'completed', final: '{"answers":[1]}' });
  assert.throws(() => review.plan(studyDir, 'rv-aaa'), /already attempted/);
  const second = review.plan(studyDir, 'rv-bbb');
  const text = review.composePrompt(second);
  assert.ok(text.startsWith('Answer the form.'));
  assert.ok(text.includes('packet two'));
  assert.ok(text.includes('{"answers":[1]}'), 'dependency output is passed on');
  assert.ok(!text.includes('rv-aaa'), 'no packet ids in the prompt');
});

test('review: launch arguments are read-only, hooks off, no delegation, schema when given', () => {
  const review = require('./review.cjs');
  const args = review.reviewArgs({ model: 'gpt-6-luna' }, 'C:/w', 'C:/s.json');
  assert.deepEqual(args.slice(0, 4), ['exec', '--sandbox', 'read-only', '--skip-git-repo-check']);
  for (const flag of ['hooks', 'multi_agent']) assert.equal(args[args.indexOf(flag) - 1], '--disable');
  assert.equal(args[args.indexOf('--output-schema') + 1], 'C:/s.json');
  assert.ok(!review.reviewArgs({ model: 'm' }, 'C:/w', null).includes('--output-schema'));
});

test('review fixes DR-2: a transcript cut short by a kill does not stop collection', () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  const line = JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 5, output_tokens: 1 } } } });
  fs.writeFileSync(path.join(home, 'sessions', 'rollout-thread-9.jsonl'), line + '\n{"type":"event_msg","payl');
  assert.equal(lib.transcriptInfo(home, 'thread-9').lastTranscriptCounter.input_tokens, 5);
});

test('review fixes DR-2: one retry when the model never started; dependents use the retry', () => {
  const review = require('./review.cjs');
  const { studyDir, reviews } = fakeReviews();
  assert.throws(() => review.plan(studyDir, 'rv-aaa-retry1'), /finished original/);
  const original = path.join(reviews, 'runs', 'rv-aaa');
  fs.mkdirSync(original, { recursive: true });
  lib.atomicJson(path.join(original, 'result.json'), { status: 'completed', threadId: 't1', final: 'first' });
  assert.throws(() => review.plan(studyDir, 'rv-aaa-retry1'), /started a model thread/);
  lib.atomicJson(path.join(original, 'result.json'), { status: 'failed', threadId: null, final: '' });
  assert.equal(review.plan(studyDir, 'rv-aaa-retry1').packet.id, 'rv-aaa');
  assert.throws(() => review.plan(studyDir, 'rv-bbb'), /has not finished/, 'a failed original does not satisfy a dependency');
  const retry = path.join(reviews, 'runs', 'rv-aaa-retry1');
  fs.mkdirSync(retry, { recursive: true });
  lib.atomicJson(path.join(retry, 'result.json'), { status: 'completed', threadId: 't2', final: 'second' });
  assert.ok(review.composePrompt(review.plan(studyDir, 'rv-bbb')).includes('second'));
});

test('review fixes DR-2: recovering a dead review records it, releases the lock and removes the login link', () => {
  const review = require('./review.cjs');
  const { studyDir, reviews } = fakeReviews();
  const runDir = path.join(reviews, 'runs', 'rv-aaa');
  fs.mkdirSync(path.join(runDir, 'codex-home'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'codex-home', 'auth.json'), 'x');
  lib.atomicJson(path.join(runDir, 'journal.json'), { packetId: 'rv-aaa', state: 'running', parentPid: 0, childPid: null });
  const resultsDir = path.join(studyDir, 'results');
  fs.mkdirSync(resultsDir);
  fs.writeFileSync(path.join(resultsDir, 'study.lock'), JSON.stringify({ id: 'review:rv-aaa' }));
  const ledger = path.join(studyDir, 'budget.json');
  review.recoverReviewIn({ studyDir, resultsDir, ledger, studyId: 'fake' }, 'rv-aaa');
  assert.equal(lib.readJson(path.join(runDir, 'result.json')).status, 'recovered_aborted');
  assert.equal(lib.readJson(path.join(runDir, 'journal.json')).state, 'recovered_aborted');
  assert.equal(budget.load(ledger).entries[0].id, 'fake.review.rv-aaa');
  assert.equal(fs.existsSync(path.join(resultsDir, 'study.lock')), false);
  assert.equal(fs.existsSync(path.join(runDir, 'codex-home', 'auth.json')), false);
  assert.throws(() => review.recoverReviewIn({ studyDir, resultsDir, ledger, studyId: 'fake' }, 'rv-aaa'), /Nothing to recover/);
});

test('isolation: a task board in any folder above a run is found; a clean path has none', () => {
  const { boardsAbove, assertNoBoardAbove } = require('./isolation.cjs');
  const top = tmp();
  const run = path.join(top, 'study', 'results', 'run-1');
  fs.mkdirSync(run, { recursive: true });
  assert.deepEqual(boardsAbove(run), [], 'temp folder has no board above it');
  fs.mkdirSync(path.join(top, 'task_list', 'open'), { recursive: true });
  fs.mkdirSync(path.join(top, 'study', 'docs', 'tasks'), { recursive: true });
  assert.deepEqual(boardsAbove(run).map(p => path.relative(top, p).split(path.sep).join('/')).sort(), ['study/docs/tasks', 'task_list']);
  assert.throws(() => assertNoBoardAbove(run), /task board above/);
  assert.equal(boardsAbove(path.resolve(__dirname)).length > 0, true, 'this study tree has its own board, so runs may never live here');
});

test('lean: expected prompt checks require the lean profile alone and a prompt under 25,000 characters', () => {
  const { expectedChecks, checkPrompt } = require('./prepare.cjs');
  assert.deepEqual(expectedChecks('lean'), { sharedHarness: false, taskOnlyProfile: false, leanProfile: true, customSkills: false, sessionSummary: false });
  for (const config of ['stock', 'task-only', 'full']) assert.equal(expectedChecks(config).leanProfile, false, config);
  const good = { sharedHarness: false, taskOnlyProfile: false, leanProfile: true, customSkills: false, sessionSummary: false, characters: 24000 };
  assert.doesNotThrow(() => checkPrompt('r1', 'lean', good));
  assert.throws(() => checkPrompt('r1', 'lean', { ...good, characters: 25001 }), /25,000/);
  assert.throws(() => checkPrompt('r1', 'lean', { ...good, customSkills: true }), /customSkills/);
});

test('lean: the clone takes its own core/policy.json and the Codex home its core/AGENTS.md', () => {
  const env = require('./environment.cjs');
  assert.ok(env.CONFIGS.includes('lean'));
  const dir = tmp();
  const commit = 'ab8f166a90442095faf6990f0d2c5bff43210e4e';
  const clone = env.cloneHarness(path.join(dir, 'harness'), commit, 'lean', { ...process.env, HOME: dir, USERPROFILE: dir });
  assert.equal(clone.commit, commit);
  assert.equal(fs.readFileSync(path.join(dir, 'harness', 'policy.json'), 'utf8'), fs.readFileSync(path.join(dir, 'harness', 'core', 'policy.json'), 'utf8'));
  const hooks = JSON.parse(fs.readFileSync(path.join(dir, 'harness', 'generated', 'codex-hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ['PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'], 'render always adds SessionStart and UserPromptSubmit for its load note');
  env.writeCodexHome(path.join(dir, 'codex-home'), { config: 'lean', model: 'gpt-6-luna', reasoning: 'high', clone: path.join(dir, 'harness') });
  assert.equal(fs.readFileSync(path.join(dir, 'codex-home', 'AGENTS.md'), 'utf8'), fs.readFileSync(path.join(dir, 'harness', 'core', 'AGENTS.md'), 'utf8'));
  assert.ok(fs.existsSync(path.join(dir, 'codex-home', 'hooks.json')));
});
