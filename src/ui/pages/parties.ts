import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatMoney, formatNumber, formatRelative, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { definitionList, emptyState, notice, pageHeader, sectionCard, statCard } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { navigate } from '../app/router.ts';
import type { PageArgs } from '../app/context.ts';
import type { PartyDetail, PartyRow } from '../services/parties.ts';
import { lookupBadge, openFormDialog, setFieldError } from './shared.ts';

export async function renderParties(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;

  const columns: Column<PartyRow>[] = [
    {
      key: 'name',
      label: 'الاسم',
      width: 270,
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
            h('a', { class: 'cell-title cell-link', href: `#/parties/${String(row.party.id)}`, text: String(row.party.display_name) }),
            h('span', { class: 'cell-sub', text: [row.person ? 'شخص طبيعي' : 'شخص اعتباري', row.client ? 'عميل' : 'غير عميل'].join(' · ') }),
          ),
        ),
      text: (row) => String(row.party.display_name),
    },
    {
      key: 'kind',
      label: 'النوع',
      width: 110,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'badge badge--quiet', text: row.party.kind === 'organization' ? 'شركة' : 'شخص' }),
      text: (row) => String(row.party.kind),
    },
    {
      key: 'phone',
      label: 'الهاتف',
      width: 150,
      cardRole: 'meta',
      render: (row) => (row.phone ? h('span', { class: 'num', dir: 'ltr', text: row.phone }) : h('span', { class: 'text-3', text: '—' })),
      text: (row) => row.phone ?? '',
    },
    {
      key: 'client',
      label: 'عميل',
      width: 100,
      cardRole: 'meta',
      render: (row) => (row.client ? h('span', { class: 'badge badge--success', text: 'عميل' }) : h('span', { class: 'text-3', text: '—' })),
      text: (row) => (row.client ? 'عميل' : ''),
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 120,
      cardRole: 'detail',
      render: (row) => lookupBadge(lookups, 'party_status', String(row.party.status_id ?? '')),
      text: (row) => row.statusName,
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
  ];

  const header = pageHeader({
    title: 'الأطراف والخصوم',
    subtitle: 'سجل كل الأشخاص والشركات الذين يتعامل معهم المكتب: عملاء وخصوم وشهود وخبراء.',
    count: 0,
    actions: [
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openPartyForm(context) } },
        icon('plus', 17), h('span', { text: 'طرف جديد' })),
    ],
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<PartyRow>(
    {
      id: 'parties',
      title: 'الأطراف',
      columns,
      load: (request) => services.parties.list(request),
      rowKey: (row) => String(row.party.id),
      rowHref: (row) => `#/parties/${String(row.party.id)}`,
      searchPlaceholder: 'ابحث بالاسم أو الهاتف أو الرقم القومي…',
      filters: [
        { key: 'client', label: 'كل الأطراف', options: [{ value: 'clients', label: 'العملاء فقط' }, { value: 'non_clients', label: 'غير العملاء' }] },
        { key: 'kind', label: 'كل الأنواع', options: [{ value: 'person', label: 'أشخاص' }, { value: 'organization', label: 'شركات' }] },
        { key: 'status', label: 'كل الحالات', options: lookups.items('party_status').map((item) => ({ value: item.code, label: item.nameAr })) },
      ],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('a', { class: 'icon-btn icon-btn--sm', href: `#/parties/${String(row.party.id)}`, title: 'ملف الطرف', attrs: { 'aria-label': 'ملف الطرف' } }, icon('external', 16)),
      ],
      emptyTitle: 'لا أطراف مطابقة',
      emptyText: 'أضف طرفًا جديدًا أو غيّر التصفية. يمكن ربط الأطراف بالملفات والقضايا.',
      emptyIcon: 'user',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'طرف جديد', on: { click: () => openPartyForm(context) } })],
    },
    workspace.preferences,
  );

  const page = h('div', { class: 'page' }, header, table.root);
  if (context.query.get('new') === '1') {
    const presetName = context.query.get('name') ?? '';
    window.setTimeout(() => openPartyForm(context, undefined, () => void table.reload(), presetName), 80);
  }
  return page;
}

