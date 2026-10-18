# Architecture map — local data layer

**Branch:** `arena/691f011a-law-office` · **Baseline:** `main` at `b5769b8` (README only) · **Schema:** v1, SQLite 3.51.3 / `node:sqlite` (development and tests).

## 1. Layers

```text
┌──────────────────────────────────────────────────────────────┐
│ UI (not in this phase)                                       │
├──────────────────────────────────────────────────────────────┤
│ CLI technical tool        src/cli.ts                         │
│ Composition root          src/app/law-office-database.ts     │
├──────────────────────────────────────────────────────────────┤
│ Domain repositories       src/repositories/*.ts               │
│   BaseRepository: CRUD, revision, outbox, audit, search       │
│   party / court / case-file / case / hearing / judgment /     │
│   task / document / finance / contract / appointment / sync   │
├──────────────────────────────────────────────────────────────┤
│ Services                   src/services/*.ts                  │
│   number series · devices · audit log · health checks         │
│ Search projection          src/search/*.ts                    │
│ Backup / restore           src/backup/backup-manager.ts       │
│ Sync metadata (no wire)    src/repositories/sync-metadata-…   │
├──────────────────────────────────────────────────────────────┤
│ Schema + migrations        src/schema/v1/* · src/db/migrations│
├──────────────────────────────────────────────────────────────┤
│ Storage boundary           src/db/adapter.ts                  │
│   SQLite adapter           src/db/sqlite/sqlite-adapter.ts    │
│   IndexedDB adapter        NOT IMPLEMENTED (see decisions)    │
└──────────────────────────────────────────────────────────────┘
```

Rules enforced by construction:

- UI/domain code never imports `node:sqlite`. Only `src/db/sqlite/sqlite-adapter.ts` does.
- Every write goes through one repository transaction: business row + sync outbox row + audit row + search projection. Search failure sets `search.rebuild_required` instead of losing the business write.
- Only registered entities (`src/sync/entity-registry.ts`, 43 entries) are reachable through `LawOfficeDatabase.repository()`. Unknown entity codes fail.
- All stored timestamps are canonical UTC (`toCanonicalTimestamp`), independent of `last_synced_at`.
- Money is integer piastres; no floating point.

## 2. Storage engine and profiles

| Platform | Engine | Status |
| --- | --- | --- |
| Windows / macOS / Linux desktop | SQLite file, WAL, `synchronous=FULL`, foreign keys ON, 5 s busy timeout | Implemented and tested with `node:sqlite` |
| Android / iOS native shell | SQLite file through the same `DatabaseAdapter` | Interface ready; native embedding not packaged here |
| PWA / browser | IndexedDB logical store | Interface declared (`engine: 'indexeddb'`), **no adapter and no repository port yet** |

The SQLite adapter owns: `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`, nested `SAVEPOINT`s, prepared statements, row normalisation, `VACUUM INTO` snapshots, integrity/FK checks, and application-id enforcement. See `docs/decisions.md` for why this split exists and what is *not* claimed.

## 3. Data model (57 application tables)

| Area | Tables |
| --- | --- |
| Office/system | `app_meta`, `schema_migration`, `migration_failure`, `local_device`, `device_setting`, `office_setting`, `office_profile`, `number_series`, `lookup_list`, `lookup_item`, `currency`, `audit_log` |
| People | `party`, `person`, `organization`, `client_profile`, `party_contact`, `party_address`, `party_alias`, `party_relationship`, `party_interaction`, `party_snapshot` |
| Files/cases | `case_file`, `case_file_case`, `case_file_link`, `case_file_party`, `case_note`, `legal_case`, `legal_case_link`, `court`, `court_circuit` |
| Judicial | `hearing`, `judgment`, `judgment_appeal`, `judgment_file_link` |
| Work | `task`, `task_status_history`, `announcement`, `appointment`, `reminder` |
| Documents | `document`, `document_version`, `document_link` |
| Contracts | `contract`, `contract_party`, `power_of_attorney` |
| Finance | `financial_account`, `fee_agreement`, `financial_charge`, `financial_transaction`, `payment_allocation` |
| Deletion | `deletion_batch`, `deletion_entry` |
| Sync | `sync_outbox`, `sync_conflict`, `sync_entity_type` |
| Derived search | `search_document`, `search_fts` (+ FTS shadow tables) |

Full columns, types, defaults, foreign keys, indexes and table constraints: **`docs/schema.md`** (generated from the migrated database). Relationship overview: **`docs/er-diagram.md`**.

## 4. Identity and display numbering

- Record IDs: random UUID v4 (`newId()`); seed rows use deterministic UUID v5 so every fresh database converges on the same reference IDs.
- Displayed numbers (file, client, receipt, contract, POA) are stored separately and never used as foreign keys.
- `number_series` is scoped by key and optional `scope`, guarded by a unique index; allocation happens inside the caller’s transaction, so a rollback does not consume a number.
- Formats: `FILE-{device}-{year}-{0001}`, `CLI-{device}-{year}-{0001}`, `RCPT-{device}-{year}-{00001}`, `CON-…`, `POA-…`.
- `device.short_code` is derived from the device UUID (first 6–12 uppercase hex characters), or explicitly supplied, and is unique per database. This avoids every fresh device claiming `D001`.
- Case numbers/case years are judicial identifiers entered by the user, not generated and not primary keys.

