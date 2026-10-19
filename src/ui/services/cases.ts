import type { EngineRow } from '../../portable/store.ts';
import {
  addTerm,
  getIntake,
  mergeTerms,
  saveIntake,
  saveStage,
  saveTemplate,
  templateFor,
} from '../../cases/intake-operations.ts';
import type {
  CaseTemplate,
  IntakeInput,
  StageInput,
} from '../../cases/types.ts';
import { normalizeArabic } from '../../util/arabic.ts';
import type { QueryFilter } from '../../portable/query.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { scopedPartyLinks } from '../../cases/party-scope.ts';
import { paginate, relatedRows, eachPage } from './types.ts';
import type { HearingSummary, JudgmentSummary } from './files.ts';

export interface CaseRow {
  isIntake?: boolean;
  fileId?: string;
  fileNumber?: string;
  stageName?: string;
  followUpOn?: string | null;
  lastActionOn?: string | null;
  legalCase: EngineRow;
  courtName: string;
  circuitName: string;
  caseTypeName: string;
  degreeName: string;
  statusName: string;
  clientNames: string[];
  opponentNames: string[];
  hearingsCount: number;
  nextHearingAt: string | null;
  lastHearingAt: string | null;
  hasJudgment: boolean;
  filesCount: number;
  tasksCount: number;
  isArchived: boolean;
  hasMissingData: boolean;
  missingReasons: string[];
  lastActivityAt: string | null;
}

export interface CaseDetail {
  legalCase: EngineRow;
  courtName: string;
  circuitName: string;
  caseTypeName: string;
  statusName: string;
  degreeName: string;
  files: EngineRow[];
  parties: Array<{
    party: EngineRow;
    roleName: string;
    roleCode: string;
    sideName: string;
    sideCode: string;
    fileId: string;
    linkId: string;
    inherited: boolean;
    isOfficeClient: boolean;
  }>;
  hearings: HearingSummary[];
  judgments: JudgmentSummary[];
  tasks: EngineRow[];
  documents: EngineRow[];
  activity: EngineRow[];
  relatedLinks: EngineRow[];
  relatedCases: Array<{
    link: EngineRow;
    legalCase: EngineRow | null;
    relationName: string;
    direction: 'outgoing' | 'incoming';
  }>;
  announcements: EngineRow[];
  notes: EngineRow[];
  alerts: Array<{
    kind: 'warning' | 'danger' | 'info';
    title: string;
    description: string;
    action?: string;
  }>;
  outstandingMinor: number | null;
}

