# Maintaining this repository

Notes for the owner. To install or remove the harness, see the [README](../README.md).

## Where the harness lives

| Path | What it is |
|---|---|
| `harness/` | The development copy. Every harness change starts here. |
| `C:/Users/jkind/.agents/harness` | The installed copy (the live harness). The install links `~/.claude` and `~/.codex` to it, so a change there reaches every running session at once. It is a git repository with no remote. |
| `harness-history.bundle` | The live harness's full git history, with tags `v1`, `v2` and `v2.1` |

After each deploy, `harness/` holds exactly the live harness's tracked files, and the bundle holds its history.

## Change the harness

1. Begin a task in this repository with `task.js begin`, listing paths under `harness/`.
2. Edit and test in `harness/`. Run the tests from that folder with `ECC_TASK_FLOW` unset; with it set to `lean`, `test_harness_invariants.js` fails on the gate's lean wording:

   ```bash
   cd harness && env -u ECC_TASK_FLOW node --test task-system/tests/*.js scripts/hooks/tests/*.js
   ```

   Two tests in `test_install_version.js` fail here with exit 128. They clone the harness with its git history and tags, which only the live harness has. Run that file in the live harness after the deploy.

3. Update [FINDINGS.md](../FINDINGS.md), then commit.
4. Deploy, below. Then commit the new bundle and push.

## Deploy to the live harness

From this repository's top folder, in Git Bash, with the change committed:

```bash
LIVE=C:/Users/jkind/.agents/harness
git -C "$LIVE" status --porcelain                  # must print nothing
git fetch -q "$LIVE" main                          # the live harness's commits, as FETCH_HEAD
git diff --binary FETCH_HEAD HEAD:harness | git -C "$LIVE" apply --index
git -C "$LIVE" commit -m "<the change, as in this repository's commit>"
test "$(git -C "$LIVE" rev-parse 'HEAD^{tree}')" = "$(git rev-parse HEAD:harness)" && echo deployed
(cd "$LIVE" && node tools/render.cjs)
git -C "$LIVE" bundle create "$(pwd -W)/harness-history.bundle" --all
```

- The diff compares the live harness's last commit with `harness/` here. It carries every change not yet deployed, however many commits made it.
- The `test` line prints `deployed` only when the live harness's tracked files match `harness/` exactly.
- Untracked files in the live harness are left alone: `installation.json`, `state/`, `generated/` and `rules/default.rules`.
- `render.cjs` rewrites the instruction files that `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` link to.
- The bundle path must be absolute. `git -C` runs from the live harness, so a relative path would write the bundle there.

## Install an older version

The snapshot has no history, so it can only install the latest version. For another version, clone the bundle and install a tag:

```powershell
git clone harness-history.bundle harness-git
Set-Location harness-git
node tools/install.cjs --version v1
```

`--version` works from v2 on. v1's own installer does not know the option, so to come back from v1, run `git checkout main` and then `node tools/install.cjs`.

Codex keeps its command approvals in `rules/default.rules` inside the harness folder. Git does not track that file, so it is in neither the snapshot nor the bundle. Copy it across by hand when you move to another folder.

## Other records

- [FINDINGS.md](../FINDINGS.md) is the source of truth for results, design and what was released. Update it first.
- `task_list/` holds this study's task records, including harness changes from task 15 on. Earlier harness changes are recorded in `harness/task_list/`.
- The bundle's history still holds the old `skills/synced` files, which have been untracked since harness task 25.
