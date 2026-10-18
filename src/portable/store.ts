/**
 * Engine-neutral table store used by the portable data layer.
 *
 * Two real implementations exist:
 *  - `IndexedDbStore` (browser/PWA) backed by actual IndexedDB object stores;
 *  - `SqlitePortableStore` (desktop/tests) bridging to the SQLite adapter.
 *
 * Both expose the same asynchronous contract so a single repository
 * implementation enforces identical validation, numbering, audit, outbox and
 * search semantics on both engines.
 */
import type { DatabaseAdapter } from '../db/adapter.ts';
import type { IndexedDbDatabase } from '../db/indexeddb/indexeddb-adapter.ts';
import { AppError } from '../errors.ts';
import { PORTABLE_SCHEMA } from '../schema/v1/portable-schema.ts';
import { primaryKeyOf, type PortableSchema, type PortableTable } from '../schema/portable-types.ts';
import type { Row } from './expression.ts';

export type EngineRow = Record<string, string | number | null>;

export interface PortableTransaction {
  get(table: string, key: string | readonly string[]): Promise<EngineRow | undefined>;
  getAll(table: string): Promise<EngineRow[]>;
  getByIndex(table: string, indexName: string, value: string | number): Promise<EngineRow[]>;
  /** Equality lookup by columns; avoids depending on SQLite autoindex names. */
  getByColumns(table: string, values: Readonly<Record<string, string | number>>): Promise<EngineRow[]>;
  count(table: string): Promise<number>;
  put(table: string, row: EngineRow): Promise<void>;
  delete(table: string, key: string | readonly string[]): Promise<void>;
  clear(table: string): Promise<void>;
}

export interface PortableStore extends PortableTransaction {
  readonly engine: 'sqlite' | 'indexeddb';
  readonly schema: PortableSchema;
  transaction<T>(tables: readonly string[], fn: (tx: PortableTransaction) => Promise<T>): Promise<T>;
  exportAll(): Promise<Record<string, EngineRow[]>>;
  importAll(data: Record<string, EngineRow[]>): Promise<void>;
  describe(): { engine: string; engineVersion: string; journalMode: string; foreignKeys: boolean; pathKind: string };
  close(): Promise<void>;
}

function tableDef(schema: PortableSchema, name: string): PortableTable {
  const table = schema.tables.find((candidate) => candidate.name === name);
  if (!table) throw new AppError('VALIDATION_FAILED', `unknown table ${name}`);
  return table;
}

function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new AppError('VALIDATION_FAILED', `unsafe identifier ${name}`);
  }
  return `"${name}"`;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/** SQLite-backed implementation of the portable contract. */
export class SqlitePortableStore implements PortableStore {
  readonly engine = 'sqlite' as const;
  readonly schema: PortableSchema;

  private readonly db: DatabaseAdapter;
  private depth = 0;

  constructor(db: DatabaseAdapter, schema: PortableSchema = PORTABLE_SCHEMA) {
    this.db = db;
    this.schema = schema;
  }

  async get(table: string, key: string | readonly string[]): Promise<EngineRow | undefined> {
    const def = tableDef(this.schema, table);
    const keys = Array.isArray(key) ? [...key] : [key as string];
    const where = def.primaryKey.map((column) => `${identifier(column)} = ?`).join(' AND ');
    return this.db.get<EngineRow>(
      `SELECT * FROM ${identifier(table)} WHERE ${where}`,
      keys as string[],
    );
  }

  async getAll(table: string): Promise<EngineRow[]> {
    tableDef(this.schema, table);
    return this.db.query<EngineRow>(`SELECT * FROM ${identifier(table)}`);
  }

  async getByIndex(
    table: string,
    indexName: string,
    value: string | number,
  ): Promise<EngineRow[]> {
    const def = tableDef(this.schema, table);
    const index = def.indexes.find((candidate) => candidate.name === indexName);
    if (!index || index.columns.length === 0) {
      throw new AppError('VALIDATION_FAILED', `unknown index ${indexName} on ${table}`);
    }
    return this.db.query<EngineRow>(
      `SELECT * FROM ${identifier(table)} WHERE ${identifier(index.columns[0]!)} = ?`,
      [value],
    );
  }

  async getByColumns(
    table: string,
    values: Readonly<Record<string, string | number>>,
  ): Promise<EngineRow[]> {
    tableDef(this.schema, table);
    const entries = Object.entries(values);
    if (entries.length === 0) return [];
    return this.db.query<EngineRow>(
      `SELECT * FROM ${identifier(table)} WHERE ${entries
        .map(([column]) => `${identifier(column)} = ?`)
        .join(' AND ')}`,
      entries.map(([, value]) => value),
    );
  }

