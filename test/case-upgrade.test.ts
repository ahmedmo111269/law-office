import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { LawOfficeDatabase } from '../src/app/law-office-database.ts';
import { SqliteDatabase } from '../src/db/sqlite/sqlite-adapter.ts';
import { MigrationManager } from '../src/db/migrations/manager.ts';
import { INITIAL_MIGRATION } from '../src/db/migrations/0001_initial.ts';
import { CASE_SYSTEM_MIGRATION } from '../src/db/migrations/0002_case_system.ts';
import { CASE_SYSTEM_IDB_MIGRATION } from '../src/db/indexeddb/case-system-migration.ts';
import { IndexedDbDatabase } from '../src/db/indexeddb/indexeddb-adapter.ts';
import { IdbMigrationManager } from '../src/db/indexeddb/idb-migration-manager.ts';
import {
  IndexedDbStore,
  SqlitePortableStore,
  type EngineRow,
} from '../src/portable/store.ts';
import {
  PortableLawOffice,
  type PortableBackup,
} from '../src/portable/portable-database.ts';
import { PORTABLE_SCHEMA as V1 } from '../src/schema/v1/portable-schema.ts';
import { CASE_MIGRATION_METADATA } from '../src/schema/v2/migration-metadata.ts';
import { stableStringify } from '../src/util/stable.ts';
import {
  makeCase,
  makeClient,
  makeCourt,
  makeFile,
  openHarness,
} from './helpers.ts';
import { caseProfile } from './case-helpers.ts';
const now = '2026-10-19T09:00:00.000Z';
const digest = (tables: Record<string, EngineRow[]>): string =>
  createHash('sha256')
    .update(
      stableStringify(
        Object.fromEntries(
          Object.keys(tables)
            .sort()
            .map((table) => [
              table,
              [...tables[table]!].sort((a, b) =>
                stableStringify(a).localeCompare(stableStringify(b)),
              ),
            ]),
        ),
      ),
    )
    .digest('hex');

async function legacyFixture() {
  const h = openHarness('representative-v1', true);
  const client = makeClient(h.db, 'عميل اختبار ترقية');
  const courtId = makeCourt(h.db, 'محكمة اختبار ترقية');
  const file = makeFile(h.db, [client.party.id], 'ملف اصطناعي v1');
  const legalCase = makeCase(h.db, file.id, courtId, '99001');
  const hearing = h.db.hearings.schedule({
    caseId: legalCase.id,
    scheduledAt: '2026-10-20T09:00:00.000Z',
  });
  h.db.judgments.record({
    caseId: legalCase.id,
    issuedOn: '2026-10-17',
    operativePart: 'منطوق اختبار ترقية',
    userAppealDeadline: '2026-11-30',
  });
  const document = h.db.documents.register({
    title: 'مستند اصطناعي قديم',
    docTypeCode: 'pleading',
    docDate: '2026-10-10',
  });
  h.db.documents.link(document.id, { kind: 'file', id: file.id });
  const task = h.db.tasks.create({
    title: 'مهمة اختبار قديمة',
    caseId: legalCase.id,
    fileId: file.id,
  });
  h.db.tasks.softDelete(task.id);
  // An office extended an old lookup before the new release. Its id must win,
  // and new seed children must refer to that id rather than a guessed UUID.
  const customType = h.db
    .entity('lookup_item')
    .insert({
      list_id: h.db.lookups.getListByCode('case_type')!.id,
      code: 'corporate',
      name_ar: 'شركات — تسمية المكتب القديمة',
      name_en: null,
      description: 'قيمة يملكها المكتب',
      sort_order: 800,
      parent_id: null,
      is_active: 1,
      is_system: 0,
    });
  const tables = await new SqlitePortableStore(h.db.db, V1).exportAll();
  const backup: PortableBackup = {
    format: 'lawo-portable-backup',
    formatVersion: 1,
    schemaVersion: 1,
    applicationId: V1.applicationId,
    createdAt: now,
    appVersion: '0.1.0-test',
    deviceId: h.db.device.id,
    engine: 'sqlite',
    tables,
    counts: Object.fromEntries(
      Object.entries(tables).map(([t, rows]) => [t, rows.length]),
    ),
    sha256: digest(tables),
  };
  return { h, backup, client, file, legalCase, hearing, customType };
}
function assertBusinessPreserved(
  before: Record<string, EngineRow[]>,
  after: Record<string, EngineRow[]>,
): void {
  for (const name of [
    'party',
    'person',
    'client_profile',
    'case_file',
    'legal_case',
    'hearing',
    'judgment',
    'case_file_case',
    'case_file_party',
    'document',
    'document_link',
    'task',
    'deletion_batch',
    'deletion_batch_item',
    'audit_log',
    'sync_outbox',
  ]) {
    for (const original of before[name] ?? []) {
      const primary = original.id ?? original.party_id ?? original.seq;
      const restored = after[name]?.find(
        (row) => (row.id ?? row.party_id ?? row.seq) === primary,
      );
      assert.ok(restored, `${name}:${String(primary)} disappeared`);
      for (const [key, value] of Object.entries(original))
        assert.deepEqual(
          restored[key],
          value,
          `${name}:${String(primary)}.${key} changed`,
        );
    }
  }
}

