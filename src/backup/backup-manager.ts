import { PORTABLE_SCHEMA } from '../schema/current.ts';
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DatabaseAdapter } from '../db/adapter.ts';
import { LAW_OFFICE_APPLICATION_ID } from '../db/constants.ts';
import { BackupError } from '../errors.ts';
import { REQUIRED_TABLES_V1 } from '../schema/v1/manifest.ts';
import type { Clock } from '../util/clock.ts';
import { toCanonicalTimestamp } from '../util/dates.ts';
import { newId } from '../util/uuid.ts';

export interface BackupInfo {
  readonly path: string;
  readonly checksumPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly originDeviceId: string;
  readonly attachmentsIncluded: false;
  readonly externalFileVersions: number;
}

export interface BackupVerification {
  readonly valid: boolean;
  readonly path: string;
  readonly errors: readonly string[];
  readonly integrity: string | null;
  readonly schemaVersion: number | null;
  readonly applicationId: number | null;
  readonly sha256: string | null;
  readonly checksumSidecarVerified: boolean;
  readonly deviceId: string | null;
  readonly appVersion: string | null;
  readonly tablesPresent: number;
  readonly attachmentsIncluded: boolean;
  readonly externalFileVersions: number | null;
}

export interface RestoreResult {
  readonly targetPath: string;
  readonly sourceBackup: string;
  readonly previousTargetMovedTo: string | null;
  readonly schemaVersion: number;
  readonly attachmentsIncluded: false;
  readonly warning: string;
}

export interface BackupManagerOptions {
  readonly backupDir: string;
  readonly appVersion: string;
  readonly deviceId: string;
  readonly clock: Clock;
  readonly latestSchemaVersion: number;
}

/**
 * SQLite backups use `VACUUM INTO`, which produces a consistent snapshot of an
 * open WAL database without copying a file mid-write. A backup is written to a
 * temporary path, verified, hashed, then atomically renamed. Existing backups
 * are never overwritten.
 *
 * External attachment files are not inside the database and are NOT included.
 * This class reports their count instead of pretending the backup is complete.
 */
export class BackupManager {
  private readonly db: DatabaseAdapter;
  private readonly options: BackupManagerOptions;

  constructor(db: DatabaseAdapter, options: BackupManagerOptions) {
    this.db = db;
    this.options = options;
  }

