import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatMoney, formatNumber, formatRelative } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { definitionList, emptyState, pageHeader, sectionCard, statCard, tabPanel, tabs } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { navigate } from '../app/router.ts';
import type { PageArgs } from '../app/context.ts';
import type { ClientDetail, ClientRow } from '../services/clients.ts';
import { lookupBadge, openFormDialog, setFieldError } from './shared.ts';
import { openFileForm } from './files.ts';

export async function renderClients(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;

  const columns: Column<ClientRow>[] = [
    {
      key: 'name',
      label: 'الاسم',
      width: 260,
      sortable: true,
      defaultPinned: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'row', style: 'gap:8px;min-inline-size:0' },
          h('span', { class: 'avatar', style: 'inline-size:28px;block-size:28px;font-size:12px', text: String(row.party.display_name).charAt(0) }),
          h(
            'div',
            { class: 'cell-main' },
            h('a', { class: 'cell-title cell-link', href: `#/clients/${String(row.party.id)}`, text: String(row.party.display_name) }),
            h('span', { class: 'cell-sub mono', dir: 'ltr', text: String(row.client.client_code) }),
          ),
        ),
      text: (row) => String(row.party.display_name),
    },
    {
      key: 'code',
      label: 'كود العميل',
      width: 140,
      defaultHidden: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'mono', dir: 'ltr', text: String(row.client.client_code) }),
      text: (row) => String(row.client.client_code),
    },
    {
      key: 'kind',
      label: 'النوع',
      width: 100,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'badge badge--quiet', text: row.party.kind === 'organization' ? 'شركة' : 'شخص' }),
      text: (row) => (row.party.kind === 'organization' ? 'شركة' : 'شخص'),
    },
    {
      key: 'phone',
      label: 'الهاتف',
      width: 150,
      cardRole: 'meta',
      render: (row) =>
        row.phone
          ? h('a', { class: 'num', href: `tel:${row.phone}`, dir: 'ltr', text: row.phone })
          : h('span', { class: 'text-3', text: '—' }),
      text: (row) => row.phone ?? '',
    },
    {
      key: 'email',
      label: 'البريد الإلكتروني',
      width: 190,
      defaultHidden: true,
      render: (row) => h('span', { class: 'text-2', dir: 'ltr', text: row.email ?? '—' }),
      text: (row) => row.email ?? '',
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 120,
      cardRole: 'meta',
      render: (row) => lookupBadge(lookups, 'client_status', String(row.client.status_id ?? '')),
      text: () => '',
    },
    {
      key: 'files',
      label: 'الملفات',
      width: 90,
      align: 'end',
      numeric: true,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'num', text: formatNumber(row.filesCount) }),
      text: (row) => String(row.filesCount),
    },
    {
      key: 'lastActivity',
      label: 'آخر نشاط',
      width: 150,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'text-3', text: formatRelative(row.lastActivity) }),
      text: (row) => row.lastActivity,
    },
  ];

  const header = pageHeader({
    title: 'العملاء',
    subtitle: 'سجل العملاء: أشخاص وشركات، مع بيانات التواصل والملفات والمستحقات.',
    count: 0,
    actions: [
      h('button', {
        class: 'btn btn--outline',
        type: 'button',
        on: { click: () => navigate('/files?new=1') },
      }, icon('folder', 17), h('span', { text: 'ملف جديد' })),
      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        on: { click: () => openClientForm(context) },
      }, icon('plus', 17), h('span', { text: 'عميل جديد' })),
    ],
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<ClientRow>(
    {
      id: 'clients',
      title: 'العملاء',
      columns,
      load: (request) => services.clients.list(request),
      rowKey: (row) => String(row.party.id),
      rowHref: (row) => `#/clients/${String(row.party.id)}`,
      searchPlaceholder: 'ابحث بالاسم أو الهاتف أو كود العميل…',
      defaultSort: { key: 'lastActivity', dir: 'desc' },
      filters: [
        { key: 'status', label: 'كل الحالات', options: lookups.items('client_status').map((item) => ({ value: item.code, label: item.nameAr })) },
        { key: 'kind', label: 'كل الأنواع', options: [{ value: 'person', label: 'أشخاص' }, { value: 'organization', label: 'شركات' }] },
      ],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('a', { class: 'icon-btn icon-btn--sm', href: `#/clients/${String(row.party.id)}`, title: 'ملف العميل', attrs: { 'aria-label': `ملف العميل ${String(row.party.display_name)}` } }, icon('external', 16)),
        h('button', {
          class: 'icon-btn icon-btn--sm',
          type: 'button',
          title: 'تعديل',
          attrs: { 'aria-label': 'تعديل بيانات العميل' },
          on: { click: () => openClientForm(context) },
        }, icon('edit', 16)),
      ],
      emptyTitle: 'لا يوجد عملاء بعد',
      emptyText: 'سجّل أول عميل لتبدأ ملفاته وقضاياه. بيانات العميل محفوظة على هذا الجهاز فقط.',
      emptyIcon: 'users',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'إضافة عميل', on: { click: () => openClientForm(context) } })],
    },
    workspace.preferences,
  );

  const page = h('div', { class: 'page' }, header, table.root);
  if (context.query.get('new') === '1') {
    window.setTimeout(() => openClientForm(context, undefined, () => table.reload()), 80);
  }
  return page;
}

