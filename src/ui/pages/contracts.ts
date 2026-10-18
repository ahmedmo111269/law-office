import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatMoney, formatRelative, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { definitionList, notice, pageHeader, tabPanel, tabs } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { openDialog } from '../components/dialog.ts';
import type { PageArgs } from '../app/context.ts';
import type { ContractRow, PoaRow } from '../services/contracts.ts';
import { openFormDialog, setFieldError, statusTone } from './shared.ts';

export function renderContracts(context: PageArgs): HTMLElement {
  const { workspace } = context;
  const lookups = workspace.lookups;
  const initial = context.query.get('tab') === 'poa' ? 'poa' : 'contracts';

  const contractColumns: Column<ContractRow>[] = [
    {
      key: 'number',
      label: 'رقم العقد',
      width: 150,
      defaultPinned: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'mono', dir: 'ltr', text: String(row.contract.contract_number) }),
      text: (row) => String(row.contract.contract_number),
    },
    {
      key: 'title',
      label: 'العنوان',
      width: 280,
      sortable: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('button', {
            class: 'cell-title cell-link',
            type: 'button',
            style: 'text-align:start;padding:0',
            text: String(row.contract.title),
            on: { click: () => openContractDetail(context, String(row.contract.id)) },
          }),
          h('span', { class: 'cell-sub', text: row.typeName }),
        ),
      text: (row) => String(row.contract.title),
    },
    {
      key: 'parties',
      label: 'الأطراف',
      width: 220,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.partyNames.length > 0 ? row.partyNames.join('، ') : '—' }),
      text: (row) => row.partyNames.join('، '),
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      cardRole: 'meta',
      render: (row) => {
        const item = lookups.byId(String(row.contract.status_id ?? ''));
        return h('span', { class: `badge badge--${statusTone(item?.code ?? '')}`, text: row.statusName });
      },
      text: (row) => row.statusName,
    },
    {
      key: 'signed',
      label: 'تاريخ التوقيع',
      width: 140,
      sortable: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'num', text: row.contract.signed_on ? formatDate(String(row.contract.signed_on), 'short') : '—' }),
      text: (row) => String(row.contract.signed_on ?? ''),
    },
    {
      key: 'value',
      label: 'القيمة',
      width: 130,
      align: 'end',
      numeric: true,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'num', text: row.contract.value_minor ? formatMoney(Number(row.contract.value_minor)) : '—' }),
      text: (row) => String(row.contract.value_minor ?? ''),
    },
  ];

  const contractTable = dataTable<ContractRow>(
    {
      id: 'contracts',
      title: 'العقود',
      columns: contractColumns,
      load: (request) => context.services.contracts.listContracts(request),
      rowKey: (row) => String(row.contract.id),
      searchPlaceholder: 'ابحث في عنوان العقد أو رقمه…',
      defaultSort: { key: 'signed', dir: 'desc' },
      filters: [{ key: 'status', label: 'كل الحالات', options: lookups.items('contract_status').map((item) => ({ value: item.code, label: item.nameAr })) }],
      actions: (row) => [
        h('button', { class: 'icon-btn icon-btn--sm', type: 'button', title: 'التفاصيل', attrs: { 'aria-label': 'تفاصيل العقد' }, on: { click: () => openContractDetail(context, String(row.contract.id)) } }, icon('eye', 16)),
      ],
      emptyTitle: 'لا عقود مسجلة',
      emptyText: 'سجّل عقود الأتعاب والاتفاقيات؛ التوكيلات لها تبويب مستقل.',
      emptyIcon: 'briefcase',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'عقد جديد', on: { click: () => openContractForm(context, () => void contractTable.reload()) } })],
    },
    workspace.preferences,
  );

  const poaColumns: Column<PoaRow>[] = [
    {
      key: 'number',
      label: 'رقم التوكيل',
      width: 160,
      defaultPinned: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'mono', dir: 'ltr', text: String(row.poa.poa_number) }),
      text: (row) => String(row.poa.poa_number),
    },
    {
      key: 'principal',
      label: 'الموكِّل',
      width: 190,
      sortable: true,
      cardRole: 'title',
      render: (row) => h('span', { class: 'cell-title', text: row.principalName ?? '—' }),
      text: (row) => row.principalName ?? '',
    },
    {
      key: 'agent',
      label: 'الموكَّل',
      width: 190,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.agentName ?? '—' }),
      text: (row) => row.agentName ?? '',
    },
    {
      key: 'kind',
      label: 'النوع',
      width: 130,
      defaultHidden: true,
      render: (row) => h('span', { class: 'text-2', text: row.kindName }),
      text: (row) => row.kindName,
    },
    {
      key: 'issued',
      label: 'تاريخ الإصدار',
      width: 140,
      sortable: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'num', text: row.poa.issued_on ? formatDate(String(row.poa.issued_on), 'short') : '—' }),
      text: (row) => String(row.poa.issued_on ?? ''),
    },
    {
      key: 'expires',
      label: 'الانتهاء',
      width: 140,
      cardRole: 'meta',
      render: (row) => {
        if (!row.poa.expires_on) return h('span', { class: 'text-3', text: 'غير محدد' });
        const expired = String(row.poa.expires_on) < isoDateToday();
        return h('span', { class: `num ${expired ? 'text-danger strong' : ''}`, text: formatDate(String(row.poa.expires_on), 'short') });
      },
      text: (row) => String(row.poa.expires_on ?? ''),
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      cardRole: 'meta',
      render: (row) => {
        const item = lookups.byId(String(row.poa.status_id ?? ''));
        return h('span', { class: `badge badge--${statusTone(item?.code ?? '')}`, text: row.statusName });
      },
      text: (row) => row.statusName,
    },
    {
      key: 'file',
      label: 'الملف',
      width: 130,
      cardRole: 'detail',
      render: (row) =>
        row.poa.file_id
          ? h('a', { class: 'cell-link mono', href: `#/files/${String(row.poa.file_id)}`, text: row.fileLabel ?? 'ملف' })
          : h('span', { class: 'text-3', text: '—' }),
      text: (row) => row.fileLabel ?? '',
    },
  ];

  const poaTable = dataTable<PoaRow>(
    {
      id: 'poa',
      title: 'التوكيلات',
      columns: poaColumns,
      load: (request) => context.services.contracts.listPoas(request),
      rowKey: (row) => String(row.poa.id),
      searchPlaceholder: 'ابحث برقم التوكيل أو اسم الموكِّل…',
      defaultSort: { key: 'issued', dir: 'desc' },
      filters: [{ key: 'status', label: 'كل الحالات', options: lookups.items('poa_status').map((item) => ({ value: item.code, label: item.nameAr })) }],
      actions: (row) => [
        h('button', { class: 'icon-btn icon-btn--sm', type: 'button', title: 'التفاصيل', attrs: { 'aria-label': 'تفاصيل التوكيل' }, on: { click: () => openPoaDetail(context, String(row.poa.id)) } }, icon('eye', 16)),
      ],
      emptyTitle: 'لا توكيلات مسجلة',
      emptyText: 'سجّل التوكيلات الرسمية واربطها بالموكِّل والموكَّل وتاريخ الانتهاء.',
      emptyIcon: 'stamp',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'توكيل جديد', on: { click: () => openPoaForm(context, () => void poaTable.reload()) } })],
    },
    workspace.preferences,
  );

  const header = pageHeader({
    title: 'العقود والتوكيلات',
    subtitle: 'العقود والاتفاقيات والتوكيلات الرسمية: الأطراف والمدة والحالة والملف المرتبط.',
    actions: [
      h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => openPoaForm(context, () => void poaTable.reload()) } },
        icon('stamp', 17), h('span', { text: 'توكيل جديد' })),
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openContractForm(context, () => void contractTable.reload()) } },
        icon('plus', 17), h('span', { text: 'عقد جديد' })),
    ],
  });

  const panels = {
    contracts: tabPanel('contracts', contractTable.root),
    poa: tabPanel('poa', poaTable.root),
  };
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== initial;
  const tabsHandle = tabs(
    [
      { id: 'contracts', label: 'العقود', iconName: 'briefcase' },
      { id: 'poa', label: 'التوكيلات', iconName: 'stamp' },
    ],
    initial,
    (id) => {
      for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
      tabsHandle.setActive(id);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/contracts${id === 'poa' ? '?tab=poa' : ''}`);
    },
  );

  return h(
    'div',
    { class: 'page' },
    header,
    notice('neutral', 'التوكيلات الرسمية تُصدَر من الشهر العقاري؛ هنا نسجّل بياناتها ومرجعها. البرنامج لا يدّعي إصدار توكيلات رسمية.', { iconName: 'info' }),
    tabsHandle.root,
    ...Object.values(panels),
  );
}

function openContractForm(context: PageArgs, onSaved?: () => void): void {
  const lookups = context.workspace.lookups;
  const title = textField({ label: 'عنوان العقد', name: 'title', required: true, maxlength: 200 });
  const type = selectField({ label: 'نوع العقد', name: 'contractTypeCode', options: lookups.items('contract_type').map((item) => ({ value: item.code, label: item.nameAr })), value: 'fixed_fee' });
  const status = selectField({ label: 'الحالة', name: 'statusCode', options: lookups.items('contract_status').map((item) => ({ value: item.code, label: item.nameAr })), value: 'active' });
  const signedOn = dateField({ label: 'تاريخ التوقيع', name: 'signedOn', value: isoDateToday() });
  const startOn = dateField({ label: 'تاريخ البداية', name: 'startOn' });
  const endOn = dateField({ label: 'تاريخ الانتهاء', name: 'endOn' });
  const value = textField({ label: 'قيمة العقد (جنيه)', name: 'value', dir: 'ltr', inputmode: 'decimal' });
  const partyPicker = entityPicker({
    name: 'partyId',
    label: 'الطرف الأول (اختياري)',
    placeholder: 'ابحث باسم الموكل…',
    search: (query) => context.services.clients.searchOptions(query, false, 8),
  });
  const filePicker = entityPicker({
    name: 'fileId',
    label: 'الملف (اختياري)',
    placeholder: 'ابحث برقم الملف…',
    search: (query) => context.services.files.searchOptions(query, 8),
  });
  const terms = textareaField({ label: 'ملخص البنود', name: 'terms', rows: 3, maxlength: 2000 });

  openFormDialog({
    title: 'عقد جديد',
    description: 'يُولَّد رقم العقد تلقائيًا من سلسلة الترقيم المعتمدة.',
    iconName: 'briefcase',
    size: 'lg',
    content: h(
      'div',
      { class: 'stack', style: 'gap:16px' },
      title,
      h('div', { class: 'form-grid' }, type, status),
      h('div', { class: 'form-grid' }, signedOn, value),
      h('div', { class: 'form-grid' }, startOn, endOn),
      h('div', { class: 'form-grid' }, partyPicker.root, filePicker.root),
      terms,
    ),
    submitLabel: 'حفظ العقد',
    successMessage: 'تم حفظ العقد',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.title) { setFieldError(form, 'title', 'عنوان العقد مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      const amountMinor = values.value ? Math.round(Number(values.value.replace(/,/g, '')) * 100) : undefined;
      if (amountMinor !== undefined && (!Number.isFinite(amountMinor) || amountMinor < 0)) {
        setFieldError(form, 'value', 'أدخل مبلغًا صحيحًا.');
        throw new Error('قيمة العقد غير صحيحة.');
      }
      await context.services.contracts.createContract({
        title: values.title,
        ...(values.contractTypeCode ? { contractTypeCode: values.contractTypeCode } : {}),
        ...(values.statusCode ? { statusCode: values.statusCode } : {}),
        ...(values.signedOn ? { signedOn: values.signedOn } : {}),
        ...(values.startOn ? { startOn: values.startOn } : {}),
        ...(values.endOn ? { endOn: values.endOn } : {}),
        ...(amountMinor !== undefined ? { valueMinor: amountMinor } : {}),
        ...(filePicker.getValue() ? { fileId: filePicker.getValue() } : {}),
        ...(values.terms ? { termsSummary: values.terms } : {}),
        ...(partyPicker.getValue()
          ? { partyIds: [{ partyId: partyPicker.getValue(), roleCode: 'client', isPrimary: true }] }
          : {}),
      });
    },
  });
}

function openPoaForm(context: PageArgs, onSaved?: () => void): void {
  const lookups = context.workspace.lookups;
  const principal = entityPicker({
    name: 'principal',
    label: 'الموكِّل',
    required: true,
    placeholder: 'ابحث باسم الموكِّل…',
    search: (query) => context.services.clients.searchOptions(query, false, 8),
  });
  const agent = entityPicker({
    name: 'agent',
    label: 'الموكَّل (المحامي)',
    required: true,
    placeholder: 'ابحث بالاسم…',
    search: (query) => context.services.clients.searchOptions(query, false, 8),
  });
  const kind = selectField({ label: 'نوع التوكيل', name: 'kindCode', options: lookups.items('instrument_kind').map((item) => ({ value: item.code, label: item.nameAr })), value: 'power_of_attorney' });
  const poaNumber = textField({ label: 'رقم التوكيل', name: 'poaNumber', maxlength: 60, dir: 'auto', help: 'اتركه فارغًا ليُولَّد تلقائيًا.' });
  const issuedOn = dateField({ label: 'تاريخ الإصدار', name: 'issuedOn', value: isoDateToday() });
  const expiresOn = dateField({ label: 'تاريخ الانتهاء', name: 'expiresOn' });
  const notary = textField({ label: 'الشهر العقاري / جهة التوثيق', name: 'notaryOffice', maxlength: 200 });
  const scope = textareaField({ label: 'نطاق التوكيل', name: 'scope', rows: 3, maxlength: 2000 });
  const status = selectField({ label: 'الحالة', name: 'statusCode', options: lookups.items('poa_status').map((item) => ({ value: item.code, label: item.nameAr })), value: 'active' });

  openFormDialog({
    title: 'توكيل جديد',
    description: 'تسجيل بيانات التوكيل الرسمي وربطه بالأطراف.',
    iconName: 'stamp',
    size: 'lg',
    content: h(
      'div',
      { class: 'stack', style: 'gap:16px' },
      h('div', { class: 'form-grid' }, principal.root, agent.root),
      h('div', { class: 'form-grid' }, kind, poaNumber),
      h('div', { class: 'form-grid' }, issuedOn, expiresOn),
      notary,
      scope,
      status,
    ),
    submitLabel: 'حفظ التوكيل',
    successMessage: 'تم حفظ التوكيل',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!principal.getValue() || !agent.getValue()) {
        throw new Error('حدد الموكِّل والموكَّل.');
      }
      if (values.expiresOn && values.issuedOn && values.expiresOn < values.issuedOn) {
        setFieldError(form, 'expiresOn', 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار.');
        throw new Error('تاريخ الانتهاء غير صحيح.');
      }
      await context.services.contracts.createPoa({
        principalPartyId: principal.getValue(),
        agentPartyId: agent.getValue(),
        ...(values.kindCode ? { kindCode: values.kindCode } : {}),
        ...(values.poaNumber ? { poaNumber: values.poaNumber } : {}),
        ...(values.issuedOn ? { issuedOn: values.issuedOn } : {}),
        ...(values.expiresOn ? { expiresOn: values.expiresOn } : {}),
        ...(values.notaryOffice ? { notaryOffice: values.notaryOffice } : {}),
        ...(values.scope ? { scopeText: values.scope } : {}),
        ...(values.statusCode ? { statusCode: values.statusCode } : {}),
      });
    },
  });
}

async function openContractDetail(context: PageArgs, contractId: string): Promise<void> {
  const detail = await context.services.contracts.getContract(contractId);
  if (!detail) return;
  const lookups = context.workspace.lookups;
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    definitionList([
      { label: 'العنوان', value: String(detail.contract.title) },
      { label: 'الرقم', value: h('span', { class: 'mono', dir: 'ltr', text: String(detail.contract.contract_number) }) },
      { label: 'النوع', value: lookups.byId(String(detail.contract.contract_type_id ?? ''))?.nameAr ?? '—' },
      { label: 'الحالة', value: lookups.byId(String(detail.contract.status_id ?? ''))?.nameAr ?? '—' },
      { label: 'التوقيع', value: detail.contract.signed_on ? formatDate(String(detail.contract.signed_on), 'medium') : '—' },
      { label: 'المدة', value: `${detail.contract.start_on ? formatDate(String(detail.contract.start_on), 'short') : '—'} ← ${detail.contract.end_on ? formatDate(String(detail.contract.end_on), 'short') : 'مفتوحة'}` },
      { label: 'القيمة', value: detail.contract.value_minor ? formatMoney(Number(detail.contract.value_minor)) : '—' },
      { label: 'البنود', value: String(detail.contract.terms_summary ?? '—') },
    ]),
    h(
      'div',
      { class: 'stack', style: 'gap:6px' },
      h('p', { class: 'panel-section__title', text: 'الأطراف' }),
      ...detail.parties.map((entry) =>
        h('a', { class: 'menu__item', href: `#/parties/${String(entry.party.id)}`, style: 'text-decoration:none' },
          icon('user', 16),
          h('span', { text: String(entry.party.display_name) }),
          h('span', { class: 'menu__shortcut', text: lookups.byId(String(entry.link.role_id ?? ''))?.nameAr ?? '' })),
      ),
      detail.parties.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا أطراف مسجلة على العقد.' }) : null,
    ),
    h(
      'div',
      { class: 'stack', style: 'gap:6px' },
      h('p', { class: 'panel-section__title', text: 'المستندات المرتبطة' }),
      ...detail.documents.map((document) =>
        h('a', { class: 'menu__item', href: `#/documents?focus=${String(document.id)}`, style: 'text-decoration:none' }, icon('document', 16), h('span', { text: String(document.title) })),
      ),
      detail.documents.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا مستندات مرتبطة.' }) : null,
    ),
  );
  const handle = openDialog({
    title: 'تفاصيل العقد',
    description: String(detail.contract.title),
    iconName: 'briefcase',
    size: 'lg',
    content,
    footer: h('div', { class: 'dialog__actions' }, h('button', { class: 'btn btn--primary', type: 'button', text: 'إغلاق', on: { click: () => handle.close() } })),
  });
}

