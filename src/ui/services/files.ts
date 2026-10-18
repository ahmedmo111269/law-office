import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface FileListRow {
  file: EngineRow;
  clientNames: string[];
  casesCount: number;
  statusName: string;
  practiceName: string;
}

export interface CaseSummary {
  legalCase: EngineRow;
  courtName: string;
  caseTypeName: string;
  hearingsCount: number;
  nextHearingAt: string | null;
}

export interface HearingSummary {
  hearing: EngineRow;
  caseNumber: string;
  caseYear: number;
  courtName: string;
  purposeName: string;
  statusName: string;
}

export interface JudgmentSummary {
  judgment: EngineRow;
  caseNumber: string;
  typeName: string;
  statusName: string;
}

export interface FileDetail {
  file: EngineRow;
  parties: Array<EngineRow & { display_name: string; role_name: string; side_name?: string }>;
  cases: CaseSummary[];
  hearings: HearingSummary[];
  judgments: JudgmentSummary[];
  tasks: EngineRow[];
  documents: EngineRow[];
  charges: EngineRow[];
  transactions: EngineRow[];
  notes: EngineRow[];
  subFiles: EngineRow[];
  activity: EngineRow[];
  outstandingMinor: number;
}

export class FileService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<FileListRow>> {
    const { db, lookups } = this.deps;
    const statusId = request.filters.status ? lookups.id('file_status', request.filters.status) : null;
    const practiceId = request.filters.practice ? lookups.id('practice_area', request.filters.practice) : null;

    if (request.search.trim()) {
      const hits = await collectSearch(db, 'case_file', request.search.trim());
      const files: EngineRow[] = [];
      for (const hit of hits) {
        const file = await db.get('case_file', hit.entityId);
        if (!file) continue;
        if (statusId && String(file.status_id) !== statusId) continue;
        if (practiceId && String(file.practice_area_id) !== practiceId) continue;
        files.push(file);
      }
      files.sort((a, b) => compareFiles(a, b, request.sortKey, request.sortDir));
      const { offset, limit } = paginate(request.page, request.pageSize);
      return { rows: await this.enrich(files.slice(offset, offset + limit)), total: files.length };
    }

