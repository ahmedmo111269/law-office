import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';
import type { HearingSummary, JudgmentSummary } from './files.ts';

export interface CaseRow {
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
  parties: Array<{ party: EngineRow; roleName: string; roleCode: string; sideName: string; fileId: string; linkId: string }>;
  hearings: HearingSummary[];
  judgments: JudgmentSummary[];
  tasks: EngineRow[];
  documents: EngineRow[];
  activity: EngineRow[];
  relatedLinks: EngineRow[];
  relatedCases: Array<{ link: EngineRow; legalCase: EngineRow | null; relationName: string; direction: 'outgoing' | 'incoming' }>;
  announcements: EngineRow[];
  notes: EngineRow[];
  alerts: Array<{ kind: 'warning' | 'danger' | 'info'; title: string; description: string; action?: string }>;
  outstandingMinor: number | null;
}

export class CaseService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<CaseRow>> {
    const { db, lookups } = this.deps;
    const statusId = request.filters.status ? lookups.id('case_status', request.filters.status) : null;
    const typeId = request.filters.type ? lookups.id('case_type', request.filters.type) : null;
    const degreeId = request.filters.degree ? lookups.id('litigation_degree', request.filters.degree) : null;
    const courtFilter = request.filters.court || null;
    const yearFilter = request.filters.year ? Number(request.filters.year) : null;
    const archivedFilter = request.filters.archived || null; // values: 'archived' | 'active' | '' 
    const missingFilter = request.filters.missing || null; // 'true'
    const hasNextFilter = request.filters.hasNext || null; // 'yes' | 'no'
    const fileFilter = request.filters.file || null;
    const searchRaw = request.search.trim();

    // Fast path: file filter direct
    let candidateCaseIdsForFile: Set<string> | null = null;
    if (fileFilter) {
      const links = await db.query('case_file_case', { filters: [{ column: 'file_id', op: 'eq', value: fileFilter }], limit: 2000 });
      candidateCaseIdsForFile = new Set(links.rows.map((r) => String(r.case_id)));
      if (candidateCaseIdsForFile.size === 0) return { rows: [], total: 0 };
    }

    // If search present, use hybrid search to get candidates
    if (searchRaw) {
      const candidateIds = await this.searchCandidateIds(searchRaw);
      // Also include direct contains matches already in searchCandidateIds, so we have union
      const allIds = [...candidateIds];
      // Filter by other criteria in memory after enrichment?
      // For search we need to respect filters, so we will fetch cases for those ids, filter, then sort & paginate.
      let cases: EngineRow[] = [];
      for (const id of allIds) {
        // Check file filter
        if (candidateCaseIdsForFile && !candidateCaseIdsForFile.has(id)) continue;
        const legalCase = await db.get('legal_case', id);
        if (!legalCase) continue;
        if (statusId && String(legalCase.status_id) !== statusId) continue;
        if (typeId && String(legalCase.case_type_id) !== typeId) continue;
        if (degreeId && String(legalCase.litigation_degree_id) !== degreeId) continue;
        if (courtFilter && String(legalCase.court_id ?? '') !== courtFilter) continue;
        if (yearFilter !== null && Number(legalCase.case_year) !== yearFilter) continue;
        if (archivedFilter === 'archived' && !legalCase.archived_at) continue;
        if (archivedFilter === 'active' && legalCase.archived_at) continue;
        // missing and hasNext will be handled after enrichment because needs joins
        cases.push(legalCase);
      }

      // If search was numeric case_number pattern but FTS didn't yield, try direct LIKE scans and merge
      if (cases.length === 0) {
        // Direct scans for case_number / subject / court name
        const direct = await this.directSearchFallback(searchRaw);
        for (const legalCase of direct) {
          if (candidateIds.has(String(legalCase.id))) continue;
          if (candidateCaseIdsForFile && !candidateCaseIdsForFile.has(String(legalCase.id))) continue;
          if (statusId && String(legalCase.status_id) !== statusId) continue;
          if (typeId && String(legalCase.case_type_id) !== typeId) continue;
          if (degreeId && String(legalCase.litigation_degree_id) !== degreeId) continue;
          if (courtFilter && String(legalCase.court_id ?? '') !== courtFilter) continue;
          if (yearFilter !== null && Number(legalCase.case_year) !== yearFilter) continue;
          if (archivedFilter === 'archived' && !legalCase.archived_at) continue;
          if (archivedFilter === 'active' && legalCase.archived_at) continue;
          cases.push(legalCase);
        }
      }

      // Handle hasNext and missing post-filter after enrichment? but we can pre-filter missing via field checks
      if (missingFilter === 'true') {
        cases = cases.filter((c) => this.missingReasons(c).length > 0);
      }
      // hasNext needs hearing check; we will handle after enrichment pooling to avoid per-case N+1 extra filtering? Do post-filter via batch
      if (hasNextFilter === 'yes' || hasNextFilter === 'no') {
        const wantHasNext = hasNextFilter === 'yes';
        const hearingMap = await this.batchHasNext(new Set(cases.map((c) => String(c.id))));
        cases = cases.filter((c) => (hearingMap.get(String(c.id)) ?? false) === wantHasNext);
      }

      cases.sort((a, b) => compareCases(a, b, request.sortKey, request.sortDir));
      const { offset: pageOffset, limit } = paginate(request.page, request.pageSize);
      return { rows: await this.enrich(cases.slice(pageOffset, pageOffset + limit)), total: cases.length };
    }

