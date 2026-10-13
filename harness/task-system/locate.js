"use strict";
// Find the project and its task board for task.js.
//
// Inside a git repository, search for docs/tasks/ or task_list/ only up to the folder that holds
// .git, and default to task_list/ there. A repository nested in another project's folder must
// never read or write that project's board (Study 2 pilot runs leaked into the study's own board).
// .git is found on disk, not by running git, so this also holds where git cannot start.
// Outside any repository, search every folder above and default to CLAUDE_PROJECT_DIR or cwd.
const fs = require("fs");
const path = require("path");

const CONVENTIONS = ["docs/tasks", "task_list"];

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

/** Returns { root, taskRoot, conv }: the project folder, its board folder and the board's name. */
function locate(start = process.cwd(), projectDir = process.env.CLAUDE_PROJECT_DIR) {
  const chain = [start];
  let p = start;
  while (!fs.existsSync(path.join(p, ".git"))) {
    const up = path.dirname(p);
    if (up === p) break;
    chain.push(up);
    p = up;
  }
  const repoTop = fs.existsSync(path.join(p, ".git")) ? p : null;
  for (const base of chain) {
    for (const conv of CONVENTIONS) {
      if (isDir(path.join(base, conv))) return { root: base, taskRoot: path.join(base, conv), conv };
    }
  }
  const env = (projectDir || "").trim();
  const root = repoTop || (env && isDir(env) ? env : start);
  return { root, taskRoot: path.join(root, "task_list"), conv: "task_list" };
}

module.exports = { locate };
