/** One set of cross-row rules, executed synchronously by native repositories or asynchronously by the portable profile. */
import type { DatabaseAdapter } from '../db/adapter.ts';
import type { EngineRow, PortableTransaction } from '../portable/store.ts';
import { fieldError, assertDate } from './validation.ts';
const s = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v);
export const HIERARCHICAL_CASE_RELATIONS = new Set([
  'appeal_of',
  'cassation_of',
  'subsidiary_appeal_of',
  'opposition_of',
  'grievance_of',
  'retrial_of',
  'execution_of',
  'execution_dispute_of',
]);
type ReadRequest =
  | { table: string; id: string }
  | { table: string; values: Readonly<Record<string, string | number>> };
type ReadResult = EngineRow | EngineRow[] | undefined;
type Check<T = void> = Generator<ReadRequest, T, ReadResult>;
function* one(table: string, id: string): Check<EngineRow | undefined> {
  return (yield { table, id }) as EngineRow | undefined;
}
function* many(
  table: string,
  values: Readonly<Record<string, string | number>>,
): Check<EngineRow[]> {
  return (yield { table, values }) as EngineRow[];
}
function* check(table: string, row: EngineRow): Check {
  if (row.deleted_at !== null && row.deleted_at !== undefined) return;
  if (['case_file', 'procedural_stage', 'legal_case'].includes(table))
    for (const [key, value] of Object.entries(row))
      if ((key.endsWith('_on') || key === 'registration_date') && value)
        assertDate(value, key);
  if ((table === 'legal_case' || table === 'hearing') && row.circuit_id) {
    const circuit = yield* one('court_circuit', s(row.circuit_id));
    if (circuit?.court_id !== row.court_id)
      fieldError('circuitId', 'الدائرة لا تتبع المحكمة المختارة.');
  }
  if (table === 'court_circuit')
    for (const dependent of ['legal_case', 'hearing'])
      for (const item of yield* many(dependent, { circuit_id: s(row.id) }))
        if (item.deleted_at === null && item.court_id !== row.court_id)
          fieldError(
            'courtId',
            'لا يمكن نقل دائرة مرتبطة بقضايا أو جلسات إلى جهة أخرى.',
          );
  if ((table === 'lookup_item' || table === 'court') && row.parent_id) {
    const list =
      table === 'lookup_item'
        ? yield* one('lookup_list', s(row.list_id))
        : null;
    const seen = new Set([s(row.id)]);
    let id = s(row.parent_id);
    let classificationLevels = 0;
    while (id) {
      if (seen.has(id))
        fieldError('parentId', 'هذا الربط ينشئ دورة في الدليل أو التصنيف.');
      seen.add(id);
      const parent = yield* one(table, id);
      if (!parent || parent.deleted_at !== null)
        fieldError('parentId', 'القيمة الأب غير موجودة.');
      if (table === 'lookup_item') {
        const parentList = yield* one('lookup_list', s(parent.list_id));
        if (list?.code === 'case_classification') {
          if (parentList?.code === 'case_type') break;
          if (
            parentList?.code !== 'case_classification' ||
            ++classificationLevels > 1
          )
            fieldError(
              'parentId',
              'التصنيف يدعم نوعًا رئيسيًا ثم تصنيفًا فرعيًا ثم طبيعة النزاع.',
            );
        } else if (parent.list_id !== row.list_id)
          fieldError('parentId', 'القيمة الأب يجب أن تكون من القائمة نفسها.');
      }
      id = s(parent.parent_id);
    }
  }
  if (table === 'case_file') {
    const type = row.case_type_id
      ? yield* one('lookup_item', s(row.case_type_id))
      : null;
    if (row.subtype_id) {
      const subtype = yield* one('lookup_item', s(row.subtype_id));
      if (subtype?.parent_id !== type?.id)
        fieldError('subtypeId', 'التصنيف الفرعي لا يتبع نوع القضية المختار.');
    }
    if (row.nature_id) {
      const nature = yield* one('lookup_item', s(row.nature_id));
      if (nature?.parent_id !== row.subtype_id)
        fieldError('natureId', 'طبيعة النزاع لا تتبع التصنيف الفرعي.');
    }
  }
  if (
    ['case_file_party', 'case_term', 'procedural_stage'].includes(table) &&
    row.case_id
  ) {
    const links = yield* many('case_file_case', {
      case_id: s(row.case_id),
      file_id: s(row.file_id),
    });
    if (!links.some((l) => l.deleted_at === null))
      fieldError(
        table === 'case_file_party'
          ? 'partyId'
          : table === 'case_term'
            ? 'termIds'
            : 'caseId',
        'يجب ربط الدعوى بملف هذه العلاقة أو المرحلة أولًا.',
      );
  }
  if (table === 'document_link' && row.stage_id) {
    const stage = yield* one('procedural_stage', s(row.stage_id));
    if (!stage || stage.deleted_at !== null || stage.file_id !== row.file_id)
      fieldError('documentIds', 'مستند المرحلة يجب أن يرتبط بملفها نفسه.');
  }
  if ((table === 'task' || table === 'appointment') && row.stage_id) {
    const stage = yield* one('procedural_stage', s(row.stage_id));
    if (
      !stage ||
      stage.deleted_at !== null ||
      (row.file_id && stage.file_id !== row.file_id) ||
      (row.case_id && stage.case_id && stage.case_id !== row.case_id)
    )
      fieldError('stageId', 'مرحلة المتابعة لا تتبع الملف المختار.');
  }
  if (table === 'procedural_stage') {
    let id = s(row.previous_stage_id);
    const seen = new Set<string>([s(row.id)]);
    while (id) {
      if (seen.has(id))
        fieldError('previousStageId', 'هذا الربط ينشئ دورة في تسلسل المراحل.');
      seen.add(id);
      const parent = yield* one('procedural_stage', id);
      if (!parent || parent.deleted_at !== null)
        fieldError('previousStageId', 'المرحلة السابقة غير موجودة.');
      if (parent.file_id !== row.file_id)
        fieldError(
          'previousStageId',
          'المرحلة السابقة يجب أن تتبع ملف النزاع نفسه.',
        );
      id = s(parent.previous_stage_id);
    }
  }
  if (table === 'legal_case_link') {
    if (row.source_case_id === row.target_case_id)
      fieldError('relatedCaseId', 'لا يمكن ربط القضية بنفسها.');
    const type = yield* one('lookup_item', s(row.relation_type_id));
    if (!HIERARCHICAL_CASE_RELATIONS.has(s(type?.code))) return;
    const pending = [s(row.target_case_id)];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (id === row.source_case_id)
        fieldError('relatedCaseId', 'هذا الربط ينشئ دورة بين درجات القضايا.');
      if (visited.has(id)) continue;
      visited.add(id);
      for (const link of yield* many('legal_case_link', {
        source_case_id: id,
      })) {
        if (link.deleted_at !== null || link.id === row.id) continue;
        const kind = yield* one('lookup_item', s(link.relation_type_id));
        if (HIERARCHICAL_CASE_RELATIONS.has(s(kind?.code)))
          pending.push(s(link.target_case_id));
      }
    }
  }
}
export async function assertCaseIntegrity(
  tx: Pick<PortableTransaction, 'get' | 'getByColumns'>,
  table: string,
  row: EngineRow,
): Promise<void> {
  const iterator = check(table, row);
  let step = iterator.next();
  while (!step.done) {
    const r = step.value;
    const result =
      'id' in r
        ? await tx.get(r.table, r.id)
        : await tx.getByColumns(r.table, r.values);
    step = iterator.next(result);
  }
}
export function assertCaseIntegritySync(
  db: DatabaseAdapter,
  table: string,
  row: EngineRow,
): void {
  const iterator = check(table, row);
  let step = iterator.next();
  while (!step.done) {
    const r = step.value;
    const result =
      'id' in r
        ? db.get<EngineRow>(`SELECT * FROM "${r.table}" WHERE id=?`, [r.id])
        : db.query<EngineRow>(
            `SELECT * FROM "${r.table}" WHERE ${Object.keys(r.values)
              .map((c) => `"${c}"=?`)
              .join(' AND ')} AND deleted_at IS NULL`,
            Object.values(r.values),
          );
    step = iterator.next(result);
  }
}

