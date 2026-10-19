import type { EngineRow } from './store.ts';
/** Reference sets are built once per target/key, not a parent-table .some() for every backup row. */
export function foreignReferenceChecker(
  tables: Readonly<Record<string, readonly EngineRow[]>>,
) {
  const cache = new Map<string, Set<string>>();
  return (
    table: string,
    columns: readonly string[],
    values: readonly unknown[],
  ): boolean => {
    const key = `${table}:${columns.join(',')}`;
    let keys = cache.get(key);
    if (!keys) {
      keys = new Set(
        (tables[table] ?? []).map((row) =>
          JSON.stringify(columns.map((c) => row[c] ?? null)),
        ),
      );
      cache.set(key, keys);
    }
    return keys.has(JSON.stringify(values));
  };
}
