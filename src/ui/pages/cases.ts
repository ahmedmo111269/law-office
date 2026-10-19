import { caseProcedurePanel, openCaseIntake } from './case-intake.ts';
import { onDataChanged } from '../events.ts';
import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatRelative,
  formatTime,
  isoDateToday,
} from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import {
  definitionList,
  emptyState,
  notice,
  pageHeader,
  sectionCard,
  statCard,
  tabPanel,
  tabs,
} from '../components/page.ts';
import {
  checkboxField,
  dateField,
  selectField,
  textField,
  textareaField,
} from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { openDialog, confirmDialog } from '../components/dialog.ts';
import { navigate } from '../app/router.ts';
import type { PageArgs } from '../app/context.ts';
import type { CaseDetail, CaseRow } from '../services/cases.ts';
import {
  lookupBadge,
  openFormDialog,
  setFieldError,
  statusTone,
} from './shared.ts';
import { openHearingOutcome } from './today.ts';
import { toastSuccess, toastError } from '../components/toast.ts';
import type { EngineRow } from '../../portable/store.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readForm(form: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const control of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea')) {
    if (control.name) values[control.name] = control.value.trim();
  }
  return values;
}

function inferYearOptions(): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = [];
  for (let y = 2200; y >= 1900; y -= 1)
    opts.push({ value: String(y), label: String(y) });
  return opts;
}

// ---------------------------------------------------------------------------
// Cases list
// ---------------------------------------------------------------------------
export async function renderCases(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;
  const courts = await services.cases.courts();
  const courtOptions = courts.map((c) => ({
    value: String(c.id),
    label: String(c.name),
  }));
  const yearOptions = inferYearOptions();

  // Existing customizable table; new facets share its saved views and preferences.
  const columns: Column<CaseRow>[] = [
    {
      key: 'case',
      label: 'رقم الدعوى',
      width: 150,
      sortable: true,
      defaultPinned: true,
      cardRole: 'meta',
      render: (row) =>
        h(
          'span',
          { class: 'mono strong' },
          h('bdi', {
            text: row.isIntake
              ? String(row.legalCase.file_number)
              : `${String(row.legalCase.case_number)} / ${String(row.legalCase.case_year)}`,
            dir: 'ltr',
          }),
        ),
      text: (row) =>
        row.isIntake
          ? String(row.legalCase.file_number)
          : `${String(row.legalCase.case_number)} / ${String(row.legalCase.case_year)}`,
    },
    {
      key: 'court',
      label: 'المحكمة',
      width: 210,
      sortable: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('a', {
            class: 'cell-title cell-link',
            href: row.isIntake
              ? `#/files/${String(row.legalCase.id)}?tab=procedure`
              : `#/cases/${String(row.legalCase.id)}`,
            text: row.courtName,
          }),
          h('span', {
            class: 'cell-sub',
            text:
              row.circuitName !== '—' ? row.circuitName : row.degreeName || '—',
          }),
        ),
      text: (row) => row.courtName,
    },
    {
      key: 'type',
      label: 'نوع الدعوى',
      width: 120,
      sortable: true,
      cardRole: 'meta',
      render: (row) =>
        h('span', { class: 'text-2' as never, text: row.caseTypeName }),
      text: (row) => row.caseTypeName,
    },
    {
      key: 'degree',
      label: 'درجة التقاضي',
      width: 120,
      sortable: true,
      defaultHidden: true,
      cardRole: 'meta',
      render: (row) =>
        h('span', { class: 'badge badge--quiet', text: row.degreeName }),
      text: (row) => row.degreeName,
    },
    {
      key: 'subject',
      label: 'الموضوع',
      width: 240,
      sortable: true,
      cardRole: 'detail',
      render: (row) =>
        h('span', {
          class: 'cell-sub clamp-1',
          text: String(row.legalCase.subject ?? '—').slice(0, 80) || '—',
        }),
      text: (row) => String(row.legalCase.subject ?? ''),
    },
    {
      key: 'clients',
      label: 'الموكلون',
      width: 180,
      cardRole: 'detail',
      render: (row) =>
        h('span', {
          text: row.clientNames.length > 0 ? row.clientNames.join('، ') : '—',
        }),
      text: (row) => row.clientNames.join('، '),
    },
    {
      key: 'opponents',
      label: 'الخصوم',
      width: 180,
      defaultHidden: true,
      cardRole: 'detail',
      render: (row) =>
        h('span', {
          text:
            row.opponentNames.length > 0 ? row.opponentNames.join('، ') : '—',
        }),
      text: (row) => row.opponentNames.join('، '),
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      sortable: true,
      cardRole: 'meta',
      render: (row) =>
        row.isIntake
          ? h('span', { class: 'badge badge--quiet', text: 'ملف قبل القيد' })
          : lookupBadge(
              lookups,
              'case_status',
              String(row.legalCase.status_id ?? ''),
            ),
      text: (row) => row.statusName,
    },
    {
      key: 'registration',
      label: 'تاريخ القيد',
      width: 125,
      sortable: true,
      defaultHidden: true,
      render: (row) =>
        h('span', {
          class: 'num',
          text: row.legalCase.registration_date
            ? formatDate(String(row.legalCase.registration_date), 'short')
            : '—',
        }),
      text: (row) => String(row.legalCase.registration_date ?? ''),
    },
    {
      key: 'next',
      label: 'الجلسة القادمة',
      width: 155,
      sortable: true,
      cardRole: 'meta',
      render: (row) =>
        row.nextHearingAt
          ? h('span', {
              class: 'num strong',
              text: `${formatDate(row.nextHearingAt, 'short')} ${formatTime(row.nextHearingAt)}`,
            })
          : h('span', { class: 'text-3', text: 'لا جلسة' }),
      text: (row) => row.nextHearingAt ?? '',
    },
    {
      key: 'last',
      label: 'آخر جلسة',
      width: 135,
      defaultHidden: true,
      render: (row) =>
        row.lastHearingAt
          ? h('span', {
              class: 'num text-3',
              text: formatDate(row.lastHearingAt, 'short'),
            })
          : h('span', { class: 'text-3', text: '—' }),
      text: (row) => row.lastHearingAt ?? '',
    },
    {
      key: 'hearings',
      label: 'الجلسات',
      width: 75,
      align: 'end',
      numeric: true,
      defaultHidden: false,
      render: (row) =>
        h('span', { class: 'num', text: formatNumber(row.hearingsCount) }),
      text: (row) => String(row.hearingsCount),
    },
    {
      key: 'files',
      label: 'الملفات',
      width: 75,
      align: 'end',
      numeric: true,
      defaultHidden: true,
      render: (row) =>
        h('span', { class: 'num', text: formatNumber(row.filesCount) }),
      text: (row) => String(row.filesCount),
    },
    {
      key: 'tasks',
      label: 'المهام',
      width: 70,
      align: 'end',
      numeric: true,
      defaultHidden: true,
      render: (row) =>
        h('span', { class: 'num', text: formatNumber(row.tasksCount) }),
      text: (row) => String(row.tasksCount),
    },
    {
      key: 'updated',
      label: 'آخر تحديث',
      width: 140,
      sortable: true,
      defaultHidden: true,
      render: (row) =>
        h('span', {
          class: 'text-3',
          text: row.lastActivityAt ? formatRelative(row.lastActivityAt) : '—',
        }),
      text: (row) => row.lastActivityAt ?? '',
    },
    {
      key: 'archived',
      label: 'الأرشفة',
      width: 90,
      defaultHidden: true,
      render: (row) =>
        row.isArchived
          ? h('span', { class: 'badge badge--quiet', text: 'مؤرشف' })
          : h('span', { class: 'text-3', text: 'نشط' }),
      text: (row) => (row.isArchived ? 'مؤرشف' : 'نشط'),
    },
    {
      key: 'missing',
      label: 'تنبيه',
      width: 90,
      defaultHidden: true,
      render: (row) =>
        row.hasMissingData
          ? h(
              'span',
              { class: 'badge badge--warning', text: 'ناقص' },
              icon('alert', 12),
            )
          : h('span', { class: 'text-3', text: 'مكتمل' }),
      text: (row) => (row.hasMissingData ? row.missingReasons.join('؛ ') : ''),
    },
    {
      key: 'stage',
      label: 'المرحلة الحالية',
      width: 170,
      cardRole: 'meta',
      render: (row) =>
        h('span', { class: 'badge badge--quiet', text: row.stageName ?? '—' }),
    },
    {
      key: 'lastAction',
      label: 'آخر إجراء',
      width: 125,
      sortable: true,
      defaultHidden: true,
      render: (row) =>
        h('span', {
          text: row.lastActionOn ? formatDate(row.lastActionOn) : 'لم يسجل',
        }),
    },
    {
      key: 'followUp',
      label: 'متابعة المكتب اليدوية',
      width: 145,
      sortable: true,
      cardRole: 'meta',
      render: (row) =>
        h('span', {
          text: row.followUpOn ? formatDate(row.followUpOn) : 'لم تحدد',
        }),
    },
  ];

  const header = pageHeader({
    title: 'القضايا',
    subtitle:
      'من ملف النزاع الأول إلى المراحل والدرجات — إدخال متخصص وفهرسة محلية مترابطة.',
    count: 0,
    actions: [
      h(
        'button',
        {
          class: 'btn btn--outline',
          type: 'button',
          on: { click: () => openAdvancedFilters(context, table) },
        },
        icon('filter', 17),
        h('span', { class: 'hide-sm', text: 'تصفية متقدمة' }),
      ),
      h(
        'button',
        {
          class: 'btn btn--ghost',
          type: 'button',
          title: 'تصدير CSV (المعروض)',
          on: { click: () => exportVisible(table) },
        },
        icon('download', 17),
        h('span', { class: 'hide-sm', text: 'تصدير' }),
      ),
      h(
        'button',
        {
          class: 'btn btn--primary',
          type: 'button',
          on: { click: () => openCaseForm(context, () => table.reload()) },
        },
        icon('plus', 17),
        h('span', { text: 'قضية / ملف جديد' }),
      ),
    ],
  });
  const countNode = header.querySelector('.page-title__count');
  if (countNode) countNode.textContent = '…';

  // Active filter chips container (will be updated by dataTable via onSearch? we add manual)
  const chipsHost = h('div', {
    class: 'row-wrap',
    style: 'gap:6px;margin-block-start:8px',
  });

  const table = dataTable<CaseRow>(
    {
      id: 'cases',
      title: 'القضايا',
      columns,
      load: (request) => services.cases.list(request),
      rowKey: (row) =>
        `${row.isIntake ? 'file' : 'case'}:${String(row.legalCase.id)}`,
      rowHref: (row) =>
        row.isIntake
          ? `#/files/${String(row.legalCase.id)}?tab=procedure`
          : `#/cases/${String(row.legalCase.id)}`,
      searchPlaceholder:
        'رقم الملف أو الدعوى أو الشكوى، اسم طرف، موضوع أو مرادف…',
      defaultSort: { key: 'case', dir: 'desc' },
      filters: [
        {
          key: 'scope',
          label: 'الملفات والدعاوى',
          options: [
            { value: 'intake', label: 'قبل القيد فقط' },
            { value: 'case', label: 'الدعاوى المقيدة فقط' },
          ],
        },
        {
          key: 'previousType',
          label: 'مرحلة سابقة / مسجلة',
          options: lookups
            .items('stage_type')
            .map((i) => ({ value: i.code, label: i.nameAr })),
        },
        {
          key: 'stage',
          label: 'المرحلة الحالية',
          options: lookups
            .items('stage_type')
            .map((i) => ({ value: i.code, label: i.nameAr })),
        },
        {
          key: 'stageStatus',
          label: 'حالة المرحلة',
          options: lookups
            .items('stage_status')
            .map((i) => ({ value: i.code, label: i.nameAr })),
        },
        {
          key: 'subtype',
          label: 'التصنيف الفرعي',
          options: lookups
            .items('case_classification')
            .filter(
              (i) =>
                lookups.byId(i.parentId ?? '')?.listId ===
                lookups.list('case_type')?.id,
            )
            .map((i) => ({
              value: i.id,
              label: `${lookups.byId(i.parentId ?? '')?.nameAr ?? ''} ← ${i.nameAr}`,
            })),
        },
        {
          key: 'term',
          label: 'موضوع / كلمة من القاموس',
          options: lookups
            .items('legal_subject')
            .map((i) => ({ value: i.id, label: i.nameAr })),
        },
        ...[
          { key: 'hasPre', label: 'مرحلة قبل التقاضي' },
          { key: 'hasRelated', label: 'ملفات / قضايا مرتبطة' },
          { key: 'hasAppeal', label: 'طعن مسجل' },
          { key: 'hasDocuments', label: 'مستندات مرجعية' },
          { key: 'needsNext', label: 'مرحلة انتهت دون خطوة تالية' },
          { key: 'hasHearing', label: 'جلسة مسجلة' },
        ].map((f) => ({
          ...f,
          options: [
            { value: 'yes', label: `${f.label}: نعم` },
            { value: 'no', label: `${f.label}: لا` },
          ],
        })),
        {
          key: 'status',
          label: 'كل الحالات',
          options: lookups
            .items('case_status')
            .map((item) => ({ value: item.code, label: item.nameAr })),
        },
        {
          key: 'type',
          label: 'كل الأنواع',
          options: lookups
            .items('case_type')
            .map((item) => ({ value: item.code, label: item.nameAr })),
        },
        {
          key: 'degree',
          label: 'كل درجات التقاضي',
          options: lookups
            .items('litigation_degree')
            .map((item) => ({ value: item.code, label: item.nameAr })),
        },
        { key: 'court', label: 'كل المحاكم', options: courtOptions },
        { key: 'year', label: 'كل السنوات', options: yearOptions },
        {
          key: 'hasNext',
          label: 'الجلسات',
          options: [
            { value: 'yes', label: 'لها جلسة قادمة' },
            { value: 'no', label: 'بلا جلسة قادمة' },
          ],
        },
        {
          key: 'archived',
          label: 'الأرشفة',
          options: [
            { value: 'active', label: 'النشطة فقط' },
            { value: 'archived', label: 'المؤرشفة فقط' },
          ],
        },
        {
          key: 'missing',
          label: 'الاكتمال',
          options: [{ value: 'true', label: 'بيانات ناقصة فقط' }],
        },
      ],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h(
          'a',
          {
            class: 'icon-btn icon-btn--sm',
            href: row.isIntake
              ? `#/files/${String(row.legalCase.id)}?tab=procedure`
              : `#/cases/${String(row.legalCase.id)}`,
            title: 'فتح القضية',
            attrs: { 'aria-label': 'فتح القضية' },
          },
          icon('external', 16),
        ),
        h(
          'button',
          {
            class: 'icon-btn icon-btn--sm',
            type: 'button',
            title: row.isIntake ? 'استكمال بيانات القيد' : 'إضافة جلسة',
            attrs: {
              'aria-label': row.isIntake
                ? 'استكمال بيانات القيد'
                : 'إضافة جلسة',
            },
            on: {
              click: () =>
                row.isIntake
                  ? openCaseIntake(context, {
                      fileId: String(row.legalCase.id),
                    })
                  : openQuickHearing(context, row, () => table.reload()),
            },
          },
          icon('calendar', 16),
        ),
      ],
      bulkActions: (rows, clear) => [
        h(
          'button',
          {
            class: 'btn btn--secondary btn--sm',
            type: 'button',
            text: `أرشفة (${formatNumber(rows.length)})`,
            on: {
              click: () => {
                confirmDialog({
                  title: 'أرشفة القضايا المحددة',
                  message: `سيتم أرشفة ${formatNumber(rows.length)} قضية. تبقى البيانات والجلسات والأحكام محفوظة ويمكن استعادتها من الأرشيف.`,
                  confirmLabel: 'أرشفة',
                  onConfirm: async () => {
                    for (const row of rows.filter((r) => r.isIntake))
                      await workspace.db.archive(
                        'case_file',
                        String(row.legalCase.id),
                        true,
                      );
                    const result = await services.cases.bulkArchive(
                      rows
                        .filter((r) => !r.isIntake)
                        .map((r) => String(r.legalCase.id)),
                    );
                    if (result.failed.length > 0)
                      toastError(
                        `تعذر أرشفة ${formatNumber(result.failed.length)} قضية`,
                        result.failed.map((f) => f.error).join('؛ '),
                      );
                    else
                      toastSuccess(
                        `تمت أرشفة ${formatNumber(result.succeeded.length)} قضية`,
                      );
                    clear();
                    await table.reload();
                  },
                });
              },
            },
          },
          icon('archive', 15),
        ),
        h(
          'button',
          {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            text: 'تغيير حالة الدعاوى المقيدة',
            disabled: rows.every((r) => r.isIntake),
            title: rows.every((r) => r.isIntake)
              ? 'لا توجد دعوى مقيدة بين الاختيارات؛ ملف قبل القيد لا يحمل حالة دعوى'
              : 'تغيير حالة الدعاوى المقيدة فقط',
            on: {
              click: () =>
                openBulkStatusDialog(
                  context,
                  rows.filter((r) => !r.isIntake),
                  () => {
                    clear();
                    void table.reload();
                  },
                ),
            },
          },
          icon('edit', 15),
        ),
        h(
          'button',
          {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            text: 'تصدير CSV',
            on: {
              click: () => {
                const csv = toCsv(rows);
                downloadCsv(csv, `cases-${isoDateToday()}.csv`);
                toastSuccess('تم تصدير البيانات المحددة');
              },
            },
          },
          icon('download', 15),
        ),
      ],
      emptyTitle: 'لا توجد قضايا مسجلة',
      emptyText:
        'ابدأ بملف نزاع ولو قبل معرفة المحكمة والرقم، وسجل مراحله الفعلية ثم اربط الدعوى عند قيدها. الحفظ والبحث محليان دون اتصال.',
      emptyIcon: 'scale',
      emptyActions: [
        h('button', {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          text: 'قضية / ملف جديد',
          on: { click: () => openCaseForm(context, () => table.reload()) },
        }),
      ],
    },
    workspace.preferences,
  );

  for (const [key, value] of context.query)
    if (!['new', 'focus'].includes(key)) table.setFilter(key, value);

  // Counts must not block the first real page while a large browser index is
  // scanned. Ellipses are a loading state, never invented sample statistics.
  const insights = h(
    'div',
    { class: 'grid-4', attrs: { 'aria-busy': 'true' } },
    ...[
      'الدعاوى وملفات النزاع',
      'غير مؤرشفة',
      'قضايا بجلسات قادمة',
      'تنبيهات بيانات',
    ].map((label) =>
      statCard({
        label,
        value: '…',
        iconName: 'scale',
        meta: 'جار حساب القيم الفعلية…',
      }),
    ),
  );
  let statsRevision = 0;
  const refreshStats = async (): Promise<void> => {
    const revision = ++statsRevision;
    insights.setAttribute('aria-busy', 'true');
    try {
      const stats = await services.cases.indexStats();
      if (revision !== statsRevision) return;
      insights.replaceChildren(
        statCard({
          label: 'الدعاوى وملفات النزاع',
          value: formatNumber(stats.total),
          iconName: 'scale',
          meta: `${formatNumber(stats.archived)} مؤرشف`,
          href: '#/cases',
        }),
        statCard({
          label: 'غير مؤرشفة',
          value: formatNumber(stats.open),
          iconName: 'activity',
          meta: 'بحسب الأرشفة، لا حكم على حالة النزاع',
          tone: stats.open > 0 ? 'info' : 'success',
        }),
        statCard({
          label: 'قضايا بجلسات قادمة',
          value: formatNumber(stats.next),
          iconName: 'gavel',
          meta: 'عدد قضايا فعلي لا عدد جلسات',
          tone: stats.next > 0 ? 'success' : 'warning',
          href: '#/hearings',
        }),
        statCard({
          label: 'تنبيهات بيانات',
          value: formatNumber(stats.missing),
          iconName: 'alert',
          meta: 'سجلات تحتاج استكمال بيانات',
          tone: stats.missing > 0 ? 'warning' : 'success',
        }),
      );
    } catch {
      if (revision === statsRevision)
        insights.replaceChildren(
          notice(
            'warning',
            'تعذر حساب الإجماليات الآن. نتائج الجدول وعددها مستقلة؛ أعد فتح الصفحة للمحاولة.',
          ),
        );
    } finally {
      if (revision === statsRevision)
        insights.setAttribute('aria-busy', 'false');
    }
  };
  void refreshStats();
  const stopStats = onDataChanged(() => {
    if (!insights.isConnected) {
      stopStats();
      return;
    }
    void refreshStats();
  });

  const page = h(
    'div',
    { class: 'page' },
    header,
    insights,
    chipsHost,
    table.root,
  );
  if (context.query.get('new') === '1') {
    window.setTimeout(() => openCaseForm(context, () => table.reload()), 80);
  }
  return page;
}

