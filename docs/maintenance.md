# Maintaining this repository

Notes for the owner. To install or remove the harness, see the [README](../README.md).

## Where the harness lives

The harness is developed in its own git repository at `C:/Users/jkind/.agents/harness` (the live harness). That repository has no remote. This repository carries it to GitHub in two forms:

| Path | What it is |
|---|---|
| `harness/` | The live harness's tracked files at its latest commit, without git history (the snapshot) |
| `harness-history.bundle` | The live harness's full git history, with tags `v1`, `v2` and `v2.1` |

Change the harness in the live repository, through its own task board, then refresh both.

## Refresh the snapshot and the bundle

From this repository's top folder, in Git Bash:

```bash
rm -rf harness && mkdir harness
git -C C:/Users/jkind/.agents/harness archive HEAD | tar -x -C harness
git -C C:/Users/jkind/.agents/harness bundle create "$PWD/harness-history.bundle" --all
```

The bundle path must be absolute: `git -C` runs from the live harness, so a relative path would write the bundle there.

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
- `task_list/` holds this study's task records.
- The bundle's history still holds the old `skills/synced` files, which have been untracked since harness task 25.
