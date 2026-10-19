import { assertCaseIntegritySync } from '../cases/integrity.ts';
import type { EngineRow } from '../portable/store.ts';
import type {
  DatabaseAdapter,
  SqlParams,
  SqlRow,
  SqlValue,
} from '../db/adapter.ts';
import {
  AppError,
  ConflictError,
  ImmutableRecordError,
  NotFoundError,
  ValidationError,
} from '../errors.ts';
import type { SearchIndexPort } from '../search/search-port.ts';
import type { AuditAction, AuditService } from '../services/audit-service.ts';
import {
  syncEntityByTable,
  type SyncEntityDefinition,
} from '../sync/current-registry.ts';
import type { Clock } from '../util/clock.ts';
import { toCanonicalTimestamp } from '../util/dates.ts';
import { stableStringify } from '../util/stable.ts';
import { assertUuid, newId } from '../util/uuid.ts';

export type EntityRecord = Record<string, SqlValue> & {
  id: string;
  revision: number;
  sync_status: string;
  deleted_at: string | null;
};

export type EntityInput = Readonly<Record<string, SqlValue>>;

export type FilterOperator =
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'LIKE'
  | 'IS NULL'
  | 'IS NOT NULL'
  | 'IN';

export interface ListFilter {
  readonly column: string;
  readonly operator?: FilterOperator;
  readonly value?: SqlValue | readonly SqlValue[];
}

export interface ListOptions {
  readonly filters?: readonly ListFilter[];
  readonly orderBy?: {
    readonly column: string;
    readonly direction?: 'asc' | 'desc';
  };
  readonly limit?: number;
  readonly offset?: number;
  readonly includeDeleted?: boolean;
}

export interface UpdateOptions {
  readonly auditAction?: Extract<AuditAction, 'update' | 'transaction_void'>;
  readonly summary?: string;
}

export interface DeleteResult {
  readonly batchId: string;
  readonly affectedCount: number;
}

export interface RestoreResult {
  readonly batchId: string | null;
  readonly restoredCount: number;
}

export interface RepositoryDependencies {
  readonly db: DatabaseAdapter;
  readonly clock: Clock;
  readonly deviceId: string;
  readonly audit: AuditService;
  readonly search: SearchIndexPort;
  /** Resolves any registered repository, used for cascade delete/restore. */
  readonly repositoryFor: (entityCode: string) => BaseRepository;
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

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_RE.test(identifier)) {
    throw new AppError(
      'UNSUPPORTED_ENGINE',
      `invalid SQL identifier: ${identifier}`,
    );
  }
  return `"${identifier}"`;
}

function assertSqlValue(value: SqlValue, field: string): SqlValue {
  if (value === null || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new ValidationError(`${field} must be finite`, { field });
    return value;
  }
  if (typeof value === 'bigint') {
    if (
      value > BigInt(Number.MAX_SAFE_INTEGER) ||
      value < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new ValidationError(
        `${field} is outside the supported integer range`,
        { field },
      );
    }
    return Number(value);
  }
  throw new ValidationError(`${field} has an unsupported value type`, {
    field,
  });
}

function auditValue(value: SqlValue): string | number | null {
  if (value === null || typeof value === 'string' || typeof value === 'number')
    return value;
  return String(value);
}

/**
 * Generic repository for one registered syncable entity.
 *
 * Every write:
 *  - runs in a transaction,
 *  - bumps `revision` and sets `sync_status = 'pending'`,
 *  - appends a sync outbox row with a monotonic sequence,
 *  - writes an audit row with sensitive values redacted,
 *  - refreshes the derived search index (failure marks a rebuild flag).
 */
export class BaseRepository<T extends EntityRecord = EntityRecord> {
  protected readonly db: DatabaseAdapter;
  protected readonly clock: Clock;
  protected readonly definition: SyncEntityDefinition;
  protected readonly deviceId: string;
  protected readonly audit: AuditService;
  protected readonly search: SearchIndexPort;
  protected readonly columns: readonly string[];
  protected readonly primaryKey: string;

  private readonly repositoryFor: (entityCode: string) => BaseRepository;

