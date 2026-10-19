import { ValidationError } from '../errors.ts';
import type {
  CaseTemplate,
  CompletionIssue,
  SpecializedValues,
} from './types.ts';
import type { EngineRow } from '../portable/store.ts';
export function fieldError(field: string, message: string): never {
  throw new ValidationError(message, { field, messageAr: message });
}
export function assertDate(value: unknown, field: string): void {
  if (value === null || value === undefined || value === '') return;
  const date = new Date(`${String(value)}T00:00:00.000Z`);
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString() !== `${value}T00:00:00.000Z`
  )
    fieldError(field, 'أدخل تاريخًا صحيحًا بصيغة يوم / شهر / سنة.');
}
export function parseObject<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as T)
      : fallback;
  } catch {
    return fallback;
  }
}
export function assertTemplate(template: CaseTemplate): void {
  if (
    !template ||
    typeof template.active !== 'boolean' ||
    !Number.isInteger(template.version) ||
    template.version < 1 ||
    !/^[a-z][a-z0-9_]*$/.test(template.typeCode) ||
    !template.title?.trim() ||
    !Array.isArray(template.groups) ||
    !Array.isArray(template.possibleStages) ||
    !Array.isArray(template.possibleRelations) ||
    !Array.isArray(template.suggestedAuthorities) ||
    !Array.isArray(template.completeness?.recommended)
  )
    fieldError('template', 'تعريف القالب غير صالح.');
  if (
    ['__proto__', 'constructor', 'prototype'].includes(template.typeCode) ||
    [
      ...template.possibleStages,
      ...template.possibleRelations,
      ...template.suggestedAuthorities,
      ...template.completeness.recommended,
    ].some((v) => typeof v !== 'string')
  )
    fieldError('template', 'قوائم القالب تحتاج مفاتيح نصية آمنة.');
  const keys = new Set<string>();
  const groups = new Set<string>();
  for (const group of template.groups) {
    if (
      !group ||
      !group.label?.trim() ||
      !/^[a-z][a-z0-9_]*$/.test(group.key) ||
      groups.has(group.key) ||
      ['constructor', 'prototype'].includes(group.key) ||
      (group.classificationCodes !== undefined &&
        !Array.isArray(group.classificationCodes)) ||
      !Array.isArray(group.fields)
    )
      fieldError('template', 'مجموعات القالب تحتاج مفاتيح ثابتة غير مكررة.');
    groups.add(group.key);
    for (const f of group.fields) {
      if (
        !f ||
        !f.label?.trim() ||
        !/^[a-z][a-z0-9_]*$/.test(f.key) ||
        keys.has(f.key) ||
        ['constructor', 'prototype'].includes(f.key) ||
        !['text', 'textarea', 'date', 'money', 'select', 'number'].includes(
          f.type,
        ) ||
        typeof f.required !== 'boolean'
      )
        fieldError(
          'template',
          'مفاتيح الحقول وأنواعها يجب أن تكون صحيحة وغير مكررة.',
        );
      keys.add(f.key);
      if (
        f.type === 'select' &&
        (!Array.isArray(f.options) ||
          f.options.some(
            (o: { value: string; label: string }) =>
              !o || typeof o.value !== 'string' || !o.label?.trim(),
          ))
      )
        fieldError('template', 'حقل الاختيار يحتاج خيارات.');
    }
  }
  for (const group of template.groups) {
    if (group.when && !keys.has(group.when.field))
      fieldError('template', 'شرط ظهور يشير لحقل غير موجود.');
    for (const f of group.fields)
      if (f.when && !keys.has(f.when.field))
        fieldError('template', 'شرط ظهور غير معروف.');
  }
}
export function validateSpecialized(
  template: CaseTemplate,
  values: SpecializedValues,
  subtypeCode: string,
): void {
  const data = values[template.typeCode] ?? {};
  for (const g of template.groups) {
    const relevant =
      !g.classificationCodes?.length ||
      g.classificationCodes.includes(subtypeCode);
    for (const f of g.fields) {
      const visible =
        relevant &&
        (!g.when ||
          data[g.when.field] === g.when.equals ||
          f.key === g.controller) &&
        (!f.when || data[f.when.field] === f.when.equals);
      if (!visible) continue;
      const v = data[f.key];
      if (f.required && !v?.trim())
        fieldError(
          `special_${f.key}`,
          `«${f.label}» مطلوب وفق قالب المكتب الحالي.`,
        );
      if (v && f.type === 'date') assertDate(v, `special_${f.key}`);
      if (
        v &&
        (f.type === 'money' || f.type === 'number') &&
        (!/^\d+(\.\d{1,2})?$/.test(v) || !Number.isFinite(Number(v)))
      )
        fieldError(`special_${f.key}`, 'أدخل رقمًا موجبًا صحيحًا.');
      if (v && v.length > 20000)
        fieldError(`special_${f.key}`, 'النص أطول من الحد المسموح.');
    }
  }
}
export function completionIssues(
  profile: EngineRow | null,
  legalCase: EngineRow | null,
  parties: readonly EngineRow[],
  stages: readonly EngineRow[],
  termCount: number,
  template?: CaseTemplate,
  subtypeCode = '',
): CompletionIssue[] {
  const issues: CompletionIssue[] = [];
  const add = (
    field: string,
    group: string,
    message: string,
    kind: CompletionIssue['kind'],
  ): void => {
    issues.push({ field, group, message, kind });
  };
  if (!profile?.subject && !legalCase?.subject)
    add('subject', 'basic', 'موضوع النزاع غير مسجل', 'basic');
  if (!profile?.requests)
    add('requests', 'basic', 'الطلبات الأساسية تحتاج استكمالًا', 'basic');
  if (!parties.length)
    add('partyId', 'parties', 'لم تسجل الأطراف بعد', 'parties');
  else if (!parties.some((p) => p.is_office_client === 1))
    add('partyId', 'parties', 'لم يحدد الطرف الذي يمثله المكتب', 'parties');
  if (legalCase && !legalCase.court_id)
    add('courtId', 'registration', 'جهة نظر الدعوى غير مسجلة', 'procedural');
  if (legalCase && !legalCase.registration_date)
    add(
      'registrationDate',
      'registration',
      'تاريخ القيد الوارد بالأوراق غير مسجل',
      'procedural',
    );
  if (!stages.length)
    add(
      'typeCode',
      'stages',
      'لا توجد مرحلة مسجلة لتحديد المسار الفعلي',
      'procedural',
    );
  for (const s of stages) {
    if (!s.authority_id && !s.custom_type)
      add(
        'authorityId',
        'stages',
        'توجد مرحلة دون جهة أو وصف يدوي',
        'procedural',
      );
    if (!s.reference_number && !s.data_source)
      add(
        'referenceNumber',
        'stages',
        'مرجع أو مصدر بيانات المرحلة يحتاج استكمالًا',
        'procedural',
      );
  }
  if (!profile?.subtype_id)
    add('subtypeId', 'classification', 'التصنيف الفرعي غير مسجل', 'indexing');
  if (!termCount)
    add('termIds', 'indexing', 'لم تربط موضوعات أو كلمات للفهرسة', 'indexing');
  if (template && profile) {
    const values = parseObject<SpecializedValues>(profile.specialized_json, {});
    const data = values[template.typeCode] ?? {};
    for (const group of template.groups) {
      const relevant =
        !group.classificationCodes?.length ||
        group.classificationCodes.includes(subtypeCode);
      for (const f of group.fields) {
        const visible =
          relevant &&
          (!group.when ||
            data[group.when.field] === group.when.equals ||
            f.key === group.controller) &&
          (!f.when || data[f.when.field] === f.when.equals);
        if (visible && f.required && !data[f.key]?.trim())
          add(
            `special_${f.key}`,
            group.key,
            `بيانات متخصصة: ${f.label}`,
            'specialized',
          );
      }
    }
  }

  return issues;
}