/** Full-graph verification is reserved for explicit backup/health maintenance. */
export async function caseGraphErrors(
  tables: Readonly<Record<string, readonly EngineRow[]>>,
): Promise<string[]> {
  const ids = new Map(
    Object.entries(tables).map(([name, rows]) => [
      name,
      new Map(rows.map((row) => [s(row.id), row])),
    ]),
  );
  const indexes = new Map<string, Map<string, EngineRow[]>>();
  const errors: string[] = [];
  const reader = {
    get: async (table: string, key: string | readonly string[]) =>
      ids.get(table)?.get(typeof key === 'string' ? key : key.join('\u0000')),
    getByColumns: async (
      table: string,
      values: Readonly<Record<string, string | number>>,
    ) => {
      const columns = Object.keys(values).sort(),
        indexKey = `${table}:${columns.join(',')}`;
      let index = indexes.get(indexKey);
      if (!index) {
        index = new Map();
        for (const row of tables[table] ?? []) {
          const key = JSON.stringify(columns.map((c) => row[c]));
          const bucket = index.get(key) ?? [];
          bucket.push(row);
          index.set(key, bucket);
        }
        indexes.set(indexKey, index);
      }
      return index.get(JSON.stringify(columns.map((c) => values[c]))) ?? [];
    },
  };
  for (const table of [
    'lookup_item',
    'court',
    'court_circuit',
    'case_file',
    'legal_case',
    'hearing',
    'case_file_party',
    'case_term',
    'procedural_stage',
    'document_link',
    'task',
    'appointment',
    'legal_case_link',
  ])
    for (const row of tables[table] ?? []) {
      try {
        await assertCaseIntegrity(reader, table, row);
      } catch (error) {
        errors.push(`${table}:${s(row.id)}: ${(error as Error).message}`);
        if (errors.length >= 50) return errors;
      }
    }
  return errors;
}
