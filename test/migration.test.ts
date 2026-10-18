import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { LawOfficeDatabase } from '../src/app/law-office-database.ts';
import { INITIAL_MIGRATION } from '../src/db/migrations/0001_initial.ts';
import { MigrationManager } from '../src/db/migrations/manager.ts';
import type { Migration } from '../src/db/migrations/types.ts';
import { SqliteDatabase } from '../src/db/sqlite/sqlite-adapter.ts';
import { FixedClock } from '../src/util/clock.ts';
import { makeClient, openHarness } from './helpers.ts';

function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const upgrade: Migration = {
  version: 2,
  name: 'add_test_note',
  descriptionAr: 'إضافة جدول ملاحظات اختباري',
  checksum: checksum('v2-add-test-note'),
  up: (adapter) => {
    adapter.exec('CREATE TABLE test_note (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  },
};

const failing: Migration = {
  version: 2,
  name: 'fail_after_create',
  descriptionAr: 'فشل مقصود للاختبار',
  checksum: checksum('v2-fail-after-create'),
  up: (adapter) => {
    adapter.exec('CREATE TABLE should_not_exist (id TEXT PRIMARY KEY)');
    throw new Error('forced migration failure');
  },
};

test('17. a versioned upgrade applies once and preserves existing data', () => {
  const h = openHarness('upgrade');
  const backupPath = join(h.dir, 'pre-upgrade.sqlite');
  try {
    const client = makeClient(h.db);
    const fileCount = h.db.health.stats().files;
    h.db.close();

    const db = SqliteDatabase.open({ path: h.path });
    try {
      let backupCalled = false;
      const manager = new MigrationManager(db, {
        clock: new FixedClock('2026-10-18T13:00:00.000Z'),
        appVersion: '0.2.0-test',
        migrations: [INITIAL_MIGRATION, upgrade],
        preMigrationBackup: ({ fromVersion, toVersion }) => {
          backupCalled = true;
          assert.equal(fromVersion, 1);
          assert.equal(toVersion, 2);
          return backupPath;
        },
      });
      const result = manager.migrate();
      assert.equal(result.fromVersion, 1);
      assert.equal(result.toVersion, 2);
      assert.equal(result.applied.length, 1);
      assert.equal(result.applied[0]?.version, 2);
      assert.equal(result.preMigrationBackupPath, backupPath);
      assert.equal(backupCalled, true);
      assert.equal(manager.readUserVersion(), 2);
      assert.equal(manager.appliedRows().length, 2);
      assert.equal(db.get<{ c: number }>('SELECT COUNT(*) AS c FROM party')?.c, 1);
      assert.equal(db.get<{ c: number }>('SELECT COUNT(*) AS c FROM case_file')?.c, fileCount);
      assert.ok(db.get("SELECT name FROM sqlite_master WHERE name = 'test_note'"));

      const again = manager.migrate();
      assert.deepEqual(again.applied, []);
      assert.equal(manager.currentVersion(), 2);
    } finally {
      db.close();
    }
    const reopened = SqliteDatabase.open({ path: h.path });
    try {
      const verify = new MigrationManager(reopened, {
        clock: new FixedClock('2026-10-18T13:30:00.000Z'),
        appVersion: '0.2.0-test',
        migrations: [INITIAL_MIGRATION, upgrade],
      });
      verify.verifyHistory();
      assert.equal(verify.currentVersion(), 2);
      assert.equal(
        reopened.get<{ id: string }>('SELECT id FROM party')?.id,
        client.party.id,
      );
    } finally {
      reopened.close();
    }
  } finally {
    h.cleanup();
    rmSync(backupPath, { force: true });
  }
});

test('18. a failing migration rolls back completely and records the failure', () => {
  const h = openHarness('migration-failure');
  try {
    const client = makeClient(h.db);
    h.db.close();
    const db = SqliteDatabase.open({ path: h.path });
    try {
      const manager = new MigrationManager(db, {
        clock: new FixedClock('2026-10-18T14:00:00.000Z'),
        appVersion: '0.2.0-test',
        migrations: [INITIAL_MIGRATION, failing],
      });
      assert.throws(() => manager.migrate(), /failed and was rolled back/);
      assert.equal(manager.readUserVersion(), 1);
      assert.equal(db.get("SELECT name FROM sqlite_master WHERE name = 'should_not_exist'"), undefined);
      const failures = db.query<{ version: number; message: string }>(
        'SELECT version, message FROM migration_failure',
      );
      assert.equal(failures.length, 1);
      assert.equal(failures[0]?.version, 2);
      assert.match(failures[0]?.message ?? '', /forced migration failure/);
      assert.equal(db.get<{ c: number }>('SELECT COUNT(*) AS c FROM party')?.c, 1);

      const safe = new MigrationManager(db, {
        clock: new FixedClock('2026-10-18T14:30:00.000Z'),
        appVersion: '0.1.0-test',
        migrations: [INITIAL_MIGRATION],
      });
      const status = safe.migrate();
      assert.deepEqual(status.applied, []);
      assert.equal(safe.currentVersion(), 1);
    } finally {
      db.close();
    }
    const reopened = LawOfficeDatabase.open({ path: h.path, appVersion: '0.1.0-test' });
    try {
      assert.equal(reopened.database.parties.getFull(client.party.id)?.party.display_name, 'أحمد محمد العلي');
    } finally {
      reopened.database.close();
    }
  } finally {
    h.cleanup();
  }
});
