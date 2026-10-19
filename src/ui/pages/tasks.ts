import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import {
  formatDate,
  formatNumber,
  formatRelative,
  isoDateToday,
} from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { definitionList, notice, pageHeader } from '../components/page.ts';
import {
  dateField,
  selectField,
  textField,
  textareaField,
} from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { confirmDialog, openDialog } from '../components/dialog.ts';
import { toastError, toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import type { PageArgs } from '../app/context.ts';
import type { TaskRow } from '../services/tasks.ts';
import {
  lookupBadge,
  openFormDialog,
  setFieldError,
  statusTone,
} from './shared.ts';

export async function renderTasks(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;

  const columns: Column<TaskRow>[] = [
    {
      key: 'done',
      label: 'إنجاز',
      width: 56,
      defaultPinned: true,
      align: 'start',
      render: (row) => {
        const done = row.statusCode === 'completed';
        return h(
          'button',
          {
            class: 'icon-btn icon-btn--sm',
            type: 'button',
            title: done ? 'إعادة فتح المهمة' : 'إنجاز المهمة',
            attrs: {
              'aria-label': done
                ? `إعادة فتح ${String(row.task.title)}`
                : `إنجاز ${String(row.task.title)}`,
              'aria-pressed': String(done),
            },
            style: done ? 'color:var(--c-success)' : '',
            on: {
              click: async (event) => {
                event.stopPropagation();
                const button = event.currentTarget as HTMLButtonElement;
                button.disabled = true;
                try {
                  await services.tasks.changeStatus(
                    String(row.task.id),
                    done ? 'open' : 'completed',
                  );
                  toastSuccess(done ? 'أُعيد فتح المهمة' : 'تم إنجاز المهمة');
                  await table.reload();
                } catch (error) {
                  const ui = toUiError(error);
                  toastError(ui.message, ui.detail);
                  button.disabled = false;
                }
              },
            },
          },
          icon(done ? 'check-square' : 'check', 17),
        );
      },
      text: () => '',
    },
    {
      key: 'title',
      label: 'المهمة',
      width: 320,
      sortable: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('span', {
            class: `cell-title${row.statusCode === 'completed' ? ' text-3' : ''}`,
            style:
              row.statusCode === 'completed'
                ? 'text-decoration:line-through'
                : '',
            text: String(row.task.title),
          }),
          h('span', {
            class: 'cell-sub',
            text:
              [row.clientName, row.fileLabel, row.caseLabel]
                .filter(Boolean)
                .join(' · ') || String(row.task.description ?? ''),
          }),
        ),
      text: (row) => String(row.task.title),
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 120,
      cardRole: 'meta',
      render: (row) =>
        lookupBadge(lookups, 'task_status', String(row.task.status_id ?? '')),
      text: (row) => row.statusName,
    },
    {
      key: 'priority',
      label: 'الأولوية',
      width: 110,
      cardRole: 'meta',
      render: (row) =>
        h('span', {
          class: `badge badge--${priorityTone(row.priorityCode)}`,
          text: row.priorityName,
        }),
      text: (row) => row.priorityName,
    },
    {
      key: 'type',
      label: 'النوع',
      width: 120,
      defaultHidden: true,
      render: (row) => h('span', { class: 'text-2', text: row.typeName }),
      text: (row) => row.typeName,
    },
    {
      key: 'due',
      label: 'الاستحقاق',
      width: 150,
      sortable: true,
      cardRole: 'detail',
      render: (row) => {
        if (!row.task.due_at)
          return h('span', { class: 'text-3', text: 'بلا موعد' });
        const overdue =
          String(row.task.due_at) < new Date().toISOString() &&
          row.statusCode !== 'completed';
        return h('span', {
          class: `num ${overdue ? 'text-danger strong' : 'text-2'}`,
          text: formatDate(String(row.task.due_at), 'short'),
        });
      },
      text: (row) => String(row.task.due_at ?? ''),
    },
    {
      key: 'file',
      label: 'الملف / القضية',
      width: 180,
      cardRole: 'detail',
      render: (row) =>
        row.task.file_id
          ? h('a', {
              class: 'cell-link',
              href: `#/files/${String(row.task.file_id)}`,
              text: row.fileLabel ?? 'ملف',
            })
          : row.task.case_id
            ? h('a', {
                class: 'cell-link',
                href: `#/cases/${String(row.task.case_id)}`,
                text: row.caseLabel ?? 'قضية',
              })
            : h('span', { class: 'text-3', text: '—' }),
      text: (row) => row.fileLabel ?? row.caseLabel ?? '',
    },
  ];

  const presetCase = context.query.get('case');
  const defaultFilter = context.query.get('status') === 'open' ? 'open' : '';
  const header = pageHeader({
    title: 'المهام والأعمال',
    subtitle:
      'كل تكليف إداري أو قانوني، مربوط بالملف والقضية والموكل، مع موعد استحقاق وحالة.',
    count: 0,
    actions: [
      h(
        'button',
        {
          class: 'btn btn--primary',
          type: 'button',
          on: { click: () => openTaskDialog(context) },
        },
        icon('plus', 17),
        h('span', { text: 'مهمة جديدة' }),
      ),
    ],
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<TaskRow>(
    {
      id: 'tasks',
      title: 'المهام',
      columns,
      load: (request) =>
        services.tasks.list({
          ...request,
          filters: {
            ...request.filters,
            ...(defaultFilter &&
            !request.filters.bucket &&
            !request.filters.status
              ? { bucket: 'open' }
              : {}),
          },
        }),
      rowKey: (row) => String(row.task.id),
      searchPlaceholder: 'ابحث في عنوان المهمة أو وصفها…',
      defaultSort: { key: 'due', dir: 'asc' },
      filters: [
        {
          key: 'bucket',
          label: 'كل المواعيد',
          options: [
            { value: 'overdue', label: 'متأخرة' },
            { value: 'today', label: 'مستحقة اليوم' },
            { value: 'week', label: 'خلال أسبوع' },
            { value: 'open', label: 'مفتوحة' },
            { value: 'no_due', label: 'بلا موعد' },
          ],
        },
        {
          key: 'status',
          label: 'كل الحالات',
          options: lookups
            .items('task_status')
            .map((item) => ({ value: item.code, label: item.nameAr })),
        },
        {
          key: 'priority',
          label: 'كل الأولويات',
          options: lookups
            .items('priority')
            .map((item) => ({ value: item.code, label: item.nameAr })),
        },
        {
          key: 'type',
          label: 'كل الأنواع',
          options: lookups
            .items('task_type')
            .map((item) => ({ value: item.code, label: item.nameAr })),
        },
      ],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h(
          'button',
          {
            class: 'icon-btn icon-btn--sm',
            type: 'button',
            title: 'تفاصيل المهمة',
            attrs: { 'aria-label': 'تفاصيل المهمة' },
            on: {
              click: () => openTaskDetail(context, row, () => table.reload()),
            },
          },
          icon('eye', 16),
        ),
        h(
          'button',
          {
            class: 'icon-btn icon-btn--sm',
            type: 'button',
            title: 'حذف',
            attrs: { 'aria-label': 'حذف المهمة' },
            on: {
              click: () =>
                confirmDialog({
                  title: 'حذف المهمة',
                  message: `سيتم حذف «${String(row.task.title)}» حذفًا منطقيًا ويمكن استعادتها من الأرشيف.`,
                  confirmLabel: 'حذف',
                  danger: true,
                  onConfirm: async () => {
                    await services.tasks.remove(String(row.task.id));
                    await table.reload();
                  },
                }),
            },
          },
          icon('trash', 16),
        ),
      ],
      bulkActions: (rows, clear) => [
        h(
          'button',
          {
            class: 'btn btn--secondary btn--sm',
            type: 'button',
            on: {
              click: async () => {
                for (const row of rows)
                  await services.tasks.changeStatus(
                    String(row.task.id),
                    'completed',
                  );
                toastSuccess(`تم إنجاز ${formatNumber(rows.length)} مهمة`);
                clear();
                await table.reload();
              },
            },
          },
          icon('check', 15),
          h('span', { text: 'إنجاز المحدد' }),
        ),
        h(
          'button',
          {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            on: {
              click: async () => {
                for (const row of rows)
                  await services.tasks.changeStatus(
                    String(row.task.id),
                    'cancelled',
                  );
                toastSuccess('تم إلغاء المهام المحددة');
                clear();
                await table.reload();
              },
            },
          },
          h('span', { text: 'إلغاء المحدد' }),
        ),
      ],
      emptyTitle: 'لا مهام مطابقة',
      emptyText:
        'أنشئ مهمة جديدة، أو غيّر عامل التصفية. المهام مرتبطة بالملفات والقضايا عند الحاجة.',
      emptyIcon: 'tasks',
      emptyActions: [
        h('button', {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          text: 'مهمة جديدة',
          on: { click: () => openTaskDialog(context) },
        }),
      ],
    },
    workspace.preferences,
  );

  const page = h('div', { class: 'page' }, header);
  if (presetCase) {
    page.appendChild(
      notice(
        'neutral',
        `تعرض هذه القائمة كل المهام المرتبطة بالقضية المحددة.`,
        { iconName: 'scale' },
      ),
    );
  }
  page.appendChild(table.root);

  if (context.query.get('new') === '1') {
    window.setTimeout(() => openTaskDialog(context, () => table.reload()), 80);
  }
  return page;
}

function priorityTone(code: string): string {
  if (code === 'urgent' || code === 'critical') return 'danger';
  if (code === 'high') return 'warning';
  if (code === 'low') return 'quiet';
  return 'info';
}

export async function openTaskDialog(
  context: PageArgs,
  onSaved?: () => void,
  preset: { stageId?: string; fileId?: string; caseId?: string } = {},
): Promise<void> {
  const { services, workspace } = context;
  const lookups = workspace.lookups;
  const presetCase = preset.caseId ?? context.query.get('case');
  const presetFile = preset.fileId
    ? await workspace.db.get('case_file', preset.fileId)
    : null;

  const title = textField({
    label: 'عنوان المهمة',
    name: 'title',
    required: true,
    maxlength: 200,
    placeholder: 'مثال: تجهيز حافظة مستندات الجلسة',
  });
  const type = selectField({
    label: 'نوع المهمة',
    name: 'typeCode',
    required: true,
    options: lookups
      .items('task_type')
      .map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'administrative',
  });
  const priority = selectField({
    label: 'الأولوية',
    name: 'priorityCode',
    options: lookups
      .items('priority')
      .map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'normal',
  });
  const due = dateField({
    label: 'تاريخ الاستحقاق',
    name: 'dueAt',
    value: isoDateToday(),
  });
  const description = textareaField({
    label: 'تفاصيل المهمة',
    name: 'description',
    rows: 3,
    maxlength: 2000,
  });
  const filePicker = entityPicker({
    name: 'fileId',
    label: 'الملف (اختياري)',
    ...(presetFile
      ? {
          initial: {
            value: String(presetFile.id),
            label: String(presetFile.title),
          },
        }
      : {}),
    placeholder: 'ابحث برقم الملف أو عنوانه…',
    search: (query) => services.files.searchOptions(query, 8),
  });
  const casePicker = presetCase
    ? null
    : entityPicker({
        name: 'caseId',
        label: 'القضية (اختياري)',
        placeholder: 'ابحث برقم القضية أو المحكمة…',
        search: (query) => services.cases.searchOptions(query, 8),
      });

  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    title,
    h('div', { class: 'form-grid' }, type, priority),
    due,
    description,
    h('div', { class: 'form-grid' }, filePicker.root, casePicker?.root ?? null),
  );

  openFormDialog({
    title: 'مهمة جديدة',
    description: preset.stageId
      ? 'هذه المهمة مرتبطة بالمرحلة المختارة؛ موعدها متابعة مكتب وليست مهلة قانونية.'
      : 'المهمة بلا موعد استحقاق تظهر في قائمة «بلا موعد» ولا تُحتسب متأخرة.',
    iconName: 'tasks',
    size: 'lg',
    content,
    submitLabel: 'إنشاء المهمة',
    successMessage: 'تم إنشاء المهمة وحفظها',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.title) {
        setFieldError(form, 'title', 'عنوان المهمة مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      await services.tasks.create({
        title: values.title,
        ...(preset.stageId ? { stageId: preset.stageId } : {}),
        ...(values.typeCode ? { taskTypeCode: values.typeCode } : {}),
        ...(values.priorityCode ? { priorityCode: values.priorityCode } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values.dueAt
          ? { dueAt: new Date(`${values.dueAt}T09:00:00`).toISOString() }
          : {}),
        ...(filePicker.getValue() ? { fileId: filePicker.getValue() } : {}),
        ...(presetCase
          ? { caseId: presetCase }
          : casePicker?.getValue()
            ? { caseId: casePicker.getValue() }
            : {}),
      });
    },
  });
}

