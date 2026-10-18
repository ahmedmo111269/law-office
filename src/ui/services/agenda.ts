import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';
import { dayRangeIso, isoDateToday, addDaysToKey } from '../format.ts';

export interface HearingRow {
  hearing: EngineRow;
  caseLabel: string;
  caseNumber: string;
  caseYear: number;
  courtName: string;
  purposeName: string;
  statusName: string;
  statusCode: string;
  clientNames: string[];
}

export interface AppointmentRow {
  appointment: EngineRow;
  kindName: string;
  statusName: string;
  statusCode: string;
  partyName: string | null;
  fileLabel: string | null;
}

export interface AnnouncementRow {
  announcement: EngineRow;
  kindName: string;
  methodName: string;
  statusName: string;
  statusCode: string;
  recipientName: string | null;
  taskTitle: string | null;
}

export class AgendaService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async listHearings(request: TableRequest): Promise<TableResult<HearingRow>> {
    const { db, lookups } = this.deps;
    const statusId = request.filters.status ? lookups.id('hearing_status', request.filters.status) : null;
    const period = request.filters.period ?? 'upcoming';
    const today = isoDateToday();
    const dateFilters: Array<{ column: string; op: 'gte' | 'lte'; value: string }> = [];
    if (period === 'today') {
      const range = dayRangeIso(today);
      dateFilters.push({ column: 'scheduled_at', op: 'gte', value: range.from }, { column: 'scheduled_at', op: 'lte', value: range.to });
    } else if (period === 'week') {
      dateFilters.push({ column: 'scheduled_at', op: 'gte', value: dayRangeIso(today).from }, { column: 'scheduled_at', op: 'lte', value: dayRangeIso(addDaysToKey(today, 7)).to });
    } else if (period === 'month') {
      dateFilters.push({ column: 'scheduled_at', op: 'gte', value: dayRangeIso(today).from }, { column: 'scheduled_at', op: 'lte', value: dayRangeIso(addDaysToKey(today, 30)).to });
    } else if (period === 'past') {
      dateFilters.push({ column: 'scheduled_at', op: 'lte', value: new Date().toISOString() });
    } else if (period === 'all') {
      // no range
    } else {
      dateFilters.push({ column: 'scheduled_at', op: 'gte', value: new Date().toISOString() });
    }
    let caseIds: string[] | null = null;
    if (request.search.trim()) {
      caseIds = [];
      let offset = 0;
      for (;;) {
        const page = await db.searchPage(request.search.trim(), { entityType: 'legal_case', limit: 200, offset });
        caseIds.push(...page.hits.map((hit) => hit.entityId));
        offset += page.hits.length;
        if (page.hits.length === 0 || offset >= page.total) break;
      }
      if (caseIds.length === 0) return { rows: [], total: 0 };
    }
    const direction = request.sortDir ?? (period === 'past' ? 'desc' : 'asc');
    const page = await db.query('hearing', {
      filters: [
        ...dateFilters,
        ...(statusId ? [{ column: 'status_id', op: 'eq' as const, value: statusId }] : []),
        ...(caseIds ? [{ column: 'case_id', op: 'in' as const, value: caseIds }] : []),
      ],
      orderBy: [{ column: 'scheduled_at', direction }],
      ...paginate(request.page, request.pageSize),
    });
    return { rows: await this.enrichHearings(page.rows), total: page.total };
  }

  async enrichHearings(hearings: readonly EngineRow[]): Promise<HearingRow[]> {
    const { db, lookups, cache } = this.deps;
    const rows: HearingRow[] = [];
    for (const hearing of hearings) {
      const legalCase = await cache.get('legal_case', String(hearing.case_id));
      const court = await cache.get('court', hearing.court_id ? String(hearing.court_id) : (legalCase?.court_id ? String(legalCase.court_id) : null));
      const status = lookups.byId(String(hearing.status_id ?? ''));
      rows.push({
        hearing,
        caseLabel: legalCase ? `قضية ${legalCase.case_number} / ${legalCase.case_year}` : '—',
        caseNumber: legalCase ? String(legalCase.case_number) : '—',
        caseYear: legalCase ? Number(legalCase.case_year) : 0,
        courtName: court ? String(court.name) : '—',
        purposeName: lookups.byId(String(hearing.purpose ?? ''))?.nameAr ?? '—',
        statusName: status?.nameAr ?? '—',
        statusCode: status?.code ?? '',
        clientNames: legalCase ? await clientNamesForCase(db, cache, String(legalCase.id)) : [],
      });
    }
    void lookups;
    return rows;
  }

  async today(): Promise<HearingRow[]> {
    const range = dayRangeIso(isoDateToday());
    const page = await this.deps.db.query('hearing', {
      filters: [
        { column: 'scheduled_at', op: 'gte', value: range.from },
        { column: 'scheduled_at', op: 'lte', value: range.to },
      ],
      orderBy: [{ column: 'scheduled_at', direction: 'asc' }],
      limit: 50,
    });
    return this.enrichHearings(page.rows);
  }

  async upcoming(days: number): Promise<HearingRow[]> {
    const from = dayRangeIso(isoDateToday()).from;
    const to = dayRangeIso(addDaysToKey(isoDateToday(), days)).to;
    const page = await this.deps.db.query('hearing', {
      filters: [
        { column: 'scheduled_at', op: 'gte', value: from },
        { column: 'scheduled_at', op: 'lte', value: to },
      ],
      orderBy: [{ column: 'scheduled_at', direction: 'asc' }],
      limit: 100,
    });
    return this.enrichHearings(page.rows);
  }

  async getHearing(hearingId: string): Promise<HearingRow | null> {
    const hearing = await this.deps.db.get('hearing', hearingId);
    if (!hearing) return null;
    return (await this.enrichHearings([hearing]))[0] ?? null;
  }

  async recordHearing(hearingId: string, input: { statusCode: string; outcomeSummary?: string; heldAt?: string }): Promise<void> {
    await this.deps.db.recordHearing(hearingId, {
      statusCode: input.statusCode,
      ...(input.outcomeSummary !== undefined ? { outcomeSummary: input.outcomeSummary } : {}),
      ...(input.heldAt ? { heldAt: input.heldAt } : {}),
    });
    this.deps.cache.invalidate();
  }

  async scheduleNext(hearingId: string, scheduledAt: string): Promise<EngineRow> {
    const next = await this.deps.db.scheduleNextHearing(hearingId, { scheduledAt });
    this.deps.cache.invalidate();
    return next;
  }

  async schedule(input: { caseId: string; scheduledAt: string; purposeCode?: string; courtId?: string }): Promise<EngineRow> {
    const hearing = await this.deps.db.scheduleHearing(input);
    this.deps.cache.invalidate();
    return hearing;
  }

  // ------------------------------------------------------------------
  // Appointments
  // ------------------------------------------------------------------

  async listAppointments(request: TableRequest): Promise<TableResult<AppointmentRow>> {
    const { db, lookups } = this.deps;
    const statusId = request.filters.status ? lookups.id('appointment_status', request.filters.status) : null;
    const period = request.filters.period ?? 'upcoming';
    const filters = [
      ...(statusId ? [{ column: 'status_id', op: 'eq' as const, value: statusId }] : []),
      ...(period === 'today'
        ? [
            { column: 'start_at', op: 'gte' as const, value: dayRangeIso(isoDateToday()).from },
            { column: 'start_at', op: 'lte' as const, value: dayRangeIso(isoDateToday()).to },
          ]
        : period === 'upcoming'
          ? [{ column: 'start_at', op: 'gte' as const, value: new Date().toISOString() }]
          : period === 'past'
            ? [{ column: 'start_at', op: 'lte' as const, value: new Date().toISOString() }]
            : []),
    ];
    const page = await db.query('appointment', {
      filters,
      orderBy: [{ column: 'start_at', direction: period === 'past' ? 'desc' : 'asc' }],
      ...paginate(request.page, request.pageSize),
    });
    const rows: AppointmentRow[] = [];
    for (const appointment of page.rows) {
      const party = await this.deps.cache.get('party', appointment.party_id ? String(appointment.party_id) : null);
      const file = await this.deps.cache.get('case_file', appointment.file_id ? String(appointment.file_id) : null);
      const status = lookups.byId(String(appointment.status_id ?? ''));
      rows.push({
        appointment,
        kindName: lookups.byId(String(appointment.kind_id ?? ''))?.nameAr ?? '—',
        statusName: status?.nameAr ?? '—',
        statusCode: status?.code ?? '',
        partyName: party ? String(party.display_name) : null,
        fileLabel: file ? String(file.file_number) : null,
      });
    }
    return { rows, total: page.total };
  }

  async createAppointment(input: {
    title: string;
    startAt: string;
    endAt?: string;
    kindCode?: string;
    location?: string;
    partyId?: string;
    fileId?: string;
    caseId?: string;
    notes?: string;
    allDay?: boolean;
  }): Promise<EngineRow> {
    if (!input.title.trim()) throw new ValidationError('appointment title is required');
    const timezone = this.deps.lookups ? undefined : undefined;
    const appointment = await this.deps.db.insert('appointment', {
      title: input.title.trim(),
      kind_id: this.deps.lookups.id('appointment_kind', input.kindCode ?? 'meeting'),
      status_id: this.deps.lookups.id('appointment_status', 'scheduled'),
      start_at: input.startAt,
      end_at: input.endAt ?? null,
      all_day: input.allDay ? 1 : 0,
      timezone: timezone ?? 'Africa/Cairo',
      location: input.location?.trim() || null,
      party_id: input.partyId ?? null,
      file_id: input.fileId ?? null,
      case_id: input.caseId ?? null,
      task_id: null,
      notes: input.notes?.trim() || null,
    });
    this.deps.cache.invalidate();
    return appointment;
  }

  async setAppointmentStatus(id: string, statusCode: string): Promise<void> {
    await this.deps.db.update('appointment', id, {
      status_id: this.deps.lookups.id('appointment_status', statusCode),
    });
    this.deps.cache.invalidate('appointment', id);
  }

  async todayAppointments(): Promise<AppointmentRow[]> {
    const page = await this.listAppointments({
      page: 1,
      pageSize: 20,
      search: '',
      filters: { period: 'today' },
    });
    return page.rows;
  }

  // ------------------------------------------------------------------
  // Announcements / service of process
  // ------------------------------------------------------------------

  async listAnnouncements(request: TableRequest): Promise<TableResult<AnnouncementRow>> {
    const { db, lookups } = this.deps;
    const statusId = request.filters.status ? lookups.id('announcement_status', request.filters.status) : null;
    const page = await db.query('announcement', {
      filters: statusId ? [{ column: 'status_id', op: 'eq', value: statusId }] : [],
      orderBy: [{ column: 'created_at', direction: 'desc' }],
      ...paginate(request.page, request.pageSize),
    });
    const rows: AnnouncementRow[] = [];
    for (const announcement of page.rows) {
      const recipient = await this.deps.cache.get('party', announcement.recipient_party_id ? String(announcement.recipient_party_id) : null);
      const task = await this.deps.cache.get('task', announcement.task_id ? String(announcement.task_id) : null);
      const status = lookups.byId(String(announcement.status_id ?? ''));
      rows.push({
        announcement,
        kindName: lookups.byId(String(announcement.kind_id ?? ''))?.nameAr ?? '—',
        methodName: lookups.byId(String(announcement.method_id ?? ''))?.nameAr ?? '—',
        statusName: status?.nameAr ?? '—',
        statusCode: status?.code ?? '',
        recipientName: recipient ? String(recipient.display_name) : null,
        taskTitle: task ? String(task.title) : null,
      });
    }
    return { rows, total: page.total };
  }

  async createAnnouncement(input: {
    kindCode?: string;
    recipientPartyId?: string;
    methodCode?: string;
    servedOn?: string;
    publication?: string;
    taskId?: string;
    statusCode?: string;
    notes?: string;
  }): Promise<EngineRow> {
    const announcement = await this.deps.db.insert('announcement', {
      task_id: input.taskId ?? null,
      kind_id: this.deps.lookups.id('announcement_kind', input.kindCode ?? 'initial'),
      recipient_party_id: input.recipientPartyId ?? null,
      method_id: this.deps.lookups.id('announcement_method', input.methodCode ?? 'bailiff'),
      served_on: input.servedOn ?? null,
      publication: input.publication?.trim() || null,
      proof_document_id: null,
      status_id: this.deps.lookups.id('announcement_status', input.statusCode ?? 'pending'),
      notes: input.notes?.trim() || null,
    });
    this.deps.cache.invalidate();
    return announcement;
  }

  async setAnnouncementStatus(id: string, statusCode: string, servedOn?: string): Promise<void> {
    await this.deps.db.update('announcement', id, {
      status_id: this.deps.lookups.id('announcement_status', statusCode),
      ...(servedOn ? { served_on: servedOn } : {}),
    });
    this.deps.cache.invalidate('announcement', id);
  }
}

export async function clientNamesForCase(
  db: ServiceDeps['db'],
  cache: ServiceDeps['cache'],
  caseId: string,
): Promise<string[]> {
  const links = await db.query('case_file_case', {
    filters: [{ column: 'case_id', op: 'eq', value: caseId }],
    limit: 20,
  });
  const names = new Set<string>();
  if (links.rows.length === 0) return [];
  const clientRole = await db.lookup('party_role', 'client');
  for (const link of links.rows) {
    const partyLinks = await db.query('case_file_party', {
      filters: [
        { column: 'file_id', op: 'eq', value: String(link.file_id) },
        { column: 'role_id', op: 'eq', value: String(clientRole.id) },
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
