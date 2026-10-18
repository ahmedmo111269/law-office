# Local storage delivery report

Date: 2026-10-18 · Branch: `arena/691f011a-law-office` · Base commit: `ea690eb`
Scope: make real local storage work on phone (browser/PWA) and desktop, per
the binding directive. No clients/files/cases UI work was started.

## 1. Actual storage engine per platform

| Platform | Engine | Real? |
| --- | --- | --- |
| Desktop / native, CLI | **SQLite** via Node `node:sqlite`, WAL, foreign keys, triggers, FTS5 | yes — implementation existed, unchanged and re-tested |
| Browser / installable PWA | **IndexedDB** — 57 object stores, 155 indexes, real browser transactions | yes — implemented this phase and executed in Chromium 153 |
| Node-side tests of the browser engine | IndexedDB through `fake-indexeddb` | test double only; real-browser proof is separate |

There is no server, cloud database, network transport, API key or paid service
in either engine. The existing offline test still proves `src/` contains no
network imports or `fetch` calls.

## 2. Files implemented / edited

New — portable layer:

- `src/schema/portable-types.ts` — engine-neutral schema descriptor types.
- `src/schema/v1/portable-schema.ts` — **generated** from the migrated SQLite schema: 57 tables, 155 indexes, 185 CHECK expressions, 153 foreign keys.
- `src/schema/v1/portable-seed.ts` — **generated** seed rows with deterministic UUIDv5 ids (54 lists / 374 items / 43 sync types, …).
- `src/portable/expression.ts` — CHECK-expression compiler/evaluator.
- `src/portable/store.ts` — async `PortableStore` contract + real `SqlitePortableStore` and `IndexedDbStore`.
- `src/portable/portable-database.ts` — shared write semantics and domain operations.

New — IndexedDB engine:

- `src/db/indexeddb/indexeddb-adapter.ts` — real object stores/indexes, transactions, validation, import/export, integrity check.
- `src/db/indexeddb/idb-migration-manager.ts` — baseline + data migrations, checksum verification.
- `src/browser/browser-database.ts` — browser/PWA entry point.

New — generation and verification:

- `scripts/gen-portable-schema.ts`, `scripts/gen-portable-seed.ts`.
- `test/indexeddb.test.ts` (15 tests), `test/engine-parity.test.ts` (3 tests).
- `scripts/browser-selftest.ts` + `scripts/browser-selftest-harness.ts` — real Chromium restart/offline test.
- `docs/local-storage-implementation.md` (technical description) and this report.

Edited:

- `src/util/uuid.ts` — replaced `node:crypto`/Buffer with WebCrypto + pure TypeScript SHA-1, so the identical code runs in the browser bundle; seed UUIDv5 output verified unchanged.
- `tsconfig.json` — added the `DOM` lib for IndexedDB types.
- `tsconfig.test.json` — includes all `scripts/**` (test tooling) explicitly.
- `package.json` / `package-lock.json` — dev dependencies `fake-indexeddb`, `esbuild`, `@sparticuz/chromium`; scripts `test:idb`, `test:browser`, `db:gen-portable`.
- `README.md`, `docs/testing.md`, `docs/limits-and-decisions.md` — updated status and commands.

No existing table, seed row, migration, repository or test was removed or
rewritten. The SQLite path and its 21 tests are intact.

## 3. Real test results per engine

Commands executed in this workspace, with real output:

| Suite | Command | Result |
| --- | --- | --- |
| SQLite scenarios (unchanged) | `node --disable-warning=ExperimentalWarning --test test/*.test.ts` | **39/39 pass** overall; 21 of them are the original SQLite suite |
| IndexedDB engine in Node | `node --test test/indexeddb.test.ts` | **15/15 pass** |
| Cross-engine parity | `node --test test/engine-parity.test.ts` | **3/3 pass** |
| Type checks | `tsc --noEmit` and `tsc -p tsconfig.test.json` | **0 errors** |
| Real browser | `node scripts/browser-selftest.ts` | **PASS** |

IndexedDB tests cover: store/index creation for all 57 tables and 155 indexes;
seeding once with identical ids; NOT NULL/CHECK/FK/unique enforcement;
partial-unique semantics (block duplicate active case number, allow replacement
after soft delete, reject restore that would collide); transaction rollback;
close/reopen persistence; backup export/verify/restore; migration ledger and
tamper detection; Arabic search and filters; sequential numbering across
restart; cascade soft delete + batch restore; finance allocation/reversal
balances; audit/revision/outbox; no network calls; rejection of an incomplete
backup.

Parity tests assert that the same domain scenario produces an identical
functional result on SQLite and IndexedDB (relations, counts, balances, search
hits, backup validity, file-number shape), that both engines return the same
error codes for the same invalid writes, and that an IndexedDB backup restores
into SQLite with relations intact.

## 4. Proof that data survives a restart

Real Chromium, persistent `--user-data-dir`, **two separate browser processes**:

1. Process 1 (`?phase=write`) created: 1 party + client profile, 1 court,
   1 file with 1 party relation, 1 case linked to the file, 2 hearings
   (original + next), 1 judgment, 1 task with status history, 1 document with
   1 version, 1 account, 1 charge, 1 payment + allocation, audit and outbox
   rows; exported and verified a backup (598 rows, 268,210 bytes).
2. Browser killed. Process 2 (`?phase=verify`) reopened the same database:
   same party id, same file id, same case id, search `سلمى` returned the party,
   file had 1 party, case had 2 hearings, judgment had 1 file, integrity check
   passed for 57 tables / 155 indexes, migration ledger valid, backup valid.

