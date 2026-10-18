import assert from 'node:assert/strict';
import test from 'node:test';
import { makeCase, makeClient, makeCourt, makeFile, openHarness } from './helpers.ts';

test('6. master file, sub-files and one case shared by several files', () => {
  const h = openHarness('files');
  try {
    const client = makeClient(h.db);
    const courtId = makeCourt(h.db);
    const master = makeFile(h.db, [client.party.id], 'ملف رئيسي');
    const sub = h.db.caseFiles.createSubFile(master.id, {
      title: 'ملف فرعي',
      practiceAreaCode: 'civil',
    });
    const second = makeFile(h.db, [client.party.id], 'ملف ثان');

    assert.equal(master.root_file_id, master.id);
    assert.equal(sub.parent_file_id, master.id);
    assert.equal(sub.root_file_id, master.id);
    assert.equal(master.file_type_id !== sub.file_type_id, true);

    const legalCase = makeCase(h.db, master.id, courtId, '456');
    h.db.caseFiles.linkCase(second.id, legalCase.id, { relationTypeCode: 'related' });

    const caseFull = h.db.cases.getFull(legalCase.id);
    assert.equal(caseFull.files.length, 2);
    const fileIds = caseFull.files.map((file) => file.id).sort();
    assert.deepEqual(fileIds, [master.id, second.id].sort());
    assert.equal(h.db.caseFiles.getFull(master.id).cases.length, 1);
    assert.equal(h.db.caseFiles.getFull(second.id).cases.length, 1);
    assert.equal(h.db.caseFiles.getFull(sub.id).cases.length, 0);
    assert.equal(h.db.caseFiles.getFull(master.id).subFiles.length, 1);
    assert.match(master.file_number, /^FILE-[A-Z0-9]+-2026-\d{4}$/);
    assert.notEqual(master.file_number, sub.file_number);
  } finally {
    h.cleanup();
  }
});
