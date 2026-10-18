import { createHash } from 'node:crypto';
import { AppError, MigrationError } from '../../errors.ts';
import { LAW_OFFICE_APPLICATION_ID } from '../constants.ts';
import type { Clock } from '../../util/clock.ts';
import { toCanonicalTimestamp } from '../../util/dates.ts';
import { stableStringify } from '../../util/stable.ts';
import { newId } from '../../util/uuid.ts';
import type { DatabaseAdapter, SqlRow } from '../adapter.ts';
import { detectFts5 } from '../capabilities.ts';
import type { Migration, MigrationResult } from './types.ts';

interface AppliedMigrationRow extends SqlRow {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly applied_at: string;
}

export interface MigrationManagerOptions {
  readonly clock: Clock;
  readonly appVersion: string;
  readonly migrations: readonly Migration[];
  /**
   * Called before applying an upgrade to an existing database (never for the
   * first initialisation). It must return the path of a verified backup.
   */
  readonly preMigrationBackup?: (info: {
    fromVersion: number;
    toVersion: number;
    migrationName: string;
  }) => string;
}

export interface MigrationStatus {
  readonly currentVersion: number;
  readonly latestVersion: number;
  readonly pending: readonly number[];
  readonly initialised: boolean;
}

const CHECKSUM_RE = /^[0-9a-f]{64}$/;

function assertValidMigrations(migrations: readonly Migration[]): readonly Migration[] {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  sorted.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new MigrationError(
        `Migration versions must be contiguous starting at 1; found ${migration.version} at position ${index + 1}`,
      );
    }
    if (!CHECKSUM_RE.test(migration.checksum)) {
      throw new MigrationError(`Migration ${migration.version} has an invalid checksum`);
    }
    if (!migration.name || migration.name.length > 100) {
      throw new MigrationError(`Migration ${migration.version} has an invalid name`);
    }
  });
  return sorted;
}

/**
 * Deterministic migration runner:
 *  - one transaction per migration (DDL + seed + history row + user_version),
 *  - checksum verification on every open,
 *  - refuses to initialise over unknown tables,
 *  - never deletes an existing database to "fix" a failure,
 *  - records a failure row when the history table already exists.
 */
export class MigrationManager {
  private readonly adapter: DatabaseAdapter;
  private readonly options: MigrationManagerOptions;
  private readonly migrations: readonly Migration[];

  constructor(adapter: DatabaseAdapter, options: MigrationManagerOptions) {
    this.adapter = adapter;
    this.options = options;
    this.migrations = assertValidMigrations(options.migrations);
  }

  get latestVersion(): number {
    return this.migrations.length;
  }

  hasSchemaHistoryTable(): boolean {
    return (
      this.adapter.get(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'",
      ) !== undefined
    );
  }

  private userTableNames(): string[] {
    return this.adapter
      .query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .map((row) => row.name);
  }

  readUserVersion(): number {
    return this.adapter.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  }

  readApplicationId(): number {
    return this.adapter.get<{ application_id: number }>('PRAGMA application_id')?.application_id ?? 0;
  }

  appliedRows(): AppliedMigrationRow[] {
    if (!this.hasSchemaHistoryTable()) return [];
    return this.adapter.query<AppliedMigrationRow>(
      'SELECT version, name, checksum, applied_at FROM schema_migration ORDER BY version',
    );
  }

  currentVersion(): number {
    const rows = this.appliedRows();
    return rows.length === 0 ? 0 : (rows[rows.length - 1]?.version ?? 0);
  }

  status(): MigrationStatus {
    const currentVersion = this.currentVersion();
    return {
      currentVersion,
      latestVersion: this.latestVersion,
      pending: this.migrations
        .filter((migration) => migration.version > currentVersion)
        .map((migration) => migration.version),
      initialised: this.hasSchemaHistoryTable(),
    };
  }

  verifyHistory(): void {
    const applied = this.appliedRows();
    if (applied.length === 0) {
      if (this.readUserVersion() !== 0) {
        throw new MigrationError('PRAGMA user_version is set but no migration history exists');
      }
      return;
    }

    const latest = this.latestVersion;
    const userVersion = this.readUserVersion();
    if (userVersion > latest) {
      throw new AppError('SCHEMA_TOO_NEW', 'database schema is newer than this application', {
        databaseVersion: userVersion,
        applicationVersion: latest,
      });
    }

    const byVersion = new Map(this.migrations.map((migration) => [migration.version, migration]));
    for (const row of applied) {
      const migration = byVersion.get(row.version);
      if (!migration) {
        throw new MigrationError(
          `database contains migration ${row.version}, which is not known to this application`,
        );
      }
      if (migration.checksum !== row.checksum) {
        throw new AppError(
          'MIGRATION_CHECKSUM_MISMATCH',
          `migration ${row.version} checksum does not match the stored checksum`,
          { version: row.version, appliedChecksum: row.checksum, codeChecksum: migration.checksum },
        );
      }
      if (migration.name !== row.name) {
        throw new MigrationError(
          `migration ${row.version} name mismatch: stored "${row.name}", code "${migration.name}"`,
        );
      }
    }

    const currentVersion = applied[applied.length - 1]?.version ?? 0;
    if (userVersion !== currentVersion) {
      throw new MigrationError(
        `PRAGMA user_version (${userVersion}) does not match migration history (${currentVersion})`,
      );
    }
  }

