import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AppError, classifySqliteError } from '../../errors.ts';
import { LAW_OFFICE_APPLICATION_ID } from '../constants.ts';
import type {
  DatabaseAdapter,
  EngineDescription,
  RunResult,
  SqlParams,
  SqlRow,
  SqlValue,
} from '../adapter.ts';

export interface SqliteAdapterOptions {
  /** File path or `:memory:`. Relative paths are resolved by the caller. */
  readonly path: string;
  readonly readOnly?: boolean;
  readonly busyTimeoutMs?: number;
  readonly enableWal?: boolean;
  readonly synchronous?: 'FULL' | 'NORMAL';
  /** Used only to label the database in diagnostics; never a security boundary. */
  readonly createDirectories?: boolean;
}

function toNumber(value: number | bigint): number {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new AppError('TRANSACTION_FAILED', 'SQLite integer exceeds JavaScript safe range');
    }
    return Number(value);
  }
  return value;
}

function normaliseRow<T extends SqlRow>(row: Record<string, unknown>): T {
  const output: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') output[key] = toNumber(value);
    else if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint'
    ) {
      output[key] = value;
    } else {
      // BLOBs are deliberately not part of the data model. Reject them instead
      // of leaking Uint8Array into JSON snapshots.
      throw new AppError('VALIDATION_FAILED', `unexpected SQLite value type for column ${key}`);
    }
  }
  return output as T;
}

/**
 * Real SQLite adapter using Node's built-in `node:sqlite` (SQLite 3.51+ on
 * Node 22.22). No external service, no cloud dependency, no network access.
 */
export class SqliteDatabase implements DatabaseAdapter {
  readonly engine = 'sqlite' as const;

  private readonly db: DatabaseSync;
  private readonly databasePath: string;
  private readonly memory: boolean;
  private transactionDepth = 0;
  private savepointCounter = 0;
  private closed = false;

