/** Real Chromium-only v1→v2/versionchange regression. Called by the existing browser harness, not shipped. */
import { IndexedDbDatabase } from '../src/db/indexeddb/indexeddb-adapter.ts';
import { IdbMigrationManager } from '../src/db/indexeddb/idb-migration-manager.ts';
import { IndexedDbStore, type EngineRow } from '../src/portable/store.ts';
import { PortableLawOffice } from '../src/portable/portable-database.ts';
import { PORTABLE_SCHEMA as V1 } from '../src/schema/v1/portable-schema.ts';
import { PORTABLE_SEED } from '../src/schema/v1/portable-seed.ts';
export async function realBrowserCaseUpgrade() {
  const name = 'law-office-real-v1-upgrade-test';
  const legacy = await IndexedDbDatabase.open({ name, schema: V1 }),
    oldStore = new IndexedDbStore(legacy);
  await oldStore.importAll(
    Object.fromEntries(
      Object.entries(PORTABLE_SEED).map(([table, rows]) => [
        table,
        rows.map((row) => ({ ...row })),
      ]),
    ),
  );
  await new IdbMigrationManager(legacy, {
    migrations: [],
    appVersion: '0.1.0-legacy-fixture',
  }).ensureBaseline();
  const baseline = await oldStore.get(
      'schema_migration',
      1 as unknown as string,
    ),
    now = '2026-10-19T00:00:00.000Z';
  const device = PORTABLE_SEED.local_device![0]!.id!;
  const ref = (listCode: string, code: string): string => {
    const list = PORTABLE_SEED.lookup_list!.find((r) => r.code === listCode);
    const item = PORTABLE_SEED.lookup_item!.find(
      (r) => r.list_id === list?.id && r.code === code,
    );
    if (!item)
      throw new Error(`missing legacy fixture reference ${listCode}/${code}`);
    return String(item.id);
  };
  const row = (table: string, patch: EngineRow): EngineRow => ({
    ...Object.fromEntries(
      V1.tables
        .find((t) => t.name === table)!
        .columns.map((c) => [c.name, c.defaultValue ?? null]),
    ),
    created_at: now,
    updated_at: now,
    origin_device_id: device,
    ...patch,
  });
  const fileId = crypto.randomUUID(),
    caseId = crypto.randomUUID(),
    linkId = crypto.randomUUID();
  await oldStore.transaction(
    ['case_file', 'legal_case', 'case_file_case'],
    async (tx) => {
      await tx.put(
        'case_file',
        row('case_file', {
          id: fileId,
          title: 'ملف ترقية اصطناعي في Chromium',
          file_number: 'LEGACY-BROWSER-1',
          file_type_id: ref('file_type', 'primary'),
          opened_on: '2026-10-01',
          notes: 'LEGACY-PRIVATE-NOTE',
        }),
      );
      await tx.put(
        'legal_case',
        row('legal_case', {
          id: caseId,
          case_number: 'LEGACY-123',
          case_year: 2026,
          case_type_id: ref('case_type', 'civil'),
        }),
      );
      await tx.put(
        'case_file_case',
        row('case_file_case', {
          id: linkId,
          file_id: fileId,
          case_id: caseId,
          is_primary: 1,
        }),
      );
    },
  );
  // Leave the old connection open. versionchange MUST close it without losing
  // the old business rows; this is the browser event, not fake-indexeddb.
  const current = await IndexedDbDatabase.open({ name });
  try {
    const manager = new IdbMigrationManager(current, {
        appVersion: '0.3.0-browser-upgrade',
      }),
      applied = await manager.migrate(),
      store = new IndexedDbStore(current);
    const progress: Array<{
      entity: string;
      processed: number;
      total: number;
    }> = [];
    const db = await PortableLawOffice.open({
      store,
      appVersion: '0.3.0-browser-upgrade',
      onIndexProgress: (p) => progress.push(p),
    });
    const file = await db.require('case_file', fileId),
      judicial = await db.require('legal_case', caseId);
    const result = {
      versionChangeClosedOldConnection: !legacy.isOpen,
      baselineLedgerPreserved:
        JSON.stringify(
          await store.get('schema_migration', 1 as unknown as string),
        ) === JSON.stringify(baseline),
      newMigrationVersions: applied.applied.map((r) => r.version),
      fileIdPreserved: file.id === fileId,
      caseIdPreserved: judicial.id === caseId,
      linkIdPreserved:
        (await db.query('case_file_case', { limit: 10 })).rows[0]?.id ===
        linkId,
      oldNotesPreserved: file.notes === 'LEGACY-PRIVATE-NOTE',
      newDefaults: file.specialized_json === '{}' && file.intake_enabled === 0,
      exactCases: (
        await db.queryCaseIndex({
          filters: [{ column: 'case_scope', op: 'eq', value: 'case' }],
          limit: 25,
        })
      ).total,
      progress,
      health: (await db.healthCheck()).ok,
      migrations: (await manager.verify()).valid,
    };
    if (
      !result.versionChangeClosedOldConnection ||
      !result.baselineLedgerPreserved ||
      !result.fileIdPreserved ||
      !result.caseIdPreserved ||
      !result.linkIdPreserved ||
      !result.oldNotesPreserved ||
      !result.newDefaults ||
      result.exactCases !== 1 ||
      !result.health ||
      !result.migrations ||
      progress.length < 2
    )
      throw new Error(JSON.stringify(result));
    return result;
  } finally {
    await current.close();
  }
}
