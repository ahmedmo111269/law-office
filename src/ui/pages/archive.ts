import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatRelative } from '../format.ts';
import { emptyState, notice, pageHeader, sectionCard } from '../components/page.ts';
import { confirmDialog } from '../components/dialog.ts';
import { toastError, toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import type { PageArgs } from '../app/context.ts';
import type { EngineRow } from '../../portable/store.ts';

interface ArchivedType {
  code: string;
  label: string;
  icon: string;
  title: (row: EngineRow) => string;
  subtitle: (row: EngineRow) => string;
}

const TYPES: ArchivedType[] = [
  {
    code: 'case_file',
    label: 'الملفات',
    icon: 'folder',
    title: (row) => `${String(row.file_number)} — ${String(row.title)}`,
    subtitle: (row) => `فُتح في ${formatDate(String(row.opened_on), 'medium')}`,
  },
  {
    code: 'legal_case',
    label: 'القضايا',
    icon: 'scale',
    title: (row) => `قضية ${String(row.case_number)} / ${String(row.case_year)}`,
    subtitle: (row) => String(row.subject ?? 'بدون موضوع'),
  },
  {
    code: 'party',
    label: 'الأطراف',
    icon: 'user',
    title: (row) => String(row.display_name),
    subtitle: (row) => (row.kind === 'organization' ? 'شخص اعتباري' : 'شخص طبيعي'),
  },
  {
    code: 'document',
    label: 'المستندات',
    icon: 'document',
    title: (row) => String(row.title),
    subtitle: (row) => String(row.document_number ?? 'بدون رقم'),
  },
  {
    code: 'task',
    label: 'المهام',
    icon: 'tasks',
    title: (row) => String(row.title),
    subtitle: (row) => (row.due_at ? `موعدها ${formatDate(String(row.due_at), 'medium')}` : 'بدون موعد'),
  },
  {
    code: 'hearing',
    label: 'الجلسات',
    icon: 'gavel',
    title: (row) => `جلسة ${formatDate(String(row.scheduled_at), 'medium')}`,
    subtitle: (row) => String(row.outcome_summary ?? 'بدون نتيجة مسجلة'),
  },
  {
    code: 'judgment',
    label: 'الأحكام',
    icon: 'stamp',
    title: (row) => `حكم ${String(row.judgment_number ?? '')}`,
    subtitle: (row) => (row.issued_on ? formatDate(String(row.issued_on), 'medium') : ''),
  },
  {
    code: 'contract',
    label: 'العقود',
    icon: 'briefcase',
    title: (row) => String(row.title),
    subtitle: (row) => String(row.contract_number),
  },
  {
    code: 'power_of_attorney',
    label: 'التوكيلات',
    icon: 'stamp',
    title: (row) => `توكيل ${String(row.poa_number)}`,
    subtitle: (row) => String(row.notary_office ?? 'بدون مكتب توثيق'),
  },
];

export async function renderArchive(context: PageArgs): Promise<HTMLElement> {
  let currentType = TYPES.find((type) => type.code === context.query.get('type')) ?? TYPES[0]!;
  let pageNumber = 1;
  const pageSize = 25;
  const listHost = h('div', { class: 'archive-list' });
  const info = h('p', { class: 'text-sm text-3' });
  const pagerHost = h('div', { class: 'row-wrap', style: 'justify-content:flex-end;padding:12px 16px' });

  const load = async (): Promise<void> => {
    listHost.replaceChildren(h('div', { class: 'loading-rows' }, h('span', { class: 'skeleton skeleton--text' }), h('span', { class: 'skeleton skeleton--text' })));
    try {
      const page = await context.workspace.db.listDeleted(currentType.code, {
        orderBy: [{ column: 'updated_at', direction: 'desc' }],
        offset: (pageNumber - 1) * pageSize,
        limit: pageSize,
      });
      info.textContent = page.total === 0 ? 'لا سجلات مؤرشفة في هذا النوع.' : `${page.total} سجلًا في الأرشيف.`;
      if (page.rows.length === 0) {
        listHost.replaceChildren(emptyState({
          iconName: currentType.icon,
          title: 'الأرشيف فارغ',
          text: 'لا شيء محذوفٌ في هذا النوع. الحذف في البرنامج حذف ناعم: يبقى السجل قابلًا للاستعادة من هنا.',
        }));
      } else {
        listHost.replaceChildren(
          ...page.rows.map((row) =>
            h(
              'div',
              { class: 'archive-row' },
              h('span', { class: 'attention-item__icon' }, icon(currentType.icon, 16)),
              h(
                'div',
                { class: 'cell-main grow' },
                h('span', { class: 'cell-title', text: currentType.title(row) }),
                h('span', { class: 'cell-sub', text: currentType.subtitle(row) }),
              ),
              h(
                'div',
                { class: 'stack', style: 'gap:0;align-items:flex-end' },
                h('span', { class: 'text-xs text-3', text: row.updated_at ? formatRelative(String(row.updated_at)) : '' }),
                h('span', { class: 'text-xs text-4', text: row.deleted_at ? formatDate(String(row.deleted_at), 'short') : '' }),
              ),
              h(
                'button',
                {
                  class: 'btn btn--outline btn--sm',
                  type: 'button',
                  on: { click: () => restoreRow(row) },
                },
                icon('restore', 15),
                h('span', { text: 'استعادة' }),
              ),
            ),
          ),
        );
      }
      const totalPages = Math.max(1, Math.ceil(page.total / pageSize));
      pagerHost.replaceChildren(
        h('span', { class: 'text-xs text-3', text: `صفحة ${pageNumber} من ${totalPages}` }),
        h('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          text: 'السابق',
          attrs: { disabled: pageNumber <= 1 ? 'disabled' : 'false' },
          on: { click: () => { if (pageNumber > 1) { pageNumber -= 1; void load(); } } },
        }),
        h('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          text: 'التالي',
          attrs: { disabled: pageNumber >= totalPages ? 'disabled' : 'false' },
          on: { click: () => { if (pageNumber < totalPages) { pageNumber += 1; void load(); } } },
        }),
      );
    } catch (error) {
      const ui = toUiError(error);
      listHost.replaceChildren(notice('danger', ui.message, { iconName: 'alert' }));
    }
  };

  const restoreRow = (row: EngineRow): void => {
    confirmDialog({
      title: 'استعادة السجل',
      message: 'سيُعاد السجل للظهور في البرنامج مع أي سجلات أخرى حُذفت في العملية نفسها.',
      detail: currentType.title(row),
      confirmLabel: 'استعادة',
      onConfirm: async () => {
        try {
          const result = await context.workspace.db.restore(currentType.code, String(row.id));
          toastSuccess('تمت الاستعادة', `${result.restoredCount} سجلًا عاد للظهور.`);
        } catch (error) {
          const ui = toUiError(error);
          toastError(ui.message, ui.detail);
        }
        await load();
      },
    });
  };

  const typeSwitch = h(
    'div',
    { class: 'row-wrap', style: 'gap:6px' },
    ...TYPES.map((type) =>
      h('button', {
        class: `chip chip--button${type.code === currentType.code ? ' chip--active' : ''}`,
        type: 'button',
        dataset: { type: type.code },
        attrs: { 'aria-pressed': String(type.code === currentType.code) },
        on: {
          click: () => {
            currentType = type;
            pageNumber = 1;
            typeSwitch.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
              const active = chip.dataset.type === type.code;
              chip.classList.toggle('chip--active', active);
              chip.setAttribute('aria-pressed', String(active));
            });
            void load();
          },
        },
      }, icon(type.icon, 14), h('span', { text: type.label })),
    ),
  );

  const recent = await context.workspace.db.recentAudit(12);

  const page = h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'الأرشيف',
      subtitle: 'الحذف في مِداد حذف ناعم: السجل يختفي من العمل اليومي لكنه يبقى في قاعدة البيانات حتى تستعيده.',
      actions: [
        h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => void load() } }, icon('refresh', 17), h('span', { text: 'تحديث' })),
        h('a', { class: 'btn btn--secondary', href: '#/settings?tab=backup' }, icon('shield', 17), h('span', { text: 'النسخ الاحتياطي' })),
      ],
    }),
    typeSwitch,
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card__head' }, h('div', null, h('p', { class: 'card__title', text: `سجلات ${TYPES.find((type) => type.code === currentType.code)?.label ?? ''} المؤرشفة` }), info)),
      h('div', { class: 'card__body card__body--tight' }, listHost, pagerHost),
    ),
    h(
      'div',
      { class: 'detail-layout' },
      h(
        'div',
        { class: 'detail-main' },
        sectionCard({
          title: 'آخر العمليات على السجلات',
          subtitle: 'من سجل التدقيق الداخلي؛ لا يحتوي قيمًا حساسة.',
          bodyClass: 'card__body--tight',
          body:
            recent.length === 0
              ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا عمليات مسجلة بعد.' })
              : h(
                  'div',
                  { class: 'record-list' },
                  ...recent.map((entry) =>
                    h(
                      'div',
                      { class: 'row', style: 'padding:10px 16px;gap:10px' },
                      h('span', { class: 'badge badge--quiet', text: actionLabel(String(entry.action)) }),
                      h('span', { class: 'text-sm grow', text: `${entityLabel(String(entry.entity_type))} — ${String(entry.entity_id).slice(0, 8)}…` }),
                      h('span', { class: 'text-xs text-3', text: formatRelative(String(entry.occurred_at)) }),
                    ),
                  ),
                ),
        }),
      ),
      h(
        'div',
        { class: 'detail-aside' },
        sectionCard({
          title: 'قواعد الحذف',
          body: h(
            'div',
            { class: 'stack', style: 'gap:10px' },
            h('p', { class: 'text-sm', text: '• الحذف يخفي السجل من القوائم ولا يمسّ السجلات المرتبطة به.' }),
            h('p', { class: 'text-sm', text: '• الحذف النهائي غير متاح من الواجهة، حمايةً لبيانات المكتب.' }),
            h('p', { class: 'text-sm', text: '• استعادة سجل تعيد أيضًا السجلات التي حُذفت معه في العملية نفسها.' }),
            h('p', { class: 'text-sm', text: '• النسخة الاحتياطية هي الطريقة الوحيدة لنقل البيانات لجهاز آخر.' }),
            notice('warning', 'لا تعتمد على الأرشيف كنسخة احتياطية: خذ نسخة دورية من الإعدادات > النسخ الاحتياطي.', { iconName: 'alert' }),
          ),
        }),
      ),
    ),
  );

  await load();
  return page;
}

function actionLabel(action: string): string {
  switch (action) {
    case 'insert':
      return 'إضافة';
    case 'update':
      return 'تعديل';
    case 'delete':
      return 'حذف';
    case 'restore':
      return 'استعادة';
    case 'archive':
      return 'أرشفة';
    case 'unarchive':
      return 'إلغاء أرشفة';
    default:
      return action;
  }
}

function entityLabel(type: string): string {
  return TYPES.find((entry) => entry.code === type)?.label ?? type;
}
