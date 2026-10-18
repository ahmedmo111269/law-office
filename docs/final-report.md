# Final report — offline-first data foundation

**Branch:** `arena/691f011a-law-office`
**Base:** `main` at `b5769b8` (initial repository contained only `README.md`)
**Data-layer commit:** `6e15776` — “Implement offline-first SQLite data foundation with migrations, repositories, backup and tests”
**Scope:** database/storage foundation only. No UI, no network sync, no AI, no paid services, no cloud dependency.

## 1. Repository state

| | Before | After |
| --- | --- | --- |
| Tracked files | 1 | **74** |
| Code/docs | README only | 17,234 inserted lines |
| Schema | none | v1: **57 application tables**, 90 indexes, 16 triggers, 54 lookup lists / 374 items, 43 sync entity policies |
| Tests | none | 21 executed tests (20 required scenarios + outbox protocol test), 21 passed |
| Migrations | none | 1 application migration + tested test-only v2 upgrade/failure scenarios |
| Backup | none | WAL-safe snapshot, verification, checksum sidecar, non-destructive restore |
| Sync | none | Local outbox/conflict metadata only; no transport |

`main` was not modified. All work is on the session branch; `data/` and SQLite files are ignored by Git.

## 2. Deliverables map

| # | Requested deliverable | Where |
| --- | --- | --- |
| 1 | Architecture map | `docs/architecture.md` |
| 2 | Decisions justifying storage per platform | `docs/decisions.md` |
| 3 | ER diagram | `docs/er-diagram.md` |
| 4 | Tables/stores, fields, types, constraints | `docs/schema.md` (generated from the live schema) + `src/schema/v1/ddl.ts` |
| 5 | Actual database creation files | `src/schema/v1/ddl.ts`, `src/schema/v1/seed.ts`, `src/db/migrations/0001_initial.ts` |
| 6 | Data-access layer | `src/db/adapter.ts`, `src/db/sqlite/sqlite-adapter.ts`, `src/repositories/*.ts` |
| 7 | Migrations/versioning | `src/db/migrations/*`, `docs/migrations.md` |
| 8 | Repositories for core entities | parties, courts, case files, cases, hearings, judgments, tasks, documents, contracts/POAs, finance, appointments/reminders, settings/lookups, sync metadata |
| 9 | Future-sync structure | `src/sync/entity-registry.ts`, `src/repositories/sync-metadata-repository.ts`, `docs/sync-readiness.md` |
| 10 | Backup/restore interfaces | `src/backup/backup-manager.ts`, CLI commands, `docs/backup-restore.md` |
| 11 | Runnable automated tests | `test/*.test.ts` (21 tests) |
| 12 | How to run tests | `docs/testing.md`, root `README.md` |
| 13 | Actual results with real numbers | `docs/test-results.md`, `docs/benchmark-results.md` |
| 14 | Issues, limits, decisions needing approval | `docs/limits-and-decisions.md` |

## 3. Engine per platform (honest status)

| Platform | Engine | Status |
| --- | --- | --- |
| Windows/macOS/Linux desktop | SQLite file, WAL, FK ON, `synchronous=FULL`, 5 s busy timeout | Implemented/tested via `node:sqlite` |
| Android/iOS native | Same SQLite contract | Interface ready; not packaged/tested on device |
| PWA/browser | IndexedDB | **Not implemented at the time of this report**; the IndexedDB engine was added afterwards (2026-10-18). See `docs/local-storage-report.md` for the current state. |
| Server | none | Deliberately absent |

`node:sqlite` is a development/test binding. A production desktop/mobile runtime and a browser profile are pending decisions (A2/A3 in the limits document).

## 4. Entities and relations implemented

- **People:** party aggregate with natural person, legal person, client profile, contacts, addresses, aliases, relationships, interactions, snapshots. Soft-delete and archive/restore.
- **Files/cases:** internal file vs court case, sub-files with root/parent links, many-to-many file↔case, file↔file links, per-file party roles (role, side, ordinal, start/end dates, optional case scope), notes.
- **Courts:** courts and circuits as editable reference data; no hard-coded court names.
- **Judicial:** sessions (held/postponed/cancelled/next-session link), judgments, appeals with user-entered deadline, judgment↔file links. No legal date calculation.
- **Work:** tasks with append-only status history, announcements, appointments, reminders.
- **Documents:** metadata vs versions (paper/external/local file), SHA-256, storage states, XOR link table to eight target kinds.
- **Contracts/POAs:** contracts with parties, powers of attorney, optional dates.
- **Finance:** accounts, fee agreements (separate from movements), charges, transactions, allocations, receipts, void/reversal, balances. Operational, not full accounting.
- **System:** settings (office vs device), lookups, currencies, number series, devices, audit, deletion batches, sync outbox/conflicts, derived search.

## 5. Identity and file numbering

- All business keys are **UUIDv4**; seed/reference rows are deterministic **UUIDv5**. Names, phone numbers, case numbers and counters are never keys.
- Display numbers are allocated by `number_series` inside the business transaction. Formats: `FILE-{device}-{year}-{0001}`, `CLI-…`, `RCPT-…` (5 digits), `CON-…`, `POA-…`.
- Device prefixes are derived from the device UUID (or an explicit 3–8 character code), so independent devices do not all start at `D001`. Collisions are checked locally; across databases the risk is theoretical but documented.
- `updated_at` is local business time and is independent of `last_synced_at`; change ordering uses `sync_outbox.sequence`.

## 6. Migration mechanism

