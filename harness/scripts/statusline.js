#!/usr/bin/env node
'use strict';

/**
 * statusline.js — the strip under the prompt.
 *
 * Reads the status-line JSON payload on stdin and prints one line:
 *   dir  branch*  wt:a  task:08  ctx 73%  Opus 5  14:30
 *
 * The two fields that are not cosmetic:
 *   wt:<name>   which fleet worktree this session is in (see scripts/worktree-fleet.js)
 *   task:<id>   the id of the in_progress task, or "task:none" when work is unbound.
 * "task:none" while editing code is the signal that the session is about to hit the
 * task gate, and that whatever is being changed has no receipt attached to it.
 *
 * Never throws: a status line that crashes hides the whole strip, so every lookup is
 * wrapped and degrades to an empty field.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ESC = String.fromCharCode(27);
const colour = code => `${ESC}[${code}m`;
const C = {
  reset: colour(0),
  dir: colour('38;2;30;102;245'),
  branch: colour('38;2;64;160;43'),
  dirty: colour('38;2;223;142;29'),
  ctx: colour('38;2;136;57;239'),
  accent: colour('38;2;23;146;153'),
  warn: colour('38;2;210;15;57'),
  dim: colour('38;2;76;79;105')
};

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    return '';
  }
}

function safe(fn, fallback) {
  try {
    const out = fn();
    return out === undefined || out === null ? fallback : out;
  } catch (err) {
    return fallback;
  }
}

function gitOut(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 2000 });
  if (res.status !== 0) return null;
  return (res.stdout || '').trim();
}

/** Walk up from cwd looking for a directory that contains any of `names`. */
function findUp(startDir, names) {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 12; depth += 1) {
    const hit = names.find(n => fs.existsSync(path.join(dir, n)));
    if (hit) return path.join(dir, hit);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** id of the single in_progress task, or null. Scans the open/ folder only. */
function activeTaskId(cwd) {
  const openDir = findUp(cwd, [path.join('task_list', 'open'), path.join('docs', 'tasks', 'open')]);
  if (!openDir) return null;
  const files = fs.readdirSync(openDir).filter(f => f.endsWith('.md'));
  const active = files.find(f => {
    const head = fs.readFileSync(path.join(openDir, f), 'utf8').slice(0, 800);
    return /^status:\s*in_progress\s*$/m.test(head);
  });
  if (!active) return null;
  return active.split('_')[0];
}

/** name of this worktree if it belongs to a fleet, else null. */
function fleetName(cwd) {
  const top = gitOut(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return null;
  const here = path.resolve(top);
  const common = gitOut(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const mainRoot = common ? path.dirname(path.resolve(common)) : here;
  const manifest = path.join(mainRoot, '.claude', 'fleet.json');
  if (!fs.existsSync(manifest)) return null;
  const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const member = (parsed.members || []).find(m => path.resolve(m.worktreePath) === here);
  return member ? member.name : null;
}

function contextPercent(payload) {
  const cw = payload.context_window || {};
  if (typeof cw.remaining_percentage === 'number') return Math.round(cw.remaining_percentage);
  if (typeof cw.used_percentage === 'number') return Math.round(100 - cw.used_percentage);
  const used = cw.used_tokens;
  const total = cw.total_tokens || cw.max_tokens;
  if (typeof used === 'number' && typeof total === 'number' && total > 0) {
    return Math.round(100 - (used / total) * 100);
  }
  return null;
}

function main() {
  const raw = readStdin();
  const payload = safe(() => JSON.parse(raw), {});
  const cwd = safe(() => payload.workspace && payload.workspace.current_dir, null) || process.cwd();

  const shortDir = path.basename(cwd);
  const branch = safe(() => gitOut(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']), null);
  const dirty = branch ? safe(() => (gitOut(cwd, ['status', '--porcelain']) || '').length > 0, false) : false;
  const wt = safe(() => fleetName(cwd), null);
  const task = safe(() => activeTaskId(cwd), null);
  const ctx = safe(() => contextPercent(payload), null);
  const model = safe(() => payload.model && payload.model.display_name, '') || '';
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const parts = [`${C.dir}${shortDir}${C.reset}`];
  if (branch) parts.push(`${C.branch}${branch}${C.dirty}${dirty ? '*' : ''}${C.reset}`);
  if (wt) parts.push(`${C.accent}wt:${wt}${C.reset}`);
  parts.push(task
    ? `${C.accent}task:${task}${C.reset}`
    : `${C.warn}task:none${C.reset}`);
  if (ctx !== null) {
    const ctxColour = ctx <= 20 ? C.warn : C.ctx;
    parts.push(`${ctxColour}ctx ${ctx}%${C.reset}`);
  }
  if (model) parts.push(`${C.dim}${model}${C.reset}`);
  parts.push(`${C.dim}${clock}${C.reset}`);

  process.stdout.write(parts.join('  ') + '\n');
}

main();
