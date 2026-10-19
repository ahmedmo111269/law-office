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

interface Profile {
  readonly db: PortableLawOffice;
  readonly store: PortableStore;
  dispose(): Promise<void>;
}

async function openSqlite(): Promise<Profile> {
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
    deviceLabel: 'query-sqlite',
  });
  return { db, store, dispose: async () => store.close() };
}

async function openIndexed(name?: string): Promise<Profile & { name: string }> {
  counter += 1;
  const dbName = name ?? `lawo-query-${counter}-${Date.now()}`;
  const indexedDb = await IndexedDbDatabase.open({ name: dbName });
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
    deviceLabel: 'query-idb',
    timezone: 'Africa/Cairo',
  });
  return { db, store, name: dbName, dispose: async () => store.close() };
}

/** Builds the same deterministic fixture on both engines. */
async function fixture(
  db: PortableLawOffice,
): Promise<{ ids: string[]; clientIds: string[] }> {
  const names = ['أحمد', 'بسمة', 'تامر', 'ثريا', 'جمال', 'حنان'];
  const ids: string[] = [];
  const clientIds: string[] = [];
  for (const [index, name] of names.entries()) {
    const created = (await db.createPerson(
      {
        firstName: name,
        lastName: 'الاختبار',
        occupation: index % 2 === 0 ? 'محاسب' : 'مهندس',
      },
      { client: index % 3 !== 0 },
    )) as { party: { id: string }; client: { client_code: string } | null };
    ids.push(String(created.party.id));
    if (created.client) clientIds.push(String(created.party.id));
  }
  const org = (await db.createOrganization({
    legalName: 'شركة النيل للتجارة',
    tradeName: 'النيل',
    legalFormCode: 'llc',
    taxId: '123-456',
  })) as { party: { id: string } };
  ids.push(String(org.party.id));
  return { ids, clientIds };
}

for (const kind of ['sqlite', 'indexeddb'] as const) {
  test(`${kind}: generic query paginates, filters and totals without loading a page twice`, async () => {
    const profile =
      kind === 'sqlite' ? await openSqlite() : await openIndexed();
    try {
      const { ids } = await fixture(profile.db);
      const page = await profile.db.query('party', {
        orderBy: [{ column: 'display_name', direction: 'asc' }],
        limit: 3,
        offset: 2,
      });
      assert.equal(page.total, ids.length);
      assert.equal(page.rows.length, 3);
      assert.equal(new Set(page.rows.map((row) => row.id)).size, 3);

      const filtered = await profile.db.query('party', {
        filters: [{ column: 'kind', op: 'eq', value: 'organization' }],
        limit: 10,
      });
      assert.equal(filtered.total, 1);
      assert.equal(filtered.rows[0]?.display_name, 'النيل');

      const contains = await profile.db.query('party', {
        filters: [
          { column: 'display_name', op: 'contains', value: 'الاختبار' },
        ],
        limit: 50,
      });
      assert.equal(contains.total, 6);

      const emptyPage = await profile.db.query('party', { limit: 0 });
      assert.equal(emptyPage.total, ids.length);
      assert.equal(emptyPage.rows.length, 0);

      const inFilter = await profile.db.query('party', {
        filters: [{ column: 'id', op: 'in', value: [ids[0]!, ids[2]!] }],
        limit: 10,
      });
      assert.equal(inFilter.total, 2);
    } finally {
      await profile.dispose();
    }
  });

  test(`${kind}: soft delete is excluded from queries and visible in the archive query`, async () => {
    const profile =
      kind === 'sqlite' ? await openSqlite() : await openIndexed();
    try {
      const { ids } = await fixture(profile.db);
      await profile.db.softDelete('party', ids[1]!, 'اختبار الأرشفة');
      const live = await profile.db.query('party', { limit: 100 });
      assert.equal(live.total, ids.length - 1);
      assert.ok(!live.rows.some((row) => row.id === ids[1]));

      const deleted = await profile.db.listDeleted('party', { limit: 100 });
      assert.equal(deleted.total, 1);
      assert.equal(deleted.rows[0]?.id, ids[1]);
      await profile.db.restore('party', ids[1]!);
      assert.equal(
        (await profile.db.query('party', { limit: 100 })).total,
        ids.length,
      );
    } finally {
      await profile.dispose();
    }
  });
}

