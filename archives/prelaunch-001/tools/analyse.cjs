'use strict';
const fs = require('node:fs');
const path = require('node:path');
function describe(values) {
  const sorted = [...values].sort((a,b) => a-b), n = sorted.length;
  return { n, mean: n ? sorted.reduce((a,b)=>a+b,0)/n : null, median: n ? (sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2 : null, min:n?sorted[0]:null,max:n?sorted[n-1]:null };
}
function paired(rows, first, second, field) {
  const pairs = rows.filter(row => row.condition === first).flatMap(row => {
    const other = rows.find(value => value.task === row.task && value.repetition === row.repetition && value.condition === second);
    return other && Number.isFinite(row[field]) && Number.isFinite(other[field]) ? [{task:row.task,repetition:row.repetition,before:row[field],after:other[field],delta:other[field]-row[field],percent:row[field] ? 100*(other[field]/row[field]-1):null}] : [];
  });
  return {first,second,field,pairs,absolute:describe(pairs.map(row=>row.delta)),relativePercent:describe(pairs.map(row=>row.percent).filter(Number.isFinite))};
}
function analyse(root) {
  const read = file => JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const optional = file => fs.existsSync(file) ? read(file) : null;
  const protocol = read(path.join(root,'protocol.json'));
  const auditFile = 'C:/Users/jkind/.agents/harness/state/hook-runs.jsonl';
  const audit = fs.readFileSync(auditFile,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const rows = protocol.runs.map(run => {
    const dir=path.join(root,'results',run.id), result=optional(path.join(dir,'result.json')), grade=optional(path.join(dir,'grade.json'))?.grade, usage=result?.usage;
    const expected=protocol.tasks.find(task=>task.id===run.task).expectedChecks;
    const hooks=optional(path.join(dir,'hook-evidence.json'))??audit.filter(event=>result?.threadId && event.session===result.threadId);
    const eventFile=path.join(dir,'events.jsonl');
    const events=fs.existsSync(eventFile)?fs.readFileSync(eventFile,'utf8').split(/\r?\n/).filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch(error){if(!(error instanceof SyntaxError))throw error;return [];}}):[];
    const items=events.filter(event=>event.type==='item.completed').map(event=>event.item);
    const commands=items.filter(item=>item?.type==='command_execution').map(item=>({command:item.command,exitCode:item.exit_code}));
    return {...run,attempted:fs.existsSync(path.join(dir,'journal.json')),finished:Boolean(result),status:result?.status??null,exitCode:result?.exitCode??null,timedOut:result?.timedOut??null,
      passedChecks:grade?.passed??null,reportedChecks:grade?.total??null,expectedChecks:expected,correctness:grade?grade.passed/expected:null,
      success:Boolean(result?.status==='completed'&&result?.exitCode===0&&grade?.failed===0&&grade?.total===expected),
      inputTokens:usage?.input_tokens??null,cachedInputTokens:usage?.cached_input_tokens??null,freshInputTokens:usage&&Number.isFinite(usage.cached_input_tokens)?usage.input_tokens-usage.cached_input_tokens:null,
      outputTokens:usage?.output_tokens??null,totalTokens:usage?usage.input_tokens+usage.output_tokens:null,firstInputTokens:result?.firstUsage?.total_token_usage?.input_tokens??null,
      elapsedSeconds:result?.elapsedSeconds??null,toolCalls:result?.toolCalls??null,visibleTestsExit:optional(path.join(dir,'visible-tests.json'))?.exitCode??null,boardLintExit:optional(path.join(dir,'board-lint.json'))?.exitCode??null,
      hookEvents:hooks.length,blockedHookEvents:hooks.filter(event=>event.blocked).length,hookEventsByType:hooks.reduce((counts,event)=>({...counts,[event.event]:(counts[event.event]||0)+1}),{}),
      hookScriptsById:hooks.flatMap(event=>event.hooks||[]).reduce((counts,hook)=>({...counts,[hook.id]:(counts[hook.id]||0)+1}),{}),
      skippedHookScripts:hooks.flatMap(event=>event.hooks||[]).filter(hook=>hook.skipped).length,
      invokedHookScriptsById:hooks.flatMap(event=>event.hooks||[]).filter(hook=>!hook.skipped).reduce((counts,hook)=>({...counts,[hook.id]:(counts[hook.id]||0)+1}),{}),
      hookNonzeroRecords:hooks.flatMap(event=>event.hooks||[]).filter(hook=>hook.status!==0),
      taskCommands:commands.filter(item=>/task(?:-system[\\/])?[.]js\b/.test(item.command||'')).length,
      testCommands:commands.filter(item=>/\bnode\b[^\r\n]*(?:test[\\/]|--test)/.test(item.command||'')).length,
      commandsReferencingSharedPaths:commands.filter(item=>/[.]agents[\\/]harness|[.]claude[\\/]|SKILL[.]md/.test(item.command||'')).length,
      explicitFileChangeItems:items.filter(item=>item?.type==='file_change').length,
      hostUnchanged:result?JSON.stringify(result.hostSnapshotBefore)===JSON.stringify(result.hostSnapshotAfter):null,credentialAliasRemoved:result?.credentialAliasRemoved??null,
      failedChecks:grade?.checks?.filter(check=>!check.pass)||[],commands,hookRecords:hooks};
  });
  const fields=['correctness','totalTokens','freshInputTokens','cachedInputTokens','outputTokens','firstInputTokens','elapsedSeconds','toolCalls','hookEvents','taskCommands'];
  const conditions=protocol.conditions.map(condition=>{const selected=rows.filter(row=>row.condition===condition.id);return {condition:condition.id,planned:selected.length,attempted:selected.filter(row=>row.attempted).length,finished:selected.filter(row=>row.finished).length,successes:selected.filter(row=>row.success).length,metrics:Object.fromEntries(fields.map(field=>[field,describe(selected.map(row=>row[field]).filter(Number.isFinite))]))};});
  const comparisons=[['control','instructions'],['instructions','full'],['control','full']].flatMap(([a,b])=>['correctness','totalTokens','freshInputTokens','elapsedSeconds','toolCalls'].map(field=>paired(rows,a,b,field)));
  const report={generatedAt:new Date().toISOString(),rows,conditions,comparisons,accounting:'Primary sessions only; cached input included in input; reasoning included in output. Setup/review/guardian usage excluded. Failed attempts retained.'};
  fs.writeFileSync(path.join(root,'results','analysis.json'),JSON.stringify(report,null,2)+'\n');
  const lines=['# Experiment results','','Descriptive results from three tasks. Difficulty and task identity are confounded.','','| Task | Repeat | Condition | Checks | Tokens | Fresh input | Seconds | Board lint | Hook events |','|---|---:|---|---:|---:|---:|---:|---:|---:|'];
  for(const row of rows)lines.push(`| ${row.task} | ${row.repetition} | ${row.condition} | ${row.passedChecks??'?'}/${row.expectedChecks} | ${row.totalTokens??'?'} | ${row.freshInputTokens??'?'} | ${row.elapsedSeconds?.toFixed(1)??'?'} | ${row.boardLintExit??'?'} | ${row.hookEvents} |`);
  lines.push('','## Matched changes','','Percentage changes match task and repetition, with the first condition as denominator. Ranges show observed variation, not confidence intervals.','','| Comparison | Metric | Pairs | Median change | Observed range |','|---|---|---:|---:|---:|');
  for(const item of comparisons.filter(item=>item.field!=='correctness')){const s=item.relativePercent;lines.push(`| ${item.first} to ${item.second} | ${item.field} | ${s.n} | ${s.median?.toFixed(1)??'?'}% | ${s.min?.toFixed(1)??'?'}% to ${s.max?.toFixed(1)??'?'}% |`);}
  lines.push('','## Limits','','Success requires CLI completion and every frozen contract category passing. Unknown grades and usage stay unknown. Failed attempts are not replaced. Task-board lint, test activity and hook dispatch are process observations, not functional correctness. Hook wrappers can skip their payload based on profile settings even with zero exit status. Command references do not prove guidance was read or followed. Shell edits may not produce file-change events.','','Instructions bundle shared rules and custom skills; full adds installed hooks. Delegation is disabled equally. Two repetitions do not support significance claims. Cache and order effects remain possible despite counterbalancing. Setup and external review are excluded; guardian usage was unavailable.');
  fs.writeFileSync(path.join(root,'results','README.md'),lines.join('\n')+'\n');
  return report;
}
module.exports={describe,paired,analyse};
if(require.main===module){const report=analyse(path.resolve(__dirname,'..'));process.stdout.write(JSON.stringify({planned:report.rows.length,finished:report.rows.filter(row=>row.finished).length,conditions:report.conditions},null,2)+'\n');}
