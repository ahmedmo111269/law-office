import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { notice, pageHeader, statCard } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import type { PageArgs } from '../app/context.ts';
import type { AnnouncementRow } from '../services/agenda.ts';
import { openFormDialog, setFieldError, statusTone } from './shared.ts';

export async function renderAnnouncements(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;

  const columns: Column<AnnouncementRow>[] = [
    {
      key: 'recipient',
      label: 'المُعلَن إليه',
      width: 220,
      defaultPinned: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('span', { class: 'cell-title', text: row.recipientName ?? 'غير محدد' }),
          h('span', { class: 'cell-sub', text: row.taskTitle ?? 'بدون مهمة مرتبطة' }),
        ),
      text: (row) => row.recipientName ?? '',
    },
    {
      key: 'kind',
      label: 'نوع الإعلان',
      width: 150,
      cardRole: 'meta',
      render: (row) => h('span', { text: row.kindName }),
      text: (row) => row.kindName,
    },
    {
      key: 'method',
      label: 'طريقة الإعلان',
      width: 150,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'text-2', text: row.methodName }),
      text: (row) => row.methodName,
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
      key: 'served',
      label: 'تاريخ الإعلان',
      width: 140,
      cardRole: 'meta',
      render: (row) => (row.announcement.served_on ? h('span', { class: 'num', text: formatDate(String(row.announcement.served_on), 'short') }) : h('span', { class: 'text-3', text: 'لم يتم' })),
      text: (row) => String(row.announcement.served_on ?? ''),
    },
    {
      key: 'publication',
      label: 'النشر',
      width: 180,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'text-2 truncate', text: String(row.announcement.publication ?? '—') }),
      text: (row) => String(row.announcement.publication ?? ''),
    },
  ];

  const header = pageHeader({
    title: 'الإعلانات والإنابات',
    subtitle: 'إعلانات الخصوم والشهود بطرقها القانونية: المحضر، البريد، النشر. حالة كل إعلان وتاريخه.',
    count: 0,
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<AnnouncementRow>(
    {
      id: 'announcements',
      title: 'سجل الإعلانات',
      columns,
      load: (request) => services.agenda.listAnnouncements(request),
      rowKey: (row) => String(row.announcement.id),
      searchPlaceholder: 'ابحث باسم المُعلَن إليه…',
      filters: [{ key: 'status', label: 'كل الحالات', options: lookups.items('announcement_status').map((item) => ({ value: item.code, label: item.nameAr })) }],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        row.statusCode === 'served' || row.statusCode === 'completed'
          ? h('span', { class: 'badge badge--success', text: 'تم' })
          : h('button', {
              class: 'btn btn--secondary btn--sm',
              type: 'button',
              text: 'تأكيد الإعلان',
              on: { click: () => openServedDialog(context, row, () => void table.reload()) },
            }),
      ],
      toolbar: [
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', on: { click: () => openAnnouncementDialog(context, () => void table.reload()) } },
          icon('send', 15), h('span', { text: 'إعلان جديد' })),
      ],
      emptyTitle: 'لا إعلانات مسجلة',
      emptyText: 'أنشئ إعلانًا لم يُنفَّذ بعد، ثم أكّد تاريخ الإعلان عند ورود المحضر أو الإيصال.',
      emptyIcon: 'send',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'إعلان جديد', on: { click: () => openAnnouncementDialog(context, () => void table.reload()) } })],
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
      statCard({ label: 'إعلانات معلقة', value: formatNumber(await countByStatus(context, 'pending')), iconName: 'send', tone: 'warning' }),
      statCard({ label: 'تم إعلانها', value: formatNumber(await countByStatus(context, 'served')), iconName: 'check', tone: 'success' }),
      statCard({ label: 'إعلانات هذا الشهر', value: formatNumber(await countThisMonth(context)), iconName: 'calendar-clock' }),
    ),
    table.root,
    notice('neutral', 'البرنامج لا يحسب مواعيد الإعلان أو النشر آليًا، ولا يدّعي إتمام الإعلان دون تأكيدك. حجية الإعلان ونتائجه مسألة قانونية يقدرها المحامي.', { iconName: 'info' }),
  );
  return page;
}