function exportVisible<Row>(handle: { getRows(): Row[] }): void {
  const rows = handle.getRows() as unknown as CaseRow[];
  if (rows.length === 0) {
    toastError('لا توجد صفوف للتصدير');
    return;
  }
  const csv = toCsv(rows);
  downloadCsv(csv, `cases-${isoDateToday()}.csv`);
  toastSuccess(`تم تصدير ${formatNumber(rows.length)} سجل`);
}

function toCsv(rows: CaseRow[]): string {
  const headers = [
    'رقم الدعوى',
    'السنة',
    'المحكمة',
    'الدائرة',
    'نوع الدعوى',
    'درجة التقاضي',
    'الموضوع',
    'الموكلون',
    'الخصوم',
    'الحالة',
    'تاريخ القيد',
    'الجلسة القادمة',
    'عدد الجلسات',
    'الأرشفة',
  ];
  const lines = [headers.map(escapeCsv).join(',')];
  for (const r of rows) {
    const cols = [
      String(r.legalCase.case_number),
      String(r.legalCase.case_year),
      r.courtName,
      r.circuitName,
      r.caseTypeName,
      r.degreeName,
      String(r.legalCase.subject ?? '').replace(/\n/g, ' '),
      r.clientNames.join('؛ '),
      r.opponentNames.join('؛ '),
      r.statusName,
      String(r.legalCase.registration_date ?? ''),
      r.nextHearingAt ?? '',
      String(r.hearingsCount),
      r.isArchived ? 'مؤرشف' : 'نشط',
    ];
    lines.push(cols.map(escapeCsv).join(','));
  }
  return lines.join('\r\n');
}
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n'))
    return `"${value.replace(/"/g, '""')}"`;
  return value;
}
function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openAdvancedFilters(
  context: PageArgs,
  handle: {
    reload(): Promise<void>;
    setFilter(key: string, value: string): void;
  },
): Promise<void> {
  const saved =
    context.workspace.preferences.getJson<{ filters?: Record<string, string> }>(
      'ui.table.cases',
      {},
    ).filters ?? {};
  const party = entityPicker({
    name: 'party',
    label: 'طرف محدد من السجل',
    search: (q) => context.services.parties.searchOptions(q),
  });
  const lawyer = entityPicker({
    name: 'responsible',
    label: 'مسؤول المتابعة',
    search: (q) => context.services.parties.searchOptions(q),
  });
  for (const [picker, id] of [
    [party, saved.party],
    [lawyer, saved.responsible],
  ] as const)
    if (id) {
      const row = await context.workspace.db.get('party', id);
      if (row) picker.setValue({ value: id, label: String(row.display_name) });
    }
  const content = h(
    'div',
    { class: 'stack' },
    notice(
      'info',
      'تُجمع هذه الشروط مع فلاتر الجدول، ويمكن حفظها من «طرق العرض» باستخدام نظام التفضيلات الحالي.',
    ),
    party.root,
    lawyer.root,
    selectField({
      label: 'صفة الطرف',
      name: 'role',
      value: saved.role ?? '',
      options: context.workspace.lookups
        .items('party_role')
        .map((i) => ({ value: i.code, label: i.nameAr })),
    }),
    selectField({
      label: 'التاريخ المراد تصفيته',
      name: 'dateField',
      value: saved.dateField ?? 'registration',
      options: [
        { value: 'registration', label: 'القيد الوارد بالأوراق' },
        { value: 'judgment', label: 'آخر حكم مسجل' },
        { value: 'last', label: 'آخر إجراء مسجل' },
        { value: 'followUp', label: 'المتابعة اليدوية للمكتب' },
      ],
    }),
    h(
      'div',
      { class: 'form-grid' },
      dateField(
        { label: 'من تاريخ', name: 'fromDate', value: saved.fromDate ?? '' },
        { withQuickPicks: false },
      ),
      dateField(
        { label: 'إلى تاريخ', name: 'toDate', value: saved.toDate ?? '' },
        { withQuickPicks: false },
      ),
    ),
    dateField(
      {
        label: 'لا إجراء مسجل منذ هذا التاريخ (يشمل بلا إجراءات)',
        name: 'staleBefore',
        value: saved.staleBefore ?? '',
      },
      { withQuickPicks: false },
    ),
  );
  openFormDialog({
    title: 'بحث مركب في القضايا',
    size: 'lg',
    content,
    submitLabel: 'تطبيق التصفية',
    successMessage: 'طُبقت شروط البحث',
    onSubmit: async () => {
      const v = readForm(content);
      for (const key of [
        'role',
        'dateField',
        'fromDate',
        'toDate',
        'staleBefore',
      ])
        handle.setFilter(key, v[key] ?? '');
      handle.setFilter('party', party.getValue());
      handle.setFilter('responsible', lawyer.getValue());
    },
    extraFooter: [
      h('button', {
        type: 'button',
        class: 'btn btn--ghost',
        text: 'مسح الشروط المتقدمة',
        on: {
          click: () => {
            for (const key of [
              'party',
              'responsible',
              'role',
              'dateField',
              'fromDate',
              'toDate',
              'staleBefore',
            ])
              handle.setFilter(key, '');
            for (const el of content.querySelectorAll<HTMLInputElement>(
              'input[type="date"]',
            ))
              el.value = '';
            party.setValue(null);
            lawyer.setValue(null);
          },
        },
      }),
    ],
  });
}

function openBulkStatusDialog(
  context: PageArgs,
  rows: CaseRow[],
  onDone: () => void,
): void {
  const lookups = context.workspace.lookups;
  const select = h(
    'select',
    { class: 'input select', name: 'statusCode' },
    ...lookups
      .items('case_status')
      .map((item) => h('option', { value: item.code, text: item.nameAr })),
  );
  const content = h(
    'div',
    { class: 'stack', style: 'gap:12px' },
    h('p', {
      class: 'text-sm',
      text: `سيتم تغيير حالة ${formatNumber(rows.length)} قضية إلى الحالة المختارة.`,
    }),
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'field__label', text: 'الحالة الجديدة' }),
      select,
      h('p', { class: 'field__error' }),
    ),
  );
  const submit = h('button', {
    class: 'btn btn--primary',
    type: 'button',
    text: 'تطبيق',
  });
  const cancel = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    text: 'إلغاء',
    on: { click: () => handle.close() },
  });
  const handle = openDialog({
    title: 'تغيير حالة القضايا',
    iconName: 'edit',
    size: 'sm',
    content,
    footer: h('div', { class: 'dialog__actions' }, cancel, submit),
  });
  submit.addEventListener('click', async () => {
    const code = (select as HTMLSelectElement).value;
    if (!code) return;
    submit.disabled = true;
    try {
      const result = await context.services.cases.bulkChangeStatus(
        rows.map((r) => String(r.legalCase.id)),
        code,
      );
      if (result.failed.length > 0)
        toastError(
          `فشل ${formatNumber(result.failed.length)}`,
          result.failed.map((f) => f.error).join('؛ '),
        );
      else
        toastSuccess(`تم تحديث ${formatNumber(result.succeeded.length)} قضية`);
      handle.close();
      onDone();
    } catch (e) {
      toastError((e as Error).message);
      submit.disabled = false;
    }
  });
}