export function openPartyForm(
  context: PageArgs,
  existing?: PartyDetail,
  onSaved?: () => void,
  presetName = '',
): void {
  const lookups = context.workspace.lookups;
  let kind: 'person' | 'organization' = existing?.organization ? 'organization' : 'person';
  const isEdit = Boolean(existing);
  const parts = presetName.trim().split(/\s+/);

  const personFields = h(
    'div',
    { class: 'stack', style: 'gap:16px', hidden: kind === 'organization' ? 'hidden' : undefined },
    h(
      'div',
      { class: 'form-grid' },
      textField({ label: 'الاسم الأول', name: 'firstName', required: true, value: existing?.person ? String(existing.person.first_name) : parts[0] ?? '', maxlength: 80 }),
      textField({ label: 'اسم الأب', name: 'middleName', value: existing?.person ? String(existing.person.middle_name ?? '') : parts.length > 2 ? parts.slice(1, -1).join(' ') : '', maxlength: 80 }),
    ),
    textField({ label: 'اسم العائلة', name: 'lastName', required: true, value: existing?.person ? String(existing.person.last_name) : parts.length > 1 ? parts[parts.length - 1] ?? '' : '', maxlength: 80 }),
    textField({
      label: 'الرقم القومي',
      name: 'nationalId',
      dir: 'ltr',
      inputmode: 'numeric',
      maxlength: 14,
      value: existing?.person ? String(existing.person.national_id ?? '') : '',
      help: 'اختياري، ويُستخدم للتحقق من التكرار.',
    }),
  );
  const orgFields = h(
    'div',
    { class: 'stack', style: 'gap:16px', hidden: kind === 'person' ? 'hidden' : undefined },
    textField({ label: 'الاسم القانوني', name: 'legalName', required: true, value: existing?.organization ? String(existing.organization.legal_name) : presetName, maxlength: 200 }),
    h(
      'div',
      { class: 'form-grid' },
      selectField({ label: 'الشكل القانوني', name: 'legalFormCode', options: lookups.items('legal_form').map((item) => ({ value: item.code, label: item.nameAr })), value: existing?.organization ? lookups.byId(String(existing.organization.legal_form_id ?? ''))?.code ?? '' : '' }),
      textField({ label: 'السجل التجاري', name: 'commercialRegistryNo', dir: 'ltr', value: existing?.organization ? String(existing.organization.commercial_registry_no ?? '') : '' }),
    ),
    textField({ label: 'الرقم الضريبي', name: 'taxId', dir: 'ltr', value: existing?.organization ? String(existing.organization.tax_id ?? '') : '' }),
  );

  const kindSwitch = isEdit
    ? null
    : h(
        'div',
        { class: 'row-wrap', style: 'gap:8px' },
        ...(['person', 'organization'] as const).map((value) =>
          h('button', {
            class: `chip chip--button${value === kind ? ' chip--active' : ''}`,
            type: 'button',
            dataset: { kind: value },
            attrs: { 'aria-pressed': String(value === kind) },
            text: value === 'person' ? 'شخص طبيعي' : 'شخص اعتباري',
            on: {
              click: (event) => {
                kind = value;
                personFields.hidden = value !== 'person';
                orgFields.hidden = value !== 'organization';
                const group = (event.currentTarget as HTMLElement | null)?.parentElement;
                group?.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
                  const active = chip.dataset.kind === value;
                  chip.classList.toggle('chip--active', active);
                  chip.setAttribute('aria-pressed', String(active));
                });
              },
            },
          }),
        ),
      );

  const phone = textField({ label: 'الهاتف', name: 'phone', dir: 'ltr', maxlength: 20, value: existing?.contacts[0] ? String(existing.contacts[0].value) : '' });
  const status = selectField({
    label: 'حالة الطرف',
    name: 'statusCode',
    options: lookups.items('party_status').map((item) => ({ value: item.code, label: item.nameAr })),
    value: existing ? lookups.byId(String(existing.party.status_id ?? ''))?.code ?? 'active' : 'active',
  });
  const notes = textareaField({ label: 'ملاحظات', name: 'notes', rows: 2, maxlength: 1000, value: existing ? String(existing.party.notes ?? '') : '' });

  const form = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    kindSwitch,
    personFields,
    orgFields,
    h('div', { class: 'form-grid' }, phone, status),
    notes,
    isEdit ? null : notice('neutral', 'هذا السجل لطرف عام. لإضافته كعميل بكود وعقد وملفات، استخدم قسم العملاء.', { iconName: 'info' }),
  );

  openFormDialog({
    title: isEdit ? 'تعديل بيانات الطرف' : 'طرف جديد',
    description: isEdit ? String(existing?.party.display_name ?? '') : 'يمكن لاحقًا ربط الطرف بأي ملف أو قضية أو عقد.',
    iconName: 'user',
    size: 'lg',
    content: form,
    submitLabel: isEdit ? 'حفظ' : 'إضافة الطرف',
    successMessage: isEdit ? 'تم حفظ بيانات الطرف' : 'تمت إضافة الطرف',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (submitForm) => {
      const values = readForm(submitForm);
      if (kind === 'person') {
        if (!values.firstName || !values.lastName) {
          setFieldError(submitForm, values.firstName ? 'lastName' : 'firstName', 'الاسم الأول واسم العائلة مطلوبان.');
          throw new Error('راجع الحقول المطلوبة.');
        }
      } else if (!values.legalName) {
        setFieldError(submitForm, 'legalName', 'الاسم القانوني مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      if (isEdit && existing) {
        await context.services.deps.db.update('party', String(existing.party.id), {
          ...(values.notes !== undefined ? { notes: values.notes || null } : {}),
          ...(values.statusCode ? { status_id: context.workspace.lookups.id('party_status', values.statusCode) } : {}),
        });
        if (existing.person) {
          await context.services.deps.db.update('person', String(existing.person.id), {
            first_name: values.firstName ?? String(existing.person.first_name),
            middle_name: values.middleName || null,
            last_name: values.lastName ?? String(existing.person.last_name),
          });
        }
        if (existing.organization) {
          await context.services.deps.db.update('organization', String(existing.organization.id), {
            legal_name: values.legalName ?? String(existing.organization.legal_name),
            trade_name: values.tradeName || null,
            commercial_registry_no: values.commercialRegistryNo || null,
            tax_id: values.taxId || null,
          });
        }
      } else {
        await context.services.parties.create({
          kind,
          ...(kind === 'person'
            ? { firstName: values.firstName ?? '', ...(values.middleName ? { middleName: values.middleName } : {}), lastName: values.lastName ?? '' }
            : { legalName: values.legalName ?? '', ...(values.legalFormCode ? { legalFormCode: values.legalFormCode } : {}) }),
          ...(values.nationalId ? { nationalId: values.nationalId } : {}),
          ...(values.taxId ? { taxId: values.taxId } : {}),
          ...(values.commercialRegistryNo ? { commercialRegistryNo: values.commercialRegistryNo } : {}),
          ...(values.phone ? { phone: values.phone } : {}),
          ...(values.statusCode ? { statusCode: values.statusCode } : {}),
          ...(values.notes ? { notes: values.notes } : {}),
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
export async function renderPartyDetail(context: PageArgs): Promise<HTMLElement> {
  const partyId = context.params.id ?? '';
  const detail = await context.services.parties.get(partyId);
  if (!detail) {
    return h('div', { class: 'page' }, emptyState({
      iconName: 'user',
      title: 'الطرف غير موجود',
      text: 'قد يكون محذوفًا أو أن الرابط غير صحيح.',
      actions: [h('a', { class: 'btn btn--primary', href: '#/parties', text: 'العودة إلى الأطراف' })],
    }));
  }
  const lookups = context.workspace.lookups;
  const name = String(detail.party.display_name);

  const page = h(
    'div',
    { class: 'page' },
    pageHeader({
      title: name,
      breadcrumb: [{ label: 'الأطراف', href: '#/parties' }, { label: detail.person ? 'شخص طبيعي' : 'شخص اعتباري' }],
      meta: [
        h('span', { class: 'chip', text: detail.person ? 'شخص طبيعي' : 'شخص اعتباري' }),
        lookupBadge(lookups, 'party_status', String(detail.party.status_id ?? '')),
        detail.client ? h('span', { class: 'chip chip--active', text: `عميل — ${String(detail.client.client_code)}` }) : h('span', { class: 'chip', text: 'غير مسجل كعميل' }),
        detail.aliases.length > 0 ? h('span', { class: 'chip', text: `${formatNumber(detail.aliases.length)} اسم بديل` }) : null,
      ].filter(Boolean) as (HTMLElement)[],
      actions: [
        h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => openPartyForm(context, detail, () => navigate(`/parties/${partyId}`, { replace: true })) } },
          icon('edit', 17), h('span', { text: 'تعديل' })),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openInteractionForm(context, detail, () => navigate(`/parties/${partyId}`, { replace: true })) } },
          icon('plus', 17), h('span', { text: 'تسجيل تواصل' })),
      ],
    }),
    h(
      'div',
      { class: 'grid-4' },
      statCard({ label: 'الملفات', value: formatNumber(detail.files.length), iconName: 'folder' }),
      statCard({ label: 'القضايا', value: formatNumber(detail.cases.length), iconName: 'scale' }),
      statCard({ label: 'تفاصيل التواصل', value: formatNumber(detail.interactions.length), iconName: 'phone' }),
      statCard({ label: 'مستحقات', value: detail.client ? formatMoney(detail.outstandingMinor) : '—', iconName: 'wallet', small: true, tone: detail.outstandingMinor > 0 ? 'warning' : 'default' }),
    ),
    h(
      'div',
      { class: 'detail-layout' },
      h(
        'div',
        { class: 'detail-main' },
        sectionCard({
          title: 'البيانات الأساسية',
          body: definitionList([
            ...(detail.person
              ? [
                  { label: 'الاسم الكامل', value: [detail.person.first_name, detail.person.middle_name, detail.person.last_name].filter(Boolean).join(' ') },
                  { label: 'الرقم القومي', value: detail.person.national_id ? h('span', { class: 'mono', dir: 'ltr', text: String(detail.person.national_id) }) : '—' },
                  { label: 'المهنة', value: String(detail.person.occupation ?? '—') },
                ]
              : []),
            ...(detail.organization
              ? [
                  { label: 'الاسم القانوني', value: String(detail.organization.legal_name) },
                  { label: 'السجل التجاري', value: String(detail.organization.commercial_registry_no ?? '—') },
                  { label: 'الرقم الضريبي', value: String(detail.organization.tax_id ?? '—') },
                ]
              : []),
            { label: 'وسائل التواصل', value: detail.contacts.length > 0 ? detail.contacts.map((contact) => String(contact.value)).join(' · ') : '—' },
            { label: 'العناوين', value: detail.addresses.length > 0 ? detail.addresses.map((address) => String(address.line1 ?? '')).join(' · ') : '—' },
            { label: 'ملاحظات', value: String(detail.party.notes ?? '—') },
            { label: 'أُضيف', value: formatDate(String(detail.party.created_at), 'medium') },
          ]),
        }),
        sectionCard({
          title: 'الملفات والقضايا',
          body: h(
            'div',
            { class: 'stack', style: 'gap:8px' },
            ...detail.files.map((entry) =>
              h(
                'a',
                { class: 'menu__item', href: `#/files/${String(entry.file.id)}`, style: 'text-decoration:none' },
                icon('folder', 16),
                h('span', { text: String(entry.file.title) }),
                h('span', { class: 'menu__shortcut', text: entry.roleName }),
              ),
            ),
            ...detail.cases.map((legalCase) =>
              h(
                'a',
                { class: 'menu__item', href: `#/cases/${String(legalCase.id)}`, style: 'text-decoration:none' },
                icon('scale', 16),
                h('span', { text: `قضية ${String(legalCase.case_number)} / ${String(legalCase.case_year)}` }),
              ),
            ),
            detail.files.length === 0 && detail.cases.length === 0
              ? h('p', { class: 'text-sm text-3', text: 'لا ملفات أو قضايا مرتبطة بهذا الطرف.' })
              : null,
          ),
        }),
        sectionCard({
          title: 'سجل التواصل',
          actions: [h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'إضافة', on: { click: () => openInteractionForm(context, detail, () => navigate(`/parties/${partyId}`, { replace: true })) } })],
          bodyClass: 'card__body--tight',
          body:
            detail.interactions.length === 0
              ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا تفاصيل تواصل مسجلة.' })
              : h(
                  'div',
                  { class: 'timeline', style: 'padding:8px' },
                  ...detail.interactions.map((interaction) =>
                    h(
                      'div',
                      { class: 'timeline__item' },
                      h('span', { class: 'timeline__dot' }, icon(String(interaction.channel_id) ? 'phone' : 'info', 13)),
                      h(
                        'div',
                        { class: 'timeline__body' },
                        h('p', { class: 'timeline__title', text: String(interaction.summary) }),
                        interaction.details ? h('p', { class: 'text-sm text-2', text: String(interaction.details) }) : null,
                        h('p', { class: 'timeline__meta', text: `${formatDate(String(interaction.occurred_at), 'medium')} · ${formatRelative(String(interaction.occurred_at))}` }),
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
          title: 'وسائل التواصل',
          body: h(
            'div',
            { class: 'stack', style: 'gap:6px' },
            ...detail.contacts.map((contact) =>
              h('p', { class: 'text-sm', dir: 'ltr', text: String(contact.value) }),
            ),
            detail.contacts.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا وسائل مسجلة.' }) : null,
          ),
        }),
        sectionCard({
          title: 'الأسماء البديلة',
          body: h(
            'div',
            { class: 'stack', style: 'gap:6px' },
            ...detail.aliases.map((alias) => h('p', { class: 'text-sm', text: String(alias.alias) })),
            detail.aliases.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا أسماء بديلة.' }) : null,
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'إضافة اسم بديل', on: { click: () => openAliasForm(context, detail, () => navigate(`/parties/${partyId}`, { replace: true })) } }),
          ),
        }),
        sectionCard({
          title: 'العلاقات',
          body: h(
            'div',
            { class: 'stack', style: 'gap:6px' },
            ...detail.relationships.map((entry) =>
              entry.other
                ? h(
                    'a',
                    { class: 'menu__item', href: `#/parties/${String(entry.other.id)}`, style: 'text-decoration:none' },
                    icon('link', 15),
                    h('span', { text: String(entry.other.display_name) }),
                    h('span', { class: 'menu__shortcut', text: lookups.byId(String(entry.relationship.relation_type_id ?? ''))?.nameAr ?? '' }),
                  )
                : null,
            ),
            detail.relationships.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا علاقات مسجلة.' }) : null,
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'إضافة علاقة', on: { click: () => openRelationshipForm(context, detail, () => navigate(`/parties/${partyId}`, { replace: true })) } }),
          ),
        }),
      ),
    ),
  );
  return page;
}

