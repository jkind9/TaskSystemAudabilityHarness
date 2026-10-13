# Communication Style

Write the way a smart colleague talks, not the way a paper is published.

## Audience split (the load-bearing rule — enforced by a hook)

Two kinds of writing, two standards:

- **Human-facing surfaces — plain English, no exceptions.** Chat replies, README
  files, any `.md` a person reads, UI copy, PR descriptions. The reader is a smart
  person who does NOT live in this project. Any technical term earns its place only
  if the plain phrase comes first and the term follows in parentheses — never the
  other way round, never a bare coinage. If a summary makes the reader stop and
  decode it, it failed, and that is on the writer, not the reader.
- **Engineering records — precise terms are fine.** Commit messages, task files,
  code comments. These are audit trails; the exact vocabulary is what makes them
  traceable. `coreset`, `AUROC`, `idempotent` belong here.

The failure mode this fixes: in a deep technical session the model copies its own
earlier jargon (it is sitting right there in the context) and the plain-language
rule is thousands of tokens back, so the local pull wins. A Stop hook
(`scripts/hooks/plain-language-audit.js`) catches the KNOWN offenders — the AI-tells
below plus consultant-speak — in the final chat message and in newly-added doc lines,
and nudges. It cannot catch NEW coined shorthand; that is on you. Before ending a turn
with a summary, reread it once and ask: would someone who has read none of the project
files follow every sentence?

Real examples that failed this and had to be rewritten (all invented shorthand):
"gate collapse", "diversity loss", "honest residual", "criterion bug",
"k-center-greedy coreset". Each needed a plain phrase first (e.g. "the filter that
tells normal clips from faulty ones stopped working").

## The rule

Say it once, plainly. Then stop.

A finding like "we haven't validated that against non-perfect inputs" does not need to become
"the rig proves only the positive case — fed a corrupted input it could still score near-ceiling,
leaving us blind, measuring nothing." Both say the same thing. Write the first.

## What to cut

- **Restating the same point twice** ("It doesn't prove X. If X were false, we'd be blind to it.") — say it once.
- **Em-dash drama and rhetorical build-ups** ("near-ceiling", "measuring nothing", "the smoking gun"). State the fact.
- **Triplet phrasing for emphasis** ("something human, readable, simple") — pick one word.
- **Inventing precise-sounding terms** when a plain phrase exists ("monotonicity / degradation test" → "check it scores worse on worse inputs").

## What to keep

- **Real load-bearing terms.** macroF1, linear probe, p95 latency, idempotent — these mean specific
  things. Don't dumb them down. Density is fine when every word is carrying weight.
- **Numbers and specifics.** "FM7 F1 0.26→0.58" beats "a meaningful improvement."

## Banned AI-tells (the bloat that creeps in)

These phrases mark writing as machine-generated. Cut them on sight.

- **Hedge prefaces.** "honestly", "to be honest", "honest note", "the honest truth is", "frankly",
  "I'll be direct", "let me be clear", "the reality is". Saying it's honest doesn't make it so —
  state the fact.
- **Importance-inflation.** "it's important to note", "it's worth noting", "notably", "crucially",
  "significantly", "fundamentally". If it matters, the fact carries that on its own.
- **Hollow openers.** "Great question", "Let's dive in", "At its core", "In essence",
  "Essentially", "Simply put".
- **Consultant-speak.** "leverage" (→ use), "utilize" (→ use), "facilitate" (→ help), "robust",
  "seamless", "comprehensive", "delve into", "navigate the complexities", "in today's landscape".
- **Empty summaries.** "In conclusion" / "To summarize" on a short answer; a closing paragraph that
  restates what was just said.
- **The contrast-cliché.** "It's not just X, it's Y" / "This isn't about X — it's about Y" used as a
  flourish rather than a real distinction.

## No coined jargon, no cross-reference dependency

The worst readability failure isn't fancy words — it's leaning on shorthand I invented and then
using it as if it were a shared term. "the n_sweep_subset_bias trap", "the λ=1/N=0 anchor
discipline", "the honest-negative discipline as Task 04/20". A reader who doesn't already have the
other documents in their head cannot parse these. Assume they don't.

- **Write each document as if it's the only one the reader has.** A task file, memory entry, PR body,
  or plan must stand on its own. Do not require the reader to go read another file to understand a
  sentence. Cross-links are fine as *"see X for more"*; they are not fine as the only place a
  load-bearing idea is defined.
- **Gloss a coined term the first time it appears, every file.** If I made up a name for a
  phenomenon, the first use gets a plain-language parenthetical: not "the n_sweep_subset_bias trap"
  but "a plain leave-one-out leaks a clip's own augmented variants into its training fold and fakes
  recovery (the subset-bias trap)". Name-then-define, once per file. After that the short name is
  earned. This is the same move as keeping "macroF1" or "honest k-shot protocol" — keep the precise
  term, add the meaning the first time.
- **A reference to another task/file is not an explanation.** "Per Task 10's finding, X is
  unscoreable" must also say *why* in-line ("a class with one source clip has no leave-one-out
  training example, so it can never be predicted"). The citation is provenance; the sentence still
  has to carry the reason on its own.
- **The test:** could a competent person who has read none of the other files follow this one? If a
  sentence only makes sense to someone who already lived the project, rewrite it to carry its own
  meaning.

## Plain words over fancy ones

Prefer the word a person says out loud: use (not utilize/leverage), help (not facilitate), about
(not regarding), so (not therefore/thus), enough (not sufficient), start (not commence), show (not
demonstrate). Short sentences, one idea each. If a sentence needs a comma-spliced clause to breathe,
split it.

## The test

Before sending, reread one paragraph and ask: is any sentence just the previous sentence in
different words? Is any phrase there for rhythm rather than information? Cut it.

This applies to chat replies, memory files, plan docs, commit messages, and PR bodies — anywhere I
write prose.
