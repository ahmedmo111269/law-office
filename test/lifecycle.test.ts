import assert from 'node:assert/strict';
import test from 'node:test';
import { makeClient, makeFile, openHarness } from './helpers.ts';

test('9. archiving and unarchiving are reversible and do not delete data', () => {
  const h = openHarness('archive');
  try {
    const file = makeFile(h.db);
    const archived = h.db.caseFiles.archive(file.id);
    assert.ok(archived.archived_at);
    assert.equal(h.db.caseFiles.getFile(file.id).archived_at, archived.archived_at);
    const unarchived = h.db.caseFiles.unarchive(file.id);
    assert.equal(unarchived.archived_at, null);
    assert.equal(h.db.health.stats().files, 1);
  } finally {
    h.cleanup();
  }
});

test('10. soft delete cascades owned child rows and blocks when file links exist', () => {
  const h = openHarness('delete');
  try {
    const client = makeClient(h.db);
    h.db.parties.addContact(client.party.id, { typeCode: 'mobile', value: '01000000000' });
    h.db.parties.addAddress(client.party.id, { city: 'القاهرة', street: 'شارع' });
    const deleted = h.db.parties.softDelete(client.party.id, 'اختبار');
    assert.ok(deleted.affectedCount >= 4, `affected ${deleted.affectedCount}`);
    assert.equal(h.db.parties.getFull(client.party.id), undefined);
    const withDeleted = h.db.parties.getFull(client.party.id, true);
    assert.ok(withDeleted?.client?.deleted_at);
    assert.ok(withDeleted?.person?.deleted_at);
    assert.equal(withDeleted?.contacts.every((contact) => contact.deleted_at !== null), true);

    const restored = h.db.parties.restore(client.party.id);
    assert.equal(restored.restoredCount, deleted.affectedCount);
    assert.equal(h.db.parties.getFull(client.party.id)?.client?.client_code, client.client?.client_code);

    const linked = makeClient(h.db, 'مرتبط');
    makeFile(h.db, [linked.party.id]);
    assert.throws(
      () => h.db.parties.softDelete(linked.party.id),
      (error: unknown) => (error as { code?: string }).code === 'DEPENDENT_RECORDS_EXIST',
    );
    assert.ok(h.db.parties.getFull(linked.party.id));
  } finally {
    h.cleanup();
  }
});

test('11. composite transactions commit together or roll back entirely', () => {
  const h = openHarness('transactions');
  try {
    const before = h.db.health.stats();
    assert.throws(() => {
      h.db.db.transaction(() => {
        h.db.caseFiles.create({ title: 'ملف مؤقت', fileTypeCode: 'primary' });
        h.db.caseFiles.create({ title: 'ملف ثانٍ', fileTypeCode: 'consultation' });
        throw new Error('forced rollback');
      });
    }, /forced rollback/);
    assert.equal(h.db.health.stats().files, before.files);
    assert.equal(h.db.health.stats().pendingSyncChanges, before.pendingSyncChanges);

    h.db.db.transaction(() => {
      h.db.caseFiles.create({ title: 'ملف أول', fileTypeCode: 'primary' });
      h.db.caseFiles.create({ title: 'ملف ثانٍ', fileTypeCode: 'consultation' });
    });
    assert.equal(h.db.health.stats().files, 2);
    assert.ok(h.db.health.stats().pendingSyncChanges >= 2);
  } finally {
    h.cleanup();
  }
});
