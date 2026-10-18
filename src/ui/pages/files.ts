import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber, formatRelative } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { pageHeader, notice } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { openFormDialog } from './shared.ts';
import { confirmDialog } from '../components/dialog.ts';
import { navigate } from '../app/router.ts';
import type { PageArgs } from '../app/context.ts';
import type { FileListRow } from '../services/files.ts';
import { lookupBadge, lookupId, setFieldError } from './shared.ts';

export async function renderFiles(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;

  const columns: Column<FileListRow>[] = [
    {
      key: 'file_number',
      label: 'رقم الملف',
      width: 150,
      sortable: true,
      defaultPinned: true,
      cardRole: 'meta',
      numeric: true,
      render: (row) => h('span', { class: 'mono', dir: 'ltr', text: String(row.file.file_number) }),
      text: (row) => String(row.file.file_number),
    },
    {
      key: 'title',
      label: 'عنوان الملف',
      width: 280,
      sortable: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('a', { class: 'cell-title cell-link', href: `#/files/${String(row.file.id)}`, text: String(row.file.title) }),
          row.clientNames.length > 0
            ? h('span', { class: 'cell-sub', text: row.clientNames.join('، ') })
            : h('span', { class: 'cell-sub', text: 'بلا أطراف مسجّلة' }),
        ),
      text: (row) => String(row.file.title),
    },
    {
      key: 'clients',
      label: 'العملاء',
      width: 200,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.clientNames.length > 0 ? row.clientNames.join('، ') : '—' }),
      text: (row) => row.clientNames.join('، '),
    },
    {
      key: 'practice',
      label: 'فرع القانون',
      width: 150,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'text-2', text: row.practiceName }),
      text: (row) => row.practiceName,
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      cardRole: 'meta',
      render: (row) => lookupBadge(lookups, 'file_status', String(row.file.status_id ?? '')),
      text: (row) => row.statusName,
    },
    {
      key: 'cases',
      label: 'القضايا',
      width: 90,
      align: 'end',
      numeric: true,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'num', text: formatNumber(row.casesCount) }),
      text: (row) => String(row.casesCount),
    },
    {
      key: 'opened_on',
      label: 'تاريخ الفتح',
      width: 140,
      sortable: true,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'num', text: formatDate(String(row.file.opened_on), 'short') }),
      text: (row) => String(row.file.opened_on ?? ''),
    },
    {
      key: 'updated_at',
      label: 'آخر تحديث',
      width: 150,
      defaultHidden: true,
      render: (row) => h('span', { class: 'text-3', text: formatRelative(String(row.file.updated_at)) }),
      text: (row) => String(row.file.updated_at ?? ''),
    },
  ];

  for (const column of columns) {
    if (column.key === 'file_number') column.defaultPinned = true;
  }

  const header = pageHeader({
    title: 'الملفات',
    subtitle: 'ملف العمل يجمع الأطراف والقضايا والجلسات والمستندات والمالية في مكان واحد.',
    count: 0,
    actions: [
      h('button', {
        class: 'btn btn--outline',
        type: 'button',
        on: { click: () => navigate('/clients?new=1') },
      }, icon('users', 17), h('span', { text: 'عميل جديد' })),
      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        on: { click: () => openFileForm(context) },
      }, icon('plus', 17), h('span', { text: 'ملف جديد' })),
    ],
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<FileListRow>(
    {
      id: 'files',
      title: 'الملفات',
      columns,
      load: (request) => services.files.list(request),
      rowKey: (row) => String(row.file.id),
      rowHref: (row) => `#/files/${String(row.file.id)}`,
      searchPlaceholder: 'ابحث برقم الملف أو العنوان أو اسم العميل…',
      defaultSort: { key: 'opened_on', dir: 'desc' },
      filters: [
        {
          key: 'status',
          label: 'كل الحالات',
          options: lookups.items('file_status').map((item) => ({ value: item.code, label: item.nameAr })),
        },
        {
          key: 'practice',
          label: 'كل فروع القانون',
          options: lookups.items('practice_area').map((item) => ({ value: item.code, label: item.nameAr })),
        },
      ],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('a', {
          class: 'icon-btn icon-btn--sm',
          href: `#/files/${String(row.file.id)}`,
          title: 'فتح الملف',
          attrs: { 'aria-label': `فتح ملف ${String(row.file.title)}` },
        }, icon('external', 16)),
        h('button', {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          title: 'تعديل',
          attrs: { 'aria-label': `تعديل ملف ${String(row.file.title)}` },
          on: { click: () => openFileForm(context, row, () => table.reload()) },
        }, icon('edit', 16)),
        h('button', {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          title: 'أرشفة',
          attrs: { 'aria-label': `أرشفة ملف ${String(row.file.title)}` },
          on: {
            click: () => {
              confirmDialog({
                title: 'أرشفة الملف',
                message: `سيُنقل الملف «${String(row.file.title)}» إلى الأرشيف، ويمكن استعادته لاحقًا.`,
                confirmLabel: 'أرشفة',
                danger: true,
                onConfirm: async () => {
                  await services.files.update(String(row.file.id), {
                    archived_at: new Date().toISOString(),
                    status_id: lookupId(lookups, 'file_status', 'archived'),
                  });
                  await table.reload();
                },
              });
            },
          },
        }, icon('archive', 16)),
      ],
      bulkActions: (rows, clear) => [
        h('button', {
          class: 'btn btn--danger-ghost btn--sm',
          type: 'button',
          text: `أرشفة (${formatNumber(rows.length)})`,
          on: {
            click: () => {
              confirmDialog({
                title: 'أرشفة الملفات المحددة',
                message: `سيتم أرشفة ${formatNumber(rows.length)} ملفًا. يمكن استعادتها من الأرشيف لاحقًا.`,
                confirmLabel: 'أرشفة',
                danger: true,
                onConfirm: async () => {
                  for (const row of rows) {
                    await services.files.update(String(row.file.id), {
                      archived_at: new Date().toISOString(),
                      status_id: lookupId(lookups, 'file_status', 'archived'),
                    });
                  }
                  clear();
                  await table.reload();
                },
              });
            },
          },
        }, icon('archive', 15)),
      ],
      emptyTitle: 'لا توجد ملفات مطابقة',
      emptyText: 'أنشئ ملفًا جديدًا أو عدّل عوامل التصفية. كل ملف يحصل على رقم تسلسلي تلقائي.',
      emptyIcon: 'folder-open',
      emptyActions: [
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'ملف جديد', on: { click: () => openFileForm(context) } }),
      ],
    },
    workspace.preferences,
  );

  const page = h('div', { class: 'page' }, header);
  if (!workspace.officeConfigured()) {
    page.appendChild(
      notice('warning', 'بيانات المكتب غير مكتملة، وقد لا تظهر في المستندات المطبوعة. يمكنك استكمالها من الإعدادات.', {
        title: 'أكمل بيانات المكتب',
        iconName: 'building',
      }),
    );
  }
  page.appendChild(table.root);

  if (context.query.get('new') === '1') {
    window.setTimeout(() => openFileForm(context, undefined, () => table.reload()), 80);
    clearNewParam();
  }

  return page;
}

