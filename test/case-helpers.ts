import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { SqliteDatabase } from '../src/db/sqlite/sqlite-adapter.ts';
import { MigrationManager } from '../src/db/migrations/manager.ts';
import { INITIAL_MIGRATION } from '../src/db/migrations/0001_initial.ts';
import { CASE_SYSTEM_MIGRATION } from '../src/db/migrations/0002_case_system.ts';
import { IndexedDbDatabase } from '../src/db/indexeddb/indexeddb-adapter.ts';
import { IdbMigrationManager } from '../src/db/indexeddb/idb-migration-manager.ts';
import { PortableLawOffice } from '../src/portable/portable-database.ts';
import {
  IndexedDbStore,
  SqlitePortableStore,
  type PortableStore,
} from '../src/portable/store.ts';
import { Lookups } from '../src/ui/state/lookups.ts';
import { CaseService } from '../src/ui/services/cases.ts';
import { RecordCache } from '../src/ui/services/types.ts';
import { FixedClock } from '../src/util/clock.ts';
const clock = new FixedClock('2026-10-19T09:00:00.000Z');
export async function caseProfile(engine: 'sqlite' | 'indexeddb') {
  let store: PortableStore;
  let sqlite: SqliteDatabase | undefined;
  let idb: IndexedDbDatabase | undefined;
  if (engine === 'sqlite') {
    sqlite = SqliteDatabase.open({ path: ':memory:' });
    new MigrationManager(sqlite, {
      clock,
      appVersion: '0.3.0-test',
      migrations: [INITIAL_MIGRATION, CASE_SYSTEM_MIGRATION],
    }).migrate();
    store = new SqlitePortableStore(sqlite);
  } else {
    idb = await IndexedDbDatabase.open({ name: `case-v2-${randomUUID()}` });
    await new IdbMigrationManager(idb, {
      clock: () => clock.now(),
      appVersion: '0.3.0-test',
    }).migrate();
    store = new IndexedDbStore(idb);
  }
  const db = await PortableLawOffice.open({
    store,
    clock,
    appVersion: '0.3.0-test',
    deviceLabel: 'Synthetic case-system tests',
  });
  const lookups = await Lookups.load(db);
  const cache = new RecordCache(db);
  const cases = new CaseService({ db, lookups, cache });
  const list = (
    filters: Record<string, string> = {},
    search = '',
    page = 1,
    pageSize = 20,
  ) => cases.list({ page, pageSize, search, filters });
  return {
    store,
    sqlite,
    idb,
    db,
    cases,
    lookups,
    cache,
    list,
    close: () => store.close(),
  };
}
