import type { EngineRow } from '../../portable/store.ts';
import type { ServiceDeps } from './types.ts';
import type { AgendaService, AppointmentRow, HearingRow } from './agenda.ts';
import type { TaskRow, TaskService } from './tasks.ts';
import type { FinanceService } from './finance.ts';
import { dayRangeIso, formatRelative, isoDateToday, addDaysToKey } from '../format.ts';

export interface AttentionItem {
  id: string;
  kind: 'task' | 'hearing' | 'finance' | 'document' | 'backup';
  title: string;
  description: string;
  route: string;
  severity: 'normal' | 'warning' | 'critical';
  dueLabel: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  title: string;
  summary: string;
  route: string | null;
  occurredAt: string;
}

export interface ReadinessItem {
  hearing: HearingRow;
  daysAway: number;
  openTasks: number;
  documents: number;
}

export interface DashboardData {
  hearingsToday: HearingRow[];
  hearingsTomorrow: HearingRow[];
  tasksOverdue: TaskRow[];
  tasksToday: TaskRow[];
  appointmentsToday: AppointmentRow[];
  outstandingMinor: number;
  overdueCharges: number;
  needsAttention: AttentionItem[];
  readiness: ReadinessItem[];
  recentFiles: Array<{ file: EngineRow; clientNames: string[] }>;
  recentActivity: ActivityItem[];
  unallocatedMinor: number;
  tasksOpenCount: number;
  backupDue: boolean;
  isEmpty: boolean;
}

export class DashboardService {
  private readonly deps: ServiceDeps;
  private readonly agenda: AgendaService;
  private readonly tasks: TaskService;
  private readonly finance: FinanceService;
  constructor(deps: ServiceDeps, services: {
    agenda: AgendaService;
    tasks: TaskService;
    finance: FinanceService;
  }) {
    this.deps = deps;
    this.agenda = services.agenda;
    this.tasks = services.tasks;
    this.finance = services.finance;
  }

