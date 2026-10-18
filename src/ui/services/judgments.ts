import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface JudgmentRow {
  judgment: EngineRow;
  caseNumber: string;
  caseYear: string;
  caseId: string;
  courtName: string;
  typeName: string;
  statusName: string;
  filesCount: number;
  appealsCount: number;
  appealDeadline: string | null;
}

export interface JudgmentDetail {
  judgment: JudgmentRow;
  appeals: Array<{ appeal: EngineRow; typeName: string; statusName: string }>;
  files: EngineRow[];
  hearings: EngineRow[];
  caseName: string;
}

export class JudgmentService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<JudgmentRow>> {
    const { db, lookups } = this.deps;
    const typeId = request.filters.type ? lookups.id('judgment_type', request.filters.type) : null;
    const statusId = request.filters.status ? lookups.id('judgment_status', request.filters.status) : null;

    let judgments: EngineRow[];
    let total: number;
    if (request.search.trim()) {
      const hits = (await db.searchPage(request.search.trim(), { entityType: 'judgment', limit: 300 })).hits;
      judgments = [];
      for (const hit of hits) {
        const judgment = await db.get('judgment', hit.entityId);
        if (!judgment) continue;
        if (typeId && String(judgment.judgment_type_id ?? '') !== typeId) continue;
        if (statusId && String(judgment.status_id ?? '') !== statusId) continue;
        judgments.push(judgment);
      }
      total = judgments.length;
      const { offset, limit } = paginate(request.page, request.pageSize);
      judgments = judgments.slice(offset, offset + limit);
    } else {
      const page = await db.query('judgment', {
        filters: [
          ...(typeId ? [{ column: 'judgment_type_id', op: 'eq' as const, value: typeId }] : []),
          ...(statusId ? [{ column: 'status_id', op: 'eq' as const, value: statusId }] : []),
        ],
        orderBy: [{ column: 'issued_on', direction: 'desc' }],
        ...paginate(request.page, request.pageSize),
      });
      judgments = page.rows;
      total = page.total;
    }
    return { rows: await this.enrich(judgments), total };
  }

  async get(judgmentId: string): Promise<JudgmentDetail | null> {
    const { db, lookups } = this.deps;
    const judgment = await db.get('judgment', judgmentId);
    if (!judgment) return null;
    const [row] = await this.enrich([judgment]);
    if (!row) return null;
    const appealRows = (await db.query('judgment_appeal', {
      filters: [{ column: 'judgment_id', op: 'eq', value: judgmentId }],
      orderBy: [{ column: 'filed_on', direction: 'desc' }],
      limit: 30,
    })).rows;
    const appeals = appealRows.map((appeal) => ({
      appeal,
      typeName: lookups.byId(String(appeal.appeal_type_id ?? ''))?.nameAr ?? '—',
      statusName: lookups.byId(String(appeal.status_id ?? ''))?.nameAr ?? '—',
    }));
    const fileLinks = (await db.query('judgment_file_link', {
      filters: [{ column: 'judgment_id', op: 'eq', value: judgmentId }],
      limit: 30,
    })).rows;
    const files: EngineRow[] = [];
    for (const link of fileLinks) {
      const file = await db.get('case_file', String(link.file_id));
      if (file) files.push(file);
    }
    const hearings = (await db.query('hearing', {
      filters: [{ column: 'case_id', op: 'eq', value: String(judgment.case_id) }],
      orderBy: [{ column: 'scheduled_at', direction: 'desc' }],
      limit: 10,
    })).rows;
    return { judgment: row, appeals, files, hearings, caseName: row.caseNumber };
  }

  async addAppeal(input: {
    judgmentId: string;
    appealTypeCode: string;
    filedOn?: string;
    userDeadlineOn?: string;
    referenceNo?: string;
    notes?: string;
  }): Promise<EngineRow> {
    if (!input.appealTypeCode) throw new ValidationError('appeal type is required');
    const appeal = await this.deps.db.insert('judgment_appeal', {
      judgment_id: input.judgmentId,
      appeal_type_id: this.deps.lookups.id('appeal_type', input.appealTypeCode),
      filed_on: input.filedOn ?? null,
      user_deadline_on: input.userDeadlineOn ?? null,
      status_id: this.deps.lookups.id('appeal_status', 'pending'),
      reference_no: input.referenceNo?.trim() || null,
      notes: input.notes?.trim() || null,
    });
    await this.deps.db.update('judgment', input.judgmentId, {
      status_id: this.deps.lookups.id('judgment_status', 'appealed'),
    });
    this.deps.cache.invalidate('judgment', input.judgmentId);
    return appeal;
  }

  async upcomingDeadlines(days: number): Promise<JudgmentRow[]> {
    const today = new Date();
    const until = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
    const page = await this.deps.db.query('judgment', {
      filters: [
        { column: 'user_appeal_deadline', op: 'notNull' },
        { column: 'user_appeal_deadline', op: 'gte', value: today.toISOString().slice(0, 10) },
        { column: 'user_appeal_deadline', op: 'lte', value: until.toISOString().slice(0, 10) },
      ],
      orderBy: [{ column: 'user_appeal_deadline', direction: 'asc' }],
      limit: 20,
    });
    return this.enrich(page.rows);
  }

  private async enrich(judgments: readonly EngineRow[]): Promise<JudgmentRow[]> {
    const { db, lookups, cache } = this.deps;
    const rows: JudgmentRow[] = [];
    for (const judgment of judgments) {
      const legalCase = await cache.get('legal_case', String(judgment.case_id));
      const court = judgment.court_id ? await cache.get('court', String(judgment.court_id)) : legalCase?.court_id ? await cache.get('court', String(legalCase.court_id)) : null;
      const fileLinks = await db.query('judgment_file_link', {
        filters: [{ column: 'judgment_id', op: 'eq', value: String(judgment.id) }],
        limit: 0,
      });
      const appeals = await db.query('judgment_appeal', {
        filters: [{ column: 'judgment_id', op: 'eq', value: String(judgment.id) }],
        limit: 0,
      });
      rows.push({
        judgment,
        caseId: String(judgment.case_id ?? ''),
        caseNumber: String(legalCase?.case_number ?? '—'),
        caseYear: String(legalCase?.case_year ?? ''),
        courtName: String(court?.name ?? '—'),
        typeName: lookups.byId(String(judgment.judgment_type_id ?? ''))?.nameAr ?? '—',
        statusName: lookups.byId(String(judgment.status_id ?? ''))?.nameAr ?? '—',
        filesCount: fileLinks.total,
        appealsCount: appeals.total,
        appealDeadline: judgment.user_appeal_deadline ? String(judgment.user_appeal_deadline) : null,
      });
    }
    return rows;
  }
}
