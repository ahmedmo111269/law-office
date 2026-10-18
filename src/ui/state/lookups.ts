import type { EngineRow } from '../../portable/store.ts';
import type { PortableLawOffice } from '../../portable/portable-database.ts';

export interface LookupItem {
  readonly id: string;
  readonly listId: string;
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface LookupList {
  readonly id: string;
  readonly code: string;
  readonly nameAr: string;
}

/**
 * Reference data is small (54 lists / 374 items at v1) and is loaded once from
 * the real lookup tables. It is cached for the session; editing a list in
 * another tab is reflected after reload.
 */
export class Lookups {
  private readonly lists = new Map<string, LookupList>();
  private readonly itemsByList = new Map<string, LookupItem[]>();
  private readonly itemsById = new Map<string, LookupItem>();
  private readonly itemsByCode = new Map<string, LookupItem>();

  private constructor() {}

  static async load(db: PortableLawOffice): Promise<Lookups> {
    const instance = new Lookups();
    const listRows = await loadAll(db, 'lookup_list');
    const itemRows = await loadAll(db, 'lookup_item');
    for (const row of listRows) {
      if (row.deleted_at !== null) continue;
      const list: LookupList = {
        id: String(row.id),
        code: String(row.code),
        nameAr: String(row.name_ar),
      };
      instance.lists.set(list.code, list);
      instance.itemsByList.set(list.id, []);
    }
    for (const row of itemRows) {
      if (row.deleted_at !== null) continue;
      const item: LookupItem = {
        id: String(row.id),
        listId: String(row.list_id),
        code: String(row.code),
        nameAr: String(row.name_ar),
        nameEn: row.name_en === null ? null : String(row.name_en),
        sortOrder: Number(row.sort_order ?? 0),
        isActive: row.is_active === 1,
      };
      instance.itemsById.set(item.id, item);
      instance.itemsByCode.set(`${item.listId}\u0000${item.code}`, item);
      const bucket = instance.itemsByList.get(item.listId);
      if (bucket) bucket.push(item);
    }
    for (const bucket of instance.itemsByList.values()) {
      bucket.sort((left, right) => left.sortOrder - right.sortOrder || left.nameAr.localeCompare(right.nameAr, 'ar'));
    }
    return instance;
  }

  list(code: string): LookupList | undefined {
    return this.lists.get(code);
  }

  items(listCode: string): readonly LookupItem[] {
    const list = this.lists.get(listCode);
    if (!list) return [];
    return (this.itemsByList.get(list.id) ?? []).filter((item) => item.isActive);
  }

  allItems(listCode: string): readonly LookupItem[] {
    const list = this.lists.get(listCode);
    return list ? this.itemsByList.get(list.id) ?? [] : [];
  }

  item(listCode: string, code: string): LookupItem | undefined {
    const list = this.lists.get(listCode);
    return list ? this.itemsByCode.get(`${list.id}\u0000${code}`) : undefined;
  }

  byId(id: string | null | undefined): LookupItem | undefined {
    return id ? this.itemsById.get(id) : undefined;
  }

  name(listCode: string, idOrCode: string | null | undefined, fallback = '—'): string {
    if (!idOrCode) return fallback;
    return this.item(listCode, idOrCode)?.nameAr ?? this.byId(idOrCode)?.nameAr ?? fallback;
  }

  id(listCode: string, code: string | null | undefined): string | null {
    if (!code) return null;
    return this.item(listCode, code)?.id ?? null;
  }

  codeById(idOrCode: string | null | undefined): string {
    return this.byId(idOrCode)?.code ?? '';
  }

  options(listCode: string, includeEmpty = false): HTMLOptionElement[] {
    const options: HTMLOptionElement[] = [];
    if (includeEmpty) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '— غير محدد —';
      options.push(empty);
    }
    for (const item of this.items(listCode)) {
      const option = document.createElement('option');
      option.value = item.code;
      option.textContent = item.nameAr;
      options.push(option);
    }
    return options;
  }
}

async function loadAll(db: PortableLawOffice, entityCode: string): Promise<EngineRow[]> {
  const rows: EngineRow[] = [];
  let offset = 0;
  for (;;) {
    const page = await db.query(entityCode, { limit: 500, offset, includeDeleted: true });
    rows.push(...page.rows);
    if (rows.length >= page.total || page.rows.length === 0) break;
    offset += page.rows.length;
  }
  return rows;
}
