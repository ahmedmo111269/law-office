import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber, formatTime, humanDayLabel, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { pageHeader } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { toastError, toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import type { PageArgs } from '../app/context.ts';
import type { AppointmentRow } from '../services/agenda.ts';
import { openFormDialog, setFieldError, statusTone } from './shared.ts';

export async function renderAppointments(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;
  const period = context.query.get('period') ?? 'upcoming';

  const columns: Column<AppointmentRow>[] = [
    {
      key: 'when',
      label: 'الموعد',
      width: 180,
      sortable: true,
      defaultPinned: true,
      cardRole: 'meta',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('span', { class: 'cell-title num', text: `${formatDate(String(row.appointment.start_at), 'short')} — ${formatTime(String(row.appointment.start_at))}` }),
          h('span', { class: 'cell-sub', text: row.appointment.end_at ? `حتى ${formatTime(String(row.appointment.end_at))}` : humanDayLabel(String(row.appointment.start_at).slice(0, 10)) }),
        ),
      text: (row) => String(row.appointment.start_at),
    },
    {
      key: 'title',
      label: 'الموعد',
      width: 280,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('span', { class: 'cell-title', text: String(row.appointment.title) }),
          h('span', { class: 'cell-sub', text: [row.kindName, row.partyName, row.appointment.location ? String(row.appointment.location) : null].filter(Boolean).join(' · ') }),
        ),
      text: (row) => String(row.appointment.title),
    },
    {
      key: 'party',
      label: 'الطرف',
      width: 180,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.partyName ?? '—' }),
      text: (row) => row.partyName ?? '',
    },
    {
      key: 'file',
      label: 'الملف',
      width: 140,
      cardRole: 'detail',
      render: (row) =>
        row.appointment.file_id
          ? h('a', { class: 'cell-link mono', href: `#/files/${String(row.appointment.file_id)}`, text: row.fileLabel ?? 'ملف' })
          : h('span', { class: 'text-3', text: '—' }),
      text: (row) => row.fileLabel ?? '',
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      cardRole: 'meta',
      render: (row) => h('span', { class: `badge badge--${statusTone(row.statusCode)}`, text: row.statusName }),
      text: (row) => row.statusName,
    },
  ];

  const header = pageHeader({
    title: 'المواعيد',
    subtitle: 'مقابلات العملاء والاتصالات والزيارات. تُحفظ بتوقيت القاهرة وتظهر في لوحة اليوم.',
    count: 0,
    actions: [
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openAppointmentForm(context, () => table.reload()) } },
        icon('plus', 17), h('span', { text: 'موعد جديد' })),
    ],
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<AppointmentRow>(
    {
      id: 'appointments',
      title: 'المواعيد',
      columns,
      load: (request) => services.agenda.listAppointments({ ...request, filters: { period, ...request.filters } }),
      rowKey: (row) => String(row.appointment.id),
      searchPlaceholder: 'ابحث في عنوان الموعد…',
      defaultSort: { key: 'when', dir: period === 'past' ? 'desc' : 'asc' },
      filters: [{ key: 'status', label: 'كل الحالات', options: lookups.items('appointment_status').map((item) => ({ value: item.code, label: item.nameAr })) }],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('button', {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          title: 'إتمام الموعد',
          attrs: { 'aria-label': 'تسجيل إتمام الموعد' },
          on: {
            click: async () => {
              try {
                await services.agenda.setAppointmentStatus(String(row.appointment.id), 'completed');
                toastSuccess('تم تسجيل إتمام الموعد');
                await table.reload();
              } catch (error) {
                const ui = toUiError(error);
                toastError(ui.message, ui.detail);
              }
            },
          },
        }, icon('check', 16)),
        h('button', {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          title: 'إلغاء',
          attrs: { 'aria-label': 'إلغاء الموعد' },
          on: {
            click: async () => {
              try {
                await services.agenda.setAppointmentStatus(String(row.appointment.id), 'cancelled');
                toastSuccess('تم إلغاء الموعد');
                await table.reload();
              } catch (error) {
                const ui = toUiError(error);
                toastError(ui.message, ui.detail);
              }
            },
          },
        }, icon('x', 16)),
      ],
      emptyTitle: 'لا مواعيد في هذه الفترة',
      emptyText: 'أضف موعد مقابلة أو اتصال، أو غيّر الفترة.',
      emptyIcon: 'calendar-clock',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'موعد جديد', on: { click: () => openAppointmentForm(context, () => table.reload()) } })],
    },
    workspace.preferences,
  );

  const page = h('div', { class: 'page' }, header);
  page.appendChild(
    h(
      'div',
      { class: 'row-wrap', style: 'gap:6px', attrs: { role: 'group', 'aria-label': 'الفترة' } },
      ...[
        { value: 'today', label: 'اليوم' },
        { value: 'upcoming', label: 'القادمة' },
        { value: 'past', label: 'المنقضية' },
        { value: 'all', label: 'الكل' },
      ].map((option) =>
        h('a', {
          class: `chip chip--button${option.value === period ? ' chip--active' : ''}`,
          href: `#/appointments${option.value === 'upcoming' ? '' : `?period=${option.value}`}`,
          text: option.label,
        }),
      ),
    ),
  );
  page.appendChild(table.root);
  if (context.query.get('new') === '1') {
    window.setTimeout(() => openAppointmentForm(context, () => table.reload()), 80);
  }
  return page;
}

