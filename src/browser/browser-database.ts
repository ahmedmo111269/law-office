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
  onProgress?: (message: string) => void;
}

export function indexedDbAvailable(): boolean {
  try {
    return (
      typeof globalThis.indexedDB !== 'undefined' &&
      globalThis.indexedDB !== null
    );
  } catch {
    return false;
  }
}

export async function openBrowserDatabase(
  options: OpenBrowserDatabaseOptions = {},
): Promise<BrowserDatabase> {
  if (!indexedDbAvailable()) {
    throw new AppError(
      'UNSUPPORTED_ENGINE',
      'this browser does not provide IndexedDB',
    );
  }
  const indexedDb = await IndexedDbDatabase.open({
    ...(options.name ? { name: options.name } : {}),
    onBlocked: () =>
      options.onProgress?.(
        'تنتظر ترقية قاعدة البيانات إغلاق نسخة أخرى من البرنامج. أغلق علامات التبويب الأخرى ثم انتظر؛ لا تحذف البيانات.',
      ),
  });
  try {
    options.onProgress?.(
      'جارٍ التحقق من ترحيل البيانات المحلية مع الحفاظ على السجلات…',
    );
    const migrations = new IdbMigrationManager(indexedDb, {
      appVersion: options.appVersion ?? '0.3.0',
    });
    await migrations.migrate();
    const store = new IndexedDbStore(indexedDb);
    const db = await PortableLawOffice.open({
      store,
      appVersion: options.appVersion ?? '0.3.0',
      platform: options.platform ?? 'web',
      deviceLabel: options.deviceLabel ?? 'متصفح',
      timezone: options.timezone ?? 'Africa/Cairo',
      onIndexProgress: ({ entity, processed, total }) =>
        options.onProgress?.(
          `جارٍ تحديث الفهرس المحلي: ${({ case_file: 'ملفات النزاع', legal_case: 'الدعاوى', party: 'الأطراف', court: 'الجهات', hearing: 'الجلسات', judgment: 'الأحكام', task: 'المهام', document: 'المستندات', contract: 'العقود', power_of_attorney: 'التوكيلات', appointment: 'المواعيد' } as Record<string, string>)[entity] ?? entity} ${processed} / ${total}. احتفظ بهذه النافذة مفتوحة؛ لا تُرسل البيانات لأي خادم.`,
        ),
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
  } catch (error) {
    indexedDb.close();
    throw error;
  }
}