export class CaseService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<CaseRow>> {
    const { db, lookups, cache } = this.deps;
    const f = request.filters;
    const filters: QueryFilter[] = [
      {
        column: 'case_scope',
        op: 'in',
        value: f.scope ? [f.scope] : ['case', 'intake'],
      },
    ];
    const references: Record<string, [string, string]> = {
      status: ['status_id', 'case_status'],
      type: ['case_type_id', 'case_type'],
      degree: ['degree_id', 'litigation_degree'],
      stage: ['stage_type_id', 'stage_type'],
      stageStatus: ['stage_status_id', 'stage_status'],
      priority: ['priority_id', 'priority'],
    };
    for (const [key, [column, list]] of Object.entries(references))
      if (f[key]) {
        const id = lookups.id(list, f[key]);
        if (!id) return { rows: [], total: 0 };
        filters.push({ column, op: 'eq', value: id });
      }
    for (const [key, column] of Object.entries({
      court: 'court_id',
      circuit: 'circuit_id',
      subtype: 'subtype_id',
      nature: 'nature_id',
      file: 'file_id',
      responsible: 'responsible_party_id',
    }))
      if (f[key]) filters.push({ column, op: 'eq', value: f[key]! });
    if (f.year)
      filters.push({ column: 'case_year', op: 'eq', value: Number(f.year) });
    if (f.archived)
      filters.push({
        column: 'archived_at',
        op: f.archived === 'archived' ? 'notNull' : 'isNull',
      });
    if (f.missing === 'true')
      filters.push({ column: 'missing_count', op: 'gt', value: 0 });
    if (f.hasNext)
      filters.push({
        column: 'latest_hearing_at',
        op: f.hasNext === 'yes' ? 'gte' : 'lteOrNull',
        value: db.now(),
      });
    for (const [key, column] of Object.entries({
      hasPre: 'has_pre_stage',
      hasRelated: 'has_related',
      hasAppeal: 'has_appeal',
      hasDocuments: 'has_documents',
      needsNext: 'needs_next',
      hasHearing: 'has_hearing',
    }))
      if (f[key])
        filters.push({ column, op: 'eq', value: f[key] === 'yes' ? 1 : 0 });
    const dateColumn =
      (
        {
          registration: 'registered_on',
          judgment: 'judgment_on',
          last: 'last_action_on',
          followUp: 'follow_up_on',
        } as Record<string, string>
      )[f.dateField ?? 'registration'] ?? 'registered_on';
    if (f.fromDate)
      filters.push({ column: dateColumn, op: 'gte', value: f.fromDate });
    if (f.toDate)
      filters.push({ column: dateColumn, op: 'lte', value: f.toDate });
    if (f.staleBefore)
      filters.push({
        column: 'last_action_on',
        op: 'lteOrNull',
        value: f.staleBefore,
      });
    // Indexed relation reads are paged and retain identifiers only, never full party/stage tables.
    const relationFilter = async (
      entity: string,
      relationFilters: QueryFilter[],
      partyOverride = false,
    ): Promise<void> => {
      const ids = new Set<string>();
      const globals = new Map<string, Set<string>>();
      await eachPage(
        db,
        entity,
        (rows) => {
          for (const row of rows) {
            if (row.case_id) ids.add(String(row.case_id));
            else {
              const fileId = String(row.file_id);
              ids.add(fileId);
              const parties = globals.get(fileId) ?? new Set<string>();
              parties.add(partyOverride ? String(row.party_id) : '*');
              globals.set(fileId, parties);
            }
          }
        },
        { filters: relationFilters },
      );
      const fileIds = [...globals.keys()];
      // SQLite benefits from small indexed IN batches. IDB instead streams a
      // large membership Set once; 50×500 individual seeks are much slower.
      const width =
        db.store.engine === 'indexeddb' ? Math.max(1, fileIds.length) : 500;
      for (let start = 0; start < fileIds.length; start += width) {
        const fileFilter: QueryFilter[] = [
          {
            column: 'file_id',
            op: 'in',
            value: fileIds.slice(start, start + width),
          },
        ];
        const keys = new Set<string>();
        if (partyOverride)
          await eachPage(
            db,
            'case_file_party',
            (rows) => {
              for (const p of rows)
                keys.add(
                  `${String(p.file_id)}:${String(p.party_id)}:${String(p.case_id)}`,
                );
            },
            { filters: [...fileFilter, { column: 'case_id', op: 'notNull' }] },
          );
        await eachPage(
          db,
          'case_file_case',
          (rows) => {
            for (const link of rows) {
              const parties = globals.get(String(link.file_id))!;
              if (
                !partyOverride ||
                [...parties].some(
                  (id) =>
                    !keys.has(
                      `${String(link.file_id)}:${id}:${String(link.case_id)}`,
                    ),
                )
              )
                ids.add(String(link.case_id));
            }
          },
          { filters: fileFilter },
        );
      }
      filters.push({ column: 'entity_id', op: 'in', value: [...ids] });
    };
    if (f.previousType) {
      const id = lookups.id('stage_type', f.previousType);
      if (!id) return { rows: [], total: 0 };
      await relationFilter('procedural_stage', [
        { column: 'type_id', op: 'eq', value: id },
      ]);
    }
    if (f.term) {
      const ids = new Set([f.term]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const term of lookups.allItems('legal_subject'))
          if (term.parentId && ids.has(term.parentId) && !ids.has(term.id)) {
            ids.add(term.id);
            changed = true;
          }
      }
      await relationFilter('case_term', [
        { column: 'term_id', op: 'in', value: [...ids] },
      ]);
    }
    if (f.party || f.role) {
      const rf: QueryFilter[] = [];
      if (f.party) rf.push({ column: 'party_id', op: 'eq', value: f.party });
      if (f.role)
        rf.push({
          column: 'role_id',
          op: 'eq',
          value: lookups.id('party_role', f.role) ?? '',
        });
      await relationFilter('case_file_party', rf, true);
    }
    for (const token of [
      ...new Set(normalizeArabic(request.search).split(/\s+/).filter(Boolean)),
    ])
      filters.push({ column: 'normalized_text', op: 'contains', value: token });
    const sortMap: Record<string, string> = {
      case: 'case_number',
      case_number: 'case_number',
      case_year: 'case_year',
      registration: 'registered_on',
      registration_date: 'registered_on',
      updated: 'updated_at',
      updated_at: 'updated_at',
      subject: 'title',
      next: 'latest_hearing_at',
      lastAction: 'last_action_on',
      followUp: 'follow_up_on',
    };
    const page = await db.queryCaseIndex({
      filters,
      orderBy: [
        {
          column: sortMap[request.sortKey ?? ''] ?? 'updated_at',
          direction: request.sortDir ?? 'desc',
        },
      ],
      ...paginate(request.page, request.pageSize),
    });
    const judicial = page.rows.filter((r) => r.case_scope === 'case');
    const intake = page.rows.filter((r) => r.case_scope === 'intake');
    const cases = await cache.many(
      'legal_case',
      judicial.map((r) => String(r.entity_id)),
    );
    const files = await cache.many(
      'case_file',
      intake.map((r) => String(r.entity_id)),
    );
    const enriched = await this.enrich([...cases.values()]);
    const byId = new Map(
      enriched.map((row) => [String(row.legalCase.id), row]),
    );
    const intakeLinks = intake.length
      ? (
          await relatedRows(db, 'case_file_party', {
            filters: [
              {
                column: 'file_id',
                op: 'in',
                value: intake.map((r) => String(r.entity_id)),
              },
              { column: 'case_id', op: 'isNull' },
            ],
          })
        ).rows
      : [];
    const intakeParties = await cache.many(
      'party',
      intakeLinks.map((l) => String(l.party_id)),
    );
    const intakeNames = (id: string, client: boolean): string[] => [
      ...new Set(
        intakeLinks
          .filter(
            (l) => l.file_id === id && (l.is_office_client === 1) === client,
          )
          .map((l) =>
            String(intakeParties.get(String(l.party_id))?.display_name ?? ''),
          )
          .filter(Boolean),
      ),
    ];
    const rows: CaseRow[] = [];
    for (const index of page.rows) {
      const id = String(index.entity_id);
      let row = byId.get(id);
      if (index.case_scope === 'intake') {
        const file = files.get(id);
        if (!file) continue;
        row = {
          isIntake: true,
          legalCase: {
            ...file,
            case_number: 'لم تُقيد',
            case_year: null,
            case_type_id: file.case_type_id ?? null,
            subject: file.subject ?? file.title ?? null,
          },
          courtName: String(file.title),
          circuitName: 'ملف نزاع قبل القيد',
          caseTypeName: lookups.name(
            'case_type',
            String(file.case_type_id ?? ''),
          ),
          degreeName: 'قبل القيد',
          statusName: 'ملف نزاع',
          clientNames: intakeNames(id, true),
          opponentNames: intakeNames(id, false),
          hearingsCount: 0,
          nextHearingAt: null,
          lastHearingAt: null,
          hasJudgment: false,
          filesCount: 1,
          tasksCount: 0,
          isArchived: !!file.archived_at,
          hasMissingData: Number(index.missing_count) > 0,
          missingReasons: [],
          lastActivityAt: String(file.updated_at),
        };
      }
      if (!row) continue;
      row.fileId = String(index.file_id ?? '');
      if (row.isIntake)
        row.fileNumber = String(row.legalCase.file_number ?? '');
      row.stageName = lookups.name(
        'stage_type',
        String(index.stage_type_id ?? ''),
      );
      row.followUpOn = index.follow_up_on ? String(index.follow_up_on) : null;
      row.lastActionOn = index.last_action_on
        ? String(index.last_action_on)
        : null;
      row.hasMissingData = Number(index.missing_count) > 0;
      row.missingReasons = row.hasMissingData
        ? [
            `${String(index.missing_count)} بند يحتاج استكمالًا — افتح الملف لعرض القائمة`,
          ]
        : [];
      rows.push(row);
    }
    return { rows, total: page.total };
  }

  async indexStats(): Promise<{
    total: number;
    open: number;
    next: number;
    missing: number;
    archived: number;
  }> {
    const db = this.deps.db;
    const base: QueryFilter[] = [
      { column: 'case_scope', op: 'in', value: ['case', 'intake'] },
    ];
    if (db.store.engine === 'indexeddb') {
      const result = { total: 0, archived: 0, open: 0, next: 0, missing: 0 },
        now = db.now();
      for await (const rows of db.store.scan('search_document', {
        filters: base,
      })) {
        for (const row of rows) {
          result.total += 1;
          if (row.archived_at !== null && row.archived_at !== undefined)
            result.archived += 1;
          if (
            typeof row.latest_hearing_at === 'string' &&
            row.latest_hearing_at >= now
          )
            result.next += 1;
          if (Number(row.missing_count) > 0) result.missing += 1;
        }
      }
      result.open = result.total - result.archived;
      return result;
    }
    const count = async (filters: QueryFilter[]): Promise<number> =>
      (await db.queryCaseIndex({ filters: [...base, ...filters], limit: 0 }))
        .total;
    const total = await count([]),
      archived = await count([{ column: 'archived_at', op: 'notNull' }]);
    return {
      total,
      archived,
      open: total - archived,
      next: await count([
        { column: 'latest_hearing_at', op: 'gte', value: db.now() },
      ]),
      missing: await count([{ column: 'missing_count', op: 'gt', value: 0 }]),
    };
  }
  async intake(fileId: string) {
    return getIntake(this.deps, fileId);
  }
  async saveIntake(input: IntakeInput) {
    const result = await saveIntake(this.deps, input);
    if (input.keywords?.length) await this.deps.lookups.refresh(this.deps.db);
    return result;
  }
  async saveStage(input: StageInput) {
    return saveStage(this.deps, input);
  }
  async template(type: string, file?: EngineRow) {
    return templateFor(this.deps, type, file);
  }
  async saveTemplate(template: CaseTemplate) {
    return saveTemplate(this.deps, template);
  }
  async addTerm(input: Parameters<typeof addTerm>[1]) {
    return addTerm(this.deps, input);
  }
  async mergeTerms(sourceId: string, targetId: string) {
    return mergeTerms(this.deps, sourceId, targetId);
  }
  async createCaseFromStage(
    stageId: string,
    input: Omit<IntakeInput, 'fileId' | 'sourceStageId'>,
  ) {
    const stage = await this.deps.db.require('procedural_stage', stageId);
    if (!input.caseNumber?.trim())
      throw new ValidationError('رقم الدعوى القضائية مطلوب لهذه العملية', {
        field: 'caseNumber',
        messageAr: 'أدخل رقم الدعوى المقيدة، أو احتفظ بالملف قبل القيد.',
      });
    return this.saveIntake({
      ...input,
      fileId: String(stage.file_id),
      sourceStageId: stageId,
    });
  }
  async createRelatedCase(
    originalCaseId: string,
    input: IntakeInput,
    relationCode: string,
    judgmentId?: string,
  ) {
    return this.deps.db.transaction(async () => {
      await this.deps.db.require('legal_case', originalCaseId);
      const saved = await this.saveIntake({
        ...input,
        relatedCaseId: originalCaseId,
        relationCode,
      });
      if (!saved.legalCase)
        throw new ValidationError('الدرجة الجديدة تحتاج رقمًا وسنة مستقلين', {
          field: 'caseNumber',
          messageAr: 'أدخل رقم الدرجة الجديدة وسنتها.',
        });
      if (judgmentId) {
        const judgment = await this.deps.db.require('judgment', judgmentId);
        if (judgment.case_id !== originalCaseId)
          throw new ValidationError('الحكم لا يتبع القضية الأصلية');
        const code =
          relationCode === 'cassation_of'
            ? 'cassation'
            : relationCode === 'opposition_of'
              ? 'opposition'
              : relationCode === 'retrial_of'
                ? 'retrial'
                : relationCode === 'appeal_of'
                  ? 'appeal'
                  : 'other';
        await this.deps.db.insert('judgment_appeal', {
          judgment_id: judgmentId,
          appeal_type_id: this.deps.lookups.id('appeal_type', code),
          filed_on: input.registrationDate || null,
          user_deadline_on: null,
          status_id: null,
          reference_no: input.caseNumber || null,
          notes: 'تسجيل يدوي من الأوراق، بلا حساب موعد',
          appeal_case_id: saved.legalCase.id,
          authority_id: input.courtId || null,
        });
      }
      return saved;
    });
  }

  private async enrich(cases: readonly EngineRow[]): Promise<CaseRow[]> {
    const { db, lookups, cache } = this.deps;
    const now = db.now();
    const rows: CaseRow[] = [];
    // Batch fetch courts, circuits, hearings aggregates to reduce N+1 where possible
    const courtIds = [
      ...new Set(
        cases
          .map((c) => (c.court_id ? String(c.court_id) : null))
          .filter(Boolean as never),
      ),
    ] as string[];
    const circuitIds = [
      ...new Set(
        cases
          .map((c) => (c.circuit_id ? String(c.circuit_id) : null))
          .filter(Boolean as never),
      ),
    ] as string[];
    const courts = await cache.many('court', courtIds);
    const circuits = await cache.many('court_circuit', circuitIds);
    // Batch hearings for all cases (up to 25 cases)
    const caseIds = cases.map((c) => String(c.id));
    const hearingsByCase = new Map<string, EngineRow[]>();
    const hearingsPage = await relatedRows(db, 'hearing', {
      filters: [{ column: 'case_id', op: 'in', value: caseIds }],
      limit: 2000,
      orderBy: [{ column: 'scheduled_at', direction: 'asc' }],
    });
    for (const h of hearingsPage.rows) {
      const cid = String(h.case_id);
      const list = hearingsByCase.get(cid) ?? [];
      list.push(h as EngineRow);
      hearingsByCase.set(cid, list);
    }
    // Batch file links
    const fileLinks = await relatedRows(db, 'case_file_case', {
      filters: [{ column: 'case_id', op: 'in', value: caseIds }],
      limit: 2000,
    });
    const fileIdsByCase = new Map<string, string[]>();
    for (const link of fileLinks.rows) {
      const cid = String(link.case_id);
      const list = fileIdsByCase.get(cid) ?? [];
      list.push(String(link.file_id));
      fileIdsByCase.set(cid, list);
    }
    // Batch party links for all file ids
    const allFileIds = [...new Set([...fileIdsByCase.values()].flat())];
    let partyLinksByFile = new Map<string, EngineRow[]>();
    let partyCache = new Map<string, EngineRow>();
    if (allFileIds.length > 0) {
      const pl = await relatedRows(db, 'case_file_party', {
        filters: [{ column: 'file_id', op: 'in', value: allFileIds }],
        limit: 3000,
      });
      for (const link of pl.rows) {
        const fid = String(link.file_id);
        const list = partyLinksByFile.get(fid) ?? [];
        list.push(link as EngineRow);
        partyLinksByFile.set(fid, list);
      }
      const partyIds = [...new Set(pl.rows.map((r) => String(r.party_id)))];
      partyCache = await cache.many('party', partyIds);
    }
    // Batch judgments count
    const judgmentsPage = await relatedRows(db, 'judgment', {
      filters: [{ column: 'case_id', op: 'in', value: caseIds }],
      limit: 2000,
    });
    const judgmentsCountByCase = new Map<string, number>();
    for (const j of judgmentsPage.rows) {
      const cid = String(j.case_id);
      judgmentsCountByCase.set(cid, (judgmentsCountByCase.get(cid) ?? 0) + 1);
    }
    // Batch tasks count
    const tasksPage = await relatedRows(db, 'task', {
      filters: [{ column: 'case_id', op: 'in', value: caseIds }],
      limit: 2000,
    });
    const tasksCountByCase = new Map<string, number>();
    for (const t of tasksPage.rows) {
      const cid = String(t.case_id);
      tasksCountByCase.set(cid, (tasksCountByCase.get(cid) ?? 0) + 1);
    }

    for (const legalCase of cases) {
      const cid = String(legalCase.id);
      const court = legalCase.court_id
        ? courts.get(String(legalCase.court_id))
        : null;
      const circuit = legalCase.circuit_id
        ? circuits.get(String(legalCase.circuit_id))
        : null;
      const hearings = hearingsByCase.get(cid) ?? [];
      const next = hearings.find(
        (h) =>
          String(h.scheduled_at) >= now &&
          h.status_id !== lookups.id('hearing_status', 'cancelled'),
      );
      const last = [...hearings]
        .reverse()
        .find((h) => String(h.scheduled_at) < now);
      const fileIds = fileIdsByCase.get(cid) ?? [];
      // Derive client / opponent names from party links
      const clientNames: string[] = [];
      const opponentNames: string[] = [];
      const seenParties = new Set<string>();
      for (const fid of fileIds) {
        const links = scopedPartyLinks(partyLinksByFile.get(fid) ?? [], cid);
        for (const link of links) {
          const party = partyCache.get(String(link.party_id));
          if (!party) continue;
          const pid = String(party.id);
          if (seenParties.has(pid)) continue;
          seenParties.add(pid);
          const display = String(party.display_name ?? '');
          if (link.is_office_client === 1) clientNames.push(display);
          else opponentNames.push(display);
        }
      }
      const missing = this.missingReasons(legalCase);
      rows.push({
        legalCase,
        courtName: court ? String(court.name) : '—',
        circuitName: circuit ? String(circuit.name) : '—',
        caseTypeName:
          lookups.byId(String(legalCase.case_type_id ?? ''))?.nameAr ?? '—',
        degreeName:
          lookups.byId(String(legalCase.litigation_degree_id ?? ''))?.nameAr ??
          '—',
        statusName:
          lookups.byId(String(legalCase.status_id ?? ''))?.nameAr ?? '—',
        clientNames,
        opponentNames,
        hearingsCount: hearings.length,
        nextHearingAt: next ? String(next.scheduled_at) : null,
        lastHearingAt: last ? String(last.scheduled_at) : null,
        hasJudgment: (judgmentsCountByCase.get(cid) ?? 0) > 0,
        filesCount: fileIds.length,
        tasksCount: tasksCountByCase.get(cid) ?? 0,
        isArchived: Boolean(legalCase.archived_at),
        hasMissingData: missing.length > 0,
        missingReasons: missing,
        lastActivityAt: legalCase.updated_at
          ? String(legalCase.updated_at)
          : null,
      });
    }
    return rows;
  }

  missingReasons(legalCase: EngineRow): string[] {
    const reasons: string[] = [];
    if (!legalCase.court_id) reasons.push('المحكمة غير مسجلة');
    if (!legalCase.case_type_id) reasons.push('نوع الدعوى غير محدد');
    if (!legalCase.subject || String(legalCase.subject).trim().length < 5)
      reasons.push('موضوع الدعوى ناقص');
    if (!legalCase.registration_date) reasons.push('تاريخ القيد غير مسجل');
    return reasons;
  }

  async get(caseId: string): Promise<CaseDetail | null> {
    const { db, lookups, cache } = this.deps;
    let full;
    try {
      full = await db.getCaseFull(caseId);
    } catch {
      return null;
    }
    if (!full) return null;
    const court = await cache.get(
      'court',
      full.legalCase.court_id ? String(full.legalCase.court_id) : null,
    );
    const circuit = await cache.get(
      'court_circuit',
      full.legalCase.circuit_id ? String(full.legalCase.circuit_id) : null,
    );
    const parties: CaseDetail['parties'] = [];
    const fileIds = full.files.map((f) => String(f.id));
    const fileLinks = fileIds.length
      ? (
          await relatedRows(db, 'case_file_party', {
            filters: [{ column: 'file_id', op: 'in', value: fileIds }],
          })
        ).rows
      : [];
    const directLinks = (
      await relatedRows(db, 'case_file_party', {
        filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      })
    ).rows;
    const scoped = scopedPartyLinks(
      [
        ...new Map(
          [...fileLinks, ...directLinks].map((link) => [String(link.id), link]),
        ).values(),
      ],
      caseId,
    );
    const partyMap = await cache.many(
      'party',
      scoped.map((l) => String(l.party_id)),
    );
    const seen = new Set<string>();
    for (const link of scoped) {
      const key = `${String(link.file_id)}:${String(link.party_id)}:${String(link.role_id)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const party = partyMap.get(String(link.party_id));
      if (!party) continue;
      parties.push({
        party,
        roleName: lookups.byId(String(link.role_id))?.nameAr ?? '—',
        roleCode: lookups.byId(String(link.role_id))?.code ?? '',
        sideName: lookups.byId(String(link.side_id))?.nameAr ?? '—',
        sideCode: lookups.byId(String(link.side_id))?.code ?? '',
        fileId: String(link.file_id),
        linkId: String(link.id),
        inherited: !link.case_id,
        isOfficeClient: link.is_office_client === 1,
      });
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
      typeName:
        lookups.byId(String(judgment.judgment_type_id ?? ''))?.nameAr ?? '—',
      statusName: lookups.byId(String(judgment.status_id ?? ''))?.nameAr ?? '—',
    }));
    const tasks = (
      await relatedRows(db, 'task', {
        filters: [{ column: 'case_id', op: 'eq', value: caseId }],
        orderBy: [{ column: 'due_at', direction: 'asc' }],
        limit: 100,
      })
    ).rows as EngineRow[];
    const docLinks = await relatedRows(db, 'document_link', {
      filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      limit: 100,
    });
    const docs: EngineRow[] = [];
    for (const link of docLinks.rows) {
      const doc = await db.get('document', String(link.document_id));
      if (doc) docs.push(doc);
    }
    // Announcements: via tasks linked to this case
    const taskIds = tasks.map((t) => String(t.id));
    let announcements: EngineRow[] = [];
    if (taskIds.length > 0) {
      const ann = await relatedRows(db, 'announcement', {
        filters: [{ column: 'task_id', op: 'in', value: taskIds }],
        limit: 100,
      });
      announcements = ann.rows as EngineRow[];
    }
    // Notes for this case (via case_id or via file)
    let notes: EngineRow[] = [];
    {
      const byCase = await relatedRows(db, 'case_note', {
        filters: [{ column: 'case_id', op: 'eq', value: caseId }],
        limit: 100,
      });
      notes = byCase.rows as EngineRow[];
      if (fileIds.length > 0) {
        const byFile = await relatedRows(db, 'case_note', {
          filters: [
            { column: 'file_id', op: 'in', value: fileIds },
            { column: 'case_id', op: 'isNull' },
          ],
          limit: 100,
        });
        for (const n of byFile.rows) {
          if (String((n as EngineRow).case_id) === caseId) continue;
          if (notes.some((x) => String(x.id) === String((n as EngineRow).id)))
            continue;
          notes.push(n as EngineRow);
        }
      }
      notes.sort((a, b) =>
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
      );
    }
    // Related cases via legal_case_link
    const outgoing = await relatedRows(db, 'legal_case_link', {
      filters: [{ column: 'source_case_id', op: 'eq', value: caseId }],
      limit: 100,
    });
    const incoming = await relatedRows(db, 'legal_case_link', {
      filters: [{ column: 'target_case_id', op: 'eq', value: caseId }],
      limit: 100,
    });
    const relatedLinks = [...outgoing.rows, ...incoming.rows] as EngineRow[];
    const relatedCases: CaseDetail['relatedCases'] = [];
    for (const link of relatedLinks) {
      const isOutgoing = String(link.source_case_id) === caseId;
      const otherId = isOutgoing
        ? String(link.target_case_id)
        : String(link.source_case_id);
      const other = await db.get('legal_case', otherId);
      relatedCases.push({
        link: link as EngineRow,
        legalCase: other as EngineRow | null,
        relationName:
          lookups.byId(String(link.relation_type_id ?? ''))?.nameAr ?? 'مرتبطة',
        direction: isOutgoing ? 'outgoing' : 'incoming',
      });
    }

    const activity = await db.auditTrail('legal_case', caseId, 40);
    // Compute alerts
    const alerts = this.computeAlerts(
      full.legalCase as EngineRow,
      hearings,
      tasks,
      parties,
      announcements,
    );

    // Outstanding finance via files: sum charges not yet paid
    let outstandingMinor: number | null = null;
    if (fileIds.length > 0) {
      try {
        const charges = await relatedRows(db, 'financial_charge', {
          filters: [{ column: 'file_id', op: 'in', value: fileIds }],
          limit: 100,
        });
        let total = 0;
        let has = false;
        for (const ch of charges.rows) {
          const crow = ch as EngineRow;
          if (crow.status_id === lookups.id('charge_status', 'cancelled'))
            continue;
          const bal = await db.chargeBalance(String(crow.id));
          if (bal.outstandingMinor > 0) {
            total += bal.outstandingMinor;
            has = true;
          }
        }
        outstandingMinor = has ? total : 0;
      } catch {
        outstandingMinor = null;
      }
    }

    return {
      legalCase: full.legalCase as EngineRow,
      courtName: court ? String(court.name) : '—',
      circuitName: circuit ? String(circuit.name) : '—',
      caseTypeName:
        lookups.byId(String(full.legalCase.case_type_id ?? ''))?.nameAr ?? '—',
      statusName:
        lookups.byId(String(full.legalCase.status_id ?? ''))?.nameAr ?? '—',
      degreeName:
        lookups.byId(String(full.legalCase.litigation_degree_id ?? ''))
          ?.nameAr ?? '—',
      files: full.files as EngineRow[],
      parties,
      hearings,
      judgments,
      tasks,
      documents: docs,
      activity: activity as EngineRow[],
      relatedLinks: relatedLinks as EngineRow[],
      relatedCases,
      announcements,
      notes,
      alerts,
      outstandingMinor,
    };
  }

  private computeAlerts(
    legalCase: EngineRow,
    hearings: HearingSummary[],
    tasks: EngineRow[],
    parties: CaseDetail['parties'],
    announcements: EngineRow[],
  ): CaseDetail['alerts'] {
    const alerts: CaseDetail['alerts'] = [];
    const now = new Date().toISOString();
    const hasNext = hearings.some((h) => String(h.hearing.scheduled_at) >= now);
    const hasPastUnrecorded = hearings.some(
      (h) =>
        String(h.hearing.scheduled_at) < now &&
        !h.hearing.held_at &&
        h.hearing.status_id ===
          this.deps.lookups.id('hearing_status', 'scheduled'),
    );
    if (hasPastUnrecorded)
      alerts.push({
        kind: 'warning',
        title: 'جلسة سابقة بلا نتيجة مسجلة',
        description:
          'هناك جلسة انعقد موعدها دون تسجيل ما حدث فيها. سجّل نتيجة الجلسة لتحديث سير القضية.',
      });
    if (!hasNext && hearings.length > 0)
      alerts.push({
        kind: 'info',
        title: 'لا توجد جلسة قادمة',
        description:
          'لم يتم تحديد موعد للجلسة التالية. أضف جلسة جديدة عند معرفة الموعد.',
      });
    if (!legalCase.court_id)
      alerts.push({
        kind: 'danger',
        title: 'بيانات المحكمة ناقصة',
        description:
          'القضية بلا محكمة محددة. أضف المحكمة والدائرة لضمان صحة السجلات والتنبيهات.',
      });
    if (!legalCase.subject || String(legalCase.subject).trim().length < 10)
      alerts.push({
        kind: 'warning',
        title: 'موضوع الدعوى غير مكتمل',
        description:
          'أضف وصفًا مختصرًا لموضوع الدعوى والطلبات ليتعرف الفريق على مضمونها بسرعة.',
      });
    if (parties.length === 0)
      alerts.push({
        kind: 'warning',
        title: 'لا أطراف مرتبطة',
        description:
          'القضية بلا أطراف مسجلة. اربط الموكل والخصوم من خلال ملف القضية.',
      });
    else if (parties.some((p) => !p.roleCode || p.roleName === '—'))
      alerts.push({
        kind: 'info',
        title: 'صفة بعض الأطراف غير محددة',
        description: 'راجع صفات الأطراف وتأكد من تحديد دور كل طرف في الدعوى.',
      });
    const overdueTasks = tasks.filter(
      (t) =>
        t.due_at &&
        String(t.due_at) < now &&
        !['completed', 'cancelled'].includes(
          this.deps.lookups.byId(String(t.status_id ?? ''))?.code ?? '',
        ),
    );
    if (overdueTasks.length > 0)
      alerts.push({
        kind: 'danger',
        title: `${overdueTasks.length} عمل إداري متأخر`,
        description:
          'هناك أعمال تجاوز موعد استحقاقها. راجع قائمة الأعمال الإدارية داخل القضية.',
      });
    const unserved = announcements.filter((a) => !a.served_on);
    if (unserved.length > 0)
      alerts.push({
        kind: 'info',
        title: 'إعلانات بلا تأكيد تسليم',
        description: `يوجد ${unserved.length} إجراء إعلان لم تُسجل نتيجته بعد.`,
      });
    if (
      !hasNext &&
      tasks.length === 0 &&
      legalCase.status_id !== this.deps.lookups.id('case_status', 'closed')
    ) {
      // gentle hint for stagnant case: no future hearing and no open tasks, not recently updated
      const daysSinceUpdate = legalCase.updated_at
        ? (Date.now() - new Date(String(legalCase.updated_at)).getTime()) /
          86400000
        : 999;
      if (daysSinceUpdate > 30)
        alerts.push({
          kind: 'info',
          title: 'القضية لم تُحدّث منذ فترة',
          description:
            'مرّ أكثر من 30 يومًا دون تحديث. راجع بياناتها للتأكد من اكتمالها.',
        });
    }
    return alerts;
  }

  async create(input: {
    caseNumber: string;
    caseYear: number;
    caseTypeCode?: string;
    courtId?: string;
    circuitId?: string;
    fileIds?: readonly string[];
    litigationDegreeCode?: string;
    subject?: string;
    statusCode?: string;
    claimAmountMinor?: number;
    currencyCode?: string;
    registrationDate?: string;
    notes?: string;
  }): Promise<EngineRow> {
    const { db, lookups } = this.deps;
    if (!input.caseNumber.trim())
      throw new ValidationError('case number is required');
    return db.transaction(async () => {
      const legalCase = await db.createCase({
        caseNumber: input.caseNumber.trim(),
        caseYear: input.caseYear,
        ...(input.caseTypeCode ? { caseTypeCode: input.caseTypeCode } : {}),
        ...(input.courtId ? { courtId: input.courtId } : {}),
        ...(input.fileIds ? { fileIds: input.fileIds } : {}),
        ...(input.litigationDegreeCode
          ? { litigationDegreeCode: input.litigationDegreeCode }
          : {}),
        ...(input.subject ? { subject: input.subject } : {}),
      });
      const patch: Record<string, unknown> = {};
      if (input.circuitId) patch.circuit_id = input.circuitId;
      if (input.statusCode)
        patch.status_id = lookups.id('case_status', input.statusCode);
      if (input.claimAmountMinor !== undefined)
        patch.claim_amount_minor = input.claimAmountMinor;
      if (input.currencyCode) patch.currency_code = input.currencyCode;
      if (input.registrationDate)
        patch.registration_date = input.registrationDate;
      if (input.notes) patch.notes = input.notes;
      if (patch.circuit_id) {
        const courtId = (input.courtId ??
          (legalCase.court_id as string | null) ??
          null) as string | null;
        if (!courtId) throw new ValidationError('الدائرة تتطلب محكمة');
        const circuit = await db.get('court_circuit', String(patch.circuit_id));
        if (!circuit) throw new ValidationError('الدائرة غير موجودة');
        if (String(circuit.court_id) !== String(courtId))
          throw new ValidationError('الدائرة لا تتبع المحكمة المختارة');
      }
      if (Object.keys(patch).length > 0)
        await db.update('legal_case', String(legalCase.id), patch);
      this.deps.cache.invalidate();
      return (await db.get('legal_case', String(legalCase.id))) ?? legalCase;
    });
  }

  async update(
    caseId: string,
    patch: Record<string, unknown>,
  ): Promise<EngineRow> {
    const lookups = this.deps.lookups;
    const mapped: Record<string, unknown> = { ...patch };
    if (typeof patch.caseTypeCode === 'string') {
      mapped.case_type_id = lookups.id(
        'case_type',
        patch.caseTypeCode as string,
      );
      delete mapped.caseTypeCode;
    }
    if (typeof patch.litigationDegreeCode === 'string') {
      mapped.litigation_degree_id = lookups.id(
        'litigation_degree',
        patch.litigationDegreeCode as string,
      );
      delete mapped.litigationDegreeCode;
    }
    if (typeof patch.statusCode === 'string') {
      mapped.status_id = lookups.id('case_status', patch.statusCode as string);
      delete mapped.statusCode;
    }
    for (const key of [
      'court_id',
      'circuit_id',
      'subject',
      'notes',
      'registration_date',
    ]) {
      if (mapped[key] === '') mapped[key] = null;
    }
    // Validate circuit belongs to court if both provided or if circuit provided we fetch existing court
    const existing = await this.deps.db.require('legal_case', caseId);
    const nextCourtId =
      'court_id' in mapped ? mapped.court_id : existing.court_id;
    const nextCircuitId = (
      'circuit_id' in mapped ? mapped.circuit_id : existing.circuit_id
    ) as string | null | undefined;
    if (nextCircuitId) {
      if (!nextCourtId)
        throw new ValidationError('الدائرة تتطلب تحديد المحكمة');
      const circuit = await this.deps.db.get('court_circuit', nextCircuitId);
      if (!circuit) throw new ValidationError('الدائرة غير موجودة');
      if (String(circuit.court_id) !== String(nextCourtId))
        throw new ValidationError('الدائرة لا تتبع المحكمة المختارة');
    }
    const updated = await this.deps.db.update('legal_case', caseId, mapped);
    this.deps.cache.invalidate('legal_case', caseId);
    return updated;
  }

  async archive(caseId: string): Promise<EngineRow> {
    const updated = await this.deps.db.update('legal_case', caseId, {
      archived_at: new Date().toISOString(),
    });
    this.deps.cache.invalidate('legal_case', caseId);
    return updated;
  }

  async restoreArchived(caseId: string): Promise<EngineRow> {
    const updated = await this.deps.db.update('legal_case', caseId, {
      archived_at: null,
    });
    this.deps.cache.invalidate('legal_case', caseId);
    return updated;
  }

  async softDelete(caseId: string): Promise<void> {
    await this.deps.db.softDelete('legal_case', caseId, 'حذف قضية');
    this.deps.cache.invalidate();
  }

  async restore(caseId: string): Promise<void> {
    await this.deps.db.restore('legal_case', caseId);
    this.deps.cache.invalidate();
  }

  async linkFile(
    caseId: string,
    fileId: string,
    relationTypeCode = 'related',
  ): Promise<void> {
    await this.deps.db.linkCase(caseId, fileId);
    // also allow custom relation type by updating the link row
    const links = await this.deps.db.query('case_file_case', {
      filters: [
        { column: 'case_id', op: 'eq', value: caseId },
        { column: 'file_id', op: 'eq', value: fileId },
      ],
      limit: 1,
    });
    const link = links.rows[0] as EngineRow | undefined;
    if (link && relationTypeCode !== 'related') {
      const relId = this.deps.lookups.id(
        'file_relation_type',
        relationTypeCode,
      );
      if (relId)
        await this.deps.db.update('case_file_case', String(link.id), {
          relation_type_id: relId,
        });
    }
    this.deps.cache.invalidate();
  }

  async unlinkFile(caseId: string, fileId: string): Promise<void> {
    const links = await this.deps.db.query('case_file_case', {
      filters: [
        { column: 'case_id', op: 'eq', value: caseId },
        { column: 'file_id', op: 'eq', value: fileId },
      ],
      limit: 10,
    });
    for (const link of links.rows)
      await this.deps.db.softDelete(
        'case_file_case',
        String((link as EngineRow).id),
      );
    this.deps.cache.invalidate();
  }

  async addParty(input: {
    caseId: string;
    fileId: string;
    partyId: string;
    roleCode: string;
    sideCode?: string;
    isClient?: boolean;
  }): Promise<EngineRow> {
    const { db } = this.deps;
    // Insert via case_file_party with case_id reference; we use db.insert directly to keep case_id
    const roleId =
      this.deps.lookups.id('party_role', input.roleCode) ??
      this.deps.lookups.id('party_role', 'other')!;
    const sideId = input.sideCode
      ? this.deps.lookups.id('party_side', input.sideCode)
      : null;
    const existing = await db.query('case_file_party', {
      filters: [
        { column: 'file_id', op: 'eq', value: input.fileId },
        { column: 'party_id', op: 'eq', value: input.partyId },
      ],
      limit: 50,
    });
    if (
      existing.rows.some(
        (r) =>
          r.case_id === input.caseId &&
          String((r as EngineRow).role_id) === roleId,
      )
    ) {
      throw new ValidationError('هذا الطرف مرتبط بالملف بهذه الصفة مسبقًا');
    }
    const ordinal = 10;
    const row = await db.insert('case_file_party', {
      file_id: input.fileId,
      case_id: input.caseId,
      party_id: input.partyId,
      role_id: roleId,
      side_id: sideId,
      ordinal,
      is_office_client: (input.isClient ?? input.roleCode === 'client') ? 1 : 0,
      is_primary: 0,
      start_date: null,
      end_date: null,
      notes: null,
    });
    this.deps.cache.invalidate();
    return row;
  }

  async updatePartyRole(
    linkId: string,
    roleCode: string,
    sideCode?: string,
    isClient?: boolean,
    caseId?: string,
  ): Promise<EngineRow> {
    const { db, lookups } = this.deps;
    const roleId = lookups.id('party_role', roleCode);
    if (!roleId) throw new ValidationError(`صفة غير معروفة: ${roleCode}`);
    return db.transaction(async () => {
      const link = await db.require('case_file_party', linkId);
      if (caseId && link.case_id !== caseId) {
        const result = await this.addParty({
          fileId: String(link.file_id),
          caseId,
          partyId: String(link.party_id),
          roleCode,
          ...(sideCode ? { sideCode } : {}),
          isClient: isClient ?? link.is_office_client === 1,
        });
        return result;
      }
      const patch: Record<string, unknown> = { role_id: roleId };
      if (sideCode !== undefined)
        patch.side_id = sideCode ? lookups.id('party_side', sideCode) : null;
      if (isClient !== undefined) patch.is_office_client = isClient ? 1 : 0;
      const updated = await db.update('case_file_party', linkId, patch);
      this.deps.cache.invalidate();
      return updated;
    });
  }

  async removeParty(linkId: string): Promise<void> {
    await this.deps.db.softDelete(
      'case_file_party',
      linkId,
      'إزالة طرف من القضية',
    );
    this.deps.cache.invalidate();
  }

  async linkCases(
    sourceCaseId: string,
    targetCaseId: string,
    relationTypeCode = 'related',
    notes?: string,
  ): Promise<EngineRow> {
    if (sourceCaseId === targetCaseId)
      throw new ValidationError('لا يمكن ربط القضية بنفسها');
    const relId =
      this.deps.lookups.id('case_relation_type', relationTypeCode) ??
      this.deps.lookups.id('case_relation_type', 'related')!;
    // prevent duplicate link
    const existing = await this.deps.db.query('legal_case_link', {
      filters: [
        { column: 'source_case_id', op: 'eq', value: sourceCaseId },
        { column: 'target_case_id', op: 'eq', value: targetCaseId },
      ],
      limit: 10,
    });
    if (
      existing.rows.some(
        (r) => String((r as EngineRow).relation_type_id) === relId,
      )
    )
      throw new ValidationError('هذا الارتباط موجود مسبقًا');
    // Prevent circular via simple check: target already links back to source with same type? Still allowed except self.
    const row = await this.deps.db.insert('legal_case_link', {
      source_case_id: sourceCaseId,
      target_case_id: targetCaseId,
      relation_type_id: relId,
      notes: notes ?? null,
    });
    this.deps.cache.invalidate();
    return row;
  }

  async unlinkCases(linkId: string): Promise<void> {
    await this.deps.db.softDelete('legal_case_link', linkId);
    this.deps.cache.invalidate();
  }

  async createTask(input: {
    caseId: string;
    title: string;
    taskTypeCode?: string;
    dueAt?: string;
    description?: string;
    fileId?: string;
  }): Promise<EngineRow> {
    const task = await this.deps.db.createTask({
      title: input.title,
      ...(input.taskTypeCode ? { taskTypeCode: input.taskTypeCode } : {}),
      ...(input.fileId ? { fileId: input.fileId } : {}),
      caseId: input.caseId,
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      ...(input.description ? { description: input.description } : {}),
    });
    this.deps.cache.invalidate();
    return task;
  }

  async changeTaskStatus(
    taskId: string,
    statusCode: string,
  ): Promise<EngineRow> {
    const task = await this.deps.db.changeTaskStatus(taskId, statusCode);
    this.deps.cache.invalidate();
    return task;
  }

  async addNote(input: {
    caseId: string;
    fileId: string;
    body: string;
    isPrivate?: boolean;
  }): Promise<EngineRow> {
    if (!input.body.trim()) throw new ValidationError('نص الملاحظة مطلوب');
    const note = await this.deps.db.insert('case_note', {
      file_id: input.fileId,
      case_id: input.caseId,
      body: input.body.trim(),
      is_private: input.isPrivate ? 1 : 0,
    });
    this.deps.cache.invalidate();
    return note;
  }

  async linkDocument(documentId: string, caseId: string): Promise<EngineRow> {
    const link = await this.deps.db.linkDocument(documentId, {
      kind: 'case',
      id: caseId,
    });
    this.deps.cache.invalidate();
    return link;
  }

  async unlinkDocument(linkId: string): Promise<void> {
    await this.deps.db.softDelete('document_link', linkId);
    this.deps.cache.invalidate();
  }

  async bulkArchive(caseIds: readonly string[]): Promise<{
    succeeded: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of caseIds) {
      try {
        await this.archive(id);
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { succeeded, failed };
  }

  async bulkChangeStatus(
    caseIds: readonly string[],
    statusCode: string,
  ): Promise<{
    succeeded: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    const statusId = this.deps.lookups.id('case_status', statusCode);
    if (!statusId) throw new ValidationError(`حالة غير معروفة: ${statusCode}`);
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of caseIds) {
      try {
        await this.deps.db.update('legal_case', id, { status_id: statusId });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    this.deps.cache.invalidate();
    return { succeeded, failed };
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

  async recordHearing(
    hearingId: string,
    input: { statusCode?: string; outcomeSummary?: string; heldAt?: string },
  ): Promise<EngineRow> {
    const updated = await this.deps.db.recordHearing(hearingId, {
      ...(input.statusCode ? { statusCode: input.statusCode } : {}),
      ...(input.outcomeSummary !== undefined
        ? { outcomeSummary: input.outcomeSummary }
        : {}),
      ...(input.heldAt ? { heldAt: input.heldAt } : {}),
    });
    this.deps.cache.invalidate();
    return updated;
  }

  async scheduleNext(
    previousHearingId: string,
    scheduledAt: string,
  ): Promise<EngineRow> {
    const next = await this.deps.db.scheduleNextHearing(previousHearingId, {
      scheduledAt,
    });
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
      ...(input.judgmentTypeCode
        ? { judgmentTypeCode: input.judgmentTypeCode }
        : {}),
      ...(input.operativePart ? { operativePart: input.operativePart } : {}),
      ...(input.reasoning ? { reasoning: input.reasoning } : {}),
      ...(input.fileIds ? { fileIds: input.fileIds } : {}),
    });
    if (input.statusCode) {
      await db.update('judgment', String(judgment.id), {
        status_id: lookups.id('judgment_status', input.statusCode),
      });
    }
    this.deps.cache.invalidate();
    return judgment;
  }

  async searchOptions(
    query: string,
    limit = 12,
  ): Promise<Array<{ value: string; label: string; description?: string }>> {
    const { db } = this.deps;
    const page = query.trim()
      ? await db.searchPage(query.trim(), {
          entityType: 'legal_case',
          limit: Math.min(50, limit * 3),
        })
      : null;
    if (!page) {
      const recent = await db.query('legal_case', {
        orderBy: [{ column: 'registration_date', direction: 'desc' }],
        limit,
      });
      return recent.rows.map((row) => ({
        value: String((row as EngineRow).id),
        label: `قضية ${(row as EngineRow).case_number} / ${(row as EngineRow).case_year}`,
        ...((row as EngineRow).subject
          ? { description: String((row as EngineRow).subject) }
          : {}),
      }));
    }
    const options: Array<{
      value: string;
      label: string;
      description?: string;
    }> = [];
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

  async authorityOptions(
    query: string,
  ): Promise<Array<{ value: string; label: string }>> {
    if (query.trim())
      return (
        await this.deps.db.searchPage(query, { entityType: 'court', limit: 20 })
      ).hits.map((hit) => ({ value: hit.entityId, label: hit.title }));
    return (
      await this.deps.db.query('court', {
        orderBy: [{ column: 'name', direction: 'asc' }],
        limit: 20,
      })
    ).rows.map((c) => ({ value: String(c.id), label: String(c.name) }));
  }

  async courts(): Promise<EngineRow[]> {
    return (
      await relatedRows(this.deps.db, 'court', {
        orderBy: [{ column: 'name', direction: 'asc' }],
      })
    ).rows;
  }

  async circuits(courtId?: string): Promise<EngineRow[]> {
    if (!courtId)
      return (
        await relatedRows(this.deps.db, 'court_circuit', {
          orderBy: [{ column: 'name', direction: 'asc' }],
        })
      ).rows;
    return (
      await relatedRows(this.deps.db, 'court_circuit', {
        filters: [{ column: 'court_id', op: 'eq', value: courtId }],
        orderBy: [{ column: 'name', direction: 'asc' }],
      })
    ).rows;
  }
}
