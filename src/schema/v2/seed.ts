/** Frozen migration-2 data, shared byte-for-byte by both engines. */
import { uuidv5 } from '../../util/uuid.ts';
import type { EngineRow } from '../../portable/store.ts';
import { CASE_TEMPLATE_SEED } from './template-seed.ts';
import { CASE_TYPE_ADDITIONS, CLASSIFICATION_SEED } from './reference-seed.ts';
export const listId = (code: string): string => uuidv5(`lookup_list:${code}`);
export const itemId = (list: string, code: string): string =>
  uuidv5(`lookup_item:${list}:${code}`);
export const STAGE_TYPES = [
  ['settlement', 'طلب تسوية'],
  ['family_settlement', 'مكتب تسوية المنازعات الأسرية'],
  ['labor_office', 'مكتب العمل'],
  ['administrative_complaint', 'شكوى إدارية'],
  ['grievance', 'تظلم إداري'],
  ['committee', 'لجنة تظلمات أو فنية'],
  ['dispute_committee', 'لجنة فض منازعات'],
  ['expert_committee', 'لجنة خبرة أو تقدير'],
  ['police_report', 'محضر شرطة'],
  ['prosecution', 'نيابة أو تحقيق'],
  ['notice', 'إنذار أو مطالبة رسمية'],
  ['mediation', 'وساطة أو تفاوض'],
  ['arbitration', 'تحكيم'],
  ['interim', 'طلب أو أمر وقتي'],
  ['court', 'دعوى قضائية'],
  ['appeal', 'استئناف مسجل'],
  ['administrative_appeal', 'طعن إداري مسجل'],
  ['supreme_administrative', 'طعن أمام الإدارية العليا مسجل'],
  ['cassation', 'نقض مسجل'],
  ['opposition', 'معارضة مسجلة'],
  ['retrial', 'التماس مسجل'],
  ['execution', 'تنفيذ'],
  ['execution_dispute', 'منازعة أو إشكال تنفيذ'],
  ['other', 'مرحلة أخرى يحددها المستخدم'],
] as const;
export const STAGE_STATUSES = [
  ['not_started', 'لم تبدأ'],
  ['ongoing', 'جارية'],
  ['waiting', 'في انتظار إجراء'],
  ['ended', 'انتهت'],
  ['referred', 'أحيلت إلى جهة أخرى'],
  ['closed', 'أغلقت'],
  ['other', 'أخرى'],
] as const;
const LISTS = [
  ['case_classification', 'تصنيف القضايا الهرمي'],
  ['legal_subject', 'قاموس الموضوعات والكلمات'],
  ['stage_type', 'نوع المرحلة الإجرائية'],
  ['stage_status', 'حالة المرحلة الإجرائية'],
] as const;
const TERMS = [
  ['compensation', 'تعويض', null, ['مسؤولية مدنية', 'مسئولية مدنية']],
  ['tort', 'فعل ضار', 'compensation', ['مسؤولية تقصيرية']],
  ['contract', 'عقد', null, ['تعاقد']],
  ['rescission', 'فسخ عقد', 'contract', ['إخلال بالتزام']],
  ['maintenance', 'نفقة', null, []],
  ['spouse_maintenance', 'نفقة زوجية', 'maintenance', []],
  ['child_maintenance', 'نفقة صغار', 'maintenance', ['نفقة أطفال']],
  ['custody', 'حضانة', null, ['ضم صغير']],
  ['visitation', 'تنظيم رؤية', null, ['رؤية']],
  ['labor', 'عمالي', null, []],
  ['wages', 'أجر متأخر', 'labor', ['أجور متأخرة', 'مستحقات عمل']],
  ['termination', 'تعويض عن إنهاء علاقة العمل', 'labor', ['فصل من العمل']],
  ['administrative', 'إداري', null, []],
  ['annulment', 'إلغاء قرار إداري', 'administrative', ['طعن على قرار']],
  ['criminal', 'اتهام مثبت بالأوراق', null, []],
] as const;
export function caseSystemSeeds(now: string): Record<string, EngineRow[]> {
  const origin = uuidv5('device:system');
  const header = {
    created_at: now,
    updated_at: now,
    deleted_at: null,
    origin_device_id: origin,
    revision: 1,
    sync_status: 'local',
    last_synced_at: null,
  };
  const lists: EngineRow[] = LISTS.map(([code, name]) => ({
    id: listId(code),
    code,
    name_ar: name,
    name_en: null,
    description: 'قاموس مكتب قابل للتهيئة — ليس قاعدة قانونية',
    is_system: 1,
    is_extensible: 1,
    ...header,
  }));
  const items: EngineRow[] = [];
  const add = (
    list: string,
    code: string,
    name: string,
    parent: string | null = null,
    description: string | null = null,
    sort = 0,
  ): void => {
    items.push({
      id: itemId(list, code),
      list_id: listId(list),
      code,
      name_ar: name,
      name_en: null,
      description,
      sort_order: sort,
      parent_id: parent,
      is_active: 1,
      is_system: 1,
      ...header,
    });
  };
  CASE_TYPE_ADDITIONS.forEach(([c, n], i) =>
    add('case_type', c, n, null, null, 200 + i * 10),
  );
  [
    ['military', 'عسكري'],
    ['social_insurance', 'تأمينات اجتماعية'],
    ['interim', 'طلبات وقتية'],
  ].forEach(([c, n]) => add('practice_area', c!, n!));
  CLASSIFICATION_SEED.forEach((s, i) =>
    add(
      'case_classification',
      s.code,
      s.label,
      itemId(s.parentList, s.parentCode),
      null,
      i * 10,
    ),
  );
  STAGE_TYPES.forEach(([c, n], i) =>
    add('stage_type', c, n, null, null, i * 10),
  );
  STAGE_STATUSES.forEach(([c, n], i) =>
    add('stage_status', c, n, null, null, i * 10),
  );
  TERMS.forEach(([c, n, p, a], i) =>
    add(
      'legal_subject',
      c,
      n,
      p ? itemId('legal_subject', p) : null,
      JSON.stringify({
        aliases: a,
        kind: 'subject',
        related: [],
        editorialNotes: '',
      }),
      i * 10,
    ),
  );
  [
    ['settlement_office', 'مكتب تسوية'],
    ['labor_office', 'مكتب عمل'],
    ['police', 'قسم أو مركز شرطة'],
    ['committee', 'لجنة'],
    ['administrative_agency', 'جهة إدارية'],
    ['arbitral_tribunal', 'هيئة تحكيم'],
  ].forEach(([c, n]) => add('court_kind', c!, n!));
  [
    ['civil_claimant', 'مدعٍ بالحق المدني'],
    ['applicant', 'طالب'],
    ['requested_against', 'مطلوب ضده'],
    ['worker', 'عامل'],
    ['employer', 'صاحب عمل'],
    ['potential_opponent', 'خصم محتمل'],
  ].forEach(([c, n]) => add('party_role', c!, n!));
  [
    ['subsidiary_appeal_of', 'استئناف فرعي عن'],
    ['opposition_of', 'معارضة عن'],
    ['grievance_of', 'تظلم عن'],
    ['retrial_of', 'التماس عن'],
    ['independent_request', 'طلب مستقل مرتبط'],
    ['execution_dispute_of', 'منازعة تنفيذ عن'],
  ].forEach(([c, n]) => add('case_relation_type', c!, n!));
  const settings = Object.entries(CASE_TEMPLATE_SEED).map(
    ([type, template]) => ({
      id: uuidv5(`office_setting:cases.template.${type}`),
      key: `cases.template.${type}`,
      value: JSON.stringify(template),
      value_type: 'json',
      description: 'قالب إدخال قابل للتعديل؛ ليس قاعدة قانونية',
      ...header,
    }),
  );
  return { lookup_list: lists, lookup_item: items, office_setting: settings };
}
