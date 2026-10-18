import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { LawOfficeDatabase } from '../src/app/law-office-database.ts';
import { SqliteDatabase } from '../src/db/sqlite/sqlite-adapter.ts';
import { makeCase, makeClient, makeCourt, makeFile, openHarness } from './helpers.ts';

test('15. backup export is a verified, consistent snapshot and detects tampering', () => {
  const h = openHarness('backup');
  try {
    const client = makeClient(h.db);
    const courtId = makeCourt(h.db);
    const file = makeFile(h.db, [client.party.id]);
    makeCase(h.db, file.id, courtId);
    const backup = h.db.backups.create({ label: 'test' });
    assert.equal(existsSync(backup.path), true);
    assert.equal(existsSync(backup.checksumPath), true);
    const verification = h.db.backups.verify(backup.path, { requireChecksumSidecar: true });
    assert.equal(verification.valid, true, verification.errors.join('; '));
    assert.equal(verification.checksumSidecarVerified, true);
    assert.equal(verification.attachmentsIncluded, false);
    assert.equal(verification.externalFileVersions, 0);

    const snapshot = SqliteDatabase.open({ path: backup.path, readOnly: true });
    try {
      assert.equal(snapshot.get<{ c: number }>('SELECT COUNT(*) AS c FROM party')?.c, 1);
      assert.equal(snapshot.get<{ user_version: number }>('PRAGMA user_version')?.user_version, 1);
    } finally {
      snapshot.close();
    }

    const tampered = `${backup.path}.tampered`;
    copyFileSync(backup.path, tampered);
    copyFileSync(backup.checksumPath, `${tampered}.sha256`);
    writeFileSync(tampered, Buffer.concat([readFileSync(tampered), Buffer.from('x')]));
    const tamperedResult = h.db.backups.verify(tampered, { requireChecksumSidecar: true });
    assert.equal(tamperedResult.valid, false);
    assert.ok(tamperedResult.errors.some((error) => /checksum/i.test(error)));
    rmSync(tampered, { force: true });
    rmSync(`${tampered}.sha256`, { force: true });
  } finally {
    h.cleanup();
  }
});

test('16. restore creates a working database with intact relations and warns about external files', () => {
  const h = openHarness('restore');
  const restoredPath = `${h.dir}/restored.sqlite`;
  try {
    const client = makeClient(h.db);
    const courtId = makeCourt(h.db);
    const file = makeFile(h.db, [client.party.id]);
    const legalCase = makeCase(h.db, file.id, courtId);
    const hearing = h.db.hearings.schedule({
      caseId: legalCase.id,
      scheduledAt: '2026-11-01T09:00:00.000Z',
    });
    const judgment = h.db.judgments.record({
      caseId: legalCase.id,
      hearingId: hearing.id,
      issuedOn: '2026-11-01',
      fileIds: [file.id],
    });
    const document = h.db.documents.register({
      title: 'مستند ورقي',
      docTypeCode: 'pleading',
      docDate: '2026-10-01',
    });
    h.db.documents.link(document.id, { kind: 'file', id: file.id });
    h.db.documents.addVersion(document.id, {
      fileName: 'scan.pdf',
      storageKind: 'local_file',
      storagePath: '/external/scan.pdf',
    });
    const backup = h.db.backups.create({ label: 'restore' });
    assert.equal(backup.externalFileVersions, 1);
    const result = h.db.backups.restoreToNewDatabase(backup.path, restoredPath);
    assert.equal(result.attachmentsIncluded, false);
    assert.match(result.warning, /external/i);
    assert.throws(
      () => h.db.backups.restoreToNewDatabase(backup.path, restoredPath),
      (error: unknown) => (error as { code?: string }).code === 'RESTORE_REQUIRES_EMPTY_DATABASE',
    );
    h.db.close();

    const restored = LawOfficeDatabase.open({ path: restoredPath, appVersion: '0.1.0-test' }).database;
    try {
      const party = restored.parties.getFull(client.party.id);
      assert.equal(party?.client?.client_code, client.client?.client_code);
      assert.equal(party?.contacts.length, 0);
      const restoredCase = restored.cases.getFull(legalCase.id);
      assert.equal(restoredCase.files.length, 1);
      assert.equal(restoredCase.hearings.length, 1);
      assert.equal(restoredCase.judgments.length, 1);
      assert.equal(restored.judgments.getFull(judgment.id).files.length, 1);
      assert.equal(restored.caseFiles.getFull(file.id).parties.length, 1);
      const stats = restored.health.stats();
      assert.equal(stats.parties, 1);
      assert.equal(stats.files, 1);
      assert.equal(stats.cases, 1);
      assert.equal(stats.hearings, 1);
      assert.equal(stats.judgments, 1);
      assert.equal(restored.health.schemaCheck().ok, true);
    } finally {
      restored.close();
    }
  } finally {
    h.cleanup();
    rmSync(restoredPath, { force: true });
    rmSync(`${restoredPath}-wal`, { force: true });
    rmSync(`${restoredPath}-shm`, { force: true });
  }
});