function openInteractionForm(context: PageArgs, detail: PartyDetail, onSaved: () => void): void {
  const lookups = context.workspace.lookups;
  const channel = selectField({ label: 'وسيلة التواصل', name: 'channelCode', options: lookups.items('interaction_channel').map((item) => ({ value: item.code, label: item.nameAr })), value: 'phone' });
  const direction = selectField({ label: 'الاتجاه', name: 'direction', options: [{ value: 'outbound', label: 'صادر من المكتب' }, { value: 'inbound', label: 'وارد إلى المكتب' }], value: 'outbound' });
  const summary = textField({ label: 'ملخص التواصل', name: 'summary', required: true, maxlength: 200 });
  const details = textareaField({ label: 'التفاصيل', name: 'details', rows: 3, maxlength: 2000 });
  const occurredAt = dateField({ label: 'التاريخ', name: 'occurredAt', value: isoDateToday() });
  const followUp = dateField({ label: 'موعد المتابعة', name: 'followUpAt' });
  openFormDialog({
    title: 'تسجيل تواصل',
    description: String(detail.party.display_name),
    iconName: 'phone',
    content: h('div', { class: 'stack', style: 'gap:16px' }, h('div', { class: 'form-grid' }, channel, direction), summary, details, h('div', { class: 'form-grid' }, occurredAt, followUp)),
    submitLabel: 'حفظ التواصل',
    successMessage: 'تم تسجيل التواصل',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.summary) { setFieldError(form, 'summary', 'الملخص مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.parties.addInteraction({
        partyId: String(detail.party.id),
        summary: values.summary,
        ...(values.details ? { details: values.details } : {}),
        ...(values.channelCode ? { channelCode: values.channelCode } : {}),
        ...(values.direction === 'inbound' ? { direction: 'inbound' as const } : { direction: 'outbound' as const }),
        ...(values.occurredAt ? { occurredAt: new Date(`${values.occurredAt}T12:00:00`).toISOString() } : {}),
        ...(values.followUpAt ? { followUpAt: new Date(`${values.followUpAt}T09:00:00`).toISOString() } : {}),
      });
    },
  });
}

