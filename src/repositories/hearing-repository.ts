import type { SqlRow } from '../db/adapter.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import { assertIsoTimestamp, toCanonicalTimestamp } from '../util/dates.ts';
import { BaseRepository, type EntityRecord, type RepositoryDependencies } from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';
import type { SettingsRepository } from './settings-repository.ts';

export interface HearingRecord extends EntityRecord {
  readonly case_id: string;
  readonly court_id: string | null;
  readonly circuit_id: string | null;
  readonly scheduled_at: string;
  readonly timezone: string;
  readonly purpose: string | null;
  readonly status_id: string | null;
  readonly held_at: string | null;
  readonly outcome_summary: string | null;
  readonly court_decision: string | null;
  readonly postponement_reason: string | null;
  readonly required_actions: string | null;
  readonly next_hearing_id: string | null;
  readonly notes: string | null;
}

export interface ScheduleHearingInput {
  caseId: string;
  scheduledAt: string;
  timezone?: string;
  courtId?: string;
  circuitId?: string;
  purpose?: string;
  statusCode?: string;
  notes?: string;
}

export interface RecordHearingInput {
  statusCode?: string;
  heldAt?: string;
  outcomeSummary?: string;
  courtDecision?: string;
  postponementReason?: string;
  requiredActions?: string;
  notes?: string;
}

/**
 * A hearing is a judicial event tied to a case. A next-session appointment is
 * a separate row linked by `next_hearing_id`; it is never stored as the same
 * row being edited. No legal deadlines are computed here.
 */
