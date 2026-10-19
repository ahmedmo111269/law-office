import { IDBIndex } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { caseProfile } from './case-helpers.ts';
import type { QueryOptions } from '../src/portable/query.ts';
import { makeCase, makeCourt, makeFile, openHarness } from './helpers.ts';
import { PortableLawOffice } from '../src/portable/portable-database.ts';
import { SqlitePortableStore } from '../src/portable/store.ts';

test('cases/query: SQLite and IndexedDB agree on null-containing compound indexes, stable ties, finite IN and >500 duplicate keys', async () => {
  const profiles = [
    await caseProfile('sqlite'),
    await caseProfile('indexeddb'),
  ];
  const fid = randomUUID();
  try {
    for (const p of profiles) {
      const base = await p.cases.saveIntake({
        title: 'قالب بيانات اصطناعية لاختبار خطة القراءة',
        caseTypeCode: 'civil',
      });
      const row = (await p.db.queryCaseIndex({ limit: 1 })).rows[0]!;
      await p.store.transaction(['search_document'], async (tx) => {
        for (let i = 0; i < 1100; i += 1)
          await tx.put('search_document', {
            ...row,
            id: 100 + i,
            entity_id: `synthetic-query-only-${i}`,
            title: `اختبار ${i}`,
            body: 'syntheticprobe',
            normalized_text:
              i % 2 ? 'syntheticprobe odd' : 'syntheticprobe even',
            case_scope: i % 3 ? 'case' : 'intake',
            file_id: fid,
            status_id: null,
            last_action_on: null,
            updated_at: '2026-10-19T12:00:00.000Z',
          });
      });
      assert.ok(base.file.id);
    }
    const queries: QueryOptions[] = [
      {
        filters: [
          { column: 'case_scope', op: 'in', value: ['case', 'intake', 'case'] },
          {
            column: 'normalized_text',
            op: 'contains',
            value: 'syntheticprobe',
          },
        ],
        orderBy: [{ column: 'updated_at', direction: 'desc' }],
        offset: 25,
        limit: 25,
      },
      {
        filters: [{ column: 'file_id', op: 'eq', value: fid }],
        orderBy: [{ column: 'updated_at', direction: 'desc' }],
        offset: 495,
        limit: 25,
      },
      {
        filters: [
          { column: 'case_scope', op: 'in', value: ['case', 'intake'] },
          {
            column: 'normalized_text',
            op: 'contains',
            value: 'syntheticprobe',
          },
        ],
        orderBy: [{ column: 'updated_at', direction: 'desc' }],
        offset: 1080,
        limit: 25,
      },
      {
        filters: [
          {
            column: 'case_type_id',
            op: 'eq',
            value: profiles[0]!.lookups.id('case_type', 'civil')!,
          },
          { column: 'status_id', op: 'isNull' },
          {
            column: 'normalized_text',
            op: 'contains',
            value: 'syntheticprobe',
          },
        ],
        orderBy: [{ column: 'updated_at', direction: 'desc' }],
        limit: 25,
      },
      {
        filters: [
          { column: 'id', op: 'in', value: [100, 100, 101, 102, 1199] },
        ],
        orderBy: [{ column: 'updated_at', direction: 'desc' }],
        offset: 1,
        limit: 2,
      },
      {
        filters: [{ column: 'case_scope', op: 'eq', value: 'case' }],
        orderBy: [{ column: 'updated_at', direction: 'desc' }],
        offset: 250,
        limit: 25,
      },
      { filters: [{ column: 'file_id', op: 'eq', value: fid }], limit: 0 },
      {
        orderBy: [{ column: 'id', direction: 'desc' }],
        offset: 1100,
        limit: 2,
      },
    ];
    queries.push(
      {
        filters: [
          { column: 'case_scope', op: 'in', value: ['case', 'intake'] },
          { column: 'case_scope', op: 'eq', value: 'case' },
        ],
        orderBy: [{ column: 'updated_at', direction: 'desc' }],
        limit: 25,
      },
      {
        filters: [
          { column: 'case_scope', op: 'eq', value: 'case' },
          { column: 'case_scope', op: 'eq', value: 'intake' },
        ],
        limit: 25,
      },
    );
    for (const query of queries) {
      const left = await profiles[0]!.db.queryCaseIndex(query),
        right = await profiles[1]!.db.queryCaseIndex(query);
      assert.equal(right.total, left.total, JSON.stringify(query));
      assert.deepEqual(
        right.rows.map((r) => r.id),
        left.rows.map((r) => r.id),
        JSON.stringify(query),
      );
    }
    assert.equal(
      (await profiles[1]!.db.queryCaseIndex(queries[1])).total,
      1100,
    );
    assert.equal(
      (await profiles[1]!.db.queryCaseIndex(queries[2])).rows.length,
      20,
    );
    assert.equal((await profiles[1]!.db.queryCaseIndex(queries[4])).total, 4);
    const streamed = [];
    let candidateCounts = 0;
    const originalCount = IDBIndex.prototype.count;
    IDBIndex.prototype.count = function (...args) {
      candidateCounts += 1;
      return originalCount.apply(this, args);
    };
    try {
      for (const filter of [
        [
          {
            column: 'case_scope' as const,
            op: 'in' as const,
            value: ['case', 'intake'],
          },
          {
            column: 'normalized_text' as const,
            op: 'contains' as const,
            value: 'syntheticprobe',
          },
        ],
        [{ column: 'file_id' as const, op: 'eq' as const, value: fid }],
      ]) {
        const pair = [];
        for (const p of profiles) {
          const ids = [];
          for await (const page of p.store.scan('search_document', {
            filters: filter,
            pageSize: 137,
          })) {
            assert.ok(page.length <= 137);
            ids.push(...page.map((r) => r.id));
          }
          assert.equal(ids.length, 1100);
          assert.equal(new Set(ids).size, 1100);
          pair.push(ids);
        }
        assert.deepEqual(pair[1], pair[0]);
        streamed.push(...pair);
      }
      assert.deepEqual(streamed[1], streamed[0]);
      assert.equal(
        candidateCounts,
        0,
        'internal scans must not recount any index candidate',
      );
      const stats = await profiles[1]!.cases.indexStats();
      assert.equal(stats.total, 1101);
      assert.deepEqual(stats, await profiles[0]!.cases.indexStats());
      assert.equal(
        candidateCounts,
        0,
        'statistics must stream without per-batch index counts',
      );
    } finally {
      IDBIndex.prototype.count = originalCount;
    }
  } finally {
    for (const p of profiles) await p.close();
  }
});

