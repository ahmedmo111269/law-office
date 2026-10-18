# Local storage implementation (SQLite + IndexedDB)

Status: **implemented and executed** on 2026-10-18. This document describes how
the data layer actually stores data on each platform, what is shared, and where
the engines differ. It supersedes the earlier statement that IndexedDB was only
an interface reservation.

## 1. Engines per platform

| Platform | Engine | Status |
| --- | --- | --- |
| Desktop / native (Windows, macOS, Linux), CLI | SQLite (Node `node:sqlite`, WAL) | implemented before this phase, unchanged |
| Browser / installable PWA | **IndexedDB** (real browser object stores) | implemented in this phase |
| Node test runs for the browser profile | IndexedDB via `fake-indexeddb` | test double for the browser API, not a production engine |
| Real-browser verification | Chromium 153 (headless, persistent profile) | executed, see `docs/local-storage-report.md` |

No server, cloud database, network service, or paid API is used by either
engine. `src/` contains no `fetch`, `node:http`, `node:https`, `node:net`,
`node:tls` or `node:dgram` usage; an existing test enforces this.

## 2. Why a portable layer instead of porting SQL

The SQLite schema is expressed in SQL: strict tables, `CHECK` constraints,
partial unique indexes, triggers, FTS5, `AUTOINCREMENT`. IndexedDB has no SQL
engine, no triggers, no partial indexes and no FTS. Wrapping the async
IndexedDB API in the synchronous `DatabaseAdapter` would produce a facade that
looks like parity while silently dropping constraints. Instead:

```
                      ┌──────────────────────────────┐
domain operations  →  │ PortableLawOffice            │  (src/portable)
(parties, files, …)   │ validation, FKs, uniqueness, │
                      │ delete batches, audit, outbox,│
                      │ numbering, search projection │
                      └──────────────┬───────────────┘
                                     │ PortableStore (async contract)
                     ┌───────────────┴────────────────┐
                     ▼                                ▼
        SqlitePortableStore                IndexedDbStore
        (SQL, triggers, FTS5)              (object stores, indexes)
```

- `src/schema/v1/portable-schema.ts` is **generated from the migrated SQLite
  schema** (`scripts/gen-portable-schema.ts`): 57 tables, 155 indexes,
  185 CHECK expressions, 153 foreign keys. Column metadata comes from
  `PRAGMA table_info`; CHECK expressions are copied verbatim from the stored
  DDL, not re-typed by hand.
- `src/portable/expression.ts` evaluates those CHECK expressions (comparisons,
  `IN`, `BETWEEN`, `IS NULL`, `length`, `trim`, `CASE`, integer arithmetic).
  Generation fails loudly if a future DDL uses an unsupported construct.
- `src/portable/store.ts` defines the async store contract and the two real
  implementations.
- `src/portable/portable-database.ts` implements the write semantics once:
  defaults, NOT NULL/type/CHECK validation, logical foreign keys, unique
  indexes (including SQLite partial predicates), soft delete and deletion
  batches, cascade rules from the sync registry, restore, revision bumps,
  audit rows, outbox rows, display numbering and Arabic search projection.

## 3. IndexedDB object model

- One database per browser profile (`law-office` by default; the self-test uses
  a separate name).
- One object store per schema table, keyed by the table primary key (composite
  keys use an array key path: `device_setting`, `number_series`).
- One IndexedDB index per SQL index, same columns, same order.
- Unique indexes: created as IndexedDB `unique` indexes **except** SQLite
  partial unique indexes, which cannot be expressed. Their predicates are
  evaluated by the portable layer on every write (and during backup
  verification).
- Two internal stores: `_meta` (application id, schema version, engine,
  first/last open) and `_schema_migration` (structural version record). The
  canonical migration ledger is the shared `schema_migration` table, so a
  logical backup carries it on both engines.

### Constraint mapping

| SQLite feature | IndexedDB implementation |
| --- | --- |
| `STRICT` column types | runtime type checks in the portable layer |
| `NOT NULL` | runtime checks in the portable layer |
| `PRIMARY KEY` | object store key path |
| `UNIQUE` (full) | IndexedDB `unique` index + pre-write check |
| Partial `UNIQUE ... WHERE` | pre-write predicate + candidate scan |
| `FOREIGN KEY` (immediate) | pre-write parent lookup |
| Self-referencing FK (`root_file_id`) | allowed when the row references its own new key |
| `CHECK (...)` | compiled expression evaluator on the same SQL text |
| `ON DELETE CASCADE` (schema-level) | application-level cascade from the sync registry |
| Append-only triggers | portable guard for audit/history/deletion-entry tables |
| FTS5 virtual table + triggers | `search_document` rows with Arabic-normalised text, ranked in JS |
| `AUTOINCREMENT` (`search_document.id`) | max-id + 1 inside the transaction |
| Transactions / savepoints | IndexedDB transactions; nested calls join the outer transaction |

