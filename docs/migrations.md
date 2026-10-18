# Migrations and schema versioning

## Files

| File | Purpose |
| --- | --- |
| `src/schema/v1/ddl.ts` | Full v1 DDL as ordered statements. Groups: system/reference, parties, courts, files/cases, hearings/judgments, work, documents, contracts, finance, deletion/audit, sync, search. |
| `src/schema/v1/seed.ts` | Reference data: 54 lookup lists / 374 items, 6 currencies, 11 office settings, 1 system device, office profile placeholder (`is_configured = 0`), 5 number series, 43 sync entity types. |
| `src/schema/v1/manifest.ts` | Generated list of required tables/indexes/triggers used by health checks and tests. |
| `src/db/migrations/0001_initial.ts` | Frozen initial migration: checksum over DDL + seed, `up()` executes DDL/seed, sets `user_version`. |
| `src/db/migrations/manager.ts` | Runner: ordering, checksums, transactions, failure recording, safety guards. |
| `src/db/migrations/types.ts` | `Migration`/`MigrationResult` contracts. |

## Guarantees

- Migrations must be contiguous starting at 1; a gap or duplicate is rejected when the manager is constructed.
- The applied history (`schema_migration`) is verified on every open: version, name and SHA-256 checksum must match code; `PRAGMA user_version` must match the last row.
- A database with tables but no history is never “initialised over”; it is rejected.
- A database whose `user_version`/history is newer than the application is rejected with `SCHEMA_TOO_NEW`.
- `application_id` must be 0 (new) or `0x4c41574f` ("LAWO"); other SQLite files are refused.
- Each migration runs inside one transaction that also writes its history row, `user_version`, and `app_meta.schema.version`. Any error rolls all of it back.
- On failure, the manager records a `migration_failure` row (when the history table exists) and rethrows `MIGRATION_FAILED`; the database stays at the previous version and remains openable by the previous app.
- No migration may drop and recreate business tables. Data-destroying changes require an explicit, tested migration and approval; none exist in v1.

## Initialisation sequence (`0001_initial`)

1. Manager validates ordering/checksums and detects an empty file.
2. Sets `application_id` before creating tables.
3. Runs all DDL statements in order, then `seed` rows (deterministic UUID v5 for reference data).
4. Inserts the `schema_migration` row, sets `user_version = 1`, `app_meta.schema.version = 1`.
5. Verifies history again.
6. `LawOfficeDatabase.open` then registers the local device (UUID v4) and initialises search.

## Adding migration 2

1. Write `src/db/migrations/0002_<name>.ts` exporting a `Migration` with `version: 2`, `name`, `descriptionAr`, `checksum` and `up(adapter, context)`.
2. Compute `checksum` with SHA-256 over the exact migration content (the existing `checksumOf` helper accepts a string). Freeze it; never edit an applied migration.
3. Add the migration to every place that constructs a `MigrationManager`:
   - `src/app/law-office-database.ts`
   - `src/cli.ts` only indirectly through the facade
4. Wire `preMigrationBackup`. The manager calls it for every upgrade from version > 0; it must return the path of a *verified* backup. In the current phase the facade passes no hook because no upgrade exists yet — **this must be wired before shipping migration 2**.
5. Add a test with the v1 database, create data, apply v2, assert data intact and history/`user_version`/backup path.
6. Add a failure test: migration creates something then throws; assert rollback, `migration_failure`, and that v1 still opens.
7. Regenerate `src/schema/v1/manifest.ts` only if tables/indexes/triggers change; regenerate `docs/schema.md`.

Do not edit v1 DDL/seed after real offices have data. During this phase such edits invalidate development databases by design (checksum mismatch); delete the development file rather than editing history.

## Recovery from a failed migration

1. The transaction is already rolled back; the app can reopen the previous version.
2. Inspect `migration_failure` (version, name, message, backup path).
3. Fix forward in a new migration number; never reuse the failed version.
4. If a pre-migration backup exists, verify it with `BackupManager.verify` before considering restore.
5. Restore only into a new path unless a reviewed recovery decision says otherwise.

## Evidence

`test/migration.test.ts` covers:

- v1 → v2 with existing data, pre-migration hook, exactly-once application;
- failure after DDL inside v2: table absent, version still 1, history intact, failure row written, app v1 reopens and data is readable.

## Known limits

- Only migration 1 exists in this phase; the v2 code in tests is test-local, not a shipped feature.
- The pre-migration backup hook is implemented but not wired in the composition root (no upgrade to run yet).
- Checksums protect against accidental edits, not against a malicious local operator who rewrites the database and history.
- SQLite DDL is largely transactional, but an OS-level failure during commit is handled by SQLite's WAL/rollback journal, not by a custom journal.
