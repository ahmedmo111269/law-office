import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber } from '../format.ts';
import { emptyState, notice, pageHeader } from '../components/page.ts';
import { toastError, toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import type { PageArgs } from '../app/context.ts';
import type { ReportId, ReportResult } from '../services/reports.ts';

const REPORTS: Array<{ id: ReportId; label: string; description: string; icon: string }> = [
  { id: 'files', label: 'الملفات', description: 'توزيع الملفات على الحالات ومجالات الممارسة.', icon: 'folder' },
  { id: 'cases', label: 'القضايا', description: 'القضايا حسب المحكمة والنوع.', icon: 'scale' },
  { id: 'hearings', label: 'الجلسات', description: 'الجلسات القادمة خلال فترة محددة.', icon: 'gavel' },
  { id: 'finance', label: 'المالية', description: 'التحصيل والمصروفات شهريًا.', icon: 'wallet' },
  { id: 'workload', label: 'عبء العمل', description: 'توزيع المهام والمتأخر منها.', icon: 'tasks' },
  { id: 'clients', label: 'العملاء', description: 'العملاء حسب الحالة والمصدر والشهر.', icon: 'users' },
];

export async function renderReports(context: PageArgs): Promise<HTMLElement> {
  const initial = (context.query.get('report') as ReportId | null) ?? 'files';
  const initialId = REPORTS.some((report) => report.id === initial) ? initial : 'files';
  let current: ReportId = initialId;
  let result: ReportResult | null = null;
  let rangeDays = 30;
  let busy = false;

  const body = h('div', { class: 'report-body' });
  const summary = h('div', { class: 'hero-band' });
  const rangeHost = h('div', { class: 'row-wrap', style: 'gap:6px' });

  const rangeControl = (): HTMLElement => {
    rangeHost.replaceChildren();
    if (current !== 'hearings') {
      rangeHost.hidden = true;
      return rangeHost;
    }
    rangeHost.hidden = false;
    for (const days of [7, 30, 60, 90]) {
      rangeHost.appendChild(
        h('button', {
          class: `chip chip--button${days === rangeDays ? ' chip--active' : ''}`,
          type: 'button',
          attrs: { 'aria-pressed': String(days === rangeDays) },
          text: `${formatNumber(days)} يومًا`,
          on: {
            click: () => {
              rangeDays = days;
              void load();
            },
          },
        }),
      );
    }
    return rangeHost;
  };

  const load = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    body.replaceChildren(h('div', { class: 'route-loading' }, h('span', { class: 'spinner' }), h('span', { text: 'جارٍ حساب التقرير من البيانات الفعلية…' })));
    try {
      result = await context.services.reports.build(current, rangeDays);
      renderResult();
      const url = new URL(window.location.href);
      url.hash = `#/reports${current === 'files' ? '' : `?report=${current}`}`;
      window.history.replaceState(null, '', url.toString());
      rangeControl();
    } catch (error) {
      const ui = toUiError(error);
      body.replaceChildren(notice('danger', ui.message, { iconName: 'alert' }));
    } finally {
      busy = false;
    }
  };

  const renderResult = (): void => {
    const report = result;
    if (!report) return;
    summary.replaceChildren(
      h(
        'div',
        { class: 'hero-band__main' },
        h('span', { class: 'hero-band__eyebrow', text: 'تقرير' }),
        h('h2', { class: 'hero-band__title', text: report.title }),
        h('p', { class: 'hero-band__sub', text: report.description }),
        h('p', { class: 'text-xs text-3', text: `أُنشئ ${formatDate(report.generatedAt, 'medium')} · ${report.total}` }),
      ),
      h(
        'div',
        { class: 'hero-band__actions' },
        h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => window.print() } }, icon('print', 16), h('span', { text: 'طباعة' })),
        h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => exportCsv(report) } }, icon('download', 16), h('span', { text: 'CSV' })),
      ),
    );
    const table = h(
      'table',
      { class: 'data-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          ...report.columns.map((column) =>
            h('th', { class: column.align === 'end' ? 'is-numeric' : '', text: column.label }),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        ...report.rows.map((row) =>
          h(
            'tr',
            null,
            ...row.cells.map((cell, index) =>
              h('td', {
                class: [
                  report.columns[index]?.align === 'end' ? 'is-numeric' : '',
                  index === 0 ? 'strong' : '',
                  row.tone === 'success' && index > 0 ? 'text-success' : '',
                  row.tone === 'danger' && index > 0 ? 'text-danger' : '',
                ].filter(Boolean).join(' '),
                text: typeof cell === 'number' ? formatNumber(cell) : String(cell ?? '—'),
              }),
            ),
          ),
        ),
      ),
    );
    const parts: Array<Node> = [
      report.rows.length === 0
        ? emptyState({ iconName: 'reports', title: 'لا بيانات لهذا التقرير', text: 'أضف سجلات حقيقية أولًا؛ التقرير لا يعرض أرقامًا تجريبية.', actions: [h('a', { class: 'btn btn--primary btn--sm', href: '#/files', text: 'الذهاب إلى الملفات' })] })
        : h(
            'div',
            { class: 'card' },
            h(
              'div',
              { class: 'card__head no-print' },
              h('div', null, h('p', { class: 'card__title', text: report.title }), h('p', { class: 'card__subtitle', text: report.total })),
              h('div', { class: 'card__actions' }, rangeControl()),
            ),
            h('div', { class: 'table-scroll' }, table),
          ),
    ];
    if (report.note) parts.push(notice('neutral', report.note, { iconName: 'info' }));
    body.replaceChildren(...parts);
  };

  const reportSwitch = h(
    'div',
    { class: 'segmented', attrs: { role: 'group', 'aria-label': 'اختيار التقرير' } },
    ...REPORTS.map((report) =>
      h('button', {
        class: 'segmented__btn',
        type: 'button',
        dataset: { report: report.id },
        attrs: { 'aria-pressed': String(report.id === current), title: report.description },
        on: {
          click: () => {
            current = report.id;
            reportSwitch.querySelectorAll<HTMLElement>('.segmented__btn').forEach((button) => {
              button.setAttribute('aria-pressed', String(button.dataset.report === current));
            });
            void load();
          },
        },
      }, icon(report.icon, 14), h('span', { style: 'margin-inline-start:5px', text: report.label })),
    ),
  );

  const page = h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'التقارير',
      subtitle: 'تقارير محسوبة من قاعدة البيانات المحلية مباشرة. قابلة للطباعة وللتصدير إلى CSV، بلا اتصال بأي خدمة خارجية.',
      actions: [
        h('button', { class: 'btn btn--outline no-print', type: 'button', on: { click: () => void load() } }, icon('refresh', 17), h('span', { text: 'تحديث' })),
      ],
    }),
    h('div', { class: 'row-wrap', style: 'justify-content:space-between' }, reportSwitch, h('span', { class: 'text-xs text-3', text: 'كل الأرقام من سجلات مكتبك، وليست عينات.' })),
    summary,
    body,
    notice('neutral', 'التقارير لا تُخزَّن منفصلة؛ تُحسب عند الطلب لتعكس آخر تغيير في السجلات، وتُطبع عبر متصفحك فقط.', { iconName: 'info' }),
  );

  await load();
  return page;
}

function exportCsv(result: ReportResult): void {
  try {
    const header = result.columns.map((column) => escapeCsv(column.label)).join(',');
    const lines = result.rows.map((row) => row.cells.map((cell) => escapeCsv(typeof cell === 'number' ? String(cell) : String(cell ?? ''))).join(','));
    const content = `\uFEFF${[header, ...lines].join('\r\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `report-${result.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toastSuccess('تم تصدير التقرير', 'ملف CSV بترميز UTF-8.');
  } catch (error) {
    const ui = toUiError(error);
    toastError(ui.message, ui.detail);
  }
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