test('cases/upgrade: real native v1 -> v2 creates a verified preupgrade backup and preserves ids/audit/deletions', async () => {
  const fixture = await legacyFixture();
  const { h, backup, customType } = fixture;
  try {
    h.close();
    const reopened = LawOfficeDatabase.open({
      path: h.path,
      clock: h.clock,
      appVersion: '0.3.0-test',
      backupDir: join(h.dir, 'backups'),
    }).database;
    try {
      assert.equal(reopened.migrations.currentVersion(), 2);
      assert.equal(
        reopened.migrations.appliedRows()[0]?.checksum,
        INITIAL_MIGRATION.checksum,
      );
      const snapshots = readdirSync(join(h.dir, 'backups')).filter((f) =>
        f.endsWith('.sqlite'),
      );
      assert.equal(snapshots.length, 1);
      const path = join(h.dir, 'backups', snapshots[0]!);
      assert.equal(existsSync(`${path}.sha256`), true);
      const verified = reopened.backups.verify(path, {
        requireChecksumSidecar: true,
      });
      assert.equal(verified.valid, true, verified.errors.join(';'));
      assert.equal(verified.schemaVersion, 1);
      const after = await new SqlitePortableStore(reopened.db).exportAll();
      assertBusinessPreserved(backup.tables, after);
      assert.equal(
        reopened.entity('lookup_item').getById(String(customType.id))?.name_ar,
        'شركات — تسمية المكتب القديمة',
      );
      const classification = reopened.db.query<EngineRow>(
        'SELECT * FROM lookup_item WHERE parent_id=?',
        [customType.id],
      );
      assert.ok(
        classification.length > 0,
        'seed classifications must use office-owned corporate type id',
      );
      assert.equal(reopened.health.schemaCheck().ok, true);
      // Derived facets are rebuilt without turning old files into fictional intake rows.
      const portable = await PortableLawOffice.open({
        store: new SqlitePortableStore(reopened.db),
        clock: h.clock,
        appVersion: '0.3.0-test',
      });
      assert.equal(
        (
          await portable.queryCaseIndex({
            filters: [{ column: 'case_scope', op: 'eq', value: 'case' }],
            limit: 10,
          })
        ).total,
        1,
      );
      assert.equal(
        (
          await portable.queryCaseIndex({
            filters: [{ column: 'case_scope', op: 'eq', value: 'intake' }],
            limit: 10,
          })
        ).total,
        0,
      );
      reopened.db.exec('DROP INDEX procedural_stage_file_idx');
      const missing = reopened.health.schemaCheck();
      assert.equal(missing.ok, false);
      assert.ok(missing.missingIndexes.includes('procedural_stage_file_idx'));
    } finally {
      reopened.close();
    }
  } finally {
    h.cleanup();
  }
});

