---
id: "14"
title: Commit task 26, refresh the harness copy, lead the README with installation
status: done
session: 39a01a8e-0e45-4356-bfa4-8b8782c8b3d1
files:
  - README.md
  - FINDINGS.md
  - harness/**
  - harness-history.bundle
  - docs/**
created: 2026-11-12
---
# Commit task 26, refresh the harness copy, lead the README with installation

## Goal

origin/main holds the current harness (task 26) and the README opens with how to install it

## Plan

1. Commit task 26 in the live harness. 2. Replace harness/ from its HEAD and rebuild the bundle. 3. Move installation to the top of README.md with prerequisites, a check and how to update or undo. 4. Commit and push.

## Files

- none changed

## Checked

- `README followed on a fresh clone of ed1b948 with a throwaway HOME/USERPROFILE holding its own settings.json, CLAUDE.md, a skill and config.toml -> install ok, validate status pass, 0 files changed in the clone, git pull of an upstream change ok, reinstall ok, uninstall restored the home byte for byte, second uninstall 'nothing to undo'; harness/ == live harness 5565a8c; all 12 relative links in README.md and docs/ resolve to tracked files`
- cost: 18 min from begin to finish; Claude tokens 7,486,120 (fresh input 110,737, cache read 7,297,996, output 77,387; 1 session)
- new duplicate blocks: 0
- complexity share (functions over 10): n/a (no functions) (was n/a (no functions))
- dead code on added lines: 0
- prose patterns: 0 in 103 words

## Left over

1. Harness not tagged: harness/ is v2.1 plus tasks 26-27; tagging v2.2 is the owner's call. 2. README numbers are from Study 2 (Codex, gpt-6-luna); Claude Code was not measured. 3. Install and uninstall were tested on Windows 11 only.
