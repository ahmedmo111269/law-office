import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber, formatRelative, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { definitionList, notice, pageHeader, sectionCard } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { confirmDialog, openDialog } from '../components/dialog.ts';
import type { PageArgs } from '../app/context.ts';
import type { DocumentRow } from '../services/documents.ts';
import { lookupBadge, openFormDialog, setFieldError } from './shared.ts';

export async function renderDocuments(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;

  const columns: Column<DocumentRow>[] = [
    {
      key: 'title',
      label: 'عنوان المستند',
      width: 300,
      sortable: true,
      defaultPinned: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('button', {
            class: 'cell-title cell-link',
            type: 'button',
            style: 'text-align:start;padding:0',
            text: String(row.document.title),
            on: { click: () => openDocumentDetail(context, String(row.document.id), () => void table.reload()) },
          }),
          h('span', { class: 'cell-sub', text: [row.document.doc_number ? `رقم ${String(row.document.doc_number)}` : '', row.links.length > 0 ? `مرتبط بـ ${row.links.join('، ')}` : 'غير مرتبط'].filter(Boolean).join(' · ') }),
        ),
      text: (row) => String(row.document.title),
    },
    {
      key: 'type',
      label: 'النوع',
      width: 150,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'badge badge--quiet', text: row.typeName }),
      text: (row) => row.typeName,
    },
    {
      key: 'number',
      label: 'الرقم',
      width: 120,
      defaultHidden: true,
      render: (row) => h('span', { class: 'mono', dir: 'ltr', text: String(row.document.doc_number ?? '—') }),
      text: (row) => String(row.document.doc_number ?? ''),
    },
    {
      key: 'date',
      label: 'التاريخ',
      width: 130,
      sortable: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'num', text: row.document.doc_date ? formatDate(String(row.document.doc_date), 'short') : '—' }),
      text: (row) => String(row.document.doc_date ?? ''),
    },
    {
      key: 'state',
      label: 'حالة المحتوى',
      width: 150,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'text-2', text: row.contentStateName }),
      text: (row) => row.contentStateName,
    },
    {
      key: 'versions',
      label: 'النسخ',
      width: 90,
      align: 'end',
      numeric: true,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'num', text: formatNumber(row.versionsCount) }),
      text: (row) => String(row.versionsCount),
    },
    {
      key: 'confidentiality',
      label: 'السرية',
      width: 130,
      defaultHidden: true,
      render: (row) => lookupBadge(lookups, 'confidentiality', String(row.document.confidentiality_id ?? '')),
      text: () => '',
    },
  ];

  const header = pageHeader({
    title: 'المستندات',
    subtitle: 'سجل المستندات ونسخها وروابطها بالملفات والقضايا. تُحفظ بيانات المستند ومرجع تخزينه، لا محتواه.',
    count: 0,
    actions: [
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openDocumentForm(context, () => table.reload()) } },
        icon('plus', 17), h('span', { text: 'مستند جديد' })),
    ],
  });
  const countNode = header.querySelector('.page-title__count');
  const focusId = context.query.get('focus');

  const table = dataTable<DocumentRow>(
    {
      id: 'documents',
      title: 'المستندات',
      columns,
      load: (request) => services.documents.list(request),
      rowKey: (row) => String(row.document.id),
      searchPlaceholder: 'ابحث في عنوان المستند أو رقمه…',
      defaultSort: { key: 'date', dir: 'desc' },
      filters: [{ key: 'type', label: 'كل الأنواع', options: lookups.items('document_type').map((item) => ({ value: item.code, label: item.nameAr })) }],
      focusRowId: focusId,
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('button', { class: 'icon-btn icon-btn--sm', type: 'button', title: 'التفاصيل', attrs: { 'aria-label': 'تفاصيل المستند' }, on: { click: () => openDocumentDetail(context, String(row.document.id), () => void table.reload()) } }, icon('eye', 16)),
        h('button', { class: 'icon-btn icon-btn--sm', type: 'button', title: 'إضافة نسخة', attrs: { 'aria-label': 'إضافة نسخة للمستند' }, on: { click: () => openVersionForm(context, String(row.document.id), () => void table.reload()) } }, icon('layers', 16)),
      ],
      emptyTitle: 'لا مستندات بعد',
      emptyText: 'أضف المستندات واربطها بالملفات أو القضايا لتجدها دائمًا في سياقها.',
      emptyIcon: 'document',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'مستند جديد', on: { click: () => openDocumentForm(context, () => table.reload()) } })],
    },
    workspace.preferences,
  );

  const page = h('div', { class: 'page' }, header, table.root);
  if (context.query.get('new') === '1') {
    window.setTimeout(() => openDocumentForm(context, () => table.reload()), 80);
  }
  if (focusId) {
    window.setTimeout(() => openDocumentDetail(context, focusId, () => void table.reload()), 200);
  }
  return page;
}

