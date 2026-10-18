import type { EngineRow } from '../../portable/store.ts';
import type { Lookups } from '../state/lookups.ts';
import type { PortableLawOffice } from '../../portable/portable-database.ts';

export interface TableRequest {
  page: number;
  pageSize: number;
  search: string;
  filters: Readonly<Record<string, string>>;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}

export interface TableResult<T> {
  rows: T[];
  total: number;
}

export interface ServiceDeps {
  readonly db: PortableLawOffice;
  readonly lookups: Lookups;
  readonly cache: RecordCache;
}

export interface PartyOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

export type Row = EngineRow;

export class RecordCache {
  private readonly db: PortableLawOffice;
  private readonly maps = new Map<string, Map<string, EngineRow | null>>();

  constructor(db: PortableLawOffice) {
    this.db = db;
  }

  private map(code: string): Map<string, EngineRow | null> {
    let map = this.maps.get(code);
    if (!map) {
      map = new Map();
      this.maps.set(code, map);
    }
    return map;
  }

  async get(code: string, id: string | null | undefined): Promise<EngineRow | null> {
    if (!id) return null;
    const map = this.map(code);
    if (map.has(id)) return map.get(id) ?? null;
    const row = await this.db.get(code, id);
    map.set(id, row ?? null);
    return row ?? null;
  }

  async many(code: string, ids: readonly (string | null | undefined)[]): Promise<Map<string, EngineRow>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const result = new Map<string, EngineRow>();
    const missing: string[] = [];
    for (const id of unique) {
      const cached = this.map(code).get(id);
      if (cached) result.set(id, cached);
      else if (cached === undefined) missing.push(id);
    }
    const chunks: string[][] = [];
    for (let index = 0; index < missing.length; index += 400) chunks.push(missing.slice(index, index + 400));
    for (const chunk of chunks) {
      const page = await this.db.query(code, {
        filters: [{ column: 'id', op: 'in', value: chunk }],
        limit: Math.min(500, chunk.length),
      });
      for (const row of page.rows) {
        const id = String(row.id);
        result.set(id, row);
        this.map(code).set(id, row);
      }
      for (const id of chunk) {
        if (!result.has(id)) this.map(code).set(id, null);
      }
    }
    return result;
  }

  invalidate(code?: string, id?: string): void {
    if (!code) {
      this.maps.clear();
      return;
    }
    if (!id) {
      this.maps.delete(code);
      return;
    }
    this.map(code).delete(id);
  }

  partyName(id: string | null | undefined): string {
    return String(this.map('party').get(id ?? '')?.display_name ?? '—');
  }
}

export function combinedName(person: EngineRow | null | undefined): string {
  if (!person) return '';
  return [person.first_name, person.middle_name, person.last_name]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
    .trim();
}

export function paginate(page: number, pageSize: number): { offset: number; limit: number } {
  return { offset: Math.max(0, (page - 1) * pageSize), limit: pageSize };
}

export async function eachPage(
  db: PortableLawOffice,
  entityCode: string,
  onPage: (rows: EngineRow[]) => void | Promise<void>,
  options: {
    pageSize?: number;
    filters?: NonNullable<Parameters<PortableLawOffice['query']>[1]>['filters'];
    orderBy?: NonNullable<Parameters<PortableLawOffice['query']>[1]>['orderBy'];
  } = {},
): Promise<number> {
  const pageSize = Math.min(500, options.pageSize ?? 500);
  let offset = 0;
  let total = 0;
  for (;;) {
    const page = await db.query(entityCode, {
      ...(options.filters ? { filters: options.filters } : {}),
      ...(options.orderBy ? { orderBy: options.orderBy } : {}),
      offset,
      limit: pageSize,
    });
    total = page.total;
    await onPage(page.rows);
    offset += page.rows.length;
    if (page.rows.length === 0 || offset >= page.total) break;
  }
  return total;
}