function openQuickHearing(
  context: PageArgs,
  row: CaseRow,
  onSaved?: () => void,
): void {
  // Fetch detail quickly to reuse hearing dialog
  void context.services.cases.get(String(row.legalCase.id)).then((detail) => {
    if (!detail) return;
    openHearingDialog(context, detail, onSaved);
  });
}

// ---------------------------------------------------------------------------
// Case detail (center of work)
// ---------------------------------------------------------------------------
export async function renderCaseDetail(
  context: PageArgs,
): Promise<HTMLElement> {
  const caseId = context.params.id ?? '';
  const detail = await context.services.cases.get(caseId);
  if (!detail) {
    return h(
      'div',
      { class: 'page' },
      emptyState({
        iconName: 'scale',
        title: 'القضية غير موجودة',
        text: 'قد تكون محذوفة أو أن الرابط غير صحيح. تأكد من رقم الدعوى والسنة.',
        actions: [
          h('a', {
            class: 'btn btn--primary',
            href: '#/cases',
            text: 'العودة إلى القضايا',
          }),
        ],
      }),
    );
  }
  const lookups = context.workspace.lookups;
  const legalCase = detail.legalCase;
  const upcoming = detail.hearings.filter(
    (row) => String(row.hearing.scheduled_at) >= new Date().toISOString(),
  );
  const nextHearing = upcoming[0];
  const isArchived = Boolean(legalCase.archived_at);
  const caseLabel = `${String(legalCase.case_number)} / ${String(legalCase.case_year)}`;

  const header = pageHeader({
    title: `قضية ${caseLabel}`,
    breadcrumb: [{ label: 'القضايا', href: '#/cases' }, { label: caseLabel }],
    meta: [
      h('span', { class: 'chip mono', dir: 'ltr', text: caseLabel }),
      h('span', { class: 'chip', text: detail.courtName }),
      detail.circuitName !== '—'
        ? h('span', { class: 'chip', text: detail.circuitName })
        : null,
      lookupBadge(lookups, 'case_status', String(legalCase.status_id ?? '')),
      h('span', { class: 'chip chip--quiet', text: detail.degreeName }),
      isArchived
        ? h('span', { class: 'badge badge--quiet', text: 'مؤرشفة' })
        : null,
      detail.relatedCases.length > 0
        ? h('span', {
            class: 'chip',
            text: `${formatNumber(detail.relatedCases.length)} ارتباط`,
          })
        : null,
    ].filter(Boolean) as Child[],
    actions: [
      h(
        'button',
        {
          class: 'btn btn--ghost',
          type: 'button',
          title: 'طباعة ملخص القضية',
          on: { click: () => window.print() },
        },
        icon('printer', 17),
        h('span', { class: 'topbar-hide-mobile', text: 'طباعة' }),
      ),
      h(
        'button',
        {
          class: 'btn btn--outline',
          type: 'button',
          on: {
            click: () =>
              openCaseEditDialog(context, detail, () =>
                navigate(`/cases/${caseId}`, { replace: true }),
              ),
          },
        },
        icon('edit', 17),
        h('span', { text: 'تعديل' }),
      ),
      h(
        'button',
        {
          class: 'btn btn--ghost',
          type: 'button',
          on: { click: () => openCaseMenu(context, detail) },
        },
        icon('more', 17),
      ),
      h(
        'button',
        {
          class: 'btn btn--outline',
          type: 'button',
          on: {
            click: () =>
              openHearingDialog(context, detail, () =>
                navigate(`/cases/${caseId}`, { replace: true }),
              ),
          },
        },
        icon('calendar', 17),
        h('span', { text: 'جلسة جديدة' }),
      ),
      h(
        'button',
        {
          class: 'btn btn--primary',
          type: 'button',
          on: {
            click: () =>
              openJudgmentDialog(
                context,
                [{ id: caseId, label: `قضية ${caseLabel}` }],
                caseId,
                () => navigate(`/cases/${caseId}`, { replace: true }),
              ),
          },
        },
        icon('stamp', 17),
        h('span', { text: 'تسجيل حكم' }),
      ),
    ],
  });

  // Alerts band
  const alertsHost = h('div', {
    class: 'stack',
    style: 'gap:8px;margin-block-end:12px',
  });
  for (const alert of detail.alerts) {
    const tone =
      alert.kind === 'danger'
        ? 'danger'
        : alert.kind === 'warning'
          ? 'warning'
          : 'info';
    alertsHost.appendChild(
      notice(tone, alert.description, {
        title: alert.title,
        iconName:
          alert.kind === 'danger'
            ? 'alert'
            : alert.kind === 'warning'
              ? 'alert'
              : 'info',
      }),
    );
  }
  if (detail.alerts.length === 0) {
    alertsHost.appendChild(
      notice('success', 'بيانات القضية مكتملة ولا توجد تنبيهات عاجلة.', {
        iconName: 'check',
        title: 'جاهزة للمتابعة',
      }),
    );
  }

  // Stats
  const stats = h(
    'div',
    { class: 'grid-4' },
    statCard({
      label: 'الجلسات',
      value: formatNumber(detail.hearings.length),
      iconName: 'gavel',
      meta: nextHearing
        ? `القادمة ${formatDate(String(nextHearing.hearing.scheduled_at), 'short')}`
        : 'لا جلسة قادمة',
      href: `#/cases/${caseId}?tab=hearings`,
    }),
    statCard({
      label: 'الأحكام',
      value: formatNumber(detail.judgments.length),
      iconName: 'stamp',
      meta: detail.judgments[0]
        ? detail.judgments[0].typeName
        : 'كل درجات التقاضي',
      href: `#/cases/${caseId}?tab=judgments`,
    }),
    statCard({
      label: 'الأعمال الإدارية',
      value: formatNumber(detail.tasks.length),
      iconName: 'tasks',
      meta: `${formatNumber(detail.tasks.filter((t) => String(t.due_at ?? '') >= new Date().toISOString()).length)} قادم`,
      tone: detail.tasks.some(
        (t) =>
          t.due_at &&
          String(t.due_at) < new Date().toISOString() &&
          lookups.byId(String(t.status_id ?? ''))?.code !== 'completed',
      )
        ? 'warning'
        : 'default',
      href: `#/cases/${caseId}?tab=tasks`,
    }),
    statCard({
      label: 'القيمة / المستندات',
      value: legalCase.claim_amount_minor
        ? formatMoney(Number(legalCase.claim_amount_minor))
        : `${formatNumber(detail.documents.length)} مستند`,
      iconName: legalCase.claim_amount_minor ? 'wallet' : 'document',
      small: Boolean(legalCase.claim_amount_minor),
      meta: legalCase.claim_amount_minor
        ? `${formatNumber(detail.documents.length)} مستند مرتبط`
        : `${formatNumber(detail.parties.length)} طرف`,
    }),
  );

  const summary = h(
    'div',
    { class: 'hero-band', style: 'margin-block-start:12px' },
    h(
      'div',
      { class: 'hero-band__main' },
      h('p', { class: 'text-xs text-3', text: 'ملخص القضية' }),
      legalCase.subject
        ? h('p', {
            class: 'page-subtitle',
            style: 'margin-block-start:4px;max-inline-size:68ch',
            text: String(legalCase.subject),
          })
        : h('p', {
            class: 'text-sm text-3',
            text: 'لم يُسجل موضوع تفصيلي لهذه الدعوى.',
          }),
      h(
        'div',
        { class: 'hero-band__meta', style: 'margin-block-start:8px' },
        h('span', {
          text: `سنة ${String(legalCase.case_year)} · ${detail.caseTypeName}`,
        }),
        h('span', {
          text: legalCase.registration_date
            ? `مسجلة في ${formatDate(String(legalCase.registration_date), 'medium')}`
            : 'تاريخ القيد غير مسجل',
        }),
        nextHearing
          ? h('span', {
              text: `الجلسة القادمة ${formatDate(String(nextHearing.hearing.scheduled_at), 'medium')} ${formatTime(String(nextHearing.hearing.scheduled_at))}`,
            })
          : h('span', { text: 'لا جلسة قادمة مجدولة' }),
      ),
    ),
    h(
      'div',
      { class: 'hero-band__actions', style: 'align-items:flex-start' },
      legalCase.claim_amount_minor
        ? h('span', {
            class: 'chip',
            text: `قيمة الدعوى ${formatMoney(Number(legalCase.claim_amount_minor))}`,
          })
        : null,
      h('a', {
        class: 'btn btn--ghost btn--sm',
        href: `#/files/${String(detail.files[0]?.id ?? '')}`,
        text:
          detail.files.length > 0
            ? `ملف: ${String(detail.files[0]?.title ?? '')}`.slice(0, 30)
            : 'ربط بملف',
      }),
    ),
  );

  const page = h('div', { class: 'page' }, header, alertsHost, stats, summary);

  // Tab definitions - ordered by daily use frequency
  const tabDefs = [
    { id: 'overview', label: 'نظرة عامة', iconName: 'dashboard' },
    { id: 'procedure', label: 'ملف النزاع والمراحل', iconName: 'history' },
    { id: 'details', label: 'البيانات', iconName: 'document' },
    {
      id: 'parties',
      label: 'الأطراف',
      count: detail.parties.length,
      iconName: 'users',
    },
    {
      id: 'degrees',
      label: 'الدرجات والروابط',
      count: detail.relatedCases.length + 1,
      iconName: 'layers',
    },
    {
      id: 'hearings',
      label: 'الجلسات',
      count: detail.hearings.length,
      iconName: 'gavel',
    },
    {
      id: 'judgments',
      label: 'الأحكام',
      count: detail.judgments.length,
      iconName: 'stamp',
    },
    {
      id: 'tasks',
      label: 'الأعمال',
      count: detail.tasks.length,
      iconName: 'tasks',
    },
    {
      id: 'announcements',
      label: 'الإعلانات',
      count: detail.announcements.length,
      iconName: 'send',
    },
    {
      id: 'documents',
      label: 'المستندات',
      count: detail.documents.length,
      iconName: 'document',
    },
    { id: 'contracts', label: 'العقود والتوكيلات', iconName: 'briefcase' },
    { id: 'finance', label: 'المالية', iconName: 'wallet' },
    {
      id: 'notes',
      label: 'الملاحظات',
      count: detail.notes.length,
      iconName: 'edit',
    },
    {
      id: 'activity',
      label: 'النشاط',
      count: detail.activity.length,
      iconName: 'history',
    },
  ];

  const panels: Record<string, HTMLElement> = {
    procedure: tabPanel(
      'procedure',
      detail.files[0]
        ? await caseProcedurePanel(context, String(detail.files[0].id), caseId)
        : h(
            'div',
            { class: 'stack' },
            notice(
              'info',
              'هذه دعوى قديمة بلا ملف مكتب. عند استكمال البيانات سيُنشأ ملف مرتبط دون تغيير رقم الدعوى أو معرّفها.',
            ),
            h('button', {
              type: 'button',
              class: 'btn btn--primary',
              text: 'استكمال ملف النزاع',
              on: { click: () => openCaseEditDialog(context, detail) },
            }),
          ),
    ),
    overview: tabPanel('overview', overviewTab(context, detail)),
    details: tabPanel('details', detailsTab(context, detail)),
    parties: tabPanel('parties', partiesTab(context, detail)),
    degrees: tabPanel('degrees', degreesTab(context, detail)),
    hearings: tabPanel(
      'hearings',
      h(
        'div',
        { class: 'stack', style: 'gap:12px' },
        sectionCard({
          title: 'الجلسات القضائية',
          subtitle:
            'سجّل ما حدث في كل جلسة، والقرارات والتأجيلات، مع الحفاظ على السجل الزمني.',
          actions: [
            h('button', {
              class: 'btn btn--primary btn--sm',
              type: 'button',
              text: 'إضافة جلسة',
              on: {
                click: () =>
                  openHearingDialog(context, detail, () =>
                    navigate(`/cases/${caseId}`, { replace: true }),
                  ),
              },
            }),
          ],
          bodyClass: 'card__body--tight',
          body: hearingsTimeline(context, detail),
        }),
      ),
    ),
    judgments: tabPanel('judgments', judgmentsTab(context, detail)),
    tasks: tabPanel('tasks', tasksTab(context, detail)),
    announcements: tabPanel('announcements', announcementsTab(context, detail)),
    documents: tabPanel('documents', documentsTab(context, detail)),
    contracts: tabPanel('contracts', contractsTab(context, detail)),
    finance: tabPanel('finance', financeTab(context, detail)),
    notes: tabPanel('notes', notesTab(context, detail)),
    activity: tabPanel('activity', activityTab(context, detail)),
  };

  const initial = (context.query.get('tab') as string | null) ?? 'overview';
  const active = panels[initial] ? initial : 'overview';
  for (const [key, panel] of Object.entries(panels))
    panel.hidden = key !== active;
  const handle = tabs(tabDefs, active, (id) => {
    for (const [key, panel] of Object.entries(panels))
      panel.hidden = key !== id;
    handle.setActive(id);
    const url = new URL(window.location.href);
    url.hash = `#/cases/${caseId}?tab=${id}`;
    window.history.replaceState(null, '', url.toString());
  });
  page.appendChild(handle.root);
  page.append(...Object.values(panels));
  return page;
}

function overviewTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  const tasksOpen = detail.tasks.filter(
    (t) =>
      !['completed', 'cancelled'].includes(
        context.workspace.lookups.byId(String(t.status_id ?? ''))?.code ?? '',
      ),
  );
  const next = detail.hearings.filter(
    (row) => String(row.hearing.scheduled_at) >= new Date().toISOString(),
  )[0];
  return h(
    'div',
    { class: 'detail-layout' },
    h(
      'div',
      { class: 'detail-main' },
      sectionCard({
        title: 'الوضع الحالي',
        subtitle: 'أهم ما يحتاج انتباهك في هذه القضية.',
        body: h(
          'div',
          { class: 'stack', style: 'gap:10px' },
          detail.alerts.length > 0
            ? h(
                'div',
                null,
                ...detail.alerts.slice(0, 3).map((a) =>
                  h('p', {
                    class: `text-sm ${a.kind === 'danger' ? 'text-danger' : a.kind === 'warning' ? 'text-warning' : 'text-2'}`,
                    text: `• ${a.title}: ${a.description}`,
                  }),
                ),
              )
            : h('p', {
                class: 'text-sm text-2',
                text: 'لا تنبيهات عاجلة. القضية مكتملة البيانات.',
              }),
          next
            ? h(
                'div',
                {
                  class: 'notice notice--info',
                  style: 'margin-block-start:8px',
                },
                icon('calendar', 16),
                h(
                  'div',
                  null,
                  h('p', {
                    class: 'strong',
                    text: `الجلسة القادمة: ${formatDate(String(next.hearing.scheduled_at), 'medium')} ${formatTime(String(next.hearing.scheduled_at))}`,
                  }),
                  h('p', {
                    class: 'text-sm',
                    text: `${detail.courtName} — ${next.purposeName}`,
                  }),
                ),
              )
            : h('p', {
                class: 'text-sm text-3',
                text: 'لا جلسة قادمة. أضف موعد الجلسة فور تحديده.',
              }),
          detail.judgments[0]
            ? h('p', {
                class: 'text-sm',
                text: `آخر حكم: ${detail.judgments[0].typeName} في ${formatDate(String(detail.judgments[0].judgment.issued_on), 'medium')}`,
              })
            : null,
        ),
      }),
      sectionCard({
        title: 'الأعمال الإدارية المفتوحة',
        subtitle: 'التكليفات المرتبطة بالقضية.',
        actions: [
          h('button', {
            class: 'btn btn--outline btn--sm',
            type: 'button',
            text: 'عمل جديد',
            on: {
              click: () =>
                openTaskDialog(context, detail, () =>
                  navigate(`/cases/${String(detail.legalCase.id)}?tab=tasks`, {
                    replace: true,
                  }),
                ),
            },
          }),
        ],
        body:
          tasksOpen.length === 0
            ? h('p', {
                class: 'text-sm text-3',
                style: 'padding:12px',
                text: 'لا أعمال مفتوحة.',
              })
            : h(
                'div',
                { class: 'record-list', style: 'padding:8px' },
                ...tasksOpen.slice(0, 5).map((task) =>
                  h(
                    'div',
                    { class: 'record-card' },
                    h(
                      'div',
                      { class: 'record-card__head' },
                      h('span', { class: 'avatar' }, icon('tasks', 16)),
                      h(
                        'div',
                        { style: 'flex:1' },
                        h('h3', {
                          class: 'record-card__title',
                          text: String(task.title),
                        }),
                        h('p', {
                          class: 'text-xs text-3',
                          text: task.due_at
                            ? `يستحق ${formatDate(String(task.due_at), 'short')}`
                            : 'بلا موعد',
                        }),
                      ),
                    ),
                  ),
                ),
              ),
      }),
      sectionCard({
        title: 'سجل القضية الزمني (مختصر)',
        body: h(
          'div',
          { class: 'timeline', style: 'padding:8px' },
          detail.hearings.length === 0 &&
            detail.judgments.length === 0 &&
            detail.tasks.length === 0
            ? h('p', {
                class: 'text-sm text-3',
                text: 'لا أحداث بعد. ابدأ بإضافة جلسة أو مهمة.',
              })
            : null,
          ...[...detail.hearings].slice(-3).map((row) =>
            h(
              'div',
              { class: 'timeline__item' },
              h('span', { class: 'timeline__dot' }, icon('gavel', 12)),
              h(
                'div',
                { class: 'timeline__body' },
                h('p', {
                  class: 'timeline__title',
                  text: `${formatDate(String(row.hearing.scheduled_at), 'short')} — ${row.statusName}`,
                }),
                h('p', { class: 'timeline__meta', text: row.courtName }),
              ),
            ),
          ),
          ...detail.judgments.slice(0, 2).map((row) =>
            h(
              'div',
              { class: 'timeline__item' },
              h(
                'span',
                {
                  class: 'timeline__dot',
                  style: 'background:var(--c-success-soft)',
                },
                icon('stamp', 12),
              ),
              h(
                'div',
                { class: 'timeline__body' },
                h('p', {
                  class: 'timeline__title',
                  text: `حكم: ${row.typeName}`,
                }),
                h('p', {
                  class: 'timeline__meta',
                  text: `${row.statusName} · ${formatDate(String(row.judgment.issued_on), 'medium')}`,
                }),
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
        title: 'بيانات سريعة',
        body: definitionList([
          { label: 'المحكمة', value: detail.courtName },
          { label: 'الدائرة', value: detail.circuitName },
          { label: 'نوع الدعوى', value: detail.caseTypeName },
          { label: 'الدرجة', value: detail.degreeName },
          { label: 'الحالة', value: detail.statusName },
          {
            label: 'تاريخ القيد',
            value: detail.legalCase.registration_date
              ? formatDate(String(detail.legalCase.registration_date), 'medium')
              : '—',
          },
          {
            label: 'قيمة الدعوى',
            value: detail.legalCase.claim_amount_minor
              ? formatMoney(Number(detail.legalCase.claim_amount_minor))
              : '—',
          },
          {
            label: 'الملفات',
            value:
              detail.files.length > 0
                ? detail.files.map((f) => String(f.title)).join('، ')
                : '—',
          },
        ]),
        actions: [
          h('button', {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            text: 'تعديل',
            on: {
              click: () =>
                openCaseEditDialog(context, detail, () =>
                  navigate(`/cases/${String(detail.legalCase.id)}`, {
                    replace: true,
                  }),
                ),
            },
          }),
        ],
      }),
      sectionCard({
        title: 'الأطراف',
        body:
          detail.parties.length === 0
            ? h('p', { class: 'text-sm text-3', text: 'لا أطراف.' })
            : h(
                'div',
                { class: 'stack', style: 'gap:6px' },
                ...detail.parties.slice(0, 4).map((p) =>
                  h(
                    'div',
                    { class: 'row', style: 'gap:8px' },
                    h('span', {
                      class: 'avatar',
                      text: String(p.party.display_name).charAt(0),
                    }),
                    h('span', {
                      class: 'text-sm',
                      text: `${String(p.party.display_name)} — ${p.roleName}`,
                    }),
                  ),
                ),
              ),
        footer: h('a', {
          class: 'btn btn--ghost btn--sm',
          href: `#/cases/${String(detail.legalCase.id)}?tab=parties`,
          text: 'إدارة الأطراف',
        }),
      }),
      sectionCard({
        title: 'المستندات',
        body:
          detail.documents.length === 0
            ? h('p', { class: 'text-sm text-3', text: 'لا مستندات مرتبطة.' })
            : h('p', {
                class: 'text-sm',
                text: `${formatNumber(detail.documents.length)} مستند مرتبط. راجع تبويب المستندات.`,
              }),
      }),
    ),
  );
}

function detailsTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  const lc = detail.legalCase;
  const lookups = context.workspace.lookups;
  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    sectionCard({
      title: 'البيانات الأساسية',
      subtitle: 'الحقول الأساسية للقضية. اضغط «تعديل» لتحديثها.',
      actions: [
        h('button', {
          class: 'btn btn--outline btn--sm',
          type: 'button',
          text: 'تعديل',
          on: {
            click: () =>
              openCaseEditDialog(context, detail, () =>
                navigate(`/cases/${String(lc.id)}?tab=details`, {
                  replace: true,
                }),
              ),
          },
        }),
      ],
      body: definitionList([
        {
          label: 'رقم الدعوى',
          value: h('bdi', { text: String(lc.case_number), dir: 'ltr' }),
        },
        { label: 'سنة الدعوى', value: String(lc.case_year) },
        { label: 'المحكمة', value: detail.courtName },
        { label: 'الدائرة', value: detail.circuitName },
        { label: 'نوع الدعوى', value: detail.caseTypeName },
        { label: 'درجة التقاضي', value: detail.degreeName },
        {
          label: 'الحالة التشغيلية',
          value: lookupBadge(
            lookups,
            'case_status',
            String(lc.status_id ?? ''),
          ),
        },
        {
          label: 'تاريخ القيد',
          value: lc.registration_date
            ? formatDate(String(lc.registration_date), 'medium')
            : '—',
        },
        { label: 'الموضوع', value: lc.subject ? String(lc.subject) : '—' },
        {
          label: 'قيمة الدعوى',
          value: lc.claim_amount_minor
            ? formatMoney(Number(lc.claim_amount_minor))
            : '—',
        },
        { label: 'الملاحظات', value: lc.notes ? String(lc.notes) : '—' },
        {
          label: 'تاريخ الإنشاء',
          value: formatDate(String(lc.created_at), 'medium'),
        },
        { label: 'آخر تحديث', value: formatRelative(String(lc.updated_at)) },
        {
          label: 'الأرشفة',
          value: lc.archived_at
            ? `مؤرشفة في ${formatDate(String(lc.archived_at), 'medium')}`
            : 'نشطة',
        },
      ]),
    }),
    sectionCard({
      title: 'الملفات القانونية المرتبطة',
      subtitle:
        'القضية قد ترتبط بأكثر من ملف. الملف هو الحاوية التي تجمع القضايا والمستندات والمالية.',
      body:
        detail.files.length === 0
          ? h('p', {
              class: 'text-sm text-3',
              text: 'لا ملفات مرتبطة. اربط القضية بملف لتوحيد الأطراف والمستندات.',
            })
          : h(
              'div',
              { class: 'stack', style: 'gap:6px' },
              ...detail.files.map((f) =>
                h(
                  'a',
                  {
                    class: 'menu__item',
                    href: `#/files/${String(f.id)}`,
                    style: 'text-decoration:none',
                  },
                  icon('folder', 16),
                  h('span', {
                    text: `${String(f.file_number)} — ${String(f.title)}`,
                  }),
                ),
              ),
            ),
      actions: [
        h('button', {
          class: 'btn btn--outline btn--sm',
          type: 'button',
          text: 'ربط بملف',
          on: {
            click: () =>
              openLinkFileDialog(context, detail, () =>
                navigate(`/cases/${String(lc.id)}?tab=details`, {
                  replace: true,
                }),
              ),
          },
        }),
      ],
    }),
    sectionCard({
      title: 'التنبيهات والبيانات الناقصة',
      body:
        detail.alerts.length === 0
          ? h('p', { class: 'text-sm text-2', text: 'لا تنبيهات.' })
          : h(
              'div',
              { class: 'stack', style: 'gap:6px' },
              ...detail.alerts.map((a) =>
                h('p', {
                  class: `text-sm ${a.kind === 'danger' ? 'text-danger' : a.kind === 'warning' ? 'text-warning' : 'text-2'}`,
                  text: `• ${a.title}`,
                }),
              ),
            ),
    }),
  );
}

function partiesTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  if (detail.parties.length === 0) {
    return h(
      'div',
      { style: 'padding:16px' },
      emptyState({
        iconName: 'users',
        title: 'لا أطراف مرتبطة',
        text: 'الأطراف تُدار عبر الملفات المرتبطة بالقضية. اربط الملف أولًا أو أضف طرفًا مباشرة.',
        actions: [
          h('button', {
            class: 'btn btn--primary btn--sm',
            type: 'button',
            text: 'إضافة طرف',
            on: {
              click: () =>
                openPartyDialog(context, detail, () =>
                  navigate(
                    `/cases/${String(detail.legalCase.id)}?tab=parties`,
                    { replace: true },
                  ),
                ),
            },
          }),
        ],
      }),
    );
  }
  return h(
    'div',
    { class: 'stack', style: 'gap:12px;padding:12px' },
    h(
      'div',
      { class: 'row-wrap', style: 'justify-content:flex-end' },
      h('button', {
        class: 'btn btn--primary btn--sm',
        type: 'button',
        text: 'إضافة طرف',
        on: {
          click: () =>
            openPartyDialog(context, detail, () =>
              navigate(`/cases/${String(detail.legalCase.id)}?tab=parties`, {
                replace: true,
              }),
            ),
        },
      }),
    ),
    h(
      'div',
      { class: 'record-list' },
      ...detail.parties.map((entry) =>
        h(
          'div',
          { class: 'record-card' },
          h(
            'div',
            { class: 'record-card__head' },
            h('span', {
              class: 'avatar',
              text: String(entry.party.display_name).charAt(0),
            }),
            h(
              'div',
              { style: 'flex:1;min-inline-size:0' },
              h(
                'h3',
                { class: 'record-card__title' },
                h('a', {
                  href: `#/parties/${String(entry.party.id)}`,
                  text: String(entry.party.display_name),
                }),
              ),
              h('p', {
                class: 'text-xs text-3',
                text: `${entry.roleName} · ${entry.sideName}${entry.isOfficeClient ? ' · يمثله المكتب' : ''}${entry.inherited ? ' · علاقة عامة بالملف' : ' · علاقة خاصة بهذه الدعوى'} — ملف: ${String(entry.fileId).slice(0, 8)}`,
              }),
            ),
            h(
              'div',
              { class: 'row', style: 'gap:2px' },
              h(
                'button',
                {
                  class: 'icon-btn icon-btn--sm',
                  type: 'button',
                  title: 'تغيير الصفة',
                  attrs: { 'aria-label': 'تغيير الصفة' },
                  on: {
                    click: () =>
                      openChangeRoleDialog(context, detail, entry, () =>
                        navigate(
                          `/cases/${String(detail.legalCase.id)}?tab=parties`,
                          { replace: true },
                        ),
                      ),
                  },
                },
                icon('edit', 15),
              ),
              h(
                'button',
                {
                  class: 'icon-btn icon-btn--sm',
                  type: 'button',
                  disabled: entry.inherited,
                  title: entry.inherited
                    ? 'علاقة عامة بالملف؛ عدل صفتها لتخصيصها بهذه الدعوى، أو أدرها من الملف'
                    : 'إزالة من القضية',
                  attrs: { 'aria-label': 'إزالة' },
                  on: {
                    click: () =>
                      confirmRemoveParty(context, entry, () =>
                        navigate(
                          `/cases/${String(detail.legalCase.id)}?tab=parties`,
                          { replace: true },
                        ),
                      ),
                  },
                },
                icon('trash', 15),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function degreesTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  const current = h(
    'div',
    {
      class: 'record-card',
      style: 'border-inline-start:3px solid var(--c-primary)',
    },
    h(
      'div',
      { class: 'record-card__head' },
      icon('scale', 18),
      h(
        'div',
        { style: 'flex:1' },
        h('h3', {
          class: 'record-card__title',
          text: `الدرجة الحالية: ${detail.degreeName}`,
        }),
        h('p', {
          class: 'text-xs text-3',
          text: `${detail.courtName} · ${detail.caseTypeName} · ${String(detail.legalCase.case_number)} / ${String(detail.legalCase.case_year)}`,
        }),
      ),
    ),
  );
  const related =
    detail.relatedCases.length === 0
      ? emptyState({
          iconName: 'layers',
          title: 'لا ارتباطات قضائية مسجلة',
          text: 'اربط الاستئناف أو النقض أو الدعاوى المرتبطة لتوضيح التسلسل القضائي.',
          actions: [
            h('button', {
              class: 'btn btn--primary btn--sm',
              type: 'button',
              text: 'ربط قضية',
              on: {
                click: () =>
                  openLinkCaseDialog(context, detail, () =>
                    navigate(
                      `/cases/${String(detail.legalCase.id)}?tab=degrees`,
                      { replace: true },
                    ),
                  ),
              },
            }),
          ],
        })
      : h(
          'div',
          { class: 'stack', style: 'gap:8px' },
          ...detail.relatedCases.map((rel) =>
            h(
              'div',
              { class: 'record-card' },
              h(
                'div',
                { class: 'record-card__head' },
                h(
                  'span',
                  { class: 'avatar' },
                  icon(
                    rel.direction === 'outgoing' ? 'arrow-left' : 'arrow-right',
                    16,
                  ),
                ),
                h(
                  'div',
                  { style: 'flex:1;min-inline-size:0' },
                  rel.legalCase
                    ? h(
                        'h3',
                        { class: 'record-card__title' },
                        h('a', {
                          href: `#/cases/${String(rel.legalCase.id)}`,
                          text: `قضية ${String(rel.legalCase.case_number)} / ${String(rel.legalCase.case_year)}`,
                        }),
                      )
                    : h('h3', {
                        class: 'record-card__title',
                        text: 'قضية مرتبطة (محذوفة)',
                      }),
                  h('p', {
                    class: 'text-xs text-3',
                    text: `${rel.relationName} · ${rel.direction === 'outgoing' ? 'صادرة' : 'واردة'}${rel.legalCase ? ` · ${String(rel.legalCase.subject ?? '').slice(0, 60)}` : ''}`,
                  }),
                ),
                h(
                  'button',
                  {
                    class: 'icon-btn icon-btn--sm',
                    type: 'button',
                    title: 'فك الارتباط',
                    on: {
                      click: () =>
                        confirmUnlinkCase(context, String(rel.link.id), () =>
                          navigate(
                            `/cases/${String(detail.legalCase.id)}?tab=degrees`,
                            { replace: true },
                          ),
                        ),
                    },
                  },
                  icon('unlink', 15),
                ),
              ),
            ),
          ),
        );
  return h(
    'div',
    { class: 'stack', style: 'gap:16px;padding:12px' },
    sectionCard({ title: 'الدرجة الحالية', body: current }),
    sectionCard({
      title: 'التسلسل القضائي والارتباطات',
      subtitle:
        'الاستئناف والنقض والدعاوى المرتبطة. لا يُستنتج وجود استئناف تلقائيًا؛ يُسجل ببيانات فعلية.',
      actions: [
        h('button', {
          class: 'btn btn--outline btn--sm',
          type: 'button',
          text: 'ربط قضية',
          on: {
            click: () =>
              openLinkCaseDialog(context, detail, () =>
                navigate(`/cases/${String(detail.legalCase.id)}?tab=degrees`, {
                  replace: true,
                }),
              ),
          },
        }),
      ],
      body: related,
    }),
  );
}

function hearingsTimeline(context: PageArgs, detail: CaseDetail): HTMLElement {
  if (detail.hearings.length === 0) {
    return emptyState({
      iconName: 'gavel',
      title: 'لا جلسات مسجلة',
      text: 'أضف أول جلسة مع تاريخها وغرضها والمحكمة. عند التأجيل، أضف جلسة جديدة واحتفظ بالسجل السابق.',
      actions: [
        h('button', {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          text: 'إضافة جلسة',
          on: {
            click: () =>
              openHearingDialog(context, detail, () =>
                navigate(`/cases/${String(detail.legalCase.id)}?tab=hearings`, {
                  replace: true,
                }),
              ),
          },
        }),
      ],
    });
  }
  const lookups = context.workspace.lookups;
  return h(
    'div',
    { class: 'timeline', style: 'padding:12px' },
    ...detail.hearings.map((row) => {
      const status = lookups.byId(String(row.hearing.status_id ?? ''));
      const isUpcoming =
        String(row.hearing.scheduled_at) >= new Date().toISOString();
      return h(
        'div',
        { class: 'timeline__item' },
        h(
          'span',
          {
            class: 'timeline__dot',
            style: isUpcoming
              ? 'background:var(--c-primary-soft);color:var(--c-primary)'
              : '',
          },
          icon(isUpcoming ? 'calendar' : 'check', 13),
        ),
        h(
          'div',
          { class: 'timeline__body' },
          h(
            'div',
            { class: 'row-wrap', style: 'gap:8px' },
            h('span', {
              class: 'timeline__title num',
              text: `${formatDate(String(row.hearing.scheduled_at), 'medium')} — ${formatTime(String(row.hearing.scheduled_at))}`,
            }),
            h('span', {
              class: `badge badge--${statusTone(status?.code ?? '')}`,
              text: row.statusName,
            }),
            h('span', { class: 'badge badge--quiet', text: row.purposeName }),
          ),
          h('p', {
            class: 'timeline__meta',
            text: `${row.courtName}${row.hearing.circuit_id ? ` · ${String(row.hearing.circuit_id).slice(0, 8)}` : ''}`,
          }),
          row.hearing.outcome_summary
            ? h('p', {
                class: 'text-sm',
                style: 'margin-block-start:6px',
                text: String(row.hearing.outcome_summary),
              })
            : null,
          row.hearing.court_decision
            ? h('p', {
                class: 'text-sm text-2',
                text: `قرار المحكمة: ${String(row.hearing.court_decision)}`,
              })
            : null,
          row.hearing.postponement_reason
            ? h('p', {
                class: 'text-xs text-3',
                text: `سبب التأجيل: ${String(row.hearing.postponement_reason)}`,
              })
            : null,
          h(
            'div',
            { class: 'row-wrap', style: 'margin-block-start:8px;gap:4px' },
            h('button', {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              text: 'تسجيل النتيجة',
              on: {
                click: () =>
                  openHearingOutcome(context, toHearingRow(context, row), () =>
                    navigate(
                      `/cases/${String(detail.legalCase.id)}?tab=hearings`,
                      { replace: true },
                    ),
                  ),
              },
            }),
            h('button', {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              text: 'تأجيل وإضافة جلسة جديدة',
              on: {
                click: () =>
                  openHearingDialog(
                    context,
                    detail,
                    () =>
                      navigate(
                        `/cases/${String(detail.legalCase.id)}?tab=hearings`,
                        { replace: true },
                      ),
                    String(row.hearing.id),
                  ),
              },
            }),
            h(
              'button',
              {
                class: 'icon-btn icon-btn--sm',
                type: 'button',
                title: 'حذف الجلسة',
                on: {
                  click: () => {
                    confirmDialog({
                      title: 'حذف الجلسة',
                      message:
                        'سيتم حذف الجلسة حذفًا منطقيًا ويمكن استعادتها من الأرشيف.',
                      confirmLabel: 'حذف',
                      danger: true,
                      onConfirm: async () => {
                        await context.workspace.db.softDelete(
                          'hearing',
                          String(row.hearing.id),
                        );
                        navigate(
                          `/cases/${String(detail.legalCase.id)}?tab=hearings`,
                          { replace: true },
                        );
                      },
                    });
                  },
                },
              },
              icon('trash', 14),
            ),
          ),
        ),
      );
    }),
  );
}

function judgmentsTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  if (detail.judgments.length === 0) {
    return h(
      'div',
      { style: 'padding:12px' },
      emptyState({
        iconName: 'stamp',
        title: 'لا أحكام مسجلة',
        text: 'سجّل الحكم بمنطوقه وتاريخ صدوره والمحكمة. اربطه بمرجع المستند دون ادعاء وجود الملف الأصلي.',
        actions: [
          h('button', {
            class: 'btn btn--primary btn--sm',
            type: 'button',
            text: 'تسجيل حكم',
            on: {
              click: () =>
                openJudgmentDialog(
                  context,
                  [
                    {
                      id: String(detail.legalCase.id),
                      label: `قضية ${String(detail.legalCase.case_number)} / ${String(detail.legalCase.case_year)}`,
                    },
                  ],
                  String(detail.legalCase.id),
                  () =>
                    navigate(
                      `/cases/${String(detail.legalCase.id)}?tab=judgments`,
                      { replace: true },
                    ),
                ),
            },
          }),
        ],
      }),
    );
  }
  return h(
    'div',
    { class: 'stack', style: 'gap:12px;padding:12px' },
    h(
      'div',
      { class: 'row-wrap', style: 'justify-content:flex-end' },
      h('button', {
        class: 'btn btn--primary btn--sm',
        type: 'button',
        text: 'تسجيل حكم',
        on: {
          click: () =>
            openJudgmentDialog(
              context,
              [
                {
                  id: String(detail.legalCase.id),
                  label: `قضية ${String(detail.legalCase.case_number)} / ${String(detail.legalCase.case_year)}`,
                },
              ],
              String(detail.legalCase.id),
              () =>
                navigate(
                  `/cases/${String(detail.legalCase.id)}?tab=judgments`,
                  { replace: true },
                ),
            ),
        },
      }),
      h('a', {
        class: 'btn btn--ghost btn--sm',
        href: `#/judgments?case=${String(detail.legalCase.id)}`,
        text: 'صفحة الأحكام',
      }),
    ),
    h(
      'div',
      { class: 'record-list' },
      ...detail.judgments.map((j) =>
        h(
          'div',
          { class: 'record-card' },
          h(
            'div',
            { class: 'record-card__head' },
            h('span', { class: 'avatar' }, icon('stamp', 17)),
            h(
              'div',
              { style: 'flex:1;min-inline-size:0' },
              h('h3', { class: 'record-card__title', text: j.typeName }),
              h('p', {
                class: 'text-xs text-3',
                text: `${j.statusName} · ${formatDate(String(j.judgment.issued_on), 'medium')} · ${j.judgment.court_id ? 'المحكمة مسجلة' : 'بلا محكمة'}`,
              }),
            ),
            h('a', {
              class: 'btn btn--ghost btn--sm',
              href: `#/judgments/${String(j.judgment.id)}`,
              text: 'تفاصيل',
            }),
          ),
          j.judgment.operative_part
            ? h('p', {
                class: 'text-sm',
                style: 'padding:0 12px 12px',
                text: String(j.judgment.operative_part),
              })
            : null,
          j.judgment.reasoning
            ? h('p', {
                class: 'text-xs text-3',
                style: 'padding:0 12px 12px',
                text: String(j.judgment.reasoning).slice(0, 180),
              })
            : null,
        ),
      ),
    ),
  );
}

function tasksTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  const lookups = context.workspace.lookups;
  if (detail.tasks.length === 0) {
    return h(
      'div',
      { style: 'padding:12px' },
      emptyState({
        iconName: 'tasks',
        title: 'لا أعمال إدارية',
        text: 'أضف عملًا مرتبطًا بالقضية مثل: استخراج صورة رسمية، مراجعة ملف، متابعة طلب، إيداع مذكرة.',
        actions: [
          h('button', {
            class: 'btn btn--primary btn--sm',
            type: 'button',
            text: 'إضافة عمل',
            on: {
              click: () =>
                openTaskDialog(context, detail, () =>
                  navigate(`/cases/${String(detail.legalCase.id)}?tab=tasks`, {
                    replace: true,
                  }),
                ),
            },
          }),
        ],
      }),
    );
  }
  return h(
    'div',
    { class: 'stack', style: 'gap:12px;padding:12px' },
    h(
      'div',
      { class: 'row-wrap', style: 'justify-content:flex-end' },
      h('button', {
        class: 'btn btn--primary btn--sm',
        type: 'button',
        text: 'إضافة عمل',
        on: {
          click: () =>
            openTaskDialog(context, detail, () =>
              navigate(`/cases/${String(detail.legalCase.id)}?tab=tasks`, {
                replace: true,
              }),
            ),
        },
      }),
      h('a', {
        class: 'btn btn--ghost btn--sm',
        href: `#/tasks?case=${String(detail.legalCase.id)}`,
        text: 'كل المهام',
      }),
    ),
    h(
      'div',
      { class: 'record-list' },
      ...detail.tasks.map((task) => {
        const statusCode =
          lookups.byId(String(task.status_id ?? ''))?.code ?? '';
        const isOverdue =
          task.due_at &&
          String(task.due_at) < new Date().toISOString() &&
          !['completed', 'cancelled'].includes(statusCode);
        return h(
          'div',
          {
            class: 'record-card',
            style: isOverdue
              ? 'border-inline-start:3px solid var(--c-danger)'
              : '',
          },
          h(
            'div',
            { class: 'record-card__head' },
            h('span', {
              class: `status-dot ${isOverdue ? 'status-dot--danger' : ''}`,
              style: `background:var(--c-${isOverdue ? 'danger' : 'primary'})`,
            }),
            h(
              'div',
              { style: 'flex:1;min-inline-size:0' },
              h('h3', {
                class: 'record-card__title',
                text: String(task.title),
              }),
              h('p', {
                class: 'text-xs text-3',
                text: `${lookupBadge(lookups, 'task_status', String(task.status_id ?? '')).textContent ?? ''} · ${task.due_at ? formatDate(String(task.due_at), 'short') : 'بلا موعد'}`,
              }),
            ),
            h(
              'div',
              { class: 'row', style: 'gap:4px' },
              h('button', {
                class: 'btn btn--ghost btn--sm',
                type: 'button',
                text: 'إنجاز',
                disabled: statusCode === 'completed',
                on: {
                  click: async () => {
                    await context.services.cases.changeTaskStatus(
                      String(task.id),
                      'completed',
                    );
                    toastSuccess('تم إنجاز العمل');
                    navigate(
                      `/cases/${String(detail.legalCase.id)}?tab=tasks`,
                      { replace: true },
                    );
                  },
                },
              }),
              h(
                'button',
                {
                  class: 'icon-btn icon-btn--sm',
                  type: 'button',
                  title: 'حذف',
                  on: {
                    click: () =>
                      confirmDialog({
                        title: 'حذف العمل',
                        message: `حذف «${String(task.title)}»؟`,
                        confirmLabel: 'حذف',
                        danger: true,
                        onConfirm: async () => {
                          await context.workspace.db.softDelete(
                            'task',
                            String(task.id),
                          );
                          navigate(
                            `/cases/${String(detail.legalCase.id)}?tab=tasks`,
                            { replace: true },
                          );
                        },
                      }),
                  },
                },
                icon('trash', 14),
              ),
            ),
          ),
          task.description
            ? h('p', {
                class: 'text-sm text-2',
                style: 'padding:0 12px 8px',
                text: String(task.description),
              })
            : null,
        );
      }),
    ),
  );
}

function announcementsTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  if (
    detail.announcements.length === 0 &&
    detail.tasks.filter(
      (t) =>
        String(t.task_type_id) ===
        context.workspace.lookups.id('task_type', 'announcement'),
    ).length === 0
  ) {
    return h(
      'div',
      { style: 'padding:12px' },
      emptyState({
        iconName: 'send',
        title: 'لا إعلانات مسجلة',
        text: 'الإعلانات والإنذارات وإعادة الإعلان تُدار عبر تبويب الأعمال أيضًا. أضف عمل إعلان ثم سجّل نتيجته.',
        actions: [
          h('a', {
            class: 'btn btn--outline btn--sm',
            href: '#/announcements?new=1',
            text: 'إضافة إعلان',
          }),
          h('button', {
            class: 'btn btn--primary btn--sm',
            type: 'button',
            text: 'عمل إعلان',
            on: { click: () => openAnnouncementTaskDialog(context, detail) },
          }),
        ],
      }),
    );
  }
  return h(
    'div',
    { class: 'stack', style: 'gap:12px;padding:12px' },
    sectionCard({
      title: 'سجل الإعلانات والإنذارات',
      subtitle:
        'تاريخ الإجراء · تاريخ الإرسال · النتيجة · إعادة الإعلان عند التعذر.',
      body: h(
        'div',
        { class: 'record-list' },
        ...detail.announcements.map((ann) =>
          h(
            'div',
            { class: 'record-card' },
            h(
              'div',
              { class: 'record-card__head' },
              icon('send', 16),
              h(
                'div',
                { style: 'flex:1' },
                h('h3', {
                  class: 'record-card__title',
                  text: String(
                    ann.kind_id
                      ? (context.workspace.lookups.byId(String(ann.kind_id))
                          ?.nameAr ?? 'إعلان')
                      : 'إعلان',
                  ),
                }),
                h('p', {
                  class: 'text-xs text-3',
                  text: `${ann.served_on ? `تم ${formatDate(String(ann.served_on), 'short')}` : 'لم يُحدد التسليم'} · ${context.workspace.lookups.byId(String(ann.status_id ?? ''))?.nameAr ?? '—'}`,
                }),
              ),
            ),
          ),
        ),
      ),
    }),
    sectionCard({
      title: 'الأعمال المرتبطة بالإعلانات',
      body:
        detail.tasks.filter(
          (t) =>
            context.workspace.lookups.byId(String(t.task_type_id ?? ''))
              ?.code === 'announcement',
        ).length === 0
          ? h('p', { class: 'text-sm text-3', text: 'لا أعمال إعلان مرتبطة.' })
          : h(
              'div',
              { class: 'stack', style: 'gap:6px' },
              ...detail.tasks
                .filter(
                  (t) =>
                    context.workspace.lookups.byId(String(t.task_type_id ?? ''))
                      ?.code === 'announcement',
                )
                .map((t) =>
                  h(
                    'div',
                    { class: 'record-card' },
                    h('p', { class: 'text-sm', text: String(t.title) }),
                    h('p', {
                      class: 'text-xs text-3',
                      text: t.due_at
                        ? formatDate(String(t.due_at), 'short')
                        : '',
                    }),
                  ),
                ),
            ),
    }),
  );
}

function documentsTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  if (detail.documents.length === 0) {
    return h(
      'div',
      { style: 'padding:12px' },
      emptyState({
        iconName: 'document',
        title: 'لا مستندات مرتبطة',
        text: 'مراجع المستندات تُربط بالقضية للوصول السريع. المحتوى قد يكون مرجعًا خارجيًا فقط وفق إعدادات النظام الحالي.',
        actions: [
          h('button', {
            class: 'btn btn--primary btn--sm',
            type: 'button',
            text: 'ربط مستند',
            on: {
              click: () =>
                openLinkDocumentDialog(context, detail, () =>
                  navigate(
                    `/cases/${String(detail.legalCase.id)}?tab=documents`,
                    { replace: true },
                  ),
                ),
            },
          }),
          h('a', {
            class: 'btn btn--outline btn--sm',
            href: '#/documents?new=1',
            text: 'إنشاء مستند',
          }),
        ],
      }),
    );
  }
  return h(
    'div',
    { class: 'stack', style: 'gap:12px;padding:12px' },
    h(
      'div',
      { class: 'row-wrap', style: 'justify-content:flex-end' },
      h('button', {
        class: 'btn btn--outline btn--sm',
        type: 'button',
        text: 'ربط مستند',
        on: {
          click: () =>
            openLinkDocumentDialog(context, detail, () =>
              navigate(`/cases/${String(detail.legalCase.id)}?tab=documents`, {
                replace: true,
              }),
            ),
        },
      }),
    ),
    h(
      'div',
      { class: 'record-list' },
      ...detail.documents.map((doc) =>
        h(
          'a',
          {
            class: 'attention-item',
            href: `#/documents?focus=${String(doc.id)}`,
          },
          h('span', { class: 'attention-item__icon' }, icon('document', 16)),
          h(
            'span',
            { class: 'attention-item__body' },
            h('span', {
              class: 'attention-item__title',
              text: String(doc.title),
            }),
            h('span', {
              class: 'attention-item__desc',
              text: String(
                doc.document_type_id
                  ? (context.workspace.lookups.byId(
                      String(doc.document_type_id),
                    )?.nameAr ?? '')
                  : '',
              ),
            }),
          ),
          h(
            'button',
            {
              class: 'icon-btn icon-btn--sm',
              type: 'button',
              title: 'فك الارتباط',
              on: {
                click: async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const links = await context.workspace.db.query(
                    'document_link',
                    {
                      filters: [
                        {
                          column: 'document_id',
                          op: 'eq',
                          value: String(doc.id),
                        },
                        {
                          column: 'case_id',
                          op: 'eq',
                          value: String(detail.legalCase.id),
                        },
                      ],
                      limit: 5,
                    },
                  );
                  const link = links.rows[0] as unknown as
                    | EngineRow
                    | undefined;
                  if (!link) return;
                  confirmDialog({
                    title: 'فك ارتباط المستند',
                    message: `فك ارتباط «${String(doc.title)}»؟ يبقى المستند نفسه محفوظًا.`,
                    confirmLabel: 'فك الارتباط',
                    onConfirm: async () => {
                      await context.workspace.db.softDelete(
                        'document_link',
                        String(link.id),
                      );
                      navigate(
                        `/cases/${String(detail.legalCase.id)}?tab=documents`,
                        { replace: true },
                      );
                    },
                  });
                },
              },
            },
            icon('unlink', 14),
          ),
        ),
      ),
    ),
  );
}

function contractsTab(_context: PageArgs, detail: CaseDetail): HTMLElement {
  return h(
    'div',
    { class: 'stack', style: 'gap:12px;padding:12px' },
    notice(
      'info',
      'العقود والتوكيلات مرتبطة بالملفات القانونية للقضية. انتقل إلى الملف لعرض التفاصيل وإدارة المدة والصلاحية.',
      { iconName: 'briefcase' },
    ),
    detail.files.length === 0
      ? h('p', {
          class: 'text-sm text-3',
          text: 'لا ملفات مرتبطة لعرض العقود والتوكيلات.',
        })
      : h(
          'div',
          { class: 'stack', style: 'gap:8px' },
          ...detail.files.map((file) =>
            h(
              'a',
              {
                class: 'menu__item',
                href: `#/contracts?file=${String(file.id)}`,
                style: 'text-decoration:none',
              },
              icon('briefcase', 16),
              h('span', { text: `عقود/توكيلات ملف: ${String(file.title)}` }),
              h('span', {
                class: 'badge badge--quiet',
                text: String(file.file_number),
              }),
            ),
          ),
        ),
    h(
      'div',
      { class: 'row-wrap' },
      h('a', {
        class: 'btn btn--outline btn--sm',
        href: '#/contracts?new=1',
        text: 'إضافة تعاقد',
      }),
      h('a', {
        class: 'btn btn--ghost btn--sm',
        href: '#/contracts?tab=poa&new=1',
        text: 'إضافة توكيل',
      }),
    ),
  );
}

function financeTab(_context: PageArgs, detail: CaseDetail): HTMLElement {
  const outstanding = detail.outstandingMinor;
  return h(
    'div',
    { class: 'stack', style: 'gap:12px;padding:12px' },
    outstanding === null
      ? notice(
          'neutral',
          'لا بيانات مالية مرتبطة مباشرة بهذه القضية. المالية مرتبطة بالملفات القانونية.',
          { iconName: 'wallet' },
        )
      : outstanding > 0
        ? notice(
            'warning',
            `يوجد مستحقات غير محصلة بقيمة ${formatMoney(outstanding)} على ملفات القضية. راجع تفاصيل المالية في الملف.`,
            { title: 'مستحقات', iconName: 'wallet' },
          )
        : notice('success', 'لا مستحقات معلقة على ملفات هذه القضية.', {
            iconName: 'check',
          }),
    detail.files.length === 0
      ? h('p', { class: 'text-sm text-3', text: 'لا ملفات لعرض المالية.' })
      : h(
          'div',
          { class: 'grid-2' },
          ...detail.files.map((file) =>
            h(
              'a',
              {
                class: 'card',
                href: `#/finance?file=${String(file.id)}`,
                style: 'text-decoration:none;color:inherit',
              },
              h(
                'div',
                { class: 'card__body' },
                h('h3', { class: 'card__title', text: String(file.title) }),
                h('p', {
                  class: 'text-xs text-3',
                  text: String(file.file_number),
                }),
                h('p', {
                  class: 'text-sm',
                  style: 'margin-block-start:8px',
                  text: 'عرض الأتعاب والمستحقات والمدفوعات',
                }),
              ),
            ),
          ),
        ),
  );
}

function notesTab(context: PageArgs, detail: CaseDetail): HTMLElement {
  return h(
    'div',
    { class: 'stack', style: 'gap:12px;padding:12px' },
    h(
      'div',
      { class: 'row-wrap', style: 'justify-content:flex-end' },
      h('button', {
        class: 'btn btn--primary btn--sm',
        type: 'button',
        text: 'إضافة ملاحظة',
        on: {
          click: () =>
            openNoteDialog(context, detail, () =>
              navigate(`/cases/${String(detail.legalCase.id)}?tab=notes`, {
                replace: true,
              }),
            ),
        },
      }),
    ),
    detail.notes.length === 0
      ? emptyState({
          iconName: 'edit',
          title: 'لا ملاحظات',
          text: 'سجّل ملاحظاتك الداخلية المرتبطة بالقضية. تُحفظ محليًا وتبقى ضمن السجل.',
        })
      : h(
          'div',
          { class: 'record-list' },
          ...detail.notes.map((note) =>
            h(
              'div',
              { class: 'record-card' },
              h(
                'div',
                { class: 'record-card__head' },
                h('span', { class: 'avatar' }, icon('edit', 14)),
                h(
                  'div',
                  { style: 'flex:1' },
                  h('h3', {
                    class: 'record-card__title',
                    text: String(note.body).slice(0, 60),
                  }),
                  h('p', {
                    class: 'text-xs text-3',
                    text: `${formatRelative(String(note.created_at))}${note.is_private ? ' · خاصة' : ''}`,
                  }),
                ),
              ),
              h('p', {
                class: 'text-sm',
                style: 'padding:8px 12px',
                text: String(note.body),
              }),
            ),
          ),
        ),
  );
}

function activityTab(_context: PageArgs, detail: CaseDetail): HTMLElement {
  if (detail.activity.length === 0)
    return h('p', {
      class: 'text-sm text-3',
      style: 'padding:16px',
      text: 'لا سجل نشاط بعد. سجل التغييرات يظهر هنا بعد كل تعديل.',
    });
  return h(
    'div',
    { class: 'timeline', style: 'padding:12px' },
    ...detail.activity.map((entry) =>
      h(
        'div',
        { class: 'timeline__item' },
        h('span', { class: 'timeline__dot' }, icon('history', 12)),
        h(
          'div',
          { class: 'timeline__body' },
          h('p', {
            class: 'timeline__title',
            text: String(entry.action ?? 'تعديل'),
          }),
          h('p', {
            class: 'timeline__meta',
            text: `${String(entry.summary ?? '')} · ${formatRelative(String(entry.occurred_at ?? entry.created_at))}`,
          }),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dialogs: create / edit / parties / links / hearings / judgments etc.
// ---------------------------------------------------------------------------
export async function openCaseForm(
  context: PageArgs,
  onSaved?: () => void,
  presetFileId?: string,
): Promise<void> {
  await openCaseIntake(context, {
    ...(onSaved ? { onSaved } : {}),
    ...(presetFileId ? { fileId: presetFileId } : {}),
  });
}
export async function openCaseEditDialog(
  context: PageArgs,
  detail: CaseDetail,
  onSaved?: () => void,
): Promise<void> {
  await openCaseIntake(context, {
    caseId: String(detail.legalCase.id),
    ...(detail.files[0] ? { fileId: String(detail.files[0].id) } : {}),
    ...(onSaved ? { onSaved } : {}),
  });
}

function openCaseMenu(context: PageArgs, detail: CaseDetail): void {
  const caseId = String(detail.legalCase.id);
  const isArchived = Boolean(detail.legalCase.archived_at);
  const actions: Array<{
    label: string;
    icon: string;
    danger?: boolean;
    onSelect: () => void;
  }> = [
    {
      label: isArchived ? 'استعادة من الأرشيف' : 'أرشفة القضية',
      icon: 'archive',
      onSelect: () => {
        if (isArchived) {
          confirmDialog({
            title: 'استعادة القضية',
            message: 'إعادة القضية إلى القائمة النشطة؟',
            confirmLabel: 'استعادة',
            onConfirm: async () => {
              await context.services.cases.restoreArchived(caseId);
              toastSuccess('تمت الاستعادة');
              navigate(`/cases/${caseId}`, { replace: true });
            },
          });
        } else {
          confirmDialog({
            title: 'أرشفة القضية',
            message:
              'ستُنقل القضية إلى الأرشيف مع حفظ جلساتها وأحكامها ويمكن استعادتها لاحقًا.',
            confirmLabel: 'أرشفة',
            onConfirm: async () => {
              await context.services.cases.archive(caseId);
              toastSuccess('تمت الأرشفة');
              navigate(`/cases/${caseId}`, { replace: true });
            },
          });
        }
      },
    },
    {
      label: 'نسخ رابط القضية',
      icon: 'link',
      onSelect: () => {
        void navigator.clipboard?.writeText(
          `${window.location.origin}${window.location.pathname}#\/cases\/${caseId}`,
        );
        toastSuccess('تم نسخ الرابط');
      },
    },
    {
      label: 'حذف القضية (سلة المحذوفات)',
      icon: 'trash',
      danger: true,
      onSelect: () => {
        confirmDialog({
          title: 'حذف القضية',
          message:
            'سيتم نقل القضية إلى سلة المحذوفات. يمكن استعادتها من الأرشيف. لا يُحذف ملف القضية.',
          confirmLabel: 'حذف',
          danger: true,
          onConfirm: async () => {
            await context.services.cases.softDelete(caseId);
            toastSuccess('تم الحذف المنطقي');
            navigate('/cases');
          },
        });
      },
    },
  ];
  // Use anchored menu helper via opening a small dialog list
  const menu = h(
    'div',
    { class: 'stack', style: 'gap:4px' },
    ...actions.map((a) =>
      h(
        'button',
        {
          class: `btn ${a.danger ? 'btn--danger-ghost' : 'btn--ghost'}`,
          type: 'button',
          on: {
            click: () => {
              handle.close();
              a.onSelect();
            },
          },
        },
        icon(a.icon, 16),
        h('span', { text: a.label }),
      ),
    ),
  );
  const handle = openDialog({
    title: 'إجراءات إضافية',
    iconName: 'more',
    size: 'sm',
    content: menu,
  });
}

function openLinkFileDialog(
  context: PageArgs,
  detail: CaseDetail,
  onSaved?: () => void,
): void {
  const picker = entityPicker({
    name: 'fileId',
    label: 'اختر الملف',
    placeholder: 'ابحث برقم الملف…',
    search: (q) => context.services.files.searchOptions(q, 10),
  });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:12px' },
    picker.root,
    h('p', {
      class: 'text-xs text-3',
      text: 'يربط القضية بالملف دون تكرار بيانات الأطراف أو المستندات المشتركة.',
    }),
  );
  openFormDialog({
    title: 'ربط القضية بملف',
    iconName: 'folder',
    size: 'md',
    content,
    submitLabel: 'ربط',
    successMessage: 'تم الربط',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async () => {
      const fileId = picker.getValue();
      if (!fileId) throw new Error('اختر الملف أولًا');
      await context.services.cases.linkFile(
        String(detail.legalCase.id),
        fileId,
      );
    },
  });
}

function openPartyDialog(
  context: PageArgs,
  detail: CaseDetail,
  onSaved?: () => void,
): void {
  const lookups = context.workspace.lookups;
  if (detail.files.length === 0) {
    toastError('اربط القضية بملف أولًا لإضافة الأطراف');
    return;
  }
  const fileIds = detail.files.map((f) => String(f.id));
  // file selector if multiple
  const fileSelect =
    fileIds.length > 1
      ? h(
          'div',
          { class: 'field' },
          h('label', { class: 'field__label', text: 'الملف' }),
          h(
            'select',
            { class: 'input select', name: 'fileId' },
            ...fileIds.map((id, i) =>
              h('option', {
                value: id,
                text: String(detail.files[i]?.title ?? id),
              }),
            ),
          ),
          h('p', { class: 'field__error' }),
        )
      : null;
  const partyPicker = entityPicker({
    name: 'partyId',
    label: 'الطرف (شخص أو جهة)',
    placeholder: 'ابحث باسم الطرف…',
    search: async (q) => {
      const results = await context.services.parties.searchOptions(q, 10);
      return results;
    },
  });
  const roleField = selectField({
    label: 'صفة الطرف في القضية',
    name: 'roleCode',
    required: true,
    options: lookups
      .items('party_role')
      .map((i) => ({ value: i.code, label: i.nameAr })),
    value: 'defendant',
  });
  const sideField = selectField({
    label: 'الجانب',
    name: 'sideCode',
    options: lookups
      .items('party_side')
      .map((i) => ({ value: i.code, label: i.nameAr })),
    value: 'defendant',
  });
  const officeClient = checkboxField({
    label: 'هذا الطرف يمثله المكتب في هذه الدعوى',
    name: 'isOfficeClient',
  });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    fileSelect ??
      h('p', {
        class: 'text-xs text-3',
        text: `الملف: ${String(detail.files[0]?.title)}`,
      }),
    partyPicker.root,
    roleField,
    sideField,
    officeClient,
  );

  openFormDialog({
    title: 'إضافة طرف إلى القضية',
    description:
      'يُستند إلى سجل الشخص/الجهة الأصلي، ثم تُنشأ علاقة خاصة بالقضية.',
    iconName: 'users',
    size: 'lg',
    content,
    submitLabel: 'إضافة الطرف',
    successMessage: 'تمت إضافة الطرف',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const v = readForm(form);
      const partyId = partyPicker.getValue();
      if (!partyId) {
        setFieldError(form, 'partyId', 'اختر الطرف');
        throw new Error('اختر الطرف');
      }
      if (!v.roleCode) {
        setFieldError(form, 'roleCode', 'اختر الصفة');
        throw new Error('الصفة مطلوبة');
      }
      const fileId = fileSelect
        ? (form.querySelector<HTMLSelectElement>('select[name="fileId"]')
            ?.value ?? fileIds[0]!)
        : fileIds[0]!;
      await context.services.cases.addParty({
        caseId: String(detail.legalCase.id),
        fileId,
        partyId,
        roleCode: v.roleCode,
        isClient: officeClient.querySelector('input')!.checked,
        ...(v.sideCode ? { sideCode: v.sideCode } : {}),
      });
    },
  });
}

function openChangeRoleDialog(
  context: PageArgs,
  detail: CaseDetail,
  entry: CaseDetail['parties'][number],
  onSaved?: () => void,
): void {
  const lookups = context.workspace.lookups;
  const roleField = selectField({
    label: 'الصفة الإجرائية',
    name: 'roleCode',
    required: true,
    options: lookups
      .items('party_role')
      .map((i) => ({ value: i.code, label: i.nameAr })),
    value: entry.roleCode || 'other',
  });
  const sideField = selectField({
    label: 'الجانب',
    name: 'sideCode',
    options: lookups
      .items('party_side')
      .map((i) => ({ value: i.code, label: i.nameAr })),
    value: entry.sideCode,
  });
  const officeClient = checkboxField({
    label: 'هذا الطرف يمثله المكتب في هذه الدعوى',
    name: 'isOfficeClient',
    checked: entry.isOfficeClient,
  });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h('p', {
      class: 'text-sm',
      text: `تعديل صفة: ${String(entry.party.display_name)} — التغيير يخص هذه الدعوى وحدها ولا يغير صفة الشخص في درجات أخرى.`,
    }),
    roleField,
    sideField,
    officeClient,
  );
  openFormDialog({
    title: 'تعديل صفة الطرف',
    iconName: 'edit',
    content,
    submitLabel: 'حفظ',
    successMessage: 'تم تحديث الصفة',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const v = readForm(form);
      const roleCode = v.roleCode || 'other';
      const sideCode = v.sideCode || undefined;
      await context.services.cases.updatePartyRole(
        entry.linkId,
        roleCode,
        sideCode ?? '',
        officeClient.querySelector('input')!.checked,
        String(detail.legalCase.id),
      );
    },
  });
}

function confirmRemoveParty(
  context: PageArgs,
  entry: CaseDetail['parties'][number],
  onDone: () => void,
): void {
  confirmDialog({
    title: 'إزالة الطرف من القضية',
    message: `إزالة «${String(entry.party.display_name)}» بصفة ${entry.roleName} من هذه القضية؟ لن يُحذف سجل الشخص الأساسي.`,
    confirmLabel: 'إزالة',
    danger: true,
    onConfirm: async () => {
      await context.services.cases.removeParty(entry.linkId);
      toastSuccess('تمت الإزالة');
      onDone();
    },
  });
}

function openLinkCaseDialog(
  context: PageArgs,
  detail: CaseDetail,
  onSaved?: () => void,
): void {
  const lookups = context.workspace.lookups;
  const casePicker = entityPicker({
    name: 'targetCaseId',
    label: 'القضية المرتبطة',
    placeholder: 'ابحث برقم الدعوى…',
    search: (q) => context.services.cases.searchOptions(q, 10),
  });
  const relationField = selectField({
    label: 'نوع العلاقة',
    name: 'relationTypeCode',
    required: true,
    options: lookups
      .items('case_relation_type')
      .map((i) => ({ value: i.code, label: i.nameAr })),
    value: 'related',
  });
  const notesField = textareaField({
    label: 'ملاحظات',
    name: 'notes',
    rows: 2,
    maxlength: 500,
  });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    casePicker.root,
    relationField,
    notesField,
    h('p', {
      class: 'text-xs text-3',
      text: 'لا تنشئ علاقة دائرية غير منطقية. نوع العلاقة صريح (مرتبطة، استئناف عن، نقض في…).',
    }),
  );
  openFormDialog({
    title: 'ربط قضية أخرى',
    description: `ربط قضية بـ ${String(detail.legalCase.case_number)} / ${String(detail.legalCase.case_year)}`,
    iconName: 'layers',
    content,
    submitLabel: 'ربط',
    successMessage: 'تم الربط',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const v = readForm(form);
      const targetId = casePicker.getValue();
      if (!targetId) throw new Error('اختر القضية المرتبطة');
      if (targetId === String(detail.legalCase.id))
        throw new Error('لا يمكن ربط القضية بنفسها');
      await context.services.cases.linkCases(
        String(detail.legalCase.id),
        targetId,
        v.relationTypeCode,
        v.notes,
      );
    },
  });
}

