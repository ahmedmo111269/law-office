import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber, formatRelative, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { definitionList, emptyState, notice, pageHeader, sectionCard, statCard } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import type { PageArgs } from '../app/context.ts';
import { navigate } from '../app/router.ts';
import type { JudgmentDetail, JudgmentRow } from '../services/judgments.ts';
import { openFormDialog, setFieldError, statusTone } from './shared.ts';

export async function renderJudgments(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;
  const deadlines = await services.judgments.upcomingDeadlines(21);

  const columns: Column<JudgmentRow>[] = [
    {
      key: 'number',
      label: 'رقم الحكم',
      width: 190,
      defaultPinned: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h(
            'a',
            { class: 'cell-title cell-link', href: `#/judgments/${String(row.judgment.id)}`, text: String(row.judgment.judgment_number ?? 'حكم بدون رقم') },
          ),
          h('span', { class: 'cell-sub', text: row.typeName }),
        ),
      text: (row) => String(row.judgment.judgment_number ?? ''),
    },
    {
      key: 'case',
      label: 'القضية',
      width: 190,
      cardRole: 'detail',
      render: (row) =>
        h(
          'a',
          { class: 'cell-link', href: `#/cases/${row.caseId}` },
          h('span', { dir: 'auto', text: `${row.caseNumber} / ${row.caseYear}` }),
        ),
      text: (row) => `${row.caseNumber}/${row.caseYear}`,
    },
    {
      key: 'court',
      label: 'المحكمة',
      width: 180,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'text-2', text: row.courtName }),
      text: (row) => row.courtName,
    },
    {
      key: 'issued',
      label: 'تاريخ الإصدار',
      width: 130,
      sortable: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'num', text: row.judgment.issued_on ? formatDate(String(row.judgment.issued_on), 'short') : '—' }),
      text: (row) => String(row.judgment.issued_on ?? ''),
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      cardRole: 'meta',
      render: (row) => h('span', { class: `badge badge--${statusTone(lookups.byId(String(row.judgment.status_id ?? ''))?.code)}`, text: row.statusName }),
      text: (row) => row.statusName,
    },
    {
      key: 'deadline',
      label: 'مهلة الطعن',
      width: 140,
      cardRole: 'meta',
      render: (row) => deadlineCell(row.appealDeadline),
      text: (row) => row.appealDeadline ?? '',
    },
    {
      key: 'appeals',
      label: 'الطعون',
      width: 90,
      align: 'end',
      numeric: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'num', text: formatNumber(row.appealsCount) }),
      text: (row) => String(row.appealsCount),
    },
  ];

  const header = pageHeader({
    title: 'الأحكام',
    subtitle: 'الأحكام الصادرة، منطوقها وأسبابها، ومواعيد الطعن عليها. مواعيد الطعن هنا تقديرية يدخلها المكتب ولا تُحسب آليًا.',
    count: 0,
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<JudgmentRow>(
    {
      id: 'judgments',
      title: 'سجل الأحكام',
      columns,
      load: (request) => services.judgments.list(request),
      rowKey: (row) => String(row.judgment.id),
      rowHref: (row) => `#/judgments/${String(row.judgment.id)}`,
      searchPlaceholder: 'ابحث برقم الحكم أو رقم القضية أو المنطوق…',
      defaultSort: { key: 'issued', dir: 'desc' },
      filters: [
        { key: 'type', label: 'كل الأنواع', options: lookups.items('judgment_type').map((item) => ({ value: item.code, label: item.nameAr })) },
        { key: 'status', label: 'كل الحالات', options: lookups.items('judgment_status').map((item) => ({ value: item.code, label: item.nameAr })) },
      ],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('button', {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          title: 'تسجيل طعن',
          attrs: { 'aria-label': 'تسجيل طعن على الحكم' },
          on: { click: () => openAppealDialog(context, row, () => void table.reload()) },
        }, icon('gavel', 16)),
        h('a', { class: 'icon-btn icon-btn--sm', href: `#/judgments/${String(row.judgment.id)}`, title: 'تفاصيل الحكم', attrs: { 'aria-label': 'تفاصيل الحكم' } }, icon('external', 16)),
      ],
      toolbar: [
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', on: { click: () => openJudgmentCreate(context, () => void table.reload()) } },
          icon('plus', 15), h('span', { text: 'تسجيل حكم' })),
      ],
      emptyTitle: 'لا أحكام مسجلة',
      emptyText: 'سجّل الحكم من صفحة القضية أو من هنا مباشرة بعد صدوره؛ سيظهر في ملف القضية وفي المواعيد.',
      emptyIcon: 'stamp',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'تسجيل حكم', on: { click: () => openJudgmentCreate(context, () => void table.reload()) } })],
    },
    workspace.preferences,
  );

  const page = h(
    'div',
    { class: 'page' },
    header,
    h(
      'div',
      { class: 'grid-3' },
      statCard({ label: 'أحكام مسجلة', value: formatNumber(await countJudgments(context)), iconName: 'stamp' }),
      statCard({ label: 'طعون قائمة', value: formatNumber(await countAppeals(context)), iconName: 'gavel' }),
      statCard({ label: 'مهل طعن خلال 21 يومًا', value: formatNumber(deadlines.length), iconName: 'calendar-clock', tone: deadlines.length > 0 ? 'warning' : 'default' }),
    ),
    deadlines.length > 0
      ? sectionCard({
          title: 'مهل طعن قريبة',
          subtitle: 'التاريخ المسجل يدويًا في بطاقة الحكم؛ راجع التقويم قبل الفوات.',
          bodyClass: 'card__body--tight',
          body: h(
            'div',
            { class: 'record-list' },
            ...deadlines.map((row) =>
              h(
                'a',
                { class: 'attention-item', href: `#/judgments/${String(row.judgment.id)}`, style: 'text-decoration:none;color:inherit' },
                h('span', { class: 'attention-item__icon' }, icon('stamp', 16)),
                h(
                  'span',
                  { class: 'attention-item__body' },
                  h('span', { class: 'attention-item__title', text: `حكم ${String(row.judgment.judgment_number ?? '')} — قضية ${row.caseNumber}/${row.caseYear}` }),
                  h('span', { class: 'attention-item__desc', text: row.courtName }),
                ),
                h('span', { class: 'attention-item__meta', text: row.appealDeadline ? formatRelative(`${row.appealDeadline}T09:00:00`) : '' }),
              ),
            ),
          ),
        })
      : null,
    table.root,
    notice('info', 'مواعيد الطعن تُحسب بقواعد قانونية دقيقة تختلف حسب نوع الحكم ودرجة التقاضي. البرنامج يعرض التاريخ الذي يدخله المكتب ولا يستنتجه، لتجنّب أي موعد خاطئ.', { iconName: 'info' }),
  );
  return page;
}

