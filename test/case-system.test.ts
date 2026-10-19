import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_MIGRATION } from '../src/db/migrations/0001_initial.ts';
import { CASE_SYSTEM_MIGRATION } from '../src/db/migrations/0002_case_system.ts';
import type { CaseTemplate } from '../src/cases/types.ts';
import { completionIssues } from '../src/cases/validation.ts';
import { CASE_MIGRATION_METADATA } from '../src/schema/v2/migration-metadata.ts';
import { caseProfile } from './case-helpers.ts';
const text = (value: unknown): string => String(value ?? '');
test('cases: frozen v1 checksum and target-engine restore metadata agree with real migrations', () => {
  assert.equal(
    INITIAL_MIGRATION.checksum,
    'fab6503709aed3a06392d48872804371c8f2f083accb421dcab034978be6f2c8',
  );
  assert.equal(
    CASE_MIGRATION_METADATA.sqlite[0].checksum,
    INITIAL_MIGRATION.checksum,
  );
  assert.equal(
    CASE_MIGRATION_METADATA.sqlite[1].checksum,
    CASE_SYSTEM_MIGRATION.checksum,
  );
});

for (const engine of ['sqlite', 'indexeddb'] as const) {
  test(`cases/${engine}: intake can start without a court number, with exact completeness and no fictional legal case`, async () => {
    const h = await caseProfile(engine);
    try {
      await assert.rejects(
        () => h.cases.saveIntake({ title: '', caseTypeCode: 'civil' }),
        /مطلوب/,
      );
      const saved = await h.cases.saveIntake({
        title: 'اختبار اصطناعي — نزاع قبل القيد',
        caseTypeCode: 'civil',
        subject: 'تعويض أضرار العقد',
        requests: 'مراجعة المستندات',
      });
      assert.equal(saved.legalCase, null);
      assert.equal(await h.store.count('legal_case'), 0);
      assert.equal(saved.file.intake_enabled, 1);
      assert.match(text(saved.file.file_number), /^FILE-/);
      const result = await h.list({ scope: 'intake' }, 'اضرار تعويض');
      assert.equal(result.total, 1);
      assert.equal(result.rows[0]?.isIntake, true);
      const detail = await h.cases.intake(text(saved.file.id));
      assert.ok(detail.completion.some((i) => i.kind === 'parties'));
      assert.ok(detail.completion.some((i) => i.kind === 'procedural'));
      assert.equal((await h.db.healthCheck()).ok, true);
    } finally {
      await h.close();
    }
  });

  test(`cases/${engine}: template versions, hidden type values, confirmation, conditional required fields and private family data`, async () => {
    const h = await caseProfile(engine);
    try {
      const saved = await h.cases.saveIntake({
        title: 'اختبار إصدارات',
        caseTypeCode: 'civil',
        specialized: { civil: { relationship: 'عقد خدمات محفوظ' } },
      });
      const fid = text(saved.file.id);
      const template = structuredClone(await h.cases.template('civil'));
      template.version += 1;
      template.groups = [
        ...template.groups,
        {
          key: 'office_custom',
          label: 'بيانات المكتب',
          fields: [
            {
              key: 'office_check',
              label: 'مرجع مراجعة المكتب',
              type: 'text',
              required: true,
            },
          ],
        },
      ];
      await h.cases.saveTemplate(template);
      await assert.rejects(() => h.cases.saveTemplate(template), /إصدار/);
      await assert.rejects(
        () =>
          h.cases.saveIntake({
            title: 'ملف جديد بقالب أحدث',
            caseTypeCode: 'civil',
          }),
        /مرجع مراجعة المكتب/,
      );
      await h.cases.saveIntake({
        fileId: fid,
        title: 'ملف قديم بقالب لقطة',
        caseTypeCode: 'civil',
      });
      assert.equal((await h.cases.intake(fid)).template.version, 1);
      await assert.rejects(
        () =>
          h.cases.saveIntake({
            fileId: fid,
            title: 'تغيير',
            caseTypeCode: 'family',
          }),
        /أكد/,
      );
      await h.cases.saveIntake({
        fileId: fid,
        title: 'اختبار خاص',
        caseTypeCode: 'family',
        confirmTypeChange: true,
        specialized: {
          family: {
            children_relevant: 'yes',
            children_notes: 'سرطفلاختبارخاص',
          },
        },
      });
      assert.equal((await h.list({}, 'سرطفلاختبارخاص')).total, 0);
      await h.cases.saveIntake({
        fileId: fid,
        title: 'عودة',
        caseTypeCode: 'civil',
        confirmTypeChange: true,
      });
      const profile = await h.db.require('case_file', fid);
      const values = JSON.parse(text(profile.specialized_json)) as Record<
        string,
        Record<string, string>
      >;
      assert.equal(values.civil?.relationship, 'عقد خدمات محفوظ');
      assert.equal(values.family?.children_notes, 'سرطفلاختبارخاص');
      const conditional = structuredClone(await h.cases.template('other'));
      conditional.version += 1;
      conditional.groups = [
        {
          key: 'office_condition',
          label: 'شرط مكتب اختباري',
          controller: 'has_data',
          when: { field: 'has_data', equals: 'yes' },
          fields: [
            {
              key: 'has_data',
              label: 'توجد بيانات؟',
              type: 'select',
              options: [
                { value: 'yes', label: 'نعم' },
                { value: 'no', label: 'لا' },
              ],
              required: false,
            },
            {
              key: 'details',
              label: 'بيانات عند الحاجة',
              type: 'text',
              required: true,
            },
          ],
        },
      ];
      await h.cases.saveTemplate(conditional);
      const hidden = await h.cases.saveIntake({
        title: 'شرط مخفي',
        caseTypeCode: 'other',
        specialized: { other: { has_data: 'no' } },
      });
      const detail = await h.cases.intake(text(hidden.file.id));
      assert.ok(!detail.completion.some((i) => i.field === 'special_details'));
      await assert.rejects(
        () =>
          h.cases.saveIntake({
            title: 'شرط ظاهر',
            caseTypeCode: 'other',
            specialized: { other: { has_data: 'yes' } },
          }),
        /بيانات عند الحاجة/,
      );
      assert.equal((await h.db.healthCheck()).ok, true);
    } finally {
      await h.close();
    }
  });

  test(`cases/${engine}: independent stages, explicit court registration and appeal links preserve source history`, async () => {
    const h = await caseProfile(engine);
    try {
      const initial = await h.cases.saveIntake({
        title: 'اختبار مسار اختياري',
        caseTypeCode: 'labor',
      });
      const fid = text(initial.file.id);
      const stage = await h.cases.saveStage({
        fileId: fid,
        typeCode: 'labor_office',
        referenceNumber: 'طلب ١٢٣',
        startedOn: '2026-10-01',
        completedOn: '2026-10-10',
        statusCode: 'ended',
        outcome: 'تعذر الاتفاق — بيانات اختبار',
        dataSource: 'محضر اختباري',
      });
      assert.equal((await h.list({ needsNext: 'yes' })).total, 1);
      assert.equal(await h.store.count('legal_case'), 0);
      const first = await h.cases.createCaseFromStage(text(stage.id), {
        title: 'اختبار مسار اختياري',
        caseTypeCode: 'labor',
        caseNumber: '102',
        caseYear: 2026,
        registrationDate: '2026-10-12',
      });
      assert.ok(first.legalCase);
      assert.deepEqual(
        await h.db.require('procedural_stage', text(stage.id)),
        stage,
      );
      const stages = (await h.cases.intake(fid)).stages;
      assert.equal(stages.length, 2);
      assert.equal(
        stages.find((s) => s.case_id === first.legalCase!.id)
          ?.previous_stage_id,
        stage.id,
      );
      assert.equal((await h.list()).total, 1);
      assert.equal((await h.list({ scope: 'intake' })).total, 0);
      const judgment = await h.db.recordJudgment({
        caseId: text(first.legalCase!.id),
        issuedOn: '2026-10-15',
        operativePart: 'منطوق اختباري',
      });
      const second = await h.cases.createRelatedCase(
        text(first.legalCase!.id),
        {
          fileId: fid,
          title: 'اختبار مسار اختياري',
          caseTypeCode: 'labor',
          caseNumber: '77',
          caseYear: 2026,
          litigationDegreeCode: 'appeal',
          registrationDate: '2026-10-18',
        },
        'appeal_of',
        text(judgment.id),
      );
      assert.notEqual(first.legalCase!.id, second.legalCase!.id);
      assert.equal(
        (await h.db.require('legal_case', text(first.legalCase!.id)))
          .case_number,
        '102',
      );
      assert.equal((await h.list({ hasAppeal: 'yes' })).total, 2);
      const appeal = (await h.db.query('judgment_appeal', { limit: 10 }))
        .rows[0];
      assert.equal(appeal?.appeal_case_id, second.legalCase!.id);
      assert.equal(appeal?.user_deadline_on, null);
      assert.equal(
        (
          await h.list({
            previousType: 'labor_office',
            fromDate: '2026-10-11',
            dateField: 'registration',
          })
        ).total,
        2,
      );
      assert.equal((await h.db.healthCheck()).ok, true);
    } finally {
      await h.close();
    }
  });

  test(`cases/${engine}: cycles, wrong-file stage links, bad dates and circuit mismatches roll back atomically`, async () => {
    const h = await caseProfile(engine);
    try {
      const one = await h.cases.saveIntake({
        title: 'اختبار ملف أول',
        caseTypeCode: 'civil',
        caseNumber: '1',
        caseYear: 2026,
      });
      const two = await h.cases.saveIntake({
        title: 'اختبار ملف ثان',
        caseTypeCode: 'civil',
        caseNumber: '2',
        caseYear: 2026,
      });
      const a = await h.cases.saveStage({
        fileId: text(one.file.id),
        typeCode: 'notice',
        startedOn: '2026-09-01',
      });
      const b = await h.cases.saveStage({
        fileId: text(one.file.id),
        typeCode: 'mediation',
        previousStageId: text(a.id),
      });
      const before = await h.store.count('audit_log');
      await assert.rejects(
        () =>
          h.cases.saveStage({
            id: text(a.id),
            fileId: text(one.file.id),
            typeCode: 'notice',
            previousStageId: text(b.id),
          }),
        /دورة/,
      );
      assert.equal(await h.store.count('audit_log'), before);
      assert.equal(
        (await h.db.require('procedural_stage', text(a.id))).previous_stage_id,
        null,
      );
      await assert.rejects(
        () =>
          h.cases.saveStage({
            fileId: text(two.file.id),
            typeCode: 'notice',
            previousStageId: text(a.id),
          }),
        /نفسه/,
      );
      await assert.rejects(
        () =>
          h.cases.saveStage({
            fileId: text(one.file.id),
            typeCode: 'notice',
            startedOn: '2026-02-31',
          }),
        /تاريخ/,
      );
      await assert.rejects(
        () =>
          h.cases.linkCases(
            text(one.legalCase!.id),
            text(one.legalCase!.id),
            'related',
          ),
        /نفسها/,
      );
      await h.cases.linkCases(
        text(two.legalCase!.id),
        text(one.legalCase!.id),
        'appeal_of',
      );
      await assert.rejects(
        () =>
          h.cases.linkCases(
            text(one.legalCase!.id),
            text(two.legalCase!.id),
            'cassation_of',
          ),
        /دورة/,
      );
      // Non-hierarchical associations can point in both directions; no universal appeal entitlement is inferred.
      await h.cases.linkCases(
        text(one.legalCase!.id),
        text(two.legalCase!.id),
        'related',
      );
      const c1 = await h.db.createCourt({ name: 'جهة اختبار أ' }),
        c2 = await h.db.createCourt({ name: 'جهة اختبار ب' });
      const circuit = await h.db.insert('court_circuit', {
        court_id: c1.id,
        name: 'دائرة اختبار',
        location: null,
        is_active: 1,
        notes: null,
      });
      await assert.rejects(
        () =>
          h.cases.saveIntake({
            fileId: text(one.file.id),
            caseId: text(one.legalCase!.id),
            title: 'عنوان لا يجوز حفظه عند الفشل',
            caseTypeCode: 'civil',
            caseNumber: '1',
            caseYear: 2026,
            courtId: text(c2.id),
            circuitId: text(circuit.id),
          }),
        /الدائرة/,
      );
      assert.equal(
        (await h.db.require('case_file', text(one.file.id))).title,
        'اختبار ملف أول',
      );
      const term = await h.cases.addTerm({ name: 'مصطلح اختبار أب' });
      const child = await h.cases.addTerm({
        name: 'مصطلح اختبار فرع',
        parentId: text(term.id),
      });
      await assert.rejects(
        () =>
          h.db.update('lookup_item', text(term.id), { parent_id: child.id }),
        /دورة/,
      );
      assert.equal((await h.db.healthCheck()).ok, true);
    } finally {
      await h.close();
    }
  });

  test(`cases/${engine}: a person keeps independent roles and office representation in different degrees`, async () => {
    const h = await caseProfile(engine);
    try {
      const person = (await h.db.createPerson({
        firstName: 'شخص',
        lastName: 'اختباري',
      })) as { party: { id: string } };
      const first = await h.cases.saveIntake({
        title: 'اختبار صفات مستقلة',
        caseTypeCode: 'civil',
        caseNumber: '10',
        caseYear: 2026,
      });
      const fid = text(first.file.id),
        a = text(first.legalCase!.id);
      const global = await h.db.insert('case_file_party', {
        file_id: fid,
        case_id: null,
        party_id: person.party.id,
        role_id: h.lookups.id('party_role', 'worker'),
        side_id: null,
        is_office_client: 1,
        is_primary: 1,
        ordinal: 1,
        start_date: null,
        end_date: null,
        notes: null,
      });
      const second = await h.cases.createRelatedCase(
        a,
        {
          fileId: fid,
          title: 'اختبار صفات مستقلة',
          caseTypeCode: 'civil',
          caseNumber: '11',
          caseYear: 2026,
        },
        'appeal_of',
      );
      const b = text(second.legalCase!.id);
      await h.cases.updatePartyRole(text(global.id), 'defendant', '', false, b);
      assert.deepEqual(
        await h.db.require('case_file_party', text(global.id)),
        global,
      );
      const left = await h.cases.get(a),
        right = await h.cases.get(b);
      assert.equal(left?.parties[0]?.roleCode, 'worker');
      assert.equal(left?.parties[0]?.isOfficeClient, true);
      assert.equal(right?.parties.length, 1);
      assert.equal(right?.parties[0]?.roleCode, 'defendant');
      assert.equal(right?.parties[0]?.isOfficeClient, false);
      const workers = await h.list({ party: person.party.id, role: 'worker' });
      assert.deepEqual(
        workers.rows.map((r) => text(r.legalCase.id)),
        [a],
      );
      const defendants = await h.list({
        party: person.party.id,
        role: 'defendant',
      });
      assert.deepEqual(
        defendants.rows.map((r) => text(r.legalCase.id)),
        [b],
      );
      assert.equal((await h.db.healthCheck()).ok, true);
    } finally {
      await h.close();
    }
  });

  test(`cases/${engine}: dictionary aliases, hierarchy, exact case scope and merge retain identifiers and search updates`, async () => {
    const h = await caseProfile(engine);
    try {
      const parent = await h.cases.addTerm({
        name: 'موضوع اصطناعي أصلي',
        aliases: ['اختبار الهمزات أُجْرة'],
      });
      const child = await h.cases.addTerm({
        name: 'فرع اصطناعي',
        parentId: text(parent.id),
      });
      const target = await h.cases.addTerm({
        name: 'المصطلح الهدف',
        aliases: ['مستحقات اختبار'],
      });
      await h.lookups.refresh(h.db);
      const first = await h.cases.saveIntake({
        title: 'ملف دمج اختباري',
        caseTypeCode: 'civil',
        caseNumber: '20',
        caseYear: 2026,
      });
      const second = await h.cases.createRelatedCase(
        text(first.legalCase!.id),
        {
          fileId: text(first.file.id),
          title: 'ملف دمج اختباري',
          caseTypeCode: 'civil',
          caseNumber: '21',
          caseYear: 2026,
        },
        'appeal_of',
      );
      const link = await h.db.insert('case_term', {
        file_id: first.file.id,
        case_id: second.legalCase!.id,
        term_id: child.id,
      });
      assert.equal((await h.list({ term: text(parent.id) })).total, 1);
      assert.equal((await h.list({}, 'اختبار اجره')).total, 1);
      await h.db.update('lookup_item', text(parent.id), {
        description: JSON.stringify({ aliases: ['مرادفجديداختباري'] }),
      });
      assert.equal((await h.list({}, 'مرادفجديداختباري')).total, 1);
      await assert.rejects(
        () => h.cases.mergeTerms(text(parent.id), text(child.id)),
        /فروعه/,
      );
      await h.cases.mergeTerms(text(parent.id), text(target.id));
      assert.equal(
        (await h.db.require('lookup_item', text(child.id))).parent_id,
        target.id,
      );
      assert.equal(
        (await h.db.require('lookup_item', text(parent.id))).is_active,
        0,
      );
      assert.equal(
        (await h.db.require('case_term', text(link.id))).id,
        link.id,
      );
      assert.equal((await h.list({}, 'موضوع اصطناعي اصلي')).total, 1);
      await h.cases.mergeTerms(text(child.id), text(target.id));
      assert.equal(
        (await h.db.require('case_term', text(link.id))).term_id,
        target.id,
      );
      assert.equal((await h.list({ term: text(target.id) })).total, 1);
      assert.equal((await h.db.healthCheck()).ok, true);
    } finally {
      await h.close();
    }
  });

  test(`cases/${engine}: document and authority edits invalidate only affected case projections and keep historical names`, async () => {
    const h = await caseProfile(engine);
    try {
      const authority = await h.db.createCourt({
        name: 'جهة الاختبار القديمة',
      });
      const initial = await h.cases.saveIntake({
        title: 'اختبار جهات ومستندات',
        caseTypeCode: 'administrative',
      });
      const document = await h.db.registerDocument({
        title: 'مستندمرجعقديم',
        docTypeCode: 'other',
      });
      const stage = await h.cases.saveStage({
        fileId: text(initial.file.id),
        typeCode: 'grievance',
        authorityId: text(authority.id),
        sourceDocumentId: text(document.id),
        startedOn: '2026-10-01',
        statusCode: 'waiting',
        followUpOn: '2026-10-22',
      });
      assert.equal(
        (
          await h.list(
            { hasDocuments: 'yes', hasPre: 'yes' },
            'جهة الاختبار القديمة مستندمرجعقديم',
          )
        ).total,
        1,
      );
      await h.db.update('court', text(authority.id), {
        name: 'جهةالاختبارالمحدثة',
        aliases_json: JSON.stringify(['اسمبديلللجهة']),
      });
      assert.equal((await h.list({}, 'اسمبديلللجهة')).total, 1);
      assert.equal(
        (await h.db.require('procedural_stage', text(stage.id)))
          .authority_name_snapshot,
        'جهة الاختبار القديمة',
      );
      await h.db.update('document', text(document.id), {
        title: 'مستندمرجعمحدث',
      });
      assert.equal((await h.list({}, 'مستندمرجعمحدث')).total, 1);
      assert.equal((await h.list({}, 'مستندمرجعقديم')).total, 0);
      const backup = await h.db.exportBackup();
      assert.equal(backup.schemaVersion, 2);
      assert.equal((await h.db.verifyBackup(backup)).valid, true);
      await h.db.restoreBackup(backup);
      assert.equal(
        (
          await h.list({
            dateField: 'followUp',
            fromDate: '2026-10-21',
            toDate: '2026-10-23',
          })
        ).total,
        1,
      );
      assert.equal((await h.db.healthCheck()).ok, true);
    } finally {
      await h.close();
    }
  });

  test(`cases/${engine}: paged result counts stay exact beyond the former 600-row cutoff and do not duplicate matches`, async () => {
    const h = await caseProfile(engine);
    try {
      for (let start = 0; start < 620; start += 50)
        await h.db.transaction(async () => {
          for (let i = start; i < Math.min(620, start + 50); i += 1)
            await h.cases.saveIntake({
              title: `ملفترقيمتجريبي ${i}`,
              caseTypeCode: 'civil',
              subject: i % 2 ? 'اختبار نص متعدد' : 'اختبار النص الآخر',
            });
        });
      const first = await h.list({}, 'ملفترقيمتجريبي', 1, 25);
      const last = await h.list({}, 'ملفترقيمتجريبي', 25, 25);
      assert.equal(first.total, 620);
      assert.equal(first.rows.length, 25);
      assert.equal(last.total, 620);
      assert.equal(last.rows.length, 20);
      assert.equal(
        new Set([...first.rows, ...last.rows].map((r) => r.legalCase.id)).size,
        45,
      );
      assert.equal((await h.list({}, 'ملفترقيمتجريبي متعدد')).total, 310);
      assert.equal((await h.cases.indexStats()).total, 620);
    } finally {
      await h.close();
    }
  });
}

