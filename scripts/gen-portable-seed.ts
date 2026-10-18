/**
 * Exports the v1 seed/reference rows from a freshly migrated SQLite database
 * into `src/schema/v1/portable-seed.ts`, so the IndexedDB profile starts with
 * exactly the same reference data (same deterministic UUIDv5 ids).
 */
import { writeFileSync } from 'node:fs';
import { SqliteDatabase } from '../src/db/sqlite/sqlite-adapter.ts';
import { MigrationManager } from '../src/db/migrations/manager.ts';
import { INITIAL_MIGRATION } from '../src/db/migrations/0001_initial.ts';
import { FixedClock } from '../src/util/clock.ts';

const SEED_TABLES = [
  'lookup_list',
  'lookup_item',
  'currency',
  'office_setting',
  'office_profile',
  'local_device',
  'number_series',
  'sync_entity_type',
  'app_meta',
] as const;

const db = SqliteDatabase.open({ path: ':memory:' });
new MigrationManager(db, {
  clock: new FixedClock('2026-01-01T00:00:00.000Z'),
  appVersion: '0.1.0-seed',
  migrations: [INITIAL_MIGRATION],
}).migrate();
const data: Record<string, Array<Record<string, string | number | null>>> = {};
const counts: Record<string, number> = {};
for (const table of SEED_TABLES) {
  const rows = db.query<Record<string, string | number | null>>(`SELECT * FROM "${table}"`);
  data[table] = rows.map((row) => ({ ...row }));
  counts[table] = rows.length;
}
// Exported before any device registration: only the system device row exists.
const output = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: seed of schema v1, exported by scripts/gen-portable-seed.ts.
 * Used by the IndexedDB profile so both engines start from identical reference
 * data with identical deterministic UUIDv5 identifiers.
 */
import type { IdbRow } from '../../db/indexeddb/indexeddb-adapter.ts';

export const PORTABLE_SEED: Readonly<Record<string, readonly IdbRow[]>> = ${JSON.stringify(
  data,
  null,
  2,
)} as const;

export const PORTABLE_SEED_COUNTS = ${JSON.stringify(counts, null, 2)} as const;
`;
writeFileSync('src/schema/v1/portable-seed.ts', output);
process.stdout.write(`portable seed: ${JSON.stringify(counts)}\n`);
db.close();
