"""Merge a lane's close commit into the checkout this runs in, resolving the two conflicts
lane merges always produce and refusing everything else.

    python merge_lane.py <close-commit-sha> "<merge message>" [--rename OLD_ID:NEW_ID]

Rules it applies (from the night-shift skill):
  - refuses if a tracked code file is dirty here (a worker holds it): merge later
  - task_list/.journal.log: append-only, keep both sides, drop duplicate lines
  - a README (*.md outside task_list) with one conflict hunk: keep both sides
  - --rename OLD:NEW: the lane closed the task under OLD; this checkout renumbered it to
    NEW. The lane's closed file is kept under NEW's name, the checkout's open NEW file goes.
  - any other conflict: stops and prints it; nothing is committed
Commits with an explicit -m message (never the default merge message).
"""
import glob, io, os, re, subprocess, sys


def sh(*args, check=True):
    r = subprocess.run(args, capture_output=True, text=True)
    if check and r.returncode not in (0, 1):
        sys.exit(f"{' '.join(args)} failed: {r.stderr}")
    return r


def main(argv):
    sha, message = argv[0], argv[1]
    rename = None
    if "--rename" in argv:
        rename = argv[argv.index("--rename") + 1].split(":")
    dirty = [l[3:] for l in sh("git", "status", "--porcelain").stdout.splitlines() if not l.startswith("??")]
    code = [f for f in dirty if re.search(r"\.(py|js|ts|svelte|mjs)$", f)]
    if code:
        sys.exit("MERGE DEFERRED: a worker holds code here: " + ", ".join(code[:5]))
    r = sh("git", "merge", "--no-ff", sha, "-m", message)
    conflicted = sh("git", "diff", "--name-only", "--diff-filter=U").stdout.split()
    left = []
    for f in conflicted:
        text = io.open(f, encoding="utf-8").read()
        if f.endswith(".journal.log"):
            lines = [l for l in text.split("\n") if not l.startswith(("<<<<<<<", "=======", ">>>>>>>"))]
            seen, out = set(), []
            for l in lines:
                if l not in seen:
                    seen.add(l); out.append(l)
            io.open(f, "w", encoding="utf-8", newline="\n").write("\n".join(out))
            sh("git", "add", f); print("journal: kept both sides")
        elif f.endswith(".md") and not f.startswith("task_list") and text.count("<<<<<<<") == 1:
            resolved = re.sub(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n",
                              lambda m: m.group(1) if m.group(1).strip() == m.group(2).strip()
                              else m.group(1).rstrip("\n") + "\n" + m.group(2).lstrip("\n"), text, flags=re.S)
            io.open(f, "w", encoding="utf-8", newline="\n").write(resolved)
            sh("git", "add", f); print(f"{f}: kept both sides")
        else:
            left.append(f)
    if rename:
        old, new = rename
        lane_files = glob.glob(f"task_list/closed/{old}_*.md")
        mine = glob.glob(f"task_list/open/{new}_*.md")
        for lf in lane_files:
            s = io.open(lf, encoding="utf-8").read()
            s = s.replace(f'id: "{old}"', f'id: "{new}"', 1).replace(f"# Task {old}", f"# Task {new}", 1)
            dest = lf.replace(f"/{old}_", f"/{new}_").replace(f"\\{old}_", f"\\{new}_")
            io.open(dest, "w", encoding="utf-8", newline="\n").write(s)
            sh("git", "rm", "-q", "--cached", lf, check=False); os.remove(lf); sh("git", "add", dest)
            print(f"renamed {lf} -> {dest}")
        for m in mine:
            sh("git", "rm", "-q", "-f", m, check=False); print(f"removed {m}")
        left = [f for f in left if not (f.startswith("task_list/open/" + new + "_") or f.startswith("task_list/closed/" + old + "_"))]
    if left:
        sys.exit("UNRESOLVED (nothing committed): " + ", ".join(left))
    if sh("git", "diff", "--name-only", "--diff-filter=U").stdout.strip():
        sys.exit("UNRESOLVED (nothing committed)")
    sh("git", "commit", "-q", "-m", message)
    print(sh("git", "log", "--oneline", "-1").stdout.strip())
    lint = subprocess.run(["node", os.path.expanduser("~/.claude/task-system/task.js"), "lint"], capture_output=True, text=True)
    print(lint.stdout.strip().splitlines()[-1] if lint.stdout.strip() else lint.stderr.strip()[-200:])


if __name__ == "__main__":
    main(sys.argv[1:])
