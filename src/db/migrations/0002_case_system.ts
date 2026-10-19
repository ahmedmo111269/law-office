import { createHash } from 'node:crypto';
import type { Migration } from './types.ts';
import { CASE_SYSTEM_DDL } from '../../schema/v2/ddl.ts';
import { caseSystemSeeds } from '../../schema/v2/seed.ts';
import { SYNC_ENTITY_DEFINITIONS as V1 } from '../../sync/entity-registry.ts';
import { SYNC_ENTITY_DEFINITIONS as CURRENT } from '../../sync/current-registry.ts';
import { missingCaseSeeds } from '../../schema/v2/data-migration.ts';
import { stableStringify } from '../../util/stable.ts';
/** The seed registry delta is frozen independently of runtime mutable fields. */
export const CASE_SYSTEM_CHECKSUM = createHash('sha256')
  .update(
    stableStringify({
      ddl: CASE_SYSTEM_DDL,
      seeds: caseSystemSeeds('2000-01-01T00:00:00.000Z'),
      entities: [
        ['procedural_stage', 'field_merge'],
        ['case_term', 'relation_set'],
      ],
    }),
  )
  .digest('hex');
export const CASE_SYSTEM_MIGRATION: Migration = {
  version: 2,
  name: 'case_intake_and_procedural_history',
  descriptionAr:
    'تصنيف وقوالب ومراحل مستقلة وفهرسة القضايا دون تغيير بيانات v1',
  checksum: CASE_SYSTEM_CHECKSUM,
  up(db, context) {
    db.exec(CASE_SYSTEM_DDL);
    for (const [table, rows] of Object.entries(
      missingCaseSeeds(
        context.now,
        Object.fromEntries(
          ['lookup_list', 'lookup_item', 'office_setting'].map((t) => [
            t,
            db.query<import('../../portable/store.ts').EngineRow>(
              `SELECT * FROM ${t}`,
            ),
          ]),
        ),
      ),
    ))
      for (const row of rows) {
        const cols = Object.keys(row);
        db.run(
          `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`,
          Object.values(row),
        );
      }
    for (const definition of CURRENT.filter(
      (d) => !V1.some((v) => v.code === d.code),
    ))
      db.run(
        'INSERT INTO sync_entity_type (code,table_name,policy,policy_version,description) VALUES (?,?,?,1,?)',
        [
          definition.code,
          definition.table,
          definition.policy,
          definition.descriptionAr,
        ],
      );
    db.run(
      "UPDATE case_file_party SET is_office_client=1 WHERE role_id IN (SELECT i.id FROM lookup_item i JOIN lookup_list l ON l.id=i.list_id WHERE l.code='party_role' AND i.code='client')",
    );
    db.run(
      "INSERT INTO app_meta (key,value,updated_at) VALUES ('cases.index_version','0',?)",
      [context.now],
    );
    db.run(
      "INSERT INTO app_meta (key,value,updated_at) VALUES ('search.rebuild_required','1',?) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=excluded.updated_at",
      [context.now],
    );
  },
};
