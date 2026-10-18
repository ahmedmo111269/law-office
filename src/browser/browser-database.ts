/**
 * Browser (PWA) entry point for the data layer.
 *
 * Uses the real browser IndexedDB implementation — no SQLite, no WebAssembly,
 * no server. The same portable data semantics that are exercised on SQLite in
 * Node run here unchanged.
 */
import { IndexedDbDatabase } from '../db/indexeddb/indexeddb-adapter.ts';
import { IdbMigrationManager } from '../db/indexeddb/idb-migration-manager.ts';
import { IndexedDbStore } from '../portable/store.ts';
import { PortableLawOffice } from '../portable/portable-database.ts';
import { AppError } from '../errors.ts';

export interface BrowserDatabase {
  readonly engine: 'indexeddb';
  readonly db: PortableLawOffice;
  readonly indexedDb: IndexedDbDatabase;
  readonly migrations: IdbMigrationManager;
  close(): Promise<void>;
}

export interface OpenBrowserDatabaseOptions {
  name?: string;
  appVersion?: string;
  deviceLabel?: string;
  timezone?: string;
  platform?: string;
}

export function indexedDbAvailable(): boolean {
  try {
    return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
  } catch {
    return false;
  }
}

export async function openBrowserDatabase(
  options: OpenBrowserDatabaseOptions = {},
): Promise<BrowserDatabase> {
  if (!indexedDbAvailable()) {
    throw new AppError('UNSUPPORTED_ENGINE', 'this browser does not provide IndexedDB');
  }
  const indexedDb = await IndexedDbDatabase.open({ ...(options.name ? { name: options.name } : {}) });
  const migrations = new IdbMigrationManager(indexedDb, {
    appVersion: options.appVersion ?? '0.1.0',
  });
  await migrations.migrate();
  const store = new IndexedDbStore(indexedDb);
  const db = await PortableLawOffice.open({
    store,
    appVersion: options.appVersion ?? '0.1.0',
    platform: options.platform ?? 'web',
    deviceLabel: options.deviceLabel ?? 'متصفح',
    timezone: options.timezone ?? 'Africa/Cairo',
  });
  return {
    engine: 'indexeddb',
    db,
    indexedDb,
    migrations,
    close: async () => {
      await store.close();
    },
  };
}
