/** Domain operations used by the existing CaseService; not a second storage/service layer. */
import { relatedRows } from '../ui/services/types.ts';
import type { ServiceDeps } from '../ui/services/types.ts';
import type { EngineRow } from '../portable/store.ts';
import type {
  CaseTemplate,
  IntakeInput,
  StageInput,
  SpecializedValues,
} from './types.ts';
import {
  assertDate,
  assertTemplate,
  completionIssues,
  fieldError,
  parseObject,
  validateSpecialized,
} from './validation.ts';
import { normalizeArabic } from '../util/arabic.ts';
import { newId } from '../util/uuid.ts';
import { CASE_TEMPLATE_SEED } from '../schema/v2/template-seed.ts';
export interface IntakeDetail {
  file: EngineRow;
  cases: EngineRow[];
  stages: EngineRow[];
  parties: EngineRow[];
  terms: EngineRow[];
  template: CaseTemplate;
  completion: ReturnType<typeof completionIssues>;
}
const str = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v);
async function codeId(
  deps: ServiceDeps,
  list: string,
  code: string,
): Promise<string> {
  try {
    return str((await deps.db.lookup(list, code)).id);
  } catch {
    fieldError(list, `القيمة المرجعية غير موجودة: ${list} / ${code}`);
  }
}
export async function templateFor(
  deps: ServiceDeps,
  type: string,
  file?: EngineRow,
): Promise<CaseTemplate> {
  const historical = parseObject<Record<string, CaseTemplate>>(
    file?.template_snapshot_json,
    {},
  )[type];
  if (historical) return historical;
  const row = (
    await deps.db.query('office_setting', {
      filters: [{ column: 'key', op: 'eq', value: `cases.template.${type}` }],
      limit: 1,
    })
  ).rows[0];
  const template = row
    ? parseObject<CaseTemplate | null>(row.value, null)
    : CASE_TEMPLATE_SEED[type];
  if (!template)
    fieldError(
      'caseTypeCode',
      'لا يوجد قالب لهذا النوع. أنشئ قالبًا من إعدادات القضايا.',
    );
  assertTemplate(template);
  return template;
}
export async function getIntake(
  deps: ServiceDeps,
  fileId: string,
): Promise<IntakeDetail> {
  const { db } = deps;
  const file = await db.require('case_file', fileId);
  const filters = [{ column: 'file_id', op: 'eq' as const, value: fileId }];
  const links = (await relatedRows(db, 'case_file_case', { filters })).rows;
  const cases = links.length
    ? (
        await relatedRows(db, 'legal_case', {
          filters: [
            {
              column: 'id',
              op: 'in',
              value: [...new Set(links.map((l) => str(l.case_id)))],
            },
          ],
        })
      ).rows
    : [];
  const stages = (
    await relatedRows(db, 'procedural_stage', {
      filters,
      orderBy: [{ column: 'created_at', direction: 'asc' }],
    })
  ).rows;
  const parties = (await relatedRows(db, 'case_file_party', { filters })).rows;
  const terms = (await relatedRows(db, 'case_term', { filters })).rows;
  const type = deps.lookups.codeById(str(file.case_type_id)) || 'other';
  const template = await templateFor(deps, type, file);
  return {
    file,
    cases,
    stages,
    parties,
    terms,
    template,
    completion: completionIssues(
      file,
      cases[0] ?? null,
      parties,
      stages,
      terms.length,
      template,
      deps.lookups.codeById(str(file.subtype_id)),
    ),
  };
}
export async function saveStage(
  deps: ServiceDeps,
  input: StageInput,
): Promise<EngineRow> {
  const { db } = deps;
  return db.transaction(async () => {
    await db.require('case_file', input.fileId);
    const existing = input.id
      ? await db.require('procedural_stage', input.id)
      : undefined;
    if (existing && existing.file_id !== input.fileId)
      fieldError('fileId', 'لا يمكن نقل مرحلة إلى ملف آخر.');
    if (
      input.referenceYear !== undefined &&
      input.referenceYear !== null &&
      (!Number.isInteger(input.referenceYear) ||
        input.referenceYear < 1900 ||
        input.referenceYear > 2200)
    )
      fieldError(
        'referenceYear',
        'سنة المرحلة يجب أن تكون بين 1900 و2200 إن كانت معلومة.',
      );
    if (input.typeCode === 'other' && !input.customType?.trim())
      fieldError('customType', 'اكتب وصف المرحلة اليدوية.');
    for (const k of [
      'startedOn',
      'submittedOn',
      'notifiedOn',
      'attendedOn',
      'decisionOn',
      'completedOn',
      'followUpOn',
    ] as const)
      assertDate(input[k], k);
    const authority = input.authorityId
      ? await db.require('court', input.authorityId)
      : null;
    const patch: Record<string, unknown> = {
      type_id: await codeId(deps, 'stage_type', input.typeCode),
      custom_type: input.customType?.trim() || null,
      authority_id: input.authorityId || null,
      reference_number: input.referenceNumber?.trim() || null,
      reference_year: input.referenceYear ?? null,
      started_on: input.startedOn || null,
      submitted_on: input.submittedOn || null,
      notified_on: input.notifiedOn || null,
      attended_on: input.attendedOn || null,
      decision_on: input.decisionOn || null,
      completed_on: input.completedOn || null,
      follow_up_on: input.followUpOn || null,
      status_id: await codeId(
        deps,
        'stage_status',
        input.statusCode ?? 'ongoing',
      ),
      outcome: input.outcome?.trim() || null,
      decision: input.decision?.trim() || null,
      closing_reason: input.closingReason?.trim() || null,
      previous_stage_id: input.previousStageId || null,
      source_document_id: input.sourceDocumentId || null,
      data_source: input.dataSource?.trim() || null,
      notes: input.notes?.trim() || null,
      case_id: input.caseId || null,
    };
    if (!existing || existing.authority_id !== patch.authority_id)
      patch.authority_name_snapshot = authority?.name ?? null;
    const row = existing
      ? await db.update('procedural_stage', str(existing.id), patch)
      : await db.insert('procedural_stage', {
          file_id: input.fileId,
          authority_name_snapshot: authority?.name ?? null,
          ...patch,
        });
    if (input.sourceDocumentId) {
      const links = (
        await db.query('document_link', {
          filters: [
            { column: 'stage_id', op: 'eq', value: str(row.id) },
            { column: 'document_id', op: 'eq', value: input.sourceDocumentId },
          ],
          limit: 1,
        })
      ).rows;
      if (!links.length) {
        const link = await db.linkDocument(input.sourceDocumentId, {
          kind: 'file',
          id: input.fileId,
        });
        await db.update('document_link', str(link.id), { stage_id: row.id });
      }
    }
    deps.cache.invalidate();
    return row;
  });
}
export async function saveIntake(
  deps: ServiceDeps,
  input: IntakeInput,
): Promise<{ file: EngineRow; legalCase: EngineRow | null }> {
  const { db } = deps;
  return db.transaction(async () => {
    if (!input.title?.trim())
      fieldError('title', 'موضوع / عنوان ملف النزاع مطلوب.');
    if (!input.caseTypeCode) fieldError('caseTypeCode', 'اختر نوع القضية.');
    if (
      input.caseYear !== undefined &&
      (!Number.isInteger(input.caseYear) ||
        input.caseYear < 1900 ||
        input.caseYear > 2200)
    )
      fieldError('caseYear', 'سنة الدعوى يجب أن تكون بين 1900 و2200.');
    if (input.caseNumber?.trim() && !input.caseYear)
      fieldError('caseYear', 'أدخل السنة المثبتة بالأوراق مع رقم القضية.');
    if (input.caseId && !input.caseNumber?.trim())
      fieldError(
        'caseNumber',
        'لا يجوز محو رقم دعوى مقيدة. افتح ملفًا قبل القيد بدل رقم وهمي.',
      );
    if (input.circuitId) {
      const circuit = await db.require('court_circuit', input.circuitId);
      if (circuit.court_id !== input.courtId)
        fieldError('circuitId', 'الدائرة لا تتبع المحكمة المختارة.');
    }
    if (
      input.claimAmountMinor !== undefined &&
      (!Number.isSafeInteger(input.claimAmountMinor) ||
        input.claimAmountMinor < 0)
    )
      fieldError(
        'claimAmount',
        'قيمة المطالبة يجب أن تكون مبلغًا موجبًا صالحًا.',
      );
    for (const k of [
      'receivedOn',
      'disputeStartedOn',
      'lastActionOn',
      'followUpOn',
      'registrationDate',
    ] as const)
      assertDate(input[k], k);
    const typeId = await codeId(deps, 'case_type', input.caseTypeCode);
    let file = input.fileId
      ? await db.require('case_file', input.fileId)
      : null;
    const changedType = !!file?.case_type_id && file.case_type_id !== typeId;
    if (changedType && !input.confirmTypeChange)
      fieldError(
        'caseTypeCode',
        'تغيير النوع لا يمحو القيم السابقة. أكد التغيير صراحةً بعد مراجعة التصنيف.',
      );
    const template = await templateFor(
      deps,
      input.caseTypeCode,
      file ?? undefined,
    );
    if (!template.active && !file)
      fieldError('caseTypeCode', 'القالب غير مفعل لإنشاء ملفات جديدة.');
    const snapshots = parseObject<Record<string, CaseTemplate>>(
      file?.template_snapshot_json,
      {},
    );
    snapshots[input.caseTypeCode] ??= template;
    const specialized = parseObject<SpecializedValues>(
      file?.specialized_json,
      {},
    );
    if (changedType && file) {
      const old = deps.lookups.codeById(str(file.case_type_id));
      specialized[old] = {
        ...(specialized[old] ?? {}),
        _subtype_id: str(file.subtype_id),
        _nature_id: str(file.nature_id),
      };
    }
    for (const [key, values] of Object.entries(input.specialized ?? {}))
      specialized[key] = { ...(specialized[key] ?? {}), ...values };
    const subtypeId =
      input.subtypeId !== undefined
        ? input.subtypeId
        : changedType
          ? specialized[input.caseTypeCode]?._subtype_id || null
          : (file?.subtype_id ?? null);
    const natureId =
      input.natureId !== undefined
        ? input.natureId
        : changedType
          ? specialized[input.caseTypeCode]?._nature_id || null
          : (file?.nature_id ?? null);
    const subtype = subtypeId
      ? await db.require('lookup_item', str(subtypeId))
      : null;
    if (subtype && subtype.parent_id !== typeId)
      fieldError('subtypeId', 'التصنيف الفرعي لا يتبع النوع المختار.');
    if (natureId) {
      const nature = await db.require('lookup_item', str(natureId));
      if (nature.parent_id !== subtypeId)
        fieldError('natureId', 'موضوع التصنيف لا يتبع التصنيف الفرعي.');
    }
    validateSpecialized(template, specialized, str(subtype?.code));
    if (!file)
      file = await db.createFile({
        title: input.title.trim(),
        ...(input.receivedOn ? { openedOn: input.receivedOn } : {}),
      });
    const fid = str(file.id);
    const patch: Record<string, unknown> = {
      title: input.title.trim(),
      case_type_id: typeId,
      subtype_id: subtypeId,
      nature_id: natureId,
      specialized_json: JSON.stringify(specialized),
      template_snapshot_json: JSON.stringify(snapshots),
      intake_enabled: 1,
    };
    const map = {
      subject: 'subject',
      facts: 'facts',
      requests: 'requests',
      officeCapacity: 'office_capacity',
      responsiblePartyId: 'responsible_party_id',
      receivedOn: 'opened_on',
      disputeStartedOn: 'dispute_started_on',
      lastActionOn: 'last_action_on',
      nextAction: 'next_action',
      followUpOn: 'follow_up_on',
      notes: 'internal_notes',
    } as const;
    for (const [key, column] of Object.entries(map)) {
      const value = input[key as keyof typeof map];
      if (value !== undefined)
        patch[column] =
          typeof value === 'string' ? value.trim() || null : value;
    }
    if (input.priorityCode)
      patch.priority_id = await codeId(deps, 'priority', input.priorityCode);
    file = await db.update('case_file', fid, patch);
    let legalCase: EngineRow | null = input.caseId
      ? await db.require('legal_case', input.caseId)
      : null;
    if (legalCase) {
      const links = (
        await db.query('case_file_case', {
          filters: [
            { column: 'file_id', op: 'eq', value: fid },
            { column: 'case_id', op: 'eq', value: input.caseId! },
          ],
          limit: 1,
        })
      ).rows;
      if (!links.length) fieldError('fileId', 'الملف لا يرتبط بهذه الدعوى.');
    }
    const isNewCase = !legalCase && !!input.caseNumber?.trim();
    if (isNewCase)
      legalCase = await db.createCase({
        caseNumber: input.caseNumber!.trim(),
        caseYear: input.caseYear!,
        caseTypeCode: input.caseTypeCode,
        fileIds: [fid],
        ...(input.courtId ? { courtId: input.courtId } : {}),
        ...(input.litigationDegreeCode
          ? { litigationDegreeCode: input.litigationDegreeCode }
          : {}),
        ...(input.subject ? { subject: input.subject } : {}),
      });
    if (legalCase) {
      const cp: Record<string, unknown> = {
        case_number: input.caseNumber!.trim(),
        case_year: input.caseYear!,
        case_type_id: typeId,
      };
      if (input.courtId !== undefined) cp.court_id = input.courtId || null;
      if (input.circuitId !== undefined)
        cp.circuit_id = input.circuitId || null;
      if (input.subject !== undefined) cp.subject = input.subject || null;
      if (input.officeCapacity !== undefined)
        cp.office_capacity = input.officeCapacity || null;
      if (input.litigationDegreeCode !== undefined)
        cp.litigation_degree_id = input.litigationDegreeCode
          ? await codeId(deps, 'litigation_degree', input.litigationDegreeCode)
          : null;
      if (input.statusCode)
        cp.status_id = await codeId(deps, 'case_status', input.statusCode);
      if (input.registrationDate !== undefined || isNewCase)
        cp.registration_date = input.registrationDate || null;
      if (input.claimAmountMinor !== undefined)
        cp.claim_amount_minor = input.claimAmountMinor;
      if (input.currencyCode) cp.currency_code = input.currencyCode;
      legalCase = await db.update('legal_case', str(legalCase.id), cp);
    }
    // Explicit per-scope edits preserve relationship IDs and all other degrees.
    for (const [i, p] of (input.parties ?? []).entries()) {
      const role = await codeId(deps, 'party_role', p.roleCode),
        caseId = legalCase?.id ?? null;
      const original = p.linkId
        ? await db.require('case_file_party', p.linkId)
        : null;
      if (
        original &&
        (original.file_id !== fid ||
          original.party_id !== p.partyId ||
          (original.case_id && original.case_id !== caseId))
      )
        fieldError('partyId', 'علاقة الطرف لا تخص الملف / الدرجة المحددة.');
      const existing = (
        await db.query('case_file_party', {
          filters: [
            { column: 'file_id', op: 'eq', value: fid },
            { column: 'party_id', op: 'eq', value: p.partyId },
            { column: 'role_id', op: 'eq', value: role },
          ],
          limit: 500,
        })
      ).rows;
      const match = existing.find((r) => (r.case_id ?? null) === caseId);
      const patch: Record<string, unknown> = {
        role_id: role,
        ...(p.isClient !== undefined
          ? { is_office_client: p.isClient ? 1 : 0 }
          : {}),
        ...(p.sideCode !== undefined
          ? {
              side_id: p.sideCode
                ? await codeId(deps, 'party_side', p.sideCode)
                : null,
            }
          : {}),
      };
      if (original && (original.case_id ?? null) === caseId) {
        if (match && match.id !== original.id)
          fieldError(
            'roleCode',
            'توجد علاقة محفوظة للطرف نفسه بهذه الصفة في هذه الدرجة.',
          );
        await db.update('case_file_party', str(original.id), patch);
        continue;
      }
      if (match) {
        await db.update('case_file_party', str(match.id), patch);
        continue;
      }
      await db.insert('case_file_party', {
        file_id: fid,
        case_id: caseId,
        party_id: p.partyId,
        role_id: role,
        side_id: p.sideCode
          ? await codeId(deps, 'party_side', p.sideCode)
          : null,
        ordinal: (i + 1) * 10,
        is_primary: i === 0 ? 1 : 0,
        is_office_client: (p.isClient ?? p.roleCode === 'client') ? 1 : 0,
        start_date: null,
        end_date: null,
        notes: null,
      });
    }
    let termIds = input.termIds ? [...input.termIds] : undefined;
    if (input.keywords) {
      termIds ??= [];
      for (const keyword of input.keywords) {
        if (!keyword.trim()) continue;
        const term = await addTerm(deps, {
          name: keyword.trim(),
          kind: 'keyword',
        });
        termIds.push(str(term.id));
      }
    }
    if (termIds) {
      const old = (
        await relatedRows(db, 'case_term', {
          filters: [
            { column: 'file_id', op: 'eq', value: fid },
            { column: 'case_id', op: 'isNull' },
          ],
        })
      ).rows;
      for (const link of old)
        if (!termIds.includes(str(link.term_id)))
          await db.softDelete('case_term', str(link.id));
      for (const term of new Set(termIds)) {
        const t = await db.require('lookup_item', term);
        if (t.list_id !== deps.lookups.list('legal_subject')?.id)
          fieldError('termIds', 'اختر مصطلحًا من قاموس الموضوعات.');
        if (!old.some((l) => l.term_id === term))
          await db.insert('case_term', {
            file_id: fid,
            case_id: null,
            term_id: term,
          });
      }
    }
    if (input.initialStage)
      await saveStage(deps, { ...input.initialStage, fileId: fid });
    if (isNewCase && legalCase)
      await saveStage(deps, {
        fileId: fid,
        caseId: str(legalCase.id),
        typeCode: 'court',
        referenceNumber: input.caseNumber!,
        referenceYear: input.caseYear!,
        authorityId: input.courtId || null,
        startedOn: input.registrationDate || null,
        ...(input.sourceStageId
          ? { previousStageId: input.sourceStageId }
          : {}),
      });
    if (legalCase && input.relatedCaseId) {
      const rel = await codeId(
        deps,
        'case_relation_type',
        input.relationCode ?? 'related',
      );
      await db.insert('legal_case_link', {
        source_case_id: legalCase.id,
        target_case_id: input.relatedCaseId,
        relation_type_id: rel,
        notes: 'ارتباط اختاره المستخدم؛ لا يثبت إتاحة طريق الطعن قانونًا',
      });
    }
    for (const id of input.documentIds ?? [])
      await db.linkDocument(id, {
        kind: legalCase ? 'case' : 'file',
        id: str(legalCase?.id ?? fid),
      });
    deps.cache.invalidate();
    return { file, legalCase };
  });
}
export async function saveTemplate(
  deps: ServiceDeps,
  template: CaseTemplate,
): Promise<void> {
  assertTemplate(template);
  const key = `cases.template.${template.typeCode}`;
  await deps.db.transaction(async () => {
    const row = (
      await deps.db.query('office_setting', {
        filters: [{ column: 'key', op: 'eq', value: key }],
        limit: 1,
      })
    ).rows[0];
    if (row) {
      const old = parseObject<CaseTemplate | null>(row.value, null);
      if (old && template.version <= old.version)
        fieldError(
          'template',
          'ارفع إصدار القالب عند تعديله؛ الملفات القديمة تستخدم لقطتها المحفوظة.',
        );
      await deps.db.update('office_setting', str(row.id), {
        value: JSON.stringify(template),
      });
    } else
      await deps.db.insert('office_setting', {
        key,
        value: JSON.stringify(template),
        value_type: 'json',
        description: 'قالب إدخال المكتب',
      });
  });
}
export async function addTerm(
  deps: ServiceDeps,
  input: {
    name: string;
    aliases?: readonly string[];
    parentId?: string;
    kind?: string;
    relatedIds?: readonly string[];
    notes?: string;
  },
): Promise<EngineRow> {
  if (!input.name.trim()) fieldError('termName', 'اسم المصطلح مطلوب.');
  const list = deps.lookups.list('legal_subject');
  if (!list) fieldError('termName', 'قاموس الموضوعات غير متاح.');
  // Reference vocabulary is intentionally small; paged reads, never the case/party tables.
  let offset = 0;
  for (;;) {
    const page = await deps.db.query('lookup_item', {
      filters: [{ column: 'list_id', op: 'eq', value: list.id }],
      offset,
      limit: 500,
    });
    const match = page.rows.find(
      (t) =>
        t.is_active === 1 &&
        normalizeArabic(str(t.name_ar)) === normalizeArabic(input.name),
    );
    if (match) return match;
    offset += page.rows.length;
    if (offset >= page.total || !page.rows.length) break;
  }
  if (input.parentId) {
    const p = await deps.db.require('lookup_item', input.parentId);
    if (p.list_id !== list.id)
      fieldError('parentId', 'الموضوع الأب يجب أن يكون من القاموس نفسه.');
  }
  for (const id of input.relatedIds ?? [])
    await deps.db.require('lookup_item', id);
  return deps.db.insert('lookup_item', {
    list_id: list.id,
    code: `term_${newId().replace(/-/g, '')}`,
    name_ar: input.name.trim(),
    name_en: null,
    description: JSON.stringify({
      aliases: input.aliases ?? [],
      kind: input.kind ?? 'subject',
      related: input.relatedIds ?? [],
      editorialNotes: input.notes ?? '',
    }),
    sort_order: 1000,
    parent_id: input.parentId || null,
    is_active: 1,
    is_system: 0,
  });
}
export async function mergeTerms(
  deps: ServiceDeps,
  sourceId: string,
  targetId: string,
): Promise<void> {
  if (sourceId === targetId) fieldError('targetId', 'اختر مصطلحًا آخر للدمج.');
  const { db } = deps;
  await db.transaction(async () => {
    const source = await db.require('lookup_item', sourceId),
      target = await db.require('lookup_item', targetId);
    if (
      source.list_id !== deps.lookups.list('legal_subject')?.id ||
      source.list_id !== target.list_id ||
      target.is_active !== 1
    )
      fieldError(
        'targetId',
        'الدمج متاح لمصطلحين من قاموس الموضوعات وهدف مفعل.',
      );
    for (;;) {
      const links = (
        await db.query('case_term', {
          filters: [{ column: 'term_id', op: 'eq', value: sourceId }],
          limit: 500,
        })
      ).rows;
      if (!links.length) break;
      for (const link of links) {
        const siblings = (
          await db.query('case_term', {
            filters: [
              { column: 'file_id', op: 'eq', value: str(link.file_id) },
              { column: 'term_id', op: 'eq', value: targetId },
            ],
            limit: 500,
          })
        ).rows;
        if (siblings.some((s) => s.case_id === link.case_id))
          await db.softDelete('case_term', str(link.id));
        else await db.update('case_term', str(link.id), { term_id: targetId });
      }
    }
    let parentId = str(target.parent_id);
    const seen = new Set<string>([targetId]);
    while (parentId) {
      if (parentId === sourceId)
        fieldError(
          'targetId',
          'لا يمكن دمج موضوع أب في أحد فروعه. اختر هدفًا خارج الفرع.',
        );
      if (seen.has(parentId))
        fieldError('targetId', 'القاموس يحتوي دورة تحتاج تصحيحًا.');
      seen.add(parentId);
      parentId = str((await db.require('lookup_item', parentId)).parent_id);
    }
    for (;;) {
      const children = (
        await db.query('lookup_item', {
          filters: [{ column: 'parent_id', op: 'eq', value: sourceId }],
          limit: 500,
        })
      ).rows;
      if (!children.length) break;
      for (const child of children)
        await db.update('lookup_item', str(child.id), { parent_id: targetId });
    }
    const a = parseObject<{ aliases?: string[] }>(source.description, {}),
      b = parseObject<{ aliases?: string[] }>(target.description, {});
    await db.update('lookup_item', targetId, {
      description: JSON.stringify({
        ...b,
        aliases: [
          ...new Set([
            ...(b.aliases ?? []),
            str(source.name_ar),
            ...(a.aliases ?? []),
          ]),
        ],
      }),
    });
    await db.update('lookup_item', sourceId, {
      is_active: 0,
      description: JSON.stringify({ ...a, mergedInto: targetId }),
    });
  });
  deps.cache.invalidate();
}
