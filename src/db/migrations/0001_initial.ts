import { createHash } from 'node:crypto';
import { SCHEMA_V1_DDL, SEARCH_FTS_DDL, SEARCH_FTS_DROP } from '../../schema/v1/ddl.ts';
import {
  OFFICE_PROFILE_SEED,
  SEED_CURRENCIES,
  SEED_LOOKUP_LISTS,
  SEED_NUMBER_SERIES,
  SEED_OFFICE_SETTINGS,
  SYSTEM_DEVICE_SEED,
} from '../../schema/v1/seed.ts';
import { SYNC_ENTITY_DEFINITIONS } from '../../sync/entity-registry.ts';
import { stableStringify } from '../../util/stable.ts';
import { uuidv5 } from '../../util/uuid.ts';
import type { DatabaseAdapter } from '../adapter.ts';
import type { Migration, MigrationContext } from './types.ts';

export const SYSTEM_DEVICE_ID = uuidv5('device:system');
export const OFFICE_PROFILE_ID = uuidv5('office_profile:default');

export function lookupListId(code: string): string {
  return uuidv5(`lookup_list:${code}`);
}

export function lookupItemId(listCode: string, itemCode: string): string {
  return uuidv5(`lookup_item:${listCode}:${itemCode}`);
}

export function officeSettingId(key: string): string {
  return uuidv5(`office_setting:${key}`);
}

/** Only the data actually written by the migration participates in the checksum. */
const SYNC_SEED_ROWS = SYNC_ENTITY_DEFINITIONS.map((definition) => ({
  code: definition.code,
  table: definition.table,
  policy: definition.policy,
  description: definition.descriptionAr,
}));

const CHECKSUM_SOURCE = stableStringify({
  ddl: SCHEMA_V1_DDL,
  lookups: SEED_LOOKUP_LISTS,
  settings: SEED_OFFICE_SETTINGS,
  currencies: SEED_CURRENCIES,
  numberSeries: SEED_NUMBER_SERIES,
  systemDevice: SYSTEM_DEVICE_SEED,
  officeProfile: OFFICE_PROFILE_SEED,
  syncEntityTypes: SYNC_SEED_ROWS,
});

export const INITIAL_MIGRATION_CHECKSUM = createHash('sha256')
  .update(CHECKSUM_SOURCE, 'utf8')
  .digest('hex');