test('sqlite and indexeddb return the same ordered page for the same fixture', async () => {
  const sqlite = await openSqlite();
  const indexed = await openIndexed();
  try {
    const sqliteFixture = await fixture(sqlite.db);
    const indexedFixture = await fixture(indexed.db);
    const sqlitePage = await sqlite.db.query('party', {
      orderBy: [{ column: 'display_name', direction: 'asc' }],
      limit: 4,
      offset: 1,
    });
    const indexedPage = await indexed.db.query('party', {
      orderBy: [{ column: 'display_name', direction: 'asc' }],
      limit: 4,
      offset: 1,
    });
    assert.deepEqual(
      sqlitePage.rows.map((row) => row.display_name),
      indexedPage.rows.map((row) => row.display_name),
    );
    assert.equal(sqlitePage.total, indexedPage.total);
    assert.equal(sqliteFixture.ids.length, indexedFixture.ids.length);
  } finally {
    await sqlite.dispose();
    await indexed.dispose();
  }
});

test('device preferences persist in the approved device_setting table', async () => {
  const first = await openIndexed();
  const name = first.name;
  try {
    await first.db.setDeviceSetting('ui.theme', 'dark');
    await first.db.setDeviceSetting('ui.density', 'compact');
    await first.db.setDeviceSetting('ui.table.clients.pageSize', 50, 'number');
    await first.db.setDeviceSetting(
      'ui.columns.clients',
      JSON.stringify(['name', 'code']),
      'json',
    );
    assert.equal(await first.db.getDeviceSetting('ui.theme'), 'dark');
    assert.equal(
      await first.db.getDeviceSetting('ui.table.clients.pageSize'),
      '50',
    );
    const all = await first.db.listDeviceSettings();
    assert.equal(all.length, 4);
    await first.db.removeDeviceSetting('ui.density');
    assert.equal(await first.db.getDeviceSetting('ui.density'), null);
  } finally {
    await first.dispose();
  }

  const reopened = await openIndexed(name);
  try {
    assert.equal(await reopened.db.getDeviceSetting('ui.theme'), 'dark');
    assert.equal(
      await reopened.db.getDeviceSetting('ui.table.clients.pageSize'),
      '50',
    );
    assert.deepEqual(
      JSON.parse((await reopened.db.getDeviceSetting('ui.columns.clients'))!),
      ['name', 'code'],
    );
  } finally {
    await reopened.dispose();
  }
});

test('recent audit and per-entity audit trail read the append-only log', async () => {
  const profile = await openIndexed();
  try {
    const created = (await profile.db.createPerson({
      firstName: 'سلمى',
      lastName: 'النجار',
    })) as { party: { id: string } };
    const trail = await profile.db.auditTrail(
      'party',
      String(created.party.id),
      20,
    );
    assert.ok(trail.length >= 1);
    assert.ok(trail.every((row) => row.entity_type === 'party'));
    assert.ok(trail.every((row) => row.entity_id === created.party.id));
    const recent = await profile.db.recentAudit(10);
    assert.ok(recent.length >= 1);
    const times = recent.map((row) => String(row.occurred_at));
    assert.deepEqual(times, [...times].sort().reverse());
  } finally {
    await profile.dispose();
  }
});

test('organizations and client upgrade are created once and keep one party row', async () => {
  const profile = await openIndexed();
  try {
    const org = (await profile.db.createOrganization(
      {
        legalName: 'مؤسسة الدلتا',
        tradeName: 'الدلتا',
        legalFormCode: 'association',
      },
      { client: false },
    )) as {
      party: { id: string; kind: string; display_name: string };
      organization: { legal_name: string };
      client: null;
    };
    assert.equal(org.party.kind, 'organization');
    assert.equal(org.party.display_name, 'الدلتا');
    assert.equal(org.organization.legal_name, 'مؤسسة الدلتا');
    assert.equal(org.client, null);

    const client = await profile.db.ensureClientProfile(String(org.party.id));
    assert.match(String(client.client_code), /^CLI-/);
    const second = await profile.db.ensureClientProfile(String(org.party.id));
    assert.equal(second.client_code, client.client_code);
    const parties = await profile.db.query('party', {
      filters: [{ column: 'id', op: 'eq', value: String(org.party.id) }],
      limit: 5,
    });
    assert.equal(parties.total, 1);
  } finally {
    await profile.dispose();
  }
});