test('cases/native: shared cycle guards, native/portable sequences and native reindex invalidation work without resetting business data', async () => {
  const h = openHarness('mixed-native-portable');
  try {
    const file = makeFile(h.db),
      court = makeCourt(h.db);
    makeCase(h.db, file.id, court);
    let db = await PortableLawOffice.open({
      store: new SqlitePortableStore(h.db.db),
      clock: h.clock,
      appVersion: '0.3.0-test',
    });
    await db.createPerson({ firstName: 'أول', lastName: 'اختباري' });
    h.db.parties.createPerson({ firstName: 'ثان', lastName: 'اختباري' });
    await db.createPerson({ firstName: 'ثالث', lastName: 'اختباري' });
    assert.equal((await db.query('party', { limit: 10 })).total, 3);
    const stages = h.db.entity('procedural_stage');
    const initial = {
      file_id: file.id,
      type_id: h.db.lookups.requireItemByCode('stage_type', 'notice').id,
      status_id: h.db.lookups.requireItemByCode('stage_status', 'ongoing').id,
    };
    const a = stages.insert(initial),
      b = stages.insert({ ...initial, previous_stage_id: a.id });
    const count = h.db.health.stats().auditEntries;
    assert.throws(
      () => stages.update(a.id, { previous_stage_id: b.id }),
      /دورة/,
    );
    assert.equal(h.db.health.stats().auditEntries, count);
    assert.equal(stages.requireById(a.id).previous_stage_id, null);
    const task = h.db.tasks.create({
      title: 'متابعة مرحلة عبر المستودع الأصلي',
      stageId: a.id,
    });
    const appointment = h.db.appointments.create({
      title: 'موعد عبر المستودع الأصلي',
      stageId: a.id,
      startAt: '2026-10-20T09:00:00.000Z',
    });
    assert.equal(task.file_id, file.id);
    assert.equal(appointment.file_id, file.id);
    h.db.search.rebuildAll();
    assert.equal(
      h.db.db.get<{ value: string }>(
        "SELECT value FROM app_meta WHERE key='cases.index_version'",
      )?.value,
      '0',
    );
    db = await PortableLawOffice.open({
      store: new SqlitePortableStore(h.db.db),
      clock: h.clock,
      appVersion: '0.3.0-test',
    });
    assert.equal(
      (
        await db.queryCaseIndex({
          filters: [{ column: 'case_scope', op: 'eq', value: 'case' }],
          limit: 25,
        })
      ).total,
      1,
    );
    await db.createPerson({ firstName: 'رابع', lastName: 'اختباري' });
    assert.equal((await db.query('party', { limit: 10 })).total, 4);
    assert.equal((await db.healthCheck()).ok, true);
  } finally {
    h.cleanup();
  }
});