  constructor(deps: RepositoryDependencies, definition: SyncEntityDefinition) {
    this.db = deps.db;
    this.clock = deps.clock;
    this.definition = definition;
    this.deviceId = deps.deviceId;
    this.audit = deps.audit;
    this.search = deps.search;
    this.repositoryFor = deps.repositoryFor;

    if (!IDENTIFIER_RE.test(definition.table)) {
      throw new AppError(
        'UNSUPPORTED_ENGINE',
        `invalid table name: ${definition.table}`,
      );
    }
    const info = deps.db.query<{ name: string }>(
      `PRAGMA table_info(${quoteIdentifier(definition.table)})`,
    );
    if (info.length === 0) {
      throw new AppError(
        'UNSUPPORTED_ENGINE',
        `table not found: ${definition.table}`,
      );
    }
    this.columns = info.map((row) => row.name);
    this.primaryKey = definition.primaryKeyColumn;
    if (!this.columns.includes(this.primaryKey)) {
      throw new AppError(
        'UNSUPPORTED_ENGINE',
        `primary key ${this.primaryKey} not found in ${definition.table}`,
      );
    }
    if (!this.columns.includes('deleted_at')) {
      throw new AppError(
        'UNSUPPORTED_ENGINE',
        `syncable table ${definition.table} lacks deleted_at`,
      );
    }
  }

  get entityCode(): string {
    return this.definition.code;
  }

  get tableName(): string {
    return this.definition.table;
  }

  get mutableColumns(): readonly string[] {
    return this.definition.mutableColumns;
  }

  now(): string {
    return toCanonicalTimestamp(this.clock.now());
  }

  getById(
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): T | undefined {
    assertUuid(id, 'id');
    const sql =
      (options.includeDeleted ?? false)
        ? `SELECT * FROM ${quoteIdentifier(this.definition.table)} WHERE ${quoteIdentifier(this.primaryKey)} = ?`
        : `SELECT * FROM ${quoteIdentifier(this.definition.table)} WHERE ${quoteIdentifier(this.primaryKey)} = ? AND deleted_at IS NULL`;
    const row = this.db.get<SqlRow>(sql, [id]);
    return row ? (this.toRecord(row) as T) : undefined;
  }

  requireById(id: string, options: { includeDeleted?: boolean } = {}): T {
    const row = this.getById(id, options);
    if (!row) throw new NotFoundError(this.definition.code, id);
    return row;
  }

  insert(input: EntityInput, options: { id?: string } = {}): T {
    const requestedId = input.id as string | undefined;
    if (
      options.id !== undefined &&
      requestedId !== undefined &&
      options.id !== requestedId
    ) {
      throw new ValidationError('conflicting ids supplied');
    }
    const id = options.id ?? requestedId ?? newId();
    assertUuid(id, 'id');

    for (const header of HEADER_COLUMNS) {
      if (header in input) {
        throw new ValidationError(
          `field ${header} is managed by the repository`,
          { field: header },
        );
      }
    }
    if (this.primaryKey !== 'id' && this.primaryKey in input) {
      throw new ValidationError(`primary key must be supplied as id`, {
        field: this.primaryKey,
      });
    }

    const business: Record<string, SqlValue> = {};
    for (const [key, raw] of Object.entries(input)) {
      if (key === 'id') continue;
      if (!this.columns.includes(key)) {
        throw new ValidationError(
          `unknown field for ${this.definition.code}: ${key}`,
          { field: key },
        );
      }
      business[key] = assertSqlValue(raw, key);
    }

    const now = this.now();
    const record: Record<string, SqlValue> = {
      ...business,
      [this.primaryKey]: id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      origin_device_id: this.deviceId,
      revision: 1,
      sync_status: 'pending',
      last_synced_at: null,
    };

    const columns = Object.keys(record);
    const sql = `INSERT INTO ${quoteIdentifier(this.definition.table)}
      (${columns.map(quoteIdentifier).join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})`;

    return this.db.transaction((tx) => {
      tx.run(
        sql,
        columns.map((column) => record[column] ?? null),
      );
      const row = this.fetchRequired(tx, id);
      assertCaseIntegritySync(tx, this.definition.table, row as EngineRow);
      const changedFields = columns.filter(
        (column) =>
          !HEADER_COLUMNS.includes(column as (typeof HEADER_COLUMNS)[number]),
      );
      this.enqueueOutbox(tx, 'insert', id, row, changedFields);
      this.audit.record(tx, {
        action: 'insert',
        entityType: this.definition.code,
        entityId: id,
        summary: `created ${this.definition.code}`,
        changes: this.changesForValues(business),
        sensitiveColumns: this.definition.sensitiveColumns,
      });
      this.safeSearch(tx, id);
      return row as T;
    });
  }

