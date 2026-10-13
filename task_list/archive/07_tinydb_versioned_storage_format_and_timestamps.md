---
id: "07"
title: TinyDB versioned storage format and timestamps
status: archived
priority: HIGH
type: feature
blocked_by: []
blocks: []
verification_test: tests/test_tinydb.py
plan_reviewed: 2026-10-12 PASS
files:
  - tinydb/database.py
  - tinydb/table.py
  - tinydb/_storage_format.py
  - tests/test_tinydb.py
  - tests/test_tables.py
  - README.rst
docs:
  - README.rst
baseline_metric:
  source: tests/test_tinydb.py and tests/test_tables.py before this change
  field: document metadata and storage envelope contract cases
  baseline_value: 0
  target: format-2 read/write and migration behavior verified; timestamp contract verified in the follow-up session
created: 2026-10-12
last_updated: 2026-10-12
superseded_by: null
---

# Task 07 — TinyDB versioned storage format and timestamps

## Current state

- Last test: not run; implementation tests were not requested.
- Exact next action: in a fresh session, implement timestamp items 5�8 using this plan and the repository tests.
- Open decisions: none. Timestamp work is intentionally deferred.
- Handoff note: format-2 storage items 1�4 are implemented; the repository-local task record carries the full plan.

## In plain English
TinyDB currently saves each table as a plain collection of documents. This task changes saved databases to carry a format version and a separate place for per-document metadata, while continuing to read existing databases. It also adds creation and change times to documents; that timestamp part will be completed in a later session.

## What

Store TinyDB databases in a version-2 envelope with a format marker and per-table `docs` and `meta` maps. Read legacy version-1 files without changing them until a write occurs, reject unknown versions without writing, and preserve table-management behavior. In the follow-up session, add document timestamps and a configurable clock across JSON, memory, and caching storage. This session implements only storage-format items 1–4.

## Why

A marked and structured storage format gives future TinyDB versions a reliable way to identify the data they are reading. Legacy users must keep their current documents and IDs, and malformed or unsupported future versions must not be silently rewritten.

## How

**Reuse evidence**

| Claim | Existing owner | Callers/consumers | Evidence |
|---|---|---|---|
| TinyDB creates storage and table instances and controls database-level table operations | `TinyDB` | public database API | `tinydb/database.py:87`, `tinydb/database.py:111`, `tinydb/database.py:135` |
| A table reads a whole database, selects its own table, and writes whole-database updates | `Table._read_table` and `Table._update_table` | all table reads and mutations | `tinydb/table.py:756`, `tinydb/table.py:781` |
| Existing tests cover dropping tables and listing tables | database/table tests | storage-format regression suite | `tests/test_tinydb.py:12`, `tests/test_tinydb.py:642`, `tests/test_tables.py:16` |
| The README documents public usage and storage middleware setup | README | TinyDB users | `README.rst:119` |

Implementation plan:

- In `tinydb/_storage_format.py`, recognize both the legacy top-level table mapping and the version-2 envelope. `tinydb/table.py` uses these helpers for table reads and writes. On a legacy read, expose only the old documents and synthesize no persisted write. On the first mutation, write the version-2 envelope and create `None` metadata entries for existing documents. On version 2 mutations, update docs and metadata together. Reject unsupported markers before a write.
- In `tinydb/database.py`, hide `_tinydb` from `tables()`, preserve the marker when dropping one or all tables, and validate the marker on database-level table listing/drop operations. Dropping all tables leaves only the marker.
- In `tests/test_tables.py`, assert the exact version-2 shape and docs/meta id parity; legacy reads preserve tables, IDs, and documents without writes, then migrate on mutation; unknown versions raise with their value and preserve stored data; marker visibility and drop behavior remain correct.
- In `README.rst`, document the version marker, version-1 compatibility, and storage layout. The next session adds the timestamp and clock documentation plus its contract tests.
- The deferred timestamp implementation will add `created`/`updated` attributes to `Document`, propagate a clock from `TinyDB` to tables without consuming storage kwargs, and modify insert/update/remove paths while preserving the storage envelope.

No schema migration occurs on read. There is no process boundary; the storage object is the source of truth. A failed operation before storage write leaves the previous serialized value intact. JSON serialization and middleware behavior continue through the existing Storage interface.

## Hyperparameters

hyperparameters n/a: library feature implementation, no experiment settings.

## Invariants and recovery

| Concern | Producer / owner | Consumer | Representation | Survives restart? |
|---|---|---|---|---|
| Stored format marker and table docs/meta | `tinydb/table.py:781` | `tinydb/table.py:756`, `tinydb/database.py:135` | `_tinydb.format == 2`; each table has `docs` and `meta`, with matching string IDs | yes, serialized in storage |
| Legacy input interpretation | `tinydb/table.py:756` | existing TinyDB read APIs and next write | no marker means format 1; metadata is `None` on its first format-2 write | yes, until the next write |
| Unsupported version safety | `tinydb/table.py:756`, `tinydb/table.py:781` | reads and writes of tables | `ValueError` names the unknown value; no storage write | previous bytes/data remain |
| Timestamp metadata | deferred to next session in `tinydb/table.py` | document-returning and mutation APIs | `created`/`updated` float or `None`; not document keys | yes, after timestamp work |

- **Source of truth:** `Storage.read()` data; format-1 reads are interpreted without mutating storage.
- **Process/thread boundary:** none introduced; storage receives one complete database mapping per write.
- **Failure after each state transition:** validation and update callbacks run before `Storage.write`; an exception there leaves storage untouched. A successful write stores the entire new envelope. JSONStorage retains its existing write semantics.
- **Fresh-deployment path:** existing installation and storage constructor arguments remain unchanged; open a database normally, then write to migrate legacy files.
- **Backward compatibility:** unmarked data reads with its old tables, IDs, and document content; reads alone do not write. Existing storage keyword arguments are passed through in the timestamp follow-up.

## Verification

- Add contract tests in `tests/test_tables.py`.
- Exact assertions: after insert, storage equals `{'_tinydb': {'format': 2}, '<table>': {'docs': {'1': <document>}, 'meta': {'1': {'created': None, 'updated': None}}}}`; on legacy read, `all()`, `tables()`, and IDs equal the old contents and the storage object remains byte/value-identical; after legacy mutation, format is 2 and old/new IDs exist in both maps; unsupported version raises `ValueError` containing the version and storage data is unchanged; `tables()` omits `_tinydb`; dropping a table preserves the marker; dropping all leaves only the marker.
- Run the focused storage-format tests and the repository test suite. These cases check normal results, migration boundaries, no-write-on-read, unknown-version errors, and table-drop inverses.
- Baseline: 0 tests for a format marker or metadata envelope. Target: all storage-format contract assertions pass. Timestamp assertions are deferred.

## Receipts

| field | value |
|---|---|
| closing commit | none; timestamp items 5�8 remain open |
| files changed | tinydb/_storage_format.py, tinydb/table.py, tinydb/database.py, tests/test_tables.py, README.rst |
| test | contract tests added; not run because execution was not requested |
| before / after | 0 storage-format contract assertions / assertions added, not executed |
| result | part 1 implemented; task remains open for timestamp items 5�8 |

Notes / caveats / follow-ups:

- The next fresh session should implement timestamps items 5–8, update README documentation, add timestamp tests, update this task's current state and receipts, and finish the task.
