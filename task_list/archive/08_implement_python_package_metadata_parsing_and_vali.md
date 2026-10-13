---
id: "08"
title: Implement Python package metadata parsing and validation
status: archived
priority: MED
type: infra
blocked_by: []
blocks: []
verification_test: "pytest tests/test_metadata.py"
plan_reviewed: null
files:
  - src/packaging/metadata.py
  - src/packaging/requirements.py
  - tests/test_metadata.py
docs:
  - docs/metadata.rst
  - docs/requirements.rst
baseline_metric:
  source: "tests/test_metadata.py"
  field: "metadata interface assertions passing"
  baseline_value: "0 tests exist for this task"
  target: "all added assertions pass"
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 08 — Implement Python package metadata parsing and validation

## In plain English

This work makes the package read, check, and write distribution metadata in email form. It also parses dependency declarations into useful structured objects. Invalid input should report which field needs attention, while valid input remains compatible with supported metadata versions.

## What

Implement the missing metadata conversion, validation, and email parsing code, and complete PEP 508 requirement parsing. Add focused tests for the requested interfaces and update the existing metadata and requirement documentation if their described behavior needs clarification.

## Why

The repository contains public metadata and dependency APIs whose implementation is incomplete. Package builders and installers depend on these APIs to exchange consistent metadata and reject malformed declarations predictably.

## How

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| Raw metadata fields and email-to-dictionary mappings already define the data shape. | `RawMetadata` and mapping constants | `Metadata`, `parse_email` | `src/packaging/metadata.py:58`, `src/packaging/metadata.py:211` |
| Metadata field validators and valid metadata versions are partially declared. | `_Validator`, `_VALID_METADATA_VERSIONS` | `Metadata` descriptors | `src/packaging/metadata.py:400`, `src/packaging/metadata.py:371` |
| Requirement formatting, equality, and hashing consume parsed `Requirement` attributes. | `Requirement` | requirement callers and tests | `src/packaging/requirements.py:29`, `src/packaging/requirements.py:64` |
| Existing metadata-specific tests are absent; tests will be added alongside the requirement parser coverage. | no existing metadata test module found | pytest suite | `tests/` has no `test_metadata.py`; `tests/test_requirements.py:1` |

Implement the interfaces in the two declared source files using the local tokenizer, marker, version, specifier, utility, and license modules. Add tests for valid requirement parsing, metadata raw/email round trips, validation failures, duplicate/malformed headers, UTF-8 edge cases, and input non-mutation. Keep serialization and validation behavior aligned with the declared metadata versions. Update `docs/metadata.rst` and `docs/requirements.rst` only where needed to reflect the implemented public behavior.

## Hyperparameters

hyperparameters n/a: this is deterministic library implementation work, not an experiment.

## Invariants and recovery

invariants n/a: in-process parsing and conversion only; no persistent or cross-process state.

## Verification

Run `pytest tests/test_metadata.py tests/test_requirements.py`. The new metadata tests must assert that a valid `RawMetadata` round-trips through `Metadata.from_raw(...).as_rfc822()` and `Metadata.from_email(...)`, that malformed required fields raise an `ExceptionGroup` containing `InvalidMetadata`, and that malformed PEP 508 input raises `InvalidRequirement`. Also assert parsing does not mutate its input dictionary and invalid UTF-8 email fields are reported in `unparsed`. These tests exercise right results, errors, boundaries, and input mutation. Baseline: this checkout has no `tests/test_metadata.py`, so there are no task-specific assertions before implementation.

## Receipts

| field | value |
|---|---|
| closing commit | (fill in) |
| files changed | (fill in) |
| test | (fill in) |
| before / after | (fill in) |
| result | still open because implementation and verification are in progress |

Notes / caveats / follow-ups:

- Implementation work remains open until tests and declared documentation are reconciled.
