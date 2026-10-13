'use strict';
// Blind review packets for the pilot. Per run: an audit packet (repository record only), a clarity packet
// (end-of-session messages and added documentation lines), a recovery packet (restart runs with both
// sessions) and a key packet (shortened transcripts; it receives the audit answers as a dependency).
// Packet ids are random and neutral; the manifest order is shuffled. The packet -> run mapping is kept in
// reviews/private/key.json, which no prompt or packet mentions. Reviews run only through the runner
// (`node tools/runner.cjs review`), which is the only writer of review usage in the budget ledger.
//
// Usage (from follow-up/study-002):
//   (each command takes a protocol or pilot/composition.json)
//   node measures/blind.cjs build protocol.json   write packets, prompts, schemas, manifest, private key
//   node measures/blind.cjs run protocol.json     run every review not yet attempted, in manifest order
//   node measures/blind.cjs collect protocol.json parse answers into reviews/answers.json
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const lib = require('../tools/lib.cjs');
const evidence = require('./evidence.cjs');
const audit = require('./auditability.cjs');
const recovery = require('./recovery.cjs');
const { PROMPTS, SCHEMAS } = require('./forms.cjs');
const { DOC_FILE } = require('./plain_language.cjs');

const LABELS = ['stock', 'task-only', 'task_only', 'full-config', 'control', 'lean'];
const USER_HOME = 'C:\\Users\\jkind';
const PRIVATE_MARKERS = ['Harness_Development', 'study-002'];

const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEP = '[\\\\/]+';
/** A path as a regex source where any run of slashes or backslashes is one separator (JSON and JS escaping). */
const pathPattern = value => value.split(/[\\/]+/).filter(Boolean).map(escapeRe).join(SEP);

/** Replace a run's private paths and its id; `<repo>` paths keep their relative tail with forward slashes. */
function sanitize(text, { runDir, runId }) {
  const repo = new RegExp(pathPattern(runDir) + SEP + 'repo((?:' + SEP + '[^\\s\'"`)\\]]*)?)', 'gi');
  // Codex writes file links URL-encoded ("04%20Personal%20Coding"); decode spaces first so paths match.
  let out = String(text).replace(/%20/g, ' ').replace(repo, (_, tail) => '<repo>' + (tail || '').replace(/[\\/]+/g, '/'));
  out = out.replace(new RegExp(pathPattern(runDir), 'gi'), '<run-folder>');
  for (const root of [lib.studyRoot, USER_HOME]) out = out.replace(new RegExp(pathPattern(root), 'gi'), '<private>');
  // Paths wrapped across lines by PowerShell, or cut short, escape the full-path match; their distinctive
  // folder names (and the path after them) are removed wherever they appear.
  for (const marker of PRIVATE_MARKERS) out = out.replace(new RegExp(escapeRe(marker) + '(?:' + SEP + '[^\\s\'"`)\\]]*)?', 'gi'), '<private>');
  out = out.replace(/(?<![A-Za-z0-9])jkind(?![A-Za-z0-9])/gi, '<user>');
  return out.replace(new RegExp('(?<![A-Za-z0-9])' + escapeRe(runId) + '(?![A-Za-z0-9])', 'gi'), '<run>');
}

/**
 * Labels or run ids in packet metadata; run ids, private roots (any escaping) or private folder names in
 * packet text. `source` is the reviews folder, or a function from a packet's file name to its text (so
 * build can check before writing anything).
 */
function leakCheck(manifest, source, { runIds, privateRoots }) {
  const read = typeof source === 'function' ? source : file => fs.readFileSync(path.join(source, file), 'utf8');
  const hits = [];
  const metadata = JSON.stringify(manifest.packets.map(p => ({ id: p.id, files: [p.packet?.file, p.prompt?.file, p.schema?.file] }))).toLowerCase();
  const metaFound = [...LABELS, ...runIds].filter(word => metadata.includes(word.toLowerCase()));
  if (metaFound.length) hits.push({ where: 'metadata', matched: metaFound });
  const needles = [...runIds.map(id => ({ label: id, re: new RegExp(escapeRe(id), 'i') })), ...privateRoots.map(root => ({ label: root, re: new RegExp(pathPattern(root), 'i') })),
    ...[...PRIVATE_MARKERS, 'jkind'].map(marker => ({ label: marker, re: new RegExp(escapeRe(marker), 'i') }))];
  for (const p of manifest.packets) {
    const text = read(p.packet.file).replace(/%20/g, ' ');
    const found = needles.filter(n => n.re.test(text)).map(n => n.label);
    if (found.length) hits.push({ where: p.packet.file, matched: found.slice(0, 3) });
  }
  return hits;
}

