<!--
SYNC IMPACT REPORT — prepend one entry per amendment, newest first.
Format:  <old version> -> <new version> | <date> | <principles added/changed/removed> | <why>
0 -> 0.1.0 | 2026-10-01 | seeded from template | new project
-->

# Project constitution

**Version:** 0.1.0 (DRAFT — not ratified)
**Ratified:** (not yet — a human must review and remove the DRAFT marker)
**Last amended:** 2026-10-01

The non-negotiable decisions of this project. Every plan is checked against this file by the
plan-reviewer agent (its constitution-alignment check): a plan that conflicts with a MUST is
a BLOCKING finding, and the fix is to change the plan — never to quietly reinterpret or
dilute the principle. If a principle is genuinely wrong, amend it here first (see below),
then plan against the amended version.

Keep it short. A principle earns a place here only if (a) it was decided on evidence or by
the project owner, (b) violating it would silently undo settled work, and (c) it cannot be
enforced by a deterministic gate instead. Everything else belongs in the task files or docs.

## Principles

### P1 — <short name>

MUST <one enforceable sentence>.

*Why:* <one or two sentences of rationale — the evidence or decision this locks in.>

## Amending

- **PATCH** (0.1.0 → 0.1.1): wording, typos, clarifications that change no meaning.
- **MINOR** (0.1.0 → 0.2.0): a new principle, or materially expanded guidance.
- **MAJOR** (0.1.0 → 1.0.0): removing or redefining a principle (backward-incompatible).

Every amendment: bump the version, update "Last amended", and prepend one line to the sync
impact report at the top of this file. Ratification (removing DRAFT) is a human act.
