/**
 * Portable data layer: one implementation of the core data semantics that runs
 * on both the SQLite and the IndexedDB stores.
 *
 * What is shared here (identical on both engines): defaults, NOT NULL/type/CHECK
 * validation, unique indexes (including SQLite partial unique indexes), foreign
 * key checks, soft delete + deletion batches, restore, optimistic revision
 * bumps, sync outbox rows, append-only audit log, display number allocation and
 * Arabic-normalised search projection.
 *
 * What differs is documented, not hidden: SQLite additionally enforces these
 * rules with DDL/triggers/FTS5; IndexedDB enforces them in this layer because it
 * has neither SQL nor triggers.
 */
import { PORTABLE_SCHEMA } from '../schema/v1/portable-schema.ts';
import { PORTABLE_SEED } from '../schema/v1/portable-seed.ts';
import { getSyncEntity, syncEntityByTable, tryGetSyncEntity, type SyncEntityDefinition } from '../sync/entity-registry.ts';
import { normalizeArabic } from '../util/arabic.ts';
import { SystemClock, type Clock } from '../util/clock.ts';
import { toCanonicalTimestamp } from '../util/dates.ts';
import { newId } from '../util/uuid.ts';
import { stableStringify } from '../util/stable.ts';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../errors.ts';
import type { PortableIndex, PortableTable } from '../schema/portable-types.ts';

const SCHEMA = PORTABLE_SCHEMA;
import { compileCheck, type CompiledCheck, type Row } from './expression.ts';
import type { EngineRow, PortableStore, PortableTransaction } from './store.ts';

export type PortableEntity = EngineRow;

export interface CreatePersonInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  nationalId?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'unknown';
  occupation?: string;
  notes?: string;
}

export interface PortableFileFull {
  file: EngineRow;
  parties: EngineRow[];
  cases: EngineRow[];
  subFiles: EngineRow[];
  [key: string]: unknown;
}

export interface PortableOptions {
  readonly store: PortableStore;
  readonly clock?: Clock;
  readonly appVersion?: string;
  readonly platform?: string;
  readonly deviceLabel?: string;
  readonly timezone?: string;
  readonly schema?: typeof PORTABLE_SCHEMA;
}

export interface PortableBackup {
  readonly format: 'lawo-portable-backup';
  readonly formatVersion: 1;
  readonly createdAt: string;
  readonly schemaVersion: number;
  readonly applicationId: number;
  readonly engine: string;
  readonly deviceId: string;
  readonly appVersion: string;
  readonly tables: Record<string, EngineRow[]>;
  readonly counts: Record<string, number>;
  readonly sha256: string;
}

export interface PortableBackupVerification {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly sha256: string | null;
  readonly schemaVersion: number | null;
  readonly applicationId: number | null;
  readonly deviceId: string | null;
  readonly totalRows: number;
  readonly foreignKeyViolations: readonly string[];
  readonly uniqueViolations: readonly string[];
}

const HEADER_COLUMNS = [
  'created_at',
  'updated_at',
  'deleted_at',
  'origin_device_id',
  'revision',
  'sync_status',
  'last_synced_at',
] as const;

export class PortableLawOffice {
  readonly store: PortableStore;
  readonly clock: Clock;
  readonly appVersion: string;
  readonly schema = SCHEMA;

  private readonly checks = new Map<string, readonly CompiledCheck[]>();
  private readonly partialChecks = new Map<string, CompiledCheck | null>();
  private readonly tables = new Map<string, PortableTable>();
  private readonly indexes = new Map<string, PortableIndex[]>();

  deviceId = '';
  deviceCode = '';
  private device: EngineRow = {};
  private activeTx: PortableTransaction | null = null;

  /**
   * Reads join the active transaction when one exists. This matters on
   * IndexedDB: opening a second transaction while a read-write transaction is
   * pending would deadlock, whereas SQLite would silently read through the
   * same connection.
   */
  private get conn(): PortableTransaction {
    return this.activeTx ?? this.store;
  }

  private constructor(options: PortableOptions) {
    this.store = options.store;
    this.clock = options.clock ?? new SystemClock();
    this.appVersion = options.appVersion ?? '0.1.0';
    for (const table of this.schema.tables) {
      this.tables.set(table.name, table);
      this.indexes.set(
        table.name,
        table.indexes.filter((index) => index.unique),
      );
      this.checks.set(
        table.name,
        table.checks.map((check) => compileCheck(check.expression)),
      );
      for (const index of table.indexes) {
        if (index.where) this.partialChecks.set(index.name, compileCheck(index.where));
      }
    }
    this.pendingOptions = options;
  }

  private readonly pendingOptions: PortableOptions;

  static async open(options: PortableOptions): Promise<PortableLawOffice> {
    const instance = new PortableLawOffice(options);
    await instance.initialize();
    return instance;
  }

  private async initialize(): Promise<void> {
    const options = this.pendingOptions;
    await this.store.transaction(
      this.schema.tables.map((table) => table.name),
      async (tx) => {
        const lists = await tx.count('lookup_list');
        if (lists === 0) {
          for (const [table, rows] of Object.entries(PORTABLE_SEED)) {
            for (const row of rows) await tx.put(table, { ...row });
          }
        }
        const deviceId = await tx.get('app_meta', 'local.device_id');
        if (typeof deviceId?.value === 'string' && deviceId.value.length > 0) {
          const device = await tx.get('local_device', deviceId.value);
          if (!device) throw new AppError('INVALID_STATE', 'local.device_id points at a missing device');
          this.device = device;
          this.deviceId = String(device.id);
          this.deviceCode = String(device.short_code);
          return;
        }
        const device = await this.registerDevice(tx, options);
        this.device = device;
      },
    );
    await this.store.transaction(['app_meta'], async (tx) => {
      await tx.put('app_meta', toAppMeta('app.version', this.appVersion, this.now()));
      await tx.put('app_meta', toAppMeta('engine', this.store.engine, this.now()));
      await tx.put('app_meta', toAppMeta('db.engine', this.store.engine, this.now()));
      await tx.put('app_meta', toAppMeta('last_opened_at', this.now(), this.now()));
    });
  }

  private async registerDevice(
    tx: PortableTransaction,
    options: PortableOptions,
  ): Promise<EngineRow> {
    const id = newId();
    const compact = id.replace(/-/g, '').toUpperCase();
    let shortCode = compact.slice(0, 6);
    for (const length of [6, 8, 10, 12]) {
      const candidate = compact.slice(0, length);
      const existing = await tx.getByColumns('local_device', { short_code: candidate });
      if (existing.length === 0) {
        shortCode = candidate;
        break;
      }
    }
    const now = this.now();
    const device: EngineRow = {
      id,
      label: options.deviceLabel?.trim() || 'جهاز محلي',
      platform: options.platform ?? (this.store.engine === 'indexeddb' ? 'web' : 'unknown'),
      short_code: shortCode,
      app_version: this.appVersion,
      timezone: options.timezone ?? 'Africa/Cairo',
      is_local: 1,
      is_active: 1,
      notes: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      origin_device_id: id,
      revision: 1,
      sync_status: 'pending',
      last_synced_at: null,
    };
    await this.writeRow(tx, 'local_device', device, 'insert');
    await tx.put('app_meta', toAppMeta('local.device_id', id, now));
    await tx.put('app_meta', toAppMeta('local.device_created_at', now, now));
    await this.audit(tx, 'setup', 'device', id, 'registered local device');
    await this.enqueue(tx, 'device', id, 'insert', device, ['id', 'label', 'platform', 'short_code']);
    this.deviceId = id;
    this.deviceCode = shortCode;
    return device;
  }

  get deviceRecord(): EngineRow {
    return { ...this.device };
  }

  now(): string {
    return toCanonicalTimestamp(this.clock.now());
  }

  /**
   * Runs `fn` in one atomic unit. Nested calls join the active transaction, so
   * a domain operation (file + parties + outbox + audit + search) commits or
   * rolls back as one unit on both engines. The IndexedDB profile opens the
   * transaction over all stores because IndexedDB fixes its scope at creation;
   * the working set is small and correctness is preferred over micro-tuning.
   */
  async transaction<T>(fn: (tx: PortableTransaction) => Promise<T>, tables?: readonly string[]): Promise<T> {
    if (this.activeTx) return fn(this.activeTx);
    return this.store.transaction(tables ?? this.schema.tables.map((table) => table.name), async (tx) => {
      this.activeTx = tx;
      try {
        return await fn(tx);
      } finally {
        this.activeTx = null;
      }
    });
  }

  // ---------------------------------------------------------------------
  // Generic entity access
  // ---------------------------------------------------------------------

  table(entityCode: string): PortableTable {
    const definition = getSyncEntity(entityCode);
    const table = this.tables.get(definition.table);
    if (!table) throw new AppError('VALIDATION_FAILED', `unknown table ${definition.table}`);
    return table;
  }

  private tableFor(entityCode: string): { definition: SyncEntityDefinition; table: PortableTable } {
    const definition = getSyncEntity(entityCode);
    const table = this.tables.get(definition.table);
    if (!table) throw new AppError('VALIDATION_FAILED', `unknown table ${definition.table}`);
    return { definition, table };
  }