async function countJudgments(context: PageArgs): Promise<number> {
  return (await context.workspace.db.query('judgment', { limit: 0 })).total;
}

async function countAppeals(context: PageArgs): Promise<number> {
  return (await context.workspace.db.query('judgment_appeal', { limit: 0 })).total;
}

function deadlineCell(deadline: string | null): HTMLElement {
  if (!deadline) return h('span', { class: 'text-3', text: '—' });
  const today = isoDateToday();
  const days = Math.round((new Date(`${deadline}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
  const tone = days < 0 ? 'quiet' : days <= 3 ? 'danger' : days <= 10 ? 'warning' : 'info';
  const label = days < 0 ? 'انقضت' : days === 0 ? 'اليوم' : `${formatNumber(days)} يومًا`;
  return h(
    'span',
    { class: 'stack', style: 'gap:2px' },
    h('span', { class: 'num', text: formatDate(deadline, 'short') }),
    h('span', { class: `badge badge--${tone}`, text: label }),
  );
}

export async function renderJudgmentDetail(context: PageArgs): Promise<HTMLElement> {
  const detail = await context.services.judgments.get(context.params.id ?? '');
  if (!detail) {
    return h('div', { class: 'page' }, emptyState({
      iconName: 'stamp',
      title: 'الحكم غير موجود',
      text: 'قد يكون محذوفًا أو أن الرابط غير صحيح.',
      actions: [h('a', { class: 'btn btn--primary', href: '#/judgments', text: 'العودة إلى الأحكام' })],
    }));
  }
  return renderJudgmentPage(context, detail);
}

function renderJudgmentPage(context: PageArgs, detail: JudgmentDetail): HTMLElement {
  const lookups = context.workspace.lookups;
  const row = detail.judgment;
  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: `حكم ${String(row.judgment.judgment_number ?? '—')}`,
      breadcrumb: [{ label: 'الأحكام', href: '#/judgments' }, { label: `قضية ${row.caseNumber}/${row.caseYear}` }],
      meta: [
        h('span', { class: 'chip', text: row.typeName }),
        h('span', { class: `badge badge--${statusTone(lookups.byId(String(row.judgment.status_id ?? ''))?.code)}`, text: row.statusName }),
        row.appealDeadline ? h('span', { class: 'chip', text: `مهلة الطعن: ${formatDate(row.appealDeadline, 'short')}` }) : null,
      ].filter(Boolean) as HTMLElement[],
      actions: [
        h('a', { class: 'btn btn--outline', href: `#/cases/${row.caseId}` }, icon('scale', 17), h('span', { text: 'القضية' })),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openAppealDialog(context, row, () => navigate(`/judgments/${String(row.judgment.id)}`, { replace: true })) } },
          icon('gavel', 17), h('span', { text: 'تسجيل طعن' })),
      ],
    }),
    h(
      'div',
      { class: 'detail-layout' },
      h(
        'div',
        { class: 'detail-main' },
        sectionCard({
          title: 'منطوق الحكم',
          body: row.judgment.operative_part
            ? h('p', { class: 'text-md', style: 'line-height:1.9;white-space:pre-wrap', text: String(row.judgment.operative_part) })
            : h('p', { class: 'text-sm text-3', text: 'لم يُسجَّل المنطوق بعد.' }),
        }),
        sectionCard({
          title: 'الأسباب',
          body: row.judgment.reasoning
            ? h('p', { class: 'text-sm', style: 'line-height:1.9;white-space:pre-wrap', text: String(row.judgment.reasoning) })
            : h('p', { class: 'text-sm text-3', text: 'لم تُسجَّل الأسباب بعد.' }),
        }),
        sectionCard({
          title: 'الطعون',
          actions: [h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'طعن جديد', on: { click: () => openAppealDialog(context, row, () => navigate(`/judgments/${String(row.judgment.id)}`, { replace: true })) } })],
          bodyClass: 'card__body--tight',
          body:
            detail.appeals.length === 0
              ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا طعون مسجلة على هذا الحكم.' })
              : h(
                  'div',
                  { class: 'record-list' },
                  ...detail.appeals.map((entry) =>
                    h(
                      'div',
                      { class: 'panel', style: 'border:0;border-radius:0' },
                      h(
                        'div',
                        { class: 'row-wrap', style: 'justify-content:space-between' },
                        h('span', { class: 'strong', text: entry.typeName }),
                        h('span', { class: 'badge badge--quiet', text: entry.statusName }),
                      ),
                      h('p', { class: 'text-sm text-2', text: entry.appeal.notes ? String(entry.appeal.notes) : 'بدون ملاحظات' }),
                      h(
                        'div',
                        { class: 'row-wrap text-xs text-3' },
                        h('span', { text: `أُقيم: ${entry.appeal.filed_on ? formatDate(String(entry.appeal.filed_on), 'short') : '—'}` }),
                        h('span', { text: `مهلة: ${entry.appeal.user_deadline_on ? formatDate(String(entry.appeal.user_deadline_on), 'short') : '—'}` }),
                        entry.appeal.reference_no ? h('span', { class: 'mono', text: String(entry.appeal.reference_no) }) : null,
                      ),
                    ),
                  ),
                ),
        }),
      ),
      h(
        'div',
        { class: 'detail-aside' },
        sectionCard({
          title: 'بيانات الحكم',
          body: definitionList([
            { label: 'المحكمة', value: row.courtName },
            { label: 'تاريخ الإصدار', value: row.judgment.issued_on ? formatDate(String(row.judgment.issued_on), 'medium') : '—' },
            { label: 'تاريخ إيداع النسخة', value: row.judgment.deposit_date ? formatDate(String(row.judgment.deposit_date), 'medium') : '—' },
            { label: 'استلام الصورة', value: row.judgment.copy_received_on ? formatDate(String(row.judgment.copy_received_on), 'medium') : '—' },
            { label: 'مهلة الطعن', value: row.appealDeadline ? formatDate(row.appealDeadline, 'medium') : '—' },
          ]),
        }),
        sectionCard({
          title: 'الملفات المرتبطة',
          body: h(
            'div',
            { class: 'stack', style: 'gap:6px' },
            ...detail.files.map((file) => h('a', { class: 'menu__item', href: `#/files/${String(file.id)}`, style: 'text-decoration:none' }, icon('folder', 15), h('span', { text: `${String(file.file_number)} — ${String(file.title)}` }))),
            detail.files.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا ملفات مرتبطة بهذا الحكم.' }) : null,
          ),
        }),
      ),
    ),
  );
}