function openTaskDetail(
  context: PageArgs,
  row: TaskRow,
  refresh: () => void,
): void {
  const lookups = context.workspace.lookups;
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    definitionList([
      { label: 'العنوان', value: String(row.task.title) },
      { label: 'الوصف', value: String(row.task.description ?? '—') },
      {
        label: 'الحالة',
        value: lookupBadge(
          lookups,
          'task_status',
          String(row.task.status_id ?? ''),
        ),
      },
      { label: 'الأولوية', value: row.priorityName },
      { label: 'النوع', value: row.typeName },
      {
        label: 'الاستحقاق',
        value: row.task.due_at
          ? `${formatDate(String(row.task.due_at), 'medium')} (${formatRelative(String(row.task.due_at))})`
          : 'بلا موعد',
      },
      { label: 'الموكل', value: row.clientName ?? '—' },
      {
        label: 'الملف',
        value: row.task.file_id
          ? h('a', {
              class: 'cell-link',
              href: `#/files/${String(row.task.file_id)}`,
              text: row.fileLabel ?? 'ملف',
            })
          : '—',
      },
      {
        label: 'القضية',
        value: row.task.case_id
          ? h('a', {
              class: 'cell-link',
              href: `#/cases/${String(row.task.case_id)}`,
              text: row.caseLabel ?? 'قضية',
            })
          : '—',
      },
    ]),
    h(
      'div',
      { class: 'notice notice--neutral' },
      icon('info', 17),
      h('span', {
        text: 'تغيير الحالة يُسجَّل في تاريخ المهمة وسجل النشاط. الإنجاز لا يحذف المهمة.',
      }),
    ),
  );

  const button = (
    label: string,
    statusCode: string,
    kind = 'btn--outline',
  ): HTMLButtonElement =>
    h('button', {
      class: `btn ${kind} btn--sm`,
      type: 'button',
      text: label,
      on: {
        click: async () => {
          try {
            await context.services.tasks.changeStatus(
              String(row.task.id),
              statusCode,
            );
            toastSuccess(
              `تم تحديث حالة المهمة إلى «${lookups.item('task_status', statusCode)?.nameAr ?? statusCode}»`,
            );
            handle.close();
            refresh();
          } catch (error) {
            const ui = toUiError(error);
            toastError(ui.message, ui.detail);
          }
        },
      },
    });

  const handle = openDialog({
    title: 'تفاصيل المهمة',
    description: row.statusName,
    iconName: 'tasks',
    size: 'md',
    content,
    footer: h(
      'div',
      { class: 'dialog__actions' },
      statusTone(row.statusCode) === 'success'
        ? button('إعادة فتح', 'open')
        : button('بدء التنفيذ', 'in_progress'),
      button('تعليق', 'waiting'),
      button('إلغاء المهمة', 'cancelled', 'btn--danger-ghost'),
      button('إنجاز', 'completed', 'btn--primary'),
    ),
  });
}

function readForm(form: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const control of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea')) {
    if (control.name) values[control.name] = control.value.trim();
  }
  return values;
}