  update(id: string, patch: EntityInput, options: UpdateOptions = {}): T {
    assertUuid(id, 'id');
    if (
      this.definition.policy === 'append_only' ||
      this.definition.policy === 'immutable'
    ) {
      throw new ImmutableRecordError(this.definition.code, id);
    }

    const allowed = new Set(this.definition.mutableColumns);
    for (const key of Object.keys(patch)) {
      if (key === 'id')
        throw new ValidationError('id cannot be changed', { field: 'id' });
      if (!allowed.has(key)) {
        throw new ValidationError(
          `field ${key} is not mutable on ${this.definition.code}`,
          { field: key },
        );
      }
      if (!this.columns.includes(key)) {
        throw new ValidationError(
          `unknown field for ${this.definition.code}: ${key}`,
          { field: key },
        );
      }
    }

    return this.db.transaction((tx) => {
      const current = this.fetchRequired(tx, id);
      const changes: Record<string, SqlValue> = {};
      for (const [key, raw] of Object.entries(patch)) {
        const value = assertSqlValue(raw, key);
        if (current[key] !== value) changes[key] = value;
      }
      if (Object.keys(changes).length === 0) return current as T;

      const updated = this.applyUpdate(tx, current, changes);
      assertCaseIntegritySync(tx, this.definition.table, updated as EngineRow);
      this.enqueueOutbox(tx, 'update', id, updated, Object.keys(changes));
      const action: AuditAction = options.auditAction ?? 'update';
      this.audit.record(tx, {
        action,
        entityType: this.definition.code,
        entityId: id,
        summary: options.summary ?? `updated ${this.definition.code}`,
        changes: this.changesForDiff(current, changes),
        sensitiveColumns: this.definition.sensitiveColumns,
      });
      this.safeSearch(tx, id);
      return updated as T;
    });
  }