  async get(entityCode: string, id: string, options: { includeDeleted?: boolean } = {}): Promise<EngineRow | undefined> {
    const { definition } = this.tableFor(entityCode);
    const key = definition.primaryKeyColumn === 'id' ? id : id;
    const row = await this.conn.get(definition.table, key);
    if (!row) return undefined;
    if (!options.includeDeleted && row.deleted_at !== null && row.deleted_at !== undefined) return undefined;
    return row;
  }

  async require(entityCode: string, id: string, options: { includeDeleted?: boolean } = {}): Promise<EngineRow> {
    const row = await this.get(entityCode, id, options);
    if (!row) throw new NotFoundError(entityCode, id);
    return row;
  }

  async list(
    entityCode: string,
    options: {
      where?: Readonly<Record<string, string | number | null>>;
      limit?: number;
      offset?: number;
      orderBy?: { column: string; direction?: 'asc' | 'desc' };
      includeDeleted?: boolean;
    } = {},
  ): Promise<EngineRow[]> {
    const { definition } = this.tableFor(entityCode);
    let rows = await this.conn.getAll(definition.table);
    if (!options.includeDeleted) {
      rows = rows.filter((row) => row.deleted_at === null || row.deleted_at === undefined);
    }
    if (options.where) {
      const entries = Object.entries(options.where);
      rows = rows.filter((row) => entries.every(([column, value]) => (row[column] ?? null) === value));
    }
    if (options.orderBy) {
      const { column, direction = 'asc' } = options.orderBy;
      rows.sort((left, right) => {
        const a = left[column] ?? null;
        const b = right[column] ?? null;
        if (a === b) return 0;
        if (a === null) return 1;
        if (b === null) return -1;
        return (a < b ? -1 : 1) * (direction === 'asc' ? 1 : -1);
      });
    }
    const offset = Math.max(0, Math.trunc(options.offset ?? 0));
    const limit = Math.max(1, Math.min(1000, Math.trunc(options.limit ?? 50)));
    return rows.slice(offset, offset + limit);
  }

  async count(entityCode: string, where?: Readonly<Record<string, string | number | null>>): Promise<number> {
    const { definition } = this.tableFor(entityCode);
    const all = await this.conn.getAll(definition.table);
    return all.filter(
      (row) =>
        (row.deleted_at === null || row.deleted_at === undefined) &&
        (!where || Object.entries(where).every(([column, value]) => (row[column] ?? null) === value)),
    ).length;
  }

  async insert(entityCode: string, values: Record<string, unknown>, options: { id?: string } = {}): Promise<EngineRow> {
    const { definition, table } = this.tableFor(entityCode);
    for (const header of HEADER_COLUMNS) {
      if (header in values) {
        throw new ValidationError(`field ${header} is managed by the data layer`, { field: header });
      }
    }
    const providedPk = values[definition.primaryKeyColumn];
    if (definition.primaryKeyColumn !== 'id' && providedPk !== undefined) {
      if (options.id !== undefined && options.id !== providedPk) {
        throw new ValidationError('conflicting ids supplied');
      }
    }
    const id =
      options.id ??
      (values.id as string | undefined) ??
      (providedPk as string | undefined) ??
      newId();
    assertUuid(id);
    const now = this.now();
    const row: EngineRow = { ...toEngineRow(values) };
    row[definition.primaryKeyColumn] = id;
    for (const column of table.columns) {
      if (row[column.name] === undefined) {
        const injected = this.headerValue(column.name, 'insert', now);
        if (injected !== undefined) row[column.name] = injected;
        else if (column.defaultValue !== undefined) row[column.name] = column.defaultValue;
        else row[column.name] = null;
      }
    }
    return this.writeEntity(definition, table, row, 'insert', Object.keys(values));
  }

  async update(entityCode: string, id: string, patch: Record<string, unknown>): Promise<EngineRow> {
    const { definition, table } = this.tableFor(entityCode);
    if (definition.policy === 'append_only' || definition.policy === 'immutable') {
      throw new AppError('IMMUTABLE_RECORD', `${entityCode} rows cannot be updated`);
    }
    const allowed = new Set(definition.mutableColumns);
    for (const key of Object.keys(patch)) {
      if (key === 'id') throw new ValidationError('id cannot be changed');
      if (!allowed.has(key)) throw new ValidationError(`field ${key} is not mutable on ${entityCode}`, { field: key });
    }
    return this.transaction(async (tx) => {
      const current = await tx.get(definition.table, id);
      if (!current || current.deleted_at !== null) throw new NotFoundError(entityCode, id);
      const changes: EngineRow = {};
      for (const [key, raw] of Object.entries(patch)) {
        const value = raw === undefined ? null : (raw as string | number | null);
        if ((current[key] ?? null) !== value) changes[key] = value;
      }
      if (Object.keys(changes).length === 0) return current;
      const row: EngineRow = {
        ...current,
        ...changes,
        updated_at: this.now(),
        revision: Number(current.revision) + 1,
        sync_status: 'pending',
      };
      return this.writeEntity(definition, table, row, 'update', Object.keys(changes), tx);
    });
  }

  async archive(entityCode: string, id: string, archived: boolean): Promise<EngineRow> {
    const { definition, table } = this.tableFor(entityCode);
    if (!table.columns.some((column) => column.name === 'archived_at')) {
      throw new ValidationError(`${entityCode} does not support archive`);
    }
    const now = this.now();
    return this.transaction(async (tx) => {
      const current = await tx.get(definition.table, id);
      if (!current || current.deleted_at !== null) throw new NotFoundError(entityCode, id);
      const row: EngineRow = {
        ...current,
        archived_at: archived ? now : null,
        updated_at: now,
        revision: Number(current.revision) + 1,
        sync_status: 'pending',
      };
      return this.writeEntity(definition, table, row, archived ? 'archive' : 'unarchive', ['archived_at'], tx);
    });
  }

  async softDelete(entityCode: string, id: string, reason?: string): Promise<{ batchId: string; affectedCount: number }> {
    const { definition } = this.tableFor(entityCode);
    if (!definition.softDelete) throw new AppError('IMMUTABLE_RECORD', `${entityCode} cannot be soft-deleted`);
    return this.transaction(
      async (tx) => {
        const now = this.now();
        const batchId = newId();
        await tx.put('deletion_batch', {
          id: batchId,
          created_at: now,
          origin_device_id: this.deviceId,
          root_entity_type: entityCode,
          root_entity_id: id,
          policy: 'cascade_owned',
          affected_count: 0,
          restored_at: null,
        });
        const entries: Array<{ entityCode: string; id: string }> = [];
        await this.assertNoBlockingDependents(tx, definition, id);
        await this.cascadeDelete(tx, definition.code, id, batchId, entries, new Set());
        if (entries.length === 0) throw new NotFoundError(entityCode, id);
        await tx.put('deletion_batch', {
          id: batchId,
          created_at: now,
          origin_device_id: this.deviceId,
          root_entity_type: entityCode,
          root_entity_id: id,
          policy: 'cascade_owned',
          affected_count: entries.length,
          restored_at: null,
        });
        await this.audit(tx, 'delete', entityCode, id, reason ?? 'soft delete', {
          batchId,
          affectedCount: entries.length,
        });
        return { batchId, affectedCount: entries.length };
      },
    );
  }

  async restore(entityCode: string, id: string): Promise<{ batchId: string | null; restoredCount: number }> {
    return this.transaction(
      async (tx) => {
        const entries = await tx.getAll('deletion_entry');
        const forEntity = entries
          .filter((entry) => entry.entity_type === entityCode && entry.entity_id === id)
          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
        // Find the latest batch containing this entity and still not restored.
        let batchId: string | null = null;
        for (const entry of forEntity) {
          const batch = await tx.get('deletion_batch', String(entry.batch_id));
          if (batch && batch.restored_at === null) {
            batchId = String(batch.id);
            break;
          }
        }
        if (!batchId) throw new ConflictError('nothing to restore', 'NOT_DELETED', { entity: entityCode, id });
        const batchEntries = entries.filter((entry) => entry.batch_id === batchId);
        let restored = 0;
        for (const entry of batchEntries) {
          const childDefinition = tryGetSyncEntity(String(entry.entity_type));
          if (!childDefinition) continue;
          const row = await tx.get(childDefinition.table, String(entry.entity_id));
          if (!row || row.deleted_at === null) continue;
          const next: EngineRow = {
            ...row,
            deleted_at: null,
            updated_at: this.now(),
            revision: Number(row.revision) + 1,
            sync_status: 'pending',
          };
          await this.writeEntity(childDefinition, this.tables.get(childDefinition.table)!, next, 'restore', ['deleted_at'], tx);
          restored += 1;
        }
        await tx.put('deletion_batch', {
          ...(await tx.get('deletion_batch', batchId))!,
          restored_at: this.now(),
        });
        await this.audit(tx, 'restore', entityCode, id, 'restored deletion batch', { batchId, restored });
        return { batchId, restoredCount: restored };
      },
    );
  }

  // ---------------------------------------------------------------------
  // Validation, audit, outbox, search
  // ---------------------------------------------------------------------

