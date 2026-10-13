# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **Stop**: When session ends (final verification)

## Current Hooks (in ~/.claude/settings.json)

### PreToolUse
- **tmux reminder**: Suggests tmux for long-running commands (npm, pnpm, yarn, cargo, etc.)
- **git push review**: Opens Zed for review before push
- **doc blocker**: Blocks creation of unnecessary .md/.txt files

- **file size gate** (`scripts/hooks/file-size-gate.js`): blocks a Write or Edit that would
  take a code file past 800 lines, and blocks any growth in a file already over it. A shrink
  always passes. Escape: the single `in_progress` task lists that path under a `shrinks:` key,
  which also makes `task.js verify` require the file smaller at close than at `--since`.
  Companion checks: `task.js audit` S-findings (every oversized file repo-wide, and whether an
  open task shrinks it) and `task.js start` (names the reserved files that may not grow).
  Silence it with `file-size-gate` in `ECC_DISABLED_HOOKS`. See rules/coding-style.md.

- **hyperparameter gate** (`scripts/hooks/hyperparam-gate.js`): blocks writing an
  experiment entry `.py` (a script under an experiment directory that parses args or has a
  main entry) unless it declares a module-level `HYPERPARAMETERS` dict (value + provenance
  per entry) or carries `# hyperparams n/a: <reason>`. Companion checks: `task-plan-lint.js`
  E6/E7 (experiment task needs a stamped name | value | source table) and
  `scripts/hyperparam-audit.js` (reports keys whose values diverge across the repo's
  HYPERPARAMETERS dicts and receipt JSONs). See rules/task-management.md §5 3c.

### PostToolUse
- **PR creation**: Logs PR URL and GitHub Actions status
- **Prettier**: Auto-formats JS/TS files after edit
- **TypeScript check**: Runs tsc after editing .ts/.tsx files
- **console.log warning**: Warns about console.log in edited files

### Stop
- **console.log audit**: Checks all modified files for console.log before session ends
- **task nudge / deps surface / task completion gate**: task-tracking gates (see task-management.md)
- **plain-language audit** (`scripts/hooks/plain-language-audit.js`): scans the final chat
  message + newly-added README/doc lines for the AI-tells and consultant-speak banned in
  `rules/communication-style.md`; soft, non-blocking nudge. Catches KNOWN offenders only —
  novel coined jargon stays on the rule + self-review. High-precision word list (stats-legit
  words like "significant"/"robust"/"comprehensive" deliberately omitted). To silence
  globally, add it to `ECC_DISABLED_HOOKS`.

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Never use dangerously-skip-permissions flag
- Configure `allowedTools` in `~/.claude.json` instead

## TodoWrite Best Practices

Use TodoWrite tool to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

Todo list reveals:
- Out of order steps
- Missing items
- Extra unnecessary items
- Wrong granularity
- Misinterpreted requirements
