# How to run the tests and technical tools

## Prerequisites

- Node.js **22.18+** (tested with 22.22.3). `node:sqlite` is used; it is still marked experimental, hence `--disable-warning=ExperimentalWarning`.
- npm 10+.
- No database server, network access, API key, or paid service is required.

```bash
npm install
```

## Type checking

```bash
npm run typecheck          # production sources (src/)
npx tsc -p tsconfig.test.json   # src + tests + benchmark script
```

`tsconfig.json` intentionally excludes `test/`; `tsconfig.test.json` includes `src/**/*.ts`, `test/**/*.ts` and `scripts/**/*.ts` (test tooling) with `noEmit`.

## Test suite

```bash
npm test
# equivalent:
node --disable-warning=ExperimentalWarning --test test/*.test.ts
```

Verbose reporter:

```bash
npm run test:verbose
```

The suite creates a fresh SQLite file in a unique temporary directory for each test, exercises real repositories, closes the database, and deletes the directory. Nothing is mocked at the storage layer. Tests run in separate Node processes per file.

Two additional suites cover the PWA engine:

```bash
npm run test:idb      # 15 IndexedDB engine tests + 3 cross-engine parity tests
npm run test:browser  # real Chromium: restart persistence + offline storage
```

`test/indexeddb.test.ts` opens real IndexedDB object stores through
`fake-indexeddb` (a Node implementation of the browser API — a test double, not
a production engine) and verifies stores/indexes for all 57 tables, seed
determinism, constraints, rollback, reopen persistence, backup/restore,
migrations, search, numbering, cascade delete/restore, finance rules, audit and
outbox rows, and absence of network calls. `test/engine-parity.test.ts` runs the
same domain scenario on SQLite and IndexedDB, compares the functional result,
checks equal error codes for invalid writes, and restores an IndexedDB backup
into SQLite.

`scripts/browser-selftest.ts` bundles the browser harness with esbuild, serves
it from `127.0.0.1`, launches Chromium with a persistent profile, runs a write
phase, kills the browser, relaunches it, runs a verify phase with the network
emulated offline, and asserts restart persistence, relations, search, integrity,
migration ledger and backup validity. It requires the dev dependency
`@sparticuz/chromium`; nothing it installs is part of the application runtime.

### What is covered

| # | Scenario | File |
| --- | --- | --- |
| 1 | First-time creation | `test/schema.test.ts` |
| 2 | Schema/index/trigger completeness, sync header presence | `test/schema.test.ts` |
| 3 | Foreign-key and CHECK enforcement | `test/schema.test.ts` |
| 4 | Client linked to several files with different roles | `test/parties.test.ts` |
| 5 | Same person, multiple roles in one file | `test/parties.test.ts` |
| 6 | Master/sub files and one case shared by files | `test/files.test.ts` |
| 7 | Hearing → judgment → administrative task chain | `test/workflow.test.ts` |
| 8 | Payment linked to file/client, allocated to charge, reversal | `test/workflow.test.ts` |
| 9 | Archive/unarchive without deletion | `test/lifecycle.test.ts` |
| 10 | Soft delete with cascading children and blocking file links | `test/lifecycle.test.ts` |
| 11 | Composite transaction commit/rollback | `test/lifecycle.test.ts` |
| 12 | Close/reopen persistence and number continuity | `test/persistence.test.ts` |
| 13 | Arabic search normalisation and rebuild | `test/persistence.test.ts` |
| 14 | Cross-device UUID and display-prefix uniqueness | `test/identity.test.ts` |
| 15 | Backup export, checksum, tamper detection | `test/backup.test.ts` |
| 16 | Restore with relation integrity and external-file warning | `test/backup.test.ts` |
| 17 | Versioned upgrade preserving data + pre-migration hook | `test/migration.test.ts` |
| 18 | Failed migration rollback, failure record, safe recovery | `test/migration.test.ts` |
| 19 | Local/remote conflict record and resolution | `test/sync.test.ts` |
| 19b | Outbox lifecycle and “entity synced only when drained” | `test/sync.test.ts` |
| 20 | Offline operation and absence of network imports | `test/offline.test.ts` |

Scenario 19b is an additional protocol test beyond the 20 required scenarios.

## CLI

```bash
# create and migrate a database, register this device
npm run db:init -- --db data/office.sqlite

npm run db:check -- --db data/office.sqlite
npm run db:info  -- --db data/office.sqlite

# backup + verification
npm run db:backup -- --db data/office.sqlite --label before-upgrade
npm run db:verify -- data/office.sqlite.backups/<file>.sqlite

# restore into a NEW path (refuses to overwrite without --force)
npm run db:restore -- data/office.sqlite.backups/<file>.sqlite data/restored.sqlite
npm run db:check   -- --db data/restored.sqlite

npm run db:search -- --db data/office.sqlite "أحمد"
npm run db:reindex -- --db data/office.sqlite
```

`--db` defaults to `data/law-office.sqlite` (or `$LAW_OFFICE_DB`). The CLI is an operator tool; it is not a user interface.

## Load benchmark

```bash
npm run db:bench -- --scale=1 --db=data/benchmark.sqlite
npm run db:bench -- --scale=2 --db=data/benchmark2.sqlite
```

`--scale` multiplies all record counts (1000 clients, 500 files/cases/tasks, 1000 hearings, 300 documents/payments at scale 1). Output is JSON with per-phase milliseconds, per-record cost, query timings, database size, integrity and sync counts. Recorded results: `docs/benchmark-results.md`. Delete the generated database files afterwards; they are ignored by Git (`data/`).

## Regenerating derived documentation

```bash
node --disable-warning=ExperimentalWarning scripts/gen-manifest.ts
node --disable-warning=ExperimentalWarning scripts/gen-schema-doc.ts
node --disable-warning=ExperimentalWarning scripts/gen-portable-schema.ts
node --disable-warning=ExperimentalWarning scripts/gen-portable-seed.ts
```

- `gen-manifest.ts` writes `src/schema/v1/manifest.ts` (required tables/indexes/triggers). Regenerate after any DDL change.
- `gen-schema-doc.ts` writes `docs/schema.md` from the migrated schema.
- `gen-portable-schema.ts` and `gen-portable-seed.ts` write the engine-neutral
  descriptor and seed used by the IndexedDB profile (`npm run db:gen-portable`).
  Both are deterministic; run them after any DDL or seed change and commit the
  generated files with the change.

Both scripts open an in-memory database and run migration 1; they do not touch the office file.

## Troubleshooting

| Symptom | Cause / action |
| --- | --- |
| `MIGRATION_CHECKSUM_MISMATCH` | The DDL/seed changed after a database was created. Development databases must be recreated; do not edit the checksum history. |
| `UNSUPPORTED_ENGINE: syncable table … lacks deleted_at` | A table in the sync registry is missing header columns. Fix the DDL and regenerate the manifest. |
| `SQLITE_CANTOPEN` / permission | Ensure the directory exists and is writable; use an absolute path in services. |
| `ExperimentalWarning` | Expected unless `--disable-warning=ExperimentalWarning` is passed. |
| Test file cannot import `.ts` | Node must be 22.18+; run via the npm scripts so flags are applied. |
