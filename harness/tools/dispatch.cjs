'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, render, hash } = require('./render.cjs');
const { editsFromPatch } = require('./patch.cjs');
function matches(matcher, name) {
  return !matcher || matcher === '*' || new RegExp('^(?:' + matcher + ')$').test(name);
}
function inputsFor(input) {
  // Codex shell tools and Claude's Windows PowerShell tool get the same shell policy as Bash.
  if (['exec_command', 'functions.exec_command', 'shell', 'shell_command', 'PowerShell'].includes(input.tool_name)) {
    return [{ ...input, tool_name: 'Bash', tool_input: { ...input.tool_input, command: input.tool_input?.command || input.tool_input?.cmd || '' } }];
  }
  if (input.tool_name === 'apply_patch') {
    if (input.hook_event_name === 'PostToolUse') {
      const patch = input.tool_input?.command || input.tool_input?.patch;
      const names = [...String(patch).matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map(m => path.resolve(input.cwd, m[1]));
      return [...new Set(names)].map(file => ({ ...input, tool_name: 'Write', tool_input: { file_path: file, content: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' } }));
    }
    return editsFromPatch(input.tool_input?.command || input.tool_input?.patch, input.cwd).map(edit => ({ ...input, ...edit }));
  }
  return [input];
}
const DOC_FILE = /\.(?:md|txt|ipynb)$/i;
// A documentation file may be written when it is outside any repository (scratch, temp), is a
// README/agent file, lives in a task board, archive, scripts or harness folder, or is declared
// under `docs:` by a task in its repository (the record that the owner asked for it).
function docAllowed(file) {
  const p = file.replace(/\\/g, '/');
  if (/(?:^|\/)(?:README|CLAUDE|AGENTS|CONTRIBUTING)\.md$/i.test(p)) return true;
  if (/learnings\.md$|\/\.claude\/|\/\.agents\/harness\/|\/archive\/|\/scripts\/|\/docs\/tasks\/|\/task_list\//i.test(p)) return true;
  let dir = path.dirname(file);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', windowsHide: true });
  if (top.status !== 0) return true;
  return declaredInTaskDocs(top.stdout.trim(), file);
}
function declaredInTaskDocs(root, file) {
  const rel = path.relative(root, file).replace(/\\/g, '/').toLowerCase();
  for (const board of ['task_list', 'docs/tasks']) {
    for (const state of ['open', 'pending_review', 'closed']) {
      let names = [];
      try { names = fs.readdirSync(path.join(root, board, state)).filter(n => n.endsWith('.md')); } catch { continue; }
      for (const name of names) {
        const head = fs.readFileSync(path.join(root, board, state, name), 'utf8').replace(/\r\n/g, '\n').slice(0, 3000);
        const block = head.match(/^docs:[ \t]*\n((?:[ \t]+-[^\n]*\n?)+)/m)?.[1] || head.match(/^docs:[ \t]*\[([^\]]*)\]/m)?.[1] || '';
        const listed = block.split(/\n|,/).map(s => s.replace(/^\s*-?\s*/, '').replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, ''));
        if (listed.some(s => s.replace(/\\/g, '/').toLowerCase() === rel)) return true;
      }
    }
  }
  return false;
}
// Paths a shell command writes: redirect targets (not 2>&1), tee arguments, cp/mv destinations.
// Paths that are only read (cat, grep, sha256sum) are not targets.
// Keep quoted words intact so a displayed command is never mistaken for a write.
function shellTokens(command) {
  const tokens = [], backslash = String.fromCharCode(92), backtick = String.fromCharCode(96);
  let word = '', quote = null, wordStarted = false;
  const flush = () => { if (wordStarted) tokens.push({ value: word, operator: false }); word = ''; wordStarted = false; };
  for (let i = 0; i < command.length; i++) {
    const char = command[i], next = command[i + 1];
    const escapable = quote === '"' ? ['"', backslash, '$', backtick].includes(next) : !quote && /[\s'";&|<>]/.test(next || '');
    if ((char === backslash || char === backtick) && next && escapable) {
      word += command[++i]; wordStarted = true; continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; wordStarted = true; continue; }
    if (char === '\n' || char === '\r') { flush(); tokens.push({ value: ';', operator: true }); continue; }
    if (/\s/.test(char)) { flush(); continue; }
    if (/[;&|<>]/.test(char)) {
      flush();
      let operator = char;
      if ((char === '&' && command[i + 1] === '>') || (char === '>' && command[i + 1] === '&') ||
          (char === '<' && command[i + 1] === '&') || command[i + 1] === char) operator += command[++i];
      if (operator === '&>' && command[i + 1] === '>') operator += command[++i];
      tokens.push({ value: operator, operator: true });
    } else { word += char; wordStarted = true; }
  }
  flush();
  return tokens;
}
function shellWriteTargets(command, cwd) {
  const tokens = shellTokens(command), targets = [], segments = [];
  let segment = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.operator) { segment.push(token.value); continue; }
    if (['>', '>>', '&>', '&>>', '>&'].includes(token.value)) {
      const target = tokens[i + 1];
      if (target && !target.operator) {
        if (token.value !== '>&' || !/^\d+$/.test(target.value)) targets.push(target.value);
        i++;
      }
      continue;
    }
    if ([';', '|', '||', '&&', '&'].includes(token.value)) { segments.push(segment); segment = []; }
  }
  segments.push(segment);
  for (const words of segments) {
    const name = path.basename(words[0] || '').toLowerCase();
    const args = words.slice(1).filter(word => !word.startsWith('-'));
    if (name === 'tee') targets.push(...args);
    if (['cp', 'mv', 'copy-item', 'move-item'].includes(name) && args.length >= 2) {
      const destination = args.at(-1);
      let directory = false;
      try { directory = fs.statSync(path.resolve(cwd, destination)).isDirectory(); } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      }
      if (directory) targets.push(...args.slice(0, -1).map(source => path.join(destination, path.basename(source))));
      else targets.push(destination);
    }
  }
  return targets;
}
function builtin(name, input) {
  const p = String(input.tool_input?.file_path || '').replace(/\\/g, '/');
  const command = input.tool_input?.command || '';
  if (name === 'bash-documentation-policy') {
    const blocked = shellWriteTargets(command, input.cwd || '.').filter(t => DOC_FILE.test(t) && !docAllowed(path.resolve(input.cwd || '.', t)));
    if (blocked.length) return { status: 2, stderr: '[Hook] Documentation policy: this command writes ' + blocked.join(', ') + '. Use an existing README or task record, or list the file under `docs:` in the task that asked for it.\n' };
  }
  if (name === 'pr-created' && /gh pr create/.test(command)) {
    const output = JSON.stringify(input.tool_response || input.tool_output || '');
    const url = output.match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/)?.[0];
    return { status: 0, stderr: url ? '[Hook] PR created: ' + url + '\n' : '' };
  }
  if (name === 'console-stop-warning') {
    const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: input.cwd, encoding: 'utf8', windowsHide: true });
    const files = result.status === 0 ? result.stdout.trim().split('\n').filter(f => /\.(ts|tsx|js|jsx)$/.test(f)) : [];
    const found = files.filter(f => fs.existsSync(path.join(input.cwd, f)) && /console\.log/.test(fs.readFileSync(path.join(input.cwd, f), 'utf8')));
    return { status: 0, stderr: found.map(f => '[Hook] WARNING: console.log found in ' + f + '\n').join('') };
  }
  if (name === 'documentation-policy' && DOC_FILE.test(p) && !docAllowed(path.resolve(input.cwd || '.', p))) {
    return { status: 2, stderr: '[Hook] Documentation policy: use the existing README or task records. If the owner asked for this document, list it under `docs:` in that task, then retry.\n' };
  }
  if (name === 'console-warning' && /\.(ts|tsx|js|jsx)$/.test(p) && fs.existsSync(p) && /console\.log/.test(fs.readFileSync(p, 'utf8'))) return { status: 0, stderr: '[Hook] WARNING: console.log found in ' + p + '\n' };
  return { status: 0, stdout: '', stderr: '' };
}
function runHook(hook, input, env) {
  if (hook.builtin) return builtin(hook.builtin, input);
  const args = hook.args;
  const script = path.resolve(root, args[1]);
  if (!script.startsWith(root + path.sep) || !fs.existsSync(script)) throw new Error('Missing or unsafe hook script: ' + args[1]);
  if (/run-with-flags(?:-shell)?\.(?:js|sh)$/.test(script)) {
    const { isHookEnabled } = require(path.join(root, 'scripts/lib/hook-flags.js'));
    const previous = { ECC_HOOK_PROFILE: process.env.ECC_HOOK_PROFILE, ECC_DISABLED_HOOKS: process.env.ECC_DISABLED_HOOKS };
    Object.assign(process.env, { ECC_HOOK_PROFILE: env.ECC_HOOK_PROFILE || '', ECC_DISABLED_HOOKS: env.ECC_DISABLED_HOOKS || '' });
    const enabled = isHookEnabled(args[2], { profiles: args[4] });
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (!enabled) return { status: 0, stdout: '', stderr: '', skipped: 'profile' };
  }
  if (args[0] === 'shell') {
    const gitBash = 'C:/Program Files/Git/bin/bash.exe';
    const shell = process.platform === 'win32' && fs.existsSync(gitBash) ? gitBash : 'bash';
    return spawnSync(shell, [script.replace(/\\/g, '/'), ...args.slice(2)], { input: JSON.stringify(input), encoding: 'utf8', cwd: input.cwd, env: { ...env, CLAUDE_PLUGIN_ROOT: root.replace(/\\/g, '/') }, timeout: hook.timeout * 1000, windowsHide: true });
  }
  return spawnSync(process.execPath, [script, ...args.slice(2)], { input: JSON.stringify(input), encoding: 'utf8', cwd: input.cwd, env, timeout: hook.timeout * 1000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
}
function audit(record) {
  const dir = path.join(root, 'state');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'hook-runs.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...record }) + '\n');
}
// Claude enforces exit 2. Codex (probed on 0.162.0-alpha.17.2) ignores exit 2 and enforces only
// stdout JSON: a PreToolUse deny or a Stop block, each with a non-empty reason.
function refusal(provider, event, reason) {
  const text = reason.trim() || '[Shared harness] A hook refused this ' + event + ' event.';
  if (provider === 'codex' && event === 'PreToolUse') {
    return { status: 0, output: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: text } }) };
  }
  if (provider === 'codex' && event === 'Stop') return { status: 0, output: JSON.stringify({ decision: 'block', reason: text }) };
  return { status: event === 'PreToolUse' || event === 'Stop' ? 2 : 1, output: '' };
}
// A stuck session must still be able to end: after this many consecutive Stop refusals in one
// session, the next refused Stop is allowed and logged as a give-up with what was missing. A probe
// once looped through 251 refusals; the limit was 3 (2026-10-12), then 1 (owner, 2026-10-13: one
// nudge, because gate pressure led Claude to edit a file it had been told not to touch).
// One small file per session, so sessions never collide.
const STOP_REFUSAL_LIMIT = 1;
function stopRefusalFile(provider, input) {
  return path.join(root, 'state', 'stop-refusals', hash(provider + '\0' + (input.session_id || 'cwd:' + input.cwd)) + '.json');
}
function stopRefusalCount(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).count || 0; } catch (error) {
    if (error.code === 'ENOENT') return 0;
    // An unreadable counter counts as zero, so the gate keeps refusing (the strict side).
    process.stderr.write('[Shared harness] Unreadable stop-refusal counter, treating as 0: ' + error.message + '\n');
    return 0;
  }
}
function setStopRefusalCount(file, count) {
  if (count === 0) { fs.rmSync(file, { force: true }); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ count, updatedAt: new Date().toISOString() }));
}
function dispatch(provider, event, input) {
  if (!['claude', 'codex'].includes(provider)) throw new Error('Unknown provider');
  require('./propagation-state.cjs').recover(root);
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'core', 'policy.json'), 'utf8'));
  input = { ...input, cwd: input.cwd || process.cwd(), hook_event_name: event };
  const env = { ...process.env, ...policy.env, CLAUDE_PLUGIN_ROOT: root, CODEX_PLUGIN_ROOT: root, ECC_HARNESS_ROOT: root, CLAUDE_PROJECT_DIR: input.cwd };
  const records = [], messages = [];
  let revision;
  if (event === 'SessionStart' || event === 'UserPromptSubmit') revision = render();
  const inputs = inputsFor(input);
  const unrebuilt = inputs.filter(i => i.unrebuilt).map(i => i.tool_input.file_path);
  if (unrebuilt.length) audit({ provider, event, session: input.session_id, unrebuilt, note: 'patch context not found; allowed, gates judged the path only' });
  // Task scope must see all files in a single patch, even in an otherwise clean repo.
  if (event === 'PreToolUse' && input.tool_name === 'apply_patch') {
    env.ECC_PENDING_FILES = JSON.stringify(inputs.map(i => path.relative(input.cwd, i.tool_input.file_path).replace(/\\/g, '/')));
  }
  for (const item of inputs) {
    for (const hook of policy.hooks.filter(h => !h.disabled && h.event === event && matches(h.matcher, item.tool_name || '*'))) {
      const result = runHook(hook, item, env);
      const failed = result.error || result.signal || result.status === null;
      const status = failed ? 2 : result.status;
      records.push({ id: hook.id, status, skipped: result.skipped, scriptSha256: hook.args ? hash(fs.readFileSync(path.join(root, hook.args[1]))) : hash(hook.builtin) });
      const failure = failed ? '[Shared harness] Hook execution failed: ' + hook.id + ': ' + (result.error?.message || result.signal || 'no exit status') + '\n' : '';
      if (result.stderr) process.stderr.write(result.stderr);
      if (failure) process.stderr.write(failure);
      if (status !== 0) {
        if (event === 'Stop') {
          const counter = stopRefusalFile(provider, input);
          const refusals = stopRefusalCount(counter);
          if (refusals >= STOP_REFUSAL_LIMIT) {
            setStopRefusalCount(counter, 0);
            audit({ provider, event, session: input.session_id, revision, hooks: records, blocked: false, gaveUp: true, refusalsBefore: refusals, missing: String(result.stderr || failure).trim() });
            process.stderr.write('[Shared harness] Stop gate gave up after ' + refusals + ' consecutive refusals; the session may end with this unresolved: ' + String(result.stderr || failure).split('\n')[0] + '\n');
            return { status: 0, output: '' };
          }
          setStopRefusalCount(counter, refusals + 1);
        }
        audit({ provider, event, session: input.session_id, revision, hooks: records, blocked: true });
        return refusal(provider, event, (result.stderr || '') + failure);
      }
      if (result.stdout?.trim()) {
        try {
          const out = JSON.parse(result.stdout);
          // Upstream scripts often echo their input. Never treat that as hook output.
          if (!out.hook_event_name && !out.tool_input && !out.session_id) {
            if (out.decision === 'block' || out.hookSpecificOutput?.permissionDecision === 'deny') {
              audit({ provider, event, session: input.session_id, hooks: records, blocked: true });
              return { status: 0, output: JSON.stringify(out) };
            }
            if (out.hookSpecificOutput?.additionalContext) messages.push(out.hookSpecificOutput.additionalContext);
            if (out.systemMessage) messages.push(out.systemMessage);
          }
        } catch { if (event === 'SessionStart' || event === 'UserPromptSubmit') messages.push(result.stdout.trim()); }
      }
    }
  }
  // A Stop that passes ends the run of consecutive refusals.
  if (event === 'Stop') setStopRefusalCount(stopRefusalFile(provider, input), 0);
  if (revision) messages.push('Shared harness loaded; instructions SHA256 ' + (provider === 'claude' ? revision.claudeInstructionsSha256 : revision.instructionsSha256) + '. Source: ' + root.replace(/\\/g, '/') + '.');
  audit({ provider, event, session: input.session_id, revision, hooks: records, blocked: false });
  const output = messages.length ? JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: messages.join('\n') } }) : '{}';
  return { status: 0, output };
}
module.exports = { dispatch, inputsFor, matches, builtin, refusal };
if (require.main === module) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const result = dispatch(process.argv[2], process.argv[3], input);
    if (result.output) process.stdout.write(result.output);
    process.exitCode = result.status;
  } catch (error) {
    const message = '[Shared harness] ' + error.message + '\n';
    process.stderr.write(message);
    const result = refusal(process.argv[2], process.argv[3], message);
    if (result.output) process.stdout.write(result.output);
    process.exitCode = result.output ? 0 : 2;
  }
}
