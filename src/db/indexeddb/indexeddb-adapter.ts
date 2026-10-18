/**
 * Real IndexedDB storage engine for the PWA profile.
 *
 * One IndexedDB database holds one object store per schema table, keyed by the
 * table's primary key, with an index for every SQL index. SQLite-specific
 * features (SQL, triggers, partial indexes, FTS5) are not available here; the
 * portable layer enforces the same logical constraints explicitly and the
 * differences are documented in docs/local-storage-implementation.md.
 *
 * The API is asynchronous because IndexedDB is. No network access, no server,
 * no service worker requirement.
 */
import { AppError } from '../../errors.ts';
import { PORTABLE_SCHEMA } from '../../schema/v1/portable-schema.ts';
import type { PortableSchema, PortableTable } from '../../schema/portable-types.ts';
import { compileCheck, type CompiledCheck, type Row } from '../../portable/expression.ts';
import {
  compareRows,
  indexRangeFilter,
  matchesFilters,
  normalizeQuery,
  orderIndex,
  type QueryOptions,
  type QueryPage,
} from '../../portable/query.ts';

export const IDB_APPLICATION_ID = 0x4c41574f;
export const IDB_SCHEMA_VERSION = 1;
export const IDB_META_STORE = '_meta';
export const IDB_MIGRATION_STORE = '_schema_migration';
const INTERNAL_STORES = [IDB_META_STORE, IDB_MIGRATION_STORE] as const;

export type IdbRow = Record<string, string | number | null>;

export interface IdbOpenOptions {
  /** Database name; one office database per browser profile. */
  readonly name?: string;
  /** Injectable factory, used by tests (`fake-indexeddb`). */
  readonly factory?: IDBFactory;
  /** Simulated quota/failure injection for tests. */
  readonly schema?: PortableSchema;
}

export interface IdbTableInfo {
  readonly name: string;
  readonly primaryKey: readonly string[];
  readonly indexes: readonly string[];
  readonly rowCount: number;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function normalizeKey(key: string | readonly string[]): IDBValidKey {
  if (Array.isArray(key)) {
    return (key.length === 1 ? key[0] : key) as unknown as IDBValidKey;
  }
  return key as IDBValidKey;
}

function keyOf(table: PortableTable, row: Row): IDBValidKey {
  if (table.primaryKey.length === 1) return row[table.primaryKey[0]!] as IDBValidKey;
  return table.primaryKey.map((column) => row[column]) as unknown as IDBValidKey;
}

export class IndexedDbDatabase {
  readonly engine = 'indexeddb' as const;
  readonly name: string;
  readonly schema: PortableSchema;

  private readonly db: IDBDatabase;
  private readonly checks = new Map<string, readonly CompiledCheck[]>();
  private closed = false;

  private constructor(db: IDBDatabase, name: string, schema: PortableSchema) {
    this.db = db;
    this.name = name;
    this.schema = schema;
    for (const table of schema.tables) {
      this.checks.set(
        table.name,
        table.checks.map((check) => compileCheck(check.expression)),
      );
    }
  }

