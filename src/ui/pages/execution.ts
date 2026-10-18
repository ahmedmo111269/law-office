import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber, formatRelative, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { definitionList, emptyState, notice, pageHeader, sectionCard, statCard } from '../components/page.ts';
import { dateField, selectField, textField } from '../components/forms.ts';
import type { PageArgs } from '../app/context.ts';
import { navigate } from '../app/router.ts';
import type { ExecutionDetail, ExecutionRow } from '../services/execution.ts';
import { openFormDialog, setFieldError, statusTone } from './shared.ts';

export async function renderExecution(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;

  const columns: Column<ExecutionRow>[] = [
    {
      key: 'case',
      label: 'ملف التنفيذ',
      width: 240,
      defaultPinned: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('a', { class: 'cell-title cell-link', href: `#/execution/${String(row.legalCase.id)}`, dir: 'auto', text: `تنفيذ ${String(row.legalCase.case_number)} / ${String(row.legalCase.case_year)}` }),
          h('span', { class: 'cell-sub', text: row.fileNumber ? `ملف ${row.fileNumber}` : row.courtName }),
        ),
      text: (row) => `تنفيذ ${String(row.legalCase.case_number)}/${String(row.legalCase.case_year)}`,
    },
    {
      key: 'creditor',
      label: 'الطالب',
      width: 170,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.creditorName ?? '—' }),
      text: (row) => row.creditorName ?? '',
    },
    {
      key: 'debtor',
      label: 'المطلوب ضده',
      width: 170,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.debtorName ?? '—' }),
      text: (row) => row.debtorName ?? '',
    },
    {
      key: 'court',
      label: 'المحكمة / الجهة',
      width: 180,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'text-2', text: row.courtName }),
      text: (row) => row.courtName,
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      cardRole: 'meta',
      render: (row) => h('span', { class: `badge badge--${statusTone(lookups.byId(String(row.legalCase.status_id ?? ''))?.code)}`, text: row.statusName }),
      text: (row) => row.statusName,
    },
    {
      key: 'tasks',
      label: 'إجراءات مفتوحة',
      width: 120,
      align: 'end',
      numeric: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: `num ${row.openTasks > 0 ? 'strong text-warning' : ''}`, text: formatNumber(row.openTasks) }),
      text: (row) => String(row.openTasks),
    },
    {
      key: 'next',
      label: 'الجلسة القادمة',
      width: 150,
      cardRole: 'meta',
      render: (row) => (row.nextHearingAt ? h('span', { class: 'num', text: formatDate(row.nextHearingAt, 'short') }) : h('span', { class: 'text-3', text: '—' })),
      text: (row) => row.nextHearingAt ?? '',
    },
  ];

  const header = pageHeader({
    title: 'أعمال التنفيذ',
    subtitle: 'ملفات التنفيذ كقضايا من نوع «تنفيذ»: الطالب والمطلوب ضده، الإجراءات الجارية، والجلسات.',
    count: 0,
    actions: [h('a', { class: 'btn btn--outline', href: '#/cases?new=1', }, icon('scale', 17), h('span', { text: 'قضية تنفيذ جديدة' }))],
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<ExecutionRow>(
    {
      id: 'execution',
      title: 'ملفات التنفيذ',
      columns,
      load: (request) => services.execution.list(request),
      rowKey: (row) => String(row.legalCase.id),
      rowHref: (row) => `#/execution/${String(row.legalCase.id)}`,
      searchPlaceholder: 'ابحث برقم التنفيذ أو اسم الطالب أو المطلوب…',
      filters: [{ key: 'status', label: 'كل الحالات', options: lookups.items('case_status').map((item) => ({ value: item.code, label: item.nameAr })) }],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('a', { class: 'icon-btn icon-btn--sm', href: `#/execution/${String(row.legalCase.id)}`, title: 'تفاصيل التنفيذ', attrs: { 'aria-label': 'تفاصيل التنفيذ' } }, icon('external', 16)),
      ],
      emptyTitle: 'لا ملفات تنفيذ',
      emptyText: 'أنشئ قضية من نوع «تنفيذ» ثم اربطها بملف العميل وأضف الإجراءات كمهام.',
      emptyIcon: 'layers',
      emptyActions: [h('a', { class: 'btn btn--primary btn--sm', href: '#/cases?new=1', text: 'إنشاء قضية تحمل نوع تنفيذ' })],
    },
    workspace.preferences,
  );

  return h(
    'div',
    { class: 'page' },
    header,
    h(
      'div',
      { class: 'grid-3' },
      statCard({ label: 'ملفات تنفيذ', value: formatNumber(await countExecution(context)), iconName: 'layers' }),
      statCard({ label: 'أحكام أساس التنفيذ', value: formatNumber((await workspace.db.query('judgment', { limit: 0 })).total), iconName: 'stamp' }),
      statCard({ label: 'إجراءات مفتوحة', value: formatNumber((await workspace.db.query('task', { filters: [{ column: 'due_at', op: 'notNull' }], limit: 0 })).total), iconName: 'tasks' }),
    ),
    table.root,
    notice('neutral', 'التنفيذ في البرنامج لا يقرر إجراءً بنفسه: كل خطوة تُسجَّل كمهمة أو جلسة أو مستند مرتبط بملف التنفيذ، ويبقى القرار للمحامي.', { iconName: 'info' }),
  );
}

