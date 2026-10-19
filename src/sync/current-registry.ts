/** v1 registry stays frozen: migration 1 includes its seed rows in its checksum. */
import {
  SYNC_ENTITY_DEFINITIONS as V1,
  type SyncEntityDefinition,
} from './entity-registry.ts';
export type {
  SyncEntityDefinition,
  SyncPolicy,
  DependentRule,
  DependentPolicy,
} from './entity-registry.ts';
const extra: Record<string, string[]> = {
  case_file: [
    'case_type_id',
    'subtype_id',
    'nature_id',
    'subject',
    'facts',
    'requests',
    'office_capacity',
    'dispute_started_on',
    'last_action_on',
    'next_action',
    'follow_up_on',
    'internal_notes',
    'specialized_json',
    'template_snapshot_json',
    'intake_enabled',
  ],
  legal_case: ['office_capacity', 'procedural_result'],
  case_file_party: ['is_office_client'],
  court: ['aliases_json', 'level_id'],
  document_link: ['stage_id'],
  task: ['stage_id'],
  appointment: ['stage_id'],
  judgment_appeal: ['appeal_case_id', 'authority_id'],
};
const additions: SyncEntityDefinition[] = [
  {
    code: 'procedural_stage',
    table: 'procedural_stage',
    descriptionAr: 'مرحلة إجرائية فعلية مستقلة',
    policy: 'field_merge',
    primaryKeyColumn: 'id',
    mutableColumns: [
      'case_id',
      'type_id',
      'custom_type',
      'authority_id',
      'authority_name_snapshot',
      'reference_number',
      'reference_year',
      'started_on',
      'submitted_on',
      'notified_on',
      'attended_on',
      'decision_on',
      'completed_on',
      'follow_up_on',
      'status_id',
      'outcome',
      'decision',
      'closing_reason',
      'previous_stage_id',
      'source_document_id',
      'data_source',
      'notes',
    ],
    sensitiveColumns: ['notes', 'data_source', 'decision'],
    softDelete: true,
    dependents: [
      {
        table: 'procedural_stage',
        column: 'previous_stage_id',
        policy: 'block',
        labelAr: 'مراحل تالية',
      },
      {
        table: 'document_link',
        column: 'stage_id',
        policy: 'block',
        labelAr: 'مستندات مرحلة',
      },
      {
        table: 'task',
        column: 'stage_id',
        policy: 'block',
        labelAr: 'أعمال مرحلة',
      },
      {
        table: 'appointment',
        column: 'stage_id',
        policy: 'block',
        labelAr: 'مواعيد مرحلة',
      },
    ],
  },
  {
    code: 'case_term',
    table: 'case_term',
    descriptionAr: 'فهرسة موضوعية لملف أو درجة',
    policy: 'relation_set',
    primaryKeyColumn: 'id',
    mutableColumns: ['term_id'],
    sensitiveColumns: [],
    softDelete: true,
    dependents: [],
  },
];
export const SYNC_ENTITY_DEFINITIONS: readonly SyncEntityDefinition[] = [
  ...V1.map((item) => {
    const dependents = [...item.dependents];
    if (item.code === 'case_file')
      dependents.push(
        {
          table: 'procedural_stage',
          column: 'file_id',
          policy: 'block',
          labelAr: 'مراحل إجرائية',
        },
        {
          table: 'case_term',
          column: 'file_id',
          policy: 'cascade',
          labelAr: 'فهرسة',
        },
      );
    if (item.code === 'legal_case')
      dependents.push(
        {
          table: 'procedural_stage',
          column: 'case_id',
          policy: 'block',
          labelAr: 'مراحل إجرائية',
        },
        {
          table: 'case_term',
          column: 'case_id',
          policy: 'cascade',
          labelAr: 'فهرسة الدرجة',
        },
        {
          table: 'judgment_appeal',
          column: 'appeal_case_id',
          policy: 'block',
          labelAr: 'طعون مرتبطة',
        },
      );
    if (item.code === 'court')
      dependents.push({
        table: 'procedural_stage',
        column: 'authority_id',
        policy: 'block',
        labelAr: 'مراحل إجرائية',
      });
    if (item.code === 'document')
      dependents.push({
        table: 'procedural_stage',
        column: 'source_document_id',
        policy: 'block',
        labelAr: 'مصدر مرحلة',
      });
    if (item.code === 'lookup_item')
      dependents.push({
        table: 'case_term',
        column: 'term_id',
        policy: 'block',
        labelAr: 'ارتباطات موضوع',
      });
    return {
      ...item,
      mutableColumns: [...item.mutableColumns, ...(extra[item.code] ?? [])],
      sensitiveColumns: [
        ...item.sensitiveColumns,
        ...(item.code === 'case_file'
          ? ['facts', 'internal_notes', 'specialized_json']
          : []),
      ],
      dependents,
    };
  }),
  ...additions,
];
const byCode = new Map(
  SYNC_ENTITY_DEFINITIONS.map((definition) => [definition.code, definition]),
);
export function getSyncEntity(code: string): SyncEntityDefinition {
  const item = byCode.get(code);
  if (!item) throw new Error(`Unknown sync entity type: ${code}`);
  return item;
}
export function tryGetSyncEntity(
  code: string,
): SyncEntityDefinition | undefined {
  return byCode.get(code);
}
export function syncEntityByTable(
  table: string,
): SyncEntityDefinition | undefined {
  return SYNC_ENTITY_DEFINITIONS.find((item) => item.table === table);
}