// ---------------------------------------------------------------------------
export function openClientForm(context: PageArgs, existing?: ClientDetail, onSaved?: () => void): void {
  const lookups = context.workspace.lookups;
  const isEdit = Boolean(existing);
  let kind: 'person' | 'organization' = existing?.person ? 'person' : existing?.organization ? 'organization' : 'person';

  const personFields = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h(
      'div',
      { class: 'form-grid' },
      textField({ label: 'الاسم الأول', name: 'firstName', required: true, value: existing?.person ? String(existing.person.first_name) : '', maxlength: 80 }),
      textField({ label: 'اسم الأب', name: 'middleName', value: existing?.person ? String(existing.person.middle_name ?? '') : '', maxlength: 80 }),
    ),
    h(
      'div',
      { class: 'form-grid' },
      textField({ label: 'اسم العائلة', name: 'lastName', required: true, value: existing?.person ? String(existing.person.last_name) : '', maxlength: 80 }),
      h('div', { class: 'field' }, h('span', { class: 'field__label', text: 'الرقم القومي' }),
        h('input', {
          class: 'input', name: 'nationalId', dir: 'ltr', inputmode: 'numeric', maxlength: '14',
          value: existing?.person ? String(existing.person.national_id ?? '') : '',
          placeholder: '14 رقمًا',
          attrs: { 'aria-label': 'الرقم القومي' },
        }),
        h('p', { class: 'field__help', text: 'اختياري. يُستخدم لمنع تكرار العميل.' }),
      ),
    ),
    h(
      'div',
      { class: 'form-grid' },
      dateField({ label: 'تاريخ الميلاد', name: 'birthDate', value: existing?.person ? String(existing.person.birth_date ?? '') : '' }, { withQuickPicks: false }),
      textField({ label: 'المهنة', name: 'occupation', value: existing?.person ? String(existing.person.occupation ?? '') : '', maxlength: 120 }),
    ),
  );

  const organizationFields = h(
    'div',
    { class: 'stack', style: 'gap:16px', hidden: kind === 'person' ? 'hidden' : undefined },
    textField({ label: 'الاسم القانوني', name: 'legalName', required: kind === 'organization', value: existing?.organization ? String(existing.organization.legal_name) : '', maxlength: 200 }),
    h(
      'div',
      { class: 'form-grid' },
      textField({ label: 'الاسم التجاري', name: 'tradeName', value: existing?.organization ? String(existing.organization.trade_name ?? '') : '', maxlength: 200 }),
      selectField({
        label: 'الشكل القانوني',
        name: 'legalFormCode',
        options: lookups.items('legal_form').map((item) => ({ value: item.code, label: item.nameAr })),
        value: existing?.organization ? lookups.byId(String(existing.organization.legal_form_id ?? ''))?.code ?? '' : '',
      }),
    ),
    h(
      'div',
      { class: 'form-grid' },
      textField({ label: 'السجل التجاري', name: 'commercialRegistryNo', dir: 'ltr', value: existing?.organization ? String(existing.organization.commercial_registry_no ?? '') : '', maxlength: 40 }),
      textField({ label: 'الرقم الضريبي', name: 'taxId', dir: 'ltr', value: existing?.organization ? String(existing.organization.tax_id ?? '') : '', maxlength: 40 }),
    ),
  );

  const kindSwitch = h(
    'div',
    { class: 'row-wrap', style: 'gap:8px' },
    ...(['person', 'organization'] as const).map((value) =>
      h('button', {
        class: `chip chip--button${value === kind ? ' chip--active' : ''}`,
        type: 'button',
        dataset: { kind: value },
        attrs: { 'aria-pressed': String(value === kind) },
        text: value === 'person' ? 'شخص طبيعي' : 'شخص اعتباري (شركة)',
        on: {
          click: (event) => {
            kind = value;
            kindSwitch.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
              const active = chip.dataset.kind === value;
              chip.classList.toggle('chip--active', active);
              chip.setAttribute('aria-pressed', String(active));
            });
            personFields.hidden = value !== 'person';
            organizationFields.hidden = value !== 'organization';
            void event;
          },
        },
      }),
    ),
  );

  const contactFields = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h(
      'div',
      { class: 'form-grid' },
      textField({
        label: 'الهاتف المحمول',
        name: 'phone',
        type: 'tel',
        inputmode: 'tel',
        dir: 'ltr',
        value: existing?.contacts.find((contact) => String(contact.value).match(/^\+?\d/))?.value ? String(existing.contacts.find((contact) => String(contact.value).match(/^\+?\d/))?.value) : '',
        placeholder: '01xxxxxxxxx',
        maxlength: 20,
      }),
      textField({
        label: 'البريد الإلكتروني',
        name: 'email',
        type: 'email',
        dir: 'ltr',
        value: existing?.contacts.find((contact) => String(contact.value).includes('@'))?.value ? String(existing.contacts.find((contact) => String(contact.value).includes('@'))?.value) : '',
      }),
    ),
    h(
      'div',
      { class: 'form-grid' },
      selectField({
        label: 'حالة العميل',
        name: 'statusCode',
        options: lookups.items('client_status').map((item) => ({ value: item.code, label: item.nameAr })),
        value: existing?.client ? lookups.byId(String(existing.client.status_id ?? ''))?.code ?? '' : 'active',
      }),
      selectField({
        label: 'مصدر التعارف',
        name: 'sourceCode',
        options: lookups.items('client_source').map((item) => ({ value: item.code, label: item.nameAr })),
        value: existing?.client ? lookups.byId(String(existing.client.source_id ?? ''))?.code ?? '' : '',
      }),
    ),
    textareaField({ label: 'ملاحظات', name: 'notes', rows: 3, maxlength: 1000, value: existing?.party ? String(existing.party.notes ?? '') : '' }),
  );

  const form = h('div', { class: 'stack', style: 'gap:16px' }, isEdit ? null : kindSwitch, personFields, organizationFields, contactFields);

  openFormDialog({
    title: isEdit ? 'تعديل بيانات العميل' : 'عميل جديد',
    description: isEdit ? String(existing?.party.display_name ?? '') : 'سيُولَّد كود العميل تلقائيًا. يمكنك إضافة جهات اتصال إضافية من صفحة العميل.',
    iconName: 'users',
    size: 'lg',
    content: form,
    submitLabel: isEdit ? 'حفظ التعديلات' : 'إضافة العميل',
    successMessage: isEdit ? 'تم حفظ بيانات العميل' : 'تمت إضافة العميل',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (formElement) => {
      const values = readForm(formElement);
      if (kind === 'person') {
        if (!values.firstName) { setFieldError(formElement, 'firstName', 'الاسم الأول مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
        if (!values.lastName) { setFieldError(formElement, 'lastName', 'اسم العائلة مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
        if (values.nationalId && !/^\d{14}$/.test(values.nationalId)) {
          setFieldError(formElement, 'nationalId', 'الرقم القومي يجب أن يكون 14 رقمًا.');
          throw new Error('الرقم القومي غير صالح.');
        }
      } else if (!values.legalName) {
        setFieldError(formElement, 'legalName', 'الاسم القانوني للشركة مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      const input = {
        kind,
        ...(kind === 'person'
          ? {
              firstName: values.firstName ?? '',
              ...(values.middleName ? { middleName: values.middleName } : {}),
              lastName: values.lastName ?? '',
              ...(values.nationalId ? { nationalId: values.nationalId } : {}),
              ...(values.birthDate ? { birthDate: values.birthDate } : {}),
              ...(values.occupation ? { occupation: values.occupation } : {}),
            }
          : {
              legalName: values.legalName ?? '',
              ...(values.tradeName ? { tradeName: values.tradeName } : {}),
              ...(values.legalFormCode ? { legalFormCode: values.legalFormCode } : {}),
              ...(values.commercialRegistryNo ? { commercialRegistryNo: values.commercialRegistryNo } : {}),
              ...(values.taxId ? { taxId: values.taxId } : {}),
            }),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.email ? { email: values.email } : {}),
        ...(values.statusCode ? { statusCode: values.statusCode } : {}),
        ...(values.sourceCode ? { sourceCode: values.sourceCode } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      };
      if (isEdit && existing) {
        await context.services.clients.update(existing, input);
      } else {
        await context.services.clients.create(input);
      }
    },
  });
}

// ---------------------------------------------------------------------------
export async function renderClientDetail(context: PageArgs): Promise<HTMLElement> {
  const partyId = context.params.id ?? '';
  const detail = await context.services.clients.get(partyId);
  if (!detail) {
    return h('div', { class: 'page' }, emptyState({
      iconName: 'users',
      title: 'العميل غير موجود',
      text: 'قد يكون السجل محذوفًا أو الرابط غير صحيح.',
      actions: [h('a', { class: 'btn btn--primary', href: '#/clients', text: 'العودة إلى العملاء' })],
    }));
  }
  const lookups = context.workspace.lookups;
  const name = String(detail.party.display_name);
  const statusCode = lookups.byId(String(detail.client.status_id ?? ''))?.code ?? '';

  const page = h(
    'div',
    { class: 'page' },
    pageHeader({
      title: name,
      breadcrumb: [{ label: 'العملاء', href: '#/clients' }, { label: String(detail.client.client_code) }],
      meta: [
        h('span', { class: 'chip mono', dir: 'ltr', text: String(detail.client.client_code) }),
        lookupBadge(lookups, 'client_status', String(detail.client.status_id ?? '')),
        h('span', { class: 'chip', text: detail.organization ? 'شخص اعتباري' : 'شخص طبيعي' }),
      ],
      actions: [
        h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => openClientForm(context, detail, () => navigate(`/clients/${partyId}`, { replace: true })) } },
          icon('edit', 17), h('span', { text: 'تعديل' })),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openFileForm(context) } },
          icon('folder', 17), h('span', { text: 'ملف جديد' })),
      ],
    }),
    h(
      'div',
      { class: 'grid-4' },
      statCard({ label: 'ملفات العميل', value: formatNumber(detail.files.length), iconName: 'folder', href: `#/clients/${partyId}?tab=files` }),
      statCard({ label: 'مستحقات غير محصّلة', value: formatMoney(detail.outstandingMinor), iconName: 'wallet', tone: detail.outstandingMinor > 0 ? 'warning' : 'success', small: true }),
      statCard({ label: 'إجمالي المدفوع', value: formatMoney(detail.paidMinor), iconName: 'download', tone: 'success', small: true }),
      statCard({ label: 'وسائل التواصل', value: formatNumber(detail.contacts.length), iconName: 'phone', meta: `${formatNumber(detail.addresses.length)} عنوان` }),
    ),
  );

  const tabsHost = h('div');
  const overview = tabPanel('overview', h(
    'div',
    { class: 'detail-layout' },
    h(
      'div',
      { class: 'detail-main' },
      sectionCard({
        title: 'البيانات الأساسية',
        body: definitionList([
          { label: 'النوع', value: detail.organization ? 'شخص اعتباري' : 'شخص طبيعي' },
          ...(detail.person
            ? [
                { label: 'الاسم الكامل', value: [detail.person.first_name, detail.person.middle_name, detail.person.last_name].filter(Boolean).join(' ') },
                { label: 'الرقم القومي', value: detail.person.national_id ? h('span', { class: 'mono', dir: 'ltr', text: String(detail.person.national_id) }) : '—' },
                { label: 'المهنة', value: String(detail.person.occupation ?? '—') },
                { label: 'تاريخ الميلاد', value: detail.person.birth_date ? formatDate(String(detail.person.birth_date), 'medium') : '—' },
              ]
            : []),
          ...(detail.organization
            ? [
                { label: 'الاسم القانوني', value: String(detail.organization.legal_name) },
                { label: 'السجل التجاري', value: String(detail.organization.commercial_registry_no ?? '—') },
                { label: 'الرقم الضريبي', value: String(detail.organization.tax_id ?? '—') },
              ]
            : []),
          { label: 'مصدر التعارف', value: lookups.byId(String(detail.client.source_id ?? ''))?.nameAr ?? '—' },
          { label: 'تاريخ التسجيل', value: formatDate(String(detail.client.created_at), 'medium') },
          { label: 'ملاحظات', value: String(detail.party.notes ?? '—') },
        ]),
      }),
      sectionCard({
        title: 'الملفات المرتبطة',
        actions: [h('a', { class: 'section-link', href: `#/clients/${partyId}?tab=files`, text: 'عرض الكل' })],
        bodyClass: 'card__body--tight',
        body:
          detail.files.length === 0
            ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا ملفات مرتبطة بهذا العميل بعد.' })
            : h(
                'div',
                { class: 'record-list' },
                ...detail.files.slice(0, 4).map((entry) =>
                  h(
                    'a',
                    { class: 'attention-item', href: `#/files/${String(entry.file.id)}` },
                    h('span', { class: 'attention-item__icon' }, icon('folder', 16)),
                    h(
                      'span',
                      { class: 'attention-item__body' },
                      h('span', { class: 'attention-item__title', text: String(entry.file.title) }),
                      h('span', { class: 'attention-item__desc', text: `${String(entry.file.file_number)} · ${entry.roleName}` }),
                    ),
                    h('span', { class: 'attention-item__meta', text: formatRelative(String(entry.file.updated_at)) }),
                  ),
                ),
              ),
      }),
    ),
    h(
      'div',
      { class: 'detail-aside' },
      sectionCard({
        title: 'وسائل التواصل',
        actions: [h('button', { class: 'section-link', type: 'button', text: 'إضافة', on: { click: () => openContactForm(context, detail, statusCode) } })],
        body: h(
          'div',
          { class: 'stack', style: 'gap:8px' },
          ...detail.contacts.map((contact) =>
            h(
              'div',
              { class: 'row', style: 'gap:8px' },
              icon(String(contact.value).includes('@') ? 'mail' : 'phone', 15),
              h('span', { class: 'text-sm', dir: 'ltr', text: String(contact.value) }),
              contact.is_primary === 1 ? h('span', { class: 'badge badge--quiet', text: 'أساسي' }) : null,
            ),
          ),
          detail.contacts.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا وسائل تواصل مسجلة.' }) : null,
        ),
      }),
      sectionCard({
        title: 'العناوين',
        body: h(
          'div',
          { class: 'stack', style: 'gap:8px' },
          ...detail.addresses.map((address) =>
            h(
              'div',
              null,
              h('p', { class: 'text-sm', text: [address.line1, address.line2].filter(Boolean).join(' — ') }),
              h('p', { class: 'text-xs text-3', text: [address.city, lookups.byId(String(address.governorate_id ?? ''))?.nameAr].filter(Boolean).join(' · ') }),
            ),
          ),
          detail.addresses.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا عناوين مسجلة.' }) : null,
        ),
      }),
    ),
  ));

  const filesPanel = tabPanel('files', detail.files.length === 0
    ? emptyState({ iconName: 'folder', title: 'لا ملفات', text: 'أنشئ ملفًا لهذا العميل.', actions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'ملف جديد', on: { click: () => openFileForm(context) } })] })
    : h(
        'div',
        { class: 'record-list' },
        ...detail.files.map((entry) =>
          h(
            'div',
            { class: 'record-card' },
            h(
              'div',
              { class: 'record-card__head' },
              h('span', { class: 'avatar' }, icon('folder', 17)),
              h(
                'div',
                { style: 'flex:1;min-inline-size:0' },
                h('h3', { class: 'record-card__title' }, h('a', { href: `#/files/${String(entry.file.id)}`, text: String(entry.file.title) })),
                h('p', { class: 'text-xs text-3', text: `${String(entry.file.file_number)} · ${entry.roleName}${entry.sideName !== '—' ? ` · ${entry.sideName}` : ''}` }),
              ),
              h('a', { class: 'btn btn--ghost btn--sm', href: `#/files/${String(entry.file.id)}`, text: 'فتح' }),
            ),
          ),
        ),
      ));

  const financePanel = tabPanel('finance', h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'grid-2' },
      statCard({ label: 'غير محصّل', value: formatMoney(detail.outstandingMinor), iconName: 'wallet', tone: 'warning', small: true }),
      statCard({ label: 'مدفوع', value: formatMoney(detail.paidMinor), iconName: 'download', tone: 'success', small: true }),
    ),
    sectionCard({
      title: 'المستحقات',
      actions: [h('a', { class: 'section-link', href: `#/finance?tab=charges&client=${partyId}&new=1`, text: 'إضافة مستحق' })],
      bodyClass: 'card__body--tight',
      body:
        detail.charges.length === 0
          ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا مستحقات مسجلة.' })
          : h(
              'div',
              { class: 'record-list' },
              ...detail.charges.map((charge) =>
                h(
                  'div',
                  { class: 'attention-item' },
                  h('span', { class: 'attention-item__icon' }, icon('wallet', 16)),
                  h(
                    'span',
                    { class: 'attention-item__body' },
                    h('span', { class: 'attention-item__title', text: String(charge.description) }),
                    h('span', { class: 'attention-item__desc', text: [charge.issued_on ? formatDate(String(charge.issued_on), 'short') : '', lookups.byId(String(charge.status_id ?? ''))?.nameAr].filter(Boolean).join(' · ') }),
                  ),
                  h('span', { class: 'num strong', text: formatMoney(Number(charge.amount_minor)) }),
                ),
              ),
            ),
    }),
    sectionCard({
      title: 'الحركات المالية',
      bodyClass: 'card__body--tight',
      body:
        detail.transactions.length === 0
          ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا حركات مالية مسجلة.' })
          : h(
              'div',
              { class: 'record-list' },
              ...detail.transactions.map((transaction) =>
                h(
                  'div',
                  { class: 'attention-item' },
                  h('span', { class: 'attention-item__icon' }, icon(String(transaction.direction) === 'in' ? 'download' : 'upload', 16)),
                  h(
                    'span',
                    { class: 'attention-item__body' },
                    h('span', { class: 'attention-item__title', text: String(transaction.description ?? 'حركة مالية') }),
                    h('span', { class: 'attention-item__desc', text: formatDate(String(transaction.occurred_at), 'medium') }),
                  ),
                  h('span', { class: 'num strong', text: `${String(transaction.direction) === 'in' ? '+' : '−'}${formatMoney(Number(transaction.amount_minor))}` }),
                ),
              ),
            ),
    }),
  ));

  const activityPanel = tabPanel('activity', detail.activity.length === 0
    ? h('p', { class: 'text-sm text-3', text: 'لا نشاط مسجل بعد.' })
    : h(
        'div',
        { class: 'timeline' },
        ...detail.activity.map((entry) =>
          h(
            'div',
            { class: 'timeline__item' },
            h('span', { class: 'timeline__dot' }, icon('history', 13)),
            h(
              'div',
              { class: 'timeline__body' },
              h('p', { class: 'timeline__title', text: String(entry.action) }),
              h('p', { class: 'timeline__meta', text: `${String(entry.summary ?? '')} · ${formatRelative(String(entry.occurred_at))}` }),
            ),
          ),
        ),
      ));

  const panels = { overview, files: filesPanel, finance: financePanel, activity: activityPanel };
  const initial = (context.query.get('tab') as keyof typeof panels | null) ?? 'overview';
  const active = panels[initial] ? initial : 'overview';
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== active;
  const tabsHandle = tabs(
    [
      { id: 'overview', label: 'نظرة عامة', iconName: 'dashboard' },
      { id: 'files', label: 'الملفات', count: detail.files.length, iconName: 'folder' },
      { id: 'finance', label: 'المالية', count: detail.charges.length, iconName: 'wallet' },
      { id: 'activity', label: 'النشاط', iconName: 'history' },
    ],
    active,
    (id) => {
      for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
      tabsHandle.setActive(id);
    },
  );
  tabsHost.append(tabsHandle.root, ...Object.values(panels));
  page.appendChild(tabsHost);
  return page;
}

function openContactForm(context: PageArgs, detail: ClientDetail, statusCode: string): void {
  void statusCode;
  const type = selectField({
    label: 'نوع الوسيلة',
    name: 'typeCode',
    required: true,
    options: context.workspace.lookups.items('contact_type').map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'mobile',
  });
  const value = textField({ label: 'القيمة', name: 'value', required: true, dir: 'ltr', placeholder: '01xxxxxxxxx أو name@example.com' });
  const content = h('div', { class: 'stack', style: 'gap:16px' }, type, value);
  openFormDialog({
    title: 'إضافة وسيلة تواصل',
    description: String(detail.party.display_name),
    iconName: 'phone',
    content,
    submitLabel: 'إضافة',
    successMessage: 'تمت إضافة وسيلة التواصل',
    onSuccess: () => navigate(`/clients/${String(detail.party.id)}`, { replace: true }),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.value) { setFieldError(form, 'value', 'القيمة مطلوبة.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.clients.addContact(String(detail.party.id), values.typeCode ?? 'mobile', values.value, false);
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

