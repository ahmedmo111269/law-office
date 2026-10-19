import type { IdbMigration } from './idb-migration-manager.ts';
import { PORTABLE_SCHEMA } from '../../schema/current.ts';
import { PORTABLE_SEED } from '../../schema/v1/portable-seed.ts';
import { missingCaseSeeds } from '../../schema/v2/data-migration.ts';
import { SYNC_ENTITY_DEFINITIONS } from '../../sync/current-registry.ts';
export const CASE_SYSTEM_IDB_MIGRATION: IdbMigration = {
  version: 2,
  name: 'case_intake_and_procedural_history',
  description: 'Additive case intake, stages and search facets v2',
  checksum: 'cases-v2-20261019-1',
  async up({ tx, now }) {
    if ((await tx.count('lookup_list')) === 0)
      for (const [table, rows] of Object.entries(PORTABLE_SEED))
        for (const source of rows) {
          const row = { ...source };
          const def = PORTABLE_SCHEMA.tables.find((t) => t.name === table)!;
          for (const col of def.columns)
            if (!(col.name in row)) row[col.name] = col.defaultValue ?? null;
          await tx.put(table, row);
        }
    for (const [table, rows] of Object.entries(
      missingCaseSeeds(
        now,
        Object.fromEntries(
          await Promise.all(
            ['lookup_list', 'lookup_item', 'office_setting'].map(async (t) => [
              t,
              await tx.getAll(t),
            ]),
          ),
        ),
      ),
    ))
      for (const row of rows)
        if (!(await tx.get(table, String(row.id)))) await tx.put(table, row);
    for (const d of SYNC_ENTITY_DEFINITIONS)
      if (!(await tx.get('sync_entity_type', d.code)))
        await tx.put('sync_entity_type', {
          code: d.code,
          table_name: d.table,
          policy: d.policy,
          policy_version: 1,
          description: d.descriptionAr,
        });
    const partyRoles = (
      await tx.getByColumns('lookup_list', { code: 'party_role' })
    )[0];
    const client = partyRoles
      ? (
          await tx.getByColumns('lookup_item', {
            list_id: String(partyRoles.id),
            code: 'client',
          })
        )[0]
      : null;
    if (client)
      for (const row of await tx.getByColumns('case_file_party', {
        role_id: String(client.id),
      }))
        if (row.is_office_client !== 1)
          await tx.put('case_file_party', { ...row, is_office_client: 1 });
    await tx.put('app_meta', {
      key: 'schema.version',
      value: '2',
      updated_at: now,
    });
    await tx.put('app_meta', {
      key: 'cases.index_version',
      value: '0',
      updated_at: now,
    });
  },
};
