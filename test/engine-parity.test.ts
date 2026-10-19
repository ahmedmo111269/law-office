import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteDatabase } from '../src/db/sqlite/sqlite-adapter.ts';
import { MigrationManager } from '../src/db/migrations/manager.ts';
import { CASE_SYSTEM_MIGRATION } from '../src/db/migrations/0002_case_system.ts';
import { INITIAL_MIGRATION } from '../src/db/migrations/0001_initial.ts';
import { IndexedDbDatabase } from '../src/db/indexeddb/indexeddb-adapter.ts';
import { IdbMigrationManager } from '../src/db/indexeddb/idb-migration-manager.ts';
import {
  IndexedDbStore,
  SqlitePortableStore,
  type PortableStore,
} from '../src/portable/store.ts';
import { PortableLawOffice } from '../src/portable/portable-database.ts';
import { FixedClock } from '../src/util/clock.ts';

const CLOCK = new FixedClock('2026-10-18T09:00:00.000Z');
let counter = 0;

async function openSqlitePortable(): Promise<{
  db: PortableLawOffice;
  store: PortableStore;
  dispose(): Promise<void>;
}> {
  const sqlite = SqliteDatabase.open({ path: ':memory:' });
  new MigrationManager(sqlite, {
    clock: CLOCK,
    appVersion: '0.1.0-test',
    migrations: [INITIAL_MIGRATION, CASE_SYSTEM_MIGRATION],
  }).migrate();
  const store = new SqlitePortableStore(sqlite);
  const db = await PortableLawOffice.open({
    store,
    clock: CLOCK,
    appVersion: '0.1.0-test',
    platform: 'linux',
    deviceLabel: 'parity-sqlite',
  });
  return { db, store, dispose: async () => store.close() };
}

async function openIndexedDbPortable(): Promise<{
  db: PortableLawOffice;
  store: PortableStore;
  dispose(): Promise<void>;
}> {
  counter += 1;
  const name = `lawo-parity-${counter}-${Date.now()}`;
  const indexedDb = await IndexedDbDatabase.open({ name });
  await new IdbMigrationManager(indexedDb, {
    appVersion: '0.1.0-test',
    clock: () => CLOCK.now(),
  }).migrate();
  const store = new IndexedDbStore(indexedDb);
  const db = await PortableLawOffice.open({
    store,
    clock: CLOCK,
    appVersion: '0.1.0-test',
    platform: 'web',
    deviceLabel: 'parity-idb',
  });
  return { db, store, dispose: async () => store.close() };
}

async function scenario(
  db: PortableLawOffice,
): Promise<Record<string, unknown>> {
  const person = (await db.createPerson({
    firstName: 'منى',
    lastName: 'عبد الرحمن',
  })) as {
    party: Record<string, string>;
  };
  await db.addContact(String(person.party.id), {
    typeCode: 'phone',
    value: '01000000000',
    isPrimary: true,
  });
  const court = await db.createCourt({ name: 'محكمة الجيزة الابتدائية' });
  const file = await db.createFile({
    title: 'قضية تعويض',
    clientPartyIds: [String(person.party.id)],
  });
  const legalCase = await db.createCase({
    caseNumber: '1234',
    caseYear: 2026,
    courtId: String(court.id),
    fileIds: [String(file.id)],
  });
  const hearing = await db.scheduleHearing({
    caseId: String(legalCase.id),
    scheduledAt: '2026-11-01T09:00:00.000Z',
  });
  await db.recordHearing(String(hearing.id), { outcomeSummary: 'تأجيل' });
  await db.scheduleNextHearing(String(hearing.id), {
    scheduledAt: '2026-12-01T09:00:00.000Z',
  });
  await db.recordJudgment({
    caseId: String(legalCase.id),
    issuedOn: '2027-01-15',
    fileIds: [String(file.id)],
  });
  const task = await db.createTask({
    title: 'إعداد مذكرة',
    caseId: String(legalCase.id),
  });
  await db.changeTaskStatus(String(task.id), 'completed', {
    resultSummary: 'تم',
  });
  const document = await db.registerDocument({
    title: 'عقد إيجار',
    docTypeCode: 'contract',
    fileId: String(file.id),
  });
  await db.addDocumentVersion(String(document.id), {
    fileName: 'lease.pdf',
    storageKind: 'local_file',
    storagePath: 'files/lease.pdf',
  });
  const account = await db.createAccount({ name: 'الصندوق', kindCode: 'cash' });
  const charge = await db.createCharge({
    clientPartyId: String(person.party.id),
    fileId: String(file.id),
    description: 'أتعاب',
    amountMinor: 500000,
  });
  const payment = await db.postTransaction({
    accountId: String(account.id),
    direction: 'in',
    amountMinor: 200000,
    clientPartyId: String(person.party.id),
  });
  await db.allocate(String(payment.id), String(charge.id), 200000);
  await db.reverseTransaction(String(payment.id), 'خطأ');
  const fileFull = await db.getFileFull(String(file.id));
  const caseFull = await db.getCaseFull(String(legalCase.id));
  const taskFull = await db.getTaskFull(String(task.id));
  const partyFull = (await db.getPartyFull(String(person.party.id))) as {
    contacts: unknown[];
  };
  const backup = await db.exportBackup();
  const verification = await db.verifyBackup(backup);
  const counts = await db.stats();
  delete counts.schema_migration;
  return {
    fileParties: fileFull?.parties.length,
    filePartyRole: fileFull?.parties[0]?.role_name,
    caseFiles: caseFull.files.length,
    caseHearings: caseFull.hearings.length,
    hearingStatuses: caseFull.hearings.map((row) => row.status_id).length,
    taskHistory: taskFull.statusHistory.length,
    taskStatus: taskFull.task.status_id,
    contacts: partyFull.contacts.length,
    searchParty: (await db.search('منى')).length,
    searchTask: (await db.search('مذكرة')).length,
    fileNumber: /^FILE-[0-9A-F]{6}-\d{4}-\d{4}$/.test(
      String(fileFull?.file.file_number),
    ),
    balance: await db.accountBalance(String(account.id)),
    chargeBalance: await db.chargeBalance(String(charge.id)),
    backupValid: verification.valid,
    backupForeignKeys: verification.foreignKeyViolations.length,
    backupRows: verification.totalRows,
    counts,
  };
}