- Versioned, contiguous, once-only migrations with SHA-256 checksums stored in `schema_migration`.
- `PRAGMA user_version` mirrors the last migration; `application_id = 0x4c41574f` identifies law-office files.
- Rejects unknown/newer schemas, unknown tables, checksum mismatches, and mismatched history.
- Each migration + history row + `user_version` + app_meta update runs in one transaction.
- Failure rolls back, records `migration_failure`, and leaves the previous version openable.
- Only v1 ships. Test-only v2 upgrade and v2 failure are covered; the pre-migration backup hook exists but is not wired because there is no production v2 yet.

## 7. Backup/restore status

**Implemented and executed:**

- `VACUUM INTO` snapshot of a live WAL database; temp file → integrity/FK/app-id/schema verification → SHA-256 → fsync → atomic rename.
- `.sha256` sidecar; verification detects tampering.
- Restore to a new path only; refuses to overwrite; `--force` preserves the old file as `.pre-restore-*`; re-verifies the copied hash and integrity.
- Attachment inventory count and explicit warning that bytes are not included.
- CLI: `backup`, `verify`, `backups`, `restore`.

**Not implemented:** scheduled/rotating backups, encryption, attachment-byte backup, restore-while-running, end-to-end identity rotation on new hardware.

## 8. Sync status

- 43 entities have a policy: 31 `field_merge`, 7 `relation_set`, 2 `append_only`, 2 `ledger`, 1 `immutable`.
- Outbox: unique change id, unique monotonic sequence, operation, payload, changed fields, origin device, retry state/count/error, sent time.
- `markSent` only marks an entity `synced` when no other pending rows exist.
- Conflicts store both payloads, revisions, device ids and conflicting fields; resolution is explicit.
- **No transport, no remote apply, no server, no background worker.** Local metadata and tests only.

## 9. Executed verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `tsc -p tsconfig.test.json` | 0 errors |
| `node --test test/*.test.ts` | **21 passed / 0 failed**, ~3.9 s |
| CLI init/check/backup/verify/restore/search/reindex | all succeeded |
| Restored database health | integrity ok, quick check ok, 0 FK violations, 63 SQLite objects, FTS5 present |
| Benchmark scale 1 | 13.5 s, 23.8 MiB, 4.6 ms/client, search 5 ms |
| Benchmark scale 2 | 24.8 s, 46.6 MiB, 4.3 ms/client, search 18 ms |
| Integrity/FK after benchmark | ok / 0 |

Exact tables and per-test mapping: `docs/test-results.md`.

## 10. Known limits and risks (summary)

1. ~~PWA storage is not built~~ — **superseded on 2026-10-18** by the implemented IndexedDB engine; see `docs/local-storage-report.md`.
2. **No production runtime/packaging**; `node:sqlite` is experimental and used for development/tests.
3. **No encryption**; protection is OS/file-permission only, and this is not presented as encrypted storage.
4. **Attachment bytes are not in backups.**
5. **No network sync**; only the local half exists.
6. **Only v1 migration exists**; pre-migration backup hook not yet wired.
7. **Performance tested to 2,000 clients**; per-record writes are 1.5–4.9 ms because audit/outbox/search are written in the same transaction.
8. **`root_file_id` is app-enforced**, not trigger-enforced; imports outside repositories could violate it.
9. **Single-process assumption**; network shares/multiple app instances are unsupported.
10. **Audit is append-only at SQL level but not cryptographically tamper-evident.**
11. **Finance settings** `finance.receipt_on_payment` and `finance.default_currency` are code defaults, not seeded settings.
12. **No hard-delete/purge/retention policy.**
13. **Device short-code collision** across independent databases is theoretically possible (UUID prefix checks are local).
14. ~~IndexedDB/SQL portability~~ — resolved with a generated portable schema and a shared async store contract; see `docs/local-storage-implementation.md`.

Defects found and fixed during the phase (missing person/organization sync columns, court `name_ar`, device prefix collision, ignored file client links, reversal totals, soft-delete subtype cascade) are documented in `docs/limits-and-decisions.md`.

## 11. Decisions requiring approval

Priority order:

1. ~~PWA storage strategy~~ — IndexedDB engine implemented and tested; remaining PWA decisions are the installable shell, persistent storage and attachments.
2. **Desktop/mobile production runtime** and supported OS versions.
3. **Encryption requirements** (SQLCipher/keystore, key recovery, backup interaction).
4. **Attachment storage and backup policy.**
5. **Sync trust model** (self-hosted LAN server vs encrypted manual export) and conflict-resolution UX.
6. **Backup retention/scheduling/off-site policy.**
7. **Seed vs default** for finance settings; number-format preferences.
8. **Data retention/purge policy** for legal and privacy obligations.
9. **Case-number duplicate rules** and `root_file_id` DB-level enforcement.
10. **Person/organization sync granularity** (separate rows vs party aggregate).

Full context: `docs/limits-and-decisions.md`.

## 12. Proposed next step

**Do not start UI screens yet.** The foundation is stable and documented, but two platform choices (PWA storage, production runtime) block a real application shell.

Recommended sequence:

1. Get approval on the decisions above (at minimum A1–A5).
2. Build the **services/use-case layer** on top of the repositories: client intake, file opening, case registration, hearing scheduling, judgment/work chain, fee collection, document registration, archive/restore — each as a transactional application service with validation and audit summaries.
3. Add a two-database integration harness for the future sync applier (still no transport) and an attachment storage module with its own backup unit.
4. Only then build the first program section (clients and files), followed by cases/hearings, then finance/documents, with UI screens bound to the services — never to SQL.

This preserves the user’s rule: no program section before the data foundation is stable and its interfaces documented.
