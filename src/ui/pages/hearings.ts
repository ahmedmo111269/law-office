import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber, formatTime, humanDayLabel, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { pageHeader } from '../components/page.ts';
import { dateField, selectField, textField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import { navigate } from '../app/router.ts';
import type { PageArgs } from '../app/context.ts';
import type { HearingRow } from '../services/agenda.ts';
import { openFormDialog, setFieldError, statusTone } from './shared.ts';
import { openHearingOutcome } from './today.ts';

export async function renderHearings(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;
  const period = context.query.get('period') ?? 'upcoming';

  const columns: Column<HearingRow>[] = [
    {
      key: 'when',
      label: 'الموعد',
      width: 175,
      sortable: true,
      defaultPinned: true,
      cardRole: 'meta',
      render: (row) => {
        const value = String(row.hearing.scheduled_at);
        const today = value.slice(0, 10) === isoDateToday();
        return h(
          'div',
          { class: 'cell-main' },
          h('span', { class: `cell-title num${today ? ' text-danger strong' : ''}`, text: `${formatDate(value, 'short')} — ${formatTime(value)}` }),
          h('span', { class: 'cell-sub', text: humanDayLabel(value.slice(0, 10)) }),
        );
      },
      text: (row) => String(row.hearing.scheduled_at),
    },
    {
      key: 'case',
      label: 'القضية',
      width: 220,
      cardRole: 'title',
      render: (row) =>
        h(
          'a',
          { class: 'cell-link', href: `#/cases/${String(row.hearing.case_id)}`, text: `قضية ${row.caseNumber} / ${row.caseYear}` },
        ),
      text: (row) => `قضية ${row.caseNumber} / ${row.caseYear}`,
    },
    {
      key: 'court',
      label: 'المحكمة',
      width: 220,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.courtName }),
      text: (row) => row.courtName,
    },
    {
      key: 'client',
      label: 'الموكل',
      width: 170,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.clientNames.length > 0 ? row.clientNames.join('، ') : '—' }),
      text: (row) => row.clientNames.join('، '),
    },
    {
      key: 'purpose',
      label: 'الغرض',
      width: 140,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'badge badge--quiet', text: row.purposeName }),
      text: (row) => row.purposeName,
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      cardRole: 'meta',
      render: (row) => h('span', { class: `badge badge--${statusTone(row.statusCode)}`, text: row.statusName }),
      text: (row) => row.statusName,
    },
    {
      key: 'outcome',
      label: 'النتيجة',
      width: 220,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'text-2 truncate', text: String(row.hearing.outcome_summary ?? '—') }),
      text: (row) => String(row.hearing.outcome_summary ?? ''),
    },
  ];

  const header = pageHeader({
    title: 'الجلسات',
    subtitle: 'جدول الجلسات مرتبًا بحسب الموعد. سجّل النتيجة لتحديث حالة القضية وسجل النشاط.',
    count: 0,
    actions: [
      h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => navigate('/hearings?period=today') } }, icon('today', 17), h('span', { text: 'جلسات اليوم' })),
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openHearingCreate(context, () => table.reload()) } }, icon('plus', 17), h('span', { text: 'جلسة جديدة' })),
    ],
  });
  const countNode = header.querySelector('.page-title__count');

  const focusId = context.query.get('focus');
  const table = dataTable<HearingRow>(
    {
      id: 'hearings',
      title: 'الجلسات',
      columns,
      load: (request) =>
        services.agenda.listHearings({
          ...request,
          filters: { period, ...request.filters },
        }),
      rowKey: (row) => String(row.hearing.id),
      rowHref: (row) => `#/hearings?focus=${String(row.hearing.id)}&period=${period}`,
      searchPlaceholder: 'ابحث برقم القضية أو المحكمة أو اسم الموكل…',
      defaultSort: { key: 'when', dir: 'asc' },
      defaultPageSize: 25,
      filters: [
        {
          key: 'status',
          label: 'كل الحالات',
          options: lookups.items('hearing_status').map((item) => ({ value: item.code, label: item.nameAr })),
        },
      ],
      focusRowId: focusId,
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('a', { class: 'icon-btn icon-btn--sm', href: `#/cases/${String(row.hearing.case_id)}`, title: 'ملف القضية', attrs: { 'aria-label': 'ملف القضية' } }, icon('scale', 16)),
        h('button', {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          title: 'تسجيل النتيجة',
          attrs: { 'aria-label': 'تسجيل نتيجة الجلسة' },
          on: { click: () => openHearingOutcome(context, row, () => void table.reload()) },
        }, icon('edit', 16)),
      ],
      emptyTitle: 'لا جلسات في هذه الفترة',
      emptyText: 'غيّر الفترة أو أضف جلسة لقضية قائمة.',
      emptyIcon: 'gavel',
      emptyActions: [
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'جلسة جديدة', on: { click: () => openHearingCreate(context, () => table.reload()) } }),
        h('a', { class: 'btn btn--outline btn--sm', href: '#/hearings?period=all', text: 'كل الفترات' }),
      ],
    },
    workspace.preferences,
  );

  const page = h('div', { class: 'page' }, header);
  page.appendChild(periodChips(period));
  page.appendChild(table.root);

  if (context.query.get('new') === '1') {
    window.setTimeout(() => openHearingCreate(context, () => table.reload()), 80);
  }
  return page;
}