export function openDocumentForm(context: PageArgs, onSaved?: () => void, presetFileId?: string): void {
  const lookups = context.workspace.lookups;
  const title = textField({ label: 'عنوان المستند', name: 'title', required: true, maxlength: 200, placeholder: 'مثال: عقد إيجار موقّع' });
  const type = selectField({ label: 'النوع', name: 'docTypeCode', required: true, options: lookups.items('document_type').map((item) => ({ value: item.code, label: item.nameAr })), value: 'pleading' });
  const number = textField({ label: 'رقم المستند', name: 'docNumber', maxlength: 60, dir: 'auto' });
  const date = dateField({ label: 'تاريخ المستند', name: 'docDate', value: isoDateToday() });
  const confidentiality = selectField({ label: 'درجة السرية', name: 'confidentialityCode', options: lookups.items('confidentiality').map((item) => ({ value: item.code, label: item.nameAr })), value: 'normal' });
  const externalRef = textField({ label: 'مرجع خارجي', name: 'externalRef', maxlength: 200, help: 'رقم أو مرجع من جهة خارجية (اختياري).' });
  const notes = textareaField({ label: 'ملاحظات', name: 'notes', rows: 2, maxlength: 1000 });
  const filePicker = presetFileId
    ? null
    : entityPicker({
        name: 'fileId',
        label: 'الملف (اختياري)',
        placeholder: 'ابحث برقم الملف…',
        search: (query) => context.services.files.searchOptions(query, 8),
      });
  const casePicker = entityPicker({
    name: 'caseId',
    label: 'القضية (اختياري)',
    placeholder: 'ابحث برقم القضية…',
    search: (query) => context.services.cases.searchOptions(query, 8),
  });

  openFormDialog({
    title: 'مستند جديد',
    description: 'يُحفظ المستند كسجل بيانات ومرجع؛ إضافة الملف نفسه تكون بنسخة لها مسار أو مرجع.',
    iconName: 'document',
    size: 'lg',
    content: h(
      'div',
      { class: 'stack', style: 'gap:16px' },
      title,
      h('div', { class: 'form-grid' }, type, date),
      h('div', { class: 'form-grid' }, number, confidentiality),
      externalRef,
      h('div', { class: 'form-grid' }, filePicker?.root ?? null, casePicker.root),
      notes,
    ),
    submitLabel: 'حفظ المستند',
    successMessage: 'تم حفظ المستند',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.title) { setFieldError(form, 'title', 'عنوان المستند مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      const fileId = presetFileId ?? filePicker?.getValue() ?? '';
      await context.services.documents.create({
        title: values.title,
        ...(values.docTypeCode ? { docTypeCode: values.docTypeCode } : {}),
        ...(values.docNumber ? { docNumber: values.docNumber } : {}),
        ...(values.docDate ? { docDate: values.docDate } : {}),
        ...(values.confidentialityCode ? { confidentialityCode: values.confidentialityCode } : {}),
        ...(values.externalRef ? { externalRef: values.externalRef } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
        ...(fileId ? { fileId } : {}),
        ...(casePicker.getValue() ? { caseId: casePicker.getValue() } : {}),
      });
    },
  });
}

export function openVersionForm(context: PageArgs, documentId: string, onSaved?: () => void): void {
  const kind = selectField({
    label: 'طريقة التخزين',
    name: 'storageKind',
    required: true,
    options: [
      { value: 'external_reference', label: 'مرجع خارجي (رقم/مسار)' },
      { value: 'local_file', label: 'ملف محلي (مسار على الجهاز)' },
      { value: 'paper', label: 'نسخة ورقية في المكتب' },
    ],
    value: 'external_reference',
  });
  const fileName = textField({ label: 'اسم الملف', name: 'fileName', maxlength: 260 });
  const storagePath = textField({ label: 'المسار أو المرجع', name: 'storagePath', maxlength: 500, help: 'لا يُرفع الملف إلى الإنترنت. يُحفظ المسار الوصفي فقط.' });
  const notes = textareaField({ label: 'ملاحظات النسخة', name: 'notes', rows: 2, maxlength: 500 });

  openFormDialog({
    title: 'إضافة نسخة للمستند',
    description: 'كل نسخة لها رقم تسلسلي، وتُسجَّل في سجل النشاط.',
    iconName: 'layers',
    content: h('div', { class: 'stack', style: 'gap:16px' }, kind, fileName, storagePath, notes),
    submitLabel: 'إضافة النسخة',
    successMessage: 'تمت إضافة النسخة',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      await context.services.documents.addVersion(documentId, {
        storageKind: (values.storageKind as 'local_file' | 'external_reference' | 'paper') ?? 'external_reference',
        ...(values.fileName ? { fileName: values.fileName } : {}),
        ...(values.storagePath ? { storagePath: values.storagePath } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      });
    },
  });
}

async function openDocumentDetail(context: PageArgs, documentId: string, refresh: () => void): Promise<void> {
  const detail = await context.services.documents.get(documentId);
  if (!detail) return;
  const lookups = context.workspace.lookups;

  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    definitionList([
      { label: 'العنوان', value: String(detail.document.title) },
      { label: 'النوع', value: lookups.byId(String(detail.document.doc_type_id ?? ''))?.nameAr ?? '—' },
      { label: 'الرقم', value: String(detail.document.doc_number ?? '—') },
      { label: 'التاريخ', value: detail.document.doc_date ? formatDate(String(detail.document.doc_date), 'medium') : '—' },
      { label: 'السرية', value: lookups.byId(String(detail.document.confidentiality_id ?? ''))?.nameAr ?? '—' },
      { label: 'المرجع الخارجي', value: String(detail.document.external_ref ?? '—') },
      { label: 'ملاحظات', value: String(detail.document.notes ?? '—') },
      { label: 'أُنشئ', value: formatRelative(String(detail.document.created_at)) },
    ]),
    sectionCard({
      title: 'النسخ',
      subtitle: 'بيانات النسخ ومراجع التخزين.',
      actions: [h('button', { class: 'btn btn--outline btn--sm', type: 'button', text: 'إضافة نسخة', on: { click: () => openVersionForm(context, documentId, refresh) } })],
      bodyClass: 'card__body--tight',
      body:
        detail.versions.length === 0
          ? h('p', { class: 'text-sm text-3', style: 'padding:12px', text: 'لا نسخ مسجلة. أضف مرجع النسخة الورقية أو مسار الملف.' })
          : h(
              'div',
              { class: 'record-list' },
              ...detail.versions.map((version) =>
                h(
                  'div',
                  { class: 'attention-item' },
                  h('span', { class: 'attention-item__icon' }, icon('layers', 16)),
                  h(
                    'span',
                    { class: 'attention-item__body' },
                    h('span', { class: 'attention-item__title', text: `النسخة ${String(version.version_no)} — ${String(version.file_name ?? 'بدون اسم')}` }),
                    h('span', { class: 'attention-item__desc', text: [humanStorage(String(version.storage_kind)), version.storage_path ? String(version.storage_path) : ''].filter(Boolean).join(' · ') }),
                  ),
                  h('span', { class: 'attention-item__meta', text: formatRelative(String(version.created_at)) }),
                ),
              ),
            ),
    }),
    sectionCard({
      title: 'الروابط',
      subtitle: 'أين يظهر هذا المستند داخل المكتب.',
      body:
        detail.links.length === 0
          ? h('p', { class: 'text-sm text-3', text: 'المستند غير مرتبط بأي ملف أو قضية.' })
          : h(
              'div',
              { class: 'stack', style: 'gap:6px' },
              ...detail.links.map((link) =>
                h(
                  'a',
                  { class: 'menu__item', href: link.kind === 'ملف' ? `#/files/${link.targetId}` : link.kind === 'قضية' ? `#/cases/${link.targetId}` : '#/documents', style: 'text-decoration:none' },
                  icon('link', 16),
                  h('span', { text: `${link.kind}: ${link.label}` }),
                ),
              ),
            ),
    }),
    sectionCard({
      title: 'سجل النشاط',
      body:
        detail.activity.length === 0
          ? h('p', { class: 'text-sm text-3', text: 'لا نشاط مسجل.' })
          : h(
              'div',
              { class: 'timeline' },
              ...detail.activity.map((entry) =>
                h(
                  'div',
                  { class: 'timeline__item' },
                  h('span', { class: 'timeline__dot' }, icon('history', 12)),
                  h(
                    'div',
                    { class: 'timeline__body' },
                    h('p', { class: 'timeline__title', text: String(entry.action) }),
                    h('p', { class: 'timeline__meta', text: formatRelative(String(entry.occurred_at)) }),
                  ),
                ),
              ),
            ),
    }),
    notice('neutral', 'البرنامج لا يخزّن محتوى المستند ولا يرفعه لأي جهة. النسخ تُحفظ كبيانات وصفية ومرجع مسار.', { iconName: 'lock' }),
  );

  const handle = openDialog({
    title: 'تفاصيل المستند',
    description: String(detail.document.title),
    iconName: 'document',
    size: 'lg',
    content: h('div', { class: 'stack', style: 'gap:16px' }, content),
    footer: h(
      'div',
      { class: 'dialog__actions' },
      h('button', {
        class: 'btn btn--danger-ghost',
        type: 'button',
        text: 'حذف المستند',
        on: {
          click: () => {
            handle.close();
            confirmDialog({
              title: 'حذف المستند',
              message: 'سيُحذف المستند حذفًا منطقيًا ويمكن استعادته من الأرشيف.',
              confirmLabel: 'حذف',
              danger: true,
              onConfirm: async () => {
                await context.services.documents.remove(documentId);
                refresh();
              },
            });
          },
        },
      }),
      h('button', { class: 'btn btn--primary', type: 'button', text: 'إغلاق', on: { click: () => handle.close() } }),
    ),
  });
}

function humanStorage(kind: string): string {
  switch (kind) {
    case 'local_file':
      return 'ملف محلي';
    case 'paper':
      return 'نسخة ورقية';
    default:
      return 'مرجع خارجي';
  }
}

function readForm(form: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    if (control.name) values[control.name] = control.value.trim();
  }
  return values;
}

