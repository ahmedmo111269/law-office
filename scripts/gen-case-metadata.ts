/** Generate browser-safe restore ledger constants; never alters migration 1. */
import { writeFileSync } from 'node:fs';
import { INITIAL_MIGRATION } from '../src/db/migrations/0001_initial.ts';
import { CASE_SYSTEM_MIGRATION } from '../src/db/migrations/0002_case_system.ts';
import { CASE_SYSTEM_IDB_MIGRATION } from '../src/db/indexeddb/case-system-migration.ts';
import { schemaChecksum } from '../src/db/indexeddb/indexeddb-adapter.ts';
import { PORTABLE_SCHEMA as V1 } from '../src/schema/v1/portable-schema.ts';
const metadata = {
  sqlite: [INITIAL_MIGRATION, CASE_SYSTEM_MIGRATION].map((m) => ({
    version: m.version,
    name: m.name,
    checksum: m.checksum,
    description: m.descriptionAr,
  })),
  indexeddb: [
    {
      version: 1,
      name: '0001_initial',
      checksum: schemaChecksum(V1),
      description: 'Initial portable schema (57 tables)',
    },
    {
      version: 2,
      name: CASE_SYSTEM_IDB_MIGRATION.name,
      checksum: CASE_SYSTEM_IDB_MIGRATION.checksum!,
      description: CASE_SYSTEM_IDB_MIGRATION.description,
    },
  ],
};
writeFileSync(
  'src/schema/v2/migration-metadata.ts',
  '/** Restore target-engine ledger metadata. Generated from the frozen migration definitions. */\nexport const CASE_MIGRATION_METADATA = ' +
    JSON.stringify(metadata, null, 2) +
    ' as const;\n',
);
console.log(
  'case restore ledger metadata generated (v1 + v2, SQLite + IndexedDB)',
);