function confirmUnlinkCase(
  context: PageArgs,
  linkId: string,
  onDone: () => void,
): void {
  confirmDialog({
    title: 'فك الارتباط',
    message: 'فك ارتباط القضيتين؟ يبقى كل سجل محفوظًا.',
    confirmLabel: 'فك الارتباط',
    onConfirm: async () => {
      await context.services.cases.unlinkCases(linkId);
      toastSuccess('تم فك الارتباط');
      onDone();
    },
  });
}

function openTaskDialog(
  context: PageArgs,
  detail: CaseDetail,
  onSaved?: () => void,
): void {
  const lookups = context.workspace.lookups;
  const title = textField({
    label: 'عنوان العمل',
    name: 'title',
    required: true,
    maxlength: 200,
    placeholder: 'مثال: متابعة إعلان الخصم',
  });
  const type = selectField({
    label: 'نوع العمل',
    name: 'taskTypeCode',
    options: lookups
      .items('task_type')
      .map((i) => ({ value: i.code, label: i.nameAr })),
    value: 'administrative',
  });
  const due = dateField({ label: 'تاريخ الاستحقاق', name: 'dueAt' });
  const desc = textareaField({ label: 'الوصف', name: 'description', rows: 3 });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    title,
    h('div', { class: 'form-grid' }, type, due),
    desc,
  );
  openFormDialog({
    title: 'عمل إداري للقضية',
    description: 'يظهر العمل داخل القضية وفي صفحة المهام المركزية.',
    iconName: 'tasks',
    content,
    submitLabel: 'إنشاء العمل',
    successMessage: 'تم إنشاء العمل',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const v = readForm(form);
      if (!v.title) {
        setFieldError(form, 'title', 'العنوان مطلوب');
        throw new Error('العنوان مطلوب');
      }
      await context.services.cases.createTask({
        caseId: String(detail.legalCase.id),
        title: v.title,
        ...(v.taskTypeCode ? { taskTypeCode: v.taskTypeCode } : {}),
        ...(v.dueAt ? { dueAt: v.dueAt } : {}),
        ...(v.description ? { description: v.description } : {}),
        ...(detail.files[0] ? { fileId: String(detail.files[0].id) } : {}),
      });
    },
  });
}

