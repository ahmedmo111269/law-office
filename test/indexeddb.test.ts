import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexedDbDatabase, IDB_APPLICATION_ID } from '../src/db/indexeddb/indexeddb-adapter.ts';
import { IdbMigrationManager } from '../src/db/indexeddb/idb-migration-manager.ts';
import { IndexedDbStore } from '../src/portable/store.ts';
import { PortableLawOffice } from '../src/portable/portable-database.ts';
import { PORTABLE_SCHEMA } from '../src/schema/v1/portable-schema.ts';
import { FixedClock } from '../src/util/clock.ts';

let dbCounter = 0;

async function freshDatabase(name?: string): Promise<{ idb: IndexedDbDatabase; store: IndexedDbStore; db: PortableLawOffice; name: string }> {
  dbCounter += 1;
  const dbName = name ?? `lawo-test-${dbCounter}-${Date.now()}`;
  const idb = await IndexedDbDatabase.open({ name: dbName });
  const migrations = new IdbMigrationManager(idb, { appVersion: '0.1.0-test', clock: new FixedClock('2026-10-18T09:00:00.000Z').now });
  await migrations.migrate();
  const store = new IndexedDbStore(idb);
  const db = await PortableLawOffice.open({
    store,
    clock: new FixedClock('2026-10-18T09:00:00.000Z'),
    appVersion: '0.1.0-test',
    platform: 'web',
    deviceLabel: 'browser-test',
    timezone: 'Africa/Cairo',
  });
  return { idb, store, db, name: dbName };
}