  migrate(): MigrationResult {
    const applicationId = this.readApplicationId();
    const tables = this.userTableNames();
    const initialised = this.hasSchemaHistoryTable();

    if (!initialised) {
      if (tables.length > 0) {
        throw new MigrationError(
          'database already contains tables but no migration history; refusing to initialise over unknown data',
          { tables },
        );
      }
      if (applicationId !== 0) {
        throw new MigrationError('database has an application id but no migration history', {
          applicationId,
        });
      }
    } else if (applicationId !== 0 && applicationId !== LAW_OFFICE_APPLICATION_ID) {
      throw new AppError('UNSUPPORTED_ENGINE', 'this file is not a law-office database', {
        applicationId,
      });
    }

    this.verifyHistory();

    const currentVersion = this.currentVersion();
    if (currentVersion > this.latestVersion) {
      throw new AppError('SCHEMA_TOO_NEW', 'database schema is newer than this application');
    }

    const pending = this.migrations.filter((migration) => migration.version > currentVersion);
    if (pending.length === 0) {
      if (!initialised && this.latestVersion === 0) {
        throw new MigrationError('no migrations are defined');
      }
      return {
        fromVersion: currentVersion,
        toVersion: currentVersion,
        applied: [],
        preMigrationBackupPath: null,
      };
    }

    if (!initialised && this.latestVersion > 0 && pending[0]?.version !== 1) {
      throw new MigrationError('an uninitialised database must start with migration 1');
    }

    if (applicationId === 0) {
      // Safe here: either a brand-new file or an already-verified empty schema.
      this.adapter.exec(`PRAGMA application_id = ${LAW_OFFICE_APPLICATION_ID}`);
    }

    const now = toCanonicalTimestamp(this.options.clock.now());
    const capabilities = { fts5: detectFts5(this.adapter) };
    const applied: Array<{ version: number; name: string; executionMs: number }> = [];
    let backupPath: string | null = null;

    for (const migration of pending) {
      const fromVersion = this.currentVersion();
      if (fromVersion > 0 && this.options.preMigrationBackup) {
        try {
          backupPath = this.options.preMigrationBackup({
            fromVersion,
            toVersion: migration.version,
            migrationName: migration.name,
          });
        } catch (error) {
          throw new MigrationError(
            `pre-migration backup failed before migration ${migration.version}; nothing was changed`,
            { version: migration.version },
            error,
          );
        }
      }

      const started = this.options.clock.now().getTime();
      try {
        this.adapter.transaction((tx) => {
          migration.up(tx, {
            now,
            appVersion: this.options.appVersion,
            capabilities,
          });
          const elapsed = this.options.clock.now().getTime() - started;
          tx.run(
            `INSERT INTO schema_migration
              (version, name, description, checksum, applied_at, execution_ms, app_version, backup_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              migration.version,
              migration.name,
              migration.descriptionAr,
              migration.checksum,
              toCanonicalTimestamp(this.options.clock.now()),
              elapsed,
              this.options.appVersion,
              backupPath,
            ],
          );
          tx.exec(`PRAGMA user_version = ${migration.version}`);
          tx.run(
            `INSERT INTO app_meta (key, value, updated_at) VALUES ('schema.version', ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [String(migration.version), now],
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.recordFailure(migration, message, backupPath, now);
        throw new MigrationError(
          `migration ${migration.version} (${migration.name}) failed and was rolled back`,
          { version: migration.version, causes: message },
          error,
        );
      }
      applied.push({
        version: migration.version,
        name: migration.name,
        executionMs: this.options.clock.now().getTime() - started,
      });
    }

    this.verifyHistory();

    return {
      fromVersion: currentVersion,
      toVersion: this.currentVersion(),
      applied,
      preMigrationBackupPath: backupPath,
    };
  }

  private recordFailure(
    migration: Migration,
    message: string,
    backupPath: string | null,
    now: string,
  ): void {
    if (!this.hasSchemaHistoryTable()) return;
    try {
      this.adapter.run(
        `INSERT INTO migration_failure
          (id, version, name, failed_at, message, details_json, backup_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          migration.version,
          migration.name,
          now,
          message.slice(0, 2000),
          stableStringify({ version: migration.version, name: migration.name, message }),
          backupPath,
        ],
      );
    } catch {
      // Failure recording must never mask the original migration error.
    }
  }
}

export function checksumOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