  static async open(options: IdbOpenOptions = {}): Promise<IndexedDbDatabase> {
    const factory = options.factory ?? globalThis.indexedDB;
    if (!factory) {
      throw new AppError('UNSUPPORTED_ENGINE', 'IndexedDB is not available in this runtime');
    }
    const name = options.name ?? 'law-office';
    const schema = options.schema ?? PORTABLE_SCHEMA;
    const request$ = factory.open(name, IDB_SCHEMA_VERSION);
    request$.onupgradeneeded = () => {
      const db = request$.result;
      for (const table of schema.tables) {
        const store = db.objectStoreNames.contains(table.name)
          ? request$.transaction!.objectStore(table.name)
          : db.createObjectStore(table.name, {
              keyPath:
                table.primaryKey.length === 1
                  ? table.primaryKey[0]!
                  : [...table.primaryKey],
            });
        for (const index of table.indexes) {
          if (store.indexNames.contains(index.name)) continue;
          // SQLite partial unique indexes cannot be expressed by IndexedDB;
          // they are enforced by the portable constraint engine instead.
          // A one-element array keyPath would create a compound key in
          // IndexedDB, so single-column indexes must use the bare column name.
          store.createIndex(index.name, index.columns.length === 1 ? index.columns[0]! : [...index.columns], {
            unique: index.unique && index.where === null,
          });
        }
      }
      if (!db.objectStoreNames.contains(IDB_META_STORE)) {
        db.createObjectStore(IDB_META_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(IDB_MIGRATION_STORE)) {
        db.createObjectStore(IDB_MIGRATION_STORE, { keyPath: 'version' });
      }
      const meta = request$.transaction!.objectStore(IDB_META_STORE);
      const now = new Date().toISOString();
      meta.put({ key: 'application_id', value: String(IDB_APPLICATION_ID), updated_at: now });
      meta.put({ key: 'schema_version', value: String(schema.schemaVersion), updated_at: now });
      meta.put({ key: 'engine', value: 'indexeddb', updated_at: now });
      meta.put({ key: 'created_at', value: now, updated_at: now });
      const migrated = request$.transaction!.objectStore(IDB_MIGRATION_STORE);
      migrated.put({
        version: schema.schemaVersion,
        name: 'initial',
        checksum: schemaChecksum(schema),
        applied_at: now,
        engine: 'indexeddb',
      });
    };

    const db = await request(request$);
    db.onversionchange = () => db.close();
    const instance = new IndexedDbDatabase(db, name, schema);
    await instance.verifyMeta();
    return instance;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  describe(): { engine: 'indexeddb'; engineVersion: string; journalMode: string; foreignKeys: boolean; pathKind: 'browser' } {
    return {
      engine: 'indexeddb',
      engineVersion: `${IDB_SCHEMA_VERSION}`,
      journalMode: 'idb-transactional',
      foreignKeys: true,
      pathKind: 'browser',
    };
  }

  async get(table: string, key: string | readonly string[]): Promise<IdbRow | undefined> {
    this.assertOpen();
    const store = this.db.transaction(table, 'readonly').objectStore(table);
    const result = await request(store.get(normalizeKey(key)));
    return result === undefined ? undefined : (result as IdbRow);
  }

  async getAll(table: string): Promise<IdbRow[]> {
    this.assertOpen();
    const store = this.db.transaction(table, 'readonly').objectStore(table);
    return (await request(store.getAll())) as IdbRow[];
  }

  async getByIndex(table: string, indexName: string, value: IDBValidKey): Promise<IdbRow[]> {
    this.assertOpen();
    const store = this.db.transaction(table, 'readonly').objectStore(table);
    if (!store.indexNames.contains(indexName)) {
      throw new AppError('VALIDATION_FAILED', `unknown index ${indexName} on ${table}`);
    }
    const index = store.index(indexName);
    // Databases created before this fix may have a one-element array keyPath.
    const key = Array.isArray(index.keyPath) && index.keyPath.length === 1 ? [value] : value;
    return (await request(index.getAll(key))) as IdbRow[];
  }

  async getByColumns(
    table: string,
    values: Readonly<Record<string, string | number>>,
  ): Promise<IdbRow[]> {
    this.assertOpen();
    const store = this.db.transaction(table, 'readonly').objectStore(table);
    return rowsByColumns(store, values);
  }

  async count(table: string): Promise<number> {
    this.assertOpen();
    const store = this.db.transaction(table, 'readonly').objectStore(table);
    return request(store.count());
  }

  /**
   * Streams an IndexedDB cursor and only materialises the requested page.
   *
   * An indexed cursor is used when the requested order maps to an index and the
   * column is NOT NULL (IndexedDB indexes omit null keys, so a nullable sort
   * column would silently lose rows). Otherwise rows matching the filters are
   * collected and sorted in JavaScript. The total is always the exact match
   * count, so the UI can paginate without guessing.
   */
  async queryRows(tableName: string, options: QueryOptions = {}): Promise<QueryPage> {
    this.assertOpen();
    const table = this.schema.tables.find((candidate) => candidate.name === tableName);
    if (!table) throw new AppError('VALIDATION_FAILED', `unknown table ${tableName}`);
    const query = normalizeQuery(table, options);
    const tx = this.db.transaction(tableName, 'readonly');
    const store = tx.objectStore(tableName);
    const order = query.orderBy.length === 1 ? orderIndex(table, query.orderBy) : null;
    const rangeHit = indexRangeFilter(table, query.filters);
    const canStream = order !== null && (rangeHit === null || rangeHit.indexName === order.indexName);
    const direction: IDBCursorDirection = query.orderBy[0]?.direction === 'desc' ? 'prev' : 'next';

    if (canStream && order) {
      const source = store.index(order.indexName);
      const range =
        rangeHit && rangeHit.value !== null
          ? IDBKeyRange.only(indexKey(source, rangeHit.value))
          : null;
      const total = await new Promise<{ rows: IdbRow[]; total: number }>((resolve, reject) => {
        const rows: IdbRow[] = [];
        let matched = 0;
        const request$ = range ? source.openCursor(range, direction) : source.openCursor(null, direction);
        request$.onerror = () => reject(request$.error ?? new Error('IndexedDB cursor failed'));
        request$.onsuccess = () => {
          const cursor = request$.result;
          if (!cursor) {
            resolve({ rows, total: matched });
            return;
          }
          const row = cursor.value as IdbRow;
          if (matchesFilters(row, query.filters)) {
            matched += 1;
            if (matched > query.offset && rows.length < query.limit) rows.push(row);
          }
          cursor.continue();
        };
      });
      return total;
    }

    const collected = await new Promise<IdbRow[]>((resolve, reject) => {
      const rows: IdbRow[] = [];
      const source =
        rangeHit !== null
          ? store.index(rangeHit.indexName)
          : store;
      const range =
        rangeHit && rangeHit.value !== null
          ? IDBKeyRange.only(indexKey(source, rangeHit.value))
          : null;
      const request$ = range ? source.openCursor(range, 'next') : source.openCursor(null, 'next');
      request$.onerror = () => reject(request$.error ?? new Error('IndexedDB cursor failed'));
      request$.onsuccess = () => {
        const cursor = request$.result;
        if (!cursor) {
          resolve(rows);
          return;
        }
        const row = cursor.value as IdbRow;
        if (matchesFilters(row, query.filters)) rows.push(row);
        cursor.continue();
      };
    });
    if (query.orderBy.length > 0) collected.sort((a, b) => compareRows(a, b, query.orderBy));
    return {
      rows: collected.slice(query.offset, query.offset + query.limit),
      total: collected.length,
    };
  }

  /**
   * Runs `fn` inside one read-write IndexedDB transaction over `tables`.
   * The callback must only await IndexedDB operations: IndexedDB transactions
   * commit when the event loop yields to a macrotask.
   */
  async transaction<T>(tables: readonly string[], fn: (tx: IdbTransaction) => Promise<T>): Promise<T> {
    this.assertOpen();
    const unique = [...new Set(tables)];
    const tx = this.db.transaction(unique, 'readwrite');
    const completion = transactionDone(tx);
    // The rejection is observed here so an intentional abort cannot surface as
    // an unhandled promise rejection; the original error is rethrown below.
    completion.catch(() => undefined);
    try {
      const result = await fn(new IdbTransaction(tx, this.checks));
      await completion;
      return result;
    } catch (error) {
      let abortError: unknown;
      try {
        tx.abort();
      } catch (inner) {
        // Already aborted (for example a ConstraintError from the engine).
        abortError = inner;
      }
      await completion.catch(() => undefined);
      if (error instanceof AppError) throw error;
      const classified = classifyIdbError(error);
      if (abortError instanceof Error) {
        (classified as AppError & { abortCause?: unknown }).abortCause = abortError.message;
      }
      throw classified;
    }
  }

  async put(table: string, row: IdbRow): Promise<void> {
    this.assertOpen();
    await this.transaction([table], async (tx) => tx.put(table, row));
  }

  async putMany(table: string, rows: readonly IdbRow[]): Promise<void> {
    this.assertOpen();
    await this.transaction([table], async (tx) => {
      for (const row of rows) await tx.put(table, row);
    });
  }

  async delete(table: string, key: string | readonly string[]): Promise<void> {
    this.assertOpen();
    await this.transaction([table], async (tx) => tx.delete(table, key));
  }

  async clear(table: string): Promise<void> {
    this.assertOpen();
    await this.transaction([table], async (tx) => tx.clear(table));
  }

  async tableInfo(): Promise<IdbTableInfo[]> {
    this.assertOpen();
    const result: IdbTableInfo[] = [];
    for (const table of this.schema.tables) {
      const store = this.db.transaction(table.name, 'readonly').objectStore(table.name);
      result.push({
        name: table.name,
        primaryKey: table.primaryKey,
        indexes: Array.from(store.indexNames),
        rowCount: await request(store.count()),
      });
    }
    return result;
  }

  /** Structural check: every table, index and required meta row is present. */
  async integrityCheck(): Promise<{ ok: boolean; errors: string[]; tables: number; indexes: number }> {
    this.assertOpen();
    const errors: string[] = [];
    let tables = 0;
    let indexes = 0;
    for (const table of this.schema.tables) {
      if (!this.db.objectStoreNames.contains(table.name)) {
        errors.push(`missing object store ${table.name}`);
        continue;
      }
      tables += 1;
      const store = this.db.transaction(table.name, 'readonly').objectStore(table.name);
      for (const index of table.indexes) {
        if (!store.indexNames.contains(index.name)) errors.push(`missing index ${table.name}.${index.name}`);
        else indexes += 1;
      }
      const known = new Set(table.columns.map((column) => column.name));
      const rows = (await request(store.getAll())) as IdbRow[];
      const seen = new Set<string>();
      for (const row of rows) {
        const key = JSON.stringify(keyOf(table, row));
        if (seen.has(key)) errors.push(`duplicate primary key in ${table.name}: ${key}`);
        seen.add(key);
        for (const column of Object.keys(row)) {
          if (!known.has(column)) errors.push(`unknown column ${column} in ${table.name}`);
        }
        const local = this.validateRow(table.name, row);
        if (!local.ok) errors.push(`row ${key} in ${table.name}: ${local.errors.join('; ')}`);
      }
    }
    const meta = await this.readMeta();
    if (meta.application_id !== String(IDB_APPLICATION_ID)) errors.push('application id missing');
    if (meta.schema_version !== String(this.schema.schemaVersion)) errors.push('schema version mismatch');
    return { ok: errors.length === 0, errors, tables, indexes };
  }

  async readMeta(): Promise<Record<string, string>> {
    this.assertOpen();
    const store = this.db.transaction(IDB_META_STORE, 'readonly').objectStore(IDB_META_STORE);
    const rows = (await request(store.getAll())) as Array<{ key: string; value: string }>;
    const meta: Record<string, string> = {};
    for (const row of rows) meta[row.key] = row.value;
    return meta;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.assertOpen();
    await this.transaction([IDB_META_STORE], async (tx) => {
      await tx.putRaw(IDB_META_STORE, { key, value, updated_at: new Date().toISOString() });
    });
  }

  /** Row-local constraint evaluation (types, NOT NULL, CHECK). */
  validateRow(tableName: string, row: Row): { ok: boolean; errors: string[] } {
    const table = this.schema.tables.find((candidate) => candidate.name === tableName);
    if (!table) return { ok: false, errors: [`unknown table ${tableName}`] };
    const errors: string[] = [];
    for (const column of table.columns) {
      const value = row[column.name] ?? null;
      if (value === null) {
        if (column.notNull) errors.push(`${column.name} is required`);
        continue;
      }
      if (column.type === 'TEXT' && typeof value !== 'string') errors.push(`${column.name} must be text`);
      if (column.type === 'INTEGER' && (typeof value !== 'number' || !Number.isInteger(value))) {
        errors.push(`${column.name} must be an integer`);
      }
      if (column.type === 'REAL' && typeof value !== 'number') errors.push(`${column.name} must be a number`);
    }
    for (const check of this.checks.get(tableName) ?? []) {
      if (!check.test(row)) errors.push(`CHECK failed: ${check.source.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    return { ok: errors.length === 0, errors };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private async verifyMeta(): Promise<void> {
    const meta = await this.readMeta();
    if (meta.application_id !== undefined && meta.application_id !== String(IDB_APPLICATION_ID)) {
      throw new AppError('UNSUPPORTED_ENGINE', 'IndexedDB database belongs to another application');
    }
    if (meta.schema_version !== undefined && Number(meta.schema_version) > this.schema.schemaVersion) {
      throw new AppError('SCHEMA_TOO_NEW', 'IndexedDB schema is newer than this application');
    }
    await this.setMeta('last_opened_at', new Date().toISOString());
  }

  private assertOpen(): void {
    if (this.closed) throw new AppError('INVALID_STATE', 'IndexedDB handle is closed');
  }
}

export class IdbTransaction {
  private readonly tx: IDBTransaction;
  private readonly checks: Map<string, readonly CompiledCheck[]>;

  constructor(tx: IDBTransaction, checks: Map<string, readonly CompiledCheck[]>) {
    this.tx = tx;
    this.checks = checks;
  }

  async get(table: string, key: string | readonly string[]): Promise<IdbRow | undefined> {
    const result = await request(this.tx.objectStore(table).get(normalizeKey(key)));
    return result === undefined ? undefined : (result as IdbRow);
  }

  async getAll(table: string): Promise<IdbRow[]> {
    return (await request(this.tx.objectStore(table).getAll())) as IdbRow[];
  }

  async getByIndex(table: string, indexName: string, value: IDBValidKey): Promise<IdbRow[]> {
    const store = this.tx.objectStore(table);
    if (!store.indexNames.contains(indexName)) return [];
    return (await request(store.index(indexName).getAll(value))) as IdbRow[];
  }

  async getByColumns(
    table: string,
    values: Readonly<Record<string, string | number>>,
  ): Promise<IdbRow[]> {
    const store = this.tx.objectStore(table);
    return rowsByColumns(store, values);
  }

  async count(table: string): Promise<number> {
    return request(this.tx.objectStore(table).count());
  }

  /**
   * Writes a row, evaluating NOT NULL / type / CHECK constraints first. The
   * portable repository is responsible for foreign keys and uniqueness across
   * rows; those need additional reads inside the same transaction.
   */
  async put(table: string, row: IdbRow): Promise<void> {
    const tableDef = PORTABLE_SCHEMA.tables.find((candidate) => candidate.name === table);
    if (!tableDef) throw new AppError('VALIDATION_FAILED', `unknown table ${table}`);
    const errors: string[] = [];
    for (const column of tableDef.columns) {
      const value = row[column.name] ?? null;
      if (value === null) {
        if (column.notNull) errors.push(`${column.name} is required`);
        continue;
      }
      if (column.type === 'TEXT' && typeof value !== 'string') errors.push(`${column.name} must be text`);
      if (column.type === 'INTEGER' && (typeof value !== 'number' || !Number.isInteger(value))) {
        errors.push(`${column.name} must be an integer`);
      }
    }
    for (const check of this.checks.get(table) ?? []) {
      if (!check.test(row)) {
        errors.push(`CHECK failed: ${check.source.replace(/\s+/g, ' ').slice(0, 160)}`);
      }
    }
    if (errors.length > 0) {
      throw new AppError('VALIDATION_FAILED', `constraint violation in ${table}`, { errors });
    }
    await request(this.tx.objectStore(table).put(row));
  }

  async putRaw(storeName: string, row: unknown): Promise<void> {
    await request(this.tx.objectStore(storeName).put(row));
  }

  async delete(table: string, key: string | readonly string[]): Promise<void> {
    await request(this.tx.objectStore(table).delete(normalizeKey(key)));
  }

  async clear(table: string): Promise<void> {
    await request(this.tx.objectStore(table).clear());
  }
}

export function schemaChecksum(schema: PortableSchema): string {
  // Stable structural checksum. Uses a deterministic JSON shape; not a security hash.
  const text = JSON.stringify({
    version: schema.schemaVersion,
    applicationId: schema.applicationId,
    tables: schema.tables.map((table) => ({
      name: table.name,
      columns: table.columns.map((column) => [
        column.name,
        column.type,
        column.notNull,
        column.defaultValue ?? null,
        column.primaryKeyOrder,
      ]),
      indexes: table.indexes.map((index) => [index.name, index.columns, index.unique, index.where]),
      foreignKeys: table.foreignKeys,
      checks: table.checks.map((check) => check.expression.replace(/\s+/g, ' ').trim()),
    })),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function rowsByColumns(
  store: IDBObjectStore,
  values: Readonly<Record<string, string | number>>,
): Promise<IdbRow[]> {
  const entries = Object.entries(values);
  if (entries.length === 0) return [];
  const [firstColumn, firstValue] = entries[0]!;
  for (const indexName of Array.from(store.indexNames)) {
    const index = store.index(indexName);
    if (typeof index.keyPath === 'string' && index.keyPath === firstColumn) {
      const candidates = (await request(index.getAll(firstValue as IDBValidKey))) as IdbRow[];
      return candidates.filter((row) => entries.every(([column, value]) => row[column] === value));
    }
  }
  const rows = (await request(store.getAll())) as IdbRow[];
  return rows.filter((row) => entries.every(([column, value]) => row[column] === value));
}

function indexKey(source: { keyPath: string | string[] | null }, value: IDBValidKey): IDBValidKey {
  return Array.isArray(source.keyPath) && source.keyPath.length === 1 ? [value] : value;
}

function classifyIdbError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  if (/ConstraintError/i.test(message)) return new AppError('UNIQUE_VIOLATION', message);
  if (/QuotaExceededError/i.test(message)) {
    return new AppError('TRANSACTION_FAILED', 'browser storage quota exceeded');
  }
  return new AppError('TRANSACTION_FAILED', message);
}

export { INTERNAL_STORES };
