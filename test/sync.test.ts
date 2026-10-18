import assert from 'node:assert/strict';
import test from 'node:test';
import { makeClient, openHarness } from './helpers.ts';

test('19. local changes and a simulated remote edit are recorded without silent loss', () => {
  const h = openHarness('sync');
  try {
    const client = makeClient(h.db);
    h.db.parties.addContact(client.party.id, { typeCode: 'mobile', value: '01011112222' });
    const localRow = h.db.entity('party').requireById(client.party.id);
    const localPayload = { ...localRow };
    const remoteDeviceId = '11111111-2222-4333-8444-555555555555';
    const remotePayload = {
      ...localRow,
      display_name: 'اسم من جهاز آخر',
      revision: 2,
      updated_at: '2026-10-18T10:00:00.000Z',
      origin_device_id: remoteDeviceId,
      sync_status: 'pending',
    };

    const conflictId = h.db.sync.recordConflict({
      entityType: 'party',
      entityId: client.party.id,
      baseRevision: 1,
      localRevision: localRow.revision,
      remoteRevision: 2,
      localDeviceId: h.db.device.id,
      remoteDeviceId,
      localPayload,
      remotePayload,
      conflictingFields: ['display_name'],
    });
    assert.ok(conflictId);
    assert.equal(h.db.sync.stats().openConflicts, 1);
    const open = h.db.sync.openConflicts();
    assert.equal(open.length, 1);
    assert.match(String(open[0]?.local_payload), /أحمد محمد العلي/);
    assert.match(String(open[0]?.remote_payload), /اسم من جهاز آخر/);
    assert.match(String(open[0]?.conflicting_fields_json), /display_name/);

    h.db.sync.resolveConflict(conflictId, 'merged');
    assert.equal(h.db.sync.stats().openConflicts, 0);
    const resolved = h.db.db.get<{ resolution: string; resolved_at: string }>(
      'SELECT resolution, resolved_at FROM sync_conflict WHERE id = ?',
      [conflictId],
    );
    assert.equal(resolved?.resolution, 'merged');
    assert.ok(resolved?.resolved_at);

    const merged = h.db.parties.updateParty(client.party.id, { displayName: 'اسم مدمج' });
    assert.equal(merged.revision, 2);
    assert.equal(
      h.db.parties.getFull(client.party.id)?.contacts.some((contact) => contact.value === '01011112222'),
      true,
    );
  } finally {
    h.cleanup();
  }
});

test('19b. outbox lifecycle marks entities synced only when no changes remain', () => {
  const h = openHarness('outbox');
  try {
    const client = makeClient(h.db);
    h.db.parties.updateParty(client.party.id, { displayName: 'اسم محدث' });
    const pending = h.db.sync.pendingChanges(1000).filter((row) => row.entity_type === 'party');
    assert.equal(pending.length, 2);
    assert.equal(pending.length >= 1, true);
    const [first, ...rest] = pending;
    assert.ok(first);
    h.db.sync.markSending([first.id]);
    assert.equal(h.db.sync.stats().sending >= 1, true);
    h.db.sync.markFailed([first.id], 'network unavailable');
    assert.equal(h.db.sync.stats().failed >= 1, true);
    const failed = h.db.entity('party').requireById(client.party.id);
    assert.equal(failed.sync_status, 'pending');

    h.db.sync.markSending([first.id]);
    h.db.sync.markSent([first.id]);
    assert.equal(h.db.entity('party').requireById(client.party.id).sync_status, 'pending');
    h.db.sync.markSending(rest.map((row) => row.id));
    h.db.sync.markSent(rest.map((row) => row.id));
    assert.equal(h.db.entity('party').requireById(client.party.id).sync_status, 'synced');
    assert.equal(
      h.db.sync.pendingChanges(1000).filter((row) => row.entity_type === 'party').length,
      0,
    );
  } finally {
    h.cleanup();
  }
});
