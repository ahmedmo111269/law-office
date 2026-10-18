import assert from 'node:assert/strict';
import test from 'node:test';
import { makeFile, makeClient, openHarness } from './helpers.ts';

test('14. independent devices generate distinct UUIDs and distinct display prefixes', () => {
  const a = openHarness('device-a');
  const b = openHarness('device-b');
  try {
    assert.notEqual(a.db.device.id, b.db.device.id);
    assert.notEqual(a.db.device.short_code, b.db.device.short_code);
    const clientA = makeClient(a.db, 'مشترك');
    const clientB = makeClient(b.db, 'مشترك');
    assert.notEqual(clientA.party.id, clientB.party.id);
    assert.notEqual(clientA.client?.client_code, clientB.client?.client_code);
    const fileA = makeFile(a.db, [clientA.party.id]);
    const fileB = makeFile(b.db, [clientB.party.id]);
    assert.notEqual(fileA.id, fileB.id);
    assert.notEqual(fileA.file_number, fileB.file_number);
    const prefix = (value: string): string => value.split('-')[1] ?? '';
    const prefixA = prefix(fileA.file_number);
    const prefixB = prefix(fileB.file_number);
    assert.equal(prefixA, a.db.device.short_code);
    assert.equal(prefixB, b.db.device.short_code);
    assert.notEqual(prefixA, prefixB);
    const idsA = assertUniqueIds(a.db);
    const idsB = assertUniqueIds(b.db);
    assert.equal([...idsA].some((id) => idsB.has(id)), false);
  } finally {
    a.cleanup();
    b.cleanup();
  }
});

function assertUniqueIds(db: import('../src/app/law-office-database.ts').LawOfficeDatabase): Set<string> {
  const rows = db.db.query<{ id: string }>(
    `SELECT id FROM party UNION ALL SELECT id FROM case_file UNION ALL SELECT id FROM legal_case`,
  );
  const ids = rows.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/);
  return new Set(ids);
}