    const sortColumn = request.sortKey === 'file_number' ? 'file_number' : request.sortKey === 'title' ? 'title' : 'opened_on';
    const page = await db.query('case_file', {
      filters: [
        ...(statusId ? [{ column: 'status_id', op: 'eq' as const, value: statusId }] : []),
        ...(practiceId ? [{ column: 'practice_area_id', op: 'eq' as const, value: practiceId }] : []),
      ],
      orderBy: [{ column: sortColumn, direction: request.sortDir ?? 'desc' }],
      ...paginate(request.page, request.pageSize),
    });
    return { rows: await this.enrich(page.rows), total: page.total };
  }

  private async enrich(files: readonly EngineRow[]): Promise<FileListRow[]> {
    const { db, lookups } = this.deps;
    if (files.length === 0) return [];
    const ids = files.map((file) => String(file.id));
    const links = await db.query('case_file_party', {
      filters: [{ column: 'file_id', op: 'in', value: ids }],
      limit: 500,
    });
    const partyIds = links.rows.map((link) => String(link.party_id));
    const parties = await this.deps.cache.many('party', partyIds);
    const clientIds = new Map<string, string[]>();
    for (const link of links.rows) {
      const roleCode = lookups.byId(String(link.role_id ?? ''))?.code;
      if (roleCode !== 'client') continue;
      const fileId = String(link.file_id);
      const list = clientIds.get(fileId) ?? [];
      const party = parties.get(String(link.party_id));
      if (party) list.push(String(party.display_name));
      clientIds.set(fileId, list);
    }
    const rows: FileListRow[] = [];
    for (const file of files) {
      const cases = await db.query('case_file_case', {
        filters: [{ column: 'file_id', op: 'eq', value: String(file.id) }],
        limit: 0,
      });
      rows.push({
        file,
        clientNames: clientIds.get(String(file.id)) ?? [],
        casesCount: cases.total,
        statusName: lookups.byId(String(file.status_id ?? ''))?.nameAr ?? '—',
        practiceName: lookups.byId(String(file.practice_area_id ?? ''))?.nameAr ?? '—',
      });
    }
    return rows;
  }

  async get(fileId: string): Promise<FileDetail | null> {
    const { db, lookups, cache } = this.deps;
    const full = await db.getFileFull(fileId);
    if (!full) return null;
    const file = full.file;
    const caseIds = full.cases.map((row) => String(row.id));
    const cases: CaseSummary[] = [];
    const allHearings: HearingSummary[] = [];
    const judgments: JudgmentSummary[] = [];
    for (const legalCase of full.cases) {
      const hearings = await db.query('hearing', {
        filters: [{ column: 'case_id', op: 'eq', value: String(legalCase.id) }],
        orderBy: [{ column: 'scheduled_at', direction: 'asc' }],
        limit: 200,
      });
      const now = new Date().toISOString();
      const upcoming = hearings.rows.filter((row) => String(row.scheduled_at) >= now && row.status_id !== lookups.id('hearing_status', 'cancelled'));
      const court = await cache.get('court', legalCase.court_id ? String(legalCase.court_id) : null);
      cases.push({
        legalCase,
        courtName: court ? String(court.name) : '—',
        caseTypeName: lookups.byId(String(legalCase.case_type_id ?? ''))?.nameAr ?? '—',
        hearingsCount: hearings.total,
        nextHearingAt: upcoming[0] ? String(upcoming[0].scheduled_at) : null,
      });
      for (const hearing of hearings.rows) {
        allHearings.push({
          hearing,
          caseNumber: String(legalCase.case_number),
          caseYear: Number(legalCase.case_year),
          courtName: court ? String(court.name) : '—',
          purposeName: lookups.byId(String(hearing.purpose ?? ''))?.nameAr ?? '—',
          statusName: lookups.byId(String(hearing.status_id ?? ''))?.nameAr ?? '—',
        });
      }
      const caseJudgments = await db.query('judgment', {
        filters: [{ column: 'case_id', op: 'eq', value: String(legalCase.id) }],
        orderBy: [{ column: 'issued_on', direction: 'desc' }],
        limit: 50,
      });
      for (const judgment of caseJudgments.rows) {
        judgments.push({
          judgment,
          caseNumber: String(legalCase.case_number),
          typeName: lookups.byId(String(judgment.judgment_type_id ?? ''))?.nameAr ?? '—',
          statusName: lookups.byId(String(judgment.status_id ?? ''))?.nameAr ?? '—',
        });
      }
    }
    const tasks = (await db.query('task', {
      filters: [{ column: 'file_id', op: 'eq', value: fileId }],
      orderBy: [{ column: 'due_at', direction: 'asc' }],
      limit: 100,
    })).rows;
    const docLinks = await db.query('document_link', {
      filters: [{ column: 'file_id', op: 'eq', value: fileId }],
      limit: 200,
    });
    const documents: EngineRow[] = [];
    for (const link of docLinks.rows) {
      const document = await db.get('document', String(link.document_id));
      if (document) documents.push(document);
    }
    const charges = (await db.query('financial_charge', {
      filters: [{ column: 'file_id', op: 'eq', value: fileId }],
      orderBy: [{ column: 'issued_on', direction: 'desc' }],
      limit: 50,
    })).rows;
    let outstandingMinor = 0;
    for (const charge of charges) {
      if (charge.status_id === lookups.id('charge_status', 'cancelled')) continue;
      const balance = await db.chargeBalance(String(charge.id));
      outstandingMinor += Math.max(0, balance.outstandingMinor);
    }
    const transactions = (await db.query('financial_transaction', {
      filters: [{ column: 'file_id', op: 'eq', value: fileId }],
      orderBy: [{ column: 'occurred_at', direction: 'desc' }],
      limit: 30,
    })).rows;
    const notes = (await db.query('case_note', {
      filters: [{ column: 'file_id', op: 'eq', value: fileId }],
      orderBy: [{ column: 'created_at', direction: 'desc' }],
      limit: 100,
    })).rows;
    const activity = await db.auditTrail('case_file', fileId, 40);
    const parties = full.parties.map((party) => ({
      ...party,
      display_name: String(party.display_name ?? cache.partyName(String(party.party_id))),
      role_name: String(party.role_name ?? '—'),
      side_name: lookups.byId(String(party.side_id ?? ''))?.nameAr ?? '—',
    }));

    void caseIds;
    return {
      file,
      parties,
      cases,
      hearings: allHearings.sort((a, b) => String(a.hearing.scheduled_at).localeCompare(String(b.hearing.scheduled_at))),
      judgments,
      tasks,
      documents,
      charges,
      transactions,
      notes,
      subFiles: full.subFiles,
      activity,
      outstandingMinor,
    };
  }

  async create(input: {
    title: string;
    clientPartyIds?: readonly string[];
    practiceAreaCode?: string;
    fileTypeCode?: string;
    openedOn?: string;
    description?: string;
    priorityCode?: string;
    confidentialityCode?: string;
    responsiblePartyId?: string;
  }): Promise<EngineRow> {
    const { db, lookups } = this.deps;
    if (!input.title.trim()) throw new ValidationError('file title is required');
    const file = await db.createFile({
      title: input.title,
      ...(input.clientPartyIds ? { clientPartyIds: input.clientPartyIds } : {}),
      ...(input.practiceAreaCode ? { practiceAreaCode: input.practiceAreaCode } : {}),
      ...(input.fileTypeCode ? { fileTypeCode: input.fileTypeCode } : {}),
      ...(input.openedOn ? { openedOn: input.openedOn } : {}),
      ...(input.description ? { description: input.description } : {}),
    });
    const patch: Record<string, unknown> = {};
    if (input.priorityCode) patch.priority_id = lookups.id('priority', input.priorityCode);
    if (input.confidentialityCode) patch.confidentiality_id = lookups.id('confidentiality', input.confidentialityCode);
    if (input.responsiblePartyId) patch.responsible_party_id = input.responsiblePartyId;
    if (Object.keys(patch).length > 0) await db.update('case_file', String(file.id), patch);
    this.deps.cache.invalidate();
    return (await db.get('case_file', String(file.id))) ?? file;
  }

  async update(fileId: string, patch: Record<string, unknown>): Promise<EngineRow> {
    const updated = await this.deps.db.update('case_file', fileId, patch);
    this.deps.cache.invalidate('case_file', fileId);
    return updated;
  }

  async addParty(input: {
    fileId: string;
    partyId: string;
    roleCode: string;
    sideCode?: string;
    isPrimary?: boolean;
  }): Promise<EngineRow> {
    const link = await this.deps.db.addFileParty({
      fileId: input.fileId,
      partyId: input.partyId,
      roleCode: input.roleCode,
      ...(input.sideCode ? { sideCode: input.sideCode } : {}),
      ...(input.isPrimary ? { isPrimary: true } : {}),
    });
    this.deps.cache.invalidate();
    return link;
  }

  async removeParty(linkId: string): Promise<void> {
    await this.deps.db.softDelete('case_file_party', linkId, 'إزالة طرف من الملف');
    this.deps.cache.invalidate();
  }

  async addNote(input: { fileId: string; caseId?: string; body: string; isPrivate?: boolean }): Promise<EngineRow> {
    if (!input.body.trim()) throw new ValidationError('note body is required');
    const note = await this.deps.db.insert('case_note', {
      file_id: input.fileId,
      case_id: input.caseId ?? null,
      body: input.body.trim(),
      is_private: input.isPrivate ? 1 : 0,
    });
    this.deps.cache.invalidate();
    return note;
  }

  async createSubFile(parentId: string, title: string, practiceAreaCode?: string): Promise<EngineRow> {
    const file = await this.deps.db.createSubFile(parentId, {
      title,
      ...(practiceAreaCode ? { practiceAreaCode } : {}),
    });
    this.deps.cache.invalidate();
    return file;
  }

  async linkCase(fileId: string, caseId: string): Promise<void> {
    await this.deps.db.linkCase(caseId, fileId);
    this.deps.cache.invalidate();
  }

  async unlinkCase(linkId: string): Promise<void> {
    await this.deps.db.softDelete('case_file_case', linkId, 'فك ارتباط القضية');
  }

  async searchOptions(query: string, limit = 12): Promise<Array<{ value: string; label: string; description?: string; badge?: string }>> {
    const { db, lookups } = this.deps;
    if (!query.trim()) {
      const page = await db.query('case_file', { orderBy: [{ column: 'opened_on', direction: 'desc' }], limit });
      return page.rows.map((file) => ({
        value: String(file.id),
        label: String(file.title),
        description: String(file.file_number),
        ...badgeProps(lookups.byId(String(file.status_id ?? ''))?.nameAr),
      }));
    }
    const hits = (await db.searchPage(query, { entityType: 'case_file', limit: 50 })).hits;
    const options: Array<{ value: string; label: string; description?: string; badge?: string }> = [];
    for (const hit of hits) {
      const file = await db.get('case_file', hit.entityId);
      if (!file) continue;
      options.push({
        value: String(file.id),
        label: String(file.title),
        description: String(file.file_number),
        ...badgeProps(lookups.byId(String(file.status_id ?? ''))?.nameAr),
      });
      if (options.length >= limit) break;
    }
    return options;
  }
}

function compareFiles(a: EngineRow, b: EngineRow, sortKey: string | undefined, dir: 'asc' | 'desc' | undefined): number {
  const factor = dir === 'asc' ? 1 : -1;
  const column = sortKey === 'file_number' ? 'file_number' : sortKey === 'title' ? 'title' : 'opened_on';
  const left = String(a[column] ?? '');
  const right = String(b[column] ?? '');
  return left.localeCompare(right, 'ar') * factor;
}

async function collectSearch(
  db: ServiceDeps['db'],
  entityType: string,
  query: string,
): Promise<Array<{ entityId: string; title: string }>> {
  const hits: Array<{ entityId: string; title: string }> = [];
  let offset = 0;
  for (;;) {
    const page = await db.searchPage(query, { entityType, limit: 200, offset });
    hits.push(...page.hits);
    offset += page.hits.length;
    if (page.hits.length === 0 || offset >= page.total) break;
  }
  return hits;
}

function badgeProps(value: string | undefined): { badge?: string } {
  return value ? { badge: value } : {};
}