function openAnnouncementTaskDialog(
  context: PageArgs,
  detail: CaseDetail,
): void {
  const lookups = context.workspace.lookups;
  const title = textField({
    label: 'عنوان الإعلان',
    name: 'title',
    required: true,
    value: `إعلان في قضية ${String(detail.legalCase.case_number)} / ${String(detail.legalCase.case_year)}`,
  });
  const due = dateField({ label: 'تاريخ الاستحقاق', name: 'dueAt' });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    title,
    due,
    h('p', {
      class: 'text-xs text-3',
      text: 'سيُنشأ عمل إداري بنوع «إعلان» مرتبط بهذه القضية.',
    }),
  );
  openFormDialog({
    title: 'إنشاء مهمة إعلان',
    iconName: 'send',
    content,
    submitLabel: 'إنشاء',
    successMessage: 'تم إنشاء مهمة الإعلان',
    onSuccess: () =>
      navigate(`/cases/${String(detail.legalCase.id)}?tab=announcements`, {
        replace: true,
      }),
    onSubmit: async (form) => {
      const v = readForm(form);
      if (!v.title) throw new Error('العنوان مطلوب');
      await context.services.cases.createTask({
        caseId: String(detail.legalCase.id),
        title: v.title,
        taskTypeCode: 'announcement',
        ...(v.dueAt ? { dueAt: v.dueAt } : {}),
        ...(detail.files[0] ? { fileId: String(detail.files[0].id) } : {}),
      });
      void lookups;
    },
  });
}