test('parity: the same domain scenario produces the same functional result on SQLite and IndexedDB', async () => {
  const sqlite = await openSqlitePortable();
  const indexed = await openIndexedDbPortable();
  try {
    const [left, right] = [
      await scenario(sqlite.db),
      await scenario(indexed.db),
    ];
    assert.deepEqual(right, left);
    const leftBackup = await sqlite.db.exportBackup();
    const rightBackup = await indexed.db.exportBackup();
    assert.equal((await sqlite.db.verifyBackup(rightBackup)).valid, true);
    assert.equal((await indexed.db.verifyBackup(leftBackup)).valid, true);
  } finally {
    await sqlite.dispose();
    await indexed.dispose();
  }
});

test('parity: a backup exported by IndexedDB restores into SQLite and keeps relations', async () => {
  const indexed = await openIndexedDbPortable();
  let backup;
  let personId;
  try {
    const person = (await indexed.db.createPerson({
      firstName: 'سلمى',
      lastName: 'النجار',
    })) as {
      party: Record<string, string>;
    };
    personId = String(person.party.id);
    const file = await indexed.db.createFile({
      title: 'ملف متنقل',
      clientPartyIds: [personId],
    });
    await indexed.db.createCase({
      caseNumber: '9',
      caseYear: 2026,
      fileIds: [String(file.id)],
    });
    backup = await indexed.db.exportBackup();
  } finally {
    await indexed.dispose();
  }
  const sqlite = await openSqlitePortable();
  try {
    const result = await sqlite.db.restoreBackup(
      JSON.parse(JSON.stringify(backup)),
    );
    assert.equal(result.verification.valid, true);
    const restored = await sqlite.db.getPartyFull(String(personId));
    assert.ok(restored);
    assert.equal(
      (restored as { party: Record<string, unknown> }).party.display_name,
      'سلمى النجار',
    );
    const files = await sqlite.db.list('case_file', { limit: 10 });
    const full = await sqlite.db.getFileFull(String(files[0]!.id));
    assert.equal(full?.parties.length, 1);
  } finally {
    await sqlite.dispose();
  }
});

test('parity: both engines reject the same invalid operations with the same codes', async () => {
  const sqlite = await openSqlitePortable();
  const indexed = await openIndexedDbPortable();
  const codeOf = async (action: () => Promise<unknown>): Promise<string> => {
    try {
      await action();
      return 'NO_ERROR';
    } catch (error) {
      return (error as { code?: string }).code ?? 'UNKNOWN';
    }
  };
  try {
    const status = String(
      (await sqlite.db.lookup('party_status', 'active')).id,
    );
    const court = await sqlite.db.createCourt({ name: 'c' });
    await sqlite.db.createCase({
      caseNumber: '1',
      caseYear: 2026,
      courtId: String(court.id),
    });
    const sqliteCodes = [
      await codeOf(() => sqlite.db.insert('party', { display_name: 'x' })),
      await codeOf(() =>
        sqlite.db.insert('party', {
          kind: 'robot',
          display_name: 'x',
          status_id: status,
        }),
      ),
      await codeOf(() =>
        sqlite.db.insert('party', {
          kind: 'person',
          display_name: 'x',
          status_id: '00000000-0000-4000-8000-000000000000',
        }),
      ),
      await codeOf(() =>
        sqlite.db.createCase({
          caseNumber: '1',
          caseYear: 2026,
          courtId: String(court.id),
        }),
      ),
    ];
    const indexedStatus = String(
      (await indexed.db.lookup('party_status', 'active')).id,
    );
    const indexedCourt = await indexed.db.createCourt({ name: 'c' });
    await indexed.db.createCase({
      caseNumber: '1',
      caseYear: 2026,
      courtId: String(indexedCourt.id),
    });
    const indexedCodes = [
      await codeOf(() => indexed.db.insert('party', { display_name: 'x' })),
      await codeOf(() =>
        indexed.db.insert('party', {
          kind: 'robot',
          display_name: 'x',
          status_id: indexedStatus,
        }),
      ),
      await codeOf(() =>
        indexed.db.insert('party', {
          kind: 'person',
          display_name: 'x',
          status_id: '00000000-0000-4000-8000-000000000000',
        }),
      ),
      await codeOf(() =>
        indexed.db.createCase({
          caseNumber: '1',
          caseYear: 2026,
          courtId: String(indexedCourt.id),
        }),
      ),
    ];
    assert.deepEqual(indexedCodes, sqliteCodes);
  } finally {
    await sqlite.dispose();
    await indexed.dispose();
  }
});