`search_document.id` is the only integer surrogate key. It stays numeric and
is allocated inside the transaction, so it remains unique per database.

## 4. Transaction model

- `PortableLawOffice.transaction()` joins an existing transaction when nested.
  SQLite uses `BEGIN IMMEDIATE`; IndexedDB opens one read-write transaction over
  all stores, because its scope is fixed at creation.
- Reads inside a transaction use the active transaction (`conn` getter).
  Opening a second IndexedDB transaction while one is pending would deadlock;
  this was found and fixed during the real-browser test.
- A failure rolls back the whole unit (verified by test).
- The IndexedDB adapter converts engine errors to `AppError` codes and never
  lets an internal abort surface as an unhandled rejection.

## 5. Migrations

- SQLite: existing checksummed, once-only `MigrationManager` (unchanged).
- IndexedDB: `IdbMigrationManager` records the baseline (`0001_initial`, same
  8-hex structural checksum) in `schema_migration`, applies future data
  migrations in order inside a transaction, and verifies/tamper-detects the
  ledger. Structural upgrades use the browser's `upgradeneeded` when the
  IndexedDB version increases; data migrations use the shared table.
- A backup restores the migration history with the data on both engines.

## 6. Search

`search_document` remains the canonical projection. IndexedDB stores
`normalized_text` (Arabic normalisation shared with SQLite: hamza/alef forms,
taa marbuta, diacritics), evaluates AND-token matching in the portable layer and
returns ranked hits. SQLite continues to use FTS5 with a LIKE fallback. Result
shape and ranking intent are the same; FTS5 tokenisation/scoring is not
reproduced exactly — see the report's differences section.

## 7. Backup and restore

- Portable backup format `lawo-portable-backup` v1: JSON with format version,
  schema version, application id, engine, device id, all 57 tables, per-table
  counts and a SHA-256 checksum over canonically sorted rows.
- Verify: checksum, schema/application identity, presence of every table,
  row-level constraints, foreign keys, unique indexes.
- Restore: verified backup replaces the database contents atomically.
  - IndexedDB: one transaction over all stores.
  - SQLite: verified restore is a maintenance operation; append-only and FK
    triggers are suspended only for the duration of the import, then recreated,
    FTS is rebuilt and `PRAGMA foreign_key_check` must return no rows.
- Cross-engine restore is tested: an IndexedDB backup restores into SQLite and
  keeps relations.
- The portable backup contains **database rows only**. Local attachment files
  are not included; `storage_path` values are references. No encryption is
  claimed or implemented.

## 8. How it was verified

| Suite | Command | Result |
| --- | --- | --- |
| Existing SQLite scenarios | `npm test` | 21/21 pass (unchanged) |
| IndexedDB engine (Node + fake-indexeddb) | `npm run test:idb` | 15/15 pass |
| Cross-engine parity + cross-engine restore | same command | 3/3 pass |
| Real Chromium persistence + offline | `npm run test:browser` | pass (two browser processes) |

The browser test bundles `scripts/browser-selftest-harness.ts` with esbuild,
serves it from `127.0.0.1`, launches Chromium with a persistent profile,
creates an office (party, file, case, hearings, judgment, task, document,
account/charge/payment), closes the browser, relaunches it with the same
profile, and verifies: same ids, search, relations, integrity, migration
ledger, backup verification, offline write/read. Only then does it report PASS.

## 9. Known limits of this implementation

- No service worker or installable app shell exists yet, so "opens offline after
  installation" cannot be claimed; storage itself is offline-verified.
- Attachments (files on disk / external storage) are outside the backup and
  outside IndexedDB; a PWA attachment store (for example OPFS) is not
  implemented.
- IndexedDB quota/eviction is browser-controlled. `QuotaExceededError` is
  classified as a transaction failure, but eviction cannot be prevented by the
  app; persistent storage must be requested by the future app shell.
- FTS5 ranking/tokenisation is not duplicated; search semantics are equivalent
  for the tested Arabic queries but not identical in scoring.
- The browser bundle currently serves the data layer only; there are no UI
  screens (as required for this phase).
- `fake-indexeddb` proves the engine logic in Node but not browser persistence;
  the Chromium test is what proves real persistence across browser restarts.
