"""Where did a worker's time go? Reads a Claude Code session transcript (JSONL) and prints
minutes inside each tool, minutes of model latency between steps, and every call over 45 s.

    python profile.py <transcript.jsonl>
    python profile.py --newest <projects dir> [--not <own session id>]

Run it on a worker's transcript at close and paste the table into the task's Receipts, so the
protocol's cost is measured, not felt.
"""
import collections, datetime, glob, json, os, sys


def pick(args):
    if args and args[0] == "--newest":
        proj = args[1]
        skip = args[3] if len(args) > 3 and args[2] == "--not" else None
        files = sorted(glob.glob(os.path.join(proj, "*.jsonl")), key=os.path.getmtime, reverse=True)
        return [f for f in files if not (skip and skip in f)][0]
    return args[0]


def main(args):
    path = pick(args)
    starts, rows, gaps = {}, [], []
    first = last = prev_result = None
    for line in open(path, encoding="utf-8"):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        ts = r.get("timestamp")
        m = r.get("message")
        if not ts or not isinstance(m, dict):
            continue
        t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        first = first or t
        last = t
        if m.get("role") == "assistant":
            if prev_result:
                gaps.append((t - prev_result).total_seconds())
                prev_result = None
            for c in m.get("content", []):
                if isinstance(c, dict) and c.get("type") == "tool_use":
                    inp = c.get("input", {})
                    label = inp.get("description") or inp.get("command") or inp.get("file_path") or inp.get("subagent_type") or ""
                    starts[c["id"]] = (t, c["name"], str(label)[:80])
        elif m.get("role") == "user" and isinstance(m.get("content"), list):
            for c in m["content"]:
                if isinstance(c, dict) and c.get("type") == "tool_result" and c.get("tool_use_id") in starts:
                    t0, name, label = starts.pop(c["tool_use_id"])
                    rows.append((t0, (t - t0).total_seconds(), name, label))
                    prev_result = t
    if not rows:
        sys.exit("no tool calls found in " + path)
    wall = (last - first).total_seconds() / 60
    by, cnt = collections.defaultdict(float), collections.Counter()
    for _, dur, name, _ in rows:
        by[name] += dur
        cnt[name] += 1
    print(f"transcript {os.path.basename(path)}")
    print(f"elapsed {wall:.0f} min | tool calls {len(rows)} | inside tools {sum(x[1] for x in rows)/60:.0f} min | "
          f"model latency between steps {sum(gaps)/60:.0f} min (median {sorted(gaps)[len(gaps)//2]:.0f}s, max {max(gaps):.0f}s)")
    print("| tool | calls | minutes |\n|---|---:|---:|")
    for name in sorted(by, key=by.get, reverse=True):
        print(f"| {name} | {cnt[name]} | {by[name]/60:.1f} |")
    print("\ncalls over 45 s:")
    for t0, dur, name, label in rows:
        if dur > 45:
            print(f"  {t0.strftime('%H:%M:%S')}  {dur/60:4.1f} min  {name:8s} {label}")
    if starts:
        print("still running:", [(v[0].strftime('%H:%M:%S'), v[1], v[2]) for v in starts.values()])


if __name__ == "__main__":
    main(sys.argv[1:])