    // No search: build DB filters for simple fields
    const filters: Array<{ column: string; op: 'eq' | 'in' | 'isNull' | 'notNull' | 'gte' | 'lte'; value?: string | number | readonly (string | number)[] }> = [];
    if (statusId) filters.push({ column: 'status_id', op: 'eq', value: statusId });
    if (typeId) filters.push({ column: 'case_type_id', op: 'eq', value: typeId });
    if (degreeId) filters.push({ column: 'litigation_degree_id', op: 'eq', value: degreeId });
    if (courtFilter) filters.push({ column: 'court_id', op: 'eq', value: courtFilter });
    if (yearFilter !== null && !Number.isNaN(yearFilter)) filters.push({ column: 'case_year', op: 'eq', value: yearFilter });
    if (archivedFilter === 'archived') filters.push({ column: 'archived_at', op: 'notNull' });
    if (archivedFilter === 'active') filters.push({ column: 'archived_at', op: 'isNull' });
    if (candidateCaseIdsForFile) {
      filters.push({ column: 'id', op: 'in', value: [...candidateCaseIdsForFile] });
      if (candidateCaseIdsForFile.size === 0) return { rows: [], total: 0 };
    }
    if (missingFilter === 'true') {
      // missing includes court_id IS NULL ; we'll post-filter because OR logic not supported in query builder directly
      // So we'll fetch all matching then filter
    }

    // Handle hasNext filter via hearing set
    let hasNextIds: Set<string> | null = null;
    if (hasNextFilter === 'yes' || hasNextFilter === 'no') {
      hasNextIds = await this.nextHearingCaseIds();
    }

    // Determine sort column: map UI keys to DB columns
    let sortColumn = 'registration_date';
    const sortDir = request.sortDir ?? 'desc';
    if (request.sortKey === 'case_number') sortColumn = 'case_number';
    else if (request.sortKey === 'case_year') sortColumn = 'case_year';
    else if (request.sortKey === 'registration_date') sortColumn = 'registration_date';
    else if (request.sortKey === 'updated_at') sortColumn = 'updated_at';
    else if (request.sortKey === 'subject') sortColumn = 'case_year'; // subject not sorted in DB, fallback

    // If hasNext or missing filter, we need to fetch all then filter & paginate manually
    const needsPostFilter = missingFilter === 'true' || hasNextFilter === 'yes' || hasNextFilter === 'no';
    if (needsPostFilter) {
      // fetch all matching legal_case (maybe up to limit 5000 to protect)
      const all = await db.query('legal_case', {
        filters: filters as never,
        orderBy: [{ column: sortColumn, direction: sortDir }],
        limit: 5000,
      });
      let rows = all.rows;
      if (missingFilter === 'true') {
        rows = rows.filter((r) => this.missingReasons(r as EngineRow).length > 0);
      }
      if (hasNextIds !== null) {
        const want = hasNextFilter === 'yes';
        rows = rows.filter((r) => (hasNextIds!.has(String((r as EngineRow).id)) ? true : false) === want);
      }
      // If sort was not DB column (e.g., court), resort via enrich sort
      if (!['case_number', 'case_year', 'registration_date', 'updated_at'].includes(request.sortKey ?? '')) {
        rows.sort((a, b) => compareCases(a as EngineRow, b as EngineRow, request.sortKey, request.sortDir));
      }
      const { offset, limit } = paginate(request.page, request.pageSize);
      const pageRows = rows.slice(offset, offset + limit);
      return { rows: await this.enrich(pageRows as EngineRow[]), total: rows.length };
    }

