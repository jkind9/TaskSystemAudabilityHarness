'use strict';
// The fixed review forms: one prompt and one output schema per packet kind. Every packet of a kind gets
// the same prompt bytes. Owner-accepted details (2026-10-12): 8-question audit form, 6-item debt rubric
// scored 0-2, one review per packet. blind.cjs writes these into reviews/ and hashes them in the manifest.
const { RUBRIC } = require('./debt.cjs');

const AUDIT_QUESTIONS = [
  'Goal: what was the change meant to achieve?',
  'Changes: which parts of the code changed, and what does each change do?',
  'Reasons: what were the main design decisions, and what reason was recorded for each?',
  'Testing: what was tested, and how (which tests or commands)?',
  'Test results: what were the results of that testing when the work ended?',
  'Unfinished: what is unfinished, deferred or known not to work?',
  'Risks: what risks, compatibility concerns or open questions were recorded?',
  'Next step: according to the record, what is the next concrete step for whoever continues?'
];

const RUBRIC_TEXT = {
  duplication: 'the same logic written more than once',
  dead_code: 'unused functions, variables or files, or commented-out code',
  naming_consistency: "names follow the code base's existing style",
  error_handling: 'errors are handled or reported, not swallowed',
  test_quality: 'tests check behaviour and edge cases, not only that the code runs',
  change_scope: 'the change touches only what the work needed'
};

const SETUPS = ['no custom setup', 'task tracking only', 'full custom harness', 'cannot tell'];
const numbered = AUDIT_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join('\n');
const NO_TOOLS = 'Do not run any commands or open any files. Everything you may use is in this message.';

const PROMPTS = {
  audit: `You are auditing a software change for someone who was not there. You see only what the work left in the repository: the commit history since the starting point and every change to files, new files included. You do not see the conversation that produced it. ${NO_TOOLS}

Answer each question from the record alone. If the record does not say, answer exactly "not recorded". Do not guess: a wrong answer is worse than "not recorded".

${numbered}

Then score the change for technical debt on six items, each 0, 1 or 2 (2 = no problem, 1 = minor problem, 0 = serious problem), with one sentence of reason each:
${RUBRIC.map(name => `- ${name}: ${RUBRIC_TEXT[name]}`).join('\n')}

Finally, guess which setup produced the work: "no custom setup" (a coding assistant with its default behaviour), "task tracking only" (an assistant required to keep task records), "full custom harness" (an assistant with a large set of custom rules, review steps and task records), or "cannot tell". Give one sentence why.

Reply only with JSON that matches the required schema.

# The repository record`,

  key: `You are building an answer key and marking an auditor. Below is a shortened record of the working sessions that produced a software change: the request, the assistant's messages, the commands it ran and shortened outputs. After it comes a list of the files changed, then an auditor's answers to eight questions. The auditor saw only the repository, not these sessions. ${NO_TOOLS}

The eight questions:
${numbered}

For each question, write the correct answer from the sessions (the key). Then mark the auditor's answer:
- "correct": matches the key in substance;
- "partial": partly right or incomplete, and states nothing false;
- "wrong": states something the sessions contradict;
- "not_recorded": the auditor answered "not recorded".
If the sessions show nothing for a question (for example, nothing was left unfinished), the key says so, and an auditor answer that says the same is correct. Give one sentence of reason for each mark.

Reply only with JSON that matches the required schema.

# The working sessions`,

  clarity: `Below are the messages a coding assistant wrote, at the end of each working session, to the person who asked for the work, and the documentation lines the work added to the repository. Rate how clear the writing is for a reader new to the project, from 1 (hard to follow: jargon, unexplained shorthand, missing context) to 5 (plain, specific and easy to follow). Judge the writing, not the quality of the code. ${NO_TOOLS}

Reply only with JSON that matches the required schema.`,

  recovery: `A change was made in two working sessions by separate assistant processes. The second session started fresh and continued the first one's work. Below are five design choices the first session had to make, the first session's changes (from the starting point) and the second session's changes (on top of the first). ${NO_TOOLS}

For each choice, state what session 1 chose, from its changes. Then say whether session 2:
- "kept" it (built on the same choice);
- "changed" it (replaced it with a different choice);
- "duplicated" it (added a second implementation of the same job beside the first);
- or "not_decided_in_session_1" (session 1's changes do not make this choice).
Give one sentence of evidence naming files or functions.

Reply only with JSON that matches the required schema.`
};

const text = { type: 'string' };
const obj = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

const SCHEMAS = {
  audit: obj({
    answers: { type: 'array', items: obj({ number: { type: 'integer' }, answer: text }) },
    rubric: obj(Object.fromEntries(RUBRIC.map(name => [name, obj({ score: { type: 'integer', enum: [0, 1, 2] }, reason: text })]))),
    setup_guess: { type: 'string', enum: SETUPS },
    setup_guess_reason: text
  }),
  key: obj({ questions: { type: 'array', items: obj({ number: { type: 'integer' }, key: text, verdict: { type: 'string', enum: ['correct', 'partial', 'wrong', 'not_recorded'] }, reason: text }) } }),
  clarity: obj({ rating: { type: 'integer', enum: [1, 2, 3, 4, 5] }, reason: text }),
  recovery: obj({ points: { type: 'array', items: obj({ id: text, session1_choice: text, verdict: { type: 'string', enum: ['kept', 'changed', 'duplicated', 'not_decided_in_session_1'] }, evidence: text }) } })
};

module.exports = { AUDIT_QUESTIONS, RUBRIC_TEXT, SETUPS, PROMPTS, SCHEMAS };
