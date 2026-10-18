import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatMoney, formatNumber, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { emptyState, notice, pageHeader, sectionCard, statCard, tabPanel, tabs } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { confirmDialog } from '../components/dialog.ts';
import { toastError, toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import type { PageArgs } from '../app/context.ts';
import type { AccountRow, ChargeRow, TransactionRow } from '../services/finance.ts';
import { openFormDialog, setFieldError, statusTone } from './shared.ts';

type TabId = 'overview' | 'charges' | 'transactions' | 'accounts';

export async function renderFinance(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;
  const initial = (context.query.get('tab') as TabId | null) ?? 'overview';
  const accounts = await services.finance.accounts();
  const overview = await services.finance.overview();

  const chargeColumns: Column<ChargeRow>[] = [
    {
      key: 'description',
      label: 'البيان',
      width: 260,
      defaultPinned: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('span', { class: 'cell-title', text: String(row.charge.description) }),
          h('span', { class: 'cell-sub', text: [row.clientName, row.fileLabel].filter(Boolean).join(' · ') }),
        ),
      text: (row) => String(row.charge.description),
    },
    {
      key: 'client',
      label: 'العميل',
      width: 180,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.clientName }),
      text: (row) => row.clientName,
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
      key: 'amount',
      label: 'القيمة',
      width: 130,
      align: 'end',
      numeric: true,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'num', text: formatMoney(row.amountMinor) }),
      text: (row) => String(row.amountMinor),
    },
    {
      key: 'paid',
      label: 'المسدد',
      width: 130,
      align: 'end',
      numeric: true,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'num text-success', text: formatMoney(row.paidMinor) }),
      text: (row) => String(row.paidMinor),
    },
    {
      key: 'outstanding',
      label: 'المتبقي',
      width: 130,
      align: 'end',
      numeric: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: `num strong ${row.outstandingMinor > 0 ? 'text-warning' : 'text-3'}`, text: formatMoney(row.outstandingMinor) }),
      text: (row) => String(row.outstandingMinor),
    },
    {
      key: 'issued',
      label: 'تاريخ الاستحقاق',
      width: 140,
      sortable: true,
      cardRole: 'meta',
      render: (row) => {
        const due = row.charge.due_on ? String(row.charge.due_on) : null;
        const overdue = due && due < isoDateToday() && row.outstandingMinor > 0;
        return h('span', { class: `num ${overdue ? 'text-danger strong' : ''}`, text: due ? formatDate(due, 'short') : '—' });
      },
      text: (row) => String(row.charge.due_on ?? ''),
    },
  ];

  const chargeTable = dataTable<ChargeRow>(
    {
      id: 'finance.charges',
      title: 'المستحقات',
      columns: chargeColumns,
      load: (request) => services.finance.listCharges(request),
      rowKey: (row) => String(row.charge.id),
      searchPlaceholder: 'ابحث في بيان المستحق أو اسم العميل…',
      defaultSort: { key: 'issued', dir: 'desc' },
      filters: [{ key: 'status', label: 'كل الحالات', options: lookups.items('charge_status').map((item) => ({ value: item.code, label: item.nameAr })) }],
      actions: (row) => [
        row.outstandingMinor > 0
          ? h('button', {
              class: 'btn btn--secondary btn--sm',
              type: 'button',
              text: 'تحصيل',
              on: { click: () => openPaymentDialog(context, accounts, { charge: row }) },
            })
          : h('span', { class: 'badge badge--success', text: 'مسدد' }),
      ],
      emptyTitle: 'لا مستحقات مسجلة',
      emptyText: 'سجّل الأتعاب أو المصاريف المستحقة على العميل لتتابع التحصيل.',
      emptyIcon: 'wallet',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'مستحق جديد', on: { click: () => openChargeDialog(context, () => void chargeTable.reload()) } })],
    },
    workspace.preferences,
  );

  const transactionColumns: Column<TransactionRow>[] = [
    {
      key: 'date',
      label: 'التاريخ',
      width: 130,
      defaultPinned: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: 'num', text: formatDate(String(row.transaction.occurred_at), 'short') }),
      text: (row) => String(row.transaction.occurred_at),
    },
    {
      key: 'description',
      label: 'البيان',
      width: 260,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('span', { class: 'cell-title', text: String(row.transaction.description ?? (String(row.transaction.direction) === 'in' ? 'تحصيل' : 'مصروف')) }),
          h('span', { class: 'cell-sub', text: [row.clientName, row.fileLabel, row.accountName].filter(Boolean).join(' · ') }),
        ),
      text: (row) => String(row.transaction.description ?? ''),
    },
    {
      key: 'direction',
      label: 'النوع',
      width: 100,
      cardRole: 'meta',
      render: (row) => h('span', { class: `badge badge--${String(row.transaction.direction) === 'in' ? 'success' : 'warning'}`, text: String(row.transaction.direction) === 'in' ? 'تحصيل' : 'مصروف' }),
      text: (row) => (String(row.transaction.direction) === 'in' ? 'تحصيل' : 'مصروف'),
    },
    {
      key: 'amount',
      label: 'المبلغ',
      width: 140,
      align: 'end',
      numeric: true,
      cardRole: 'meta',
      render: (row) => h('span', { class: `num strong ${String(row.transaction.direction) === 'in' ? 'text-success' : 'text-danger'}`, text: formatMoney(Number(row.transaction.amount_minor)) }),
      text: (row) => String(row.transaction.amount_minor),
    },
    {
      key: 'allocated',
      label: 'المخصص',
      width: 140,
      align: 'end',
      numeric: true,
      defaultHidden: true,
      render: (row) => h('span', { class: 'num', text: formatMoney(row.allocatedMinor) }),
      text: (row) => String(row.allocatedMinor),
    },
    {
      key: 'method',
      label: 'طريقة الدفع',
      width: 130,
      cardRole: 'detail',
      render: (row) => h('span', { class: 'text-2', text: row.methodName }),
      text: (row) => row.methodName,
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 110,
      cardRole: 'meta',
      render: (row) =>
        h('span', { class: `badge badge--${row.reversed ? 'quiet' : 'success'}`, text: row.reversed ? 'ملغاة' : 'مرحّلة' }),
      text: (row) => (row.reversed ? 'ملغاة' : 'مرحّلة'),
    },
  ];

  const transactionTable = dataTable<TransactionRow>(
    {
      id: 'finance.transactions',
      title: 'الحركات المالية',
      columns: transactionColumns,
      load: (request) => services.finance.listTransactions(request),
      rowKey: (row) => String(row.transaction.id),
      searchPlaceholder: 'ابحث في بيان الحركة…',
      defaultSort: { key: 'date', dir: 'desc' },
      filters: [{ key: 'status', label: 'المرحّلة فقط', options: [{ value: 'posted', label: 'مرحّلة' }, { value: 'reversed', label: 'ملغاة' }] }],
      actions: (row) => [
        !row.reversed && !row.reversalOf
          ? h('button', {
              class: 'icon-btn icon-btn--sm',
              type: 'button',
              title: 'إلغاء الحركة',
              attrs: { 'aria-label': 'إلغاء الحركة المالية' },
              on: {
                click: () => confirmDialog({
                  title: 'إلغاء الحركة المالية',
                  message: 'سيُسجَّل قيد عكسي مرتبط بالحركة الأصلية. لا يُحذف أي سجل مالي.',
                  confirmLabel: 'إلغاء الحركة',
                  danger: true,
                  onConfirm: async () => {
                    try {
                      await services.finance.reverse(String(row.transaction.id), 'إلغاء من واجهة المالية');
                      toastSuccess('تم تسجيل القيد العكسي');
                      await transactionTable.reload();
                    } catch (error) {
                      const ui = toUiError(error);
                      toastError(ui.message, ui.detail);
                    }
                  },
                }),
              },
            }, icon('restore', 16))
          : h('span', { class: 'text-3 text-xs', text: row.reversalOf ? 'قيد عكسي' : '—' }),
      ],
      emptyTitle: 'لا حركات مالية',
      emptyText: 'سجّل أول تحصيل من عميل؛ يمكن تخصيصه على مستحقاته مباشرة.',
      emptyIcon: 'wallet',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'تسجيل تحصيل', on: { click: () => openPaymentDialog(context, accounts) } })],
      toolbar: [
        h('button', { class: 'btn btn--outline btn--sm', type: 'button', on: { click: () => openPaymentDialog(context, accounts) } }, icon('download', 15), h('span', { text: 'تحصيل' })),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => openExpenseDialog(context, accounts) } }, icon('upload', 15), h('span', { text: 'مصروف' })),
      ],
    },
    workspace.preferences,
  );

  const overviewPanel = tabPanel('overview', h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'grid-4' },
      statCard({ label: 'غير محصّل', value: formatMoney(overview.outstandingMinor), iconName: 'wallet', tone: 'warning', small: true, meta: `${formatNumber(overview.chargesCount)} مستحق` }),
      statCard({ label: 'تحصيلات الشهر', value: formatMoney(overview.receivedThisMonthMinor), iconName: 'download', tone: 'success', small: true, meta: formatDate(new Date().toISOString(), 'medium') }),
      statCard({ label: 'مصروفات الشهر', value: formatMoney(overview.expensesThisMonthMinor), iconName: 'upload', tone: 'danger', small: true }),
      statCard({ label: 'أرصدة الحسابات', value: formatMoney(overview.totalBalanceMinor), iconName: 'database', small: true, meta: `${formatNumber(overview.accounts.length)} حساب` }),
    ),
    h(
      'div',
      { class: 'grid-2' },
      sectionCard({
        title: 'أرصدة الحسابات',
        subtitle: 'الرصيد يُحسب من الحركات المرحّلة فعليًا.',
        actions: [h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'حساب جديد', on: { click: () => openAccountDialog(context) } })],
        bodyClass: 'card__body--tight',
        body:
          overview.accounts.length === 0
            ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا حسابات مالية مسجلة بعد.' })
            : h(
                'div',
                { class: 'record-list' },
                ...overview.accounts.map((account) =>
                  h(
                    'div',
                    { class: 'attention-item' },
                    h('span', { class: 'attention-item__icon' }, icon('wallet', 16)),
                    h(
                      'span',
                      { class: 'attention-item__body' },
                      h('span', { class: 'attention-item__title', text: String(account.account.name) }),
                      h('span', { class: 'attention-item__desc', text: account.kindName }),
                    ),
                    h('span', { class: 'num strong', text: formatMoney(account.balanceMinor) }),
                  ),
                ),
              ),
      }),
      sectionCard({
        title: 'تحتاج متابعة',
        body: h(
          'div',
          { class: 'stack', style: 'gap:10px' },
          h(
            'div',
            { class: 'row', style: 'justify-content:space-between' },
            h('span', { class: 'text-sm', text: 'مدفوعات غير مخصصة' }),
            h('span', { class: `num strong ${overview.unallocatedMinor > 0 ? 'text-warning' : 'text-success'}`, text: formatMoney(overview.unallocatedMinor) }),
          ),
          h(
            'div',
            { class: 'row', style: 'justify-content:space-between' },
            h('span', { class: 'text-sm', text: 'مستحقات تجاوزت موعدها' }),
            h('span', { class: 'num strong text-danger', text: formatMoney(overview.overdueMinor) }),
          ),
          h('hr', { class: 'divider' }),
          h('p', { class: 'text-xs text-3', text: 'المدفوعات غير المخصصة لا تخفض رصيد أي مستحق حتى تُخصَّص له. استخدم زر «تحصيل» بجانب المستحق لتخصيص الدفعة.' }),
          overview.unallocatedMinor > 0
            ? h('button', { class: 'btn btn--outline btn--sm', type: 'button', text: 'مراجعة الحركات غير المخصصة', on: { click: () => navigateToTab('transactions') } })
            : notice('success', 'كل المدفوعات مخصصة لمستحقاتها.', { iconName: 'check' }),
        ),
      }),
    ),
  ));

  const accountsPanel = tabPanel('accounts', h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title' }, icon('wallet', 18), h('span', { text: 'الحسابات المالية' })),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', on: { click: () => openAccountDialog(context) } }, icon('plus', 15), h('span', { text: 'حساب جديد' })),
    ),
    accounts.length === 0
      ? emptyState({ iconName: 'wallet', title: 'لا حسابات مالية', text: 'أنشئ حسابًا نقديًا أو بنكيًا لتسجيل التحصيلات والمصروفات.', actions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'إنشاء حساب', on: { click: () => openAccountDialog(context) } })] })
      : h(
          'div',
          { class: 'grid-auto' },
          ...accounts.map((account) =>
            sectionCard({
              title: String(account.account.name),
              subtitle: account.kindName,
              body: h(
                'div',
                { class: 'stack', style: 'gap:8px' },
                h('p', { class: 'stat__value stat__value--sm num', text: formatMoney(account.balanceMinor) }),
                h('p', { class: 'text-xs text-3', text: account.account.currency_code ? `العملة: ${String(account.account.currency_code)}` : 'EGP' }),
                h('a', { class: 'section-link', href: `#/finance?tab=transactions`, text: 'عرض الحركات' }),
              ),
            }),
          ),
        ),
    notice('neutral', 'الأرصدة مشتقة من القيود، ولا تُعدَّل يدويًا. التصحيح يكون بقيد عكسي مسجّل.', { iconName: 'info' }),
  ));

  const panels: Record<TabId, HTMLElement> = {
    overview: overviewPanel,
    charges: tabPanel('charges', chargeTable.root),
    transactions: tabPanel('transactions', transactionTable.root),
    accounts: accountsPanel,
  };
  const active: TabId = panels[initial] ? initial : 'overview';
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== active;
  const tabsHandle = tabs(
    [
      { id: 'overview', label: 'نظرة عامة', iconName: 'dashboard' },
      { id: 'charges', label: 'المستحقات', iconName: 'wallet' },
      { id: 'transactions', label: 'الحركات', iconName: 'reports' },
      { id: 'accounts', label: 'الحسابات', iconName: 'database' },
    ],
    active,
    (id) => {
      for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
      tabsHandle.setActive(id);
      navigateToTab(id as TabId);
    },
  );

  const page = h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'المالية',
      subtitle: 'الأتعاب والمستحقات والتحصيلات والمصروفات. كل مبلغ يُحفظ بالقروش (عدد صحيح) لتفادي أخطاء الكسور.',
      actions: [
        h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => openExpenseDialog(context, accounts) } }, icon('upload', 17), h('span', { text: 'مصروف' })),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openPaymentDialog(context, accounts) } }, icon('download', 17), h('span', { text: 'تسجيل تحصيل' })),
      ],
    }),
    tabsHandle.root,
    ...Object.values(panels),
  );

  if (context.query.get('new') === '1' && (initial === 'charges' || initial === 'overview')) {
    window.setTimeout(() => openChargeDialog(context, () => void chargeTable.reload()), 80);
  }
  if (context.query.get('new') === '1' && initial === 'transactions') {
    window.setTimeout(() => openPaymentDialog(context, accounts), 80);
  }
  return page;
}