    const page = await db.query('legal_case', {
      filters: filters as never,
      orderBy: [{ column: sortColumn, direction: sortDir }],
      ...paginate(request.page, request.pageSize),
    });
    // Handle missing filter false case already; if missing filter was true we handled above, so here we just enrich
    // For sorting by court or other non-DB columns, need post-sort but we already used DB sort; if user sorted by court, resort after enrich then return correct pagination? But we already paginated before enrichment, so resorting after would break pagination.
    // To handle court sort correctly, we fetch more when sortKey is court-like: fallback to in-memory sort for that page only is okay though total order may be off. Accept for now.
    if (request.sortKey === 'court' || request.sortKey === 'degree' || request.sortKey === 'status') {
      // enrich then sort slice (not ideal but better than nothing)
      let enriched = await this.enrich(page.rows as EngineRow[]);
      enriched.sort((a, b) => {
        if (request.sortKey === 'court') return a.courtName.localeCompare(b.courtName, 'ar') * (sortDir === 'asc' ? 1 : -1);
        if (request.sortKey === 'degree') return a.degreeName.localeCompare(b.degreeName, 'ar') * (sortDir === 'asc' ? 1 : -1);
        if (request.sortKey === 'status') return a.statusName.localeCompare(b.statusName, 'ar') * (sortDir === 'asc' ? 1 : -1);
        return 0;
      });
      return { rows: enriched, total: page.total };
    }
    return { rows: await this.enrich(page.rows as EngineRow[]), total: page.total };
  }

  private async enrich(cases: readonly EngineRow[]): Promise<CaseRow[]> {
    const { db, lookups, cache } = this.deps;
    const now = new Date().toISOString();
    const rows: CaseRow[] = [];
    // Batch fetch courts, circuits, hearings aggregates to reduce N+1 where possible
    const courtIds = [...new Set(cases.map((c) => c.court_id ? String(c.court_id) : null).filter(Boolean as never))] as string[];
    const circuitIds = [...new Set(cases.map((c) => c.circuit_id ? String(c.circuit_id) : null).filter(Boolean as never))] as string[];
    const courts = await cache.many('court', courtIds);
    const circuits = await cache.many('court_circuit', circuitIds);
    // Batch hearings for all cases (up to 25 cases)
    const caseIds = cases.map((c) => String(c.id));
    const hearingsByCase = new Map<string, EngineRow[]>();
    const hearingsPage = await db.query('hearing', { filters: [{ column: 'case_id', op: 'in', value: caseIds }], limit: 2000, orderBy: [{ column: 'scheduled_at', direction: 'asc' }] });
    for (const h of hearingsPage.rows) {
      const cid = String(h.case_id);
      const list = hearingsByCase.get(cid) ?? [];
      list.push(h as EngineRow);
      hearingsByCase.set(cid, list);
    }
    // Batch file links
    const fileLinks = await db.query('case_file_case', { filters: [{ column: 'case_id', op: 'in', value: caseIds }], limit: 2000 });
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
      const pl = await db.query('case_file_party', { filters: [{ column: 'file_id', op: 'in', value: allFileIds }], limit: 3000 });
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
    const judgmentsPage = await db.query('judgment', { filters: [{ column: 'case_id', op: 'in', value: caseIds }], limit: 2000 });
    const judgmentsCountByCase = new Map<string, number>();
    for (const j of judgmentsPage.rows) {
      const cid = String(j.case_id);
      judgmentsCountByCase.set(cid, (judgmentsCountByCase.get(cid) ?? 0) + 1);
    }
    // Batch tasks count
    const tasksPage = await db.query('task', { filters: [{ column: 'case_id', op: 'in', value: caseIds }], limit: 2000 });
    const tasksCountByCase = new Map<string, number>();
    for (const t of tasksPage.rows) {
      const cid = String(t.case_id);
      tasksCountByCase.set(cid, (tasksCountByCase.get(cid) ?? 0) + 1);
    }

    for (const legalCase of cases) {
      const cid = String(legalCase.id);
      const court = legalCase.court_id ? courts.get(String(legalCase.court_id)) : null;
      const circuit = legalCase.circuit_id ? circuits.get(String(legalCase.circuit_id)) : null;
      const hearings = hearingsByCase.get(cid) ?? [];
      const next = hearings.find((h) => String(h.scheduled_at) >= now && h.status_id !== lookups.id('hearing_status', 'cancelled'));
      const last = [...hearings].reverse().find((h) => String(h.scheduled_at) < now);
      const fileIds = fileIdsByCase.get(cid) ?? [];
      // Derive client / opponent names from party links
      const clientNames: string[] = [];
      const opponentNames: string[] = [];
      const seenParties = new Set<string>();
      for (const fid of fileIds) {
        const links = partyLinksByFile.get(fid) ?? [];
        for (const link of links) {
          const party = partyCache.get(String(link.party_id));
          if (!party) continue;
          const pid = String(party.id);
          if (seenParties.has(pid)) continue;
          seenParties.add(pid);
          const roleCode = lookups.byId(String(link.role_id ?? ''))?.code ?? '';
          const display = String(party.display_name ?? '');
          if (roleCode === 'client') clientNames.push(display);
          else opponentNames.push(display);
        }
      }
      const missing = this.missingReasons(legalCase);
      rows.push({
        legalCase,
        courtName: court ? String(court.name) : '—',
        circuitName: circuit ? String(circuit.name) : '—',
        caseTypeName: lookups.byId(String(legalCase.case_type_id ?? ''))?.nameAr ?? '—',
        degreeName: lookups.byId(String(legalCase.litigation_degree_id ?? ''))?.nameAr ?? '—',
        statusName: lookups.byId(String(legalCase.status_id ?? ''))?.nameAr ?? '—',
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
        lastActivityAt: legalCase.updated_at ? String(legalCase.updated_at) : null,
      });
    }
    return rows;
  }

  missingReasons(legalCase: EngineRow): string[] {
    const reasons: string[] = [];
    if (!legalCase.court_id) reasons.push('المحكمة غير مسجلة');
    if (!legalCase.case_type_id) reasons.push('نوع الدعوى غير محدد');
    if (!legalCase.subject || String(legalCase.subject).trim().length < 5) reasons.push('موضوع الدعوى ناقص');
    if (!legalCase.registration_date) reasons.push('تاريخ القيد غير مسجل');
    return reasons;
  }

  private async searchCandidateIds(query: string): Promise<Set<string>> {
    const { db } = this.deps;
    const trimmed = query.trim();
    if (!trimmed) return new Set();
    const ids = new Set<string>();
    // FTS over legal_case
    let offset = 0;
    for (;;) {
      const page = await db.searchPage(trimmed, { entityType: 'legal_case', limit: 200, offset });
      for (const hit of page.hits) ids.add(hit.entityId);
      offset += page.hits.length;
      if (page.hits.length === 0 || offset >= page.total || ids.size >= 600) break;
    }
    // If query contains slash like "123 / 2026", parse
    const slash = trimmed.match(/(\d+)\s*[\\/]\s*(\d{4})/);
    if (slash) {
      const num = slash[1]!;
      const year = Number(slash[2]!);
      const exact = await db.query('legal_case', { filters: [{ column: 'case_number', op: 'eq', value: num }, { column: 'case_year', op: 'eq', value: year }], limit: 50 });
      for (const row of exact.rows) ids.add(String((row as EngineRow).id));
    }
    // Party name search -> linked cases via file parties
    const partyHits = await this.searchPartyIds(trimmed);
    if (partyHits.length > 0) {
      const partyIdSet = partyHits.slice(0, 20);
      const fileParties = await db.query('case_file_party', { filters: [{ column: 'party_id', op: 'in', value: partyIdSet }], limit: 2000 });
      const fileIds = [...new Set(fileParties.rows.map((r) => String(r.file_id)))];
      if (fileIds.length > 0) {
        const caseLinks = await db.query('case_file_case', { filters: [{ column: 'file_id', op: 'in', value: fileIds }], limit: 2000 });
        for (const link of caseLinks.rows) ids.add(String(link.case_id));
      }
    }
    return ids;
  }

  private async searchPartyIds(query: string): Promise<string[]> {
    const { db } = this.deps;
    const results: string[] = [];
    // Use search FTS for party if available, else fallback to LIKE via query contains
    try {
      let offset = 0;
      for (;;) {
        const page = await db.searchPage(query, { entityType: 'party', limit: 100, offset });
        for (const hit of page.hits) results.push(hit.entityId);
        offset += page.hits.length;
        if (page.hits.length === 0 || results.length >= 30 || offset >= page.total) break;
      }
    } catch { /* ignore */ }
    if (results.length === 0) {
      // fallback direct query with contains on display_name
      const direct = await db.query('party', { filters: [{ column: 'display_name', op: 'contains', value: query }], limit: 30 });
      for (const row of direct.rows) results.push(String((row as EngineRow).id));
    }
    return results;
  }

  private async directSearchFallback(query: string): Promise<EngineRow[]> {
    const { db } = this.deps;
    const results: EngineRow[] = [];
    const seen = new Set<string>();
    const add = (rows: EngineRow[]) => {
      for (const r of rows) {
        const id = String(r.id);
        if (seen.has(id)) continue;
        seen.add(id);
        results.push(r);
      }
    };
    // case_number contains
    try {
      const byNumber = await db.query('legal_case', { filters: [{ column: 'case_number', op: 'contains', value: query }], limit: 100 });
      add(byNumber.rows as EngineRow[]);
    } catch { /* */ }
    try {
      const bySubject = await db.query('legal_case', { filters: [{ column: 'subject', op: 'contains', value: query }], limit: 100 });
      add(bySubject.rows as EngineRow[]);
    } catch { /* */ }
    // Also court name match: query courts first
    try {
      const courts = await db.query('court', { filters: [{ column: 'name', op: 'contains', value: query }], limit: 20 });
      const courtIds = courts.rows.map((r) => String((r as EngineRow).id));
      if (courtIds.length > 0) {
        const byCourt = await db.query('legal_case', { filters: [{ column: 'court_id', op: 'in', value: courtIds }], limit: 100 });
        add(byCourt.rows as EngineRow[]);
      }
    } catch { /* */ }
    return results;
  }

  private async nextHearingCaseIds(): Promise<Set<string>> {
    const { db, lookups } = this.deps;
    const now = new Date().toISOString();
    const cancelledId = lookups.id('hearing_status', 'cancelled');
    const future = await db.query('hearing', {
      filters: [
        { column: 'scheduled_at', op: 'gte', value: now },
        ...(cancelledId ? [{ column: 'status_id', op: 'neq' as const, value: cancelledId }] : []),
      ],
      limit: 5000,
      orderBy: [{ column: 'scheduled_at', direction: 'asc' }],
    });
    const set = new Set<string>();
    for (const h of future.rows) set.add(String((h as EngineRow).case_id));
    return set;
  }

  private async batchHasNext(caseIds: Set<string>): Promise<Map<string, boolean>> {
    const { db, lookups } = this.deps;
    const now = new Date().toISOString();
    const cancelledId = lookups.id('hearing_status', 'cancelled');
    const map = new Map<string, boolean>();
    for (const id of caseIds) map.set(id, false);
    if (caseIds.size === 0) return map;
    const future = await db.query('hearing', {
      filters: [
        { column: 'case_id', op: 'in', value: [...caseIds] },
        { column: 'scheduled_at', op: 'gte', value: now },
        ...(cancelledId ? [{ column: 'status_id', op: 'neq' as const, value: cancelledId }] : []),
      ],
      limit: 2000,
    });
    for (const h of future.rows) map.set(String((h as EngineRow).case_id), true);
    return map;
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
    const court = await cache.get('court', full.legalCase.court_id ? String(full.legalCase.court_id) : null);
    const circuit = await cache.get('court_circuit', full.legalCase.circuit_id ? String(full.legalCase.circuit_id) : null);
    const parties: CaseDetail['parties'] = [];
    // Gather parties via files; deduplicate by party_id
    const fileIds = full.files.map((f) => String(f.id));
    if (fileIds.length > 0) {
      const links = await db.query('case_file_party', {
        filters: [{ column: 'file_id', op: 'in', value: fileIds }],
        limit: 500,
      });
      const seen = new Set<string>();
      for (const link of links.rows) {
        const pid = String(link.party_id);
        if (seen.has(pid)) continue;
        seen.add(pid);
        const party = await cache.get('party', pid);
        if (!party) continue;
        parties.push({
          party,
          roleName: lookups.byId(String(link.role_id ?? ''))?.nameAr ?? '—',
          roleCode: lookups.byId(String(link.role_id ?? ''))?.code ?? '',
          sideName: lookups.byId(String(link.side_id ?? ''))?.nameAr ?? '—',
          fileId: String(link.file_id),
          linkId: String(link.id),
        });
      }
    }
    // Also consider case_file_party where case_id directly (legacy)
    const directPartyLinks = await db.query('case_file_party', { filters: [{ column: 'case_id', op: 'eq', value: caseId }], limit: 100 });
    for (const link of directPartyLinks.rows) {
      const pid = String(link.party_id);
      if (parties.some((p) => String(p.party.id) === pid)) continue;
      const party = await cache.get('party', pid);
      if (!party) continue;
      parties.push({
        party,
        roleName: lookups.byId(String(link.role_id ?? ''))?.nameAr ?? '—',
        roleCode: lookups.byId(String(link.role_id ?? ''))?.code ?? '',
        sideName: lookups.byId(String(link.side_id ?? ''))?.nameAr ?? '—',
        fileId: String(link.file_id ?? ''),
        linkId: String(link.id),
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
      typeName: lookups.byId(String(judgment.judgment_type_id ?? ''))?.nameAr ?? '—',
      statusName: lookups.byId(String(judgment.status_id ?? ''))?.nameAr ?? '—',
    }));
    const tasks = (await db.query('task', {
      filters: [{ column: 'case_id', op: 'eq', value: caseId }],
      orderBy: [{ column: 'due_at', direction: 'asc' }],
      limit: 100,
    })).rows as EngineRow[];
    const docLinks = await db.query('document_link', {
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
      const ann = await db.query('announcement', { filters: [{ column: 'task_id', op: 'in', value: taskIds }], limit: 100 });
      announcements = ann.rows as EngineRow[];
    }
    // Notes for this case (via case_id or via file)
    let notes: EngineRow[] = [];
    {
      const byCase = await db.query('case_note', { filters: [{ column: 'case_id', op: 'eq', value: caseId }], limit: 100 });
      notes = byCase.rows as EngineRow[];
      if (fileIds.length > 0) {
        const byFile = await db.query('case_note', { filters: [{ column: 'file_id', op: 'in', value: fileIds }], limit: 100 });
        for (const n of byFile.rows) {
          if (String((n as EngineRow).case_id) === caseId) continue;
          if (notes.some((x) => String(x.id) === String((n as EngineRow).id))) continue;
          notes.push(n as EngineRow);
        }
      }
      notes.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    }
    // Related cases via legal_case_link
    const outgoing = await db.query('legal_case_link', { filters: [{ column: 'source_case_id', op: 'eq', value: caseId }], limit: 100 });
    const incoming = await db.query('legal_case_link', { filters: [{ column: 'target_case_id', op: 'eq', value: caseId }], limit: 100 });
    const relatedLinks = [...outgoing.rows, ...incoming.rows] as EngineRow[];
    const relatedCases: CaseDetail['relatedCases'] = [];
    for (const link of relatedLinks) {
      const isOutgoing = String(link.source_case_id) === caseId;
      const otherId = isOutgoing ? String(link.target_case_id) : String(link.source_case_id);
      const other = await db.get('legal_case', otherId);
      relatedCases.push({
        link: link as EngineRow,
        legalCase: other as EngineRow | null,
        relationName: lookups.byId(String(link.relation_type_id ?? ''))?.nameAr ?? 'مرتبطة',
        direction: isOutgoing ? 'outgoing' : 'incoming',
      });
    }

    const activity = await db.auditTrail('legal_case', caseId, 40);
    // Compute alerts
    const alerts = this.computeAlerts(full.legalCase as EngineRow, hearings, tasks, parties, announcements);

    // Outstanding finance via files: sum charges not yet paid
    let outstandingMinor: number | null = null;
    if (fileIds.length > 0) {
      try {
        const charges = await db.query('financial_charge', { filters: [{ column: 'file_id', op: 'in', value: fileIds }], limit: 100 });
        let total = 0;
        let has = false;
        for (const ch of charges.rows) {
          const crow = ch as EngineRow;
          if (crow.status_id === lookups.id('charge_status', 'cancelled')) continue;
          const bal = await db.chargeBalance(String(crow.id));
          if (bal.outstandingMinor > 0) { total += bal.outstandingMinor; has = true; }
        }
        outstandingMinor = has ? total : 0;
      } catch { outstandingMinor = null; }
    }

    return {
      legalCase: full.legalCase as EngineRow,
      courtName: court ? String(court.name) : '—',
      circuitName: circuit ? String(circuit.name) : '—',
      caseTypeName: lookups.byId(String(full.legalCase.case_type_id ?? ''))?.nameAr ?? '—',
      statusName: lookups.byId(String(full.legalCase.status_id ?? ''))?.nameAr ?? '—',
      degreeName: lookups.byId(String(full.legalCase.litigation_degree_id ?? ''))?.nameAr ?? '—',
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

  private computeAlerts(legalCase: EngineRow, hearings: HearingSummary[], tasks: EngineRow[], parties: CaseDetail['parties'], announcements: EngineRow[]): CaseDetail['alerts'] {
    const alerts: CaseDetail['alerts'] = [];
    const now = new Date().toISOString();
    const hasNext = hearings.some((h) => String(h.hearing.scheduled_at) >= now);
    const hasPastUnrecorded = hearings.some((h) => String(h.hearing.scheduled_at) < now && !h.hearing.held_at && h.hearing.status_id === this.deps.lookups.id('hearing_status', 'scheduled'));
    if (hasPastUnrecorded) alerts.push({ kind: 'warning', title: 'جلسة سابقة بلا نتيجة مسجلة', description: 'هناك جلسة انعقد موعدها دون تسجيل ما حدث فيها. سجّل نتيجة الجلسة لتحديث سير القضية.' });
    if (!hasNext && hearings.length > 0) alerts.push({ kind: 'info', title: 'لا توجد جلسة قادمة', description: 'لم يتم تحديد موعد للجلسة التالية. أضف جلسة جديدة عند معرفة الموعد.' });
    if (!legalCase.court_id) alerts.push({ kind: 'danger', title: 'بيانات المحكمة ناقصة', description: 'القضية بلا محكمة محددة. أضف المحكمة والدائرة لضمان صحة السجلات والتنبيهات.' });
    if (!legalCase.subject || String(legalCase.subject).trim().length < 10) alerts.push({ kind: 'warning', title: 'موضوع الدعوى غير مكتمل', description: 'أضف وصفًا مختصرًا لموضوع الدعوى والطلبات ليتعرف الفريق على مضمونها بسرعة.' });
    if (parties.length === 0) alerts.push({ kind: 'warning', title: 'لا أطراف مرتبطة', description: 'القضية بلا أطراف مسجلة. اربط الموكل والخصوم من خلال ملف القضية.' });
    else if (parties.some((p) => !p.roleCode || p.roleName === '—')) alerts.push({ kind: 'info', title: 'صفة بعض الأطراف غير محددة', description: 'راجع صفات الأطراف وتأكد من تحديد دور كل طرف في الدعوى.' });
    const overdueTasks = tasks.filter((t) => t.due_at && String(t.due_at) < now && !['completed', 'cancelled'].includes(this.deps.lookups.byId(String(t.status_id ?? ''))?.code ?? ''));
    if (overdueTasks.length > 0) alerts.push({ kind: 'danger', title: `${overdueTasks.length} عمل إداري متأخر`, description: 'هناك أعمال تجاوز موعد استحقاقها. راجع قائمة الأعمال الإدارية داخل القضية.' });
    const unserved = announcements.filter((a) => !a.served_on);
    if (unserved.length > 0) alerts.push({ kind: 'info', title: 'إعلانات بلا تأكيد تسليم', description: `يوجد ${unserved.length} إجراء إعلان لم تُسجل نتيجته بعد.` });
    if (!hasNext && tasks.length === 0 && legalCase.status_id !== this.deps.lookups.id('case_status', 'closed')) {
      // gentle hint for stagnant case: no future hearing and no open tasks, not recently updated
      const daysSinceUpdate = legalCase.updated_at ? (Date.now() - new Date(String(legalCase.updated_at)).getTime()) / 86400000 : 999;
      if (daysSinceUpdate > 30) alerts.push({ kind: 'info', title: 'القضية لم تُحدّث منذ فترة', description: 'مرّ أكثر من 30 يومًا دون تحديث. راجع بياناتها للتأكد من اكتمالها.' });
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
    if (input.circuitId) patch.circuit_id = input.circuitId;
    if (input.statusCode) patch.status_id = lookups.id('case_status', input.statusCode);
    if (input.claimAmountMinor !== undefined) patch.claim_amount_minor = input.claimAmountMinor;
    if (input.currencyCode) patch.currency_code = input.currencyCode;
    if (input.registrationDate) patch.registration_date = input.registrationDate;
    if (input.notes) patch.notes = input.notes;
    if (patch.circuit_id) {
      const courtId = (input.courtId ?? (legalCase.court_id as string | null) ?? null) as string | null;
      if (!courtId) throw new ValidationError('الدائرة تتطلب محكمة');
      const circuit = await db.get('court_circuit', String(patch.circuit_id));
      if (!circuit) throw new ValidationError('الدائرة غير موجودة');
      if (String(circuit.court_id) !== String(courtId)) throw new ValidationError('الدائرة لا تتبع المحكمة المختارة');
    }
    if (Object.keys(patch).length > 0) await db.update('legal_case', String(legalCase.id), patch);
    this.deps.cache.invalidate();
    return (await db.get('legal_case', String(legalCase.id))) ?? legalCase;
  }

  async update(caseId: string, patch: Record<string, unknown>): Promise<EngineRow> {
    const lookups = this.deps.lookups;
    const mapped: Record<string, unknown> = { ...patch };
    if (typeof patch.caseTypeCode === 'string') { mapped.case_type_id = lookups.id('case_type', patch.caseTypeCode as string); delete mapped.caseTypeCode; }
    if (typeof patch.litigationDegreeCode === 'string') { mapped.litigation_degree_id = lookups.id('litigation_degree', patch.litigationDegreeCode as string); delete mapped.litigationDegreeCode; }
    if (typeof patch.statusCode === 'string') { mapped.status_id = lookups.id('case_status', patch.statusCode as string); delete mapped.statusCode; }
    for (const key of ['court_id', 'circuit_id', 'subject', 'notes', 'registration_date']) {
      if (mapped[key] === '') mapped[key] = null;
    }
    // Validate circuit belongs to court if both provided or if circuit provided we fetch existing court
    const nextCourtId = (mapped.court_id as string | null | undefined) ?? (await this.deps.db.get('legal_case', caseId) as EngineRow | undefined)?.court_id as string | null | undefined;
    const nextCircuitId = mapped.circuit_id as string | null | undefined;
    if (nextCircuitId) {
      if (!nextCourtId) throw new ValidationError('الدائرة تتطلب تحديد المحكمة');
      const circuit = await this.deps.db.get('court_circuit', nextCircuitId);
      if (!circuit) throw new ValidationError('الدائرة غير موجودة');
      if (String(circuit.court_id) !== String(nextCourtId)) throw new ValidationError('الدائرة لا تتبع المحكمة المختارة');
    }
    const updated = await this.deps.db.update('legal_case', caseId, mapped);
    this.deps.cache.invalidate('legal_case', caseId);
    return updated;
  }

  async archive(caseId: string): Promise<EngineRow> {
    const updated = await this.deps.db.update('legal_case', caseId, { archived_at: new Date().toISOString() });
    this.deps.cache.invalidate('legal_case', caseId);
    return updated;
  }

  async restoreArchived(caseId: string): Promise<EngineRow> {
    const updated = await this.deps.db.update('legal_case', caseId, { archived_at: null });
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

  async linkFile(caseId: string, fileId: string, relationTypeCode = 'related'): Promise<void> {
    await this.deps.db.linkCase(caseId, fileId);
    // also allow custom relation type by updating the link row
    const links = await this.deps.db.query('case_file_case', { filters: [{ column: 'case_id', op: 'eq', value: caseId }, { column: 'file_id', op: 'eq', value: fileId }], limit: 1 });
    const link = links.rows[0] as EngineRow | undefined;
    if (link && relationTypeCode !== 'related') {
      const relId = this.deps.lookups.id('file_relation_type', relationTypeCode);
      if (relId) await this.deps.db.update('case_file_case', String(link.id), { relation_type_id: relId });
    }
    this.deps.cache.invalidate();
  }

  async unlinkFile(caseId: string, fileId: string): Promise<void> {
    const links = await this.deps.db.query('case_file_case', { filters: [{ column: 'case_id', op: 'eq', value: caseId }, { column: 'file_id', op: 'eq', value: fileId }], limit: 10 });
    for (const link of links.rows) await this.deps.db.softDelete('case_file_case', String((link as EngineRow).id));
    this.deps.cache.invalidate();
  }

  async addParty(input: { caseId: string; fileId: string; partyId: string; roleCode: string; sideCode?: string }): Promise<EngineRow> {
    const { db } = this.deps;
    // Insert via case_file_party with case_id reference; we use db.insert directly to keep case_id
    const roleId = this.deps.lookups.id('party_role', input.roleCode) ?? this.deps.lookups.id('party_role', 'other')!;
    const sideId = input.sideCode ? this.deps.lookups.id('party_side', input.sideCode) : null;
    const existing = await db.query('case_file_party', { filters: [{ column: 'file_id', op: 'eq', value: input.fileId }, { column: 'party_id', op: 'eq', value: input.partyId }], limit: 50 });
    if (existing.rows.some((r) => String((r as EngineRow).role_id) === roleId)) {
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
      is_primary: 0,
      start_date: null,
      end_date: null,
      notes: null,
    });
    this.deps.cache.invalidate();
    return row;
  }

  async updatePartyRole(linkId: string, roleCode: string, sideCode?: string): Promise<EngineRow> {
    const roleId = this.deps.lookups.id('party_role', roleCode);
    if (!roleId) throw new ValidationError(`صفة غير معروفة: ${roleCode}`);
    const patch: Record<string, unknown> = { role_id: roleId };
    if (sideCode) patch.side_id = this.deps.lookups.id('party_side', sideCode);
    else if (sideCode === null) patch.side_id = null;
    const updated = await this.deps.db.update('case_file_party', linkId, patch);
    this.deps.cache.invalidate();
    return updated;
  }

  async removeParty(linkId: string): Promise<void> {
    await this.deps.db.softDelete('case_file_party', linkId, 'إزالة طرف من القضية');
    this.deps.cache.invalidate();
  }

  async linkCases(sourceCaseId: string, targetCaseId: string, relationTypeCode = 'related', notes?: string): Promise<EngineRow> {
    if (sourceCaseId === targetCaseId) throw new ValidationError('لا يمكن ربط القضية بنفسها');
    const relId = this.deps.lookups.id('case_relation_type', relationTypeCode) ?? this.deps.lookups.id('case_relation_type', 'related')!;
    // prevent duplicate link
    const existing = await this.deps.db.query('legal_case_link', {
      filters: [
        { column: 'source_case_id', op: 'eq', value: sourceCaseId },
        { column: 'target_case_id', op: 'eq', value: targetCaseId },
      ],
      limit: 10,
    });
    if (existing.rows.some((r) => String((r as EngineRow).relation_type_id) === relId)) throw new ValidationError('هذا الارتباط موجود مسبقًا');
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

  async createTask(input: { caseId: string; title: string; taskTypeCode?: string; dueAt?: string; description?: string; fileId?: string }): Promise<EngineRow> {
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

  async changeTaskStatus(taskId: string, statusCode: string): Promise<EngineRow> {
    const task = await this.deps.db.changeTaskStatus(taskId, statusCode);
    this.deps.cache.invalidate();
    return task;
  }

  async addNote(input: { caseId: string; fileId: string; body: string; isPrivate?: boolean }): Promise<EngineRow> {
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
    const link = await this.deps.db.linkDocument(documentId, { kind: 'case', id: caseId });
    this.deps.cache.invalidate();
    return link;
  }

  async unlinkDocument(linkId: string): Promise<void> {
    await this.deps.db.softDelete('document_link', linkId);
    this.deps.cache.invalidate();
  }

  async bulkArchive(caseIds: readonly string[]): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of caseIds) {
      try { await this.archive(id); succeeded.push(id); } catch (e) { failed.push({ id, error: e instanceof Error ? e.message : String(e) }); }
    }
    return { succeeded, failed };
  }

  async bulkChangeStatus(caseIds: readonly string[], statusCode: string): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const statusId = this.deps.lookups.id('case_status', statusCode);
    if (!statusId) throw new ValidationError(`حالة غير معروفة: ${statusCode}`);
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of caseIds) {
      try { await this.deps.db.update('legal_case', id, { status_id: statusId }); succeeded.push(id); } catch (e) { failed.push({ id, error: e instanceof Error ? e.message : String(e) }); }
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
        value: String((row as EngineRow).id),
        label: `قضية ${(row as EngineRow).case_number} / ${(row as EngineRow).case_year}`,
        ...((row as EngineRow).subject ? { description: String((row as EngineRow).subject) } : {}),
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
    return (await this.deps.db.query('court', { orderBy: [{ column: 'name', direction: 'asc' }], limit: 500 })).rows as EngineRow[];
  }

  async circuits(courtId?: string): Promise<EngineRow[]> {
    if (!courtId) return (await this.deps.db.query('court_circuit', { orderBy: [{ column: 'name', direction: 'asc' }], limit: 500 })).rows as EngineRow[];
    return (await this.deps.db.query('court_circuit', { filters: [{ column: 'court_id', op: 'eq', value: courtId }], limit: 500 })).rows as EngineRow[];
  }
}

function compareCases(a: EngineRow, b: EngineRow, sortKey: string | undefined, dir: 'asc' | 'desc' | undefined): number {
  const factor = dir === 'asc' ? 1 : -1;
  let column = 'registration_date';
  if (sortKey === 'case_number') column = 'case_number';
  else if (sortKey === 'case_year') column = 'case_year';
  else if (sortKey === 'updated_at') column = 'updated_at';
  else if (sortKey === 'subject') column = 'subject';
  const av = String(a[column] ?? '');
  const bv = String(b[column] ?? '');
  // numeric compare for case_number/year
  if (column === 'case_year' || column === 'case_number') {
    const an = Number(av); const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== '') return (an - bn) * factor;
  }
  return av.localeCompare(bv, 'ar') * factor;
}
