#!/bin/sh
# night-shift launcher: one worker for one task, detached, with a pid and a done marker.
#   run.sh <id> <brief-file> [scratchpad-dir]
# Run it from the checkout (or worktree) the worker should work in. Writes:
#   <scratchpad>/<id>.pid   the claude process id (stop THIS worker with: kill "$(cat <id>.pid)")
#   <scratchpad>/<id>.json  the worker's final account (JSON, filled at exit)
#   <scratchpad>/<id>.stderr
#   <scratchpad>/<id>.done  the exit code, written when the worker exits
# Wait with:  until [ -f "$SP/<id>.done" ]; do sleep 30; done
# Never `kill` every claude process: a second lane's worker is a claude process too
# (2026-09-08: lane B's task 123 worker was killed that way while lane A was restarted).
# One worker per checkout: the single in_progress task is that checkout's lock.
set -eu
ID="$1"; BRIEF="$2"; SP="${3:-${TMPDIR:-/tmp}/night-shift}"
mkdir -p "$SP"
[ -f "$BRIEF" ] || { echo "no brief at $BRIEF" >&2; exit 2; }
if [ -f "$SP/$ID.done" ]; then echo "$SP/$ID.done exists; remove it to relaunch" >&2; exit 2; fi
if node ~/.claude/task-system/task.js list | grep -q "active task: [0-9]" && ! node ~/.claude/task-system/task.js list | grep -q "active task: $ID "; then
  echo "another task is in_progress in this checkout; refusing to launch a second worker" >&2; exit 3
fi
MODEL="${NIGHT_SHIFT_MODEL:-claude-opus-5}"
rm -f "$SP/$ID.pid"
nohup sh -c "claude -p \"\$(cat '$BRIEF')\" --model $MODEL --permission-mode auto --output-format json > '$SP/$ID.json' 2> '$SP/$ID.stderr' & echo \$! > '$SP/$ID.pid'; wait \$!; echo \$? > '$SP/$ID.done'" > /dev/null 2>&1 &
sleep 3
echo "launched worker for task $ID (model $MODEL) in $(pwd); pid -> $SP/$ID.pid; account -> $SP/$ID.json; marker -> $SP/$ID.done"
