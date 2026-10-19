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

export interface TaskRecord extends EntityRecord {
  readonly title: string;
  readonly description: string | null;
  readonly task_type_id: string | null;
  readonly status_id: string | null;
  readonly priority_id: string | null;
  readonly file_id: string | null;
  readonly case_id: string | null;
  readonly hearing_id: string | null;
  readonly judgment_id: string | null;
  readonly client_party_id: string | null;
  readonly assignee_party_id: string | null;
  readonly parent_task_id: string | null;
  readonly due_at: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly cancelled_at: string | null;
  readonly suspension_reason: string | null;
  readonly result_summary: string | null;
  readonly notes: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  taskTypeCode?: string;
  statusCode?: string;
  priorityCode?: string;
  fileId?: string;
  caseId?: string;
  stageId?: string;
  hearingId?: string;
  judgmentId?: string;
  clientPartyId?: string;
  assigneePartyId?: string;
  parentTaskId?: string;
  dueAt?: string;
  notes?: string;
}

export class TaskRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly tasks: BaseRepository<TaskRecord>;
  private readonly history: BaseRepository<EntityRecord>;
  private readonly announcements: BaseRepository<EntityRecord>;

  constructor(deps: RepositoryDependencies, lookups: LookupRepository) {
    this.deps = deps;
    this.lookups = lookups;
    this.tasks = new BaseRepository<TaskRecord>(deps, getSyncEntity('task'));
    this.history = new BaseRepository(
      deps,
      getSyncEntity('task_status_history'),
    );
    this.announcements = new BaseRepository(
      deps,
      getSyncEntity('announcement'),
    );
  }

  create(input: CreateTaskInput): TaskRecord {
    if (!input.title?.trim())
      throw new ValidationError('task title is required');
    if (input.dueAt) assertIsoTimestamp(input.dueAt, 'dueAt');
    this.validateLinks(input);
    const stage = input.stageId
      ? new BaseRepository(
          this.deps,
          getSyncEntity('procedural_stage'),
        ).requireById(input.stageId)
      : null;

    return this.tasks.insert({
      title: input.title.trim(),
      ...(input.stageId ? { stage_id: input.stageId } : {}),
      description: input.description ?? null,
      task_type_id: this.lookups.requireItemByCode(
        'task_type',
        input.taskTypeCode ?? 'administrative',
        'task type',
      ).id,
      status_id: this.lookups.requireItemByCode(
        'task_status',
        input.statusCode ?? 'open',
        'task status',
      ).id,
      priority_id: this.lookups.resolveOptional('priority', input.priorityCode),
      file_id: input.fileId ?? stage?.file_id ?? null,
      case_id: input.caseId ?? stage?.case_id ?? null,
      hearing_id: input.hearingId ?? null,
      judgment_id: input.judgmentId ?? null,
      client_party_id: input.clientPartyId ?? null,
      assignee_party_id: input.assigneePartyId ?? null,
      parent_task_id: input.parentTaskId ?? null,
      due_at: input.dueAt ? toCanonicalTimestamp(input.dueAt) : null,
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      suspension_reason: null,
      result_summary: null,
      notes: input.notes ?? null,
    });
  }

  changeStatus(
    taskId: string,
    statusCode: string,
    options: {
      note?: string;
      resultSummary?: string;
      suspensionReason?: string;
    } = {},
  ): TaskRecord {
    const task = this.tasks.requireById(taskId);
    const nextStatus = this.lookups.requireItemByCode(
      'task_status',
      statusCode,
      'task status',
    );
    if (task.status_id === nextStatus.id) return task;
    const now = toCanonicalTimestamp(this.deps.clock.now());

    return this.deps.db.transaction(() => {
      const update: Record<string, string | null> = {
        status_id: nextStatus.id,
      };
      if (statusCode === 'completed') {
        update.completed_at = now;
        update.cancelled_at = null;
        if (options.resultSummary !== undefined)
          update.result_summary = options.resultSummary;
      } else if (statusCode === 'cancelled') {
        update.cancelled_at = now;
      } else if (statusCode === 'in_progress') {
        update.started_at = task.started_at ?? now;
      } else if (statusCode === 'blocked' || statusCode === 'waiting') {
        update.suspension_reason =
          options.suspensionReason ?? task.suspension_reason;
      }
      if (options.resultSummary !== undefined && statusCode !== 'completed') {
        update.result_summary = options.resultSummary;
      }
      const updated = this.tasks.update(taskId, update);
      this.history.insert({
        task_id: taskId,
        from_status_id: task.status_id,
        to_status_id: nextStatus.id,
        changed_at: now,
        changed_by_device_id: this.deps.deviceId,
        note: options.note ?? null,
      });
      return updated;
    });
  }

  complete(taskId: string, resultSummary?: string): TaskRecord {
    return this.changeStatus(taskId, 'completed', {
      ...(resultSummary === undefined ? {} : { resultSummary }),
    });
  }

  assign(taskId: string, assigneePartyId: string | null): TaskRecord {
    if (assigneePartyId) this.requireParty(assigneePartyId);
    return this.tasks.update(taskId, { assignee_party_id: assigneePartyId });
  }

  addAnnouncement(input: {
    taskId?: string;
    kindCode: string;
    recipientPartyId?: string;
    methodCode?: string;
    servedOn?: string;
    publication?: string;
    proofDocumentId?: string;
    statusCode?: string;
    notes?: string;
  }): EntityRecord {
    if (input.taskId) this.tasks.requireById(input.taskId);
    if (input.recipientPartyId) this.requireParty(input.recipientPartyId);
    if (input.servedOn) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.servedOn)) {
        throw new ValidationError('servedOn must be YYYY-MM-DD');
      }
    }
    if (input.proofDocumentId) {
      if (
        !this.deps.db.get('SELECT id FROM document WHERE id = ?', [
          input.proofDocumentId,
        ])
      ) {
        throw new NotFoundError('document', input.proofDocumentId);
      }
    }
    return this.announcements.insert({
      task_id: input.taskId ?? null,
      kind_id: this.lookups.requireItemByCode(
        'announcement_kind',
        input.kindCode,
        'announcement kind',
      ).id,
      recipient_party_id: input.recipientPartyId ?? null,
      method_id: this.lookups.resolveOptional(
        'announcement_method',
        input.methodCode,
      ),
      served_on: input.servedOn ?? null,
      publication: input.publication ?? null,
      proof_document_id: input.proofDocumentId ?? null,
      status_id: this.lookups.requireItemByCode(
        'announcement_status',
        input.statusCode ?? 'pending',
        'announcement status',
      ).id,
      notes: input.notes ?? null,
    });
  }

  getTask(taskId: string): TaskRecord {
    return this.tasks.requireById(taskId);
  }

  getFull(taskId: string): {
    task: TaskRecord;
    statusHistory: ReadonlyArray<SqlRow>;
    announcements: ReadonlyArray<SqlRow>;
  } {
    const task = this.tasks.requireById(taskId);
    const statusHistory = this.deps.db.query<SqlRow>(
      `SELECT h.*, f.name_ar AS from_status_name, t.name_ar AS to_status_name
       FROM task_status_history h
       LEFT JOIN lookup_item f ON f.id = h.from_status_id
       LEFT JOIN lookup_item t ON t.id = h.to_status_id
       WHERE h.task_id = ? ORDER BY h.changed_at`,
      [taskId],
    );
    const announcements = this.deps.db.query<SqlRow>(
      `SELECT a.*, k.name_ar AS kind_name, s.name_ar AS status_name
       FROM announcement a
       LEFT JOIN lookup_item k ON k.id = a.kind_id
       LEFT JOIN lookup_item s ON s.id = a.status_id
       WHERE a.task_id = ? AND a.deleted_at IS NULL`,
      [taskId],
    );
    return { task, statusHistory, announcements };
  }

  listOpen(
    options: { assigneePartyId?: string; limit?: number } = {},
  ): TaskRecord[] {
    const statusIds = ['open', 'in_progress', 'waiting', 'blocked'].map(
      (code) => this.lookups.requireItemByCode('task_status', code).id,
    );
    const filters = [
      { column: 'status_id', operator: 'IN' as const, value: statusIds },
    ];
    if (options.assigneePartyId) {
      filters.push({
        column: 'assignee_party_id',
        value: options.assigneePartyId,
      } as never);
    }
    return this.tasks.list({
      filters,
      limit: options.limit ?? 100,
      orderBy: { column: 'due_at', direction: 'asc' },
    });
  }

  softDelete(
    taskId: string,
    reason?: string,
  ): { batchId: string; affectedCount: number } {
    return this.tasks.softDelete(taskId, {
      ...(reason === undefined ? {} : { reason }),
    });
  }

  restore(taskId: string): { batchId: string | null; restoredCount: number } {
    return this.tasks.restore(taskId);
  }

  private validateLinks(input: CreateTaskInput): void {
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
    if (input.hearingId) {
      const hearing = this.deps.db.get<{ case_id: string }>(
        'SELECT case_id FROM hearing WHERE id = ? AND deleted_at IS NULL',
        [input.hearingId],
      );
      if (!hearing) throw new NotFoundError('hearing', input.hearingId);
      if (input.caseId && hearing.case_id !== input.caseId) {
        throw new ValidationError('hearing belongs to a different case');
      }
    }
    if (input.judgmentId) {
      const judgment = this.deps.db.get<{ case_id: string }>(
        'SELECT case_id FROM judgment WHERE id = ? AND deleted_at IS NULL',
        [input.judgmentId],
      );
      if (!judgment) throw new NotFoundError('judgment', input.judgmentId);
      if (input.caseId && judgment.case_id !== input.caseId) {
        throw new ValidationError('judgment belongs to a different case');
      }
    }
    if (input.clientPartyId) this.requireParty(input.clientPartyId);
    if (input.assigneePartyId) this.requireParty(input.assigneePartyId);
    if (input.parentTaskId) this.tasks.requireById(input.parentTaskId);
  }

  private requireParty(partyId: string): void {
    if (
      !this.deps.db.get(
        'SELECT id FROM party WHERE id = ? AND deleted_at IS NULL',
        [partyId],
      )
    ) {
      throw new NotFoundError('party', partyId);
    }
  }
}
