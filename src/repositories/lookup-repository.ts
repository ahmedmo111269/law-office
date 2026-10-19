import type { SqlRow } from '../db/adapter.ts';
import { ConflictError, NotFoundError, ValidationError } from '../errors.ts';
import { getSyncEntity } from '../sync/current-registry.ts';
import {
  BaseRepository,
  type EntityRecord,
  type RepositoryDependencies,
} from './base-repository.ts';

export interface LookupListRecord extends EntityRecord {
  readonly code: string;
  readonly name_ar: string;
  readonly name_en: string | null;
  readonly is_system: number;
  readonly is_extensible: number;
}

export interface LookupItemRecord extends EntityRecord {
  readonly list_id: string;
  readonly code: string;
  readonly name_ar: string;
  readonly name_en: string | null;
  readonly sort_order: number;
  readonly parent_id: string | null;
  readonly is_active: number;
  readonly is_system: number;
}

export interface LookupItemView extends LookupItemRecord, SqlRow {
  readonly list_code: string;
}

const CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Reference data is intentionally open: system lists can receive new items,
 * and users can create new lists. A list/item is never hard-deleted by the
 * application; items are deactivated so historical references stay readable.
 */
export class LookupRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lists: BaseRepository<LookupListRecord>;
  private readonly items: BaseRepository<LookupItemRecord>;

  constructor(deps: RepositoryDependencies) {
    this.deps = deps;
    this.lists = new BaseRepository<LookupListRecord>(
      deps,
      getSyncEntity('lookup_list'),
    );
    this.items = new BaseRepository<LookupItemRecord>(
      deps,
      getSyncEntity('lookup_item'),
    );
  }

  allLists(): LookupListRecord[] {
    return this.lists.list({
      limit: 500,
      orderBy: { column: 'code', direction: 'asc' },
    });
  }

  getListByCode(code: string): LookupListRecord | undefined {
    return this.lists.list({
      filters: [{ column: 'code', value: code }],
      limit: 1,
    })[0];
  }

  requireList(code: string): LookupListRecord {
    const list = this.getListByCode(code);
    if (!list) throw new NotFoundError('lookup_list', code);
    return list;
  }

  itemsOf(
    listCode: string,
    options: { includeInactive?: boolean } = {},
  ): LookupItemView[] {
    const list = this.requireList(listCode);
    const rows = this.deps.db.query<SqlRow>(
      `SELECT i.*, l.code AS list_code
       FROM lookup_item i JOIN lookup_list l ON l.id = i.list_id
       WHERE i.list_id = ? AND i.deleted_at IS NULL
         ${options.includeInactive ? '' : 'AND i.is_active = 1'}
       ORDER BY i.sort_order, i.name_ar`,
      [list.id],
    );
    return rows.map((row) => ({ ...row }) as LookupItemView);
  }

  itemById(
    id: string,
    options: { includeInactive?: boolean } = {},
  ): LookupItemView | undefined {
    const row = this.deps.db.get<SqlRow>(
      `SELECT i.*, l.code AS list_code
       FROM lookup_item i JOIN lookup_list l ON l.id = i.list_id
       WHERE i.id = ? AND i.deleted_at IS NULL
         ${options.includeInactive ? '' : 'AND i.is_active = 1'}`,
      [id],
    );
    return row ? ({ ...row } as LookupItemView) : undefined;
  }

  itemByCode(listCode: string, code: string): LookupItemView | undefined {
    const row = this.deps.db.get<SqlRow>(
      `SELECT i.*, l.code AS list_code
       FROM lookup_item i JOIN lookup_list l ON l.id = i.list_id
       WHERE l.code = ? AND i.code = ? AND i.deleted_at IS NULL AND i.is_active = 1`,
      [listCode, code],
    );
    return row ? ({ ...row } as LookupItemView) : undefined;
  }

  requireItem(id: string, listCode?: string): LookupItemView {
    const item = this.itemById(id);
    if (!item) throw new NotFoundError('lookup_item', id);
    if (listCode && item.list_code !== listCode) {
      throw new ValidationError(
        `lookup item ${id} does not belong to list ${listCode}`,
        {
          itemId: id,
          expectedList: listCode,
          actualList: item.list_code,
        },
      );
    }
    return item;
  }

  requireItemByCode(
    listCode: string,
    code: string,
    field = 'code',
  ): LookupItemView {
    const item = this.itemByCode(listCode, code);
    if (!item) {
      throw new ValidationError(
        `unknown ${field} "${code}" in list ${listCode}`,
        {
          list: listCode,
          code,
        },
      );
    }
    return item;
  }

  resolveOptional(
    listCode: string,
    code: string | undefined | null,
  ): string | null {
    if (code === undefined || code === null || code === '') return null;
    return this.requireItemByCode(listCode, code).id;
  }

  createList(input: {
    code: string;
    nameAr: string;
    nameEn?: string;
    description?: string;
  }): LookupListRecord {
    if (!CODE_RE.test(input.code))
      throw new ValidationError('invalid lookup list code');
    if (this.getListByCode(input.code)) {
      throw new ConflictError(
        `lookup list ${input.code} already exists`,
        'ALREADY_EXISTS',
      );
    }
    return this.lists.insert({
      code: input.code,
      name_ar: input.nameAr,
      name_en: input.nameEn ?? null,
      description: input.description ?? null,
      is_system: 0,
      is_extensible: 1,
    });
  }

  addItem(
    listCode: string,
    input: {
      code: string;
      nameAr: string;
      nameEn?: string;
      sortOrder?: number;
      parentId?: string;
    },
  ): LookupItemRecord {
    const list = this.requireList(listCode);
    if (!CODE_RE.test(input.code))
      throw new ValidationError('invalid lookup item code');
    if (this.itemByCode(listCode, input.code)) {
      throw new ConflictError(
        `lookup item ${input.code} already exists`,
        'ALREADY_EXISTS',
      );
    }
    if (input.parentId) this.requireItem(input.parentId, listCode);
    const maxSort =
      this.deps.db.get<{ m: number }>(
        'SELECT COALESCE(MAX(sort_order), 0) AS m FROM lookup_item WHERE list_id = ?',
        [list.id],
      )?.m ?? 0;
    return this.items.insert({
      list_id: list.id,
      code: input.code,
      name_ar: input.nameAr,
      name_en: input.nameEn ?? null,
      sort_order: input.sortOrder ?? maxSort + 10,
      parent_id: input.parentId ?? null,
      is_active: 1,
      is_system: 0,
    });
  }

  updateItem(
    id: string,
    patch: {
      nameAr?: string;
      nameEn?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): LookupItemRecord {
    const item = this.requireItem(id);
    const update: Record<string, string | number | null> = {};
    if (patch.nameAr !== undefined) update.name_ar = patch.nameAr;
    if (patch.nameEn !== undefined) update.name_en = patch.nameEn;
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) update.is_active = patch.isActive ? 1 : 0;
    if (Object.keys(update).length === 0) return item;
    return this.items.update(id, update);
  }

  deactivate(id: string): LookupItemRecord {
    return this.updateItem(id, { isActive: false });
  }
}