  create(
    options: { label?: string; destinationDir?: string } = {},
  ): BackupInfo {
    if (this.db.engine !== 'sqlite') {
      throw new BackupError(
        'UNSUPPORTED_ENGINE',
        'SQLite backup requires the SQLite adapter',
      );
    }
    const vacuum = (
      this.db as unknown as { vacuumInto?: (dest: string) => void }
    ).vacuumInto;
    if (typeof vacuum !== 'function') {
      throw new BackupError(
        'UNSUPPORTED_ENGINE',
        'adapter does not expose VACUUM INTO',
      );
    }

    const dir = resolve(options.destinationDir ?? this.options.backupDir);
    mkdirSync(dir, { recursive: true });
    const now = this.options.clock.now();
    const createdAt = toCanonicalTimestamp(now);
    const stamp = createdAt
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .replace(/\..+$/, '');
    const schemaVersion = this.readUserVersion(this.db);
    const device = this.options.deviceId.slice(0, 8);
    const label = options.label?.trim()
      ? `-${options.label
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40)}`
      : '';
    const fileName = `lawo-v${schemaVersion}-${stamp}-${device}${label}.sqlite`;
    const finalPath = join(dir, fileName);
    if (existsSync(finalPath)) {
      throw new BackupError(
        'BACKUP_FAILED',
        'backup file already exists; refusing to overwrite',
        {
          path: finalPath,
        },
      );
    }
    const tempPath = `${finalPath}.tmp-${newId().slice(0, 8)}`;

    try {
      vacuum.call(this.db, tempPath);
      // Record backup provenance inside the copy only.
      const copy = new DatabaseSync(tempPath, {
        enableForeignKeyConstraints: true,
      });
      try {
        const meta = (key: string, value: string): void => {
          copy
            .prepare(
              `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            )
            .run(key, value, createdAt);
        };
        meta('backup.format_version', '1');
        meta('backup.created_at', createdAt);
        meta('backup.app_version', this.options.appVersion);
        meta('backup.schema_version', String(schemaVersion));
        meta('backup.origin_device_id', this.options.deviceId);
        meta('backup.attachments_included', '0');
        meta('backup.label', options.label?.trim() ?? '');
        const check = copy.prepare('PRAGMA integrity_check').all() as Array<{
          integrity_check: string;
        }>;
        const integrity = check.map((row) => row.integrity_check).join('; ');
        if (integrity !== 'ok') {
          throw new BackupError(
            'BACKUP_CORRUPT',
            `backup copy failed integrity_check: ${integrity}`,
          );
        }
      } finally {
        copy.close();
      }

      fsyncPath(tempPath);
      const sha256 = sha256File(tempPath);
      const sizeBytes = statSync(tempPath).size;
      renameSync(tempPath, finalPath);
      const checksumPath = `${finalPath}.sha256`;
      writeFileSync(
        checksumPath,
        `${sha256}  ${basename(finalPath)}\n`,
        'utf8',
      );
      fsyncPath(checksumPath);

      const external = this.countExternalVersions(this.db);
      return {
        path: finalPath,
        checksumPath,
        sha256,
        sizeBytes,
        createdAt,
        schemaVersion,
        appVersion: this.options.appVersion,
        originDeviceId: this.options.deviceId,
        attachmentsIncluded: false,
        externalFileVersions: external,
      };
    } catch (error) {
      try {
        if (existsSync(tempPath)) unlinkSync(tempPath);
      } catch {
        // best effort cleanup
      }
      if (error instanceof BackupError) throw error;
      throw new BackupError(
        'BACKUP_FAILED',
        'backup could not be created',
        { path: finalPath },
        error,
      );
    }
  }

  verify(
    path: string,
    options: { requireChecksumSidecar?: boolean } = {},
  ): BackupVerification {
    const resolved = resolve(path);
    const errors: string[] = [];
    if (!existsSync(resolved)) {
      throw new BackupError('BACKUP_FAILED', 'backup file not found', {
        path: resolved,
      });
    }
    const sha256 = sha256File(resolved);
    const checksumPath = `${resolved}.sha256`;
    let checksumSidecarVerified = false;
    if (existsSync(checksumPath)) {
      const expected = readChecksumSidecar(checksumPath);
      if (expected === null) {
        errors.push('checksum sidecar is malformed');
      } else if (expected !== sha256) {
        errors.push('checksum sidecar does not match the backup file');
      } else {
        checksumSidecarVerified = true;
      }
    } else if (options.requireChecksumSidecar) {
      errors.push('checksum sidecar is missing');
    }

    let integrity: string | null = null;
    let schemaVersion: number | null = null;
    let applicationId: number | null = null;
    let deviceId: string | null = null;
    let appVersion: string | null = null;
    let tablesPresent = 0;
    let externalFileVersions: number | null = null;
    let attachmentsIncluded = false;

    let copy: DatabaseSync | undefined;
    try {
      copy = new DatabaseSync(resolved, {
        readOnly: true,
        enableForeignKeyConstraints: true,
      });
      integrity = (
        copy.prepare('PRAGMA integrity_check').all() as Array<{
          integrity_check: string;
        }>
      )
        .map((row) => row.integrity_check)
        .join('; ');
      if (integrity !== 'ok') errors.push(`integrity_check: ${integrity}`);
      const fk = copy.prepare('PRAGMA foreign_key_check').all();
      if (fk.length > 0)
        errors.push(`foreign_key_check found ${fk.length} violations`);
      applicationId = (
        copy.prepare('PRAGMA application_id').get() as {
          application_id: number;
        }
      ).application_id;
      if (applicationId !== LAW_OFFICE_APPLICATION_ID) {
        errors.push('file is not a law-office database');
      }
      schemaVersion = (
        copy.prepare('PRAGMA user_version').get() as { user_version: number }
      ).user_version;
      if (schemaVersion < 1) errors.push('backup has no schema version');
      if (schemaVersion > this.options.latestSchemaVersion) {
        errors.push(
          `backup schema ${schemaVersion} is newer than supported ${this.options.latestSchemaVersion}`,
        );
      }

      const tables = new Set(
        (
          copy
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as Array<{
            name: string;
          }>
        ).map((row) => row.name),
      );
      tablesPresent = tables.size;
      for (const required of schemaVersion >= 2
        ? PORTABLE_SCHEMA.tables.map((t) => t.name)
        : REQUIRED_TABLES_V1) {
        if (!tables.has(required)) errors.push(`missing table: ${required}`);
      }

      if (tables.has('app_meta')) {
        const read = (key: string): string | null => {
          const row = copy!
            .prepare('SELECT value FROM app_meta WHERE key = ?')
            .get(key) as { value: string } | undefined;
          return row?.value ?? null;
        };
        deviceId = read('backup.origin_device_id');
        appVersion = read('backup.app_version');
        attachmentsIncluded = read('backup.attachments_included') === '1';
      }
      if (tables.has('document_version')) {
        externalFileVersions = (
          copy
            .prepare(
              "SELECT COUNT(*) AS c FROM document_version WHERE storage_kind = 'local_file' AND deleted_at IS NULL",
            )
            .get() as { c: number }
        ).c;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      copy?.close();
    }

    return {
      valid: errors.length === 0,
      path: resolved,
      errors,
      integrity,
      schemaVersion,
      applicationId,
      sha256,
      checksumSidecarVerified,
      deviceId,
      appVersion,
      tablesPresent,
      attachmentsIncluded,
      externalFileVersions,
    };
  }

  /**
   * Restores into a NEW file. Never overwrites an existing target: if `force`
   * is used, the existing file is renamed to a preserved `.pre-restore-*` path.
   */
  restoreToNewDatabase(
    backupPath: string,
    targetPath: string,
    options: { force?: boolean } = {},
  ): RestoreResult {
    const verification = this.verify(backupPath, {
      requireChecksumSidecar: false,
    });
    if (!verification.valid) {
      throw new BackupError(
        'BACKUP_CORRUPT',
        'backup failed verification; restore aborted',
        {
          errors: verification.errors,
        },
      );
    }
    if (verification.schemaVersion === null) {
      throw new BackupError(
        'BACKUP_INCOMPATIBLE',
        'backup schema version is unknown',
      );
    }

    const target = resolve(targetPath);
    mkdirSync(dirname(target), { recursive: true });
    let previousTargetMovedTo: string | null = null;
    if (existsSync(target)) {
      if (!options.force) {
        throw new BackupError(
          'RESTORE_REQUIRES_EMPTY_DATABASE',
          'restore target already exists; refusing to overwrite it',
          { target },
        );
      }
      const stamp = toCanonicalTimestamp(this.options.clock.now())
        .replace(/[-:]/g, '')
        .replace('T', '-')
        .replace(/\..+$/, '');
      previousTargetMovedTo = `${target}.pre-restore-${stamp}`;
      renameSync(target, previousTargetMovedTo);
    }

    const tempTarget = `${target}.restore-tmp-${newId().slice(0, 8)}`;
    try {
      copyFileSync(resolve(backupPath), tempTarget);
      fsyncPath(tempTarget);
      const restoredHash = sha256File(tempTarget);
      if (verification.sha256 !== restoredHash) {
        throw new BackupError(
          'RESTORE_FAILED',
          'copied backup hash does not match source',
        );
      }
      const restoredCheck = new DatabaseSync(tempTarget, { readOnly: true });
      try {
        const integrity = (
          restoredCheck.prepare('PRAGMA integrity_check').all() as Array<{
            integrity_check: string;
          }>
        )
          .map((row) => row.integrity_check)
          .join('; ');
        if (integrity !== 'ok') {
          throw new BackupError(
            'RESTORE_FAILED',
            `restored copy failed integrity_check: ${integrity}`,
          );
        }
      } finally {
        restoredCheck.close();
      }
      renameSync(tempTarget, target);

      const warning =
        verification.externalFileVersions &&
        verification.externalFileVersions > 0
          ? `${verification.externalFileVersions} document versions point to external files that are not included in the database backup; restore those files separately.`
          : 'Database restored. No external attachment files were recorded as stored in this backup.';
      return {
        targetPath: target,
        sourceBackup: resolve(backupPath),
        previousTargetMovedTo,
        schemaVersion: verification.schemaVersion,
        attachmentsIncluded: false,
        warning,
      };
    } catch (error) {
      try {
        if (existsSync(tempTarget)) unlinkSync(tempTarget);
      } catch {
        // best effort
      }
      if (error instanceof BackupError) throw error;
      throw new BackupError(
        'RESTORE_FAILED',
        'restore failed',
        { target },
        error,
      );
    }
  }

  private readUserVersion(db: DatabaseAdapter): number {
    return (
      db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0
    );
  }

  private countExternalVersions(db: DatabaseAdapter): number {
    return (
      db.get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM document_version WHERE storage_kind = 'local_file' AND deleted_at IS NULL",
      )?.c ?? 0
    );
  }
}

export function sha256File(path: string): string {
  const hash = createHash('sha256');
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const bytes = readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

function fsyncPath(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function readChecksumSidecar(path: string): string | null {
  try {
    const match = /^([0-9a-f]{64})\s{2}/.exec(readFileSync(path, 'utf8'));
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