function navigateToTab(tab: TabId): void {
  const path = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', `${path}#/finance${tab === 'overview' ? '' : `?tab=${tab}`}`);
}

// ---------------------------------------------------------------------------
export function openPaymentDialog(
  context: PageArgs,
  accounts: AccountRow[],
  preset?: { charge?: ChargeRow; clientId?: string },
): void {
  if (accounts.length === 0) {
    toastError('لا يوجد حساب مالي', 'أنشئ حسابًا نقديًا أو بنكيًا أولًا من تبويب الحسابات.');
    return;
  }
  const lookups = context.workspace.lookups;
  const accountSelect = selectField({
    label: 'الحساب',
    name: 'accountId',
    required: true,
    options: accounts.map((account) => ({ value: String(account.account.id), label: `${String(account.account.name)} (${formatMoney(account.balanceMinor)})` })),
  });
  const amount = textField({
    label: 'المبلغ المحصّل (جنيه)',
    name: 'amount',
    required: true,
    dir: 'ltr',
    inputmode: 'decimal',
    value: preset?.charge ? (preset.charge.outstandingMinor / 100).toFixed(2) : '',
  });
  const method = selectField({ label: 'طريقة الدفع', name: 'methodCode', options: lookups.items('payment_method').map((item) => ({ value: item.code, label: item.nameAr })), value: 'cash' });
  const occurredAt = dateField({ label: 'تاريخ التحصيل', name: 'occurredAt', required: true, value: isoDateToday() });
  const description = textField({ label: 'البيان', name: 'description', maxlength: 300, placeholder: 'مثال: دفعة أتعاب المرافعة' });
  const clientPicker = entityPicker({
    name: 'clientId',
    label: 'العميل',
    placeholder: 'ابحث بالاسم…',
    search: (query) => context.services.clients.searchOptions(query, false, 8),
  });
  const allocationHost = h('div', { class: 'stack', style: 'gap:8px' });
  const allocationState: Array<{ chargeId: string; description: string; outstandingMinor: number; input: HTMLInputElement }> = [];

  const loadAllocations = async (): Promise<void> => {
    allocationHost.replaceChildren(h('p', { class: 'text-sm text-3', text: 'جارٍ تحميل المستحقات…' }));
    allocationState.length = 0;
    const clientId = clientPicker.getValue() || (preset?.charge ? String(preset.charge.charge.client_party_id) : '');
    const charges = await context.services.finance.outstandingCharges(clientId || undefined);
    allocationHost.replaceChildren();
    if (charges.length === 0) {
      allocationHost.appendChild(h('p', { class: 'text-sm text-3', text: 'لا مستحقات قائمة لهذا العميل. يمكن حفظ الدفعة كرصيد غير مخصص.' }));
      return;
    }
    let remaining = Math.round(Number(amount.querySelector('input')?.value ?? 0) * 100);
    for (const charge of charges.slice(0, 20)) {
      const auto = Math.min(remaining, charge.outstandingMinor);
      remaining -= auto;
      const input = h('input', {
        class: 'input',
        type: 'text',
        inputmode: 'decimal',
        dir: 'ltr',
        value: (auto / 100).toFixed(2),
        attrs: { 'aria-label': `تخصيص للمستحق ${String(charge.charge.description)}` },
        style: 'max-inline-size:120px',
      });
      allocationState.push({ chargeId: String(charge.charge.id), description: String(charge.charge.description), outstandingMinor: charge.outstandingMinor, input });
      allocationHost.appendChild(
        h(
          'div',
          { class: 'row', style: 'gap:8px;justify-content:space-between;flex-wrap:wrap' },
          h(
            'div',
            { style: 'flex:1;min-inline-size:140px' },
            h('p', { class: 'text-sm strong', text: String(charge.charge.description) }),
            h('p', { class: 'text-xs text-3', text: `المتبقي ${formatMoney(charge.outstandingMinor)}` }),
          ),
          input,
        ),
      );
    }
  };

  clientPicker.input.addEventListener('change', () => void loadAllocations());
  amount.querySelector('input')?.addEventListener('change', () => void loadAllocations());

  const form = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h('div', { class: 'form-grid' }, accountSelect, amount),
    h('div', { class: 'form-grid' }, method, occurredAt),
    description,
    clientPicker.root,
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'card__head', style: 'padding:12px' },
        h('div', null, h('p', { class: 'card__title', text: 'تخصيص الدفعة على المستحقات' }), h('p', { class: 'card__subtitle', text: 'التوزيع الافتراضي: الأقدم استحقاقًا أولًا. عدّل المبالغ كما تريد.' })),
      ),
      h('div', { class: 'card__body', style: 'padding:12px' }, allocationHost),
    ),
  );

  if (preset?.charge) {
    clientPicker.setValue({ value: String(preset.charge.charge.client_party_id), label: preset.charge.clientName });
  }
  void loadAllocations();

  openFormDialog({
    title: 'تسجيل تحصيل',
    description: 'تُحفظ الحركة وتخصيصاتها في معاملة واحدة؛ إذا فشل التخصيص لا تُحفظ الحركة.',
    iconName: 'download',
    size: 'lg',
    content: form,
    submitLabel: 'حفظ التحصيل',
    successMessage: 'تم تسجيل التحصيل وتخصيصه',
    onSuccess: () => {
      if (window.location.hash.startsWith('#/finance')) navigateToTab('transactions');
      else window.location.reload();
    },
    onSubmit: async (formElement) => {
      const values = readForm(formElement);
      const amountMinor = Math.round(Number(values.amount?.replace(/,/g, '') ?? 0) * 100);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        setFieldError(formElement, 'amount', 'أدخل مبلغًا أكبر من صفر.');
        throw new Error('المبلغ غير صحيح.');
      }
      const allocations = allocationState
        .map((entry) => ({
          chargeId: entry.chargeId,
          amountMinor: Math.round(Number(entry.input.value.replace(/,/g, '')) * 100),
        }))
        .filter((entry) => Number.isFinite(entry.amountMinor) && entry.amountMinor > 0);
      const totalAllocated = allocations.reduce((sum, entry) => sum + entry.amountMinor, 0);
      if (totalAllocated > amountMinor) {
        throw new Error(`مجموع التخصيصات (${formatMoney(totalAllocated)}) أكبر من المبلغ المحصّل (${formatMoney(amountMinor)}).`);
      }
      const clientId = clientPicker.getValue();
      await context.services.finance.recordPayment({
        accountId: values.accountId ?? String(accounts[0]?.account.id),
        amountMinor,
        ...(clientId ? { clientPartyId: clientId } : {}),
        ...(values.methodCode ? { methodCode: values.methodCode } : {}),
        ...(values.occurredAt ? { occurredAt: new Date(`${values.occurredAt}T12:00:00`).toISOString() } : {}),
        ...(values.description ? { description: values.description } : {}),
        allocations,
      });
    },
  });
}

