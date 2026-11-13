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

   Two tests in `test_install_version.js` fail here with exit 128. They clone the harness with its git history and tags, which only the live harness has. The deploy runs them in its clone.

3. Update [FINDINGS.md](../FINDINGS.md), then commit.
4. Deploy, below. Then commit the new bundle and push.

## Deploy to the live harness

From this repository's top folder, with the change committed:

```bash
node tools/deploy-harness.cjs --check   # build and test only; the live harness is not touched
node tools/deploy-harness.cjs           # build, test, then deploy
```

The script is the only way a change reaches the live harness. It:

1. Refuses uncommitted changes under `harness/` here, or any uncommitted change in the live harness.
2. Finds the commit here whose `harness/` matches the live harness. If none does, the live harness was changed outside this repository, and the script refuses (next section).
3. Clones the live harness into a temporary folder, with its history, tags and line-ending setting. It applies the difference between that commit and `harness/` now, then checks the clone's files match `harness/`. Then it runs every harness test in the clone. If a test fails, it stops, and the live harness is unchanged.
4. Fast-forwards the live harness to the tested commit, runs `tools/render.cjs` there, and rewrites `harness-history.bundle` here.

Then commit `harness-history.bundle` and push. Untracked files in the live harness are left alone: `installation.json`, `state/`, `generated/` and `rules/default.rules`. The script's self-test is `node --test tools/deploy-harness-selftest.cjs`.

## If the live harness was changed directly

The deploy refuses until the change is brought here. With no undeployed changes in `harness/`, copy the live harness's last commit over `harness/`, review the difference, and commit it:

```bash
rm -rf harness && mkdir harness
git -C C:/Users/jkind/.agents/harness archive HEAD | tar -x -C harness
git diff --stat -- harness
```

Uncommitted edits in the live harness have to be committed there first, or moved here by hand.

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