## 5. Write path invariants

`BaseRepository`:

1. rejects unknown fields and repository-managed header fields;
2. bumps `revision`, sets `sync_status='pending'`, leaves `last_synced_at` alone;
3. appends a `sync_outbox` row with monotonic `sequence`, operation, changed fields and payload;
4. appends an append-only `audit_log` row with sensitive columns redacted;
5. refreshes the derived search document and cascade-related documents;
6. uses soft delete + `deletion_batch`/`deletion_entry`, with `block`/`cascade` dependent policies from the registry.

Finance has additional DB triggers: posted economic fields are immutable; transactions and allocations cannot be hard- or soft-deleted; a void is irreversible; allocations validate payment/charge limits.

## 6. Search

`search_document` is a derived projection with Arabic normalisation (hamza/alef, yaa/alef maqsura, taa marbuta, diacritics). `search_fts` is FTS5 when available; otherwise the service falls back to `LIKE` over normalised text. Rebuild is explicit and safe (`rebuildAll`). The index is never a source of truth.

## 7. Migrations

`schema_migration` stores version, name, SHA-256 checksum, timestamp, execution ms, app version and backup path. `PRAGMA user_version` mirrors the version; `PRAGMA application_id = 0x4c41574f` marks law-office files. Each migration runs in one transaction with checksum/history verification before and after. Failures roll back and are recorded in `migration_failure` when the history table exists.

Only migration 1 exists in this phase. Any edit to v1 DDL/seed changes its checksum, so databases created before the edit are rejected rather than silently accepted. That is intentional, and the tests destroy/recreate data during development.

## 8. Backup and restore

`BackupManager` uses `VACUUM INTO` on the live connection (WAL-safe snapshot), writes to a temporary file, verifies `integrity_check`/foreign keys/application id/schema version, hashes the file, fsyncs, then atomically renames. A `.sha256` sidecar is written. Restore verifies first, copies to a temporary target, re-verifies the hash and integrity, and only then renames into place; an existing target is never overwritten unless `force` is set, in which case it is preserved as `.pre-restore-*`.

External attachment bytes are **not** included. The manager reports how many `document_version` rows point to local files and the restore result warns about them.

## 9. Sync readiness (no transport)

- `sync_outbox`: unique change id, monotonic sequence, entity type/id, operation, payload, changed fields, origin device, state (`pending/sending/sent/failed/discarded`), attempts, last error/time.
- `sync_conflict`: local/remote payloads, revisions, device ids, conflicting fields, open/resolved status, resolution.
- 43 entity policies in `src/sync/entity-registry.ts` (`field_merge`, `relation_set`, `append_only`, `immutable`, `ledger`) plus per-entity conflict policy text.
- No network code, no server, no background worker, no “sync” button. Tests cover the local half only; transport/apply-remote is deferred.

## 10. Error model

Stable codes in `src/errors.ts` (`VALIDATION_FAILED`, `FOREIGN_KEY_VIOLATION`, `DEPENDENT_RECORDS_EXIST`, `IMMUTABLE_RECORD`, `MIGRATION_FAILED`, `BACKUP_CORRUPT`, `SCHEMA_TOO_NEW`, …). SQLite constraint errors are classified; UI layers must map codes, not parse English messages.

## 11. Composition root and CLI

`LawOfficeDatabase.open({path, clock, appVersion, deviceLabel, backupDir})`:

1. opens the SQLite adapter with WAL/FK/timeout configuration;
2. runs pending migrations and verifies history;
3. registers the local device on first run (or repairs a half-completed registration);
4. wires services, all repositories, search, health and backup;
5. rebuilds search only when flagged.

`src/cli.ts` is an operator tool (`init`, `check`, `info`, `backup`, `verify`, `backups`, `restore`, `search`, `reindex`, `migrate`). It is not a UI.

## 12. Where things live

| Concern | File |
| --- | --- |
| Storage contract | `src/db/adapter.ts` |
| SQLite implementation | `src/db/sqlite/sqlite-adapter.ts` |
| DDL / seed | `src/schema/v1/ddl.ts`, `src/schema/v1/seed.ts` |
| Schema manifest | `src/schema/v1/manifest.ts` (generated) |
| Migration runner | `src/db/migrations/manager.ts` |
| Entity sync policies | `src/sync/entity-registry.ts` |
| Generic repository | `src/repositories/base-repository.ts` |
| Domain repositories | `src/repositories/*-repository.ts` |
| Audit / numbers / devices / health | `src/services/*.ts` |
| Search | `src/search/search-service.ts` |
| Backup | `src/backup/backup-manager.ts` |
| Composition | `src/app/law-office-database.ts` |
| Tests | `test/*.test.ts` |
