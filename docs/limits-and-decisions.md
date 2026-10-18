# Issues, limits and decisions requiring approval

This document separates **implemented reality** from **assumptions** and **open decisions**. Nothing in the deferred list is claimed as done.

## A. Decisions that need approval before the next phase

| # | Decision | Current position | Why it matters |
| --- | --- | --- | --- |
| A1 | Target platforms and order | Assumed Windows desktop first, then Android, then PWA. | Determines which runtime/SQLite embedding to productionise and which profile is tested first. |
| A2 | PWA storage | **Resolved 2026-10-18:** real IndexedDB engine implemented behind the async portable store contract, generated from the migrated SQLite schema, verified in Chromium across a browser restart and offline. | Remaining: installed-PWA shell/service worker, persistent-storage request and quota handling are not implemented. See `docs/local-storage-report.md`. |
| A3 | Desktop/mobile runtime | No Electron/Tauri/Capacitor/native shell chosen. `node:sqlite` is used for development and tests only. | Production needs a supported SQLite binding, packaging, file permissions and update strategy. |
| A4 | Encryption at rest | Not implemented; no encryption is claimed. | If office data requires SQLCipher/platform keystore, it must be designed and tested (key recovery, backups, migration). |
| A5 | Attachment storage | Metadata only; bytes live outside the DB. Backup reports inventory and restore warns. | Need a decision: plain office folder, content-addressed store, or per-file vault; then an attachment backup unit. |
| A6 | Sync trust model | Local outbox/conflict tables only; no transport. Assumed self-hosted LAN/office server or manual encrypted export, never a cloud dependency. | Determines authentication, conflict resolution UX, retention, and whether devices can sync without internet. |
| A7 | Conflict-resolution UX | Human resolution per conflict; no blanket last-write-wins. | Needs product rules for financial/legal records and who is allowed to resolve. |
| A8 | Seed finance settings | `finance.receipt_on_payment` (code default `true`) and `finance.default_currency` (`EGP`) are read with code defaults but are **not seeded** in `office_setting`. | Either seed them (visible/editable) or keep documented defaults; currently inconsistent with other settings. |
| A9 | Display numbering format | `FILE-{device}-{year}-{0001}`, `CLI-…`, `RCPT-…`, `CON-…`, `POA-…`; device prefix derived from UUID (6+ chars). | Users may prefer shorter/office-defined prefixes. Changing later rewrites history or leaves mixed formats. |
| A10 | Backup policy | Manual only; no rotation, scheduling, encryption or off-site copy. | Operational risk. Needs retention and verification policy before real client data. |
| A11 | Hard delete / retention | Business rows are soft-deleted; no purge path. | Legal retention/privacy policy may require documented purge with audit, not ad-hoc deletion. |
| A12 | Person/organization as separate sync entities | Subtype rows have their own sync headers and outbox entries. Alternative: sync only the party aggregate and embed subtype data. | Affects future merge semantics and payload size; current choice favours independent rows. |
| A13 | `root_file_id` invariant | Maintained by `CaseFileRepository.create` only; no DB trigger prevents a manually-created cycle. | Data imported outside repositories could violate the folder tree. Add a trigger or an import validator? |
| A14 | Case-number uniqueness | `legal_case` has no unique `(court, year, number)` constraint (courts may reuse/format numbers differently). | Need an office rule for duplicates and amendments. |
| A15 | Multi-process / network share | Designed for one process per database file; WAL on network shares is unsupported. | If the office runs two apps on one shared folder, SQLite locking is not a safe multi-user design. |

## B. Implemented behaviour that differs from a naive reading of the brief

1. **“SQLite on phone/desktop, IndexedDB on web”**: both engines are implemented; IndexedDB passes engine, parity and real-browser tests. There is still no installable PWA shell, so “open the installed app offline” is not yet claimed.
2. **Backup includes database only**: attachment bytes are excluded; the manager reports their count and restore warns. This is documented, not silent.
3. **No legal deadline calculations**: `judgment.user_appeal_deadline` is stored only when a user enters it. No appeal/limitation period is computed.
4. **No remote sync**: outbox/conflict metadata exist, but there is no transport, no background worker and no cloud push.
5. **Numbers are not identity**: UUIDs are keys; number series are display-only and scoped by device/year.
6. **Lookups are extensible rows**: court kinds, case types, roles, statuses, classifications are seeded data; no hard-coded court names or closed enums in code.
7. **Finance is operational**: fee agreements, charges, transactions, allocations, reversals; it is not a general ledger/accounting package.
8. **No full UI**: only a technical CLI.