  async load(preferences: { get(key: string): string; getNumber(key: string, fallback: number): number }, backupReminderDays: number): Promise<DashboardData> {
    const { db, lookups } = this.deps;
    const [hearingsToday, upcoming, taskBuckets, appointmentsToday, finance, recentFiles, activity] = await Promise.all([
      this.agenda.today(),
      this.agenda.upcoming(7),
      this.tasks.dueBuckets(),
      this.agenda.todayAppointments(),
      this.finance.overview(),
      this.recentFiles(),
      this.recentActivity(),
    ]);

    const tomorrowKey = addDaysToKey(isoDateToday(), 1);
    const tomorrowRange = dayRangeIso(tomorrowKey);
    const hearingsTomorrow = upcoming.filter(
      (row) => String(row.hearing.scheduled_at) >= tomorrowRange.from && String(row.hearing.scheduled_at) < tomorrowRange.to,
    );

    const readiness: ReadinessItem[] = [];
    for (const hearing of upcoming.slice(0, 5)) {
      const caseId = String(hearing.hearing.case_id);
      const openTasks = await db.query('task', {
        filters: [
          { column: 'case_id', op: 'eq', value: caseId },
          { column: 'status_id', op: 'in', value: [
            lookups.id('task_status', 'open'),
            lookups.id('task_status', 'in_progress'),
            lookups.id('task_status', 'waiting'),
            lookups.id('task_status', 'blocked'),
          ].filter((value): value is string => Boolean(value)) },
        ],
        limit: 0,
      });
      const docs = await db.query('document_link', {
        filters: [{ column: 'case_id', op: 'eq', value: caseId }],
        limit: 0,
      });
      const daysAway = Math.ceil(
        (new Date(String(hearing.hearing.scheduled_at)).getTime() - Date.now()) / 86_400_000,
      );
      readiness.push({ hearing, daysAway: Math.max(0, daysAway), openTasks: openTasks.total, documents: docs.total });
    }

    const needsAttention: AttentionItem[] = [];
    for (const task of taskBuckets.overdue.slice(0, 4)) {
      needsAttention.push({
        id: `task-${task.task.id}`,
        kind: 'task',
        title: String(task.task.title),
        description: `${task.typeName}${task.clientName ? ` · ${task.clientName}` : ''}`,
        route: `#/tasks?focus=${String(task.task.id)}`,
        severity: 'critical',
        dueLabel: `تأخر ${formatRelative(String(task.task.due_at))}`,
      });
    }
    const todayHearingsWithoutOutcome = hearingsToday.filter((row) => row.statusCode === 'scheduled' && new Date(String(row.hearing.scheduled_at)).getTime() < Date.now());
    for (const hearing of todayHearingsWithoutOutcome.slice(0, 2)) {
      needsAttention.push({
        id: `hearing-${String(hearing.hearing.id)}`,
        kind: 'hearing',
        title: `جلسة ${hearing.caseLabel} بلا نتيجة مسجلة`,
        description: hearing.courtName,
        route: `#/hearings?focus=${String(hearing.hearing.id)}`,
        severity: 'warning',
        dueLabel: 'اليوم',
      });
    }
    if (finance.overdueMinor > 0) {
      needsAttention.push({
        id: 'finance-overdue',
        kind: 'finance',
        title: 'مستحقات تجاوزت موعد السداد',
        description: 'راجع المستحقات المتأخرة وحدد إجراء المتابعة.',
        route: '#/finance?tab=charges&status=outstanding',
        severity: 'warning',
        dueLabel: 'مالي',
      });
    }
    if (finance.unallocatedMinor > 0) {
      needsAttention.push({
        id: 'finance-unallocated',
        kind: 'finance',
        title: 'مدفوعات غير مخصصة لمستحقات',
        description: 'خصص المدفوعات حتى تعكس الأرصدة حالتها الحقيقية.',
        route: '#/finance?tab=transactions',
        severity: 'normal',
        dueLabel: 'مالي',
      });
    }

    const openTasks = await db.query('task', {
      filters: [{ column: 'status_id', op: 'in', value: [
        lookups.id('task_status', 'open'),
        lookups.id('task_status', 'in_progress'),
        lookups.id('task_status', 'waiting'),
        lookups.id('task_status', 'blocked'),
      ].filter((value): value is string => Boolean(value)) }],
      limit: 0,
    });

    const lastBackup = preferences.get('ui.lastBackupAt') || '';
    const daysSinceBackup = lastBackup ? (Date.now() - new Date(lastBackup).getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    const hasData = (await db.query('client_profile', { limit: 0 })).total > 0;
    const backupDue = hasData && daysSinceBackup > backupReminderDays;

    if (backupDue) {
      needsAttention.push({
        id: 'backup-due',
        kind: 'backup',
        title: 'لم تُنشئ نسخة احتياطية منذ فترة',
        description: 'نزّل نسخة محلية اليوم لحماية بيانات المكتب.',
        route: '#/settings?tab=backup',
        severity: 'normal',
        dueLabel: 'بيانات',
      });
    }

    return {
      hearingsToday,
      hearingsTomorrow,
      tasksOverdue: taskBuckets.overdue,
      tasksToday: taskBuckets.today,
      appointmentsToday,
      outstandingMinor: finance.outstandingMinor,
      overdueCharges: finance.overdueMinor > 0 ? 1 : 0,
      needsAttention: needsAttention.slice(0, 6),
      readiness,
      recentFiles,
      recentActivity: activity,
      unallocatedMinor: finance.unallocatedMinor,
      tasksOpenCount: openTasks.total,
      backupDue,
      isEmpty: !hasData,
    };
  }

  private async recentFiles(): Promise<Array<{ file: EngineRow; clientNames: string[] }>> {
    const { db, lookups } = this.deps;
    const page = await db.query('case_file', {
      orderBy: [{ column: 'updated_at', direction: 'desc' }],
      limit: 5,
    });
    const rows: Array<{ file: EngineRow; clientNames: string[] }> = [];
    for (const file of page.rows) {
      const links = await db.query('case_file_party', {
        filters: [
          { column: 'file_id', op: 'eq', value: String(file.id) },
          { column: 'role_id', op: 'eq', value: String(lookups.id('party_role', 'client')) },
        ],
        limit: 10,
      });
      const parties = await this.deps.cache.many('party', links.rows.map((link) => String(link.party_id)));
      rows.push({ file, clientNames: [...parties.values()].map((party) => String(party.display_name)) });
    }
    return rows;
  }

  private async recentActivity(): Promise<ActivityItem[]> {
    const rows = await this.deps.db.recentAudit(12);
    const items: ActivityItem[] = [];
    for (const row of rows) {
      const entityType = String(row.entity_type ?? '');
      const entityId = String(row.entity_id ?? '');
      const resolved = await this.resolveEntity(entityType, entityId);
      if (!resolved) continue;
      items.push({
        id: String(row.id),
        action: String(row.action),
        title: resolved.title,
        summary: actionLabel(String(row.action)),
        route: resolved.route,
        occurredAt: String(row.occurred_at),
      });
      if (items.length >= 7) break;
    }
    return items;
  }

  private async resolveEntity(entityType: string, entityId: string): Promise<{ title: string; route: string | null } | null> {
    if (!entityId) return null;
    const { cache, db } = this.deps;
    switch (entityType) {
      case 'party': {
        const party = await cache.get('party', entityId);
        return party ? { title: String(party.display_name), route: `#/clients/${entityId}` } : null;
      }
      case 'case_file': {
        const file = await cache.get('case_file', entityId);
        return file ? { title: `${file.file_number} — ${file.title}`, route: `#/files/${entityId}` } : null;
      }
      case 'legal_case': {
        const legalCase = await cache.get('legal_case', entityId);
        return legalCase ? { title: `قضية ${legalCase.case_number} / ${legalCase.case_year}`, route: `#/cases/${entityId}` } : null;
      }
      case 'hearing': {
        const hearing = await db.get('hearing', entityId);
        if (!hearing) return null;
        const legalCase = await cache.get('legal_case', String(hearing.case_id));
        return {
          title: legalCase ? `جلسة قضية ${legalCase.case_number} / ${legalCase.case_year}` : 'جلسة',
          route: `#/hearings?focus=${entityId}`,
        };
      }
      case 'task': {
        const task = await cache.get('task', entityId);
        return task ? { title: String(task.title), route: `#/tasks?focus=${entityId}` } : null;
      }
      case 'document': {
        const doc = await cache.get('document', entityId);
        return doc ? { title: String(doc.title), route: `#/documents?focus=${entityId}` } : null;
      }
      case 'contract': {
        const contract = await cache.get('contract', entityId);
        return contract ? { title: String(contract.title), route: `#/contracts?focus=${entityId}` } : null;
      }
      case 'power_of_attorney': {
        const poa = await cache.get('power_of_attorney', entityId);
        return poa ? { title: `توكيل ${poa.poa_number ?? ''}`, route: `#/contracts?tab=poa&focus=${entityId}` } : null;
      }
      case 'financial_charge': {
        const charge = await cache.get('financial_charge', entityId);
        return charge ? { title: String(charge.description), route: `#/finance?tab=charges&focus=${entityId}` } : null;
      }
      case 'financial_transaction': {
        return { title: 'حركة مالية', route: '#/finance?tab=transactions' };
      }
      case 'appointment': {
        const appointment = await cache.get('appointment', entityId);
        return appointment ? { title: String(appointment.title), route: `#/appointments?focus=${entityId}` } : null;
      }
      default:
        return null;
    }
  }
}

export function actionLabel(action: string): string {
  switch (action) {
    case 'insert':
      return 'أُنشئ';
    case 'update':
      return 'حُدّث';
    case 'delete':
      return 'حُذف';
    case 'restore':
      return 'استُعيد';
    case 'archive':
      return 'أُرشف';
    case 'transaction_void':
      return 'أُلغي';
    default:
      return action;
  }
}

export async function loadClientNames(
  db: ServiceDeps['db'],
  cache: ServiceDeps['cache'],
  fileId: string,
  clientRoleId: string | null,
): Promise<string[]> {
  const links = await db.query('case_file_party', {
    filters: [
      { column: 'file_id', op: 'eq', value: fileId },
      ...(clientRoleId ? [{ column: 'role_id', op: 'eq' as const, value: clientRoleId }] : []),
    ],
    limit: 20,
  });
  const parties = await cache.many('party', links.rows.map((link) => String(link.party_id)));
  return [...parties.values()].map((party) => String(party.display_name));
}