test('indexeddb: opens a real object store for every schema table and index', async () => {
  const { idb, db } = await freshDatabase();
  try {
    const info = await idb.tableInfo();
    assert.equal(info.length, PORTABLE_SCHEMA.tables.length);
    const byName = new Map(info.map((table) => [table.name, table]));
    for (const table of PORTABLE_SCHEMA.tables) {
      const actual = byName.get(table.name)!;
      assert.ok(actual, `missing store ${table.name}`);
      for (const index of table.indexes) {
        assert.ok(actual.indexes.includes(index.name), `missing index ${table.name}.${index.name}`);
      }
    }
    const integrity = await idb.integrityCheck();
    assert.equal(integrity.ok, true, integrity.errors.join('\n'));
    assert.equal(integrity.tables, 57);
    const meta = await idb.readMeta();
    assert.equal(meta.application_id, String(IDB_APPLICATION_ID));
    assert.equal(meta.schema_version, '1');
    assert.equal(meta.engine, 'indexeddb');
    assert.ok(((await db.stats()).audit_log ?? 0) >= 1);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: seeds reference data once with identical deterministic ids', async () => {
  const first = await freshDatabase();
  const counts = {
    lookup_list: await first.store.count('lookup_list'),
    lookup_item: await first.store.count('lookup_item'),
    sync_entity_type: await first.store.count('sync_entity_type'),
  };
  assert.deepEqual(counts, { lookup_list: 54, lookup_item: 374, sync_entity_type: 43 });
  const firstList = await first.db.lookup('file_status', 'open');
  await first.store.close();

  const second = await freshDatabase(first.name);
  try {
    assert.equal(await second.store.count('lookup_list'), 54);
    const list = await second.db.lookup('file_status', 'open');
    assert.equal(list.id, firstList.id);
    const devices = await second.store.getAll('local_device');
    assert.equal(devices.length, 2);
    assert.equal(devices.filter((device) => device.is_local === 1).length, 1);
  } finally {
    await second.store.close();
  }
});

test('indexeddb: enforces NOT NULL, CHECK, foreign keys and unique indexes without SQL', async () => {
  const { db } = await freshDatabase();
  const activeStatus = String((await db.lookup('party_status', 'active')).id);
  try {
    const constraintText = (error: unknown): string =>
      `${(error as Error).message} ${JSON.stringify((error as { details?: unknown }).details ?? '')}`;
    await assert.rejects(
      () => db.insert('party', { display_name: 'x', status_id: activeStatus }),
      (error: Error) => /required/.test(constraintText(error)),
    );
    await assert.rejects(
      () => db.insert('party', { kind: 'robot', display_name: 'x', status_id: activeStatus }),
      (error: Error) => /CHECK failed/.test(constraintText(error)),
    );
    await assert.rejects(
      () =>
        db.insert('party', {
          kind: 'person',
          display_name: 'x',
          status_id: '00000000-0000-4000-8000-000000000000',
        }),
      (error: Error) => /FOREIGN_KEY_VIOLATION|no parent/.test(error.message),
    );
    const list = await db.insert('lookup_list', {
      code: 'custom_test_list',
      name_ar: 'قائمة اختبار',
      name_en: 'test list',
      description: null,
      is_system: 0,
      is_extensible: 1,
    });
    await assert.rejects(
      () =>
        db.insert('lookup_list', {
          code: 'custom_test_list',
          name_ar: 'قائمة مكررة',
          name_en: null,
          description: null,
          is_system: 0,
          is_extensible: 1,
        }),
      (error: Error & { code?: string }) => error.code === 'UNIQUE_VIOLATION',
    );
    assert.ok(list.id);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: partial unique indexes match the SQLite predicate semantics', async () => {
  const { db } = await freshDatabase();
  try {
    const court = await db.createCourt({ name: 'محكمة القاهرة' });
    const first = await db.createCase({ caseNumber: '100', caseYear: 2026, courtId: String(court.id) });
    await assert.rejects(
      () => db.createCase({ caseNumber: '100', caseYear: 2026, courtId: String(court.id) }),
      (error: Error & { code?: string }) => error.code === 'UNIQUE_VIOLATION',
    );
    await db.softDelete('legal_case', String(first.id));
    const second = await db.createCase({ caseNumber: '100', caseYear: 2026, courtId: String(court.id) });
    assert.notEqual(second.id, first.id);
    // Restoring the older row now collides with the replacement, exactly as the
    // SQLite unique index would refuse it.
    await assert.rejects(() => db.restore('legal_case', String(first.id)), /unique index/i);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: a failing statement rolls the whole transaction back', async () => {
  const { db, store } = await freshDatabase();
  try {
    const before = await store.count('case_file');
    const fileTypeId = String((await db.lookup('file_type', 'primary')).id);
    const statusId = String((await db.lookup('file_status', 'open')).id);
    await assert.rejects(() =>
      db.transaction(async () => {
        await db.insert('case_file', {
          file_number: 'TX-1',
          title: 'ملف يتم التراجع عنه',
          file_type_id: fileTypeId,
          practice_area_id: null,
          status_id: statusId,
          priority_id: null,
          confidentiality_id: null,
          responsible_party_id: null,
          parent_file_id: null,
          root_file_id: null,
          opened_on: '2026-10-18',
          closed_on: null,
          description: null,
          archived_at: null,
        });
        throw new Error('simulated failure after write');
      }),
    );
    assert.equal(await store.count('case_file'), before);
    assert.equal(await store.count('audit_log'), 1);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: data survives closing and reopening the database', async () => {
  const first = await freshDatabase();
  const person = (await first.db.createPerson({ firstName: 'هدى', lastName: 'سالم' })) as {
    party: Record<string, string>;
  };
  const partyId = String(person.party.id);
  const file = await first.db.createFile({ title: 'ملف دائم', clientPartyIds: [partyId] });
  await first.store.close();

  const reopened = await freshDatabase(first.name);
  try {
    const stored = await reopened.db.get('party', partyId);
    assert.ok(stored);
    assert.equal(stored.display_name, 'هدى سالم');
    const fileFull = await reopened.db.getFileFull(String(file.id));
    assert.equal(fileFull?.parties.length, 1);
    const reopenedDevice = await reopened.store.get('app_meta', 'local.device_id');
    assert.equal(typeof reopenedDevice?.value, 'string');
  } finally {
    await reopened.store.close();
  }
});

test('indexeddb: backup export verifies and restores all relations', async () => {
  const { db } = await freshDatabase();
  try {
    const person = (await db.createPerson({ firstName: 'كريم', lastName: 'فؤاد' })) as {
      party: Record<string, string>;
    };
    const court = await db.createCourt({ name: 'محكمة الجيزة' });
    const file = await db.createFile({ title: 'ملف نسخ', clientPartyIds: [String(person.party.id)] });
    const legalCase = await db.createCase({
      caseNumber: '555',
      caseYear: 2026,
      courtId: String(court.id),
      fileIds: [String(file.id)],
    });
    await db.scheduleHearing({ caseId: String(legalCase.id), scheduledAt: '2027-02-01T09:00:00.000Z' });
    const backup = await db.exportBackup();
    assert.equal(backup.format, 'lawo-portable-backup');
    assert.equal(backup.sha256.length, 64);
    const verification = await db.verifyBackup(backup);
    assert.equal(verification.valid, true, verification.errors.join('; '));
    assert.equal(verification.foreignKeyViolations.length, 0);

    const before = await db.stats();
    await db.restoreBackup(JSON.parse(JSON.stringify(backup)));
    const after = await db.stats();
    assert.deepEqual(after, before);
    const fileFull = await db.getFileFull(String(file.id));
    assert.equal(fileFull?.parties.length, 1);
    assert.equal((await db.getCaseFull(String(legalCase.id))).hearings.length, 1);

    const tampered = JSON.parse(JSON.stringify(backup));
    tampered.tables.party[0].display_name = 'اسم مُعدَّل';
    const tamperedVerification = await db.verifyBackup(tampered);
    assert.equal(tamperedVerification.valid, false);
    assert.ok(tamperedVerification.errors.some((error) => /checksum/.test(error)));
    await assert.rejects(() => db.restoreBackup(tampered), /verification/);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: migration ledger is recorded, verified and tamper-evident', async () => {
  const { idb, db } = await freshDatabase();
  try {
    const manager = new IdbMigrationManager(idb, { appVersion: '0.1.0-test' });
    const applied = await manager.applied();
    assert.equal(applied.length, 1);
    assert.equal(applied[0]!.version, 1);
    assert.equal(applied[0]!.checksum.length, 8);
    assert.equal((await manager.verify()).valid, true);

    await idb.put('schema_migration', { ...(await idb.get('schema_migration', 1 as unknown as string))!, checksum: 'deadbeef' });
    const verify = await manager.verify();
    assert.equal(verify.valid, false);
    assert.ok(verify.errors.some((error) => /checksum/.test(error)));
    await assert.rejects(() => manager.ensureBaseline(), /checksum/);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: search and filters work on Arabic text without a server', async () => {
  const { db } = await freshDatabase();
  try {
    const person = (await db.createPerson({ firstName: 'أحمد', middleName: 'مصطفى', lastName: 'الشاذلي' })) as {
      party: Record<string, string>;
    };
    await db.recordJudgment({ caseId: (await db.createCase({ caseNumber: '77', caseYear: 2026, fileIds: [] })).id as string, issuedOn: '2026-05-01', operativePart: 'إلزام المدعى عليه بالتعويض' });
    await db.createTask({ title: 'مراجعة مذكرة الدفاع', dueAt: '2026-11-01T00:00:00.000Z' });
    const normalized = await db.search('احمد');
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0]!.entityType, 'party');
    assert.equal(String(normalized[0]!.entityId), String(person.party.id));
    assert.ok((await db.search('تعويض')).length >= 1);
    const tasksOnly = await db.search('مذكرة', { entityType: 'task' });
    assert.equal(tasksOnly.length, 1);
    assert.equal((await db.search('')).length, 0);
    const filtered = await db.list('party', { where: { kind: 'person' } });
    assert.equal(filtered.length, 1);
    const page = await db.list('party', { limit: 1, offset: 0 });
    assert.equal(page.length, 1);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: numbering is sequential and survives restart', async () => {
  const first = await freshDatabase();
  const one = await first.db.nextNumber('file.number');
  const two = await first.db.nextNumber('file.number');
  assert.equal(two.value, one.value + 1);
  assert.match(one.formatted, /^FILE-/);
  await first.store.close();
  const reopened = await freshDatabase(first.name);
  try {
    const three = await reopened.db.nextNumber('file.number');
    assert.equal(three.value, two.value + 1);
    assert.equal(await reopened.store.count('number_series'), 5);
  } finally {
    await reopened.store.close();
  }
});

test('indexeddb: soft delete cascades, writes a deletion batch and restores', async () => {
  const { db, store } = await freshDatabase();
  try {
    const document = await db.registerDocument({ title: 'مستند للحذف', docTypeCode: 'other' });
    const version = await db.addDocumentVersion(String(document.id), {
      fileName: 'delete-me.pdf',
      storageKind: 'local_file',
      storagePath: 'files/delete-me.pdf',
    });
    const deleted = await db.softDelete('document', String(document.id));
    assert.equal(deleted.affectedCount, 2);
    assert.equal(await db.get('document', String(document.id)), undefined);
    assert.notEqual(await store.get('document_version', String(version.id)), undefined);
    assert.notEqual(await store.get('document_version', String(version.id))!.then((row) => row?.deleted_at), null);
    const batch = await store.get('deletion_batch', deleted.batchId);
    assert.equal(batch?.restored_at, null);
    assert.equal(Number(batch?.affected_count), 2);
    const restored = await db.restore('document', String(document.id));
    assert.equal(restored.restoredCount, 2);
    assert.ok(await db.get('document', String(document.id)));
    const restoredBatch = await store.get('deletion_batch', deleted.batchId);
    assert.notEqual(restoredBatch?.restored_at, null);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: finance rules match SQLite (allocation bounds, reversal, balances)', async () => {
  const { db } = await freshDatabase();
  try {
    const person = (await db.createPerson({ firstName: 'ليلى', lastName: 'حسن' })) as {
      party: Record<string, string>;
    };
    const file = await db.createFile({ title: 'ملف مالي', clientPartyIds: [String(person.party.id)] });
    const account = await db.createAccount({ name: 'الخزينة', openingBalanceMinor: 100000 });
    const charge = await db.createCharge({
      clientPartyId: String(person.party.id),
      fileId: String(file.id),
      description: 'أتعاب',
      amountMinor: 300000,
    });
    const payment = await db.postTransaction({
      accountId: String(account.id),
      direction: 'in',
      amountMinor: 200000,
      clientPartyId: String(person.party.id),
      fileId: String(file.id),
    });
    await assert.rejects(() => db.allocate(String(payment.id), String(charge.id), 300000), /exceeds/);
    await db.allocate(String(payment.id), String(charge.id), 200000);
    assert.deepEqual(await db.chargeBalance(String(charge.id)), {
      amountMinor: 300000,
      paidMinor: 200000,
      outstandingMinor: 100000,
    });
    await db.reverseTransaction(String(payment.id), 'اختبار');
    assert.equal((await db.chargeBalance(String(charge.id))).paidMinor, 0);
    assert.equal(await db.accountBalance(String(account.id)), 100000);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: audit trail, revision bumps and outbox rows are engine-neutral', async () => {
  const { db, store } = await freshDatabase();
  try {
    const person = (await db.createPerson({ firstName: 'نور', lastName: 'الدين' })) as {
      party: Record<string, string>;
    };
    const updated = await db.update('party', String(person.party.id), { notes: 'ملاحظة جديدة' });
    assert.equal(updated.revision, 2);
    assert.equal(updated.sync_status, 'pending');
    await assert.rejects(() => db.update('party', String(person.party.id), { id: 'x' }), /id cannot be changed/);
    const audit = await store.getAll('audit_log');
    const actions = audit.map((row) => row.action);
    assert.ok(actions.includes('setup'));
    assert.ok(actions.includes('insert'));
    assert.ok(actions.includes('update'));
    const outbox = await store.getAll('sync_outbox');
    assert.ok(outbox.length >= 3);
    assert.ok(outbox.every((row) => row.state === 'pending'));
    assert.ok(outbox.some((row) => row.entity_type === 'party' && row.operation === 'update'));
    assert.equal(await store.count('schema_migration'), 1);
  } finally {
    await db.store.close();
  }
});

test('indexeddb: engine never calls the network', async () => {
  const { db } = await freshDatabase();
  const originalFetch = globalThis.fetch;
  let networkAttempts = 0;
  globalThis.fetch = (async () => {
    networkAttempts += 1;
    throw new Error('network access is not allowed');
  }) as typeof globalThis.fetch;
  try {
    const person = (await db.createPerson({ firstName: 'رامي', lastName: 'خليل' })) as {
      party: Record<string, string>;
    };
    await db.createFile({ title: 'بدون شبكة', clientPartyIds: [String(person.party.id)] });
    await db.search('رامي');
    await db.exportBackup();
    assert.equal(networkAttempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await db.store.close();
  }
});

test('indexeddb: exported backup rejects unknown or missing tables', async () => {
  const { db } = await freshDatabase();
  try {
    const backup = await db.exportBackup();
    const missing = JSON.parse(JSON.stringify(backup));
    delete missing.tables.announcement;
    const verification = await db.verifyBackup(missing);
    assert.equal(verification.valid, false);
    assert.ok(verification.errors.some((error) => /announcement/.test(error)));
  } finally {
    await db.store.close();
  }
});