function insertSeeds(adapter: DatabaseAdapter, context: MigrationContext): void {
  const now = context.now;
  const origin = SYSTEM_DEVICE_ID;

  adapter.run(
    `INSERT INTO local_device
      (id, label, platform, short_code, app_version, timezone, is_local, is_active,
       notes, created_at, updated_at, deleted_at, origin_device_id, revision,
       sync_status, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, NULL, ?, 1, 'local', NULL)`,
    [
      SYSTEM_DEVICE_ID,
      SYSTEM_DEVICE_SEED.label,
      SYSTEM_DEVICE_SEED.platform,
      SYSTEM_DEVICE_SEED.shortCode,
      context.appVersion,
      SYSTEM_DEVICE_SEED.timezone,
      'صف نظامي يمثل مصدر البيانات الأساسية',
      now,
      now,
      origin,
    ],
  );

  for (const currency of SEED_CURRENCIES) {
    adapter.run(
      `INSERT INTO currency (code, name_ar, name_en, symbol, minor_units, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [currency.code, currency.nameAr, currency.nameEn, currency.symbol, currency.minorUnits],
    );
  }

  for (const list of SEED_LOOKUP_LISTS) {
    const listId = lookupListId(list.code);
    adapter.run(
      `INSERT INTO lookup_list
        (id, code, name_ar, name_en, description, is_system, is_extensible,
         created_at, updated_at, deleted_at, origin_device_id, revision,
         sync_status, last_synced_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, NULL, ?, 1, 'local', NULL)`,
      [
        listId,
        list.code,
        list.nameAr,
        list.nameEn ?? null,
        list.description ?? null,
        now,
        now,
        origin,
      ],
    );
    list.items.forEach((entry, index) => {
      adapter.run(
        `INSERT INTO lookup_item
          (id, list_id, code, name_ar, name_en, description, sort_order, parent_id,
           is_active, is_system, created_at, updated_at, deleted_at, origin_device_id,
           revision, sync_status, last_synced_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 1, 1, ?, ?, NULL, ?, 1, 'local', NULL)`,
        [
          lookupItemId(list.code, entry.code),
          listId,
          entry.code,
          entry.nameAr,
          entry.nameEn ?? null,
          index * 10,
          now,
          now,
          origin,
        ],
      );
    });
  }

  for (const setting of SEED_OFFICE_SETTINGS) {
    adapter.run(
      `INSERT INTO office_setting
        (id, key, value, value_type, description, created_at, updated_at, deleted_at,
         origin_device_id, revision, sync_status, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 'local', NULL)`,
      [
        officeSettingId(setting.key),
        setting.key,
        setting.value,
        setting.valueType,
        setting.descriptionAr,
        now,
        now,
        origin,
      ],
    );
  }

  for (const series of SEED_NUMBER_SERIES) {
    adapter.run(
      `INSERT INTO number_series
        (key, scope, prefix, suffix, format, padding, next_value, updated_at)
       VALUES (?, ?, '', '', ?, ?, ?, ?)`,
      [series.key, series.scope, series.format, series.padding, series.nextValue, now],
    );
  }

  for (const definition of SYNC_ENTITY_DEFINITIONS) {
    adapter.run(
      `INSERT INTO sync_entity_type (code, table_name, policy, policy_version, description)
       VALUES (?, ?, ?, 1, ?)`,
      [definition.code, definition.table, definition.policy, definition.descriptionAr],
    );
  }

  adapter.run(
    `INSERT INTO office_profile
      (id, name, legal_form, address_line, city, governorate_id, phone, email, website,
       tax_registration_no, commercial_registry_no, bar_association_no, is_configured,
       notes, created_at, updated_at, deleted_at, origin_device_id, revision,
       sync_status, last_synced_at)
     VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, NULL, ?, 1, 'local', NULL)`,
    [
      OFFICE_PROFILE_ID,
      OFFICE_PROFILE_SEED.name,
      OFFICE_PROFILE_SEED.isConfigured,
      now,
      now,
      origin,
    ],
  );

  const meta = (key: string, value: string): void => {
    adapter.run(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now],
    );
  };
  meta('schema.version', '1');
  meta('schema.installed_at', now);
  meta('schema.checksum', INITIAL_MIGRATION_CHECKSUM);
  meta('db.engine', 'sqlite');
  meta('db.application_id', 'LAWO');
  meta('backup.format_version', '1');
  meta('setup.office_configured', '0');
}

export const INITIAL_MIGRATION: Migration = {
  version: 1,
  name: 'initial_schema_v1',
  descriptionAr:
    'إنشاء المخطط الأساسي: الأطراف، الملفات، القضايا، الجلسات، الأحكام، الأعمال، المستندات، العقود، المالية، التدقيق، قابلية المزامنة، والبحث المحلي.',
  checksum: INITIAL_MIGRATION_CHECKSUM,
  up(adapter, context) {
    adapter.exec(SCHEMA_V1_DDL);
    insertSeeds(adapter, context);

    let fts5 = false;
    if (context.capabilities.fts5) {
      try {
        adapter.exec(SEARCH_FTS_DDL);
        fts5 = true;
      } catch {
        try {
          adapter.exec(SEARCH_FTS_DROP);
        } catch {
          // The canonical tables remain valid; the fallback index still works.
        }
      }
    }
    adapter.run(
      `INSERT INTO app_meta (key, value, updated_at) VALUES ('search.fts5', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [fts5 ? '1' : '0', context.now],
    );
    adapter.run(
      `INSERT INTO app_meta (key, value, updated_at) VALUES ('search.rebuild_required', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ['1', context.now],
    );
  },
};
