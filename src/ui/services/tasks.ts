import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface TaskRow {
  task: EngineRow;
  statusName: string;
  statusCode: string;
  typeName: string;
  priorityName: string;
  priorityCode: string;
  fileLabel: string | null;
  caseLabel: string | null;
  clientName: string | null;
}

export interface TaskBuckets {
  overdue: TaskRow[];
  today: TaskRow[];
  upcoming: TaskRow[];
}

export interface TaskDetail {
  task: EngineRow;
  history: EngineRow[];
  file: EngineRow | null;
  legalCase: EngineRow | null;
  client: EngineRow | null;
  activity: EngineRow[];
}

export class TaskService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<TaskRow>> {
    const { db, lookups } = this.deps;
    const statusId = request.filters.status
      ? lookups.id('task_status', request.filters.status)
      : null;
    const typeId = request.filters.type
      ? lookups.id('task_type', request.filters.type)
      : null;
    const priorityId = request.filters.priority
      ? lookups.id('priority', request.filters.priority)
      : null;
    const openStatusIds = ['open', 'in_progress', 'waiting', 'blocked']
      .map((code) => lookups.id('task_status', code))
      .filter((value): value is string => Boolean(value));
    const bucket = request.filters.bucket ?? '';
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000 - 1);
    const bucketFilters: Array<{
      column: string;
      op: 'eq' | 'gte' | 'lte' | 'lt' | 'isNull' | 'notNull' | 'in';
      value?: string | readonly string[];
    }> = [];
    if (bucket === 'overdue') {
      bucketFilters.push(
        { column: 'due_at', op: 'lt', value: startOfToday.toISOString() },
        ...(openStatusIds.length > 0
          ? [{ column: 'status_id', op: 'in' as const, value: openStatusIds }]
          : []),
      );
    } else if (bucket === 'today') {
      bucketFilters.push(
        { column: 'due_at', op: 'gte', value: startOfToday.toISOString() },
        { column: 'due_at', op: 'lte', value: endOfToday.toISOString() },
      );
    } else if (bucket === 'week') {
      bucketFilters.push(
        { column: 'due_at', op: 'gte', value: endOfToday.toISOString() },
        {
          column: 'due_at',
          op: 'lte',
          value: new Date(
            startOfToday.getTime() + 7 * 86_400_000,
          ).toISOString(),
        },
      );
    } else if (bucket === 'no_due') {
      bucketFilters.push({ column: 'due_at', op: 'isNull' });
    } else if (bucket === 'open' && openStatusIds.length > 0) {
      bucketFilters.push({
        column: 'status_id',
        op: 'in' as const,
        value: openStatusIds,
      });
    }
    const filters = [
      ...(statusId
        ? [{ column: 'status_id', op: 'eq' as const, value: statusId }]
        : []),
      ...(typeId
        ? [{ column: 'task_type_id', op: 'eq' as const, value: typeId }]
        : []),
      ...(priorityId
        ? [{ column: 'priority_id', op: 'eq' as const, value: priorityId }]
        : []),
      ...bucketFilters,
    ];
    if (request.search.trim()) {
      const hits: string[] = [];
      let offset = 0;
      for (;;) {
        const page = await db.searchPage(request.search.trim(), {
          entityType: 'task',
          limit: 200,
          offset,
        });
        hits.push(...page.hits.map((hit) => hit.entityId));
        offset += page.hits.length;
        if (page.hits.length === 0 || offset >= page.total) break;
      }
      const tasks: EngineRow[] = [];
      for (const id of hits) {
        const task = await db.get('task', id);
        if (!task) continue;
        if (filters.every((filter) => matchesClientFilter(task, filter)))
          tasks.push(task);
      }
      tasks.sort((a, b) =>
        compareTasks(a, b, request.sortKey, request.sortDir),
      );
      const { offset: pageOffset, limit } = paginate(
        request.page,
        request.pageSize,
      );
      return {
        rows: await this.enrich(tasks.slice(pageOffset, pageOffset + limit)),
        total: tasks.length,
      };
    }
    const sortColumn =
      request.sortKey === 'title'
        ? 'title'
        : request.sortKey === 'created_at'
          ? 'created_at'
          : 'due_at';
    const page = await db.query('task', {
      filters,
      orderBy: [{ column: sortColumn, direction: request.sortDir ?? 'asc' }],
      ...paginate(request.page, request.pageSize),
    });
    return { rows: await this.enrich(page.rows), total: page.total };
  }

  private async enrich(tasks: readonly EngineRow[]): Promise<TaskRow[]> {
    const { lookups, cache } = this.deps;
    const rows: TaskRow[] = [];
    for (const task of tasks) {
      const file = await cache.get(
        'case_file',
        task.file_id ? String(task.file_id) : null,
      );
      const legalCase = await cache.get(
        'legal_case',
        task.case_id ? String(task.case_id) : null,
      );
      const client = await cache.get(
        'party',
        task.client_party_id ? String(task.client_party_id) : null,
      );
      const status = lookups.byId(String(task.status_id ?? ''));
      const priority = lookups.byId(String(task.priority_id ?? ''));
      rows.push({
        task,
        statusName: status?.nameAr ?? '—',
        statusCode: status?.code ?? '',
        typeName: lookups.byId(String(task.task_type_id ?? ''))?.nameAr ?? '—',
        priorityName: priority?.nameAr ?? '—',
        priorityCode: priority?.code ?? '',
        fileLabel: file ? String(file.file_number) : null,
        caseLabel: legalCase
          ? `قضية ${legalCase.case_number} / ${legalCase.case_year}`
          : null,
        clientName: client ? String(client.display_name) : null,
      });
    }
    return rows;
  }

  async get(taskId: string): Promise<TaskDetail | null> {
    const { db, cache } = this.deps;
    const full = await db.getTaskFull(taskId);
    const activity = await db.auditTrail('task', taskId, 40);
    return {
      task: full.task,
      history: full.statusHistory,
      file: await cache.get(
        'case_file',
        full.task.file_id ? String(full.task.file_id) : null,
      ),
      legalCase: await cache.get(
        'legal_case',
        full.task.case_id ? String(full.task.case_id) : null,
      ),
      client: await cache.get(
        'party',
        full.task.client_party_id ? String(full.task.client_party_id) : null,
      ),
      activity,
    };
  }

  async create(input: {
    title: string;
    description?: string;
    taskTypeCode?: string;
    priorityCode?: string;
    fileId?: string;
    caseId?: string;
    stageId?: string;
    hearingId?: string;
    judgmentId?: string;
    clientPartyId?: string;
    assigneePartyId?: string;
    dueAt?: string;
  }): Promise<EngineRow> {
    if (!input.title.trim())
      throw new ValidationError('task title is required');
    return this.deps.db.transaction(async () => {
      const task = await this.deps.db.createTask({
        ...(input.stageId ? { stageId: input.stageId } : {}),
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.taskTypeCode ? { taskTypeCode: input.taskTypeCode } : {}),
        ...(input.fileId ? { fileId: input.fileId } : {}),
        ...(input.caseId ? { caseId: input.caseId } : {}),
        ...(input.hearingId ? { hearingId: input.hearingId } : {}),
        ...(input.judgmentId ? { judgmentId: input.judgmentId } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      });
      const patch: Record<string, unknown> = {};
      if (input.priorityCode)
        patch.priority_id = this.deps.lookups.id(
          'priority',
          input.priorityCode,
        );
      if (input.clientPartyId) patch.client_party_id = input.clientPartyId;
      if (input.assigneePartyId)
        patch.assignee_party_id = input.assigneePartyId;
      if (Object.keys(patch).length > 0)
        await this.deps.db.update('task', String(task.id), patch);
      this.deps.cache.invalidate();
      return (await this.deps.db.get('task', String(task.id))) ?? task;
    });
  }

  async update(
    taskId: string,
    patch: Record<string, unknown>,
  ): Promise<EngineRow> {
    const task = await this.deps.db.update('task', taskId, patch);
    this.deps.cache.invalidate('task', taskId);
    return task;
  }

  async changeStatus(
    taskId: string,
    statusCode: string,
    options: { resultSummary?: string; suspensionReason?: string } = {},
  ): Promise<EngineRow> {
    const task = await this.deps.db.changeTaskStatus(
      taskId,
      statusCode,
      options,
    );
    this.deps.cache.invalidate('task', taskId);
    return task;
  }

  async remove(taskId: string): Promise<void> {
    await this.deps.db.softDelete('task', taskId, 'حذف تكليف');
    this.deps.cache.invalidate();
  }

  async dueBuckets(now = new Date()): Promise<TaskBuckets> {
    const { db, lookups } = this.deps;
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const start = new Date(`${todayKey}T00:00:00`);
    const end = new Date(start.getTime() + 86_400_000);
    const openStatuses = new Set(
      ['open', 'in_progress', 'waiting', 'blocked']
        .map((code) => lookups.id('task_status', code))
        .filter((value): value is string => Boolean(value)),
    );
    const tasks = await db.query('task', {
      filters: [{ column: 'due_at', op: 'notNull' }],
      orderBy: [{ column: 'due_at', direction: 'asc' }],
      limit: 500,
    });
    const active = tasks.rows.filter((task) =>
      openStatuses.has(String(task.status_id)),
    );
    const overdue = active.filter(
      (task) => String(task.due_at) < now.toISOString(),
    );
    const today = active.filter((task) => {
      const due = new Date(String(task.due_at));
      return due >= start && due < end;
    });
    const upcoming = active
      .filter(
        (task) =>
          String(task.due_at) >= now.toISOString() && !today.includes(task),
      )
      .slice(0, 8);
    return {
      overdue: await this.enrich(overdue.slice(0, 20)),
      today: await this.enrich(today.slice(0, 20)),
      upcoming: await this.enrich(upcoming),
    };
  }
}