async function openPoaDetail(context: PageArgs, poaId: string): Promise<void> {
  const detail = await context.services.contracts.getPoa(poaId);
  if (!detail) return;
  const lookups = context.workspace.lookups;
  const expired = detail.poa.expires_on ? String(detail.poa.expires_on) < isoDateToday() : false;
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    definitionList([
      { label: 'الرقم', value: h('span', { class: 'mono', dir: 'ltr', text: String(detail.poa.poa_number) }) },
      { label: 'الموكِّل', value: detail.principal ? String(detail.principal.display_name) : '—' },
      { label: 'الموكَّل', value: detail.agent ? String(detail.agent.display_name) : '—' },
      { label: 'النوع', value: lookups.byId(String(detail.poa.instrument_kind_id ?? ''))?.nameAr ?? '—' },
      { label: 'الإصدار', value: detail.poa.issued_on ? formatDate(String(detail.poa.issued_on), 'medium') : '—' },
      { label: 'الانتهاء', value: detail.poa.expires_on ? formatDate(String(detail.poa.expires_on), 'medium') : 'غير محدد' },
      { label: 'جهة التوثيق', value: String(detail.poa.notary_office ?? '—') },
      { label: 'النطاق', value: String(detail.poa.scope_text ?? '—') },
      { label: 'الحالة', value: lookups.byId(String(detail.poa.status_id ?? ''))?.nameAr ?? '—' },
      { label: 'آخر تحديث', value: formatRelative(String(detail.poa.updated_at)) },
    ]),
    expired ? notice('danger', 'تاريخ انتهاء التوكيل مضى. راجع صلاحيته قبل استخدامه في إجراء جديد.', { iconName: 'alert' }) : null,
  );
  const handle = openDialog({
    title: 'تفاصيل التوكيل',
    description: String(detail.poa.poa_number),
    iconName: 'stamp',
    size: 'md',
    content,
    footer: h('div', { class: 'dialog__actions' }, h('button', { class: 'btn btn--primary', type: 'button', text: 'إغلاق', on: { click: () => handle.close() } })),
  });
}

function readForm(form: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    if (control.name) values[control.name] = control.value.trim();
  }
  return values;
}