  async count(table: string): Promise<number> {
    tableDef(this.schema, table);
    return this.db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${identifier(table)}`)?.c ?? 0;
  }

  async put(table: string, row: EngineRow): Promise<void> {
    const def = tableDef(this.schema, table);
    const columns = def.columns.map((column) => column.name).filter((name) => name in row);
    if (columns.length === 0) throw new AppError('VALIDATION_FAILED', 'row has no known columns');
    const values = columns.map((column) => row[column] ?? null);
    const updates = columns
      .filter((column) => !def.primaryKey.includes(column))
      .map((column) => `${identifier(column)} = excluded.${identifier(column)}`);
    const conflict = def.primaryKey.map(identifier).join(', ');
    const sql =
      `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(', ')})\n` +
      `VALUES (${placeholders(columns.length)})\n` +
      (updates.length > 0
        ? `ON CONFLICT (${conflict}) DO UPDATE SET ${updates.join(', ')}`
        : `ON CONFLICT (${conflict}) DO NOTHING`);
    this.db.run(sql, values);
  }

  async delete(table: string, key: string | readonly string[]): Promise<void> {
    const def = tableDef(this.schema, table);
    const keys = Array.isArray(key) ? [...key] : [key as string];
    this.db.run(
      `DELETE FROM ${identifier(table)} WHERE ${def.primaryKey
        .map((column) => `${identifier(column)} = ?`)
        .join(' AND ')}`,
      keys as string[],
    );
  }

  async clear(table: string): Promise<void> {
    tableDef(this.schema, table);
    this.db.exec(`DELETE FROM ${identifier(table)}`);
  }

  async transaction<T>(
    tables: readonly string[],
    fn: (tx: PortableTransaction) => Promise<T>,
  ): Promise<T> {
    void tables;
    if (this.depth > 0) return fn(this);
    this.db.exec('BEGIN IMMEDIATE');
    this.depth += 1;
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // SQLite may already have rolled back on fatality.
      }
      throw error;
    } finally {
      this.depth = Math.max(0, this.depth - 1);
    }
  }

  async exportAll(): Promise<Record<string, EngineRow[]>> {
    const data: Record<string, EngineRow[]> = {};
    for (const table of this.schema.tables) data[table.name] = await this.getAll(table.name);
    return data;
  }

  /**
   * Replaces the database contents with a portable backup.
   *
   * SQLite guards (append-only triggers, immediate foreign keys) are designed
   * against accidental writes, not against a verified restore. They are
   * suspended for the duration of this explicitly-invoked maintenance
   * operation and recreated afterwards; FTS is rebuilt from the restored
   * search documents. The operation is atomic.
   */
  async importAll(data: Record<string, EngineRow[]>): Promise<void> {
    if (this.depth > 0) {
      throw new AppError('INVALID_STATE', 'restore cannot run inside another transaction');
    }
    const triggers = this.db.query<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL",
    );
    const hasFts = Boolean(
      this.db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE name = 'search_fts'"),
    );
    this.db.exec('PRAGMA foreign_keys = OFF');
    try {
      this.db.exec('BEGIN IMMEDIATE');
      for (const trigger of triggers) this.db.exec(`DROP TRIGGER ${identifier(trigger.name)}`);
      for (const table of this.schema.tables) this.db.exec(`DELETE FROM ${identifier(table.name)}`);
      for (const tableName of dependencyOrder(this.schema.tables)) {
        const rows = data[tableName];
        if (!rows) continue;
        for (const row of rows) {
          const table = this.schema.tables.find((candidate) => candidate.name === tableName)!;
          const columns = table.columns
            .map((column) => column.name)
            .filter((column) => column in row);
          if (columns.length === 0) continue;
          this.db.run(
            `INSERT INTO ${identifier(tableName)} (${columns.map(identifier).join(', ')})
             VALUES (${placeholders(columns.length)})`,
            columns.map((column) => row[column] ?? null),
          );
        }
      }
      for (const trigger of triggers) this.db.exec(trigger.sql);
      if (hasFts) {
        this.db.exec("INSERT INTO search_fts(search_fts) VALUES('rebuild')");
      }
      const violations = this.db.query<Record<string, string | number>>('PRAGMA foreign_key_check');
      if (violations.length > 0) {
        throw new AppError('RESTORE_FAILED', 'restored data has foreign key violations', {
          violations: violations.slice(0, 20),
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // transaction may already be closed
      }
      throw error;
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON');
    }
  }

  describe(): { engine: string; engineVersion: string; journalMode: string; foreignKeys: boolean; pathKind: string } {
    return this.db.describe();
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/** IndexedDB-backed implementation of the same contract. */
export class IndexedDbStore implements PortableStore {
  readonly engine = 'indexeddb' as const;
  readonly schema: PortableSchema;

  private readonly db: IndexedDbDatabase;

  constructor(db: IndexedDbDatabase) {
    this.db = db;
    this.schema = db.schema;
  }

  get(table: string, key: string | readonly string[]): Promise<EngineRow | undefined> {
    return this.db.get(table, key);
  }

  getAll(table: string): Promise<EngineRow[]> {
    return this.db.getAll(table);
  }

  getByIndex(table: string, indexName: string, value: string | number): Promise<EngineRow[]> {
    return this.db.getByIndex(table, indexName, value);
  }

  getByColumns(
    table: string,
    values: Readonly<Record<string, string | number>>,
  ): Promise<EngineRow[]> {
    return this.db.getByColumns(table, values);
  }

  count(table: string): Promise<number> {
    return this.db.count(table);
  }

  put(table: string, row: EngineRow): Promise<void> {
    return this.db.put(table, row);
  }

  delete(table: string, key: string | readonly string[]): Promise<void> {
    return this.db.delete(table, key);
  }

  clear(table: string): Promise<void> {
    return this.db.clear(table);
  }

  transaction<T>(
    tables: readonly string[],
    fn: (tx: PortableTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(tables, async (tx) => {
      const adapter: PortableTransaction = {
        get: (table, key) => tx.get(table, key),
        getAll: (table) => tx.getAll(table),
        getByIndex: (table, index, value) => tx.getByIndex(table, index, value),
        getByColumns: (table, values) => tx.getByColumns(table, values),
        count: (table) => tx.count(table),
        put: (table, row) => tx.put(table, row),
        delete: (table, key) => tx.delete(table, key),
        clear: (table) => tx.clear(table),
      };
      return fn(adapter);
    });
  }

  async exportAll(): Promise<Record<string, EngineRow[]>> {
    const data: Record<string, EngineRow[]> = {};
    for (const table of this.schema.tables) data[table.name] = await this.getAll(table.name);
    return data;
  }

  /**
   * Replaces the database contents with a portable backup.
   *
   * SQLite guards (append-only triggers, immediate foreign keys) are designed
   * against accidental writes, not against a verified restore. They are
   * suspended for the duration of this explicitly-invoked maintenance
   * operation and recreated afterwards; FTS is rebuilt from the restored
   * search documents. The operation is atomic.
   */
  async importAll(data: Record<string, EngineRow[]>): Promise<void> {
    await this.transaction(
      this.schema.tables.map((table) => table.name),
      async (tx) => {
        for (const table of this.schema.tables) {
          const rows = data[table.name];
          if (!rows) continue;
          await tx.clear(table.name);
          for (const row of rows) await tx.put(table.name, row);
        }
      },
    );
  }

  describe(): { engine: string; engineVersion: string; journalMode: string; foreignKeys: boolean; pathKind: string } {
    return this.db.describe();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  /** Structural verification specific to the IndexedDB engine. */
  integrityCheck(): Promise<{ ok: boolean; errors: string[]; tables: number; indexes: number }> {
    return this.db.integrityCheck();
  }
}

/** Parents before children, using the declared foreign keys (self references ignored). */
function dependencyOrder(tables: readonly PortableTable[]): string[] {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const ordered: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (name: string): void => {
    const current = state.get(name);
    if (current === 'done' || current === 'visiting') return;
    state.set(name, 'visiting');
    const table = byName.get(name);
    for (const foreignKey of table?.foreignKeys ?? []) {
      if (foreignKey.referencedTable === name) continue;
      if (byName.has(foreignKey.referencedTable)) visit(foreignKey.referencedTable);
    }
    state.set(name, 'done');
    ordered.push(name);
  };
  for (const table of tables) visit(table.name);
  return ordered;
}

export function keyColumns(table: PortableTable): readonly string[] {
  return table.primaryKey;
}

export function rowKey(table: PortableTable, row: Row): string {
  if (table.primaryKey.length === 1) return String(row[primaryKeyOf(table)] ?? '');
  return table.primaryKey.map((column) => String(row[column] ?? '')).join('\u0000');
}
