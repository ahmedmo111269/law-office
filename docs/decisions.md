# Architecture decisions

Status: accepted for the data-foundation phase. Items marked **needs approval** are in `docs/limits-and-decisions.md`.

## D1. One storage contract, two engine profiles

**Decision:** application code depends on `DatabaseAdapter` (`src/db/adapter.ts`), not on a database vendor. The contract is synchronous and transactional (`exec`, `query`, `get`, `run`, `transaction`, `describe`, `close`), because a local write must be atomic without interleaving async work.

**Implemented:** SQLite adapter (`node:sqlite` in development/tests).

**Not implemented:** an IndexedDB adapter. The interface reserves `engine: 'indexeddb'`, but repositories currently speak SQL; a browser profile needs either a repository port per engine or SQLite compiled to WebAssembly with an OPFS-backed file. No claim of “SQLite in the browser” is made. The PWA can only be delivered after that adapter (or a WASM SQLite profile) is built and tested; it is deferred, not hidden.

## D2. SQLite for desktop and native mobile, IndexedDB for PWA

| Option | Verdict |
| --- | --- |
| JSON/file store | Rejected: no transactions, no constraints, corruption risk, full rewrites. |
| SQLite (desktop/mobile) | Accepted: single file, ACID, foreign keys, indexes, FTS5, WAL, mature backup story. Runs in-process with no server and no network. |
| IndexedDB (PWA) | Accepted as the web profile: transactional object store in the browser. It does not provide SQL, triggers, or the same query semantics; the data layer must not pretend otherwise. |
| Remote server | Rejected for this phase: violates offline-first and adds dependency. |

The Windows/Android/PWA target set is an assumption (the same code can serve macOS/Linux; iOS is possible through a native shell). **Needs approval** before packaging decisions are finalised.

## D3. Synchronous API for the local profile

A law-office operation is short and local. Synchronous repository calls make atomicity auditable and prevent unrelated writes interleaving in one transaction. Browser IndexedDB is asynchronous; a future browser adapter must either expose a synchronous facade over a worker or the repository layer must gain an async port. This is a known cost of the two-engine choice.

## D4. UUID identity, separate display numbers

Random UUID v4 for business rows so independent devices never collide. Seed/reference rows use UUID v5 so every device derives identical IDs. Display numbers live in `number_series` and are allocated inside the business transaction; they are never primary keys. This satisfies “no local counters as identity” while keeping human-friendly file/receipt numbers.

Device prefixes are derived from the device UUID, not from a per-device counter starting at 1, otherwise every device would issue `FILE-D001-…`. A user may supply a 3–8 character code instead.

## D5. Sync header columns on independently syncable rows

`created_at`, `updated_at`, `deleted_at`, `origin_device_id`, `revision`, `sync_status`, `last_synced_at`. `updated_at` is local business time; `last_synced_at` is transport metadata and never used to detect changes. A monotonic `sync_outbox.sequence`, not `updated_at`, drives change ordering.

Person/organization subtype rows carry their own header columns because they are independently addressable sync entities; a party write and its subtype write are separate outbox entries inside one local transaction.

## D6. Conflict policy is per entity class

`src/sync/entity-registry.ts` records a policy and a conflict note per entity: field merge, relation set, append-only, immutable, ledger. There is no blanket last-write-wins. Financial entries, audit history and status history are append-only/ledger classes; they are never overwritten by a remote payload. Conflicts store both payloads and the disagreeing fields until a human resolution is chosen.

## D7. Soft delete with an explicit deletion batch

Business rows are soft-deleted, never hard-deleted by repositories. A `deletion_batch` and `deletion_entry` rows allow restore of the exact set. Dependent rules are declared per entity: `block` (default for financial/legal references) or `cascade` (owned child rows such as contacts and client profile). Finance tables have DB triggers preventing deletion of posted entries.

## D8. No legal rules in the schema

The database does not compute appeal deadlines, limitation periods, or procedural classifications. `judgment.user_appeal_deadline` exists only because the user may type a deadline; it is not derived. Court names, case types, roles, procedures and classifications are lookup data, not code enums.

## D9. Integer money

All amounts are `INTEGER` piastres with a currency code. No floating point. Account currency must match transaction currency. Posted economic fields are immutable; corrections are reversing entries, and allocations to a reversed payment stop counting toward the charge and client totals.

## D10. Backups are engine-native snapshots, never raw copies

SQLite uses `VACUUM INTO`, which produces a consistent database from the live connection even with WAL. Raw file copy during writes is explicitly rejected. The backup is verified (integrity, FK, app id, schema version, hash) before being presented. Restore writes to a temporary path, verifies the copy hash, and renames; it never destroys the target silently.

Attachments are outside the database. The backup reports their count, and restore warns that they must be copied separately. **Needs approval** whether the eventual product stores attachments in an office-managed folder or a content-addressed store.

## D11. Migrations are append-only

Each migration has a frozen SHA-256 checksum and runs once, inside a transaction, after checking the existing history. There is no “drop and recreate” path. A failed migration rolls back, records the failure, and leaves the previous version usable. A pre-migration backup hook exists; it must be wired before the second migration is shipped.

## D12. Derived search index

Arabic search is normalised and indexed in `search_document` + FTS5. The index is rebuildable, optional (LIKE fallback), and never authoritative. Search failures mark a rebuild flag but never roll back a confirmed business write.

## D13. Audit is append-only, not tamper-proof

`audit_log` rows cannot be updated or deleted by triggers, and sensitive values (national id, contact value, salary-like notes) are redacted. A local database owner with filesystem access can still alter the file; the design does not claim cryptographic tamper evidence. **Security limits are documented, not glossed over.**

## D14. No encryption claims

No field-level encryption and no password storage are implemented in this phase. Protection relies on the operating system’s disk encryption and file permissions. If SQLCipher or platform keystores are required, that is a separate, explicitly tested change.

## D15. Test strategy

Twenty required scenarios are automated with `node:test` against real SQLite files in temporary directories, plus a local load benchmark. Tests assert constraints, transaction rollback, reopen persistence, Arabic search, backup/restore, migration success/failure, conflict records and offline operation. Sync transport, IndexedDB, mobile packaging, encryption and multi-process stress are **not** tested because they are not implemented; they are listed as deferred in `docs/test-results.md`.