async function countExecution(context: PageArgs): Promise<number> {
  const typeId = context.services.execution.executionTypeId();
  if (!typeId) return 0;
  return (await context.workspace.db.query('legal_case', { filters: [{ column: 'case_type_id', op: 'eq', value: typeId }], limit: 0 })).total;
}

export async function renderExecutionDetail(context: PageArgs): Promise<HTMLElement> {
  const detail = await context.services.execution.get(context.params.id ?? '');
  if (!detail) {
    return h('div', { class: 'page' }, emptyState({
      iconName: 'layers',
      title: 'ملف التنفيذ غير موجود',
      text: 'قد يكون محذوفًا أو أن الرابط غير صحيح.',
      actions: [h('a', { class: 'btn btn--primary', href: '#/execution', text: 'العودة إلى التنفيذ' })],
    }));
  }
  return renderExecutionPage(context, detail);
}

function renderExecutionPage(context: PageArgs, detail: ExecutionDetail): HTMLElement {
  const { row } = detail;
  const path = `/execution/${String(row.legalCase.id)}`;
  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: `تنفيذ ${String(row.legalCase.case_number)} / ${String(row.legalCase.case_year)}`,
      breadcrumb: [{ label: 'أعمال التنفيذ', href: '#/execution' }, { label: row.courtName }],
      meta: [
        h('span', { class: 'chip', text: row.statusName }),
        row.fileNumber ? h('a', { class: 'chip', href: row.fileId ? `#/files/${row.fileId}` : '#/execution', text: `ملف ${row.fileNumber}` }) : null,
        detail.row.nextHearingAt ? h('span', { class: 'chip', text: `جلسة ${formatDate(row.nextHearingAt, 'short')}` }) : null,
      ].filter(Boolean) as HTMLElement[],
      actions: [
        h('a', { class: 'btn btn--outline', href: `#/cases/${String(row.legalCase.id)}` }, icon('scale', 17), h('span', { text: 'فتح كقضية' })),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openExecutionStep(context, detail, () => navigate(path, { replace: true })) } },
          icon('plus', 17), h('span', { text: 'إجراء تنفيذ' })),
      ],
    }),
    h(
      'div',
      { class: 'detail-layout' },
      h(
        'div',
        { class: 'detail-main' },
        sectionCard({
          title: 'أطراف التنفيذ',
          body: h(
            'div',
            { class: 'stack', style: 'gap:8px' },
            ...detail.parties.map((entry) =>
              h(
                'div',
                { class: 'menu__item', style: 'cursor:default' },
                icon(entry.party ? 'user' : 'alert', 16),
                h('span', { text: entry.party ? String(entry.party.display_name) : 'طرف محذوف' }),
                h('span', { class: 'menu__shortcut', text: `${entry.roleName} · ${entry.sideName}` }),
              ),
            ),
            detail.parties.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لم تُسجَّل أطراف لهذا التنفيذ.' }) : null,
          ),
        }),
        sectionCard({
          title: 'إجراءات التنفيذ',
          actions: [h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'إجراء جديد', on: { click: () => openExecutionStep(context, detail, () => navigate(path, { replace: true })) } })],
          bodyClass: 'card__body--tight',
          body:
            detail.tasks.length === 0
              ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا إجراءات مسجلة. أضف إجراءً كإعلان أو حجز أو استيفاء.' })
              : h(
                  'div',
                  { class: 'record-list' },
                  ...detail.tasks.map((task) =>
                    h(
                      'div',
                      { class: 'row', style: 'padding:12px 16px;gap:12px' },
                      h('span', { class: `status-dot ${String(task.status_id) === context.workspace.lookups.id('task_status', 'completed') ? '' : 'status-dot--offline'}` }),
                      h(
                        'div',
                        { class: 'cell-main grow' },
                        h('span', { class: 'cell-title', text: String(task.title) }),
                        h('span', { class: 'cell-sub', text: `${task.due_at ? formatDate(String(task.due_at), 'short') : 'بدون موعد'} · ${task.due_at ? formatRelative(String(task.due_at)) : '—'}` }),
                      ),
                      h('span', { class: 'badge badge--quiet', text: String(task.priority_code ?? '') ? context.workspace.lookups.byId(String(task.priority_id ?? ''))?.nameAr ?? '' : '' }),
                    ),
                  ),
                ),
        }),
        sectionCard({
          title: 'الجلسات والأحكام',
          body: h(
            'div',
            { class: 'stack', style: 'gap:10px' },
            ...detail.hearings.slice(0, 5).map((hearing) =>
              h(
                'div',
                { class: 'row', style: 'justify-content:space-between' },
                h('span', { class: 'text-sm', text: `جلسة ${formatDate(String(hearing.scheduled_at), 'medium')}` }),
                h('span', { class: 'badge badge--quiet', text: context.workspace.lookups.byId(String(hearing.status_id ?? ''))?.nameAr ?? '—' }),
              ),
            ),
            ...detail.judgments.map((judgment) =>
              h(
                'a',
                { class: 'menu__item', href: `#/judgments/${String(judgment.id)}`, style: 'text-decoration:none' },
                icon('stamp', 15),
                h('span', { text: `حكم ${String(judgment.judgment_number ?? '')} — ${formatDate(String(judgment.issued_on ?? ''), 'short')}` }),
              ),
            ),
            detail.hearings.length === 0 && detail.judgments.length === 0
              ? h('p', { class: 'text-sm text-3', text: 'لا جلسات أو أحكام مرتبطة.' })
              : null,
          ),
        }),
      ),
      h(
        'div',
        { class: 'detail-aside' },
        sectionCard({
          title: 'بيانات أساسية',
          body: definitionList([
            { label: 'المحكمة', value: row.courtName },
            { label: 'حالة القضية', value: row.statusName },
            { label: 'ملف المكتب', value: row.fileNumber ?? '—' },
            { label: 'أساس التنفيذ', value: row.judgmentNumber ?? 'بدون حكم مرتبط' },
            { label: 'الجلسة القادمة', value: row.nextHearingAt ? formatDate(row.nextHearingAt, 'medium') : '—' },
          ]),
        }),
        sectionCard({
          title: 'سجل النشاط',
          bodyClass: 'card__body--tight',
          body: h('div', { class: 'timeline', style: 'padding:8px' },
            ...detail.activity.slice(0, 8).map((entry) =>
              h(
                'div',
                { class: 'timeline__item' },
                h('span', { class: 'timeline__dot' }, icon('info', 12)),
                h('div', { class: 'timeline__body' },
                  h('p', { class: 'timeline__title', text: String(entry.action ?? 'تعديل') }),
                  h('p', { class: 'timeline__meta', text: formatDate(String(entry.occurred_at), 'medium') }),
                ),
              ),
            ),
            detail.activity.length === 0 ? h('p', { class: 'text-sm text-3', style: 'padding:8px', text: 'لا نشاط مسجل.' }) : null,
          ),
        }),
      ),
    ),
  );
}

