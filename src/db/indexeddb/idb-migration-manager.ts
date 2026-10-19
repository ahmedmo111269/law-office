/**
 * Migration manager for the IndexedDB profile.
 *
 * Structural changes are performed by the browser's own `upgradeneeded` when
 * the IndexedDB version increases. Data migrations are ordinary async
 * transactions. Every applied migration is recorded in the shared
 * `schema_migration` table (the same table the SQLite profile uses), so a
 * logical backup carries its own migration history on both engines.
 */
import { schemaChecksum, type IndexedDbDatabase } from './indexeddb-adapter.ts';
import { AppError } from '../../errors.ts';
import { PORTABLE_SCHEMA as BASELINE_SCHEMA } from '../../schema/v1/portable-schema.ts';
import { PORTABLE_SCHEMA } from '../../schema/current.ts';
import { CASE_SYSTEM_IDB_MIGRATION } from './case-system-migration.ts';
import type { PortableTransaction } from '../../portable/store.ts';
import { toCanonicalTimestamp } from '../../util/dates.ts';

export interface IdbMigrationContext {
  readonly tx: PortableTransaction;
  readonly now: string;
  readonly appVersion: string;
}

export interface IdbMigration {
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly checksum?: string;
  up(context: IdbMigrationContext): Promise<void>;
}

export interface MigrationRecord {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly applied_at: string;
}

export class IdbMigrationManager {
  private readonly db: IndexedDbDatabase;
  private readonly migrations: readonly IdbMigration[];
  private readonly appVersion: string;
  private readonly clock: () => Date;

  constructor(
    db: IndexedDbDatabase,
    options: {
      migrations?: readonly IdbMigration[];
      appVersion?: string;
      clock?: () => Date;
    } = {},
  ) {
    this.db = db;
    this.migrations = [
      ...(options.migrations ?? [CASE_SYSTEM_IDB_MIGRATION]),
    ].sort((left, right) => left.version - right.version);
    this.appVersion = options.appVersion ?? '0.3.0';
    this.clock = options.clock ?? (() => new Date());
  }

  private now(): string {
    return toCanonicalTimestamp(this.clock());
  }

  async applied(): Promise<MigrationRecord[]> {
    const rows = await this.db.getAll('schema_migration');
    return rows
      .map((row) => ({
        version: Number(row.version),
        name: String(row.name),
        checksum: String(row.checksum),
        applied_at: String(row.applied_at),
      }))
      .sort((left, right) => left.version - right.version);
  }

  /**
   * Records the baseline schema (version 1) on a freshly created database.
   * Safe to call repeatedly: the checksum is verified, not overwritten.
   */
  async ensureBaseline(): Promise<MigrationRecord> {
    const existing = await this.db.get(
      'schema_migration',
      1 as unknown as string,
    );
    if (existing) {
      this.assertChecksum(existing);
      return {
        version: 1,
        name: String(existing.name),
        checksum: String(existing.checksum),
        applied_at: String(existing.applied_at),
      };
    }
    const meta = await this.db.readMeta();
    const appliedAt = meta.created_at ?? this.now();
    const checksum = schemaChecksum(BASELINE_SCHEMA);
    await this.db.transaction(['schema_migration'], async (tx) => {
      await tx.put('schema_migration', {
        version: 1,
        name: '0001_initial',
        description: 'Initial portable schema (57 tables)',
        checksum,
        applied_at: appliedAt,
        execution_ms: 0,
        app_version: this.appVersion,
        backup_path: null,
      });
    });
    return {
      version: 1,
      name: '0001_initial',
      checksum,
      applied_at: appliedAt,
    };
  }

  /** Applies pending data migrations in version order. */
  async migrate(): Promise<{ applied: MigrationRecord[]; pending: number }> {
    await this.ensureBaseline();
    const current = await this.applied();
    for (const record of current) {
      const known = this.migrations.find((m) => m.version === record.version);
      if (known && record.checksum !== migrationChecksum(known))
        throw new AppError(
          'MIGRATION_CHECKSUM_MISMATCH',
          `migration ${record.version} checksum mismatch`,
        );
      if (record.version > PORTABLE_SCHEMA.schemaVersion)
        throw new AppError(
          'SCHEMA_TOO_NEW',
          'database is newer than this application',
        );
    }
    const currentVersion = current.reduce(
      (max, record) => Math.max(max, record.version),
      0,
    );
    const pending = this.migrations.filter(
      (migration) => migration.version > currentVersion,
    );
    const applied: MigrationRecord[] = [];
    for (const migration of pending) {
      const started = Date.now();
      const checksum = migrationChecksum(migration);
      await this.db.transaction(
        [...PORTABLE_SCHEMA.tables.map((table) => table.name)],
        async (tx) => {
          await migration.up({
            tx,
            now: this.now(),
            appVersion: this.appVersion,
          });
          await tx.put('schema_migration', {
            version: migration.version,
            name: migration.name,
            description: migration.description,
            checksum,
            applied_at: this.now(),
            execution_ms: Date.now() - started,
            app_version: this.appVersion,
            backup_path: null,
          });
        },
      );
      applied.push({
        version: migration.version,
        name: migration.name,
        checksum,
        applied_at: this.now(),
      });
    }
    return { applied, pending: pending.length };
  }

  async verify(): Promise<{
    valid: boolean;
    errors: string[];
    currentVersion: number;
  }> {
    const errors: string[] = [];
    const records = await this.applied();
    if (records.length === 0) errors.push('no migration records');
    for (const record of records) {
      if (record.version === 1) {
        const expected = schemaChecksum(BASELINE_SCHEMA);
        if (record.checksum !== expected) {
          errors.push(
            `baseline checksum ${record.checksum} does not match schema ${expected}`,
          );
        }
      }
    }
    const expectedVersions = new Set(records.map((record) => record.version));
    for (const migration of this.migrations) {
      const applied = records.find((r) => r.version === migration.version);
      if (applied && applied.checksum !== migrationChecksum(migration))
        errors.push(`migration ${migration.version} checksum mismatch`);
      if (!expectedVersions.has(migration.version))
        errors.push(`migration ${migration.version} not applied`);
    }
    const currentVersion = records.reduce(
      (max, record) => Math.max(max, record.version),
      0,
    );
    return { valid: errors.length === 0, errors, currentVersion };
  }

  private assertChecksum(row: Record<string, string | number | null>): void {
    const expected = schemaChecksum(BASELINE_SCHEMA);
    if (String(row.checksum) !== expected) {
      throw new AppError(
        'MIGRATION_CHECKSUM_MISMATCH',
        `stored schema checksum ${row.checksum} does not match the running schema ${expected}`,
      );
    }
  }
}

function migrationChecksum(migration: IdbMigration): string {
  if (migration.checksum) return migration.checksum;
  const text = `${migration.version}|${migration.name}|${migration.description}|${migration.up.toString()}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
