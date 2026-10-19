/** IndexedDB query planner: bounded pages, exact counts, finite IN seeks and batched scans. No row cutoffs. */
import type { PortableTable } from '../../schema/portable-types.ts';
import {
  compareRows,
  matchesFilters,
  type NormalizedQuery,
  type QueryFilter,
  type QueryScalar,
  type QueryPage,
} from '../../portable/query.ts';
import type { EngineRow } from '../../portable/store.ts';
const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB query failed'));
  });
function choices(
  filters: readonly QueryFilter[],
  column: string,
): QueryScalar[] | null {
  const constraints = filters.filter(
    (f) =>
      f.column === column &&
      (f.op === 'eq' || f.op === 'in') &&
      f.value !== null,
  );
  if (!constraints.length) return null;
  let selected: QueryScalar[] | null = null;
  for (const f of constraints) {
    const values = [...new Set(Array.isArray(f.value) ? f.value : [f.value])];
    if (!values.every((v) => typeof v === 'number' || typeof v === 'string'))
      return null;
    const next = values as QueryScalar[];
    selected =
      selected === null
        ? next
        : selected.filter((value) => next.includes(value));
  }
  return selected;
}
function guaranteedNonNull(
  table: PortableTable,
  filters: readonly QueryFilter[],
  column: string,
): boolean {
  return (
    table.columns.some(
      (c) => c.name === column && (c.notNull || c.primaryKeyOrder > 0),
    ) ||
    filters.some(
      (f) =>
        f.column === column &&
        (f.op === 'notNull' ||
          ['eq', 'in', 'gt', 'gte', 'lt', 'lte'].includes(f.op)) &&
        f.value !== null,
    )
  );
}
/** O(offset+page-size) retained rows; O(log window) selection instead of sorting all matches. */
class PageWindow {
  readonly rows: EngineRow[] = [];
  total = 0;
  private readonly query: NormalizedQuery;
  constructor(query: NormalizedQuery) {
    this.query = query;
  }
  add(row: EngineRow): void {
    if (!matchesFilters(row, this.query.filters)) return;
    this.total += 1;
    const keep = this.query.offset + this.query.limit;
    if (!keep) return;
    const rows = this.rows,
      compare = (a: EngineRow, b: EngineRow) =>
        compareRows(a, b, this.query.orderBy);
    if (rows.length < keep) {
      rows.push(row);
      let i = rows.length - 1;
      while (i > 0) {
        const parent = (i - 1) >>> 1;
        if (compare(rows[parent]!, rows[i]!) >= 0) break;
        [rows[parent], rows[i]] = [rows[i]!, rows[parent]!];
        i = parent;
      }
      return;
    }
    if (compare(row, rows[0]!) >= 0) return;
    rows[0] = row;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1,
        right = left + 1;
      if (left >= rows.length) break;
      const child =
        right < rows.length && compare(rows[right]!, rows[left]!) > 0
          ? right
          : left;
      if (compare(rows[i]!, rows[child]!) >= 0) break;
      [rows[i], rows[child]] = [rows[child]!, rows[i]!];
      i = child;
    }
  }
  finish(total = this.total): QueryPage {
    return {
      total,
      rows: this.rows
        .sort((a, b) => compareRows(a, b, this.query.orderBy))
        .slice(this.query.offset),
    };
  }
}
interface Plan {
  index: IDBIndex;
  columns: readonly string[];
  prefixLength: number;
  ranges: IDBKeyRange[];
  covered: boolean;
  ordered: boolean;
}
function keyFor(
  columns: readonly string[],
  row: EngineRow,
  compound: boolean,
): IDBValidKey {
  return columns.length === 1 && !compound
    ? (row[columns[0]!] as string | number)
    : columns.map((c) => row[c] as string | number);
}
function prefixRange(
  index: IDBIndex,
  prefix: QueryScalar[],
  columnCount: number,
): IDBKeyRange {
  if (columnCount === 1 && !Array.isArray(index.keyPath))
    return IDBKeyRange.only(prefix[0]!);
  return prefix.length === columnCount
    ? IDBKeyRange.only(prefix)
    : IDBKeyRange.bound(prefix, [...prefix, []]);
}
export async function readQuery(
  store: IDBObjectStore,
  table: PortableTable,
  query: NormalizedQuery,
  exactTotal = true,
): Promise<QueryPage> {
  const window = new PageWindow(query);
  const storeOrdered =
    query.orderBy.length === table.primaryKey.length &&
    query.orderBy.every(
      (o, i) =>
        o.column === table.primaryKey[i] &&
        (o.direction ?? 'asc') === (query.orderBy[0]?.direction ?? 'asc'),
    );
  if (
    exactTotal &&
    query.filters.length === 0 &&
    (query.limit === 0 || storeOrdered)
  ) {
    const total = await request(store.count());
    if (query.limit === 0 || query.offset >= total) return { rows: [], total };
    const rows: EngineRow[] = [];
    await new Promise<void>((resolve, reject) => {
      let skipped = false;
      const r = store.openCursor(
        undefined,
        query.orderBy[0]?.direction === 'desc' ? 'prev' : 'next',
      );
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const c = r.result;
        if (!c) {
          resolve();
          return;
        }
        if (!skipped && query.offset) {
          skipped = true;
          c.advance(query.offset);
          return;
        }
        rows.push(c.value as EngineRow);
        if (rows.length >= query.limit) {
          resolve();
          return;
        }
        c.continue();
      };
    });
    return { rows, total };
  }
  // Entity hydration by 25/50 ids must do 25/50 primary-key reads, not scan a
  // hundred-thousand-row party/case table for each visible page.
  const primary =
    table.primaryKey.length === 1
      ? choices(query.filters, table.primaryKey[0]!)
      : null;
  if (primary && primary.length <= 2048) {
    for (const id of primary) {
      const row = await request(store.get(id));
      if (row) window.add(row as EngineRow);
    }
    return window.finish();
  }
  const plans: Plan[] = [];
  for (const def of table.indexes) {
    if (!store.indexNames.contains(def.name)) continue;
    // Compound indexes omit any row with a null component. They are unsafe
    // unless every component is non-null for ALL possible query matches.
    if (!def.columns.every((c) => guaranteedNonNull(table, query.filters, c)))
      continue;
    let prefixes: QueryScalar[][] = [[]],
      prefixLength = 0;
    for (const column of def.columns) {
      const values = choices(query.filters, column);
      if (
        !values ||
        values.length > 2048 ||
        prefixes.length * values.length > 2048
      )
        break;
      if (!values.length) return { rows: [], total: 0 };
      prefixes = prefixes.flatMap((p) => values.map((v) => [...p, v]));
      prefixLength += 1;
    }
    if (!prefixLength) continue;
    const index = store.index(def.name),
      ranges = prefixes.map((p) => {
        const range = prefixRange(index, p, def.columns.length);
        // Keyset range for a final unique PK component (e.g. term_id, id).
        const after =
          def.columns.length === prefixLength + 1
            ? query.filters.find(
                (f) =>
                  f.column === def.columns[prefixLength] &&
                  f.op === 'gt' &&
                  (typeof f.value === 'string' || typeof f.value === 'number'),
              )
            : null;
        return after
          ? IDBKeyRange.bound(
              [...p, after.value as QueryScalar],
              range.upper,
              true,
              range.upperOpen,
            )
          : range;
      });
    const prefixColumns = def.columns.slice(0, prefixLength);
    const covered = query.filters.every(
      (f) =>
        prefixColumns.includes(f.column) && (f.op === 'eq' || f.op === 'in'),
    );
    // Duplicate secondary keys are ordered by the store primary key in IDB.
    const orderedColumns = [
      ...def.columns.slice(prefixLength),
      ...table.primaryKey.filter((c) => !def.columns.includes(c)),
    ];
    const order = query.orderBy.filter(
      (o) =>
        !prefixColumns.includes(o.column) ||
        (choices(query.filters, o.column)?.length ?? 0) > 1,
    );
    const ordered =
      order.length > 0 &&
      order.every(
        (o, i) =>
          o.column === orderedColumns[i] &&
          (o.direction ?? 'asc') === (order[0]!.direction ?? 'asc'),
      );
    plans.push({
      index,
      columns: def.columns,
      prefixLength,
      ranges,
      covered,
      ordered,
    });
  }
  // IDB count(range) is NOT constant-time metadata in every browser. In
  // particular, never count candidate indexes again for each streaming batch.
  const selectivePrefix = (p: Plan) =>
    p.columns.slice(0, p.prefixLength).filter((c) => c !== 'case_scope').length;
  let plan = plans.sort(
    (a, b) =>
      b.prefixLength - a.prefixLength ||
      selectivePrefix(b) - selectivePrefix(a) ||
      Number(b.ordered) - Number(a.ordered) ||
      Number(table.primaryKey.every((c) => b.columns.includes(c))) -
        Number(table.primaryKey.every((c) => a.columns.includes(c))) ||
      a.ranges.length - b.ranges.length,
  )[0];
  const primaryOrdered =
    table.primaryKey.length === 1 &&
    query.orderBy.length === 1 &&
    query.orderBy[0]?.column === table.primaryKey[0] &&
    query.orderBy[0]?.direction !== 'desc';
  if (
    !exactTotal &&
    primaryOrdered &&
    plan &&
    !plan.ordered &&
    (plan.columns[0] === 'case_scope' || plan.ranges.length > 64)
  )
    plan = undefined;
  let coveredTotal: number | undefined;
  if (exactTotal && plan?.covered && (query.limit === 0 || plan.ordered))
    coveredTotal = (
      await Promise.all(
        plan.ranges.map((range) => request(plan!.index.count(range))),
      )
    ).reduce((a, b) => a + b, 0);
  if (plan?.covered && query.limit === 0)
    return { rows: [], total: coveredTotal ?? 0 };
  if (plan?.covered && plan.ordered) {
    const direction: IDBCursorDirection =
      query.orderBy.find(
        (o) => !plan.columns.slice(0, plan.prefixLength).includes(o.column),
      )?.direction === 'desc'
        ? 'prev'
        : 'next';
    const keep = query.offset + query.limit;
    for (const range of plan.ranges)
      await new Promise<void>((resolve, reject) => {
        let n = 0;
        const cursorRequest = plan.index.openCursor(range, direction);
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || n >= keep) {
            resolve();
            return;
          }
          window.add(cursor.value as EngineRow);
          n += 1;
          cursor.continue();
        };
      });
    return window.finish(coveredTotal);
  }
  const source: IDBObjectStore | IDBIndex = plan?.index ?? store;
  const after = primaryOrdered
    ? query.filters.find(
        (f) => f.column === table.primaryKey[0] && f.op === 'gt',
      )
    : null;
  const ranges: Array<IDBKeyRange | null> = plan?.ranges ?? [
    after ? IDBKeyRange.lowerBound(after.value as QueryScalar, true) : null,
  ];
  const early =
    !exactTotal &&
    query.orderBy[0]?.direction !== 'desc' &&
    (plan?.ordered || (!plan && primaryOrdered));
  const columns = plan?.columns ?? table.primaryKey;
  const unique =
    !plan ||
    table.primaryKey.every((c) => columns.includes(c)) ||
    plan.index.unique;
  for (const originalRange of ranges) {
    let matchedInRange = 0;
    if (unique) {
      // Up to 500 source rows per read, never getAll() of an entire case/search
      // table. Batched keyset scans avoid one browser round-trip per record.
      let range = originalRange;
      for (;;) {
        const rows = (await request(
          source.getAll(range ?? undefined, 500),
        )) as EngineRow[];
        for (const row of rows) {
          const before = window.total;
          window.add(row);
          if (window.total > before) matchedInRange += 1;
          if (early && matchedInRange >= query.offset + query.limit) break;
        }
        if (early && matchedInRange >= query.offset + query.limit) break;
        if (rows.length < 500) break;
        const last = keyFor(
          columns,
          rows.at(-1)!,
          Array.isArray(source.keyPath),
        );
        if (originalRange?.upper !== undefined) {
          if (indexedDB.cmp(last, originalRange.upper) >= 0) break;
          range = IDBKeyRange.bound(
            last,
            originalRange.upper,
            true,
            originalRange.upperOpen,
          );
        } else range = IDBKeyRange.lowerBound(last, true);
      }
    } else {
      // A non-unique index needs a cursor to avoid losing duplicates at a
      // batch boundary (e.g. 1000 rows with the same file/status key).
      await new Promise<void>((resolve, reject) => {
        const cursorRequest = source.openCursor(originalRange);
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            resolve();
            return;
          }
          if (after && plan && plan.prefixLength === plan.columns.length) {
            const compare = indexedDB.cmp(
              cursor.primaryKey,
              after.value as QueryScalar,
            );
            if (compare < 0) {
              cursor.continuePrimaryKey(cursor.key, after.value as QueryScalar);
              return;
            }
            if (compare === 0) {
              cursor.continue();
              return;
            }
          }
          const before = window.total;
          window.add(cursor.value as EngineRow);
          if (window.total > before) matchedInRange += 1;
          if (early && matchedInRange >= query.offset + query.limit) {
            resolve();
            return;
          }
          cursor.continue();
        };
      });
    }
  }
  return window.finish(coveredTotal);
}
