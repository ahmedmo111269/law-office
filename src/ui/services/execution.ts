import type { EngineRow } from '../../portable/store.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface ExecutionRow {
  legalCase: EngineRow;
  courtName: string;
  statusName: string;
  creditorName: string | null;
  debtorName: string | null;
  fileNumber: string | null;
  fileId: string | null;
  judgmentNumber: string | null;
  openTasks: number;
  nextHearingAt: string | null;
}

export interface ExecutionDetail {
  row: ExecutionRow;
  parties: Array<{ party: EngineRow | null; roleName: string; sideName: string }>;
  hearings: EngineRow[];
  judgments: EngineRow[];
  tasks: EngineRow[];
  documents: EngineRow[];
  activity: EngineRow[];
}

/**
 * Execution work is stored as a `legal_case` of type "تنفيذ" linked to an
 * execution file. No parallel table is invented: everything here reads the
 * same legal_case / case_file_party / task tables the rest of the app uses.
 */
export class ExecutionService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  executionTypeId(): string {
    return this.deps.lookups.id('case_type', 'execution') ?? '';
  }

  async list(request: TableRequest): Promise<TableResult<ExecutionRow>> {
    const { db, lookups } = this.deps;
    const typeId = this.executionTypeId();
    const statusId = request.filters.status ? lookups.id('case_status', request.filters.status) : null;

    let cases: EngineRow[];
    let total: number;
    if (request.search.trim()) {
      const hits = (await db.searchPage(request.search.trim(), { entityType: 'legal_case', limit: 300 })).hits;
      cases = [];
      for (const hit of hits) {
        const legalCase = await db.get('legal_case', hit.entityId);
        if (!legalCase) continue;
        if (String(legalCase.case_type_id ?? '') !== typeId) continue;
        if (statusId && String(legalCase.status_id ?? '') !== statusId) continue;
        cases.push(legalCase);
      }
      total = cases.length;
      const { offset, limit } = paginate(request.page, request.pageSize);
      cases = cases.slice(offset, offset + limit);
    } else {
      const page = await db.query('legal_case', {
        filters: [
          { column: 'case_type_id', op: 'eq', value: typeId },
          ...(statusId ? [{ column: 'status_id', op: 'eq' as const, value: statusId }] : []),
        ],
        orderBy: [{ column: 'created_at', direction: 'desc' }],
        ...paginate(request.page, request.pageSize),
      });
      cases = page.rows;
      total = page.total;
    }
    return { rows: await this.enrich(cases), total };
  }

  async get(caseId: string): Promise<ExecutionDetail | null> {
    const { db, lookups, cache } = this.deps;
    const legalCase = await db.get('legal_case', caseId);
    if (!legalCase) return null;
    const [row] = await this.enrich([legalCase]);
    if (!row) return null;

    const partyLinks = (await db.query('case_file_party', {
      filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      limit: 50,
    })).rows;
    const parties: ExecutionDetail['parties'] = [];
    for (const link of partyLinks) {
      parties.push({
        party: await cache.get('party', String(link.party_id)),
        roleName: lookups.byId(String(link.role_id ?? ''))?.nameAr ?? '—',
        sideName: lookups.byId(String(link.side_id ?? ''))?.nameAr ?? '—',
      });
    }
    const hearings = (await db.query('hearing', {
      filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      orderBy: [{ column: 'scheduled_at', direction: 'desc' }],
      limit: 30,
    })).rows;
    const judgments = (await db.query('judgment', {
      filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      orderBy: [{ column: 'issued_on', direction: 'desc' }],
      limit: 20,
    })).rows;
    const tasks = (await db.query('task', {
      filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      orderBy: [{ column: 'due_at', direction: 'asc' }],
      limit: 40,
    })).rows;
    const documents: EngineRow[] = [];
    if (row.fileId) {
      const links = (await db.query('document_link', {
        filters: [{ column: 'file_id', op: 'eq', value: row.fileId }],
        limit: 20,
      })).rows;
      for (const link of links) {
        const document = await cache.get('document', String(link.document_id));
        if (document) documents.push(document);
      }
    }
    const activity = await db.auditTrail('legal_case', caseId, 30);
    return { row, parties, hearings, judgments, tasks, documents, activity };
  }

  private async enrich(cases: readonly EngineRow[]): Promise<ExecutionRow[]> {
    const { db, lookups, cache } = this.deps;
    const rows: ExecutionRow[] = [];
    for (const legalCase of cases) {
      const court = legalCase.court_id ? await cache.get('court', String(legalCase.court_id)) : null;
      const partyLinks = (await db.query('case_file_party', {
        filters: [{ column: 'case_id', op: 'eq', value: String(legalCase.id) }],
        limit: 30,
      })).rows;
      let creditorName: string | null = null;
      let debtorName: string | null = null;
      let fileId: string | null = null;
      let fileNumber: string | null = null;
      for (const link of partyLinks) {
        const roleCode = lookups.byId(String(link.role_id ?? ''))?.code ?? '';
        const party = await cache.get('party', String(link.party_id));
        if (!party) continue;
        if (roleCode === 'execution_creditor' && !creditorName) creditorName = String(party.display_name);
        if (roleCode === 'execution_debtor' && !debtorName) debtorName = String(party.display_name);
        if (!fileId && link.file_id) {
          fileId = String(link.file_id);
          const file = await cache.get('case_file', fileId);
          fileNumber = file ? String(file.file_number) : null;
        }
      }
      const openTaskIds = ['open', 'in_progress', 'waiting', 'blocked']
        .map((code) => lookups.id('task_status', code))
        .filter((value): value is string => Boolean(value));
      const openTasks = openTaskIds.length > 0
        ? await db.query('task', {
            filters: [
              { column: 'case_id', op: 'eq', value: String(legalCase.id) },
              { column: 'status_id', op: 'in', value: openTaskIds },
            ],
            limit: 0,
          })
        : { total: 0, rows: [] };
      const nextHearing = await db.query('hearing', {
        filters: [
          { column: 'case_id', op: 'eq', value: String(legalCase.id) },
          { column: 'scheduled_at', op: 'gte', value: new Date().toISOString() },
        ],
        orderBy: [{ column: 'scheduled_at', direction: 'asc' }],
        limit: 1,
      });
      const judgment = await db.query('judgment', {
        filters: [{ column: 'case_id', op: 'eq', value: String(legalCase.id) }],
        orderBy: [{ column: 'issued_on', direction: 'desc' }],
        limit: 1,
      });
      rows.push({
        legalCase,
        courtName: String(court?.name ?? '—'),
        statusName: lookups.byId(String(legalCase.status_id ?? ''))?.nameAr ?? '—',
        creditorName,
        debtorName,
        fileId,
        fileNumber,
        judgmentNumber: judgment.rows[0] ? String(judgment.rows[0].judgment_number ?? '—') : null,
        openTasks: openTasks.total,
        nextHearingAt: nextHearing.rows[0]?.scheduled_at ? String(nextHearing.rows[0].scheduled_at) : null,
      });
    }
    return rows;
  }
}
