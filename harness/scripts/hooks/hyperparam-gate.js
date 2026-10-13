// PreToolUse gate for Write|Edit on .py files: the DECLARED-HYPERPARAMETERS contract (task 67).
//
// An experiment entry script must enumerate its tunable values in a module-level
// HYPERPARAMETERS dict (value + provenance), or carry an explicit escape line.
// Motivation: the WACV stride failure — deterministic stride-and-truncate bank
// sampling went into experiment code as an unexamined default, the paper built an
// invalid inference on it, and an external reviewer caught it (task 36 / review
// item 46). No gate saw the choice because it lived in a code default. Companion
// to experiment-brick-gate.js, which guards composition; this guards values.
// The declaration pattern being mandated is the one proven in
// supplement_experiments/score_patchcore.py:33 (dict entries state value AND
// provenance; the campaign runner writes the dict into the result JSON).
//
//   pass  - not a .py write, or path has no directory segment containing "experiment"
//   pass  - test file (tests/ dir, test_*.py, conftest.py)
//   pass  - content is not an entry script (no argparse / def main( / __main__ guard)
//   pass  - content (for Edit: disk content + new fragment) contains HYPERPARAMETERS
//   pass  - content carries "# hyperparams n/a: <reason>" (the reviewable escape)
//   block - otherwise: experiment entry script with undeclared tunable values
//
// Mirrors task-gate.js conventions: stdin JSON in, echo stdin + exit 0 on pass,
// stderr + exit 2 on block, never hard-fail on internal error.

const fs = require('fs');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  let inp = {};
  try { inp = JSON.parse(d); } catch { console.log(d); process.exit(0); }
  try {
    const ti = inp.tool_input || {};
    const target = String(ti.file_path || '').replace(/\\/g, '/');
    if (!/\.py$/i.test(target)) { console.log(d); process.exit(0); }

    const p = target.toLowerCase();
    // Scope: any directory segment containing "experiment" (experiments/,
    // supplement_experiments/, ...). Everything else is out of scope.
    if (!/(^|\/)[^/]*experiment[^/]*\//.test(p)) { console.log(d); process.exit(0); }
    // Test files are exempt — they pin behaviour, they don't run campaigns.
    if (/\/tests?\//.test(p) || /\/(test_[^/]*|conftest)\.py$/.test(p)) { console.log(d); process.exit(0); }

    // Content under inspection: full file for Write; for Edit, what the file will
    // roughly contain — its current disk content plus the new fragment.
    let content = '';
    if (ti.content != null) {
      content = String(ti.content);
    } else {
      try { content = fs.readFileSync(target.replace(/\//g, require('path').sep), 'utf8'); }
      catch { try { content = fs.readFileSync(target, 'utf8'); } catch { /* new file via Edit: fragment only */ } }
      if (ti.new_string != null) content += '\n' + String(ti.new_string);
    }
    if (!content) { console.log(d); process.exit(0); }

    // Entry-script tell: it parses arguments or has a main entry point.
    const isEntry = /\bargparse\b|\badd_argument\s*\(|\bdef\s+main\s*\(|__main__/.test(content);
    if (!isEntry) { console.log(d); process.exit(0); }

    if (/\bHYPERPARAMETERS\b/.test(content)) { console.log(d); process.exit(0); }

    // Deliberate, reviewable escape.
    if (/#\s*hyperparams\s+n\/?a\s*:\s*\S/i.test(content)) { console.log(d); process.exit(0); }

    console.error('[Hook] HYPERPARAMETER GATE: STOP-AND-REDIRECT (not a transient error). Do NOT retry this write unchanged.');
    console.error('[Hook] This is an experiment entry script with no module-level HYPERPARAMETERS dict.');
    console.error('[Hook] The contract (task 67): every tunable value an experiment runs with is enumerated');
    console.error('[Hook] with its provenance, BEFORE results exist. A silent default (frame sampling, caps,');
    console.error('[Hook] model settings, seeds, decode/resolution) is a scientific choice nobody flagged as a');
    console.error('[Hook] choice — the stride-sampling failure that cost a review cycle entered exactly this way.');
    console.error('[Hook] Fix one of these ways:');
    console.error('[Hook]   1. Add a module-level HYPERPARAMETERS = {...} naming EVERY tunable value, each entry');
    console.error('[Hook]      stating the value and where it came from (inherited receipt/file:line, or a human');
    console.error('[Hook]      ruling). Model: supplement_experiments/score_patchcore.py:33. Pass the dict into');
    console.error('[Hook]      the result JSON so the receipt records what actually ran.');
    console.error('[Hook]   2. Cross-check values against prior use first: node ~/.claude/scripts/hyperparam-audit.js');
    console.error('[Hook]      <repo root> — any key that diverges from an earlier receipt needs a stated reason.');
    console.error('[Hook]   3. New or deviating values are the USER\'s call, not yours: ask, then record the ruling');
    console.error('[Hook]      in the task file\'s ## Hyperparameters table (confirmed <date>).');
    console.error('[Hook]   4. If this script genuinely has no tunable values, add a line');
    console.error('[Hook]      "# hyperparams n/a: <reason>" — the line is the reviewable receipt.');
    process.exit(2);
  } catch (e) { console.log(d); process.exit(0); }  // never hard-fail on an internal error
});