export class HearingRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly settings: SettingsRepository;
  private readonly hearings: BaseRepository<HearingRecord>;

  constructor(
    deps: RepositoryDependencies,
    lookups: LookupRepository,
    settings: SettingsRepository,
  ) {
    this.deps = deps;
    this.lookups = lookups;
    this.settings = settings;
    this.hearings = new BaseRepository<HearingRecord>(deps, getSyncEntity('hearing'));
  }

  schedule(input: ScheduleHearingInput): HearingRecord {
    const legalCase = this.requireCase(input.caseId);
    const scheduledAt = toCanonicalTimestamp(assertIsoTimestamp(input.scheduledAt, 'scheduledAt'));
    const courtId = input.courtId ?? (legalCase.court_id as string | null);
    const circuitId = input.circuitId ?? (legalCase.circuit_id as string | null);
    this.validateCourtCircuit(courtId, circuitId);

    return this.hearings.insert({
      case_id: input.caseId,
      court_id: courtId,
      circuit_id: circuitId,
      scheduled_at: scheduledAt,
      timezone: input.timezone ?? this.defaultTimezone(),
      purpose: input.purpose ?? null,
      status_id: this.lookups.requireItemByCode(
        'hearing_status',
        input.statusCode ?? 'scheduled',
        'hearing status',
      ).id,
      held_at: null,
      outcome_summary: null,
      court_decision: null,
      postponement_reason: null,
      required_actions: null,
      next_hearing_id: null,
      notes: input.notes ?? null,
    });
  }

  record(hearingId: string, input: RecordHearingInput): HearingRecord {
    const hearing = this.hearings.requireById(hearingId);
    const update: Record<string, string | null> = {};
    if (input.statusCode !== undefined) {
      update.status_id = this.lookups.requireItemByCode('hearing_status', input.statusCode).id;
    }
    if (input.heldAt !== undefined) update.held_at = toCanonicalTimestamp(assertIsoTimestamp(input.heldAt, 'heldAt'));
    if (input.outcomeSummary !== undefined) update.outcome_summary = input.outcomeSummary;
    if (input.courtDecision !== undefined) update.court_decision = input.courtDecision;
    if (input.postponementReason !== undefined) update.postponement_reason = input.postponementReason;
    if (input.requiredActions !== undefined) update.required_actions = input.requiredActions;
    if (input.notes !== undefined) update.notes = input.notes;

    const effectiveStatus = input.statusCode;
    if (effectiveStatus === 'held' && !('held_at' in update) && hearing.held_at === null) {
      update.held_at = toCanonicalTimestamp(this.deps.clock.now());
    }
    return Object.keys(update).length === 0
      ? hearing
      : this.hearings.update(hearingId, update);
  }

  /**
   * Inserts the next hearing and links the previous one in one transaction.
   * The new session must belong to the same case and be later in time.
   */
  scheduleNext(previousHearingId: string, input: Omit<ScheduleHearingInput, 'caseId'> & { caseId?: string }): HearingRecord {
    const previous = this.hearings.requireById(previousHearingId);
    const caseId = input.caseId ?? previous.case_id;
    if (caseId !== previous.case_id) {
      throw new ValidationError('next hearing must belong to the same case');
    }
    const scheduledAt = toCanonicalTimestamp(assertIsoTimestamp(input.scheduledAt, 'scheduledAt'));
    if (scheduledAt <= previous.scheduled_at) {
      throw new ValidationError('next hearing must be scheduled after the previous hearing');
    }

    return this.deps.db.transaction(() => {
      const next = this.schedule({ ...input, caseId });
      this.hearings.update(previousHearingId, { next_hearing_id: next.id });
      return next;
    });
  }

  getHearing(hearingId: string): HearingRecord {
    return this.hearings.requireById(hearingId);
  }

  listForCase(caseId: string): HearingRecord[] {
    return this.hearings.list({
      filters: [{ column: 'case_id', value: caseId }],
      limit: 500,
      orderBy: { column: 'scheduled_at', direction: 'asc' },
    });
  }

  upcoming(fromIso: string, limit = 50): HearingRecord[] {
    return this.hearings.list({
      filters: [{ column: 'scheduled_at', operator: '>=', value: toCanonicalTimestamp(assertIsoTimestamp(fromIso, 'from')) }],
      limit,
      orderBy: { column: 'scheduled_at', direction: 'asc' },
    });
  }

  getFull(hearingId: string): { hearing: HearingRecord; caseRow: SqlRow; court: SqlRow | undefined } {
    const hearing = this.hearings.requireById(hearingId);
    const caseRow = this.deps.db.get<SqlRow>('SELECT * FROM legal_case WHERE id = ?', [hearing.case_id]);
    if (!caseRow) throw new NotFoundError('legal_case', hearing.case_id);
    const court = hearing.court_id
      ? this.deps.db.get<SqlRow>('SELECT * FROM court WHERE id = ?', [hearing.court_id])
      : undefined;
    return { hearing, caseRow, court };
  }

  softDelete(hearingId: string, reason?: string): { batchId: string; affectedCount: number } {
    return this.hearings.softDelete(hearingId, { ...(reason === undefined ? {} : { reason }) });
  }

  restore(hearingId: string): { batchId: string | null; restoredCount: number } {
    return this.hearings.restore(hearingId);
  }

  private requireCase(caseId: string): SqlRow {
    const row = this.deps.db.get<SqlRow>(
      'SELECT id, court_id, circuit_id FROM legal_case WHERE id = ? AND deleted_at IS NULL',
      [caseId],
    );
    if (!row) throw new NotFoundError('legal_case', caseId);
    return row;
  }

  private validateCourtCircuit(courtId: string | null, circuitId: string | null): void {
    if (circuitId) {
      if (!courtId) throw new ValidationError('a circuit requires a court');
      const row = this.deps.db.get<{ court_id: string }>(
        'SELECT court_id FROM court_circuit WHERE id = ? AND deleted_at IS NULL',
        [circuitId],
      );
      if (!row) throw new NotFoundError('court_circuit', circuitId);
      if (row.court_id !== courtId) throw new ValidationError('circuit does not belong to court');
    }
    if (courtId) {
      const row = this.deps.db.get('SELECT id FROM court WHERE id = ? AND deleted_at IS NULL', [
        courtId,
      ]);
      if (!row) throw new NotFoundError('court', courtId);
    }
  }

  private defaultTimezone(): string {
    return this.settings.getString('locale.timezone', 'Africa/Cairo');
  }
}