test('cases: conditional completeness uses the same visibility rule as required-field validation', () => {
  const template: CaseTemplate = {
    typeCode: 'other',
    version: 1,
    title: 'اختبار',
    active: true,
    groups: [
      {
        key: 'conditional',
        label: 'اختبار',
        when: { field: 'control', equals: 'yes' },
        controller: 'control',
        fields: [
          { key: 'control', type: 'text', label: 'مفتاح', required: false },
          { key: 'details', type: 'text', label: 'تفاصيل', required: true },
        ],
      },
    ],
    possibleStages: [],
    possibleRelations: [],
    suggestedAuthorities: [],
    completeness: { recommended: [] },
  };
  const hidden = completionIssues(
    { specialized_json: JSON.stringify({ other: { control: 'no' } }) },
    null,
    [],
    [],
    0,
    template,
  );
  const visible = completionIssues(
    { specialized_json: JSON.stringify({ other: { control: 'yes' } }) },
    null,
    [],
    [],
    0,
    template,
  );
  assert.equal(
    hidden.some((i) => i.field === 'special_details'),
    false,
  );
  assert.equal(
    visible.some((i) => i.field === 'special_details'),
    true,
  );
});

for (const engine of ['sqlite', 'indexeddb'] as const)
  test(`cases/${engine}: built-in child privacy cannot be downgraded through configurable template flags`, async () => {
    const h = await caseProfile(engine);
    try {
      const template = structuredClone(await h.cases.template('family'));
      template.version += 1;
      for (const group of template.groups) {
        group.sensitive = false;
        for (const field of group.fields) field.sensitive = false;
      }
      await h.cases.saveTemplate(template);
      const saved = await h.cases.saveIntake({
        title: 'اختبار خصوصية قالب معدل',
        caseTypeCode: 'family',
        specialized: {
          family: {
            children_relevant: 'yes',
            children_notes: 'PRIVATEFLAG_SENTINEL',
          },
        },
      });
      assert.ok(
        String(
          (await h.db.require('case_file', String(saved.file.id)))
            .specialized_json,
        ).includes('PRIVATEFLAG_SENTINEL'),
      );
      const docs = (await h.db.queryCaseIndex({ limit: 25 })).rows;
      assert.ok(docs.length > 0);
      assert.ok(
        docs.every(
          (d) => !String(d.normalized_text).includes('privateflag_sentinel'),
        ),
      );
    } finally {
      await h.close();
    }
  });
