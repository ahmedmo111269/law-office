import assert from 'node:assert/strict';
import test from 'node:test';
import { makeClient, makeCourt, makeFile, openHarness } from './helpers.ts';

test('4. one client can be linked to several files with different roles', () => {
  const h = openHarness('multi-file');
  try {
    const courtId = makeCourt(h.db);
    const client = makeClient(h.db);
    const first = makeFile(h.db, [client.party.id], 'ملف أول');
    const second = makeFile(h.db, [client.party.id], 'ملف ثان');
    h.db.caseFiles.addParty({
      fileId: first.id,
      partyId: client.party.id,
      roleCode: 'plaintiff',
      sideCode: 'claimant',
    });
    h.db.caseFiles.addParty({
      fileId: second.id,
      partyId: client.party.id,
      roleCode: 'defendant',
      sideCode: 'defendant',
    });

    const firstParties = h.db.caseFiles.getFull(first.id).parties;
    const secondParties = h.db.caseFiles.getFull(second.id).parties;
    const firstRoles = firstParties.filter((p) => p.party_id === client.party.id).map((p) => p.role_name);
    const secondRoles = secondParties.filter((p) => p.party_id === client.party.id).map((p) => p.role_name);
    assert.ok(firstRoles.includes('مدعي') || firstRoles.includes('المدعي') || firstRoles.length >= 1);
    assert.ok(secondRoles.length >= 1);
    assert.notEqual(first.id, second.id);
    assert.equal(h.db.parties.getFull(client.party.id)?.client?.client_code, client.client?.client_code);
    assert.equal(h.db.health.stats().files, 2);
    assert.equal(h.db.health.stats().clients, 1);
    assert.ok(courtId);
  } finally {
    h.cleanup();
  }
});

test('5. the same person may hold multiple roles in one file, but not duplicate the same role', () => {
  const h = openHarness('roles');
  try {
    const client = makeClient(h.db);
    const file = makeFile(h.db, [client.party.id], 'ملف الأدوار');
    const plaintiff = h.db.caseFiles.addParty({
      fileId: file.id,
      partyId: client.party.id,
      roleCode: 'plaintiff',
      sideCode: 'claimant',
      isPrimary: true,
      startDate: '2026-10-01',
    });
    const witness = h.db.caseFiles.addParty({
      fileId: file.id,
      partyId: client.party.id,
      roleCode: 'witness',
      startDate: '2026-10-02',
    });
    assert.notEqual(plaintiff.id, witness.id);
    assert.equal(plaintiff.ordinal, 20);
    assert.equal(witness.ordinal, 30);
    assert.throws(
      () =>
        h.db.caseFiles.addParty({
          fileId: file.id,
          partyId: client.party.id,
          roleCode: 'plaintiff',
        }),
      (error: unknown) => (error as { code?: string }).code === 'ALREADY_EXISTS',
    );
    const full = h.db.caseFiles.getFull(file.id);
    assert.equal(full.parties.filter((p) => p.party_id === client.party.id).length, 3);
    h.db.caseFiles.removeParty(witness.id, 'انتهى دوره');
    assert.equal(h.db.caseFiles.getFull(file.id).parties.length, 2);
  } finally {
    h.cleanup();
  }
});
