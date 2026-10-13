'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function journalPath(root) { return path.join(root, 'state/propagation-journal.json'); }
function atomicWrite(file, content) {
  const temporary = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  const fd = fs.openSync(temporary, 'wx');
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(temporary, file); } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
function recover(root, force = false) {
  const dir = path.join(root, 'state');
  if (!fs.existsSync(dir)) return false;
  let file, journal;
  for (let attempt = 0; attempt < 500; attempt++) {
    const claims = fs.readdirSync(dir).filter(n => /^propagation-recovery-\d+-[a-f0-9]+\.json$/.test(n));
    const active = claims.find(n => alive(Number(n.split('-')[2])));
    if (active) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); continue; }
    file = claims.length ? path.join(dir, claims[0]) : journalPath(root);
    try { journal = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (fs.existsSync(journalPath(root)) || fs.readdirSync(dir).some(n => /^propagation-recovery-\d+-[a-f0-9]+\.json$/.test(n))) continue;
      return false;
    }
    if (!/^HARNESS_PROBE_[a-f0-9]{16}$/.test(journal.token) || !Number.isInteger(journal.pid)) throw new Error('Invalid propagation recovery journal');
    if (!claims.length && !force && alive(journal.pid)) return false;
    const claimed = path.join(dir, 'propagation-recovery-' + process.pid + '-' + crypto.randomBytes(4).toString('hex') + '.json');
    try { fs.renameSync(file, claimed); file = claimed; break; } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  }
  if (!file || !path.basename(file).startsWith('propagation-recovery-' + process.pid + '-')) throw new Error('Propagation recovery is still active in another process');
  const instruction = path.join(root, 'core/machine.md');
  const marker = '\nHarness validation token: ' + journal.token + '\n';
  const current = fs.readFileSync(instruction, 'utf8');
  if (current.includes(marker)) atomicWrite(instruction, current.replace(marker, ''));
  const policyFile = path.join(root, 'core', 'policy.json');
  const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
  const id = 'harness-propagation-' + journal.token;
  if (policy.hooks.some(h => h.id === id)) {
    atomicWrite(policyFile, JSON.stringify({ ...policy, hooks: policy.hooks.filter(h => h.id !== id) }, null, 2) + '\n');
  }
  const script = path.join(root, 'scripts/hooks/' + id + '.js');
  if (fs.existsSync(script) && fs.readFileSync(script, 'utf8') === journal.scriptContent) fs.unlinkSync(script);
  fs.unlinkSync(file);
  return true;
}
function begin(root, token, scriptContent) {
  recover(root);
  const file = journalPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.' + token + '.tmp';
  const fd = fs.openSync(temporary, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify({ token, scriptContent, pid: process.pid, started: new Date().toISOString() })); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.linkSync(temporary, file); } finally { fs.unlinkSync(temporary); }
}
module.exports = { begin, recover, atomicWrite };
