import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  REQUIRED_INDEXES_V1,
  REQUIRED_TABLES_V1,
  REQUIRED_TRIGGERS_V1,
} from '../src/schema/v1/manifest.ts';
import { SYNC_ENTITY_DEFINITIONS } from '../src/sync/entity-registry.ts';
import { openHarness } from './helpers.ts';

test('1. first-time creation initialises schema, device and search index', () => {
  const h = openHarness('create');
  try {
    const health = h.db.health.schemaCheck();
    assert.equal(health.ok, true, JSON.stringify(health));
    assert.equal(health.schemaVersion, 2);
    assert.equal(health.integrity, 'ok');
    assert.deepEqual(health.foreignKeyViolations, []);
    assert.equal(h.db.migrations.currentVersion(), 2);
    assert.equal(h.db.device.is_local, 1);
    assert.match(h.db.device.short_code, /^[A-Z0-9]{3,8}$/);
    assert.equal(h.db.search.usingFts5, true);
    const stats = h.db.health.stats();
    assert.equal(stats.parties, 0);
    assert.equal(stats.files, 0);
    assert.ok(h.db.lookups.itemsOf('court_kind').length >= 5);
  } finally {
    h.cleanup();
  }
});

test('2. every manifest table/index/trigger exists and sync entities have deleted_at', () => {
  const h = openHarness('manifest');
  try {
    const health = h.db.health.schemaCheck();
    assert.deepEqual(health.missingTables, []);
    assert.deepEqual(health.missingIndexes, []);
    assert.deepEqual(health.missingTriggers, []);
    assert.equal(REQUIRED_TABLES_V1.length >= 50, true);
    assert.equal(REQUIRED_INDEXES_V1.length >= 80, true);
    assert.equal(REQUIRED_TRIGGERS_V1.length >= 10, true);
    for (const entity of SYNC_ENTITY_DEFINITIONS) {
      const columns = h.db.db
        .query<{ name: string }>(`PRAGMA table_info("${entity.table}")`)
        .map((row) => row.name);
      assert.ok(
        columns.includes(entity.primaryKeyColumn),
        `${entity.code} primary key`,
      );
      assert.ok(
        columns.includes('deleted_at'),
        `${entity.code} needs deleted_at`,
      );
      assert.ok(columns.includes('revision'), `${entity.code} needs revision`);
      assert.ok(
        columns.includes('sync_status'),
        `${entity.code} needs sync_status`,
      );
    }
    const fts = h.db.db.get(
      "SELECT name FROM sqlite_master WHERE name = 'search_fts'",
    );
    assert.ok(fts);
  } finally {
    h.cleanup();
  }
});

test('3. foreign keys and check constraints are enforced by the engine', () => {
  const h = openHarness('constraints');
  try {
    const now = '2026-10-18T09:00:00.000Z';
    assert.throws(
      () =>
        h.db.db.run(
          `INSERT INTO party (id, kind, display_name, status_id, created_at, updated_at,
             deleted_at, origin_device_id, revision, sync_status, last_synced_at)
           VALUES (?, 'person', 'اسم', ?, ?, ?, NULL, ?, 1, 'local', NULL)`,
          [randomUUID(), randomUUID(), now, now, h.db.device.id],
        ),
      /FOREIGN KEY constraint failed/,
    );
    assert.throws(
      () =>
        h.db.db.run(
          `INSERT INTO party (id, kind, display_name, status_id, created_at, updated_at,
             deleted_at, origin_device_id, revision, sync_status, last_synced_at)
           VALUES (?, 'alien', 'اسم', NULL, ?, ?, NULL, ?, 1, 'local', NULL)`,
          [randomUUID(), now, now, h.db.device.id],
        ),
      /CHECK constraint failed/,
    );
    assert.throws(
      () =>
        h.db.db.run(
          `INSERT INTO case_file (id, file_number, title, file_type_id, opened_on, created_at,
             updated_at, deleted_at, origin_device_id, revision, sync_status, last_synced_at)
           VALUES (?, 'X-1', 'ملف', ?, '2026-10-18', ?, ?, NULL, ?, 1, 'local', NULL)`,
          [randomUUID(), randomUUID(), now, now, h.db.device.id],
        ),
      /FOREIGN KEY constraint failed/,
    );
    assert.equal(h.db.db.query('PRAGMA foreign_key_check').length, 0);
  } finally {
    h.cleanup();
  }
});
