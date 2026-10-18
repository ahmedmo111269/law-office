import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';
import type { HearingSummary, JudgmentSummary } from './files.ts';

export interface CaseRow {
  legalCase: EngineRow;
  courtName: string;
  caseTypeName: string;
  statusName: string;
  clientNames: string[];
  hearingsCount: number;
  nextHearingAt: string | null;
}

export interface CaseDetail {
  legalCase: EngineRow;
  courtName: string;
  circuitName: string;
  caseTypeName: string;
  statusName: string;
  degreeName: string;
  files: EngineRow[];
  parties: Array<{ party: EngineRow; roleName: string; sideName: string; fileId: string }>;
  hearings: HearingSummary[];
  judgments: JudgmentSummary[];
  tasks: EngineRow[];
  documents: EngineRow[];
  activity: EngineRow[];
}

export class CaseService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<CaseRow>> {
    const { db, lookups } = this.deps;
    const statusId = request.filters.status ? lookups.id('case_status', request.filters.status) : null;
    const courtId = request.filters.court || null;

    if (request.search.trim()) {
      const hits: Array<{ entityId: string }> = [];
      let offset = 0;
      for (;;) {
        const page = await db.searchPage(request.search.trim(), { entityType: 'legal_case', limit: 200, offset });
        hits.push(...page.hits);
        offset += page.hits.length;
        if (page.hits.length === 0 || offset >= page.total) break;
      }
      const cases: EngineRow[] = [];
      for (const hit of hits) {
        const legalCase = await db.get('legal_case', hit.entityId);
        if (!legalCase) continue;
        if (statusId && String(legalCase.status_id) !== statusId) continue;
        if (courtId && String(legalCase.court_id ?? '') !== courtId) continue;
        cases.push(legalCase);
      }
      cases.sort((a, b) => compareCases(a, b, request.sortKey, request.sortDir));
      const { offset: pageOffset, limit } = paginate(request.page, request.pageSize);
      return { rows: await this.enrich(cases.slice(pageOffset, pageOffset + limit)), total: cases.length };
    }

