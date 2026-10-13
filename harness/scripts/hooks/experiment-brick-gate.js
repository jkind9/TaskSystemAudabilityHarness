// PreToolUse gate for Write|Edit on .py files: the PIPELINE-PARITY contract (task 207).
//
// An experiment script must score through the production front doors, not a bespoke
// composition of low-level bricks. Task 205's head-to-head called
// detect_cohort_anomalies_with_reference + grid_to_frame_signal directly (all phases,
// no ROI, no ncc_ref anchor) and its Diageo conclusions were invalidated (task 206).
// This gate blocks that pattern at write time, with the contract in the block message.
//
//   pass  - not a .py write, or content touches no low-level brick name
//   pass  - file lives in a sanctioned home (VideoModule/, tests/, pipeline_adapter.py,
//           experiments/blocks/, experiments/phase_bank_patchcore.py)
//   pass  - content ALSO imports a production front door (analyze_clip,
//           run_phase_awareness, run_cohort_anomaly_detection, experiments.pipeline_adapter)
//   pass  - content carries an explicit "# pipeline-parity: <reason>" line (the escape)
//   block - otherwise: bespoke low-level scoring path in an experiment/scratch file
//
// Mirrors task-gate.js conventions: stdin JSON in, echo stdin + exit 0 on pass,
// stderr + exit 2 on block, never hard-fail on internal error.

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  let inp = {};
  try { inp = JSON.parse(d); } catch { console.log(d); process.exit(0); }
  try {
    const ti = inp.tool_input || {};
    const target = String(ti.file_path || '').replace(/\\/g, '/');
    if (!/\.py$/i.test(target)) { console.log(d); process.exit(0); }

    // Content under inspection: full file for Write, the new fragment for Edit.
    const content = String(ti.content != null ? ti.content : (ti.new_string != null ? ti.new_string : ''));
    if (!content) { console.log(d); process.exit(0); }

    // Low-level brick names — the layer below the production entry points.
    const LOW = [
      'detect_cohort_anomalies_with_reference',
      'detect_cohort_anomalies',
      'grid_to_frame_signal',
      'build_scoring_grid',
      'score_cohort',
      'normalize_cohort_per_phase',
      'cohort_per_frame_signal',
    ];
    const hit = LOW.filter(n => content.includes(n));
    const srcReach = /pipelines\s*\.\s*anomaly_detection\s*\.\s*src/.test(content) ||
                     /from\s+VideoModule\.pipelines\.anomaly_detection\.src/.test(content);
    if (hit.length === 0 && !srcReach) { console.log(d); process.exit(0); }

    // Sanctioned homes for the low-level layer.
    const p = target.toLowerCase();
    const SANCTIONED = [
      /\/videomodule\//,                      // the bricks' own home
      /\/tests?\//,                           // any test tree
      /\/experiments\/pipeline_adapter\.py$/, // the parity-proven composer
      /\/experiments\/blocks\//,              // opt-in building blocks (task 111)
      /\/experiments\/phase_bank_patchcore\.py$/, // the brick being re-exported (task 202)
    ];
    if (SANCTIONED.some(re => re.test(p))) { console.log(d); process.exit(0); }

    // Front doors: if the same content goes through a production entry point, allow.
    const FRONT = [
      'analyze_clip',
      'run_phase_awareness',
      'run_cohort_anomaly_detection',
      'pipeline_adapter',
    ];
    if (FRONT.some(n => content.includes(n))) { console.log(d); process.exit(0); }

    // Deliberate, reviewable escape.
    if (/#\s*pipeline-parity\s*:\s*\S/.test(content)) { console.log(d); process.exit(0); }

    console.error('[Hook] PIPELINE-PARITY GATE: STOP-AND-REDIRECT (not a transient error). Do NOT retry this write unchanged.');
    console.error('[Hook] This file composes LOW-LEVEL scoring bricks directly: ' + (hit.length ? hit.join(', ') : 'pipelines.anomaly_detection.src import') + '.');
    console.error('[Hook] The contract (experiments/README.md, task 103/207): experiments score through the SHIPPED pipeline, not a bespoke composition.');
    console.error('[Hook] Task 205 did exactly this (all phases, no ROI, no ncc_ref anchor) and its Diageo results were invalidated (task 206).');
    console.error('[Hook] Fix one of these ways:');
    console.error('[Hook]   1. Use a production front door: analyze_clip / run_phase_awareness + run_cohort_anomaly_detection (VideoModule.pipelines.anomaly_detection), or compose via experiments.pipeline_adapter (Stage A/B, parity-proven against analyze_clip).');
    console.error('[Hook]   2. Check the production defaults you must carry: phase filtering (select_phase_columns / kept_phases), ROI, ncc_ref + anchor, num_phases, self-vs-reference cohort — read experiments/README.md and VideoModule/pipelines/anomaly_detection/README.md first.');
    console.error('[Hook]   3. If the low-level path is genuinely required, add a line "# pipeline-parity: <why this composition is faithful>" to the file and re-issue. The line is the reviewable receipt.');
    process.exit(2);
  } catch (e) { console.log(d); process.exit(0); }  // never hard-fail on an internal error
});