function matchesClientFilter(
  row: EngineRow,
  filter: {
    column: string;
    op: 'eq' | 'gte' | 'lte' | 'lt' | 'isNull' | 'notNull' | 'in';
    value?: string | readonly string[];
  },
): boolean {
  const value = row[filter.column] ?? null;
  switch (filter.op) {
    case 'eq':
      return value === filter.value;
    case 'isNull':
      return value === null || value === undefined;
    case 'notNull':
      return value !== null && value !== undefined;
    case 'in':
      return (
        Array.isArray(filter.value) &&
        (filter.value as readonly string[]).includes(String(value))
      );
    case 'gte':
      return value !== null && String(value) >= String(filter.value);
    case 'lte':
      return value !== null && String(value) <= String(filter.value);
    case 'lt':
      return value !== null && String(value) < String(filter.value);
    default:
      return true;
  }
}

function compareTasks(
  a: EngineRow,
  b: EngineRow,
  sortKey: string | undefined,
  dir: 'asc' | 'desc' | undefined,
): number {
  const column =
    sortKey === 'title'
      ? 'title'
      : sortKey === 'created_at'
        ? 'created_at'
        : 'due_at';
  const left = String(a[column] ?? '');
  const right = String(b[column] ?? '');
  if (!left && right) return 1;
  if (left && !right) return -1;
  return left.localeCompare(right, 'ar') * (dir === 'desc' ? -1 : 1);
}
