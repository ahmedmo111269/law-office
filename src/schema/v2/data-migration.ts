/** Additive seed installation. Respect office-created codes/ids; never replace existing reference rows. */
import type { EngineRow } from '../../portable/store.ts';
import { caseSystemSeeds } from './seed.ts';
export function missingCaseSeeds(
  now: string,
  existing: Readonly<Record<string, readonly EngineRow[]>>,
): Record<string, EngineRow[]> {
  const seeds = caseSystemSeeds(now);
  const aliases = new Map<string, string>();
  const result: Record<string, EngineRow[]> = {};
  for (const [table, rows] of Object.entries(seeds)) {
    const current = existing[table] ?? [];
    const additions: EngineRow[] = [];
    for (const original of rows) {
      const row = { ...original };
      for (const field of ['list_id', 'parent_id'])
        if (typeof row[field] === 'string' && aliases.has(row[field] as string))
          row[field] = aliases.get(row[field] as string)!;
      const match = [...current, ...additions].find(
        (old) =>
          old.id === row.id ||
          (table === 'lookup_list'
            ? old.code === row.code
            : table === 'lookup_item'
              ? old.list_id === row.list_id && old.code === row.code
              : old.key === row.key),
      );
      if (match) {
        aliases.set(String(original.id), String(match.id));
        continue;
      }
      additions.push(row);
      aliases.set(String(original.id), String(row.id));
    }
    result[table] = additions;
  }
  return result;
}