export function openJudgmentCreate(context: PageArgs, onSaved: () => void): void {
  const lookups = context.workspace.lookups;
  const theCase = entityPicker({
    name: 'caseId',
    label: 'القضية',
    required: true,
    placeholder: 'ابحث برقم القضية أو السنة…',
    search: (query) => context.services.cases.searchOptions(query, 8),
  });
  const number = textField({ label: 'رقم الحكم', name: 'judgmentNumber', maxlength: 60, dir: 'auto' });
  const issuedOn = dateField({ label: 'تاريخ الإصدار', name: 'issuedOn', required: true, value: isoDateToday() });
  const type = selectField({ label: 'نوع الحكم', name: 'typeCode', options: lookups.items('judgment_type').map((item) => ({ value: item.code, label: item.nameAr })) });
  const status = selectField({ label: 'حالة الحكم', name: 'statusCode', options: lookups.items('judgment_status').map((item) => ({ value: item.code, label: item.nameAr })), value: 'issued' });
  const deadline = dateField({ label: 'آخر يوم للطعن (إدخال يدوي)', name: 'appealDeadline', help: 'لا يحسبه البرنامج آليًا. اتركه فارغًا إن لم تُحدده.' });
  const operative = textareaField({ label: 'منطوق الحكم', name: 'operativePart', rows: 4, maxlength: 4000 });
  const reasoning = textareaField({ label: 'الأسباب', name: 'reasoning', rows: 4, maxlength: 8000 });
  openFormDialog({
    title: 'تسجيل حكم',
    description: 'يُربط الحكم بالقضية ويظهر في سجلها وفي تقارير الأحكام.',
    iconName: 'stamp',
    size: 'lg',
    content: h(
      'div',
      { class: 'stack', style: 'gap:16px' },
      theCase.root,
      h('div', { class: 'form-grid' }, number, issuedOn),
      h('div', { class: 'form-grid' }, type, status),
      deadline,
      operative,
      reasoning,
    ),
    submitLabel: 'حفظ الحكم',
    successMessage: 'تم تسجيل الحكم',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      const caseId = theCase.getValue();
      if (!caseId) throw new Error('اختر القضية.');
      if (!values.issuedOn) { setFieldError(form, 'issuedOn', 'تاريخ الإصدار مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      const judgment = await context.services.cases.recordJudgment({
        caseId,
        issuedOn: values.issuedOn,
        ...(values.typeCode ? { judgmentTypeCode: values.typeCode } : {}),
        ...(values.operativePart ? { operativePart: values.operativePart } : {}),
        ...(values.reasoning ? { reasoning: values.reasoning } : {}),
        ...(values.statusCode ? { statusCode: values.statusCode } : {}),
      });
      const patch: Record<string, unknown> = {};
      if (values.judgmentNumber) patch.judgment_number = values.judgmentNumber;
      if (values.appealDeadline) patch.user_appeal_deadline = values.appealDeadline;
      if (Object.keys(patch).length > 0) {
        await context.workspace.db.update('judgment', String(judgment.id), patch);
      }
    },
  });
}