const packetIds = n => {
  const ids = new Set();
  while (ids.size < n) ids.add('rv-' + crypto.randomBytes(4).toString('hex'));
  return [...ids];
};

/** Fisher-Yates on a copy. */
function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Session 2's changes on top of session 1's: both baseline diffs applied in a scratch clone. */
function incrementalDiff(bundle, ref, firstDiff, secondDiff) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'study2-incremental-'));
  try {
    const repo = path.join(scratch, 'repo');
    lib.git(['-c', 'core.autocrlf=false', 'clone', '-q', '-c', 'core.autocrlf=false', '--branch', ref, bundle, repo], scratch);
    const base = lib.git(['rev-parse', 'HEAD'], repo).trim();
    const commitPatch = (patch, name) => {
      lib.git(['checkout', '-q', '--detach', base], repo);
      lib.git(['clean', '-qfdx'], repo);
      const file = path.join(scratch, name + '.patch');
      fs.writeFileSync(file, patch);
      if (patch.trim()) lib.git(['apply', '--whitespace=nowarn', file], repo);
      lib.git(['add', '-A'], repo);
      lib.git(['-c', 'user.name=s', '-c', 'user.email=s@s', 'commit', '-q', '--allow-empty', '-m', name], repo);
      return lib.git(['rev-parse', 'HEAD'], repo).trim();
    };
    const first = commitPatch(firstDiff, 'one'), second = commitPatch(secondDiff, 'two');
    return lib.git(['diff', '--binary', first, second], repo);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

/** Packet texts for one run, keyed by kind. */
function runPackets(studyDir, protocol, runId) {
  const ev = evidence.studyTwoRun(studyDir, runId);
  const scrub = text => sanitize(text, { runDir: ev.runDir, runId });
  const diffFiles = evidence.parseDiff(ev.diffText || '');
  const out = {};
  out.audit = audit.auditPacket({ log: audit.commitLog(ev.repoDir, ev.baselineCommit), diffText: ev.diffText }, scrub);
  const docs = diffFiles.filter(f => DOC_FILE.test(f.path) && f.status !== 'deleted').map(f => `### ${f.path}\n\n` + f.addedRuns.flat().join('\n')).join('\n\n');
  out.clarity = scrub(ev.sessions.map(s => `## Message at the end of session ${s.n}\n\n${s.final || '(no message)'}`).join('\n\n') + '\n\n## Documentation lines added\n\n' + (docs || '(none)') + '\n');
  const transcripts = ev.sessions.map(s => s.transcript).filter(Boolean);
  if (transcripts.length) out.key = audit.keyPacket({ transcripts, diffFiles }, scrub);
  const [s1, s2] = ev.sessions;
  const points = recovery.decisionPoints(ev.task);
  if (points && s1 && s2 && s1.diffText !== null && s2.diffText !== null) {
    const task = protocol.tasks[ev.task];
    const second = incrementalDiff(path.resolve(lib.studyRoot, task.bundle), task.ref, s1.diffText, s2.diffText);
    out.recovery = scrub(['## The ' + points.length + ' choices', '', ...points.map(p => `- ${p.id}: ${p.question} (Kept if: ${p.kept_if})`), '',
      '## Session 1 changes (from the starting point)', '', '```diff', audit.readableDiff(s1.diffText).trimEnd(), '```', '',
      '## Session 2 changes (on top of session 1)', '', '```diff', audit.readableDiff(second).trimEnd(), '```', ''].join('\n'));
  }
  return out;
}

function writeWx(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { flag: 'wx' });
  return lib.digest(file);
}

