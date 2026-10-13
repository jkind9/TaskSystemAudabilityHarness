'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { root } = require('./render.cjs');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-native-'));
const config = path.join(root, 'state/empty-mcp.json');
fs.mkdirSync(path.dirname(config), { recursive: true });
fs.writeFileSync(config, JSON.stringify({ mcpServers: {} }));
const provider = process.argv[2] || 'claude';
const prompt = process.argv[3] || 'Return only the shared harness source path stated in your loaded global instructions. Do not use tools.';
const binary = provider === 'claude' ? path.join(os.homedir(), '.local/bin/claude.exe') : (process.argv[4] || 'codex.exe');
const args = provider === 'claude' ? ['-p', '--tools', '', '--strict-mcp-config', '--mcp-config', config, '--output-format', 'json', prompt] : ['exec', '--skip-git-repo-check', '--json', '-C', cwd, prompt];
console.log('Starting native ' + provider + ' instruction probe.');
const result = spawnSync(binary, args, { cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
fs.writeFileSync(path.join(root, 'state', provider + '-live-raw.json'), result.stdout || '');
let response, session;
if (provider === 'claude' && result.stdout) {
  const parsed = JSON.parse(result.stdout); response = parsed.result; session = parsed.session_id;
} else if (result.stdout) {
  const events = result.stdout.trim().split('\n').map(l => JSON.parse(l));
  response = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').map(e => e.item.text).join('\n');
  session = events.find(e => e.type === 'thread.started')?.thread_id;
}
const report = { provider, status: result.status, error: result.error?.message, response, session, stderr: result.stderr, cwd };
fs.writeFileSync(path.join(root, 'state', provider + '-live.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
process.exitCode = result.status === 0 ? 0 : 1;
