/**
 * Engine-neutral query description used by both storage profiles.
 *
 * The UI must not load a whole table to render one page. This module defines a
 * small, explicit query contract (equality/range/text filters, ordering,
 * offset/limit) and the JavaScript semantics used by the IndexedDB profile and
 * by the SQLite fallback. Identifier safety and column validation stay in the
 * stores; this file contains no SQL text.
 */
import { AppError } from '../errors.ts';
import type { PortableTable } from '../schema/portable-types.ts';
import type { EngineRow } from './store.ts';

export type QueryOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'isNull'
  | 'notNull';

export type QueryScalar = string | number;

export interface QueryFilter {
  readonly column: string;
  readonly op: QueryOperator;
  readonly value?: QueryScalar | readonly QueryScalar[] | null;
}

export interface QueryOrder {
  readonly column: string;
  readonly direction?: 'asc' | 'desc';
}

export interface QueryOptions {
  readonly filters?: readonly QueryFilter[];
  readonly orderBy?: readonly QueryOrder[];
  readonly offset?: number;
  readonly limit?: number;
}

export interface QueryPage {
  readonly rows: EngineRow[];
  readonly total: number;
}

export interface NormalizedQuery {
  readonly filters: readonly QueryFilter[];
  readonly orderBy: readonly QueryOrder[];
  readonly offset: number;
  readonly limit: number;
}

export const MAX_QUERY_LIMIT = 500;

export function normalizeQuery(
  table: PortableTable,
  options: QueryOptions = {},
): NormalizedQuery {
  const columns = new Set(table.columns.map((column) => column.name));
  const filters = [...(options.filters ?? [])];
  for (const filter of filters) {
    if (!columns.has(filter.column)) {
      throw new AppError('VALIDATION_FAILED', `unknown filter column ${filter.column} on ${table.name}`);
    }
    validateFilter(filter, table.name);
  }
  const orderBy = [...(options.orderBy ?? [])];
  for (const order of orderBy) {
    if (!columns.has(order.column)) {
      throw new AppError('VALIDATION_FAILED', `unknown order column ${order.column} on ${table.name}`);
    }
    if (order.direction !== undefined && order.direction !== 'asc' && order.direction !== 'desc') {
      throw new AppError('VALIDATION_FAILED', `invalid order direction on ${table.name}`);
    }
  }
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const requestedLimit = Math.trunc(options.limit ?? 50);
  const limit = Math.max(0, Math.min(MAX_QUERY_LIMIT, requestedLimit));
  return { filters, orderBy, offset, limit };
}

function validateFilter(filter: QueryFilter, tableName: string): void {
  const { op, value } = filter;
  if (op === 'isNull' || op === 'notNull') return;
  if (op === 'in') {
    if (!Array.isArray(value)) {
      throw new AppError('VALIDATION_FAILED', `filter ${filter.column} on ${tableName} needs a value list`);
    }
    return;
  }
  if (value === undefined || value === null || Array.isArray(value)) {
    throw new AppError('VALIDATION_FAILED', `filter ${filter.column} on ${tableName} needs a scalar value`);
  }
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function compareScalar(left: unknown, right: QueryScalar): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const a = asText(left);
  const b = asText(right);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function matchesFilter(row: EngineRow, filter: QueryFilter): boolean {
  const current = row[filter.column];
  switch (filter.op) {
    case 'isNull':
      return current === null || current === undefined;
    case 'notNull':
      return current !== null && current !== undefined;
    case 'eq':
      return (current ?? null) === (filter.value ?? null);
    case 'neq':
      return (current ?? null) !== (filter.value ?? null);
    case 'in':
      return (filter.value as readonly QueryScalar[]).some((value) => (current ?? null) === value);
    case 'gt':
      return current !== null && current !== undefined && compareScalar(current, filter.value as QueryScalar) > 0;
    case 'gte':
      return current !== null && current !== undefined && compareScalar(current, filter.value as QueryScalar) >= 0;
    case 'lt':
      return current !== null && current !== undefined && compareScalar(current, filter.value as QueryScalar) < 0;
    case 'lte':
      return current !== null && current !== undefined && compareScalar(current, filter.value as QueryScalar) <= 0;
    case 'contains':
      return asText(current).toLocaleLowerCase('ar').includes(asText(filter.value).toLocaleLowerCase('ar'));
    case 'startsWith':
      return asText(current).toLocaleLowerCase('ar').startsWith(asText(filter.value).toLocaleLowerCase('ar'));
    default:
      return false;
  }
}

export function matchesFilters(row: EngineRow, filters: readonly QueryFilter[]): boolean {
  return filters.every((filter) => matchesFilter(row, filter));
}

/** Nulls sort last in both directions, matching the SQL builders. */
export function compareRows(
  left: EngineRow,
  right: EngineRow,
  orderBy: readonly QueryOrder[],
): number {
  for (const order of orderBy) {
    const a = left[order.column];
    const b = right[order.column];
    const aNull = a === null || a === undefined;
    const bNull = b === null || b === undefined;
    if (aNull && bNull) continue;
    if (aNull) return 1;
    if (bNull) return -1;
    const factor = order.direction === 'desc' ? -1 : 1;
    const comparison =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : asText(a) === asText(b)
          ? 0
          : asText(a) < asText(b)
            ? -1
            : 1;
    if (comparison !== 0) return comparison * factor;
  }
  // Stable, deterministic tie-breaker so pagination does not reshuffle rows.
  const leftKey = asText(left.id ?? left.party_id ?? left.code ?? left.version ?? '');
  const rightKey = asText(right.id ?? right.party_id ?? right.code ?? right.version ?? '');
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
}

/** Applies the query in memory. Used inside an active transaction and by SQLite fallbacks. */
export function applyQuery(
  rows: readonly EngineRow[],
  query: NormalizedQuery,
): QueryPage {
  const matched = rows.filter((row) => matchesFilters(row, query.filters));
  if (query.orderBy.length > 0) matched.sort((a, b) => compareRows(a, b, query.orderBy));
  return {
    rows: matched.slice(query.offset, query.offset + query.limit),
    total: matched.length,
  };
}

/** Chooses the first equality filter that can drive an indexed cursor. */
export function indexRangeFilter(
  table: PortableTable,
  filters: readonly QueryFilter[],
): { indexName: string; value: QueryScalar } | null {
  for (const index of table.indexes) {
    // A compound index key cannot be addressed by its first column alone.
    if (index.columns.length !== 1) continue;
    const first = index.columns[0];
    if (!first) continue;
    const filter = filters.find(
      (candidate) => candidate.column === first && candidate.op === 'eq' && candidate.value !== null,
    );
    const value = filter?.value;
    if (typeof value === 'string' || typeof value === 'number') {
      return { indexName: index.name, value };
    }
  }
  return null;
}

/** Finds an IndexedDB index usable as the cursor order for a single sort column. */
export function orderIndex(
  table: PortableTable,
  orderBy: readonly QueryOrder[],
): { indexName: string; column: string } | null {
  const first = orderBy[0];
  if (!first) return null;
  const column = table.columns.find((candidate) => candidate.name === first.column);
  if (!column || column.notNull === false) return null;
  const index = table.indexes.find((candidate) => candidate.columns[0] === first.column);
  return index ? { indexName: index.name, column: first.column } : null;
}