    const sortColumn = request.sortKey === 'case_number' ? 'case_number' : 'registration_date';
    const page = await db.query('legal_case', {
      filters: [
        ...(statusId ? [{ column: 'status_id', op: 'eq' as const, value: statusId }] : []),
        ...(courtId ? [{ column: 'court_id', op: 'eq' as const, value: courtId }] : []),
      ],
      orderBy: [{ column: sortColumn, direction: request.sortDir ?? 'desc' }],
      ...paginate(request.page, request.pageSize),
    });
    return { rows: await this.enrich(page.rows), total: page.total };
  }

  private async enrich(cases: readonly EngineRow[]): Promise<CaseRow[]> {
    const { db, lookups, cache } = this.deps;
    const now = new Date().toISOString();
    const rows: CaseRow[] = [];
    for (const legalCase of cases) {
      const court = await cache.get('court', legalCase.court_id ? String(legalCase.court_id) : null);
      const hearings = await db.query('hearing', {
        filters: [{ column: 'case_id', op: 'eq', value: String(legalCase.id) }],
        orderBy: [{ column: 'scheduled_at', direction: 'asc' }],
        limit: 100,
      });
      const next = hearings.rows.find((hearing) => String(hearing.scheduled_at) >= now && hearing.status_id !== lookups.id('hearing_status', 'cancelled'));
      const clientNames = await clientNamesForCase(db, cache, String(legalCase.id));
      rows.push({
        legalCase,
        courtName: court ? String(court.name) : '—',
        caseTypeName: lookups.byId(String(legalCase.case_type_id ?? ''))?.nameAr ?? '—',
        statusName: lookups.byId(String(legalCase.status_id ?? ''))?.nameAr ?? '—',
        clientNames,
        hearingsCount: hearings.total,
        nextHearingAt: next ? String(next.scheduled_at) : null,
      });
    }
    return rows;
  }

  async get(caseId: string): Promise<CaseDetail | null> {
    const { db, lookups, cache } = this.deps;
    const full = await db.getCaseFull(caseId);
    const court = await cache.get('court', full.legalCase.court_id ? String(full.legalCase.court_id) : null);
    const circuit = await cache.get('court_circuit', full.legalCase.circuit_id ? String(full.legalCase.circuit_id) : null);
    const parties: CaseDetail['parties'] = [];
    for (const file of full.files) {
      const links = await db.query('case_file_party', {
        filters: [{ column: 'file_id', op: 'eq', value: String(file.id) }],
        limit: 100,
      });
      for (const link of links.rows) {
        const party = await cache.get('party', String(link.party_id));
        if (!party) continue;
        if (parties.some((entry) => String(entry.party.id) === String(party.id))) continue;
        parties.push({
          party,
          roleName: lookups.byId(String(link.role_id ?? ''))?.nameAr ?? '—',
          sideName: lookups.byId(String(link.side_id ?? ''))?.nameAr ?? '—',
          fileId: String(file.id),
        });
      }
    }
    const hearings: HearingSummary[] = full.hearings.map((hearing) => ({
      hearing,
      caseNumber: String(full.legalCase.case_number),
      caseYear: Number(full.legalCase.case_year),
      courtName: court ? String(court.name) : '—',
      purposeName: lookups.byId(String(hearing.purpose ?? ''))?.nameAr ?? '—',
      statusName: lookups.byId(String(hearing.status_id ?? ''))?.nameAr ?? '—',
    }));
    const judgments: JudgmentSummary[] = full.judgments.map((judgment) => ({
      judgment,
      caseNumber: String(full.legalCase.case_number),
      typeName: lookups.byId(String(judgment.judgment_type_id ?? ''))?.nameAr ?? '—',
      statusName: lookups.byId(String(judgment.status_id ?? ''))?.nameAr ?? '—',
    }));
    const tasks = (await db.query('task', {
      filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      orderBy: [{ column: 'due_at', direction: 'asc' }],
      limit: 100,
    })).rows;
    const docs: EngineRow[] = [];
    const docLinks = await db.query('document_link', {
      filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      limit: 100,
    });
    for (const link of docLinks.rows) {
      const doc = await db.get('document', String(link.document_id));
      if (doc) docs.push(doc);
    }
    const activity = await db.auditTrail('legal_case', caseId, 40);
    return {
      legalCase: full.legalCase,
      courtName: court ? String(court.name) : '—',
      circuitName: circuit ? String(circuit.name) : '—',
      caseTypeName: lookups.byId(String(full.legalCase.case_type_id ?? ''))?.nameAr ?? '—',
      statusName: lookups.byId(String(full.legalCase.status_id ?? ''))?.nameAr ?? '—',
      degreeName: lookups.byId(String(full.legalCase.litigation_degree_id ?? ''))?.nameAr ?? '—',
      files: full.files,
      parties,
      hearings,
      judgments,
      tasks,
      documents: docs,
      activity,
    };
  }

  async create(input: {
    caseNumber: string;
    caseYear: number;
    caseTypeCode?: string;
    courtId?: string;
    fileIds?: readonly string[];
    litigationDegreeCode?: string;
    subject?: string;
    statusCode?: string;
    claimAmountMinor?: number;
    currencyCode?: string;
  }): Promise<EngineRow> {
    const { db, lookups } = this.deps;
    if (!input.caseNumber.trim()) throw new ValidationError('case number is required');
    const legalCase = await db.createCase({
      caseNumber: input.caseNumber.trim(),
      caseYear: input.caseYear,
      ...(input.caseTypeCode ? { caseTypeCode: input.caseTypeCode } : {}),
      ...(input.courtId ? { courtId: input.courtId } : {}),
      ...(input.fileIds ? { fileIds: input.fileIds } : {}),
      ...(input.litigationDegreeCode ? { litigationDegreeCode: input.litigationDegreeCode } : {}),
      ...(input.subject ? { subject: input.subject } : {}),
    });
    const patch: Record<string, unknown> = {};
    if (input.statusCode) patch.status_id = lookups.id('case_status', input.statusCode);
    if (input.claimAmountMinor !== undefined) patch.claim_amount_minor = input.claimAmountMinor;
    if (input.currencyCode) patch.currency_code = input.currencyCode;
    if (Object.keys(patch).length > 0) await db.update('legal_case', String(legalCase.id), patch);
    this.deps.cache.invalidate();
    return (await db.get('legal_case', String(legalCase.id))) ?? legalCase;
  }

  async update(caseId: string, patch: Record<string, unknown>): Promise<EngineRow> {
    const updated = await this.deps.db.update('legal_case', caseId, patch);
    this.deps.cache.invalidate('legal_case', caseId);
    return updated;
  }

  async scheduleHearing(input: {
    caseId: string;
    scheduledAt: string;
    purposeCode?: string;
    courtId?: string;
  }): Promise<EngineRow> {
    const hearing = await this.deps.db.scheduleHearing({
      caseId: input.caseId,
      scheduledAt: input.scheduledAt,
      ...(input.purposeCode ? { purposeCode: input.purposeCode } : {}),
      ...(input.courtId ? { courtId: input.courtId } : {}),
    });
    this.deps.cache.invalidate();
    return hearing;
  }

  async recordHearing(hearingId: string, input: { statusCode?: string; outcomeSummary?: string; heldAt?: string }): Promise<EngineRow> {
    const updated = await this.deps.db.recordHearing(hearingId, {
      ...(input.statusCode ? { statusCode: input.statusCode } : {}),
      ...(input.outcomeSummary !== undefined ? { outcomeSummary: input.outcomeSummary } : {}),
      ...(input.heldAt ? { heldAt: input.heldAt } : {}),
    });
    this.deps.cache.invalidate();
    return updated;
  }

  async scheduleNext(previousHearingId: string, scheduledAt: string): Promise<EngineRow> {
    const next = await this.deps.db.scheduleNextHearing(previousHearingId, { scheduledAt });
    this.deps.cache.invalidate();
    return next;
  }

  async recordJudgment(input: {
    caseId: string;
    hearingId?: string;
    issuedOn: string;
    judgmentTypeCode?: string;
    operativePart?: string;
    reasoning?: string;
    fileIds?: readonly string[];
    statusCode?: string;
  }): Promise<EngineRow> {
    const { db, lookups } = this.deps;
    const judgment = await db.recordJudgment({
      caseId: input.caseId,
      ...(input.hearingId ? { hearingId: input.hearingId } : {}),
      issuedOn: input.issuedOn,
      ...(input.judgmentTypeCode ? { judgmentTypeCode: input.judgmentTypeCode } : {}),
      ...(input.operativePart ? { operativePart: input.operativePart } : {}),
      ...(input.reasoning ? { reasoning: input.reasoning } : {}),
      ...(input.fileIds ? { fileIds: input.fileIds } : {}),
    });
    if (input.statusCode) {
      await db.update('judgment', String(judgment.id), { status_id: lookups.id('judgment_status', input.statusCode) });
    }
    this.deps.cache.invalidate();
    return judgment;
  }

  async searchOptions(query: string, limit = 12): Promise<Array<{ value: string; label: string; description?: string }>> {
    const { db } = this.deps;
    const page = query.trim()
      ? await db.searchPage(query.trim(), { entityType: 'legal_case', limit: Math.min(50, limit * 3) })
      : null;
    if (!page) {
      const recent = await db.query('legal_case', {
        orderBy: [{ column: 'registration_date', direction: 'desc' }],
        limit,
      });
      return recent.rows.map((row) => ({
        value: String(row.id),
        label: `قضية ${row.case_number} / ${row.case_year}`,
        ...(row.subject ? { description: String(row.subject) } : {}),
      }));
    }
    const options: Array<{ value: string; label: string; description?: string }> = [];
    for (const hit of page.hits) {
      const row = await db.get('legal_case', hit.entityId);
      if (!row) continue;
      options.push({
        value: String(row.id),
        label: `قضية ${row.case_number} / ${row.case_year}`,
        ...(row.subject ? { description: String(row.subject) } : {}),
      });
      if (options.length >= limit) break;
    }
    return options;
  }

  async courts(): Promise<EngineRow[]> {
    return (await this.deps.db.query('court', { orderBy: [{ column: 'name', direction: 'asc' }], limit: 500 })).rows;
  }
}

async function clientNamesForCase(
  db: ServiceDeps['db'],
  cache: ServiceDeps['cache'],
  caseId: string,
): Promise<string[]> {
  const links = await db.query('case_file_case', {
    filters: [{ column: 'case_id', op: 'eq', value: caseId }],
    limit: 20,
  });
  const names = new Set<string>();
  for (const link of links.rows) {
    const partyLinks = await db.query('case_file_party', {
      filters: [
        { column: 'file_id', op: 'eq', value: String(link.file_id) },
        { column: 'role_id', op: 'eq', value: String((await db.lookup('party_role', 'client')).id) },
      ],
      limit: 20,
    });
    for (const partyLink of partyLinks.rows) {
      const party = await cache.get('party', String(partyLink.party_id));
      if (party) names.add(String(party.display_name));
    }
  }
  return [...names];
}

function compareCases(a: EngineRow, b: EngineRow, sortKey: string | undefined, dir: 'asc' | 'desc' | undefined): number {
  const factor = dir === 'asc' ? 1 : -1;
  const column = sortKey === 'case_number' ? 'case_number' : 'registration_date';
  return String(a[column] ?? '').localeCompare(String(b[column] ?? ''), 'ar') * factor;
}
