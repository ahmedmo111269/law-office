/**
 * Storage-engine boundary.
 *
 * Application code depends on this interface, never on `node:sqlite` (or any
 * browser database API) directly. A second adapter (IndexedDB for the web/PWA
 * target) can implement the same contract later without touching repositories.
 *
 * Important: SQL text itself is engine-specific. Repositories that need a
 * second engine must either be written against the portable SQL subset or be
 * implemented per profile. This is documented rather than hidden behind a
 * misleading "SQLite on the web" claim.
 */

export type SqlValue = string | number | bigint | null;

export type SqlRow = Readonly<Record<string, SqlValue>>;

export type SqlParams = ReadonlyArray<SqlValue>;

export interface RunResult {
  readonly changes: number;
  readonly lastInsertRowid: number;
}

export interface EngineDescription {
  readonly engine: 'sqlite' | 'indexeddb';
  readonly engineVersion: string;
  readonly journalMode: string;
  readonly foreignKeys: boolean;
  readonly pathKind: 'memory' | 'file' | 'browser';
}

/**
 * A synchronous transactional database handle. Synchronous APIs are chosen on
 * purpose for the desktop/mobile SQLite profile: a local transaction must not
 * be interleaved with unrelated writes, and repositories should be easy to
 * audit for atomicity.
 */
export interface DatabaseAdapter {
  readonly engine: 'sqlite' | 'indexeddb';
  readonly isOpen: boolean;

  exec(sql: string): void;

  query<T extends SqlRow = SqlRow>(sql: string, params?: SqlParams): T[];

  get<T extends SqlRow = SqlRow>(sql: string, params?: SqlParams): T | undefined;

  run(sql: string, params?: SqlParams): RunResult;

  /**
   * Runs `fn` atomically. Commits when it returns, rolls back when it throws.
   * Nested calls use savepoints. Returning a Promise is rejected: an async
   * callback would otherwise commit before its work completed.
   */
  transaction<T>(fn: (tx: DatabaseAdapter) => T): T;

  describe(): EngineDescription;

  close(): void;
}