function openAliasForm(context: PageArgs, detail: PartyDetail, onSaved: () => void): void {
  const alias = textField({ label: 'الاسم البديل', name: 'alias', required: true, maxlength: 200 });
  const notes = textField({ label: 'ملاحظات', name: 'notes', maxlength: 300 });
  openFormDialog({
    title: 'إضافة اسم بديل',
    description: 'يُستخدم للبحث عن الطرف باسم آخر ورد في مستند أو إعلان.',
    iconName: 'user',
    size: 'sm',
    content: h('div', { class: 'stack', style: 'gap:16px' }, alias, notes),
    submitLabel: 'إضافة',
    successMessage: 'تمت إضافة الاسم البديل',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.alias) { setFieldError(form, 'alias', 'الاسم البديل مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.parties.addAlias(String(detail.party.id), values.alias, values.notes);
    },
  });
}

function openRelationshipForm(context: PageArgs, detail: PartyDetail, onSaved: () => void): void {
  const lookups = context.workspace.lookups;
  const other = entityPicker({
    name: 'otherParty',
    label: 'الطرف الآخر',
    required: true,
    placeholder: 'ابحث بالاسم…',
    search: (query) => context.services.parties.searchOptions(query, 8),
  });
  const relation = selectField({ label: 'نوع العلاقة', name: 'relationCode', required: true, options: lookups.items('party_relation_type').map((item) => ({ value: item.code, label: item.nameAr })) });
  const description = textField({ label: 'وصف', name: 'description', maxlength: 300 });
  openFormDialog({
    title: 'إضافة علاقة',
    description: String(detail.party.display_name),
    iconName: 'link',
    content: h('div', { class: 'stack', style: 'gap:16px' }, other.root, relation, description),
    submitLabel: 'إضافة العلاقة',
    successMessage: 'تمت إضافة العلاقة',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!other.getValue()) throw new Error('اختر الطرف الآخر.');
      await context.services.parties.addRelationship({
        fromPartyId: String(detail.party.id),
        toPartyId: other.getValue(),
        relationTypeCode: values.relationCode ?? '',
        ...(values.description ? { description: values.description } : {}),
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

