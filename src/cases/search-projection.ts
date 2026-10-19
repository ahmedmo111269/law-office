import { isSensitiveCaseField } from './template-privacy.ts';
/** Incremental extension of the EXISTING search_document projection. No network/FTS assumptions. */
import type { EngineRow, PortableTransaction } from '../portable/store.ts';
import type { CaseTemplate, SpecializedValues } from './types.ts';
import { scopedPartyLinks } from './party-scope.ts';
import { completionIssues, parseObject } from './validation.ts';
const neighbors = (
  tx: PortableTransaction,
  table: string,
  values: Readonly<Record<string, string | number>>,
): Promise<EngineRow[]> => tx.getByColumns(table, values, { activeOnly: true });
const active = (rows: EngineRow[]): EngineRow[] =>
  rows.filter((r) => r.deleted_at === null);
const text = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v);
export interface SearchParts {
  title: string;
  subtitle: string | null;
  body: string;
  facets?: EngineRow;
}
export async function primaryFile(
  tx: PortableTransaction,
  caseId: string,
): Promise<EngineRow | null> {
  const links = active(
    await neighbors(tx, 'case_file_case', { case_id: caseId }),
  ).sort(
    (a, b) =>
      Number(b.is_primary) - Number(a.is_primary) ||
      text(a.created_at).localeCompare(text(b.created_at)) ||
      text(a.id).localeCompare(text(b.id)),
  );
  for (const link of links) {
    const f = await tx.get('case_file', text(link.file_id));
    if (f?.deleted_at === null) return f;
  }
  return null;
}
export async function buildCaseProjection(
  tx: PortableTransaction,
  entityType: string,
  row: EngineRow,
): Promise<SearchParts> {
  const judicial = entityType === 'legal_case';
  const cid = judicial ? text(row.id) : '';
  const profile = judicial ? await primaryFile(tx, cid) : row;
  const fid = text(profile?.id);
  const fileLinks = fid
    ? active(await neighbors(tx, 'case_file_case', { file_id: fid }))
    : [];
  const parts: string[] = [
    text(row.case_number),
    text(row.case_year),
    text(row.subject),
    text(profile?.title),
    text(profile?.file_number),
    text(profile?.subject),
    text(profile?.requests),
    text(profile?.next_action),
  ];
  const caseType = judicial ? row.case_type_id : profile?.case_type_id;
  const caseTypeTerm = caseType
    ? await tx.get('lookup_item', text(caseType))
    : null;
  const subtypeTerm = profile?.subtype_id
    ? await tx.get('lookup_item', text(profile.subtype_id))
    : null;
  for (const id of [
    caseType,
    profile?.subtype_id,
    profile?.nature_id,
    row.litigation_degree_id,
    row.status_id,
  ])
    if (id) {
      const l = await tx.get('lookup_item', text(id));
      parts.push(text(l?.name_ar));
    }
  if (profile?.responsible_party_id) {
    const lawyer = await tx.get('party', text(profile.responsible_party_id));
    parts.push(text(lawyer?.display_name));
  }
  const court = row.court_id ? await tx.get('court', text(row.court_id)) : null;
  const circuit = row.circuit_id
    ? await tx.get('court_circuit', text(row.circuit_id))
    : null;
  parts.push(text(court?.name), text(court?.aliases_json), text(circuit?.name));
  const linkedFiles = judicial
    ? active(await neighbors(tx, 'case_file_case', { case_id: cid })).map((l) =>
        text(l.file_id),
      )
    : [fid].filter(Boolean);
  const allPartyLinks: EngineRow[] = [];
  for (const fileId of linkedFiles)
    allPartyLinks.push(
      ...(await neighbors(tx, 'case_file_party', { file_id: fileId })),
    );
  const partyLinks = scopedPartyLinks(
    allPartyLinks,
    judicial ? cid : undefined,
  );
  for (const link of partyLinks) {
    const p = await tx.get('party', text(link.party_id));
    if (!p || p.deleted_at !== null) continue;
    const role = await tx.get('lookup_item', text(link.role_id));
    parts.push(text(p.display_name), text(role?.name_ar));
    for (const alias of active(
      await neighbors(tx, 'party_alias', { party_id: text(p.id) }),
    ))
      parts.push(text(alias.alias));
  }
  const stages: EngineRow[] = [];
  for (const fileId of linkedFiles)
    stages.push(
      ...active(
        await neighbors(tx, 'procedural_stage', { file_id: fileId }),
      ).filter((s) => !judicial || !s.case_id || s.case_id === cid),
    );
  stages.sort(
    (a, b) =>
      text(a.started_on ?? a.created_at).localeCompare(
        text(b.started_on ?? b.created_at),
      ) ||
      text(a.created_at).localeCompare(text(b.created_at)) ||
      text(a.id).localeCompare(text(b.id)),
  );
  let hasPre = 0;
  for (const s of stages) {
    const type = await tx.get('lookup_item', text(s.type_id));
    const agency = s.authority_id
      ? await tx.get('court', text(s.authority_id))
      : null;
    parts.push(
      text(s.reference_number),
      text(s.reference_year),
      text(s.custom_type),
      text(type?.name_ar),
      text(s.authority_name_snapshot),
      text(agency?.name),
      text(agency?.aliases_json),
      text(s.outcome),
    );
    if (
      ![
        'court',
        'appeal',
        'administrative_appeal',
        'supreme_administrative',
        'cassation',
        'opposition',
        'execution',
        'execution_dispute',
        'retrial',
        'interim',
        'other',
      ].includes(text(type?.code))
    )
      hasPre = 1;
  }
  const termLinks: EngineRow[] = [];
  for (const fileId of linkedFiles)
    termLinks.push(
      ...active(await neighbors(tx, 'case_term', { file_id: fileId })).filter(
        (t) => !judicial || !t.case_id || t.case_id === cid,
      ),
    );
  for (const l of termLinks) {
    let id = text(l.term_id);
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const term = await tx.get('lookup_item', id);
      if (!term) break;
      parts.push(text(term.name_ar));
      const meta = parseObject<{ aliases?: string[] }>(term.description, {});
      parts.push(...(meta.aliases ?? []));
      id = text(term.parent_id);
    }
  }
  if (profile) {
    const values = parseObject<SpecializedValues>(profile.specialized_json, {});
    const snapshots = parseObject<Record<string, CaseTemplate>>(
      profile.template_snapshot_json,
      {},
    );
    for (const [type, data] of Object.entries(values)) {
      const template = snapshots[type];
      if (!template) continue;
      for (const group of template.groups)
        for (const f of group.fields)
          if (!isSensitiveCaseField(type, group, f))
            parts.push(text(data[f.key]));
    }
  }
  const hearings = judicial
    ? active(await neighbors(tx, 'hearing', { case_id: cid }))
    : [];
  const hearingList = (
    await neighbors(tx, 'lookup_list', { code: 'hearing_status' })
  )[0];
  const cancelled = hearingList
    ? (
        await neighbors(tx, 'lookup_item', {
          list_id: text(hearingList.id),
          code: 'cancelled',
        })
      )[0]?.id
    : null;
  const liveHearings = hearings.filter((h) => h.status_id !== cancelled);
  const latest =
    liveHearings
      .map((h) => text(h.scheduled_at))
      .sort()
      .at(-1) ?? null;
  const judgments = judicial
    ? active(await neighbors(tx, 'judgment', { case_id: cid }))
    : [];
  const related = judicial
    ? [
        ...active(
          await neighbors(tx, 'legal_case_link', { source_case_id: cid }),
        ),
        ...active(
          await neighbors(tx, 'legal_case_link', { target_case_id: cid }),
        ),
      ]
    : [];
  let appeal = 0;
  for (const l of related) {
    const other = await tx.get(
      'legal_case',
      text(l.source_case_id === cid ? l.target_case_id : l.source_case_id),
    );
    parts.push(text(other?.case_number), text(other?.case_year));
    const kind = await tx.get('lookup_item', text(l.relation_type_id));
    parts.push(text(kind?.name_ar));
    if (/appeal|cassation|opposition|retrial|grievance/.test(text(kind?.code)))
      appeal = 1;
  }
  for (const j of judgments) {
    parts.push(text(j.judgment_number), text(j.operative_part));
    for (const a of active(
      await neighbors(tx, 'judgment_appeal', { judgment_id: text(j.id) }),
    )) {
      parts.push(text(a.reference_no));
      appeal = 1;
    }
  }
  const docs = judicial
    ? active(await neighbors(tx, 'document_link', { case_id: cid }))
    : [];
  for (const fileId of linkedFiles)
    docs.push(
      ...active(
        await neighbors(tx, 'document_link', { file_id: fileId }),
      ).filter(
        (d) =>
          !judicial ||
          !d.stage_id ||
          stages.some((stage) => stage.id === d.stage_id),
      ),
    );
  for (const l of docs) {
    const d = await tx.get('document', text(l.document_id));
    if (d?.deleted_at === null) parts.push(text(d.title), text(d.doc_number));
  }
  const current = stages.at(-1);
  const currentStatus = current
    ? await tx.get('lookup_item', text(current.status_id))
    : null;
  const hasNext = current
    ? active(
        await neighbors(tx, 'procedural_stage', {
          previous_stage_id: text(current.id),
        }),
      ).length > 0
    : false;
  const actionDates = [
    profile?.last_action_on,
    ...stages.flatMap((s) => [
      s.started_on,
      s.submitted_on,
      s.notified_on,
      s.attended_on,
      s.decision_on,
      s.completed_on,
    ]),
    ...judgments.map((j) => j.issued_on),
  ]
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .sort();
  const missing = completionIssues(
    profile,
    judicial ? row : null,
    partyLinks,
    stages,
    termLinks.length,
    parseObject<Record<string, CaseTemplate>>(
      profile?.template_snapshot_json,
      {},
    )[text(caseTypeTerm?.code)],
    text(subtypeTerm?.code),
  );
  return {
    title: judicial
      ? `${text(row.case_number)} / ${text(row.case_year)}`
      : text(row.title),
    subtitle: judicial ? text(court?.name) : text(row.file_number),
    body: parts.filter(Boolean).join(' '),
    facets: {
      case_scope: judicial
        ? 'case'
        : profile?.intake_enabled === 1 && fileLinks.length === 0
          ? 'intake'
          : null,
      file_id: fid || null,
      case_type_id: caseType ?? null,
      subtype_id: profile?.subtype_id ?? null,
      nature_id: profile?.nature_id ?? null,
      court_id: row.court_id ?? null,
      circuit_id: row.circuit_id ?? null,
      degree_id: row.litigation_degree_id ?? null,
      case_year: row.case_year ?? null,
      case_number: row.case_number ?? null,
      status_id: row.status_id ?? null,
      responsible_party_id: profile?.responsible_party_id ?? null,
      priority_id: profile?.priority_id ?? null,
      stage_type_id: current?.type_id ?? null,
      stage_status_id: current?.status_id ?? null,
      registered_on: row.registration_date ?? null,
      judgment_on:
        judgments
          .map((j) => text(j.issued_on))
          .sort()
          .at(-1) ?? null,
      last_action_on: actionDates.at(-1) ?? null,
      follow_up_on: profile?.follow_up_on ?? current?.follow_up_on ?? null,
      latest_hearing_at: latest,
      has_hearing: hearings.length ? 1 : 0,
      has_pre_stage: hasPre,
      has_related: related.length || fileLinks.length > 1 ? 1 : 0,
      has_appeal: appeal,
      has_documents: docs.length ? 1 : 0,
      needs_next:
        current &&
        ['ended', 'referred'].includes(text(currentStatus?.code)) &&
        !hasNext &&
        !profile?.next_action
          ? 1
          : 0,
      missing_count: missing.length,
      archived_at: row.archived_at ?? null,
    },
  };
}
/** Which case/file projections depend on this mutation? Traverses only indexed neighbours. */
export async function affectedCaseRecords(
  tx: PortableTransaction,
  table: string,
  row: EngineRow,
  previous?: EngineRow,
): Promise<Array<{ type: string; id: string }>> {
  const keys = new Map<string, { type: string; id: string }>();
  const files = new Set<string>();
  const cases = new Set<string>();
  const addFile = (id: unknown): void => {
    if (id) files.add(String(id));
  };
  const addCase = (id: unknown): void => {
    if (id) cases.add(String(id));
  };
  for (const r of [row, ...(previous ? [previous] : [])]) {
    if (table === 'case_file') addFile(r.id);
    if (table === 'legal_case') addCase(r.id);
    if (
      [
        'case_file_case',
        'case_file_party',
        'procedural_stage',
        'case_term',
        'document_link',
        'task',
        'appointment',
      ].includes(table)
    ) {
      addFile(r.file_id);
      addCase(r.case_id);
    }
    if (['hearing', 'judgment'].includes(table)) addCase(r.case_id);
    if (table === 'legal_case_link') {
      addCase(r.source_case_id);
      addCase(r.target_case_id);
    }
    if (table === 'judgment_appeal') {
      const j = await tx.get('judgment', text(r.judgment_id));
      addCase(j?.case_id);
      addCase(r.appeal_case_id);
    }
    if (table === 'party' || table === 'party_alias') {
      const pid = text(table === 'party' ? r.id : r.party_id);
      for (const l of active(
        await neighbors(tx, 'case_file_party', { party_id: pid }),
      )) {
        addFile(l.file_id);
        addCase(l.case_id);
      }
      for (const f of active(
        await neighbors(tx, 'case_file', { responsible_party_id: pid }),
      ))
        addFile(f.id);
    }
    if (table === 'court') {
      for (const c of active(
        await neighbors(tx, 'legal_case', { court_id: text(r.id) }),
      ))
        addCase(c.id);
      for (const s of active(
        await neighbors(tx, 'procedural_stage', { authority_id: text(r.id) }),
      ))
        addFile(s.file_id);
    }
    if (table === 'court_circuit')
      for (const c of active(
        await neighbors(tx, 'legal_case', { circuit_id: text(r.id) }),
      ))
        addCase(c.id);
    if (table === 'document')
      for (const l of active(
        await neighbors(tx, 'document_link', { document_id: text(r.id) }),
      )) {
        addFile(l.file_id);
        addCase(l.case_id);
      }
    if (table === 'lookup_item' && previous) {
      const list = await tx.get('lookup_list', text(r.list_id));
      const ids = [text(r.id)],
        seen = new Set<string>();
      while (ids.length) {
        const id = ids.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        if (['legal_subject', 'case_classification'].includes(text(list?.code)))
          for (const child of await neighbors(tx, 'lookup_item', {
            parent_id: id,
          }))
            ids.push(text(child.id));
        if (list?.code === 'legal_subject')
          for (const l of await neighbors(tx, 'case_term', { term_id: id })) {
            addFile(l.file_id);
            addCase(l.case_id);
          }
        if (list?.code === 'case_type') {
          for (const f of await neighbors(tx, 'case_file', {
            case_type_id: id,
          }))
            addFile(f.id);
          for (const c of await neighbors(tx, 'legal_case', {
            case_type_id: id,
          }))
            addCase(c.id);
        }
        if (list?.code === 'case_classification')
          for (const col of ['subtype_id', 'nature_id'])
            for (const f of await neighbors(tx, 'case_file', { [col]: id }))
              addFile(f.id);
        if (list?.code === 'case_status' || list?.code === 'litigation_degree')
          for (const c of await neighbors(tx, 'legal_case', {
            [list.code === 'case_status'
              ? 'status_id'
              : 'litigation_degree_id']: id,
          }))
            addCase(c.id);
        if (list?.code === 'stage_type' || list?.code === 'stage_status')
          for (const stage of await neighbors(tx, 'procedural_stage', {
            [list.code === 'stage_type' ? 'type_id' : 'status_id']: id,
          }))
            addFile(stage.file_id);
        if (list?.code === 'party_role')
          for (const p of await neighbors(tx, 'case_file_party', {
            role_id: id,
          })) {
            addFile(p.file_id);
            addCase(p.case_id);
          }
      }
    }
  }
  for (const id of cases) {
    const f = await primaryFile(tx, id);
    addFile(f?.id);
  }
  for (const fid of files) {
    keys.set(`case_file:${fid}`, { type: 'case_file', id: fid });
    for (const link of active(
      await neighbors(tx, 'case_file_case', { file_id: fid }),
    ))
      addCase(link.case_id);
  }
  for (const cid of [...cases]) {
    keys.set(`legal_case:${cid}`, { type: 'legal_case', id: cid });
    if (table === 'legal_case')
      for (const l of [
        ...active(
          await neighbors(tx, 'legal_case_link', { source_case_id: cid }),
        ),
        ...active(
          await neighbors(tx, 'legal_case_link', { target_case_id: cid }),
        ),
      ]) {
        const id = text(
          l.source_case_id === cid ? l.target_case_id : l.source_case_id,
        );
        keys.set(`legal_case:${id}`, { type: 'legal_case', id });
      }
  }
  return [...keys.values()];
}