  private async writeEntity(
    definition: SyncEntityDefinition,
    table: PortableTable,
    row: EngineRow,
    action: 'insert' | 'update' | 'restore' | 'archive' | 'unarchive',
    changedFields: readonly string[],
    existingTx?: PortableTransaction,
  ): Promise<EngineRow> {
    const run = async (tx: PortableTransaction): Promise<EngineRow> => {
      await this.writeRow(tx, table.name, row, action);
      const operation =
        action === 'insert' ? 'insert' : action === 'restore' ? 'restore' : 'update';
      if (definition.softDelete || action === 'insert') {
        await this.enqueue(tx, definition.code, String(row[definition.primaryKeyColumn]), operation, row, changedFields);
      }
      await this.audit(
        tx,
        action,
        definition.code,
        String(row[definition.primaryKeyColumn]),
        `${action} ${definition.code}`,
        Object.fromEntries(changedFields.map((field) => [field, row[field] ?? null])),
        definition.sensitiveColumns,
      );
      await this.refreshSearch(tx, definition.code, String(row[definition.primaryKeyColumn]));
      return row;
    };
    if (existingTx) return run(existingTx);
    return this.transaction(run);
  }

  private async writeRow(
    tx: PortableTransaction,
    tableName: string,
    row: EngineRow,
    action: string,
  ): Promise<void> {
    const tableDefinition = this.tables.get(tableName);
    if (!tableDefinition) throw new AppError('VALIDATION_FAILED', `unknown table ${tableName}`);
    const known = new Set(tableDefinition.columns.map((column) => column.name));
    const unknown = Object.keys(row).filter((column) => !known.has(column));
    if (unknown.length > 0) {
      throw new AppError('VALIDATION_FAILED', `unknown column(s) on ${tableName}: ${unknown.join(', ')}`);
    }
    this.assertLocalConstraints(tableName, row);
    await this.assertForeignKeys(tx, tableName, row);
    await this.assertUnique(tx, tableName, row);
    const appendOnly =
      tableName === 'audit_log' ||
      tableName === 'schema_migration' ||
      tableName === 'deletion_entry' ||
      tableName === 'task_status_history' ||
      tableName === 'party_snapshot';
    if (appendOnly && action !== 'insert') {
      throw new AppError('IMMUTABLE_RECORD', `${tableName} is append-only`);
    }
    await tx.put(tableName, row);
  }