/** `file` is a pilot protocol or pilot/composition.json (runs from several frozen protocols). */
function build(file, reviewsDir) {
  const set = evidence.studySet(file);
  const reviews = reviewsDir || path.join(set.reviewsStudyDir, 'reviews');
  if (fs.existsSync(path.join(reviews, 'packets.json'))) throw new Error('Packet manifest already exists; it is frozen');
  if (fs.existsSync(path.join(reviews, 'runs')) || fs.existsSync(path.join(reviews, 'packets.pin.json'))) throw new Error('Reviews already started; refusing to rebuild');
  // No manifest and no review yet: leftovers of a failed build are not evidence, so start clean.
  for (const name of ['forms', 'packets', 'private']) fs.rmSync(path.join(reviews, name), { recursive: true, force: true });
  // Everything is built and checked in memory first; files are written only after the blind check passes.
  const texts = new Map();
  const ref = (file, text) => { texts.set(file, text); return { file, sha256: lib.hash(text) }; };
  const shared = Object.fromEntries(Object.keys(PROMPTS).map(kind => [kind, {
    prompt: ref(`forms/prompt-${kind}.md`, PROMPTS[kind] + '\n'),
    schema: ref(`forms/schema-${kind}.json`, JSON.stringify(SCHEMAS[kind], null, 2) + '\n')
  }]));
  const runIds = set.runs.map(r => r.runId);
  const planned = set.runs.flatMap(r => Object.entries(runPackets(r.studyDir, r.protocol, r.runId)).map(([kind, text]) => ({ runId: r.runId, kind, text })));
  const ids = packetIds(planned.length);
  const entries = planned.map((item, i) => ({ ...item, id: ids[i] }));
  const auditId = runId => entries.find(e => e.runId === runId && e.kind === 'audit').id;
  const packets = entries.map(e => ({
    id: e.id, ...shared[e.kind], packet: ref(`packets/${e.id}.md`, e.text), dependsOn: e.kind === 'key' ? [auditId(e.runId)] : []
  }));
  // Shuffled, then dependents moved after everything they need.
  const ordered = shuffle(packets.filter(p => !p.dependsOn.length), cryptoRandom).concat(shuffle(packets.filter(p => p.dependsOn.length), cryptoRandom));
  const manifest = { createdAt: new Date().toISOString(), packets: ordered };
  const hits = leakCheck(manifest, file => texts.get(file), { runIds, privateRoots: [...new Set(set.runs.map(r => path.join(r.studyDir, 'results'))), lib.studyRoot, USER_HOME] });
  if (hits.length) throw new Error('Blind check failed; nothing written: ' + JSON.stringify(hits));
  for (const [file, text] of texts) {
    if (writeWx(path.join(reviews, file), text) !== lib.hash(text)) throw new Error('Written bytes differ from the checked text: ' + file);
  }
  writeWx(path.join(reviews, 'private', 'key.json'), JSON.stringify(Object.fromEntries(entries.map(e => [e.id, { runId: e.runId, kind: e.kind }])), null, 2) + '\n');
  writeWx(path.join(reviews, 'packets.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { packets: ordered.length, blindCheck: 'pass' };
}

const cryptoRandom = () => crypto.randomBytes(4).readUInt32BE() / 2 ** 32;

function runAll(file) {
  const { reviewProtocolFile: protocolFile, reviewsStudyDir: studyDir } = evidence.studySet(file);
  const manifest = lib.readJson(path.join(studyDir, 'reviews', 'packets.json'));
  const outcomes = [];
  const runs = path.join(studyDir, 'reviews', 'runs');
  const launch = id => spawnSync(process.execPath, [path.join(lib.studyRoot, 'tools', 'runner.cjs'), 'review', protocolFile, id], { stdio: 'inherit', windowsHide: true }).status;
  for (const p of manifest.packets) {
    if (!fs.existsSync(path.join(runs, p.id))) outcomes.push({ id: p.id, exit: launch(p.id) });
    // One infrastructure retry, only when the first attempt never started a model thread (runner enforces it).
    const first = fs.existsSync(path.join(runs, p.id, 'result.json')) ? lib.readJson(path.join(runs, p.id, 'result.json')) : null;
    if (first && first.status !== 'completed' && !first.threadId && !fs.existsSync(path.join(runs, p.id + '-retry1'))) outcomes.push({ id: p.id + '-retry1', exit: launch(p.id + '-retry1') });
  }
  return outcomes;
}

/** Parse every stored answer; a reply that is not valid JSON is kept as a parse failure, not dropped. */
function collect(file) {
  const studyDir = evidence.studySet(file).reviewsStudyDir;
  const key = lib.readJson(path.join(studyDir, 'reviews', 'private', 'key.json'));
  const answers = {};
  for (const [id, { runId, kind }] of Object.entries(key)) {
    const result = require('../tools/review.cjs').effectiveResult(studyDir, id);
    let parsed = null, parseError = null;
    if (result?.status === 'completed') { try { parsed = JSON.parse(result.final); } catch (error) { parseError = error.message; } }
    (answers[runId] ||= {})[kind] = { packetId: id, status: result?.status ?? 'not_run', totalTokens: result?.totalTokens ?? null, parsed, parseError };
  }
  lib.atomicJson(path.join(studyDir, 'reviews', 'answers.json'), answers);
  return answers;
}

module.exports = { sanitize, leakCheck, packetIds, shuffle, incrementalDiff, runPackets, build, runAll, collect, LABELS };
if (require.main === module) {
  const [command, protocolFile] = process.argv.slice(2);
  const file = protocolFile && path.resolve(protocolFile);
  const commands = { build, run: runAll, collect };
  try {
    if (!commands[command] || !file) throw new Error('Usage: blind.cjs build|run|collect <protocol.json | pilot/composition.json>');
    const out = commands[command](file);
    console.log(JSON.stringify(command === 'collect' ? Object.keys(out) : out));
  } catch (error) { process.stderr.write((error.stack || error) + '\n'); process.exitCode = 1; }
}