for (const engine of ['sqlite', 'indexeddb'] as const) {
  test(`cases/${engine}: existing work services enforce degree scope, preserve edited party-link IDs and isolate degree notes`, async () => {
    const h = await caseProfile(engine);
    try {
      const { TaskService } = await import('../src/ui/services/tasks.ts'),
        { AgendaService } = await import('../src/ui/services/agenda.ts');
      const deps = { db: h.db, lookups: h.lookups, cache: h.cache },
        tasks = new TaskService(deps),
        agenda = new AgendaService(deps);
      const one = await h.cases.saveIntake({
          title: 'نطاق أعمال اصطناعي',
          caseTypeCode: 'civil',
          caseNumber: 'A',
          caseYear: 2026,
        }),
        fid = String(one.file.id),
        a = String(one.legalCase!.id);
      const two = await h.cases.createRelatedCase(
          a,
          {
            fileId: fid,
            title: 'نطاق أعمال اصطناعي',
            caseTypeCode: 'civil',
            caseNumber: 'B',
            caseYear: 2026,
          },
          'appeal_of',
        ),
        b = String(two.legalCase!.id);
      const stage = await h.cases.saveStage({
          fileId: fid,
          caseId: a,
          typeCode: 'notice',
        }),
        sid = String(stage.id);
      const task = await tasks.create({ title: 'عمل اصطناعي', stageId: sid }),
        appointment = await agenda.createAppointment({
          title: 'موعد اصطناعي',
          startAt: '2026-10-20T09:00:00.000Z',
          stageId: sid,
        });
      assert.equal(task.file_id, fid);
      assert.equal(task.case_id, a);
      assert.equal(appointment.case_id, a);
      const before = await h.store.count('audit_log');
      await assert.rejects(
        () =>
          tasks.create({
            title: 'غير مسموح',
            fileId: fid,
            caseId: b,
            stageId: sid,
          }),
        /مرحلة/,
      );
      await assert.rejects(
        () =>
          agenda.createAppointment({
            title: 'غير مسموح',
            fileId: fid,
            caseId: b,
            stageId: sid,
            startAt: '2026-10-20T09:00:00.000Z',
          }),
        /مرحلة/,
      );
      assert.equal(await h.store.count('audit_log'), before);
      const person = (await h.db.createPerson({
        firstName: 'طرف',
        lastName: 'اصطناعي',
      })) as { party: { id: string } };
      const link = await h.cases.addParty({
        fileId: fid,
        caseId: a,
        partyId: person.party.id,
        roleCode: 'defendant',
        sideCode: 'defendant',
        isClient: true,
      });
      await h.cases.saveIntake({
        fileId: fid,
        caseId: a,
        title: 'نطاق أعمال اصطناعي',
        caseTypeCode: 'civil',
        caseNumber: 'A',
        caseYear: 2026,
        parties: [
          {
            linkId: String(link.id),
            partyId: person.party.id,
            roleCode: 'client',
            sideCode: '',
            isClient: false,
          },
        ],
      });
      const edited = await h.db.require('case_file_party', String(link.id));
      assert.equal(edited.id, link.id);
      assert.equal(edited.side_id, null);
      assert.equal(edited.is_office_client, 0);
      assert.equal(
        (await h.list({ file: fid })).rows.find((r) => r.legalCase.id === a)
          ?.clientNames.length,
        0,
      );
      await h.cases.addNote({
        fileId: fid,
        caseId: a,
        body: 'NOTE_DEGREE_A',
        isPrivate: true,
      });
      await h.cases.addNote({
        fileId: fid,
        caseId: b,
        body: 'NOTE_DEGREE_B',
        isPrivate: true,
      });
      assert.deepEqual(
        (await h.cases.get(a))?.notes.map((n) => n.body),
        ['NOTE_DEGREE_A'],
      );
      assert.deepEqual(
        (await h.cases.get(b))?.notes.map((n) => n.body),
        ['NOTE_DEGREE_B'],
      );
      for (let i = 0; i < 205; i += 1)
        await h.db.update('procedural_stage', sid, {
          notes: `تدقيق اصطناعي ${i}`,
        });
      const audit = await h.db.auditTrailPage('procedural_stage', sid, {
        offset: 200,
        limit: 25,
      });
      assert.equal(audit.total, 206);
      assert.equal(audit.rows.length, 6);
      assert.equal((await h.db.healthCheck()).ok, true);
    } finally {
      await h.close();
    }
  });
  test(`cases/${engine}: committed logical restore survives a subsequent index-rebuild failure and repairs on reopen`, async () => {
    const h = await caseProfile(engine);
    try {
      const saved = await h.cases.saveIntake({
        title: 'نسخة اصطناعية للاستعادة',
        caseTypeCode: 'civil',
        caseNumber: 'R',
        caseYear: 2026,
      });
      const backup = await h.db.exportBackup(),
        original = h.store.scan.bind(h.store);
      await h.db.update('case_file', String(saved.file.id), {
        title: 'تعديل سيستبدل بالنسخة',
      });
      let fail = true;
      h.store.scan = async function* (table, options) {
        if (fail && table === 'case_file') {
          fail = false;
          throw new Error('injected-rebuild-failure');
        }
        yield* original(table, options);
      };
      await assert.rejects(
        () => h.db.restoreBackup(backup),
        (error: unknown) =>
          Boolean(
            error &&
              typeof error === 'object' &&
              'code' in error &&
              error.code === 'SEARCH_UNAVAILABLE' &&
              'details' in error &&
              (error.details as { rebuildPending?: boolean })?.rebuildPending,
          ),
      );
      assert.equal(
        (await h.db.require('case_file', String(saved.file.id))).title,
        'نسخة اصطناعية للاستعادة',
      );
      assert.equal(
        (await h.store.get('app_meta', 'cases.index_version'))?.value,
        '0',
      );
      assert.equal(
        (await h.store.get('app_meta', 'search.rebuild_pending'))?.value,
        '1',
      );
      h.store.scan = original;
      const reopened = await PortableLawOffice.open({
        store: h.store,
        clock: h.db.clock,
        appVersion: '0.3.0-test',
      });
      assert.equal(
        (await h.store.get('app_meta', 'cases.index_version'))?.value,
        '2',
      );
      assert.equal(
        (await h.store.get('app_meta', 'search.rebuild_pending'))?.value,
        '0',
      );
      assert.equal((await reopened.healthCheck()).ok, true);
      assert.equal(
        (
          await reopened.queryCaseIndex({
            filters: [{ column: 'case_scope', op: 'eq', value: 'case' }],
            limit: 25,
          })
        ).total,
        1,
      );
    } finally {
      await h.close();
    }
  });
}