function openNoteDialog(
  context: PageArgs,
  detail: CaseDetail,
  onSaved?: () => void,
): void {
  const body = textareaField({
    label: 'نص الملاحظة',
    name: 'body',
    required: true,
    rows: 4,
    maxlength: 3000,
  });
  const isPrivate = h(
    'label',
    { class: 'check-row' },
    h('input', { class: 'checkbox', type: 'checkbox', name: 'isPrivate' }),
    h('span', { text: 'ملاحظة خاصة (لا تُطبع في التقارير العامة)' }),
  );
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    body,
    isPrivate,
  );
  openFormDialog({
    title: 'إضافة ملاحظة',
    iconName: 'edit',
    content,
    submitLabel: 'حفظ',
    successMessage: 'تم حفظ الملاحظة',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const v = readForm(form);
      if (!v.body) {
        setFieldError(form, 'body', 'نص الملاحظة مطلوب');
        throw new Error('الملاحظة مطلوبة');
      }
      const isPrivateChecked =
        form.querySelector<HTMLInputElement>('input[name="isPrivate"]')
          ?.checked ?? false;
      const fileId = detail.files[0] ? String(detail.files[0].id) : '';
      if (!fileId) throw new Error('اربط القضية بملف أولًا لحفظ الملاحظة');
      await context.services.cases.addNote({
        caseId: String(detail.legalCase.id),
        fileId,
        body: v.body,
        isPrivate: isPrivateChecked,
      });
    },
  });
}