function openAppointmentForm(context: PageArgs, onSaved: () => void): void {
  const lookups = context.workspace.lookups;
  const title = textField({ label: 'عنوان الموعد', name: 'title', required: true, maxlength: 200, placeholder: 'مثال: مقابلة موكل جديد' });
  const kind = selectField({ label: 'نوع الموعد', name: 'kindCode', options: lookups.items('appointment_kind').map((item) => ({ value: item.code, label: item.nameAr })), value: 'meeting' });
  const date = dateField({ label: 'التاريخ', name: 'date', required: true, value: isoDateToday() });
  const startTime = textField({ label: 'وقت البداية', name: 'startTime', required: true, value: '10:00', dir: 'ltr', maxlength: 5 });
  const duration = selectField({
    label: 'المدة',
    name: 'duration',
    options: [
      { value: '15', label: '15 دقيقة' },
      { value: '30', label: '30 دقيقة' },
      { value: '45', label: '45 دقيقة' },
      { value: '60', label: 'ساعة' },
      { value: '90', label: 'ساعة ونصف' },
      { value: '120', label: 'ساعتان' },
    ],
    value: String(context.workspace.officeSettings().defaultAppointmentMinutes),
  });
  const location = textField({ label: 'المكان', name: 'location', maxlength: 200, placeholder: 'المكتب / مكتب الموكل / اتصال هاتفي' });
  const partyPicker = entityPicker({
    name: 'partyId',
    label: 'الطرف (اختياري)',
    placeholder: 'ابحث بالاسم…',
    search: (query) => context.services.clients.searchOptions(query, false, 8),
  });
  const filePicker = entityPicker({
    name: 'fileId',
    label: 'الملف (اختياري)',
    placeholder: 'ابحث برقم الملف…',
    search: (query) => context.services.files.searchOptions(query, 8),
  });
  const notes = textareaField({ label: 'ملاحظات', name: 'notes', rows: 2, maxlength: 1000 });

  openFormDialog({
    title: 'موعد جديد',
    description: 'الموعد يظهر في لوحة مكتب اليوم عند حلول يومه.',
    iconName: 'calendar-clock',
    size: 'lg',
    content: h(
      'div',
      { class: 'stack', style: 'gap:16px' },
      title,
      h('div', { class: 'form-grid' }, kind, location),
      h('div', { class: 'form-grid' }, date, startTime),
      duration,
      h('div', { class: 'form-grid' }, partyPicker.root, filePicker.root),
      notes,
    ),
    submitLabel: 'حفظ الموعد',
    successMessage: 'تم حفظ الموعد',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.title) { setFieldError(form, 'title', 'عنوان الموعد مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(values.startTime ?? '');
      if (!values.date || !timeMatch) { setFieldError(form, 'startTime', 'أدخل التاريخ والوقت.'); throw new Error('الوقت غير صحيح.'); }
      const start = new Date(`${values.date}T${String(timeMatch[1]).padStart(2, '0')}:${String(timeMatch[2]).padStart(2, '0')}:00`);
      const minutes = Number(values.duration ?? 30);
      const end = new Date(start.getTime() + minutes * 60_000);
      await context.services.agenda.createAppointment({
        title: values.title,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        ...(values.kindCode ? { kindCode: values.kindCode } : {}),
        ...(values.location ? { location: values.location } : {}),
        ...(partyPicker.getValue() ? { partyId: partyPicker.getValue() } : {}),
        ...(filePicker.getValue() ? { fileId: filePicker.getValue() } : {}),
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