That is persistence through a real browser restart, not an in-memory test.

Node-level restart proof: `test/indexeddb.test.ts` closes the database and
reopens it (numbering continues, data and `local.device_id` survive), and the
SQLite suite already proves file-level close/reopen persistence.

## 5. Offline operation test results

- Browser, network disabled with CDP `Network.emulateNetworkConditions
  {offline:true}` plus `Network.setBlockedURLs ['*']`, after the page loaded:
  an external `fetch` to `https://example.com` **failed** (no network), while
  creating a task and reading it back **succeeded**. Recorded in the PASS
  output as `externalFetchFailed: true`, `writeSucceeded: true`,
  `readAfterWrite: true`.
- No operation required a server at any point: all data lives in the browser
  profile (IndexedDB) or the SQLite file.
- First installation is **not** proven offline: there is no service worker or
  app shell yet, so "open the PWA with the network off" is not claimed. What is
  proven is that storage read/write/search/relations/backup keep working with
  no network and no server.
- The offline test in the existing suite continues to prove that `src/` has no
  network imports or `fetch` usage.

## 6. Backup / restore status

Implemented on both engines:

- Logical, engine-neutral backup `lawo-portable-backup` v1: all 57 tables,
  counts, schema/application/device identity, SHA-256 checksum over canonically
  sorted rows.
- Verification checks the checksum, schema/application identity, presence of
  every table, row constraints, foreign keys and unique indexes.
- Restore is atomic and refuses an unverified backup. SQLite restore suspends
  guard triggers only for the verified import, recreates them, rebuilds FTS and
  runs `PRAGMA foreign_key_check`; IndexedDB restore runs in one transaction.
- Tested: export→verify→restore on IndexedDB; export in IndexedDB→restore in
  SQLite with relations; tampered checksum rejected; incomplete backup rejected.
- **Attachments are not included.** Backups contain database rows; document
  `storage_path` values are references to files stored outside the database.
  No attachment file is copied into the backup. This is a documented exception,
  not a complete backup claim.
- **No encryption is implemented** for backups or databases. Nothing in this
  report should be read as an encryption claim.
- The existing SQLite WAL-safe `VACUUM INTO` backup (SHA-256 sidecar,
  verification, non-destructive restore) is unchanged.

## 7. Known limits and remaining decisions

1. **No installable PWA shell / service worker yet** — offline *opening* is not
   verified; only offline storage operations are. This is the next prerequisite
   for a real phone installation.
2. **Attachments** — no browser attachment store (e.g. OPFS) and no attachment
   inclusion in backups. Needs an explicit policy decision.
3. **Persistence/quota** — browsers may evict IndexedDB. The app must request
   persistent storage (`navigator.storage.persist()`) and expose storage usage;
   not implemented yet.
4. **Encryption** — not implemented anywhere; must be decided (device-level,
   database-level, or backup-level) before any claim.
5. **IndexedDB migration structure** — future *structural* changes still use
   `upgradeneeded`; the data-migration manager is in place, but no second
   migration exists yet to exercise a real v1→v2 upgrade on IndexedDB. SQLite
   upgrade tests exist.
6. **Search parity** — FTS5 ranking/tokenisation is not reproduced; matching in
   IndexedDB scans the projection. Acceptable at current data volumes
   (benchmarks: 3.8k–7.6k documents), may need an index strategy for very large
   offices.
7. **`fake-indexeddb` is a test double** — it is never shipped and is not used
   to claim browser behaviour; the Chromium run is the browser evidence.
8. **Sync** — readiness tables/outbox only; no transport, by instruction.
9. **Backup format versioning** — only v1 exists; restoring a future version
   must be rejected until a migration path is written (the verifier rejects
   unknown schema versions today).

## 8. Functional differences between engines

| Area | SQLite | IndexedDB |
| --- | --- | --- |
| Storage unit | one `.sqlite` file | one database in the browser profile |
| Execution | synchronous | asynchronous (promises) |
| Constraint enforcement | SQL + triggers + indexes | portable layer (same checks/expressions) + IndexedDB unique indexes |
| Partial unique indexes | native partial index | portable predicate + scan |
| Cascades | schema FKs + application rules | application rules from the sync registry |
| Transactions | `BEGIN IMMEDIATE`, savepoints for nesting | one native transaction; nested calls join it |
| Search | FTS5 + LIKE fallback | normalised document scan and ranking in JS |
| Integer `search_document.id` | `AUTOINCREMENT` | max+1 inside the transaction |
| Migration ledger | `schema_migration` (SQLite manager) | same table via `IdbMigrationManager` |
| Structural upgrade | versioned SQL migrations | `upgradeneeded` + data migrations |
| Backup | WAL-safe file copy (`VACUUM INTO`) + portable logical backup | portable logical backup only |
| Restore | file-level or verified logical import | verified logical import |
| Attachments | external files on disk, never in DB | not implemented (no OPFS store yet) |
| Encryption | none | none |
| Offline dependency | none | none |
| Browser quota/eviction | n/a | browser-controlled, not yet handled |

What is intentionally identical: table set, columns, primary keys, relations,
CHECK/NOT NULL/type rules, unique rules, stable UUID ids, display numbering,
soft-delete batches and restore, revision/sync headers, audit rows, outbox
rows, and backup content/verification.

## Verification commands

```bash
npm run typecheck
npm run typecheck:tests
npm test              # 39 tests
npm run test:idb      # 18 tests (IndexedDB + parity)
npm run test:browser  # real Chromium restart + offline test
```
