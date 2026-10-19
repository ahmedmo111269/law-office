import { randomUUID } from 'node:crypto';
import type { SqlRow } from '../db/adapter.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import { getSyncEntity } from '../sync/current-registry.ts';
import { assertIsoTimestamp, toCanonicalTimestamp } from '../util/dates.ts';
import {
  BaseRepository,
  type EntityRecord,
  type RepositoryDependencies,
} from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';
import type { SettingsRepository } from './settings-repository.ts';

export interface ReminderRecord extends SqlRow {
  readonly id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly remind_at: string;
  readonly message: string | null;
  readonly is_dismissed: number;
  readonly dismissed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AppointmentRecord extends EntityRecord {
  readonly title: string;
  readonly kind_id: string | null;
  readonly status_id: string | null;
  readonly start_at: string;
  readonly end_at: string | null;
  readonly all_day: number;
  readonly timezone: string;
  readonly location: string | null;
  readonly party_id: string | null;
  readonly file_id: string | null;
  readonly case_id: string | null;
  readonly task_id: string | null;
  readonly notes: string | null;
}

export class AppointmentRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly settings: SettingsRepository;
  private readonly appointments: BaseRepository<AppointmentRecord>;

  constructor(
    deps: RepositoryDependencies,
    lookups: LookupRepository,
    settings: SettingsRepository,
  ) {
    this.deps = deps;
    this.lookups = lookups;
    this.settings = settings;
    this.appointments = new BaseRepository(deps, getSyncEntity('appointment'));
  }

  create(input: {
    title: string;
    startAt: string;
    endAt?: string;
    allDay?: boolean;
    timezone?: string;
    kindCode?: string;
    statusCode?: string;
    location?: string;
    partyId?: string;
    fileId?: string;
    caseId?: string;
    stageId?: string;
    taskId?: string;
    notes?: string;
  }): AppointmentRecord {
    if (!input.title?.trim())
      throw new ValidationError('appointment title is required');
    const startAt = toCanonicalTimestamp(
      assertIsoTimestamp(input.startAt, 'startAt'),
    );
    const endAt = input.endAt
      ? toCanonicalTimestamp(assertIsoTimestamp(input.endAt, 'endAt'))
      : null;
    if (endAt && endAt < startAt)
      throw new ValidationError('end time cannot precede start time');
    this.validateLinks(input);
    const stage = input.stageId
      ? new BaseRepository(
          this.deps,
          getSyncEntity('procedural_stage'),
        ).requireById(input.stageId)
      : null;

    return this.appointments.insert({
      ...(input.stageId ? { stage_id: input.stageId } : {}),
      title: input.title.trim(),
      kind_id: this.lookups.resolveOptional('appointment_kind', input.kindCode),
      status_id: this.lookups.requireItemByCode(
        'appointment_status',
        input.statusCode ?? 'scheduled',
        'appointment status',
      ).id,
      start_at: startAt,
      end_at: endAt,
      all_day: input.allDay ? 1 : 0,
      timezone:
        input.timezone ??
        this.settings.getString('locale.timezone', 'Africa/Cairo'),
      location: input.location ?? null,
      party_id: input.partyId ?? null,
      file_id: input.fileId ?? stage?.file_id ?? null,
      case_id: input.caseId ?? stage?.case_id ?? null,
      task_id: input.taskId ?? null,
      notes: input.notes ?? null,
    });
  }

  setStatus(id: string, statusCode: string): AppointmentRecord {
    return this.appointments.update(id, {
      status_id: this.lookups.requireItemByCode(
        'appointment_status',
        statusCode,
      ).id,
    });
  }

  complete(id: string): AppointmentRecord {
    return this.setStatus(id, 'completed');
  }

  cancel(id: string): AppointmentRecord {
    return this.setStatus(id, 'cancelled');
  }

  getAppointment(id: string): AppointmentRecord {
    return this.appointments.requireById(id);
  }

  calendar(fromIso: string, toIso: string, limit = 200): AppointmentRecord[] {
    const from = toCanonicalTimestamp(assertIsoTimestamp(fromIso, 'from'));
    const to = toCanonicalTimestamp(assertIsoTimestamp(toIso, 'to'));
    if (to < from) throw new ValidationError('calendar range is inverted');
    return this.deps.db
      .query<SqlRow>(
        `SELECT * FROM appointment
         WHERE deleted_at IS NULL AND start_at < ?
           AND (end_at IS NULL OR end_at >= ?)
         ORDER BY start_at LIMIT ?`,
        [to, from, limit],
      )
      .map((row) => ({
        ...row,
        id: String(row.id),
      })) as unknown as AppointmentRecord[];
  }