  private constructor(databasePath: string, options: SqliteAdapterOptions) {
    this.databasePath = databasePath;
    this.memory = databasePath === ':memory:';
    const readOnly = options.readOnly ?? false;

    if (!this.memory && options.createDirectories !== false && !readOnly) {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.db = new DatabaseSync(databasePath, {
      readOnly,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      timeout: options.busyTimeoutMs ?? 5000,
      readBigInts: false,
    });

    try {
      if (!this.memory && !readOnly) {
        this.db.exec("PRAGMA encoding = 'UTF-8'");
        const journal = options.enableWal === false ? 'DELETE' : 'WAL';
        const actual = this.db.prepare(`PRAGMA journal_mode = ${journal}`).get() as
          | { journal_mode?: string }
          | undefined;
        this.db.exec(`PRAGMA synchronous = ${options.synchronous ?? 'FULL'}`);
        if (journal === 'WAL' && actual?.journal_mode?.toLowerCase() !== 'wal') {
          // A network share or filesystem that cannot do WAL still works, but
          // the caller must know that concurrent-process performance differs.
          this.db.exec('PRAGMA synchronous = FULL');
        }
      }
      this.db.exec('PRAGMA foreign_keys = ON');
      this.db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.busyTimeoutMs ?? 5000))}`);
      const fk = this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number } | undefined;
      if (fk?.foreign_keys !== 1) {
        throw new AppError('UNSUPPORTED_ENGINE', 'SQLite foreign key enforcement could not be enabled');
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  static open(options: SqliteAdapterOptions): SqliteDatabase {
    const raw = options.path;
    const databasePath = raw === ':memory:' ? raw : resolve(raw);
    return new SqliteDatabase(databasePath, options);
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  get path(): string {
    return this.databasePath;
  }

  exec(sql: string): void {
    this.assertOpen();
    this.db.exec(sql);
  }

  query<T extends SqlRow = SqlRow>(sql: string, params: SqlParams = []): T[] {
    this.assertOpen();
    const statement = this.db.prepare(sql);
    const rows = statement.all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => normaliseRow<T>(row));
  }

  get<T extends SqlRow = SqlRow>(sql: string, params: SqlParams = []): T | undefined {
    this.assertOpen();
    const statement = this.db.prepare(sql);
    const row = statement.get(...params) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : normaliseRow<T>(row);
  }

  run(sql: string, params: SqlParams = []): RunResult {
    this.assertOpen();
    const statement = this.db.prepare(sql);
    const result = statement.run(...params);
    return {
      changes: toNumber(result.changes),
      lastInsertRowid: toNumber(result.lastInsertRowid),
    };
  }

  transaction<T>(fn: (tx: DatabaseAdapter) => T): T {
    this.assertOpen();
    const nested = this.transactionDepth > 0;
    const savepoint = nested ? `sp_${++this.savepointCounter}` : '';

    if (nested) this.db.exec(`SAVEPOINT ${savepoint}`);
    else this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth += 1;

    let result: T;
    let settled = false;
    try {
      result = fn(this);
      if (result !== null && typeof result === 'object' && 'then' in result) {
        throw new AppError(
          'TRANSACTION_FAILED',
          'transaction callback must be synchronous; use one transaction per write operation',
        );
      }
      if (nested) this.db.exec(`RELEASE ${savepoint}`);
      else this.db.exec('COMMIT');
      settled = true;
      return result;
    } catch (error) {
      try {
        if (this.db.isTransaction) {
          if (nested) this.db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
          else this.db.exec('ROLLBACK');
        }
      } catch {
        // Preserve the original failure; a failed rollback surfaces through the
        // subsequent integrity check / recovery procedure.
      }
      throw error instanceof AppError ? error : classifySqliteError(error);
    } finally {
      this.transactionDepth = Math.max(0, this.transactionDepth - 1);
      if (!settled && this.transactionDepth === 0 && this.db.isTransaction) {
        this.db.exec('ROLLBACK');
      }
    }
  }

  describe(): EngineDescription {
    this.assertOpen();
    const version = this.db.prepare('SELECT sqlite_version() AS version').get() as {
      version: string;
    };
    const journal = this.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    const fk = this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    return {
      engine: 'sqlite',
      engineVersion: version.version,
      journalMode: journal.journal_mode,
      foreignKeys: fk.foreign_keys === 1,
      pathKind: this.memory ? 'memory' : 'file',
    };
  }

  /** Application identity is set only when a new database is initialised. */
  readApplicationId(): number {
    const row = this.get<{ application_id: number }>('PRAGMA application_id');
    return row?.application_id ?? 0;
  }

  readUserVersion(): number {
    const row = this.get<{ user_version: number }>('PRAGMA user_version');
    return row?.user_version ?? 0;
  }

  setApplicationId(): void {
    this.exec(`PRAGMA application_id = ${LAW_OFFICE_APPLICATION_ID}`);
  }

  setUserVersion(version: number): void {
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new AppError('VALIDATION_FAILED', 'invalid schema version');
    }
    this.exec(`PRAGMA user_version = ${version}`);
  }

  quickCheck(): string {
    const rows = this.query<{ quick_check: string }>('PRAGMA quick_check');
    return rows.map((row) => row.quick_check).join('; ');
  }

  integrityCheck(): string {
    const rows = this.query<{ integrity_check: string }>('PRAGMA integrity_check');
    return rows.map((row) => row.integrity_check).join('; ');
  }

  foreignKeyViolations(): Array<Record<string, SqlValue>> {
    return this.query('PRAGMA foreign_key_check');
  }

  /** Checkpoint WAL before file-level operations (copy/backup). */
  checkpoint(): void {
    this.assertOpen();
    if (!this.memory) this.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  /**
   * Consistent physical snapshot via `VACUUM INTO`, safe while the database is
   * open and in WAL mode. The destination must not exist.
   */
  vacuumInto(destination: string): void {
    this.assertOpen();
    this.db.prepare('VACUUM INTO ?').run(destination);
  }

  close(): void {
    if (this.closed) return;
    if (this.db.isTransaction) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore: close below
      }
    }
    this.db.close();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new AppError('TRANSACTION_FAILED', 'database is closed');
  }

  static readonly applicationId = LAW_OFFICE_APPLICATION_ID;
}