async function countByStatus(context: PageArgs, code: string): Promise<number> {
  const statusId = context.workspace.lookups.id('announcement_status', code);
  if (!statusId) return 0;
  return (await context.workspace.db.query('announcement', { filters: [{ column: 'status_id', op: 'eq', value: statusId }], limit: 0 })).total;
}

async function countThisMonth(context: PageArgs): Promise<number> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return (await context.workspace.db.query('announcement', { filters: [{ column: 'created_at', op: 'gte', value: start }], limit: 0 })).total;
}

function openAnnouncementDialog(context: PageArgs, onSaved: () => void): void {
  const lookups = context.workspace.lookups;
  const recipient = entityPicker({
    name: 'recipientPartyId',
    label: 'المُعلَن إليه',
    required: true,
    placeholder: 'ابحث باسم الطرف…',
    search: (query) => context.services.parties.searchOptions(query, 8),
  });
  const kind = selectField({ label: 'نوع الإعلان', name: 'kindCode', options: lookups.items('announcement_kind').map((item) => ({ value: item.code, label: item.nameAr })) });
  const method = selectField({ label: 'طريقة الإعلان', name: 'methodCode', options: lookups.items('announcement_method').map((item) => ({ value: item.code, label: item.nameAr })), value: 'bailiff' });
  const servedOn = dateField({ label: 'تاريخ الإعلان (إن تم)', name: 'servedOn' });
  const publication = textField({ label: 'بيانات النشر', name: 'publication', maxlength: 200, placeholder: 'اسم الصحيفة والعدد والتاريخ' });
  const notes = textareaField({ label: 'ملاحظات', name: 'notes', rows: 2, maxlength: 1000 });
  openFormDialog({
    title: 'إعلان جديد',
    description: 'يمكن حفظه كإعلان معلق ثم تأكيد تاريخه لاحقًا.',
    iconName: 'send',
    size: 'md',
    content: h('div', { class: 'stack', style: 'gap:16px' }, recipient.root, h('div', { class: 'form-grid' }, kind, method), servedOn, publication, notes),
    submitLabel: 'حفظ الإعلان',
    successMessage: 'تم تسجيل الإعلان',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!recipient.getValue()) throw new Error('اختر المُعلَن إليه.');
      await context.services.agenda.createAnnouncement({
        recipientPartyId: recipient.getValue(),
        ...(values.kindCode ? { kindCode: values.kindCode } : {}),
        ...(values.methodCode ? { methodCode: values.methodCode } : {}),
        ...(values.servedOn ? { servedOn: values.servedOn, statusCode: 'served' } : {}),
        ...(values.publication ? { publication: values.publication } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      });
    },
  });
}

function openServedDialog(context: PageArgs, row: AnnouncementRow, onSaved: () => void): void {
  const servedOn = dateField({ label: 'تاريخ الإعلان الفعلي', name: 'servedOn', required: true, value: isoDateToday() });
  const notes = textareaField({ label: 'ما ورد في المحضر', name: 'notes', rows: 3, maxlength: 1000 });
  openFormDialog({
    title: 'تأكيد إعلان',
    description: row.recipientName ?? '',
    iconName: 'check',
    size: 'sm',
    content: h('div', { class: 'stack', style: 'gap:16px' }, servedOn, notes),
    submitLabel: 'تأكيد',
    successMessage: 'تم تسجيل تاريخ الإعلان',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.servedOn) { setFieldError(form, 'servedOn', 'تاريخ الإعلان مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.agenda.setAnnouncementStatus(String(row.announcement.id), 'served', values.servedOn);
      if (values.notes) {
        await context.workspace.db.update('announcement', String(row.announcement.id), { notes: values.notes });
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