function periodChips(current: string): HTMLElement {
  const periods: Array<{ value: string; label: string }> = [
    { value: 'today', label: 'اليوم' },
    { value: 'week', label: 'خلال أسبوع' },
    { value: 'month', label: 'خلال شهر' },
    { value: 'upcoming', label: 'القادمة' },
    { value: 'past', label: 'المنقضية' },
    { value: 'all', label: 'الكل' },
  ];
  return h(
    'div',
    { class: 'row-wrap', style: 'gap:6px', attrs: { role: 'group', 'aria-label': 'الفترة الزمنية' } },
    ...periods.map((period) =>
      h('a', {
        class: `chip chip--button${period.value === current ? ' chip--active' : ''}`,
        href: `#/hearings${period.value === 'upcoming' ? '' : `?period=${period.value}`}`,
        text: period.label,
        ...(period.value === current ? { attrs: { 'aria-current': 'true' } } : {}),
      }),
    ),
  );
}

async function openHearingCreate(context: PageArgs, onSaved: () => void): Promise<void> {
  const lookups = context.workspace.lookups;
  const casePicker = entityPicker({
    name: 'caseId',
    label: 'القضية',
    required: true,
    placeholder: 'ابحث برقم القضية أو المحكمة أو اسم الموكل…',
    help: 'الجلسة تُسجَّل على قضية قائمة. لإنشاء قضية جديدة انتقل إلى قسم القضايا.',
    search: (query) => context.services.cases.searchOptions(query, 10),
  });
  const date = dateField({ label: 'تاريخ الجلسة', name: 'date', required: true, value: isoDateToday() });
  const time = textField({ label: 'الوقت', name: 'time', required: true, value: '10:00', dir: 'ltr', inputmode: 'numeric', maxlength: 5, help: 'بصيغة 24 ساعة، مثال 09:30 أو 14:15.' });
  const purpose = selectField({
    label: 'غرض الجلسة',
    name: 'purposeCode',
    options: lookups.items('hearing_purpose').map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'first_hearing',
  });

  openFormDialog({
    title: 'جلسة جديدة',
    description: 'تظهر الجلسة في جدول الجلسات وفي ملف القضية، وتُستخدم في لوحة مكتب اليوم.',
    iconName: 'gavel',
    size: 'md',
    content: h('div', { class: 'stack', style: 'gap:16px' }, casePicker.root, h('div', { class: 'form-grid' }, date, time), purpose),
    submitLabel: 'حفظ الجلسة',
    successMessage: 'تمت إضافة الجلسة',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      const caseId = casePicker.getValue();
      if (!caseId) {
        casePicker.input.setAttribute('aria-invalid', 'true');
        casePicker.input.focus();
        throw new Error('اختر القضية أولًا.');
      }
      if (!values.date) { setFieldError(form, 'date', 'تاريخ الجلسة مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(values.time ?? '');
      if (!timeMatch) { setFieldError(form, 'time', 'أدخل الوقت بصيغة 24 ساعة.'); throw new Error('الوقت غير صحيح.'); }
      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      if (hours > 23 || minutes > 59) { setFieldError(form, 'time', 'الوقت خارج النطاق.'); throw new Error('الوقت غير صحيح.'); }
      const scheduledAt = new Date(`${values.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
      if (Number.isNaN(scheduledAt.getTime())) {
        setFieldError(form, 'date', 'التاريخ غير صحيح.');
        throw new Error('التاريخ غير صحيح.');
      }
      await context.services.agenda.schedule({
        caseId,
        scheduledAt: scheduledAt.toISOString(),
        ...(values.purposeCode ? { purposeCode: values.purposeCode } : {}),
      });
    },
  });
}

export function openPostponeDialog(context: PageArgs, row: HearingRow, onSaved?: () => void): void {
  const date = dateField({ label: 'موعد الجلسة الجديدة', name: 'date', required: true });
  const time = textField({ label: 'الوقت', name: 'time', required: true, value: '10:00', dir: 'ltr', maxlength: 5 });
  openFormDialog({
    title: 'تأجيل الجلسة',
    description: `${row.caseLabel} — ${row.courtName}`,
    iconName: 'calendar-clock',
    content: h('div', { class: 'stack', style: 'gap:16px' }, date, time),
    submitLabel: 'تأجيل الجلسة',
    successMessage: 'تم تسجيل التأجيل وإنشاء الجلسة الجديدة',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(values.time ?? '');
      if (!values.date || !timeMatch) throw new Error('أدخل التاريخ والوقت.');
      const [hoursText, minutesText] = [timeMatch[1], timeMatch[2]];
      const next = new Date(`${values.date}T${String(hoursText).padStart(2, '0')}:${String(minutesText).padStart(2, '0')}:00`);
      try {
        await context.services.agenda.recordHearing(String(row.hearing.id), { statusCode: 'postponed' });
        await context.services.agenda.scheduleNext(String(row.hearing.id), next.toISOString());
        toastSuccess('تم التأجيل');
      } catch (error) {
        const ui = toUiError(error);
        throw new Error(ui.message);
      }
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
