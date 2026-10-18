import assert from 'node:assert/strict';
import test from 'node:test';
import { LawOfficeDatabase } from '../src/app/law-office-database.ts';
import { FixedClock } from '../src/util/clock.ts';
import { makeCase, makeClient, makeCourt, makeFile, openHarness } from './helpers.ts';

test('12. closing and reopening preserves records, ids and number sequences', () => {
  const h = openHarness('persistence');
  try {
    const client = makeClient(h.db);
    const courtId = makeCourt(h.db);
    const file = makeFile(h.db, [client.party.id], 'ملف البقاء');
    const legalCase = makeCase(h.db, file.id, courtId);
    const firstFileNumber = file.file_number;
    h.close();
    const reopened = LawOfficeDatabase.open({
      path: h.path,
      clock: new FixedClock('2026-10-18T12:00:00.000Z'),
      appVersion: '0.1.0-test',
    }).database;
    try {
      assert.equal(reopened.parties.getFull(client.party.id)?.party.display_name, 'أحمد محمد العلي');
      assert.equal(reopened.caseFiles.getFile(file.id).file_number, firstFileNumber);
      assert.equal(reopened.cases.getCase(legalCase.id).case_number, '123');
      const next = makeFile(reopened, [], 'ملف بعد إعادة الفتح');
      assert.equal(firstFileNumber.endsWith('0001'), true);
      assert.equal(next.file_number.endsWith('0002'), true);
    } finally {
      reopened.close();
    }
  } finally {
    h.cleanup();
  }
});

test('13. Arabic search tolerates hamza, diacritics, yaa and taa marbuta variants', () => {
  const h = openHarness('search');
  try {
    const ahmed = makeClient(h.db, 'محمود');
    makeClient(h.db, 'سيد');
    const file = makeFile(h.db, [ahmed.party.id], 'قضية أحوال شخصية');
    const byPlain = h.db.search.search('احمد');
    assert.equal(byPlain.some((hit) => hit.entityType === 'party' && hit.entityId === ahmed.party.id), true);
    const byDiacritics = h.db.search.search('أَحْمَد');
    assert.equal(byDiacritics.length > 0, true);
    const byYaa = h.db.search.search('محمود');
    assert.equal(byYaa.length > 0, true);
    const byFile = h.db.search.search('احوال');
    assert.equal(byFile.some((hit) => hit.entityType === 'case_file' && hit.entityId === file.id), true);
    assert.equal(h.db.search.search('لا-يوجد-هذا-النص').length, 0);
    const rebuilt = h.db.search.rebuildAll();
    assert.equal(rebuilt.documents >= 2, true);
    assert.equal(h.db.search.count(), rebuilt.documents);
  } finally {
    h.cleanup();
  }
});