function openExecutionStep(context: PageArgs, detail: ExecutionDetail, onSaved: () => void): void {
  const lookups = context.workspace.lookups;
  const title = textField({ label: 'عنوان الإجراء', name: 'title', required: true, maxlength: 200, placeholder: 'مثال: إعلان المطلوب ضده بالتنفيذ' });
  const type = selectField({ label: 'نوع التكليف', name: 'taskTypeCode', options: lookups.items('task_type').map((item) => ({ value: item.code, label: item.nameAr })), value: 'execution' });
  const priority = selectField({ label: 'الأهمية', name: 'priorityCode', options: lookups.items('priority').map((item) => ({ value: item.code, label: item.nameAr })), value: 'normal' });
  const dueAt = dateField({ label: 'الموعد', name: 'dueAt', value: isoDateToday() });
  openFormDialog({
    title: 'إجراء تنفيذ جديد',
    description: `تنفيذ ${String(detail.row.legalCase.case_number)} / ${String(detail.row.legalCase.case_year)}`,
    iconName: 'layers',
    content: h('div', { class: 'stack', style: 'gap:16px' }, title, h('div', { class: 'form-grid' }, type, priority), dueAt),
    submitLabel: 'حفظ الإجراء',
    successMessage: 'تم تسجيل إجراء التنفيذ',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.title) { setFieldError(form, 'title', 'عنوان الإجراء مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.tasks.create({
        title: values.title,
        caseId: String(detail.row.legalCase.id),
        ...(values.taskTypeCode ? { taskTypeCode: values.taskTypeCode } : {}),
        ...(values.priorityCode ? { priorityCode: values.priorityCode } : {}),
        ...(values.dueAt ? { dueAt: new Date(`${values.dueAt}T09:00:00`).toISOString() } : {}),
      });
    },
  });
}

function readForm(form: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    if (control.name) values[control.name] = control.value.trim();
  }
  return values;
}