  softDelete(id: string, options: { reason?: string } = {}): DeleteResult {
    assertUuid(id, 'id');
    if (!this.definition.softDelete) {
      throw new ImmutableRecordError(this.definition.code, id);
    }

    return this.db.transaction((tx) => {
      const current = this.fetchRequired(tx, id);
      const batchId = newId();
      const now = this.now();
      tx.run(
        `INSERT INTO deletion_batch
          (id, created_at, origin_device_id, root_entity_type, root_entity_id, policy,
           affected_count, restored_at)
         VALUES (?, ?, ?, ?, ?, 'cascade_owned', 0, NULL)`,
        [batchId, now, this.deviceId, this.definition.code, id],
      );

      const entries: Array<{ entityType: string; entityId: string }> = [];
      const visited = new Set<string>();

      // Fail before touching anything if a restricted relation exists.
      this.assertNoBlockingDependents(tx, id);

      for (const rule of this.definition.dependents) {
        if (rule.policy !== 'cascade') continue;
        const childDefinition = syncEntityByTable(rule.table);
        if (!childDefinition) {
          throw new AppError(
            'UNSUPPORTED_ENGINE',
            `dependent table ${rule.table} is not a registered sync entity`,
          );
        }
        const children = tx.query<{ id: string }>(
          `SELECT ${quoteIdentifier(childDefinition.primaryKeyColumn)} AS id
           FROM ${quoteIdentifier(rule.table)}
           WHERE ${quoteIdentifier(rule.column)} = ? AND deleted_at IS NULL`,
          [id],
        );
        for (const child of children) {
          this.cascadeDeleteInternal(
            tx,
            childDefinition.code,
            child.id,
            batchId,
            entries,
            visited,
          );
        }
      }

      const deleted = this.applyUpdate(tx, current, { deleted_at: now });
      this.enqueueOutbox(tx, 'delete', id, deleted, ['deleted_at']);
      entries.push({ entityType: this.definition.code, entityId: id });
      this.safeSearch(tx, id);

      for (const entry of entries) {
        tx.run(
          `INSERT INTO deletion_entry (id, batch_id, entity_type, entity_id, action, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            batchId,
            entry.entityType,
            entry.entityId,
            entry.entityId === id && entry.entityType === this.definition.code
              ? 'soft_delete'
              : 'cascade_soft_delete',
            now,
          ],
        );
      }
      tx.run('UPDATE deletion_batch SET affected_count = ? WHERE id = ?', [
        entries.length,
        batchId,
      ]);
      this.audit.record(tx, {
        action: 'delete',
        entityType: this.definition.code,
        entityId: id,
        summary: `soft-deleted ${this.definition.code}; affected ${entries.length} rows${options.reason ? `: ${options.reason}` : ''}`,
        changes: { deleted_at: { from: null, to: now } },
        sensitiveColumns: this.definition.sensitiveColumns,
      });

      return { batchId, affectedCount: entries.length };
    });
  }

  restore(id: string): RestoreResult {
    assertUuid(id, 'id');
    if (!this.definition.softDelete) {
      throw new ImmutableRecordError(this.definition.code, id);
    }

    return this.db.transaction((tx) => {
      const current = this.fetchRequired(tx, id, true);
      if (current.deleted_at === null) {
        throw new ConflictError('record is not deleted', 'NOT_DELETED', {
          entity: this.definition.code,
          id,
        });
      }

      const batch = tx.get<{ id: string }>(
        `SELECT b.id
         FROM deletion_batch b
         JOIN deletion_entry e ON e.batch_id = b.id
         WHERE e.entity_type = ? AND e.entity_id = ? AND b.restored_at IS NULL
         ORDER BY b.created_at DESC, b.rowid DESC LIMIT 1`,
        [this.definition.code, id],
      );

      if (!batch) {
        const restored = this.applyUpdate(
          tx,
          current,
          { deleted_at: null },
          true,
        );
        this.enqueueOutbox(tx, 'restore', id, restored, ['deleted_at']);
        this.audit.record(tx, {
          action: 'restore',
          entityType: this.definition.code,
          entityId: id,
          summary: `restored ${this.definition.code}`,
          changes: { deleted_at: { from: current.deleted_at, to: null } },
          sensitiveColumns: this.definition.sensitiveColumns,
        });
        this.safeSearch(tx, id);
        return { batchId: null, restoredCount: 1 };
      }

      const entries = tx.query<{ entity_type: string; entity_id: string }>(
        'SELECT entity_type, entity_id FROM deletion_entry WHERE batch_id = ? ORDER BY rowid',
        [batch.id],
      );
      const restoredRows: Array<{ entityCode: string; id: string }> = [];

      for (const entry of entries) {
        const latest = tx.get<{ id: string }>(
          `SELECT b.id
           FROM deletion_batch b
           JOIN deletion_entry e ON e.batch_id = b.id
           WHERE e.entity_type = ? AND e.entity_id = ? AND b.restored_at IS NULL
           ORDER BY b.created_at DESC, b.rowid DESC LIMIT 1`,
          [entry.entity_type, entry.entity_id],
        );
        if (latest?.id !== batch.id) continue;
        const repo = this.repositoryFor(entry.entity_type);
        const row = repo.getRaw(tx, entry.entity_id, true);
        if (!row || row.deleted_at === null) continue;
        repo.applyRestoreInternal(tx, row);
        restoredRows.push({
          entityCode: entry.entity_type,
          id: entry.entity_id,
        });
      }

      if (restoredRows.length === 0) {
        throw new ConflictError('nothing could be restored', 'INVALID_STATE', {
          entity: this.definition.code,
          id,
        });
      }

      const now = this.now();
      tx.run('UPDATE deletion_batch SET restored_at = ? WHERE id = ?', [
        now,
        batch.id,
      ]);

      for (const restored of restoredRows) {
        this.safeSearch(tx, restored.id);
      }
      this.audit.record(tx, {
        action: 'restore',
        entityType: this.definition.code,
        entityId: id,
        summary: `restored ${this.definition.code}; affected ${restoredRows.length} rows`,
        changes: { deleted_at: { from: current.deleted_at, to: null } },
        sensitiveColumns: this.definition.sensitiveColumns,
      });

      return { batchId: batch.id, restoredCount: restoredRows.length };
    });
  }

  archive(id: string): T {
    const column = this.definition.archiveColumn;
    if (!column)
      throw new ValidationError(
        `${this.definition.code} does not support archiving`,
      );
    return this.db.transaction((tx) => {
      const current = this.fetchRequired(tx, id);
      if (current[column] !== null) return current as T;
      const updated = this.applyUpdate(tx, current, { [column]: this.now() });
      this.enqueueOutbox(tx, 'update', id, updated, [column]);
      this.audit.record(tx, {
        action: 'archive',
        entityType: this.definition.code,
        entityId: id,
        summary: `archived ${this.definition.code}`,
        sensitiveColumns: this.definition.sensitiveColumns,
      });
      this.safeSearch(tx, id);
      return updated as T;
    });
  }

  unarchive(id: string): T {
    const column = this.definition.archiveColumn;
    if (!column)
      throw new ValidationError(
        `${this.definition.code} does not support archiving`,
      );
    return this.db.transaction((tx) => {
      const current = this.fetchRequired(tx, id);
      if (current[column] === null) return current as T;
      const updated = this.applyUpdate(tx, current, { [column]: null });
      this.enqueueOutbox(tx, 'update', id, updated, [column]);
      this.audit.record(tx, {
        action: 'unarchive',
        entityType: this.definition.code,
        entityId: id,
        summary: `unarchived ${this.definition.code}`,
        sensitiveColumns: this.definition.sensitiveColumns,
      });
      this.safeSearch(tx, id);
      return updated as T;
    });
  }

  list(options: ListOptions = {}): T[] {
    const built = this.buildWhere(options);
    if (built.empty) return [];

    const order = options.orderBy ?? {
      column: 'updated_at',
      direction: 'desc' as const,
    };
    if (!this.columns.includes(order.column)) {
      throw new ValidationError(`unknown order column: ${order.column}`);
    }
    const direction = order.direction === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.trunc(options.limit ?? 50);
    const offset = Math.trunc(options.offset ?? 0);
    if (limit <= 0)
      throw new ValidationError('limit must be greater than zero');
    if (offset < 0) throw new ValidationError('offset must not be negative');

    const sql = `SELECT * FROM ${quoteIdentifier(this.definition.table)}
      ${built.where}
      ORDER BY ${quoteIdentifier(order.column)} ${direction}, ${quoteIdentifier(this.primaryKey)} ASC
      LIMIT ? OFFSET ?`;
    return this.db
      .query<SqlRow>(sql, [...built.params, limit, offset])
      .map((row) => this.toRecord(row) as T);
  }

  count(
    options: Omit<ListOptions, 'limit' | 'offset' | 'orderBy'> = {},
  ): number {
    const built = this.buildWhere(options);
    if (built.empty) return 0;
    const sql = `SELECT COUNT(*) AS c FROM ${quoteIdentifier(this.definition.table)} ${built.where}`;
    return this.db.get<{ c: number }>(sql, built.params)?.c ?? 0;
  }

  private buildWhere(
    options: Omit<ListOptions, 'limit' | 'offset' | 'orderBy'>,
  ): {
    where: string;
    params: SqlValue[];
    empty: boolean;
  } {
    const conditions: string[] = [];
    const params: SqlValue[] = [];
    if (!(options.includeDeleted ?? false))
      conditions.push('deleted_at IS NULL');

    for (const filter of options.filters ?? []) {
      if (!this.columns.includes(filter.column)) {
        throw new ValidationError(`unknown filter column: ${filter.column}`, {
          column: filter.column,
        });
      }
      const operator = filter.operator ?? '=';
      const column = quoteIdentifier(filter.column);
      if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
        conditions.push(`${column} ${operator}`);
        continue;
      }
      if (operator === 'IN') {
        const values = Array.isArray(filter.value) ? filter.value : [];
        if (values.length === 0) return { where: '', params: [], empty: true };
        conditions.push(`${column} IN (${values.map(() => '?').join(', ')})`);
        for (const value of values as SqlValue[])
          params.push(assertSqlValue(value, filter.column));
        continue;
      }
      if (filter.value === undefined) {
        throw new ValidationError(`filter ${filter.column} requires a value`);
      }
      conditions.push(`${column} ${operator} ?`);
      params.push(assertSqlValue(filter.value as SqlValue, filter.column));
    }

    return {
      where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
      empty: false,
    };
  }

  /** Internal helpers used by domain repositories and cascade operations. */
  getRaw(
    tx: DatabaseAdapter,
    id: string,
    includeDeleted = false,
  ): EntityRecord | undefined {
    const row = tx.get<SqlRow>(
      `SELECT * FROM ${quoteIdentifier(this.definition.table)}
       WHERE ${quoteIdentifier(this.primaryKey)} = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`,
      [id],
    );
    return row ? this.toRecord(row) : undefined;
  }

  applyRestoreInternal(tx: DatabaseAdapter, row: EntityRecord): void {
    const restored = this.applyUpdate(tx, row, { deleted_at: null }, true);
    this.enqueueOutbox(tx, 'restore', row.id, restored, ['deleted_at']);
  }

  private fetchRequired(
    tx: DatabaseAdapter,
    id: string,
    includeDeleted = false,
  ): EntityRecord {
    const row = this.getRaw(tx, id, includeDeleted);
    if (!row) throw new NotFoundError(this.definition.code, id);
    return row;
  }

  private applyUpdate(
    tx: DatabaseAdapter,
    current: EntityRecord,
    patch: Readonly<Record<string, SqlValue>>,
    allowDeleted = false,
  ): EntityRecord {
    const next: Record<string, SqlValue> = {
      ...Object.fromEntries(
        Object.keys(patch).map((key) => [key, patch[key] ?? null]),
      ),
      updated_at: this.now(),
      revision: current.revision + 1,
      sync_status: 'pending',
    };
    const columns = Object.keys(next);
    const sql = `UPDATE ${quoteIdentifier(this.definition.table)}
      SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')}
      WHERE ${quoteIdentifier(this.primaryKey)} = ?${allowDeleted ? '' : ' AND deleted_at IS NULL'}`;
    const result = tx.run(sql, [
      ...columns.map((column) => next[column] ?? null),
      current.id,
    ]);
    if (result.changes === 0) {
      throw new NotFoundError(this.definition.code, current.id);
    }
    return this.fetchRequired(tx, current.id, true);
  }

  private cascadeDeleteInternal(
    tx: DatabaseAdapter,
    entityCode: string,
    id: string,
    batchId: string,
    entries: Array<{ entityType: string; entityId: string }>,
    visited: Set<string>,
  ): void {
    void batchId;
    const key = `${entityCode}:${id}`;
    if (visited.has(key)) return;
    visited.add(key);

    const repo = this.repositoryFor(entityCode);
    if (!repo.definition.softDelete) {
      throw new AppError(
        'UNSUPPORTED_ENGINE',
        `cannot cascade-delete append-only entity ${entityCode}`,
      );
    }
    const row = repo.getRaw(tx, id, true);
    if (!row || row.deleted_at !== null) return;
    repo.assertNoBlockingDependents(tx, id);

    for (const rule of repo.definition.dependents) {
      if (rule.policy !== 'cascade') continue;
      const childDefinition = syncEntityByTable(rule.table);
      if (!childDefinition) {
        throw new AppError(
          'UNSUPPORTED_ENGINE',
          `unknown dependent table ${rule.table}`,
        );
      }
      const children = tx.query<{ id: string }>(
        `SELECT ${quoteIdentifier(childDefinition.primaryKeyColumn)} AS id
         FROM ${quoteIdentifier(rule.table)}
         WHERE ${quoteIdentifier(rule.column)} = ? AND deleted_at IS NULL`,
        [id],
      );
      for (const child of children) {
        this.cascadeDeleteInternal(
          tx,
          childDefinition.code,
          child.id,
          batchId,
          entries,
          visited,
        );
      }
    }

    const deleted = repo.applyUpdate(tx, row, { deleted_at: this.now() });
    repo.enqueueOutbox(tx, 'delete', id, deleted, ['deleted_at']);
    repo.safeSearch(tx, id);
    entries.push({ entityType: entityCode, entityId: id });
  }

  private assertNoBlockingDependents(tx: DatabaseAdapter, id: string): void {
    const blockers: Array<{ table: string; labelAr: string; count: number }> =
      [];
    for (const rule of this.definition.dependents) {
      if (rule.policy !== 'block') continue;
      const row = tx.get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM ${quoteIdentifier(rule.table)}
         WHERE ${quoteIdentifier(rule.column)} = ? AND deleted_at IS NULL`,
        [id],
      );
      const count = row?.c ?? 0;
      if (count > 0)
        blockers.push({ table: rule.table, labelAr: rule.labelAr, count });
    }
    if (blockers.length > 0) {
      throw new ConflictError(
        `cannot delete ${this.definition.code}: related records exist`,
        'DEPENDENT_RECORDS_EXIST',
        { entity: this.definition.code, id, blockers },
      );
    }
  }

  private enqueueOutbox(
    tx: DatabaseAdapter,
    operation: 'insert' | 'update' | 'delete' | 'restore',
    entityId: string,
    row: EntityRecord,
    changedFields: readonly string[],
  ): void {
    const sequence =
      tx.get<{ next: number }>(
        'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM sync_outbox',
      )?.next ?? 1;
    tx.run(
      `INSERT INTO sync_outbox
        (id, sequence, entity_type, entity_id, operation, payload_json, changed_fields_json,
         origin_device_id, created_at, state, attempt_count, last_attempt_at, last_error, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL)`,
      [
        newId(),
        sequence,
        this.definition.code,
        entityId,
        operation,
        stableStringify(row),
        stableStringify([...new Set(changedFields)].sort()),
        this.deviceId,
        this.now(),
      ],
    );
  }

  private safeSearch(tx: DatabaseAdapter, id: string): void {
    tx.run(
      "DELETE FROM app_meta WHERE key IN ('sequence.audit_log','sequence.sync_outbox','sequence.search_document')",
    );
    // Native repositories have a synchronous search API. The portable profile
    // regenerates its extended facets on its next open after any native edit.
    if (tx.get("SELECT value FROM app_meta WHERE key='cases.index_version'"))
      tx.run(
        "UPDATE app_meta SET value='0',updated_at=? WHERE key='cases.index_version'",
        [this.now()],
      );
    try {
      this.search.handleEntityChange(tx, this.definition.code, id);
    } catch {
      // Derived index failure must never lose a confirmed business write.
      try {
        tx.run(
          `INSERT INTO app_meta (key, value, updated_at) VALUES ('search.rebuild_required', '1', ?)
           ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`,
          [this.now()],
        );
      } catch {
        // If even this fails the transaction is already unhealthy; let the
        // caller see the original operation error path on next integrity check.
      }
    }
  }

  private changesForValues(
    values: Readonly<Record<string, SqlValue>>,
  ): Record<string, { to: string | number | null }> {
    const changes: Record<string, { to: string | number | null }> = {};
    for (const [key, value] of Object.entries(values)) {
      changes[key] = { to: auditValue(value) };
    }
    return changes;
  }

  private changesForDiff(
    before: EntityRecord,
    patch: Readonly<Record<string, SqlValue>>,
  ): Record<
    string,
    { from: string | number | null; to: string | number | null }
  > {
    const changes: Record<
      string,
      { from: string | number | null; to: string | number | null }
    > = {};
    for (const [key, value] of Object.entries(patch)) {
      changes[key] = {
        from: auditValue(before[key] ?? null),
        to: auditValue(value),
      };
    }
    return changes;
  }

  private toRecord(row: SqlRow): EntityRecord {
    const record = { ...row } as Record<string, SqlValue>;
    const id = record[this.primaryKey];
    if (typeof id !== 'string') {
      throw new AppError(
        'UNSUPPORTED_ENGINE',
        `row in ${this.definition.table} has no string id`,
      );
    }
    record.id = id;
    return record as EntityRecord;
  }

  /** Exposed for repositories that need to run a query with the same connection. */
  protected query<T extends SqlRow>(sql: string, params?: SqlParams): T[] {
    return this.db.query<T>(sql, params);
  }

  protected get<T extends SqlRow>(
    sql: string,
    params?: SqlParams,
  ): T | undefined {
    return this.db.get<T>(sql, params);
  }

  protected run(
    sql: string,
    params?: SqlParams,
  ): { changes: number; lastInsertRowid: number } {
    return this.db.run(sql, params);
  }

  protected transaction<TResult>(
    fn: (tx: DatabaseAdapter) => TResult,
  ): TResult {
    return this.db.transaction(fn);
  }

  protected auditRecord(
    tx: DatabaseAdapter,
    input: Parameters<AuditService['record']>[1],
  ): void {
    this.audit.record(tx, input);
  }

  protected safeSearchRefresh(tx: DatabaseAdapter, id: string): void {
    this.safeSearch(tx, id);
  }

  protected nowIso(): string {
    return toCanonicalTimestamp(this.clock.now());
  }
}
