# Backup and restore interface

Implementation: `src/backup/backup-manager.ts`. CLI: `src/cli.ts backup|verify|backups|restore`.

## Why not copy the `.sqlite` file

The database runs in WAL mode. A raw copy during writes can capture a database without its `-wal` content, or a torn pair of files. The manager therefore uses SQLite’s `VACUUM INTO` on the live connection, which produces a consistent database snapshot without blocking ordinary reads/writes beyond normal SQLite locking.

## `BackupManager.create({label?, destinationDir?})`

1. Refuses a non-SQLite adapter.
2. Creates the target directory, builds a collision-free filename `lawo-v{schema}-{UTC stamp}-{device8}-{label}.sqlite`.
3. Writes to `…tmp-{random}` with `VACUUM INTO`.
4. Opens the copy independently and writes provenance into its `app_meta` (format version, created-at, app version, schema version, origin device, attachments-included flag, label).
5. Runs `PRAGMA integrity_check` on the copy; aborts on anything but `ok`.
6. `fsync`s, computes SHA-256, renames into place, writes `{file}.sha256` (`{hash}  {basename}`), `fsync`s the sidecar.
7. Returns `BackupInfo`: path, checksum path, SHA-256, size, created-at, schema version, app version, origin device, `attachmentsIncluded: false`, and the count of local-file document versions.

A backup is never silently overwritten: an existing file name causes `BACKUP_FAILED`.

## `BackupManager.verify(path, {requireChecksumSidecar?})`

Checks:

- file exists and is readable;
- SHA-256 matches the sidecar when present (or reports a missing sidecar if required);
- `PRAGMA integrity_check = ok`;
- `PRAGMA foreign_key_check` returns no rows;
- `application_id = 0x4c41574f`;
- `user_version` is present and not newer than this application;
- every required v1 table is present;
- records the origin device, app version, whether attachments are included, and how many local-file versions exist.

Returns `BackupVerification` with `valid`, per-check values and an `errors[]` array. It does not throw for a bad backup; it reports `valid: false`. A malformed file yields an error rather than a crash.

## `BackupManager.restoreToNewDatabase(backupPath, targetPath, {force?})`

1. Verifies the source; aborts with `BACKUP_CORRUPT` if invalid.
2. If the target exists and `force` is false → `RESTORE_REQUIRES_EMPTY_DATABASE`.
3. With `force`, the existing target is renamed to `{target}.pre-restore-{stamp}` (never deleted).
4. Copies to `{target}.restore-tmp-{random}`, `fsync`s, re-computes SHA-256 and compares to the verified source, then runs `integrity_check` on the copy.
5. Renames into the target path.
6. Returns `RestoreResult` with `attachmentsIncluded: false` and a warning naming the number of external-file document versions that must be copied separately.

The caller must reopen the database afterwards; no live adapter is swapped.

## Attachments

Binary files are outside SQLite. A database backup contains document metadata, version records, checksums and storage paths, but **not the bytes**. On restore:

- if `document_version.storage_kind = 'local_file'`, the restore warning reports the count;
- the office must restore the attachment folder from its own copy;
- `document_version.storage_state` (`registered`/`stored`/`verified`/`missing`/`failed`) lets the app reconcile after restore.

A future content-addressed attachment store must be added as its own backup unit; it is not implemented here.

## Identity after restore onto other hardware

The backup includes the source device row. Restoring onto another machine must call `DeviceService.rotateIdentity(reason)` before creating new records: the old row is kept inactive for history, a new local device is inserted and advertised through the outbox, and new file numbers use the new prefix. The function exists and is unit-wired through the service, but is **not yet exercised end-to-end** (listed as deferred).

## Security

Backups are plain SQLite files. They are not encrypted by this code. Protect the backup directory with OS permissions and full-disk encryption; do not place backups on untrusted network shares. WAL mode is not reliably safe on network filesystems.

## Known limits

- No automatic scheduled backups (no background service in this phase).
- No incremental/differential backup; each run is a full snapshot.
- No retention policy; the CLI never deletes old backups.
- No attachment bytes.
- Restore is offline and explicit; there is no “restore while running”.
- Verification checks structure and integrity, not business semantics.
