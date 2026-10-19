/** Logical v1 -> v2 upgrade. Originals remain in the input backup; canonical ids/history are not regenerated. */
import { PORTABLE_SCHEMA } from '../schema/current.ts';
import { missingCaseSeeds } from '../schema/v2/data-migration.ts';
import { CASE_MIGRATION_METADATA } from '../schema/v2/migration-metadata.ts';
import { SYNC_ENTITY_DEFINITIONS } from '../sync/current-registry.ts';
import type { EngineRow } from '../portable/store.ts';
export function upgradeBackupTables(
  source: Readonly<Record<string, readonly EngineRow[]>>,
  sourceVersion: number,
  sourceEngine: 'sqlite' | 'indexeddb',
  targetEngine: 'sqlite' | 'indexeddb',
  now: string,
  appVersion: string,
): Record<string, EngineRow[]> {
  const tables: Record<string, EngineRow[]> = {};
  for (const table of PORTABLE_SCHEMA.tables) {
    tables[table.name] = (source[table.name] ?? []).map((original) => {
      const row = { ...original };
      if (sourceVersion === 1)
        for (const c of table.columns)
          if (!(c.name in row)) row[c.name] = c.defaultValue ?? null;
      return row;
    });
  }
  tables.app_meta = tables.app_meta!.filter(
    (r) => !String(r.key).startsWith('sequence.'),
  );
  const meta = (key: string, value: string): void => {
    const old = tables.app_meta!.find((r) => r.key === key);
    if (old) {
      old.value = value;
      old.updated_at = now;
    } else tables.app_meta!.push({ key, value, updated_at: now });
  };
  if (sourceVersion === 1) {
    for (const [table, rows] of Object.entries(missingCaseSeeds(now, tables)))
      tables[table]!.push(...rows);
    for (const d of SYNC_ENTITY_DEFINITIONS)
      if (!tables.sync_entity_type!.some((r) => r.code === d.code))
        tables.sync_entity_type!.push({
          code: d.code,
          table_name: d.table,
          policy: d.policy,
          policy_version: 1,
          description: d.descriptionAr,
        });
    const roleList = tables.lookup_list!.find((r) => r.code === 'party_role');
    const client = tables.lookup_item!.find(
      (r) => r.list_id === roleList?.id && r.code === 'client',
    );
    if (client)
      for (const p of tables.case_file_party!)
        if (p.role_id === client.id) p.is_office_client = 1;
  }
  if (sourceVersion === 1 || sourceEngine !== targetEngine) {
    // Engine ledgers have different frozen checksums. Keep the complete source
    // provenance, then install the target's verified schema history. Business
    // audit/deletion/revision/outbox records are left byte-for-byte unchanged.
    meta(
      `restore.source_migrations.${now}`,
      JSON.stringify({
        engine: sourceEngine,
        version: sourceVersion,
        rows: source.schema_migration ?? [],
      }),
    );
    tables.schema_migration = CASE_MIGRATION_METADATA[targetEngine].map(
      (definition) => {
        const old = source.schema_migration?.find(
          (r) => r.version === definition.version,
        );
        return {
          ...(old ?? {}),
          version: definition.version,
          name: definition.name,
          description: definition.description,
          checksum: definition.checksum,
          applied_at: old?.applied_at ?? now,
          execution_ms: old?.execution_ms ?? 0,
          app_version: old?.app_version ?? appVersion,
          backup_path: old?.backup_path ?? null,
        };
      },
    );
  }
  meta('schema.version', '2');
  meta('cases.index_version', '0');
  meta('search.rebuild_pending', '1');
  meta('engine', targetEngine);
  meta('db.engine', targetEngine);
  return tables;
}