function openLinkDocumentDialog(
  context: PageArgs,
  detail: CaseDetail,
  onSaved?: () => void,
): void {
  const picker = entityPicker({
    name: 'documentId',
    label: 'المستند',
    placeholder: 'ابحث بعنوان المستند…',
    search: async (q) => {
      // Use document service search
      const page = await context.workspace.db
        .searchPage(q, { entityType: 'document', limit: 10 })
        .catch(() => ({ hits: [] as never[] }));
      const hits = (page as { hits: Array<{ entityId: string }> }).hits ?? [];
      const opts: Array<{
        value: string;
        label: string;
        description?: string;
      }> = [];
      for (const hit of hits) {
        const doc = await context.workspace.db.get('document', hit.entityId);
        if (doc)
          opts.push({
            value: String(doc.id),
            label: String(doc.title),
            description: String(doc.document_type_id ?? ''),
          });
      }
      if (opts.length === 0 && !q.trim()) {
        const recent = await context.workspace.db.query('document', {
          limit: 10,
          orderBy: [{ column: 'created_at', direction: 'desc' }],
        });
        for (const r of recent.rows)
          opts.push({
            value: String((r as EngineRow).id),
            label: String((r as EngineRow).title),
          });
      }
      return opts;
    },
  });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:12px' },
    picker.root,
    h('p', {
      class: 'text-xs text-3',
      text: 'يربط مرجع المستند بالقضية دون تكرار سجله. استخدم إدارة المستندات لرفع/تحقق المرجع.',
    }),
  );
  openFormDialog({
    title: 'ربط مستند بالقضية',
    iconName: 'document',
    content,
    submitLabel: 'ربط',
    successMessage: 'تم ربط المستند',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async () => {
      const documentId = picker.getValue();
      if (!documentId) throw new Error('اختر المستند');
      await context.services.cases.linkDocument(
        documentId,
        String(detail.legalCase.id),
      );
    },
  });
}

// Reuse existing hearing/judgment dialogs but adapted to new signature
export function openHearingDialog(
  context: PageArgs,
  detail: CaseDetail,
  onSaved?: () => void,
  previousHearingId?: string,
): void {
  const lookups = context.workspace.lookups;
  const scheduledAt = dateField({
    label: 'تاريخ الجلسة',
    name: 'date',
    required: true,
    value: isoDateToday(),
  });
  const time = textField({
    label: 'الوقت',
    name: 'time',
    type: 'text',
    required: true,
    value: '10:00',
    dir: 'ltr',
    inputmode: 'numeric',
    help: 'بتوقيت القاهرة. الصيغة 24 ساعة (مثال 10:30).',
  });
  const purpose = selectField({
    label: 'غرض الجلسة',
    name: 'purposeCode',
    options: lookups
      .items('hearing_purpose')
      .map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'first_hearing',
  });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h('div', { class: 'form-grid' }, scheduledAt, time),
    purpose,
  );

  openFormDialog({
    title: previousHearingId ? 'تأجيل الجلسة وإضافة جلسة جديدة' : 'إضافة جلسة',
    description: `قضية ${String(detail.legalCase.case_number)} / ${String(detail.legalCase.case_year)} — ${detail.courtName}`,
    iconName: 'gavel',
    content,
    submitLabel: 'حفظ الجلسة',
    successMessage: 'تم حفظ الجلسة محليًا',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.date) {
        setFieldError(form, 'date', 'تاريخ الجلسة مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      if (!/^\d{1,2}:\d{2}$/.test(values.time ?? '')) {
        setFieldError(form, 'time', 'أدخل الوقت بصيغة 24 ساعة، مثل 09:30.');
        throw new Error('الوقت غير صحيح.');
      }
      const [hoursText, minutesText] = (values.time ?? '10:00').split(':');
      const hours = Number(hoursText);
      const minutes = Number(minutesText);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        setFieldError(form, 'time', 'الوقت خارج النطاق.');
        throw new Error('الوقت غير صحيح.');
      }
      const local = new Date(
        `${values.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
      );
      const iso = local.toISOString();
      if (previousHearingId) {
        await context.services.cases.scheduleNext(previousHearingId, iso);
      } else {
        await context.services.cases.scheduleHearing({
          caseId: String(detail.legalCase.id),
          scheduledAt: iso,
          ...(values.purposeCode ? { purposeCode: values.purposeCode } : {}),
          ...(detail.legalCase.court_id
            ? { courtId: String(detail.legalCase.court_id) }
            : {}),
        });
      }
    },
  });
}

export function openJudgmentDialog(
  context: PageArgs,
  cases: Array<{ id: string; label: string }>,
  presetCaseId?: string,
  onSaved?: () => void,
): void {
  const lookups = context.workspace.lookups;
  const caseSelect = h(
    'div',
    { class: 'field' },
    h(
      'label',
      { class: 'field__label', attrs: { for: 'judgment-case' } },
      h('span', { text: 'القضية' }),
      h('span', { class: 'field__required', text: ' *' }),
    ),
    h(
      'select',
      { class: 'input select', name: 'caseId', id: 'judgment-case' },
      h('option', { value: '', text: '— اختر القضية —' }),
      ...cases.map((entry) =>
        h('option', {
          value: entry.id,
          text: entry.label,
          ...(entry.id === presetCaseId ? { selected: true } : {}),
        }),
      ),
    ),
    h('p', { class: 'field__error' }),
  );
  const issuedOn = dateField({
    label: 'تاريخ صدور الحكم',
    name: 'issuedOn',
    required: true,
    value: isoDateToday(),
  });
  const type = selectField({
    label: 'نوع الحكم',
    name: 'judgmentTypeCode',
    required: true,
    options: lookups
      .items('judgment_type')
      .map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'preliminary',
  });
  const status = selectField({
    label: 'حالة الحكم',
    name: 'statusCode',
    options: lookups
      .items('judgment_status')
      .map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'issued',
  });
  const operative = textareaField({
    label: 'منطوق الحكم',
    name: 'operativePart',
    rows: 3,
    maxlength: 3000,
  });
  const reasoning = textareaField({
    label: 'الأسباب (اختياري)',
    name: 'reasoning',
    rows: 3,
    maxlength: 3000,
  });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    caseSelect,
    h('div', { class: 'form-grid' }, type, issuedOn),
    status,
    operative,
    reasoning,
  );

  openFormDialog({
    title: 'تسجيل حكم',
    description:
      'يُسجَّل الحكم على القضية ويظهر في صفحة الأحكام وفي ملف القضية.',
    iconName: 'stamp',
    size: 'lg',
    content,
    submitLabel: 'حفظ الحكم',
    successMessage: 'تم تسجيل الحكم',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.caseId) {
        setFieldError(form, 'caseId', 'اختر القضية.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      if (!values.issuedOn) {
        setFieldError(form, 'issuedOn', 'تاريخ صدور الحكم مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      await context.services.cases.recordJudgment({
        caseId: values.caseId,
        issuedOn: values.issuedOn,
        ...(values.judgmentTypeCode
          ? { judgmentTypeCode: values.judgmentTypeCode }
          : {}),
        ...(values.statusCode ? { statusCode: values.statusCode } : {}),
        ...(values.operativePart
          ? { operativePart: values.operativePart }
          : {}),
        ...(values.reasoning ? { reasoning: values.reasoning } : {}),
      });
    },
  });
}

function toHearingRow(context: PageArgs, row: CaseDetail['hearings'][number]) {
  return {
    hearing: row.hearing as EngineRow,
    caseLabel: `قضية ${row.caseNumber} / ${row.caseYear}`,
    caseNumber: row.caseNumber,
    caseYear: row.caseYear,
    courtName: row.courtName,
    purposeName: row.purposeName,
    statusName: row.statusName,
    statusCode:
      context.workspace.lookups.byId(
        String((row.hearing as EngineRow).status_id ?? ''),
      )?.code ?? '',
    clientNames: [],
  };
}