for (const engine of ['sqlite', 'indexeddb'] as const)
  test(`cases/upgrade: v1 logical backup restores into ${engine}, upgrades once and keeps provenance/history`, async () => {
    const { h, backup, file, legalCase, customType } = await legacyFixture();
    const target = await caseProfile(engine);
    try {
      const valid = await target.db.verifyBackup(backup);
      assert.equal(valid.valid, true, valid.errors.join(';'));
      await target.db.restoreBackup(structuredClone(backup));
      const after = await target.store.exportAll();
      assertBusinessPreserved(backup.tables, after);
      assert.equal(
        (await target.db.require('case_file', file.id)).intake_enabled,
        0,
      );
      assert.equal(
        (await target.db.require('legal_case', legalCase.id)).case_number,
        '99001',
      );
      assert.equal(
        (
          await target.db.query('lookup_item', {
            filters: [
              { column: 'parent_id', op: 'eq', value: String(customType.id) },
            ],
            limit: 10,
          })
        ).total > 0,
        true,
      );
      const ledger = after.schema_migration!.sort(
        (a, b) => Number(a.version) - Number(b.version),
      );
      assert.deepEqual(
        ledger.map((r) => r.checksum),
        CASE_MIGRATION_METADATA[engine].map((r) => r.checksum),
      );
      assert.ok(
        after.app_meta!.some((r) =>
          String(r.key).startsWith('restore.source_migrations.'),
        ),
      );
      const exported = await target.db.exportBackup();
      assert.equal(exported.schemaVersion, 2);
      assert.equal((await target.db.verifyBackup(exported)).valid, true);
      assert.equal((await target.db.healthCheck()).ok, true);
      if (target.idb)
        assert.equal(
          (await new IdbMigrationManager(target.idb).verify()).valid,
          true,
        );
      else if (target.sqlite)
        new MigrationManager(target.sqlite, {
          clock: h.clock,
          appVersion: '0.3.0-test',
          migrations: [INITIAL_MIGRATION, CASE_SYSTEM_MIGRATION],
        }).verifyHistory();
      assert.equal((await target.list()).total, 1);
    } finally {
      await target.close();
      h.cleanup();
    }
  });

test('cases/upgrade: actual IndexedDB versionchange from v1 adds defaults and preserves office codes and the v1 ledger', async () => {
  const { h, backup, customType } = await legacyFixture();
  const name = `case-upgrade-${randomUUID()}`;
  try {
    const legacy = await IndexedDbDatabase.open({ name, schema: V1 });
    const source = structuredClone(backup.tables);
    const original = source.schema_migration![0]!;
    source.schema_migration = [
      {
        ...original,
        name: CASE_MIGRATION_METADATA.indexeddb[0].name,
        checksum: CASE_MIGRATION_METADATA.indexeddb[0].checksum,
      },
    ];
    const oldStore = new IndexedDbStore(legacy);
    await oldStore.importAll(source);
    await oldStore.close();
    const current = await IndexedDbDatabase.open({ name });
    try {
      const migrations = new IdbMigrationManager(current, {
        appVersion: '0.3.0-test',
        clock: () => h.clock.now(),
      });
      const result = await migrations.migrate();
      assert.deepEqual(
        result.applied.map((r) => r.version),
        [2],
      );
      const store = new IndexedDbStore(current);
      const db = await PortableLawOffice.open({
        store,
        appVersion: '0.3.0-test',
        clock: h.clock,
      });
      const after = await store.exportAll();
      assertBusinessPreserved(backup.tables, after);
      assert.equal(
        (
          await db.query('lookup_item', {
            filters: [
              { column: 'parent_id', op: 'eq', value: String(customType.id) },
            ],
            limit: 10,
          })
        ).total > 0,
        true,
      );
      assert.equal((await migrations.migrate()).applied.length, 0);
      assert.equal((await migrations.verify()).valid, true);
      assert.equal((await current.integrityCheck()).ok, true);
      assert.equal((await db.healthCheck()).ok, true);
      assert.equal(
        (await db.verifyBackup(await db.exportBackup())).valid,
        true,
      );
    } finally {
      await current.close();
    }
  } finally {
    h.cleanup();
  }
});