export function openAppealDialog(context: PageArgs, row: JudgmentRow, onSaved: () => void): void {
  const lookups = context.workspace.lookups;
  const type = selectField({ label: 'نوع الطعن', name: 'appealTypeCode', required: true, options: lookups.items('appeal_type').map((item) => ({ value: item.code, label: item.nameAr })), value: 'appeal' });
  const filedOn = dateField({ label: 'تاريخ الإقامة', name: 'filedOn', value: isoDateToday() });
  const deadline = dateField({ label: 'مهلة الطعن (يدوي)', name: 'deadline' });
  const reference = textField({ label: 'رقم الطعن / المرجع', name: 'referenceNo', dir: 'auto', maxlength: 60 });
  const notes = textareaField({ label: 'ملاحظات', name: 'notes', rows: 2, maxlength: 1000 });
  openFormDialog({
    title: 'تسجيل طعن',
    description: `حكم ${String(row.judgment.judgment_number ?? '')} — قضية ${row.caseNumber}/${row.caseYear}`,
    iconName: 'gavel',
    content: h('div', { class: 'stack', style: 'gap:16px' }, h('div', { class: 'form-grid' }, type, filedOn), deadline, reference, notes),
    submitLabel: 'حفظ الطعن',
    successMessage: 'تم تسجيل الطعن',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.appealTypeCode) { setFieldError(form, 'appealTypeCode', 'اختر نوع الطعن.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.judgments.addAppeal({
        judgmentId: String(row.judgment.id),
        appealTypeCode: values.appealTypeCode,
        ...(values.filedOn ? { filedOn: values.filedOn } : {}),
        ...(values.deadline ? { userDeadlineOn: values.deadline } : {}),
        ...(values.referenceNo ? { referenceNo: values.referenceNo } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
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
