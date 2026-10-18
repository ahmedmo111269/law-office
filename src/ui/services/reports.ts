import type { EngineRow } from '../../portable/store.ts';
import type { ServiceDeps } from './types.ts';
import { eachPage } from './types.ts';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'start' | 'end';
}

export interface ReportRow {
  key: string;
  cells: Array<string | number | null>;
  amountMinor?: number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  href?: string;
}

export interface ReportResult {
  id: string;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  generatedAt: string;
  total: string;
  note?: string;
}

export type ReportId = 'files' | 'cases' | 'hearings' | 'finance' | 'workload' | 'clients';

export class ReportService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async build(id: ReportId, rangeDays = 30): Promise<ReportResult> {
    switch (id) {
      case 'files':
        return this.files();
      case 'cases':
        return this.cases();
      case 'hearings':
        return this.hearings(rangeDays);
      case 'finance':
        return this.finance();
      case 'workload':
        return this.workload();
      case 'clients':
        return this.clients();
    }
  }

  // --------------------------------------------------------------- files
  private async files(): Promise<ReportResult> {
    const { db, lookups } = this.deps;
    const rows: ReportRow[] = [];
    let totalCount = 0;
    for (const status of lookups.items('file_status')) {
      const count = (await db.query('case_file', { filters: [{ column: 'status_id', op: 'eq', value: status.id }], limit: 0 })).total;
      totalCount += count;
      rows.push({ key: `status:${status.code}`, cells: [status.nameAr, count], tone: status.code === 'closed' ? 'default' : 'success' });
    }
    for (const area of lookups.items('practice_area')) {
      const count = (await db.query('case_file', { filters: [{ column: 'practice_area_id', op: 'eq', value: area.id }], limit: 0 })).total;
      if (count > 0) rows.push({ key: `area:${area.code}`, cells: [area.nameAr, count] });
    }
    const closed = (await db.query('case_file', { filters: [{ column: 'closed_on', op: 'notNull' }], limit: 0 })).total;
    return {
      id: 'files',
      title: 'توزيع ملفات المكتب',
      description: 'عدد الملفات لكل حالة ومجال ممارسة، محسوبًا من قاعدة البيانات الفعلية.',
      columns: [{ key: 'group', label: 'الحالة / المجال' }, { key: 'count', label: 'عدد الملفات', align: 'end' }],
      rows,
      generatedAt: new Date().toISOString(),
      total: `الإجمالي: ${totalCount} ملفًا · مغلقة: ${closed}`,
    };
  }

  // --------------------------------------------------------------- cases
  private async cases(): Promise<ReportResult> {
    const { db, lookups } = this.deps;
    const rows: ReportRow[] = [];
    const courts = await db.query('court', { orderBy: [{ column: 'name', direction: 'asc' }], limit: 200 });
    for (const court of courts.rows) {
      const count = (await db.query('legal_case', { filters: [{ column: 'court_id', op: 'eq', value: String(court.id) }], limit: 0 })).total;
      if (count > 0) rows.push({ key: `court:${String(court.id)}`, cells: [String(court.name), count] });
    }
    for (const type of lookups.items('case_type')) {
      const count = (await db.query('legal_case', { filters: [{ column: 'case_type_id', op: 'eq', value: type.id }], limit: 0 })).total;
      if (count > 0) rows.push({ key: `type:${type.code}`, cells: [type.nameAr, count] });
    }
    rows.sort((left, right) => Number(right.cells[1] ?? 0) - Number(left.cells[1] ?? 0));
    const total = (await db.query('legal_case', { limit: 0 })).total;
    return {
      id: 'cases',
      title: 'القضايا حسب المحكمة والنوع',
      description: 'توزيع القضايا المسجلة. تظهر المحاكم والنواع التي لديها قضايا فقط.',
      columns: [{ key: 'group', label: 'المحكمة / النوع' }, { key: 'count', label: 'عدد القضايا', align: 'end' }],
      rows,
      generatedAt: new Date().toISOString(),
      total: `إجمالي القضايا: ${total}`,
    };
  }

  // ------------------------------------------------------------- hearings
  private async hearings(rangeDays: number): Promise<ReportResult> {
    const { db, lookups } = this.deps;
    const start = new Date();
    const until = new Date(start.getTime() + rangeDays * 86_400_000);
    const base = [
      { column: 'scheduled_at', op: 'gte' as const, value: start.toISOString() },
      { column: 'scheduled_at', op: 'lte' as const, value: until.toISOString() },
    ];
    const rows: ReportRow[] = [];
    for (const status of lookups.items('hearing_status')) {
      const count = (await db.query('hearing', {
        filters: [...base, { column: 'status_id', op: 'eq', value: status.id }],
        limit: 0,
      })).total;
      if (count > 0) rows.push({ key: `status:${status.code}`, cells: [status.nameAr, count] });
    }
    for (const purpose of lookups.items('hearing_purpose')) {
      const count = (await db.query('hearing', {
        filters: [...base, { column: 'purpose_id', op: 'eq', value: purpose.id }],
        limit: 0,
      })).total;
      if (count > 0) rows.push({ key: `purpose:${purpose.code}`, cells: [purpose.nameAr, count] });
    }
    const total = (await db.query('hearing', { filters: base, limit: 0 })).total;
    return {
      id: 'hearings',
      title: `الجلسات خلال ${rangeDays} يومًا`,
      description: 'الجلسات المجدولة قادمًا موزعة على الحالة والغرض.',
      columns: [{ key: 'group', label: 'الحالة / الغرض' }, { key: 'count', label: 'عدد الجلسات', align: 'end' }],
      rows,
      generatedAt: new Date().toISOString(),
      total: `إجمالي الجلسات في الفترة: ${total}`,
      note: 'تُحسب الجلسات من تاريخ جدولتها الفعلي؛ الجلسات المنتهية قبل اليوم لا تدخل في هذه الفترة.',
    };
  }

  // -------------------------------------------------------------- finance
  private async finance(): Promise<ReportResult> {
    const { db } = this.deps;
    const now = new Date();
    const rows: ReportRow[] = [];
    let received = 0;
    let spent = 0;
    for (let index = 11; index >= 0; index -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - index + 1, 1);
      let inflow = 0;
      let outflow = 0;
      await eachPage(db, 'financial_transaction', (pageRows) => {
        for (const row of pageRows) {
          if (row.status !== 'posted') continue;
          const amount = Number(row.amount_minor ?? 0);
          if (String(row.direction) === 'in') inflow += amount;
          else outflow += amount;
        }
      }, {
        filters: [
          { column: 'occurred_at', op: 'gte', value: start.toISOString() },
          { column: 'occurred_at', op: 'lt', value: end.toISOString() },
        ],
        pageSize: 500,
      });
      received += inflow;
      spent += outflow;
      const label = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(start);
      rows.push({
        key: `month:${start.toISOString().slice(0, 7)}`,
        cells: [label, (inflow / 100).toFixed(2), (outflow / 100).toFixed(2), ((inflow - outflow) / 100).toFixed(2)],
        tone: inflow - outflow >= 0 ? 'success' : 'danger',
      });
    }
    return {
      id: 'finance',
      title: 'التحصيل والمصروفات — آخر 12 شهرًا',
      description: 'المبالغ بالجنيه، محسوبة من الحركات المالية غير الملغاة.',
      columns: [
        { key: 'month', label: 'الشهر' },
        { key: 'in', label: 'تحصيل', align: 'end' },
        { key: 'out', label: 'مصروف', align: 'end' },
        { key: 'net', label: 'الصافي', align: 'end' },
      ],
      rows,
      generatedAt: new Date().toISOString(),
      total: `إجمالي التحصيل: ${(received / 100).toFixed(2)} ج.م · المصروفات: ${(spent / 100).toFixed(2)} ج.م`,
      note: 'التحصيل يشمل كل قيد وارد، حتى غير المخصص لمستحق. راجع صفحة المالية للمدفوعات غير المخصصة.',
    };
  }

  // ------------------------------------------------------------- workload
  private async workload(): Promise<ReportResult> {
    const { db, lookups } = this.deps;
    const rows: ReportRow[] = [];
    for (const status of lookups.items('task_status')) {
      const count = (await db.query('task', { filters: [{ column: 'status_id', op: 'eq', value: status.id }], limit: 0 })).total;
      if (count > 0) rows.push({ key: `status:${status.code}`, cells: [status.nameAr, count], tone: status.code === 'completed' ? 'success' : 'default' });
    }
    const overdue = (await db.query('task', {
      filters: [
        { column: 'due_at', op: 'notNull' },
        { column: 'due_at', op: 'lt', value: new Date().toISOString() },
      ],
      limit: 0,
    })).total;
    for (const priority of lookups.items('priority')) {
      const count = (await db.query('task', { filters: [{ column: 'priority_id', op: 'eq', value: priority.id }], limit: 0 })).total;
      if (count > 0) rows.push({ key: `priority:${priority.code}`, cells: [priority.nameAr, count] });
    }
    return {
      id: 'workload',
      title: 'عبء العمل والمهام',
      description: 'توزيع المهام على الحالات والأهميات، مع عدد المتأخرة.',
      columns: [{ key: 'group', label: 'الحالة / الأهمية' }, { key: 'count', label: 'عدد المهام', align: 'end' }],
      rows,
      generatedAt: new Date().toISOString(),
      total: `متأخرة عن موعدها: ${overdue} مهمة`,
      note: 'المتأخرة تشمل كل مهمة تجاوز موعدها مهما كانت حالتها؛ راجع صفحة المهام لتصفية المفتوحة فقط.',
    };
  }

  // -------------------------------------------------------------- clients
  private async clients(): Promise<ReportResult> {
    const { db, lookups } = this.deps;
    const rows: ReportRow[] = [];
    const total = (await db.query('client_profile', { limit: 0 })).total;
    for (const status of lookups.items('client_status')) {
      const count = (await db.query('client_profile', { filters: [{ column: 'status_id', op: 'eq', value: status.id }], limit: 0 })).total;
      if (count > 0) rows.push({ key: `status:${status.code}`, cells: [status.nameAr, count] });
    }
    for (const source of lookups.items('client_source')) {
      const count = (await db.query('client_profile', { filters: [{ column: 'source_id', op: 'eq', value: source.id }], limit: 0 })).total;
      if (count > 0) rows.push({ key: `source:${source.code}`, cells: [source.nameAr, count] });
    }
    const now = new Date();
    for (let index = 5; index >= 0; index -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - index + 1, 1);
      const count = (await db.query('client_profile', {
        filters: [
          { column: 'created_at', op: 'gte', value: start.toISOString() },
          { column: 'created_at', op: 'lt', value: end.toISOString() },
        ],
        limit: 0,
      })).total;
      rows.push({
        key: `month:${start.toISOString().slice(0, 7)}`,
        cells: [new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(start), count],
      });
    }
    return {
      id: 'clients',
      title: 'العملاء والتوزيع الشهري',
      description: 'العملاء حسب الحالة والمصدر، وأعداد العملاء المسجلين في كل شهر من آخر ستة أشهر.',
      columns: [{ key: 'group', label: 'التصنيف / الشهر' }, { key: 'count', label: 'العدد', align: 'end' }],
      rows,
      generatedAt: new Date().toISOString(),
      total: `إجمالي العملاء: ${total}`,
    };
  }

  async activeHearingsByCourt(limit = 8): Promise<Array<{ court: string; count: number }>> {
    const { db, cache } = this.deps;
    const result: Array<{ court: string; count: number }> = [];
    const start = new Date();
    const until = new Date(start.getTime() + 30 * 86_400_000);
    const page = await db.query('hearing', {
      filters: [
        { column: 'scheduled_at', op: 'gte', value: start.toISOString() },
        { column: 'scheduled_at', op: 'lte', value: until.toISOString() },
      ],
      limit: 200,
    });
    const map = new Map<string, number>();
    for (const hearing of page.rows) {
      const legalCase: EngineRow | null = await cache.get('legal_case', String(hearing.case_id ?? ''));
      const court = legalCase?.court_id ? await cache.get('court', String(legalCase.court_id)) : null;
      const name = String(court?.name ?? 'بدون محكمة');
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    for (const [court, count] of map) result.push({ court, count });
    return result.sort((left, right) => right.count - left.count).slice(0, limit);
  }
}