test('cases/upgrade: full v2 SQLite DDL/seed failure rolls back and a retry upgrades without duplicate data', async () => {
  const { h, backup } = await legacyFixture();
  try {
    h.close();
    const db = SqliteDatabase.open({ path: h.path });
    try {
      const bad = {
        ...CASE_SYSTEM_MIGRATION,
        up: (...args: Parameters<typeof CASE_SYSTEM_MIGRATION.up>) => {
          CASE_SYSTEM_MIGRATION.up(...args);
          throw new Error('injected v2 failure');
        },
      };
      const options = {
        clock: h.clock,
        appVersion: '0.3.0-test',
        migrations: [INITIAL_MIGRATION, bad],
      };
      assert.throws(
        () => new MigrationManager(db, options).migrate(),
        /injected v2 failure|migration/,
      );
      assert.equal(
        db.get<{ user_version: number }>('PRAGMA user_version')?.user_version,
        1,
      );
      assert.equal(
        db.get("SELECT name FROM sqlite_master WHERE name='procedural_stage'"),
        undefined,
      );
      assert.equal(
        db.get<{ count: number }>('SELECT COUNT(*) AS count FROM lookup_item')
          ?.count,
        backup.tables.lookup_item!.length,
      );
      new MigrationManager(db, {
        ...options,
        migrations: [INITIAL_MIGRATION, CASE_SYSTEM_MIGRATION],
      }).migrate();
      assert.equal(
        db.get<{ user_version: number }>('PRAGMA user_version')?.user_version,
        2,
      );
    } finally {
      db.close();
    }
  } finally {
    h.cleanup();
  }
});

test('cases/upgrade: IndexedDB data migration failure rolls back rows and the next open retries idempotently', async () => {
  const idb = await IndexedDbDatabase.open({
    name: `case-upgrade-failure-${randomUUID()}`,
  });
  try {
    const bad = {
      ...CASE_SYSTEM_IDB_MIGRATION,
      up: async (
        context: Parameters<typeof CASE_SYSTEM_IDB_MIGRATION.up>[0],
      ) => {
        await CASE_SYSTEM_IDB_MIGRATION.up(context);
        throw new Error('injected v2 failure');
      },
    };
    const manager = new IdbMigrationManager(idb, { migrations: [bad] });
    await assert.rejects(() => manager.migrate(), /injected v2 failure/);
    assert.equal(await idb.count('lookup_item'), 0);
    assert.equal((await manager.applied()).length, 1);
    const good = new IdbMigrationManager(idb);
    await good.migrate();
    assert.equal(await idb.count('lookup_item'), 505);
    assert.equal((await good.verify()).valid, true);
    assert.equal((await good.migrate()).applied.length, 0);
  } finally {
    await idb.close();
  }
});

test('cases/backup: rehashed cycles, ledger tampering, malformed rows and bad counts are rejected before replacement', async () => {
  const h = await caseProfile('sqlite');
  try {
    const intake = await h.cases.saveIntake({
      title: 'نسخة اختبار سليمة',
      caseTypeCode: 'civil',
    });
    const stage = await h.cases.saveStage({
      fileId: String(intake.file.id),
      typeCode: 'notice',
    });
    const child = await h.cases.saveStage({
      fileId: String(intake.file.id),
      typeCode: 'mediation',
      previousStageId: String(stage.id),
    });
    const original = await h.db.exportBackup();
    const cycle = structuredClone(original);
    cycle.tables.procedural_stage!.find(
      (s) => s.id === stage.id,
    )!.previous_stage_id = child.id!;
    const rehashed = { ...cycle, sha256: digest(cycle.tables) };
    assert.equal((await h.db.verifyBackup(rehashed)).valid, false);
    await assert.rejects(() => h.db.restoreBackup(rehashed), /verification/);
    assert.equal(
      (await h.db.require('procedural_stage', String(stage.id)))
        .previous_stage_id,
      null,
    );
    const ledger = structuredClone(original);
    ledger.tables.schema_migration![0]!.checksum = 'bad';
    assert.equal(
      (await h.db.verifyBackup({ ...ledger, sha256: digest(ledger.tables) }))
        .valid,
      false,
    );
    const counts = structuredClone(original);
    counts.counts.case_file = 1000;
    assert.equal((await h.db.verifyBackup(counts)).valid, false);
    assert.equal(
      (await h.db.verifyBackup({ ...original, tables: { party: [null] } }))
        .valid,
      false,
    );
    assert.equal((await h.db.verifyBackup(original)).valid, true);
  } finally {
    await h.close();
  }
});
