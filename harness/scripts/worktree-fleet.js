#!/usr/bin/env node
'use strict';

/**
 * worktree-fleet.js — run several Claude sessions side by side on one repo.
 *
 * Windows-native counterpart to scripts/orchestrate-worktrees.js, which shells out to tmux.
 * tmux is not available on Windows, so this launches one Windows Terminal tab per worktree
 * instead. Where Windows Terminal is missing it prints the commands rather than running them.
 *
 * Usage:
 *   node worktree-fleet.js up [--count N] [--names a,b,c] [--base BRANCH]
 *                             [--analysis] [--dry-run] [--no-launch]
 *   node worktree-fleet.js status
 *   node worktree-fleet.js down <name|--all> [--force]
 *   node worktree-fleet.js aliases
 *
 * Source of truth for membership is git, not the manifest: `status` reconciles
 * <repo>/.claude/fleet.json against `git worktree list` and reports drift.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_NAMES = ['a', 'b', 'c', 'd', 'e'];
const TAB_COLOURS = {
  a: '#2d6a4f',
  b: '#1d3557',
  c: '#6a040f',
  d: '#5a189a',
  e: '#7f5539',
  analysis: '#343a40'
};
const MAX_FLEET = 8;

// ---------------------------------------------------------------- git helpers

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.error) {
    throw new Error(`git ${args.join(' ')} could not be run: ${res.error.message}`);
  }
  return {
    code: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim()
  };
}

function gitOrThrow(args, cwd) {
  const res = git(args, cwd);
  if (res.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed (exit ${res.code}): ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function repoRoot(cwd) {
  const res = git(['rev-parse', '--show-toplevel'], cwd);
  if (res.code !== 0) {
    throw new Error(`Not inside a git repository: ${cwd}`);
  }
  return path.resolve(res.stdout);
}

function currentBranch(cwd) {
  return gitOrThrow(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

function listWorktrees(root) {
  const raw = gitOrThrow(['worktree', 'list', '--porcelain'], root);
  return raw
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map(block => {
      const lines = block.split(/\r?\n/);
      const get = prefix => {
        const hit = lines.find(l => l.startsWith(prefix + ' '));
        return hit ? hit.slice(prefix.length + 1).trim() : null;
      };
      const wt = get('worktree');
      return {
        worktreePath: wt ? path.resolve(wt) : null,
        branch: (get('branch') || '').replace(/^refs\/heads\//, '') || null
      };
    })
    .filter(w => w.worktreePath);
}

function hasUncommittedChanges(worktreePath) {
  const res = git(['status', '--porcelain'], worktreePath);
  if (res.code !== 0) return true; // unreadable: treat as dirty, never silently delete
  return res.stdout.length > 0;
}

// ----------------------------------------------------------------- manifest

function manifestPath(root) {
  return path.join(root, '.claude', 'fleet.json');
}

function readManifest(root) {
  const file = manifestPath(root);
  if (!fs.existsSync(file)) return { version: 1, repoRoot: root, members: [] };
  const raw = fs.readFileSync(file, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return { version: 1, repoRoot: root, members: [], ...parsed };
  } catch (err) {
    throw new Error(`Fleet manifest at ${file} is not valid JSON: ${err.message}`);
  }
}

function writeManifest(root, manifest) {
  const file = manifestPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return file;
}

// ------------------------------------------------------------------ planning

function fleetDir(root) {
  return path.join(path.dirname(root), `${path.basename(root)}-fleet`);
}

function planMembers(root, names, base, stamp) {
  const dir = fleetDir(root);
  return names.map(name => ({
    name,
    branch: `fleet/${name}`,
    base,
    worktreePath: path.join(dir, name),
    tabColour: TAB_COLOURS[name] || '#495057',
    createdAt: stamp
  }));
}

// ------------------------------------------------------------------ terminal

function windowsTerminalPath() {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(finder, ['wt.exe'], { encoding: 'utf8', shell: true });
  if (res.status !== 0) return null;
  const first = (res.stdout || '').split(/\r?\n/).map(s => s.trim()).find(Boolean);
  return first || null;
}

function launchArgs(member) {
  return [
    '-w', '0',
    'new-tab',
    '--title', `${member.name} - ${path.basename(member.worktreePath)}`,
    '--tabColor', member.tabColour,
    '-d', member.worktreePath,
    'cmd', '/k', 'claude'
  ];
}

function launchMember(member, wt) {
  if (!wt) {
    console.log(`  [no Windows Terminal] run by hand: cd "${member.worktreePath}" && claude`);
    return false;
  }
  const res = spawnSync(wt, launchArgs(member), { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`  tab launch failed for ${member.name}: ${(res.stderr || '').trim()}`);
    return false;
  }
  console.log(`  tab opened for ${member.name}`);
  return true;
}

// ------------------------------------------------------------------ commands

function cmdUp(root, opts) {
  const base = opts.base || currentBranch(root);
  if (!opts.names && opts.count > DEFAULT_NAMES.length) {
    throw new Error(
      `--count ${opts.count} is above the ${DEFAULT_NAMES.length} built-in names ` +
      `(${DEFAULT_NAMES.join(', ')}). Pass --names to choose your own.`);
  }
  const names = opts.names
    ? opts.names
    : DEFAULT_NAMES.slice(0, opts.count).concat(opts.analysis ? ['analysis'] : []);

  if (names.length === 0) throw new Error('Nothing to create: --count resolved to 0.');
  if (new Set(names).size !== names.length) {
    throw new Error(`Duplicate names in --names: ${names.join(', ')}`);
  }
  if (names.length > MAX_FLEET) {
    throw new Error(`Refusing to create ${names.length} worktrees; the ceiling is ${MAX_FLEET}.`);
  }

  const existing = listWorktrees(root);
  const stamp = new Date().toISOString();
  const planned = planMembers(root, names, base, stamp).filter(m => {
    const clash = existing.find(w => w.worktreePath === m.worktreePath);
    if (clash) {
      console.log(`  ${m.name}: already exists at ${m.worktreePath} - leaving it alone`);
      return false;
    }
    return true;
  });

  console.log(`Fleet plan for ${root}`);
  console.log(`  base branch: ${base}`);
  planned.forEach(m => console.log(`  ${m.name}  ${m.branch}  ->  ${m.worktreePath}`));
  if (planned.length === 0) {
    console.log('Nothing new to create.');
    return 0;
  }
  if (opts.dryRun) {
    console.log(`\nDry run: ${planned.length} worktree(s) planned, none created.`);
    return 0;
  }

  fs.mkdirSync(fleetDir(root), { recursive: true });
  const created = planned.map(m => {
    const branchExists = git(['rev-parse', '--verify', '--quiet', m.branch], root).code === 0;
    const args = branchExists
      ? ['worktree', 'add', m.worktreePath, m.branch]
      : ['worktree', 'add', '-b', m.branch, m.worktreePath, base];
    gitOrThrow(args, root);
    console.log(`  created ${m.name} at ${m.worktreePath}`);
    return m;
  });

  const prior = readManifest(root);
  const kept = prior.members.filter(m => !created.some(c => c.name === m.name));
  const manifest = { version: 1, repoRoot: root, updatedAt: stamp, members: [...kept, ...created] };
  console.log(`Manifest: ${writeManifest(root, manifest)}`);

  if (opts.launch) {
    const wt = windowsTerminalPath();
    console.log(wt
      ? '\nLaunching one Claude session per worktree:'
      : '\nWindows Terminal (wt.exe) not found - start each session by hand:');
    created.forEach(m => launchMember(m, wt));
  }
  console.log(`\n${created.length} worktree(s) ready. Run \`status\` to check on them.`);
  return 0;
}

function describeMember(root, m, liveByPath) {
  const registered = liveByPath.has(m.worktreePath);
  const onDisk = fs.existsSync(m.worktreePath);
  if (registered && onDisk) return hasUncommittedChanges(m.worktreePath) ? 'dirty' : 'clean';
  if (onDisk) return 'DRIFT: directory exists but git does not track it';
  return 'DRIFT: recorded in manifest but missing on disk';
}

function cmdStatus(root) {
  const manifest = readManifest(root);
  const live = listWorktrees(root);
  const liveByPath = new Map(live.map(w => [w.worktreePath, w]));
  const file = manifestPath(root);

  console.log(`Fleet for ${root}`);
  console.log(`Manifest: ${file}${fs.existsSync(file) ? '' : ' (none yet)'}\n`);

  manifest.members.forEach(m => {
    console.log(`  ${m.name.padEnd(9)} ${String(m.branch).padEnd(14)} ${describeMember(root, m, liveByPath)}`);
    console.log(`  ${' '.repeat(9)} ${m.worktreePath}`);
  });

  const untracked = live.filter(w =>
    w.worktreePath !== root && !manifest.members.some(m => m.worktreePath === w.worktreePath));
  untracked.forEach(w =>
    console.log(`  (untracked) ${String(w.branch || '-').padEnd(14)} ${w.worktreePath}`));

  if (manifest.members.length === 0 && untracked.length === 0) {
    console.log('  no fleet worktrees');
  }
  return 0;
}

function cmdDown(root, target, force) {
  const manifest = readManifest(root);
  const targets = target === '--all'
    ? manifest.members
    : manifest.members.filter(m => m.name === target);

  if (targets.length === 0) {
    throw new Error(`No fleet member named "${target}". Run \`status\` to see the fleet.`);
  }

  const removed = targets.filter(m => {
    if (!fs.existsSync(m.worktreePath)) {
      console.log(`  ${m.name}: already gone from disk - dropping from manifest`);
      return true;
    }
    if (!force && hasUncommittedChanges(m.worktreePath)) {
      console.error(`  ${m.name}: has uncommitted changes - refusing. Commit, or pass --force.`);
      return false;
    }
    const args = ['worktree', 'remove', m.worktreePath].concat(force ? ['--force'] : []);
    const res = git(args, root);
    if (res.code !== 0) {
      console.error(`  ${m.name}: git worktree remove failed: ${res.stderr}`);
      return false;
    }
    console.log(`  ${m.name}: removed`);
    return true;
  });

  const kept = manifest.members.filter(m => !removed.some(r => r.name === m.name));
  writeManifest(root, { ...manifest, updatedAt: new Date().toISOString(), members: kept });
  const refused = targets.length - removed.length;
  if (refused > 0) {
    console.error(`\n${refused} worktree(s) kept because they had uncommitted work.`);
    return 1;
  }
  return 0;
}

function cmdAliases(root) {
  const manifest = readManifest(root);
  const members = manifest.members.length
    ? manifest.members
    : planMembers(root, DEFAULT_NAMES.slice(0, 3), 'main', '');
  console.log('# Add to your PowerShell $PROFILE, then `. $PROFILE` to reload.');
  console.log('# One letter per worktree: za, zb, zc ... jumps there and starts Claude.');
  members.forEach(m => {
    console.log(`function z${m.name} { Set-Location '${m.worktreePath}'; claude }`);
  });
  console.log(`function z0 { Set-Location '${root}'; claude }   # back to the main checkout`);
  return 0;
}

// ---------------------------------------------------------------------- main

const VALUE_FLAGS = ['--count', '--names', '--base'];

function parseArgs(argv) {
  const args = argv.slice(2);
  const flag = name => args.includes(name);
  const value = name => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
  };
  const positional = args.filter((a, i) =>
    !a.startsWith('--') && !(i > 0 && VALUE_FLAGS.includes(args[i - 1])));
  const countRaw = value('--count');
  return {
    command: positional[0] || 'status',
    target: positional[1] || null,
    count: countRaw === null ? 3 : Number(countRaw),
    names: value('--names') ? value('--names').split(',').map(s => s.trim()).filter(Boolean) : null,
    base: value('--base'),
    analysis: flag('--analysis'),
    dryRun: flag('--dry-run'),
    launch: !flag('--no-launch'),
    force: flag('--force'),
    all: flag('--all')
  };
}

function usage() {
  console.log([
    'worktree-fleet - several Claude sessions side by side on one repo',
    '',
    '  up      [--count N] [--names a,b,c] [--base BRANCH] [--analysis]',
    '          [--dry-run] [--no-launch]   create worktrees and open a tab each',
    '  status                              reconcile the manifest against git',
    '  down    <name>|--all [--force]      remove worktrees (refuses if dirty)',
    '  aliases                             print PowerShell za/zb/zc shortcuts'
  ].join('\n'));
}

function main() {
  const opts = parseArgs(process.argv);
  if (['-h', '--help', 'help'].includes(opts.command)) {
    usage();
    return 0;
  }
  const root = repoRoot(process.cwd());
  if (!Number.isInteger(opts.count) || opts.count < 0) {
    throw new Error(`--count must be a non-negative whole number, got "${opts.count}".`);
  }

  switch (opts.command) {
    case 'up': return cmdUp(root, opts);
    case 'status': return cmdStatus(root);
    case 'down': return cmdDown(root, opts.all ? '--all' : opts.target, opts.force);
    case 'aliases': return cmdAliases(root);
    default:
      usage();
      throw new Error(`Unknown command "${opts.command}".`);
  }
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`worktree-fleet: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { planMembers, fleetDir, listWorktrees, readManifest, writeManifest, launchArgs, parseArgs };