function openExpenseDialog(context: PageArgs, accounts: AccountRow[]): void {
  if (accounts.length === 0) {
    toastError('لا يوجد حساب مالي', 'أنشئ حسابًا أولًا.');
    return;
  }
  const lookups = context.workspace.lookups;
  const account = selectField({ label: 'الحساب', name: 'accountId', required: true, options: accounts.map((row) => ({ value: String(row.account.id), label: String(row.account.name) })) });
  const amount = textField({ label: 'المبلغ (جنيه)', name: 'amount', required: true, dir: 'ltr', inputmode: 'decimal' });
  const description = textField({ label: 'البيان', name: 'description', required: true, maxlength: 300 });
  const category = selectField({ label: 'التصنيف', name: 'categoryCode', options: lookups.items('transaction_category').map((item) => ({ value: item.code, label: item.nameAr })), value: 'office' });
  const occurredAt = dateField({ label: 'التاريخ', name: 'occurredAt', value: isoDateToday() });
  openFormDialog({
    title: 'تسجيل مصروف',
    description: 'المصروف يخرج من الحساب المحدد ويُسجَّل في الحركات المالية.',
    iconName: 'upload',
    content: h('div', { class: 'stack', style: 'gap:16px' }, h('div', { class: 'form-grid' }, account, amount), description, h('div', { class: 'form-grid' }, category, occurredAt)),
    submitLabel: 'حفظ المصروف',
    successMessage: 'تم تسجيل المصروف',
    onSubmit: async (form) => {
      const values = readForm(form);
      const amountMinor = Math.round(Number(values.amount?.replace(/,/g, '') ?? 0) * 100);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        setFieldError(form, 'amount', 'أدخل مبلغًا أكبر من صفر.');
        throw new Error('المبلغ غير صحيح.');
      }
      if (!values.description) { setFieldError(form, 'description', 'البيان مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.finance.postExpense({
        accountId: values.accountId ?? String(accounts[0]?.account.id),
        amountMinor,
        description: values.description,
        ...(values.categoryCode ? { categoryCode: values.categoryCode } : {}),
        ...(values.occurredAt ? { occurredAt: new Date(`${values.occurredAt}T12:00:00`).toISOString() } : {}),
      });
    },
  });
}