## C. Defects found and fixed during implementation

| Defect | Effect | Fix |
| --- | --- | --- |
| `person` / `organization` lacked sync header columns while registered as sync entities | Database could not open (`syncable table person lacks deleted_at`) | Added `created_at`, `deleted_at`, `origin_device_id`, `revision`, `sync_status`, `last_synced_at`; added party cascade dependents. |
| Search service referenced `court.name_ar` | Reopen/rebuild crashed (`no such column`) | Use `court.name`. |
| Every fresh device received short code `D001` | Cross-device display numbers could collide | Derive prefix from device UUID (unique per DB), optional explicit 3–8 char code; removed per-device counter series. |
| `CaseFileRepository.create` ignored `clientPartyIds` (field absent from its input type) | Files silently had no client link | Added transactional client-role links; test covers it. |
| File-number root/file link tests used `fileId` instead of `fileIds` | Case had no file link in tests | Helper corrected; test asserts many-to-many. |
| Reversing a payment left charge/client “paid” totals unchanged | Incorrect outstanding amounts after correction | Reversed transactions are excluded from effective allocations/received sums; charge status recalculated inside the reversal transaction. |
| `person`/`organization` were `softDelete: false` | Party deletion could not cascade owned subtype rows | Marked soft-deletable; cascade test passes. |
| Health `stats()` built an invalid SQL table name for the client count | Diagnostics crashed | Inline join query. |

## D. Known limits and risks

- **Scale**: benchmark covers 2,000 clients and ~7,600 indexed documents; no 100k+ test. Per-record cost is 1.5–4.9 ms on the test host because every write also writes audit, outbox and search rows.
- **Durability vs speed**: WAL + `synchronous=FULL` is safe but slower; no journal-mode tuning for low-end phones yet.
- **Search**: Arabic normalisation handles common variants; it is not a morphological stemmer. FTS5 is optional, with LIKE fallback. The index is derived and can be rebuilt.
- **Audit**: append-only at the SQL level, but not cryptographically tamper-evident. A local operator with filesystem access can rewrite the file.
- **Security**: no field-level permissions, no encryption, no password handling. The assumption is a single-user office machine protected by OS accounts and disk encryption.
- **Migrations**: only v1 exists; the pre-migration backup hook is implemented but not wired because there is no upgrade yet.
- **Backups**: manual, full snapshots; no rotation/retention; external attachments not included; restoring onto another device requires `rotateIdentity`, not yet exercised end-to-end.
- **Device code collisions**: UUID-derived prefixes are checked locally; two databases cannot coordinate, so a 6-character collision is theoretically possible (1 in ~16.7 million per pair). Extend to 8/10/12 characters on collision; document the display format.
- **Concurrency**: SQLite `BEGIN IMMEDIATE` + 5 s busy timeout for one process; no stress test with multiple processes. Do not use on network shares.
- **Checkpoint**: `VACUUM INTO` needs free space roughly equal to the database size and can take time on large files.
- **`node:sqlite`** is an experimental Node API; pinning Node and a production SQLite binding is part of A3.
- **Initial migration checksum changes** whenever v1 DDL/seed changes; all pre-release development databases are disposable. Do not do this after real data exists.
- **Test-only upgrade migrations** live in `test/migration.test.ts`; they are not production migrations.
- **No purge**: soft-deleted and archived data remains until an approved retention policy is implemented.
- **No attachment checksum pipeline**: metadata supports SHA-256 and `verifyVersion`, but storing bytes/content-addressed files is future work.

## E. Explicitly not implemented (do not describe as done)

- Installable PWA shell/service worker, persistent-storage request, attachment storage (e.g. OPFS) and encryption.
- Android/iOS/desktop packaging.
- Network sync, server, authentication, conflict-resolution UI.
- Encryption, SQLCipher, secrets management.
- UI screens of any kind.
- Automatic legal deadline calculation.
- Automatic scheduled backups, retention, off-site replication.
- Hard delete/purge workflow.
- Multi-user/multi-process server deployment.
