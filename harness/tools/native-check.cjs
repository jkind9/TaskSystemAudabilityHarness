'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { root } = require('./render.cjs');
const binary = process.argv[2] || 'codex.exe';
const cwd = process.argv[3] || root;
const child = spawn(binary, ['app-server', '--stdio'], { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map();
let buffer = '', sequence = 0, stderr = '';
const timeout = setTimeout(() => { child.kill(); console.error('Native app-server check timed out'); process.exitCode = 1; }, 45000);
function request(method, params) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
child.on('error', error => { console.error(error.message); clearTimeout(timeout); process.exitCode = 1; });
child.stderr.on('data', data => { stderr += data.toString(); });
child.stdout.on('data', data => {
  buffer += data.toString();
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    try { const value = JSON.parse(line); if (pending.has(value.id)) { const promise = pending.get(value.id); pending.delete(value.id); if (value.error) promise.reject(new Error(JSON.stringify(value.error))); else promise.resolve(value.result); } } catch (error) { console.error('App-server response error:', error.message); }
  }
});
(async () => {
  try {
    await request('initialize', { clientInfo: { name: 'shared-harness-validation', version: '1.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n');
    const hooks = await request('hooks/list', { cwds: [cwd] });
    const skills = await request('skills/list', { cwds: [cwd] });
    const report = { cwd, hooks, skills: skills.data?.map(entry => ({ cwd: entry.cwd, count: entry.skills?.length, errors: entry.errors })) || skills, stderr };
    fs.mkdirSync(path.join(root, 'state'), { recursive: true });
    fs.writeFileSync(path.join(root, 'state/native-codex.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { clearTimeout(timeout); child.kill(); }
})();