function clearNewParam(): void {
  const path = window.location.hash.replace(/[?&]new=1/, '').replace(/[?&]$/, '');
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${path}`);
}

export function openFileForm(
  context: PageArgs,
  existing?: FileListRow,
  onSaved?: () => void,
): void {
  const { workspace, services } = context;
  const lookups = workspace.lookups;
  const file = existing?.file;

  const title = textField({
    label: 'عنوان الملف',
    name: 'title',
    required: true,
    placeholder: 'مثال: نزاع ملكية العقار رقم 12 — مدينة نصر',
    value: file ? String(file.title) : '',
    maxlength: 200,
  });
  const fileType = selectField({
    label: 'نوع الملف',
    name: 'fileTypeCode',
    required: true,
    options: lookups.items('file_type').map((item) => ({ value: item.code, label: item.nameAr })),
    value: file ? lookups.byId(String(file.file_type_id))?.code ?? '' : 'primary',
  });
  const practice = selectField({
    label: 'فرع القانون',
    name: 'practiceAreaCode',
    options: lookups.items('practice_area').map((item) => ({ value: item.code, label: item.nameAr })),
    value: file ? lookups.byId(String(file.practice_area_id))?.code ?? '' : '',
  });
  const openedOn = dateField({
    label: 'تاريخ فتح الملف',
    name: 'openedOn',
    required: true,
    value: file ? String(file.opened_on) : new Date().toISOString().slice(0, 10),
  });
  const priority = selectField({
    label: 'الأولوية',
    name: 'priorityCode',
    options: lookups.items('priority').map((item) => ({ value: item.code, label: item.nameAr })),
    value: file ? lookups.byId(String(file.priority_id))?.code ?? '' : 'normal',
  });
  const description = textareaField({
    label: 'وصف مختصر',
    name: 'description',
    rows: 3,
    maxlength: 1000,
    placeholder: 'موضوع الملف وطلبات الموكل…',
    value: file ? String(file.description ?? '') : '',
  });

  const clientPicker = file
    ? null
    : entityPicker({
        name: 'clientId',
        label: 'العميل',
        placeholder: 'ابحث باسم العميل أو رقمه…',
        help: 'يمكنك إضافة بقية الأطراف من صفحة الملف بعد إنشائه.',
        search: (query) => services.clients.searchOptions(query, true, 10),
      });

  const form = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    title,
    h('div', { class: 'form-grid' }, fileType, openedOn),
    h('div', { class: 'form-grid' }, practice, priority),
    clientPicker ? clientPicker.root : null,
    description,
  );

  openFormDialog({
    title: existing ? 'تعديل الملف' : 'ملف جديد',
    description: existing ? String(file?.file_number ?? '') : 'سيُولَّد رقم الملف تلقائيًا بحسب سلسلة الترقيم المعتمدة.',
    iconName: 'folder',
    size: 'lg',
    content: form,
    submitLabel: existing ? 'حفظ التعديلات' : 'إنشاء الملف',
    successMessage: existing ? 'تم حفظ تعديلات الملف' : 'تم إنشاء الملف وحفظه',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (formElement) => {
      const values = readValues(formElement);
      if (!values.title) {
        setFieldError(formElement, 'title', 'عنوان الملف مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      const clientId = clientPicker?.getValue() ?? '';
      if (existing) {
        await services.files.update(String(file?.id), {
          title: values.title,
          file_type_id: lookupId(lookups, 'file_type', values.fileTypeCode ?? 'primary'),
          practice_area_id: values.practiceAreaCode ? lookupId(lookups, 'practice_area', values.practiceAreaCode) : null,
          opened_on: values.openedOn,
          priority_id: values.priorityCode ? lookupId(lookups, 'priority', values.priorityCode) : null,
          description: values.description || null,
        });
      } else {
        await services.files.create({
          title: values.title,
          ...(values.fileTypeCode ? { fileTypeCode: values.fileTypeCode } : {}),
          ...(values.openedOn ? { openedOn: values.openedOn } : {}),
          ...(values.practiceAreaCode ? { practiceAreaCode: values.practiceAreaCode } : {}),
          ...(values.priorityCode ? { priorityCode: values.priorityCode } : {}),
          ...(values.description ? { description: values.description } : {}),
          ...(clientId ? { clientPartyIds: [clientId] } : {}),
        });
      }
    },
  });
}

function readValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    if (control.name) values[control.name] = control.value.trim();
  }
  return values;
}

export function fileNameCell(file: Record<string, unknown>, href?: string): Child {
  return h(
    'div',
    { class: 'cell-main' },
    href
      ? h('a', { class: 'cell-title cell-link', href, text: String(file.title) })
      : h('span', { class: 'cell-title', text: String(file.title) }),
    h('span', { class: 'cell-sub mono', dir: 'ltr', text: String(file.file_number) }),
  );
}