  assertLocalConstraints(tableName: string, row: EngineRow): void {
    const table = this.tables.get(tableName);
    if (!table) throw new AppError('VALIDATION_FAILED', `unknown table ${tableName}`);
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
    }
    for (const check of this.checks.get(tableName) ?? []) {
      if (!check.test(row as Row)) {
        errors.push(`CHECK failed: ${check.source.replace(/\s+/g, ' ').slice(0, 160)}`);
      }
    }
    if (errors.length > 0) {
      throw new AppError('VALIDATION_FAILED', `constraint violation in ${tableName}`, { errors });
    }
  }

  private async assertForeignKeys(
    tx: PortableTransaction,
    tableName: string,
    row: EngineRow,
  ): Promise<void> {
    const table = this.tables.get(tableName)!;
    for (const foreignKey of table.foreignKeys) {
      const values = foreignKey.columns.map((column) => row[column] ?? null);
      if (values.some((value) => value === null)) continue;
      if (foreignKey.referencedTable === tableName) {
        // Deferrable self reference (case_file.root_file_id points at the row
        // being inserted). The same rule is enforced by the engine transaction:
        // SQLite via a deferred FK, the portable layer after the row exists.
        const ownKey = table.primaryKey.map((column) => row[column] ?? null);
        if (
          foreignKey.referencedColumns.length === ownKey.length &&
          foreignKey.referencedColumns.every((_, index) => ownKey[index] === values[index])
        ) {
          continue;
        }
      }
      const parent = await tx.get(
        foreignKey.referencedTable,
        values.length === 1 ? (values[0] as string) : (values as string[]),
      );
      if (!parent) {
        throw new AppError('FOREIGN_KEY_VIOLATION', `${tableName}.${foreignKey.columns.join(',')} has no parent`, {
          referenced: foreignKey.referencedTable,
        });
      }
    }
  }

  private async assertUnique(
    tx: PortableTransaction,
    tableName: string,
    row: EngineRow,
  ): Promise<void> {
    const table = this.tables.get(tableName)!;
    for (const index of this.indexes.get(tableName) ?? []) {
      if (index.columns.length === 0) continue;
      if (index.where) {
        const predicate = this.partialChecks.get(index.name);
        if (predicate && !predicate.test(row as Row)) continue;
      }
      const values = index.columns.map((column) => row[column] ?? null);
      if (values.some((value) => value === null)) continue;
      const candidates = await tx.getByColumns(tableName, { [index.columns[0]!]: values[0] as string });
      const clash = candidates.find((candidate) => {
        if (candidate === row) return false;
        const sameKey =
          table.primaryKey.length === 1
            ? candidate[table.primaryKey[0]!] === row[table.primaryKey[0]!]
            : table.primaryKey.every((column) => candidate[column] === row[column]);
        if (sameKey) return false;
        if (index.where) {
          const predicate = this.partialChecks.get(index.name);
          if (predicate && !predicate.test(candidate as Row)) return false;
        }
        return index.columns.every((column, position) => (candidate[column] ?? null) === values[position]);
      });
      if (clash) {
        throw new AppError('UNIQUE_VIOLATION', `${tableName} violates unique index ${index.name}`, {
          index: index.name,
          columns: index.columns,
        });
      }
    }
  }

  private headerValue(column: string, mode: 'insert' | 'update', now: string): string | number | null | undefined {
    switch (column) {
      case 'created_at':
        return now;
      case 'updated_at':
        return now;
      case 'deleted_at':
        return null;
      case 'origin_device_id':
        return mode === 'insert' ? this.deviceId : undefined;
      case 'revision':
        return 1;
      case 'sync_status':
        return 'pending';
      case 'last_synced_at':
        return null;
      default:
        return undefined;
    }
  }

  private async audit(
    tx: PortableTransaction,
    action: string,
    entityType: string | null,
    entityId: string | null,
    summary: string,
    changes?: Record<string, unknown>,
    sensitive: readonly string[] = [],
  ): Promise<void> {
    const redacted = changes
      ? Object.fromEntries(
          Object.entries(changes).map(([key, value]) => [
            key,
            sensitive.includes(key) ? '[redacted]' : value,
          ]),
        )
      : null;
    await tx.put('audit_log', {
      id: newId(),
      occurred_at: this.now(),
      actor_device_id: this.deviceId || '00000000-0000-4000-8000-000000000000',
      action,
      entity_type: entityType,
      entity_id: entityId,
      summary,
      changes_json: redacted ? stableStringify(redacted) : null,
      correlation_id: null,
    });
  }

  private async enqueue(
    tx: PortableTransaction,
    entityType: string,
    entityId: string,
    operation: 'insert' | 'update' | 'delete' | 'restore',
    row: EngineRow,
    changedFields: readonly string[],
  ): Promise<void> {
    const outbox = await tx.getAll('sync_outbox');
    const sequence = outbox.reduce((max, current) => Math.max(max, Number(current.sequence ?? 0)), 0) + 1;
    await tx.put('sync_outbox', {
      id: newId(),
      sequence,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      payload_json: stableStringify(row),
      changed_fields_json: stableStringify([...new Set(changedFields)].sort()),
      origin_device_id: this.deviceId || String(row.origin_device_id ?? ''),
      created_at: this.now(),
      state: 'pending',
      attempt_count: 0,
      last_attempt_at: null,
      last_error: null,
      sent_at: null,
    });
  }

  private async assertNoBlockingDependents(
    tx: PortableTransaction,
    definition: SyncEntityDefinition,
    id: string,
  ): Promise<void> {
    const blockers: Array<{ table: string; count: number }> = [];
    for (const rule of definition.dependents) {
      if (rule.policy !== 'block') continue;
      const rows = await tx.getAll(rule.table);
      const count = rows.filter(
        (row) => row[rule.column] === id && (row.deleted_at === null || row.deleted_at === undefined),
      ).length;
      if (count > 0) blockers.push({ table: rule.table, count });
    }
    if (blockers.length > 0) {
      throw new ConflictError(`cannot delete ${definition.code}: related records exist`, 'DEPENDENT_RECORDS_EXIST', {
        entity: definition.code,
        id,
        blockers,
      });
    }
  }

  private async cascadeDelete(
    tx: PortableTransaction,
    entityCode: string,
    id: string,
    batchId: string,
    entries: Array<{ entityCode: string; id: string }>,
    visited: Set<string>,
  ): Promise<void> {
    const key = `${entityCode}:${id}`;
    if (visited.has(key)) return;
    visited.add(key);
    const definition = tryGetSyncEntity(entityCode);
    if (!definition || !definition.softDelete) {
      throw new AppError('UNSUPPORTED_ENGINE', `cannot cascade-delete ${entityCode}`);
    }
    const row = await tx.get(definition.table, id);
    if (!row || row.deleted_at !== null) return;
    await this.assertNoBlockingDependents(tx, definition, id);
    const now = this.now();
    const next: EngineRow = {
      ...row,
      deleted_at: now,
      updated_at: now,
      revision: Number(row.revision) + 1,
      sync_status: 'pending',
    };
    await this.writeRow(tx, definition.table, next, 'delete');
    entries.push({ entityCode, id });
    await tx.put('deletion_entry', {
      id: newId(),
      batch_id: batchId,
      entity_type: entityCode,
      entity_id: id,
      action: entries.length === 1 ? 'soft_delete' : 'cascade_soft_delete',
      created_at: now,
    });
    await this.enqueue(tx, entityCode, id, 'delete', next, ['deleted_at']);
    await this.refreshSearch(tx, entityCode, id);
    for (const rule of definition.dependents) {
      if (rule.policy !== 'cascade') continue;
      const child = tryGetSyncEntityByTable(rule.table);
      if (!child) continue;
      const children = await tx.getAll(rule.table);
      for (const childRow of children) {
        if (childRow[rule.column] !== id) continue;
        if (childRow.deleted_at !== null && childRow.deleted_at !== undefined) continue;
        await this.cascadeDelete(
          tx,
          child.code,
          String(childRow[child.primaryKeyColumn]),
          batchId,
          entries,
          visited,
        );
      }
    }
  }

  // ---------------------------------------------------------------------
  // Display numbers
  // ---------------------------------------------------------------------

  async nextNumber(key: string, options: { scope?: string } = {}): Promise<{ value: number; formatted: string }> {
    const scope = options.scope ?? '';
    return this.transaction(async (tx) => {
      const series = await tx.get('number_series', [key, scope]);
      if (!series) throw new NotFoundError('number_series', `${key}/${scope}`);
      const value = Number(series.next_value);
      const padding = Number(series.padding ?? 4);
      const now = this.clock.now();
      const formatted = String(series.format ?? '{prefix}{value}{suffix}')
        .replace(/\{prefix\}/g, String(series.prefix ?? ''))
        .replace(/\{suffix\}/g, String(series.suffix ?? ''))
        .replace(/\{value\}/g, String(value).padStart(padding, '0'))
        .replace(/\{year\}/g, String(now.getUTCFullYear()))
        .replace(/\{device\}/g, this.deviceCode);
      await tx.put('number_series', { ...series, next_value: value + 1, updated_at: this.now() });
      return { value, formatted };
    });
  }

  // ---------------------------------------------------------------------
  // Reference data
  // ---------------------------------------------------------------------

  async lookup(listCode: string, itemCode: string): Promise<EngineRow> {
    const list = await this.requireList(listCode);
    const items = await this.conn.getByColumns('lookup_item', { list_id: String(list.id) });
    const item = items.find(
      (candidate) =>
        candidate.code === itemCode &&
        candidate.is_active === 1 &&
        (candidate.deleted_at === null || candidate.deleted_at === undefined),
    );
    if (!item) throw new ValidationError(`unknown code ${itemCode} in list ${listCode}`, { list: listCode, code: itemCode });
    return item;
  }

  private async requireList(listCode: string): Promise<EngineRow> {
    const lists = await this.conn.getByColumns('lookup_list', { code: listCode });
    const list = lists.find((candidate) => candidate.deleted_at === null || candidate.deleted_at === undefined);
    if (!list) throw new NotFoundError('lookup_list', listCode);
    return list;
  }

  async lookupOptional(listCode: string, itemCode: string | null | undefined): Promise<string | null> {
    if (!itemCode) return null;
    return String((await this.lookup(listCode, itemCode)).id);
  }

  async lookupItems(listCode: string): Promise<EngineRow[]> {
    const list = await this.requireList(listCode);
    const items = await this.conn.getByColumns('lookup_item', { list_id: String(list.id) });
    return items
      .filter((item) => item.is_active === 1)
      .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
  }

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  private async refreshSearch(tx: PortableTransaction, entityType: string, entityId: string): Promise<void> {
    const table = tryGetSyncEntity(entityType)?.table;
    if (!table) return;
    const row = await tx.get(table, entityId);
    const existing = await this.findSearchDocument(tx, entityType, entityId);
    const deleted = !row || row.deleted_at !== null;
    const parts = deleted ? null : await this.buildSearchText(tx, entityType, row);
    if (!parts) {
      if (existing) await tx.delete('search_document', String(existing.id));
      return;
    }
    const id = existing ? Number(existing.id) : await this.nextSearchId(tx);
    await tx.put('search_document', {
      id,
      entity_type: entityType,
      entity_id: entityId,
      title: parts.title,
      subtitle: parts.subtitle,
      body: parts.body,
      normalized_text: normalizeArabic(`${parts.title} ${parts.subtitle ?? ''} ${parts.body}`),
      updated_at: this.now(),
    });
  }

  private async findSearchDocument(
    tx: PortableTransaction,
    entityType: string,
    entityId: string,
  ): Promise<EngineRow | undefined> {
    const docs = await tx.getByColumns('search_document', { entity_type: entityType });
    return docs.find((doc) => doc.entity_id === entityId);
  }

  private async nextSearchId(tx: PortableTransaction): Promise<number> {
    const docs = await tx.getAll('search_document');
    return docs.reduce((max, doc) => Math.max(max, Number(doc.id ?? 0)), 0) + 1;
  }

  private async buildSearchText(
    tx: PortableTransaction,
    entityType: string,
    row: EngineRow,
  ): Promise<{ title: string; subtitle: string | null; body: string } | null> {
    const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));
    switch (entityType) {
      case 'party': {
        const contacts = (await tx.getAll('party_contact')).filter((contact) => contact.party_id === row.id && contact.deleted_at === null);
        const aliases = (await tx.getAll('party_alias')).filter((alias) => alias.party_id === row.id && alias.deleted_at === null);
        return {
          title: text(row.display_name),
          subtitle: null,
          body: [text(row.notes), ...aliases.map((alias) => text(alias.alias)), ...contacts.map((contact) => text(contact.value))].join(' '),
        };
      }
      case 'case_file':
        return {
          title: text(row.title),
          subtitle: text(row.file_number),
          body: [text(row.description), text(row.file_number)].join(' '),
        };
      case 'legal_case': {
        const court = row.court_id ? await tx.get('court', String(row.court_id)) : undefined;
        return {
          title: `${text(row.case_number)} / ${text(row.case_year)}`,
          subtitle: text(court?.name),
          body: [text(row.subject), text(row.notes)].join(' '),
        };
      }
      case 'court':
        return { title: text(row.name), subtitle: null, body: text(row.address) };
      case 'hearing':
        return {
          title: `جلسة ${text(row.scheduled_at)}`,
          subtitle: null,
          body: [text(row.purpose), text(row.outcome_summary), text(row.notes)].join(' '),
        };
      case 'judgment':
        return {
          title: `حكم ${text(row.judgment_number)}`,
          subtitle: text(row.issued_on),
          body: [text(row.operative_part), text(row.reasoning), text(row.notes)].join(' '),
        };
      case 'task':
        return { title: text(row.title), subtitle: null, body: [text(row.description), text(row.notes)].join(' ') };
      case 'document':
        return { title: text(row.title), subtitle: text(row.doc_number), body: [text(row.notes), text(row.external_ref)].join(' ') };
      case 'contract':
        return { title: text(row.title), subtitle: text(row.contract_number), body: text(row.notes) };
      case 'power_of_attorney':
        return { title: text(row.poa_number), subtitle: null, body: [text(row.scope), text(row.notes)].join(' ') };
      case 'appointment':
        return { title: text(row.title), subtitle: text(row.start_at), body: text(row.notes) };
      default:
        return null;
    }
  }

  async search(
    query: string,
    options: { entityType?: string; limit?: number; offset?: number } = {},
  ): Promise<Array<{ entityType: string; entityId: string; title: string; subtitle: string | null; snippet: string; rank: number }>> {
    const normalized = normalizeArabic(query);
    const tokens = [...new Set(normalized.split(/\s+/).filter(Boolean))].slice(0, 20);
    if (tokens.length === 0) return [];
    let docs = await this.conn.getAll('search_document');
    if (options.entityType) docs = docs.filter((doc) => doc.entity_type === options.entityType);
    const hits = docs
      .filter((doc) => tokens.every((token) => String(doc.normalized_text).includes(token)))
      .map((doc) => {
        const body = String(doc.normalized_text);
        const position = body.indexOf(tokens[0]!);
        const start = Math.max(0, position - 30);
        return {
          entityType: String(doc.entity_type),
          entityId: String(doc.entity_id),
          title: String(doc.title),
          subtitle: doc.subtitle === null ? null : String(doc.subtitle),
          snippet: `${start > 0 ? '…' : ''}${body.slice(start, start + 90)}${body.length > start + 90 ? '…' : ''}`,
          rank: position,
        };
      })
      .sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title));
    const offset = Math.max(0, Math.trunc(options.offset ?? 0));
    const limit = Math.max(1, Math.min(200, Math.trunc(options.limit ?? 20)));
    return hits.slice(offset, offset + limit).map((hit, index) => ({ ...hit, rank: index }));
  }

  async rebuildSearch(): Promise<{ documents: number }> {
    await this.store.clear('search_document');
    const entities = ['party', 'case_file', 'legal_case', 'court', 'hearing', 'judgment', 'task', 'document', 'contract', 'power_of_attorney', 'appointment'];
    for (const entityType of entities) {
      const definition = tryGetSyncEntity(entityType);
      if (!definition) continue;
      for (const row of await this.conn.getAll(definition.table)) {
        if (row.deleted_at === null) {
          await this.store.transaction(['search_document', definition.table], async (tx) => {
            await this.refreshSearch(tx, entityType, String(row[definition.primaryKeyColumn]));
          });
        }
      }
    }
    return { documents: await this.conn.count('search_document') };
  }


  // ---------------------------------------------------------------------
  // Domain operations (same semantics on both engines)
  // ---------------------------------------------------------------------

  private async lookupId(listCode: string, code: string): Promise<string> {
    return String((await this.lookup(listCode, code)).id);
  }

  async createPerson(input: CreatePersonInput, options: { client?: boolean } = {}): Promise<Record<string, unknown>> {
    if (!input.firstName?.trim()) throw new ValidationError('first name is required');
    if (!input.lastName?.trim()) throw new ValidationError('last name is required');
    const displayName = [input.firstName, input.middleName, input.lastName]
      .filter((part) => part && part.trim())
      .join(' ')
      .trim();
    return this.transaction(async (tx) => {
      const party = await this.insert('party', {
        kind: 'person',
        display_name: displayName,
        status_id: await this.lookupId('party_status', 'active'),
        notes: input.notes ?? null,
      });
      await this.insert(
        'person',
        {
          first_name: input.firstName.trim(),
          middle_name: input.middleName?.trim() || null,
          last_name: input.lastName.trim(),
          national_id: input.nationalId?.trim() || null,
          national_id_type: input.nationalId ? 'national_id' : null,
          birth_date: input.birthDate ?? null,
          gender: input.gender ?? 'unknown',
          nationality: 'EG',
          marital_status_id: null,
          occupation: input.occupation ?? null,
          death_date: null,
        },
        { id: String(party.id) },
      );
      if (options.client ?? true) {
        const clientCode = (await this.nextNumber('client.code')).formatted;
        await this.insert(
          'client_profile',
          {
            client_code: clientCode,
            client_since: this.now().slice(0, 10),
            status_id: null,
            source_id: null,
            notes: null,
            archived_at: null,
          },
          { id: String(party.id) },
        );
      }
      await this.refreshPartySearch(tx, String(party.id));
      return (await this.getPartyFull(String(party.id)))! as unknown as Record<string, unknown>;
    });
  }

  private async refreshPartySearch(tx: PortableTransaction, partyId: string): Promise<void> {
    await this.refreshSearch(tx, 'party', partyId);
  }

  async getPartyFull(partyId: string): Promise<Record<string, unknown> | null> {
    const party = await this.get('party', partyId);
    if (!party) return null;
    const person = await this.conn.get('person', partyId);
    const organization = await this.conn.get('organization', partyId);
    const client = await this.conn.get('client_profile', partyId);
    const contacts = (await this.conn.getByColumns('party_contact', { party_id: partyId })).filter(
      (row) => row.deleted_at === null,
    );
    const addresses = (await this.conn.getByColumns('party_address', { party_id: partyId })).filter(
      (row) => row.deleted_at === null,
    );
    return {
      party,
      person: person?.deleted_at === null ? person : null,
      organization: organization?.deleted_at === null ? organization : null,
      client: client?.deleted_at === null ? client : null,
      contacts,
      addresses,
    };
  }

  async addContact(partyId: string, input: { typeCode: string; value: string; isPrimary?: boolean }): Promise<EngineRow> {
    if (!input.value?.trim()) throw new ValidationError('contact value is required');
    return this.transaction(async () => {
      const contact = await this.insert('party_contact', {
        party_id: partyId,
        contact_type_id: await this.lookupId('contact_type', input.typeCode),
        value: input.value.trim(),
        label: null,
        is_primary: input.isPrimary ? 1 : 0,
        verified_at: null,
      });
      return contact;
    });
  }

  async addAddress(partyId: string, input: { city?: string; street?: string; governorateCode?: string }): Promise<EngineRow> {
    return this.insert('party_address', {
      party_id: partyId,
      address_type_id: null,
      country: 'EG',
      governorate_id: input.governorateCode ? await this.lookupId('governorate', input.governorateCode) : null,
      city: input.city ?? null,
      district: null,
      street: input.street ?? null,
      building_no: null,
      floor: null,
      apartment: null,
      postal_code: null,
      is_primary: 0,
      notes: null,
    });
  }

  async createCourt(input: { name: string; courtKindCode?: string }): Promise<EngineRow> {
    if (!input.name?.trim()) throw new ValidationError('court name is required');
    return this.insert('court', {
      name: input.name.trim(),
      court_kind_id: await this.lookupId('court_kind', input.courtKindCode ?? 'primary'),
      parent_id: null,
      governorate_id: null,
      address: null,
      phone: null,
      notes: null,
      is_active: 1,
      archived_at: null,
    });
  }

  async createFile(input: {
    title: string;
    clientPartyIds?: readonly string[];
    practiceAreaCode?: string;
    fileTypeCode?: string;
    openedOn?: string;
    description?: string;
  }): Promise<EngineRow> {
    if (!input.title?.trim()) throw new ValidationError('file title is required');
    return this.transaction(async (tx) => {
      const id = newId();
      const fileNumber = (await this.nextNumber('file.number')).formatted;
      const file = await this.insert('case_file', {
        file_number: fileNumber,
        title: input.title.trim(),
        file_type_id: await this.lookupId('file_type', input.fileTypeCode ?? 'primary'),
        practice_area_id: input.practiceAreaCode
          ? await this.lookupId('practice_area', input.practiceAreaCode)
          : null,
        status_id: await this.lookupId('file_status', 'open'),
        priority_id: null,
        confidentiality_id: null,
        responsible_party_id: null,
        parent_file_id: null,
        root_file_id: null,
        opened_on: input.openedOn ?? this.now().slice(0, 10),
        closed_on: null,
        description: input.description ?? null,
        archived_at: null,
      }, { id });
      void tx;
      for (const [index, partyId] of [...new Set(input.clientPartyIds ?? [])].entries()) {
        await this.addFileParty({
          fileId: String(file.id),
          partyId,
          roleCode: 'client',
          sideCode: 'claimant',
          isPrimary: index === 0,
        });
      }
      return file;
    });
  }

  async addFileParty(input: {
    fileId: string;
    partyId: string;
    roleCode: string;
    sideCode?: string;
    isPrimary?: boolean;
    startDate?: string;
    endDate?: string;
  }): Promise<EngineRow> {
    const rows = await this.conn.getByColumns('case_file_party', { file_id: input.fileId });
    const active = rows.filter((row) => row.deleted_at === null);
    const roleId = await this.lookupId('party_role', input.roleCode);
    if (active.some((row) => row.party_id === input.partyId && row.role_id === roleId)) {
      throw new ConflictError('party already has this role in the file', 'ALREADY_EXISTS', {
        fileId: input.fileId,
        partyId: input.partyId,
        role: input.roleCode,
      });
    }
    const ordinal =
      active.reduce((max, row) => Math.max(max, Number(row.ordinal ?? 0)), 0) + 10;
    return this.insert('case_file_party', {
      file_id: input.fileId,
      case_id: null,
      party_id: input.partyId,
      role_id: roleId,
      side_id: input.sideCode ? await this.lookupId('party_side', input.sideCode) : null,
      ordinal,
      is_primary: input.isPrimary ? 1 : 0,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      notes: null,
    });
  }

  async getFileFull(fileId: string): Promise<PortableFileFull | null> {
    const file = await this.get('case_file', fileId);
    if (!file) return null;
    const links = (await this.conn.getByColumns('case_file_party', { file_id: fileId })).filter(
      (row) => row.deleted_at === null,
    );
    const parties: EngineRow[] = [];
    for (const link of links) {
      const party = await this.conn.get('party', String(link.party_id));
      const role = await this.conn.get('lookup_item', String(link.role_id));
      if (party) parties.push({ ...link, display_name: party.display_name ?? null, role_name: role?.name_ar ?? null });
    }
    const caseLinks = (await this.conn.getByColumns('case_file_case', { file_id: fileId })).filter(
      (row) => row.deleted_at === null,
    );
    const relatedCases: EngineRow[] = [];
    for (const link of caseLinks) {
      const legalCase = await this.conn.get('legal_case', String(link.case_id));
      if (legalCase) relatedCases.push(legalCase);
    }
    const subFiles = (await this.conn.getByColumns('case_file', { parent_file_id: fileId })).filter(
      (row) => row.deleted_at === null,
    );
    return { file, parties, cases: relatedCases, subFiles };
  }

  async createSubFile(parentFileId: string, input: { title: string; practiceAreaCode?: string }): Promise<EngineRow> {
    const parent = await this.require('case_file', parentFileId);
    const id = newId();
    const fileNumber = (await this.nextNumber('file.number')).formatted;
    return this.insert('case_file', {
      file_number: fileNumber,
      title: input.title.trim(),
      file_type_id: await this.lookupId('file_type', 'sub'),
      practice_area_id: input.practiceAreaCode
        ? await this.lookupId('practice_area', input.practiceAreaCode)
        : null,
      status_id: await this.lookupId('file_status', 'open'),
      priority_id: null,
      confidentiality_id: null,
      responsible_party_id: null,
      parent_file_id: parentFileId,
      root_file_id: String(parent.root_file_id ?? parent.id),
      opened_on: this.now().slice(0, 10),
      closed_on: null,
      description: null,
      archived_at: null,
    }, { id });
  }

  async createCase(input: {
    caseNumber: string;
    caseYear: number;
    caseTypeCode?: string;
    courtId?: string;
    fileIds?: readonly string[];
    litigationDegreeCode?: string;
    subject?: string;
  }): Promise<EngineRow> {
    if (!input.caseNumber?.trim()) throw new ValidationError('case number is required');
    return this.transaction(async () => {
      const legalCase = await this.insert('legal_case', {
        court_id: input.courtId ?? null,
        circuit_id: null,
        case_number: input.caseNumber.trim(),
        case_year: input.caseYear,
        case_type_id: await this.lookupId('case_type', input.caseTypeCode ?? 'civil'),
        litigation_degree_id: input.litigationDegreeCode
          ? await this.lookupId('litigation_degree', input.litigationDegreeCode)
          : null,
        status_id: await this.lookupId('case_status', 'registered'),
        registration_date: this.now().slice(0, 10),
        subject: input.subject ?? null,
        claim_amount_minor: null,
        currency_code: 'EGP',
        notes: null,
        archived_at: null,
      });
      for (const fileId of input.fileIds ?? []) await this.linkCase(String(legalCase.id), fileId);
      return legalCase;
    });
  }

  async linkCase(caseId: string, fileId: string): Promise<EngineRow> {
    const existing = (await this.conn.getByColumns('case_file_case', { case_id: caseId })).filter(
      (row) => row.file_id === fileId && row.deleted_at === null,
    );
    if (existing.length > 0) throw new ConflictError('case already linked to file', 'ALREADY_EXISTS');
    return this.insert('case_file_case', {
      file_id: fileId,
      case_id: caseId,
      relation_type_id: await this.lookupId('file_relation_type', 'related'),
      is_primary: 0,
      notes: null,
    });
  }

  async getCaseFull(caseId: string): Promise<{ legalCase: EngineRow; files: EngineRow[]; hearings: EngineRow[]; judgments: EngineRow[] }> {
    const legalCase = await this.require('legal_case', caseId);
    const links = (await this.conn.getByColumns('case_file_case', { case_id: caseId })).filter(
      (row) => row.deleted_at === null,
    );
    const files: EngineRow[] = [];
    for (const link of links) {
      const file = await this.conn.get('case_file', String(link.file_id));
      if (file && file.deleted_at === null) files.push(file);
    }
    const hearings = (await this.conn.getByColumns('hearing', { case_id: caseId }))
      .filter((row) => row.deleted_at === null)
      .sort((left, right) => String(left.scheduled_at).localeCompare(String(right.scheduled_at)));
    const judgments = (await this.conn.getByColumns('judgment', { case_id: caseId })).filter(
      (row) => row.deleted_at === null,
    );
    return { legalCase, files, hearings, judgments };
  }

  async scheduleHearing(input: {
    caseId: string;
    scheduledAt: string;
    purposeCode?: string;
    courtId?: string;
  }): Promise<EngineRow> {
    const legalCase = await this.require('legal_case', input.caseId);
    return this.insert('hearing', {
      case_id: input.caseId,
      court_id: input.courtId ?? legalCase.court_id ?? null,
      circuit_id: legalCase.circuit_id ?? null,
      scheduled_at: input.scheduledAt,
      timezone: 'Africa/Cairo',
      purpose: input.purposeCode ? await this.lookupId('hearing_purpose', input.purposeCode) : null,
      status_id: await this.lookupId('hearing_status', 'scheduled'),
      held_at: null,
      outcome_summary: null,
      court_decision: null,
      postponement_reason: null,
      required_actions: null,
      next_hearing_id: null,
      notes: null,
    });
  }

  async recordHearing(hearingId: string, input: { statusCode?: string; heldAt?: string; outcomeSummary?: string }): Promise<EngineRow> {
    const statusCode = input.statusCode ?? 'held';
    const patch: Record<string, unknown> = {
      status_id: await this.lookupId('hearing_status', statusCode),
      outcome_summary: input.outcomeSummary ?? null,
    };
    if (statusCode === 'held') patch.held_at = input.heldAt ?? this.now();
    return this.update('hearing', hearingId, patch);
  }

  async scheduleNextHearing(previousHearingId: string, input: { scheduledAt: string }): Promise<EngineRow> {
    const previous = await this.require('hearing', previousHearingId);
    if (input.scheduledAt <= String(previous.scheduled_at)) {
      throw new ValidationError('next hearing must be scheduled after the previous hearing');
    }
    return this.transaction(async () => {
      const next = await this.scheduleHearing({
        caseId: String(previous.case_id),
        scheduledAt: input.scheduledAt,
        ...(previous.purpose ? { purposeCode: String(previous.purpose) } : {}),
      });
      await this.update('hearing', previousHearingId, { next_hearing_id: String(next.id) });
      return next;
    });
  }

  async recordJudgment(input: {
    caseId: string;
    hearingId?: string;
    issuedOn: string;
    judgmentTypeCode?: string;
    operativePart?: string;
    reasoning?: string;
    fileIds?: readonly string[];
  }): Promise<EngineRow> {
    const legalCase = await this.require('legal_case', input.caseId);
    return this.transaction(async () => {
      const judgment = await this.insert('judgment', {
        case_id: input.caseId,
        hearing_id: input.hearingId ?? null,
        court_id: legalCase.court_id ?? null,
        judgment_number: null,
        issued_on: input.issuedOn,
        judgment_type_id: await this.lookupId('judgment_type', input.judgmentTypeCode ?? 'preliminary'),
        status_id: await this.lookupId('judgment_status', 'issued'),
        operative_part: input.operativePart ?? null,
        reasoning: input.reasoning ?? null,
        deposit_date: null,
        copy_received_on: null,
        user_appeal_deadline: null,
        appeal_notes: null,
        notes: null,
      });
      for (const fileId of input.fileIds ?? []) {
        await this.insert('judgment_file_link', {
          judgment_id: String(judgment.id),
          file_id: fileId,
          notes: null,
        });
      }
      return judgment;
    });
  }

  async getJudgmentFull(judgmentId: string): Promise<{ judgment: EngineRow; files: EngineRow[] }> {
    const judgment = await this.require('judgment', judgmentId);
    const links = (await this.conn.getByColumns('judgment_file_link', { judgment_id: judgmentId })).filter(
      (row) => row.deleted_at === null,
    );
    const files: EngineRow[] = [];
    for (const link of links) {
      const file = await this.conn.get('case_file', String(link.file_id));
      if (file) files.push(file);
    }
    return { judgment, files };
  }

  async createTask(input: {
    title: string;
    taskTypeCode?: string;
    fileId?: string;
    caseId?: string;
    hearingId?: string;
    judgmentId?: string;
    dueAt?: string;
    description?: string;
  }): Promise<EngineRow> {
    if (!input.title?.trim()) throw new ValidationError('task title is required');
    return this.insert('task', {
      title: input.title.trim(),
      description: input.description ?? null,
      task_type_id: input.taskTypeCode ? await this.lookupId('task_type', input.taskTypeCode) : null,
      status_id: await this.lookupId('task_status', 'open'),
      priority_id: await this.lookupId('priority', 'normal'),
      file_id: input.fileId ?? null,
      case_id: input.caseId ?? null,
      hearing_id: input.hearingId ?? null,
      judgment_id: input.judgmentId ?? null,
      client_party_id: null,
      assignee_party_id: null,
      parent_task_id: null,
      due_at: input.dueAt ?? null,
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      suspension_reason: null,
      result_summary: null,
      notes: null,
    });
  }

  async changeTaskStatus(
    taskId: string,
    statusCode: string,
    options: { resultSummary?: string; suspensionReason?: string } = {},
  ): Promise<EngineRow> {
    const task = await this.require('task', taskId);
    const statusId = await this.lookupId('task_status', statusCode);
    if (task.status_id === statusId) return task;
    return this.transaction(async () => {
      const patch: Record<string, unknown> = { status_id: statusId };
      if (statusCode === 'completed') {
        patch.completed_at = this.now();
        patch.cancelled_at = null;
        if (options.resultSummary !== undefined) patch.result_summary = options.resultSummary;
      } else if (statusCode === 'cancelled') {
        patch.cancelled_at = this.now();
      } else if (statusCode === 'in_progress') {
        patch.started_at = task.started_at ?? this.now();
      } else if (statusCode === 'blocked' || statusCode === 'waiting') {
        patch.suspension_reason = options.suspensionReason ?? task.suspension_reason ?? null;
      }
      const updated = await this.update('task', taskId, patch);
      await this.insert('task_status_history', {
        task_id: taskId,
        from_status_id: task.status_id,
        to_status_id: statusId,
        changed_at: this.now(),
        changed_by_device_id: this.deviceId,
        note: options.suspensionReason ?? options.resultSummary ?? null,
      });
      return updated;
    });
  }

  async getTaskFull(taskId: string): Promise<{ task: EngineRow; statusHistory: EngineRow[] }> {
    const task = await this.require('task', taskId);
    const statusHistory = (await this.conn.getByColumns('task_status_history', { task_id: taskId })).sort(
      (left, right) => String(left.changed_at).localeCompare(String(right.changed_at)),
    );
    return { task, statusHistory };
  }

  async registerDocument(input: {
    title: string;
    docTypeCode?: string;
    docNumber?: string;
    docDate?: string;
    fileId?: string;
    caseId?: string;
    notes?: string;
  }): Promise<EngineRow> {
    if (!input.title?.trim()) throw new ValidationError('document title is required');
    return this.transaction(async () => {
      const document = await this.insert('document', {
        title: input.title.trim(),
        doc_type_id: await this.lookupId('document_type', input.docTypeCode ?? 'other'),
        doc_number: input.docNumber ?? null,
        doc_date: input.docDate ?? null,
        source_party_id: null,
        content_state: 'not_digitized',
        physical_location: null,
        external_ref: null,
        confidentiality_id: null,
        status_id: null,
        notes: input.notes ?? null,
        archived_at: null,
      });
      if (input.fileId) await this.linkDocument(String(document.id), { kind: 'file', id: input.fileId });
      if (input.caseId) await this.linkDocument(String(document.id), { kind: 'case', id: input.caseId });
      return document;
    });
  }

  async addDocumentVersion(
    documentId: string,
    input: {
      fileName?: string;
      storageKind: 'local_file' | 'external_reference' | 'paper';
      storagePath?: string;
      checksumSha256?: string;
      byteSize?: number;
    },
  ): Promise<EngineRow> {
    if (input.storageKind === 'local_file' && !input.fileName?.trim()) {
      throw new ValidationError('fileName is required for a local file version');
    }
    const versions = await this.conn.getByColumns('document_version', { document_id: documentId });
    const versionNo = versions.reduce((max, row) => Math.max(max, Number(row.version_no ?? 0)), 0) + 1;
    return this.transaction(async () => {
      const version = await this.insert('document_version', {
        document_id: documentId,
        version_no: versionNo,
        file_name: input.fileName ?? null,
        storage_kind: input.storageKind,
        storage_path: input.storagePath ?? null,
        mime_type: null,
        byte_size: input.byteSize ?? null,
        checksum_sha256: input.checksumSha256 ?? null,
        storage_state: 'registered',
        verified_at: null,
        notes: null,
      });
      if (input.storageKind === 'local_file') {
        await this.update('document', documentId, { content_state: 'pending' });
      }
      return version;
    });
  }

  async linkDocument(documentId: string, target: { kind: 'file' | 'case' | 'hearing' | 'judgment' | 'contract' | 'poa' | 'party' | 'task'; id: string }): Promise<EngineRow> {
    const column = target.kind === 'poa' ? 'power_of_attorney_id' : `${target.kind}_id`;
    return this.insert('document_link', {
      document_id: documentId,
      file_id: null,
      case_id: null,
      hearing_id: null,
      judgment_id: null,
      contract_id: null,
      power_of_attorney_id: null,
      party_id: null,
      task_id: null,
      [column]: target.id,
      notes: null,
    });
  }

  async createAccount(input: { name: string; kindCode?: string; openingBalanceMinor?: number }): Promise<EngineRow> {
    return this.insert('financial_account', {
      name: input.name.trim(),
      account_kind_id: await this.lookupId('account_kind', input.kindCode ?? 'cash'),
      currency_code: 'EGP',
      opening_balance_minor: input.openingBalanceMinor ?? 0,
      opened_on: this.now().slice(0, 10),
      is_active: 1,
      notes: null,
    });
  }

  async createCharge(input: {
    clientPartyId: string;
    fileId?: string;
    description: string;
    amountMinor: number;
    dueOn?: string;
  }): Promise<EngineRow> {
    if (!this.isPositiveMinor(input.amountMinor)) throw new ValidationError('charge amount must be positive');
    return this.insert('financial_charge', {
      client_party_id: input.clientPartyId,
      file_id: input.fileId ?? null,
      fee_agreement_id: null,
      charge_type_id: null,
      description: input.description,
      amount_minor: input.amountMinor,
      currency_code: 'EGP',
      issued_on: this.now().slice(0, 10),
      due_on: input.dueOn ?? null,
      status_id: await this.lookupId('charge_status', 'outstanding'),
      notes: null,
    });
  }

  async postTransaction(input: {
    accountId: string;
    direction: 'in' | 'out';
    amountMinor: number;
    clientPartyId?: string;
    fileId?: string;
    occurredAt?: string;
    methodCode?: string;
    description?: string;
    receiptNo?: string;
    reversesTransactionId?: string;
  }): Promise<EngineRow> {
    if (!this.isPositiveMinor(input.amountMinor)) throw new ValidationError('amount must be positive');
    if (input.direction !== 'in' && input.direction !== 'out') throw new ValidationError('invalid direction');
    const account = await this.require('financial_account', input.accountId);
    const receiptNo =
      input.receiptNo ?? ((await this.nextNumber('receipt.number')).formatted);
    return this.insert('financial_transaction', {
      account_id: input.accountId,
      direction: input.direction,
      transaction_type_id: null,
      amount_minor: input.amountMinor,
      currency_code: String(account.currency_code),
      occurred_at: input.occurredAt ?? this.now(),
      method_id: input.methodCode ? await this.lookupId('payment_method', input.methodCode) : null,
      reference_no: null,
      receipt_no: receiptNo,
      client_party_id: input.clientPartyId ?? null,
      file_id: input.fileId ?? null,
      fee_agreement_id: null,
      category_id: null,
      description: input.description ?? null,
      status: 'posted',
      void_reason: null,
      voided_at: null,
      reverses_transaction_id: input.reversesTransactionId ?? null,
    });
  }

  async allocate(transactionId: string, chargeId: string, amountMinor: number): Promise<EngineRow> {
    if (!this.isPositiveMinor(amountMinor)) throw new ValidationError('allocation amount must be positive');
    return this.transaction(async () => {
      const transaction = await this.require('financial_transaction', transactionId);
      const charge = await this.require('financial_charge', chargeId);
      if (transaction.status !== 'posted') throw new ValidationError('cannot allocate a voided transaction');
      const allocatedPayment = await this.sumAllocations('transaction_id', transactionId);
      const allocatedCharge = await this.sumAllocations('charge_id', chargeId);
      if (allocatedPayment + amountMinor > Number(transaction.amount_minor)) {
        throw new ValidationError('amount exceeds the unallocated payment balance');
      }
      if (allocatedCharge + amountMinor > Number(charge.amount_minor)) {
        throw new ValidationError('amount exceeds the outstanding charge balance');
      }
      const allocation = await this.insert('payment_allocation', {
        transaction_id: transactionId,
        charge_id: chargeId,
        amount_minor: amountMinor,
        notes: null,
      });
      const paid = allocatedCharge + amountMinor;
      const statusCode = paid >= Number(charge.amount_minor) ? 'paid' : 'partially_paid';
      await this.update('financial_charge', chargeId, {
        status_id: await this.lookupId('charge_status', statusCode),
      });
      return allocation;
    });
  }

  private async sumAllocations(
    column: 'transaction_id' | 'charge_id',
    id: string,
  ): Promise<number> {
    const rows = await this.conn.getByColumns('payment_allocation', { [column]: id });
    let total = 0;
    for (const row of rows) {
      if (row.deleted_at !== null) continue;
      const transaction = await this.conn.get('financial_transaction', String(row.transaction_id));
      if (!transaction || transaction.status !== 'posted') continue;
      if (await this.isReversed(String(transaction.id))) continue;
      total += Number(row.amount_minor);
    }
    return total;
  }

  private async isReversed(transactionId: string): Promise<boolean> {
    const reversals = await this.conn.getByColumns('financial_transaction', {
      reverses_transaction_id: transactionId,
    });
    return reversals.some((row) => row.status === 'posted' && row.deleted_at === null);
  }

  async accountBalance(accountId: string): Promise<number> {
    const account = await this.require('financial_account', accountId);
    const transactions = (await this.conn.getByColumns('financial_transaction', { account_id: accountId })).filter(
      (row) => row.status === 'posted' && row.deleted_at === null,
    );
    // Same rule as the SQLite engine: both the original posting and its
    // posted reversal count, so a reversal nets to zero instead of removing
    // the original only.
    let total = Number(account.opening_balance_minor ?? 0);
    for (const transaction of transactions) {
      total += transaction.direction === 'in' ? Number(transaction.amount_minor) : -Number(transaction.amount_minor);
    }
    return total;
  }

  async chargeBalance(chargeId: string): Promise<{ amountMinor: number; paidMinor: number; outstandingMinor: number }> {
    const charge = await this.require('financial_charge', chargeId);
    const paid = await this.sumAllocations('charge_id', chargeId);
    return {
      amountMinor: Number(charge.amount_minor),
      paidMinor: paid,
      outstandingMinor: Number(charge.amount_minor) - paid,
    };
  }

  async reverseTransaction(transactionId: string, reason: string): Promise<EngineRow> {
    if (!reason?.trim()) throw new ValidationError('reversal reason is required');
    const original = await this.require('financial_transaction', transactionId);
    if (original.status !== 'posted') throw new ValidationError('only posted transactions can be reversed');
    return this.transaction(async () => {
      const reversal = await this.postTransaction({
        accountId: String(original.account_id),
        direction: original.direction === 'in' ? 'out' : 'in',
        amountMinor: Number(original.amount_minor),
        ...(original.client_party_id ? { clientPartyId: String(original.client_party_id) } : {}),
        ...(original.file_id ? { fileId: String(original.file_id) } : {}),
        reversesTransactionId: transactionId,
        description: `قيد عكسي: ${reason.trim()}`,
      });
      const charges = (await this.conn.getByColumns('payment_allocation', { transaction_id: transactionId })).map(
        (row) => String(row.charge_id),
      );
      for (const chargeId of new Set(charges)) {
        const paid = await this.sumAllocations('charge_id', chargeId);
        const charge = await this.require('financial_charge', chargeId);
        const code = paid <= 0 ? 'outstanding' : paid >= Number(charge.amount_minor) ? 'paid' : 'partially_paid';
        await this.update('financial_charge', chargeId, { status_id: await this.lookupId('charge_status', code) });
      }
      return reversal;
    });
  }

  private isPositiveMinor(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
  }

  async healthCheck(): Promise<{ ok: boolean; errors: string[]; tables: number; rows: number }> {
    const errors: string[] = [];
    let rows = 0;
    const exported = await this.store.exportAll();
    for (const table of this.schema.tables) {
      const tableRows = exported[table.name] ?? [];
      rows += tableRows.length;
      const seen = new Set<string>();
      for (const row of tableRows) {
        try {
          this.assertLocalConstraints(table.name, row);
        } catch (error) {
          errors.push(`${table.name}: ${(error as Error).message}`);
        }
        const key = table.primaryKey.map((column) => String(row[column] ?? '')).join('\u0000');
        if (seen.has(key)) errors.push(`${table.name}: duplicate key ${key}`);
        seen.add(key);
        for (const foreignKey of table.foreignKeys) {
          const values = foreignKey.columns.map((column) => row[column] ?? null);
          if (values.some((value) => value === null)) continue;
          const parents = exported[foreignKey.referencedTable] ?? [];
          const found = parents.some((parent) =>
            foreignKey.referencedColumns.every((column, index) => (parent[column] ?? null) === values[index]),
          );
          if (!found) errors.push(`${table.name}: dangling ${foreignKey.columns.join(',')} -> ${foreignKey.referencedTable}`);
        }
      }
    }
    return { ok: errors.length === 0, errors: errors.slice(0, 50), tables: this.schema.tables.length, rows };
  }

  // ---------------------------------------------------------------------
  // Backup (logical, engine-neutral)
  // ---------------------------------------------------------------------

  async exportBackup(): Promise<PortableBackup> {
    const tables = await this.store.exportAll();
    const counts: Record<string, number> = {};
    for (const [table, rows] of Object.entries(tables)) counts[table] = rows.length;
    const sha256 = await checksumTables(tables);
    return {
      format: 'lawo-portable-backup',
      formatVersion: 1,
      createdAt: this.now(),
      schemaVersion: 1,
      applicationId: SCHEMA.applicationId,
      engine: this.store.engine,
      deviceId: this.deviceId,
      appVersion: this.appVersion,
      tables,
      counts,
      sha256,
    };
  }

  async verifyBackup(backup: unknown): Promise<PortableBackupVerification> {
    const errors: string[] = [];
    const violations: string[] = [];
    const uniqueViolations: string[] = [];
    const candidate = backup as Partial<PortableBackup> | null;
    if (!candidate || candidate.format !== 'lawo-portable-backup') {
      return {
        valid: false,
        errors: ['not a law-office portable backup'],
        sha256: null,
        schemaVersion: null,
        applicationId: null,
        deviceId: null,
        totalRows: 0,
        foreignKeyViolations: [],
        uniqueViolations: [],
      };
    }
    if (candidate.schemaVersion !== SCHEMA.schemaVersion) errors.push(`schema version ${candidate.schemaVersion} is not supported`);
    if (candidate.applicationId !== SCHEMA.applicationId) errors.push('application id mismatch');
    const tables = (candidate.tables ?? {}) as Record<string, EngineRow[]>;
    for (const table of this.schema.tables) {
      if (!tables[table.name]) errors.push(`missing table ${table.name}`);
    }
    const recomputed = await checksumTables(tables);
    if (recomputed !== candidate.sha256) errors.push('checksum does not match content');
    let totalRows = 0;
    for (const [tableName, rows] of Object.entries(tables)) {
      const table = this.tables.get(tableName);
      if (!table) {
        errors.push(`unknown table ${tableName}`);
        continue;
      }
      totalRows += rows.length;
      const seen = new Set<string>();
      for (const row of rows) {
        const key = table.primaryKey.map((column) => String(row[column] ?? '')).join('\u0000');
        if (seen.has(key)) uniqueViolations.push(`${tableName}: duplicate key ${key}`);
        seen.add(key);
        try {
          this.assertLocalConstraints(tableName, row);
        } catch (error) {
          errors.push(`${tableName}: ${(error as Error).message}`);
        }
        for (const foreignKey of table.foreignKeys) {
          const values = foreignKey.columns.map((column) => row[column] ?? null);
          if (values.some((value) => value === null)) continue;
          const parentRows = tables[foreignKey.referencedTable] ?? [];
          const found = parentRows.some((parent) =>
            foreignKey.referencedColumns.every((column, index) => (parent[column] ?? null) === values[index]),
          );
          if (!found) violations.push(`${tableName}.${foreignKey.columns.join(',')} -> ${foreignKey.referencedTable}`);
        }
      }
      for (const index of table.indexes.filter((candidateIndex) => candidateIndex.unique)) {
        const keys = new Set<string>();
        for (const row of rows) {
          if (index.where) {
            const predicate = this.partialChecks.get(index.name);
            if (predicate && !predicate.test(row as Row)) continue;
          }
          const values = index.columns.map((column) => row[column] ?? null);
          if (values.some((value) => value === null)) continue;
          const key = values.join('\u0000');
          if (keys.has(key)) uniqueViolations.push(`${tableName}.${index.name}: ${key}`);
          keys.add(key);
        }
      }
    }
    if (violations.length > 0) errors.push(`${violations.length} foreign key violations`);
    if (uniqueViolations.length > 0) errors.push(`${uniqueViolations.length} unique index violations`);
    return {
      valid: errors.length === 0,
      errors,
      sha256: recomputed,
      schemaVersion: candidate.schemaVersion ?? null,
      applicationId: candidate.applicationId ?? null,
      deviceId: candidate.deviceId ?? null,
      totalRows,
      foreignKeyViolations: violations,
      uniqueViolations,
    };
  }

  async restoreBackup(backup: unknown): Promise<{ restoredRows: number; verification: PortableBackupVerification }> {
    const verification = await this.verifyBackup(backup);
    if (!verification.valid) {
      throw new AppError('BACKUP_CORRUPT', 'portable backup failed verification', { errors: verification.errors });
    }
    const candidate = backup as PortableBackup;
    await this.store.importAll(candidate.tables);
    const deviceId = await this.conn.get('app_meta', 'local.device_id');
    if (typeof deviceId?.value === 'string') {
      this.deviceId = deviceId.value;
      const device = await this.conn.get('local_device', deviceId.value);
      if (device) {
        this.device = device;
        this.deviceCode = String(device.short_code);
      }
    }
    await this.store.transaction(['app_meta'], async (tx) => {
      await tx.put('app_meta', toAppMeta('restore.last_at', this.now(), this.now()));
      await tx.put('app_meta', toAppMeta('restore.source_device_id', candidate.deviceId, this.now()));
    });
    return { restoredRows: verification.totalRows, verification };
  }

  async stats(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of ['party', 'client_profile', 'case_file', 'legal_case', 'hearing', 'judgment', 'task', 'document', 'financial_transaction', 'audit_log', 'sync_outbox', 'search_document']) {
      counts[table] = await this.conn.count(table);
    }
    return counts;
  }
}

function toAppMeta(key: string, value: string, now: string): EngineRow {
  return { key, value, updated_at: now };
}

function toEngineRow(values: Record<string, unknown>): EngineRow {
  const row: EngineRow = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) row[key] = null;
    else if (value === null || typeof value === 'string' || typeof value === 'number') row[key] = value;
    else if (typeof value === 'boolean') row[key] = value ? 1 : 0;
    else row[key] = String(value);
  }
  return row;
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError('id must be a UUID');
  }
}

function tryGetSyncEntityByTable(table: string): SyncEntityDefinition | undefined {
  return syncEntityByTable(table);
}

async function checksumTables(tables: Record<string, EngineRow[]>): Promise<string> {
  const canonical = stableStringify(
    Object.fromEntries(
      Object.keys(tables)
        .sort()
        .map((table) => [
          table,
          [...(tables[table] ?? [])].sort((left, right) =>
            stableStringify(left).localeCompare(stableStringify(right)),
          ),
        ]),
    ),
  );
  const bytes = new TextEncoder().encode(canonical);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // Deterministic non-cryptographic fallback for runtimes without WebCrypto.
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