function openChargeDialog(context: PageArgs, onSaved: () => void): void {
  const client = entityPicker({
    name: 'clientId',
    label: 'العميل',
    required: true,
    placeholder: 'ابحث بالاسم…',
    search: (query) => context.services.clients.searchOptions(query, false, 8),
  });
  const description = textField({ label: 'بيان المستحق', name: 'description', required: true, maxlength: 300, placeholder: 'مثال: أتعاب المرافعة — الدفعة الأولى' });
  const amount = textField({ label: 'المبلغ (جنيه)', name: 'amount', required: true, dir: 'ltr', inputmode: 'decimal' });
  const dueOn = dateField({ label: 'تاريخ الاستحقاق', name: 'dueOn', value: isoDateToday() });
  const filePicker = entityPicker({
    name: 'fileId',
    label: 'الملف (اختياري)',
    placeholder: 'ابحث برقم الملف…',
    search: (query) => context.services.files.searchOptions(query, 8),
  });
  const notes = textareaField({ label: 'ملاحظات', name: 'notes', rows: 2, maxlength: 1000 });
  openFormDialog({
    title: 'مستحق مالي جديد',
    description: 'المستحق يظهر في المالية وفي ملف العميل والملف المرتبط.',
    iconName: 'wallet',
    size: 'md',
    content: h('div', { class: 'stack', style: 'gap:16px' }, client.root, description, h('div', { class: 'form-grid' }, amount, dueOn), filePicker.root, notes),
    submitLabel: 'حفظ المستحق',
    successMessage: 'تم تسجيل المستحق',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!client.getValue()) throw new Error('اختر العميل.');
      const amountMinor = Math.round(Number(values.amount?.replace(/,/g, '') ?? 0) * 100);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        setFieldError(form, 'amount', 'أدخل مبلغًا أكبر من صفر.');
        throw new Error('المبلغ غير صحيح.');
      }
      if (!values.description) { setFieldError(form, 'description', 'بيان المستحق مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.finance.createCharge({
        clientPartyId: client.getValue(),
        description: values.description,
        amountMinor,
        ...(values.dueOn ? { dueOn: values.dueOn } : {}),
        ...(filePicker.getValue() ? { fileId: filePicker.getValue() } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      });
    },
  });
}

function openAccountDialog(context: PageArgs): void {
  const lookups = context.workspace.lookups;
  const name = textField({ label: 'اسم الحساب', name: 'name', required: true, maxlength: 120, placeholder: 'مثال: الخزينة النقدية' });
  const kind = selectField({ label: 'نوع الحساب', name: 'kindCode', options: lookups.items('account_kind').map((item) => ({ value: item.code, label: item.nameAr })), value: 'cash' });
  openFormDialog({
    title: 'حساب مالي جديد',
    description: 'الحساب وعاء لتسجيل التحصيلات والمصروفات.',
    iconName: 'database',
    size: 'sm',
    content: h('div', { class: 'stack', style: 'gap:16px' }, name, kind),
    submitLabel: 'إنشاء الحساب',
    successMessage: 'تم إنشاء الحساب المالي',
    onSuccess: () => window.location.reload(),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.name) { setFieldError(form, 'name', 'اسم الحساب مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.finance.createAccount({ name: values.name, ...(values.kindCode ? { kindCode: values.kindCode } : {}) });
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