  getFull(id: string): {
    appointment: AppointmentRecord;
    parties: ReadonlyArray<SqlRow>;
  } {
    const appointment = this.appointments.requireById(id);
    const parties = appointment.party_id
      ? this.deps.db.query<SqlRow>(
          'SELECT id, display_name FROM party WHERE id = ?',
          [appointment.party_id],
        )
      : [];
    return { appointment, parties };
  }

  softDelete(
    id: string,
    reason?: string,
  ): { batchId: string; affectedCount: number } {
    return this.appointments.softDelete(id, {
      ...(reason === undefined ? {} : { reason }),
    });
  }

  restore(id: string): { batchId: string | null; restoredCount: number } {
    return this.appointments.restore(id);
  }

  private validateLinks(input: {
    partyId?: string;
    fileId?: string;
    caseId?: string;
    taskId?: string;
  }): void {
    if (
      input.partyId &&
      !this.deps.db.get(
        'SELECT id FROM party WHERE id = ? AND deleted_at IS NULL',
        [input.partyId],
      )
    ) {
      throw new NotFoundError('party', input.partyId);
    }
    if (
      input.fileId &&
      !this.deps.db.get(
        'SELECT id FROM case_file WHERE id = ? AND deleted_at IS NULL',
        [input.fileId],
      )
    ) {
      throw new NotFoundError('case_file', input.fileId);
    }
    if (
      input.caseId &&
      !this.deps.db.get(
        'SELECT id FROM legal_case WHERE id = ? AND deleted_at IS NULL',
        [input.caseId],
      )
    ) {
      throw new NotFoundError('legal_case', input.caseId);
    }
    if (
      input.taskId &&
      !this.deps.db.get(
        'SELECT id FROM task WHERE id = ? AND deleted_at IS NULL',
        [input.taskId],
      )
    ) {
      throw new NotFoundError('task', input.taskId);
    }
  }
}

/** Local reminders only; OS/browser background delivery is platform-dependent. */
export class ReminderRepository {
  private readonly deps: RepositoryDependencies;

  constructor(deps: RepositoryDependencies) {
    this.deps = deps;
  }

  create(input: {
    entityType: string;
    entityId: string;
    remindAt: string;
    message?: string;
  }): ReminderRecord {
    if (!input.entityType.trim())
      throw new ValidationError('entity type is required');
    if (!input.entityId.trim())
      throw new ValidationError('entity id is required');
    const remindAt = toCanonicalTimestamp(
      assertIsoTimestamp(input.remindAt, 'remindAt'),
    );
    const id = randomUUID();
    const now = toCanonicalTimestamp(this.deps.clock.now());
    this.deps.db.run(
      `INSERT INTO reminder
        (id, entity_type, entity_id, remind_at, message, is_dismissed, dismissed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      [
        id,
        input.entityType,
        input.entityId,
        remindAt,
        input.message ?? null,
        now,
        now,
      ],
    );
    return {
      id,
      entity_type: input.entityType,
      entity_id: input.entityId,
      remind_at: remindAt,
      message: input.message ?? null,
      is_dismissed: 0,
      dismissed_at: null,
      created_at: now,
      updated_at: now,
    };
  }

  due(atIso: string, limit = 100): ReminderRecord[] {
    const now = toCanonicalTimestamp(assertIsoTimestamp(atIso, 'at'));
    return this.deps.db
      .query<SqlRow>(
        `SELECT * FROM reminder WHERE is_dismissed = 0 AND remind_at <= ?
         ORDER BY remind_at LIMIT ?`,
        [now, limit],
      )
      .map((row) => ({
        ...row,
        id: String(row.id),
      })) as unknown as ReminderRecord[];
  }

  dismiss(id: string): void {
    const now = toCanonicalTimestamp(this.deps.clock.now());
    this.deps.db.run(
      'UPDATE reminder SET is_dismissed = 1, dismissed_at = ?, updated_at = ? WHERE id = ?',
      [now, now, id],
    );
  }

  list(limit = 100): ReminderRecord[] {
    return this.deps.db
      .query<SqlRow>('SELECT * FROM reminder ORDER BY remind_at LIMIT ?', [
        limit,
      ])
      .map((row) => ({
        ...row,
        id: String(row.id),
      })) as unknown as ReminderRecord[];
  }
}
