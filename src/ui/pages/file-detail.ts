import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatMoney, formatNumber, formatRelative, formatTime, isoDateToday, humanDayLabel } from '../format.ts';
import { definitionList, emptyState, notice, pageHeader, sectionCard, statCard, tabPanel, tabs } from '../components/page.ts';
import { openDialog, confirmDialog } from '../components/dialog.ts';
import { checkboxField, dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { navigate } from '../app/router.ts';
import type { PageArgs } from '../app/context.ts';
import type { FileDetail } from '../services/files.ts';
import { openFileForm } from './files.ts';
import { lookupBadge, openFormDialog, setFieldError, statusTone } from './shared.ts';

type TabId = 'overview' | 'parties' | 'cases' | 'documents' | 'finance' | 'activity';

export async function renderFileDetail(context: PageArgs): Promise<HTMLElement> {
  const fileId = context.params.id ?? '';
  const detail = await context.services.files.get(fileId);
  if (!detail) {
    return h(
      'div',
      { class: 'page' },
      emptyState({
        iconName: 'folder',
        title: 'الملف غير موجود',
        text: 'قد يكون الملف محذوفًا أو أن الرابط غير صحيح.',
        actions: [h('a', { class: 'btn btn--primary', href: '#/files', text: 'العودة إلى الملفات' })],
      }),
    );
  }

  const lookups = context.workspace.lookups;
  const file = detail.file;
  const clientNames = detail.parties.filter((party) => party.role_name === 'عميل').map((party) => party.display_name);
  const upcoming = detail.hearings.filter((row) => String(row.hearing.scheduled_at) >= new Date().toISOString());
  const openTasks = detail.tasks.filter((task) => !['completed', 'cancelled'].includes(lookups.byId(String(task.status_id ?? ''))?.code ?? ''));

  const page = h(
    'div',
    { class: 'page' },
    pageHeader({
      title: String(file.title),
      breadcrumb: [{ label: 'الملفات', href: '#/files' }, { label: String(file.file_number) }],
      meta: [
        h('span', { class: 'chip mono', dir: 'ltr', text: String(file.file_number) }),
        lookupBadge(lookups, 'file_status', String(file.status_id ?? '')),
        h('span', { class: 'chip', text: lookups.byId(String(file.file_type_id ?? ''))?.nameAr ?? 'ملف' }),
        file.practice_area_id
          ? h('span', { class: 'chip', text: lookups.byId(String(file.practice_area_id))?.nameAr ?? '' })
          : null,
        file.opened_on ? h('span', { class: 'chip', text: `فُتح في ${formatDate(String(file.opened_on), 'short')}` }) : null,
      ].filter(Boolean) as Child[],
      actions: [
        h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          on: { click: () => window.print() },
        }, icon('printer', 17), h('span', { class: 'topbar-hide-mobile', text: 'طباعة' })),
        h('button', {
          class: 'btn btn--outline',
          type: 'button',
          on: { click: () => openFileForm(context, { file, clientNames, casesCount: detail.cases.length, statusName: '', practiceName: '' }, () => navigate(`/files/${fileId}`, { replace: true })) },
        }, icon('edit', 17), h('span', { text: 'تعديل' })),
        h('button', {
          class: 'btn btn--primary',
          type: 'button',
          on: { click: () => openQuickActions(context, detail) },
        }, icon('plus', 17), h('span', { text: 'إضافة' })),
      ],
    }),
  );

  page.appendChild(
    h(
      'section',
      { class: 'hero-band' },
      h(
        'div',
        { class: 'hero-band__main' },
        h('p', { class: 'text-xs text-3', text: 'ملف عمل' }),
        h('h2', { class: 'hero-band__title', text: String(file.title) }),
        h(
          'div',
          { class: 'hero-band__meta' },
          h('span', { text: clientNames.length > 0 ? `الموكل: ${clientNames.join('، ')}` : 'لم يُحدد موكل بعد' }),
          h('span', { text: `${formatNumber(detail.parties.length)} طرف` }),
          h('span', { text: `${formatNumber(detail.cases.length)} قضية` }),
          h('span', { text: `آخر تحديث ${formatRelative(String(file.updated_at))}` }),
        ),
        file.description ? h('p', { class: 'page-subtitle', style: 'margin-block-start:8px', text: String(file.description) }) : null,
      ),
      h(
        'div',
        { class: 'hero-band__actions' },
        h('a', { class: 'btn btn--secondary btn--sm', href: `#/finance?tab=charges&file=${fileId}`, text: 'المالية' }),
        h('button', {
          class: 'btn btn--outline btn--sm',
          type: 'button',
          text: 'إضافة مهمة',
          on: { click: () => openTaskForm(context, detail) },
        }),
      ),
    ),
  );

  page.appendChild(
    h(
      'div',
      { class: 'grid-4' },
      statCard({ label: 'قضايا الملف', value: formatNumber(detail.cases.length), iconName: 'scale', meta: `${formatNumber(detail.judgments.length)} حكم مسجل`, href: `#/files/${fileId}?tab=cases` }),
      statCard({ label: 'جلسات قادمة', value: formatNumber(upcoming.length), iconName: 'gavel', meta: upcoming[0] ? `أقربها ${formatDate(String(upcoming[0].hearing.scheduled_at), 'short')}` : 'لا جلسات مجدولة' }),
      statCard({
        label: 'مستحقات غير محصّلة',
        value: formatMoney(detail.outstandingMinor),
        iconName: 'wallet',
        tone: detail.outstandingMinor > 0 ? 'warning' : 'success',
        meta: `${formatNumber(detail.charges.length)} مستحق مسجل`,
        small: true,
      }),
      statCard({
        label: 'مهام مفتوحة',
        value: formatNumber(openTasks.length),
        iconName: 'tasks',
        tone: openTasks.length > 0 ? 'danger' : 'success',
        meta: `${formatNumber(detail.documents.length)} مستند مرتبط`,
      }),
    ),
  );

  const detailHost = h('div');
  const initial = (context.query.get('tab') as TabId | null) ?? 'overview';
  const tabDefs = [
    { id: 'overview', label: 'نظرة عامة', iconName: 'dashboard' },
    { id: 'parties', label: 'الأطراف', count: detail.parties.length, iconName: 'users' },
    { id: 'cases', label: 'القضايا والجلسات', count: detail.cases.length, iconName: 'scale' },
    { id: 'documents', label: 'المستندات', count: detail.documents.length, iconName: 'document' },
    { id: 'finance', label: 'المالية', count: detail.charges.length, iconName: 'wallet' },
    { id: 'activity', label: 'النشاط والملاحظات', count: detail.notes.length, iconName: 'history' },
  ];
  const panels: Record<TabId, HTMLElement> = {
    overview: tabPanel('overview', overviewTab(context, detail, upcoming)),
    parties: tabPanel('parties', partiesTab(context, detail, () => navigate(`/files/${fileId}?tab=parties`, { replace: true }))),
    cases: tabPanel('cases', casesTab(context, detail)),
    documents: tabPanel('documents', documentsTab(context, detail, () => navigate(`/files/${fileId}?tab=documents`, { replace: true }))),
    finance: tabPanel('finance', financeTab(context, detail)),
    activity: tabPanel('activity', activityTab(context, detail, () => navigate(`/files/${fileId}?tab=activity`, { replace: true }))),
  };
  const tabsHandle = tabs(tabDefs, initial, (id) => {
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
    tabsHandle.setActive(id);
    const url = `${window.location.pathname}${window.location.search}#/files/${fileId}?tab=${id}`;
    window.history.replaceState(null, '', url);
  });
  let active: TabId = initial;
  if (!panels[active]) active = 'overview';
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== active;
  tabsHandle.setActive(active);
  detailHost.append(tabsHandle.root, ...Object.values(panels));
  page.appendChild(detailHost);
  return page;
}

// ---------------------------------------------------------------------------
function overviewTab(context: PageArgs, detail: FileDetail, upcoming: FileDetail['hearings']): HTMLElement {
  const lookups = context.workspace.lookups;
  const nextHearing = upcoming[0];
  const body: Child[] = [];

  body.push(
    h(
      'div',
      { class: 'grid-2' },
      sectionCard({
        title: 'بيانات الملف',
        body: definitionList([
          { label: 'رقم الملف', value: h('span', { class: 'mono', dir: 'ltr', text: String(detail.file.file_number) }) },
          { label: 'النوع', value: lookups.byId(String(detail.file.file_type_id ?? ''))?.nameAr ?? '—' },
          { label: 'فرع القانون', value: lookups.byId(String(detail.file.practice_area_id ?? ''))?.nameAr ?? '—' },
          { label: 'تاريخ الفتح', value: formatDate(String(detail.file.opened_on), 'medium') },
          { label: 'الأولوية', value: lookups.byId(String(detail.file.priority_id ?? ''))?.nameAr ?? '—' },
          { label: 'السرية', value: lookups.byId(String(detail.file.confidentiality_id ?? ''))?.nameAr ?? '—' },
          { label: 'المسؤول', value: context.services.deps.cache.partyName(detail.file.responsible_party_id ? String(detail.file.responsible_party_id) : null) },
        ]),
      }),
      sectionCard({
        title: 'الجلسة القادمة',
        body: nextHearing
          ? h(
              'div',
              { class: 'stack', style: 'gap:8px' },
              h('p', { class: 'badge badge--primary', text: humanDayLabel(String(nextHearing.hearing.scheduled_at).slice(0, 10)) }),
              h('p', { class: 'strong', text: `قضية ${nextHearing.caseNumber} / ${nextHearing.caseYear}` }),
              h('p', { class: 'text-sm text-2', text: `${nextHearing.courtName} — ${formatTime(String(nextHearing.hearing.scheduled_at))}` }),
              h('p', { class: 'text-xs text-3', text: nextHearing.purposeName }),
              h(
                'div',
                { class: 'row-wrap', style: 'margin-block-start:6px' },
                h('a', { class: 'btn btn--outline btn--sm', href: `#/cases/${String(nextHearing.hearing.case_id)}`, text: 'ملف القضية' }),
                h('a', { class: 'btn btn--ghost btn--sm', href: `#/hearings?focus=${String(nextHearing.hearing.id)}`, text: 'تسجيل النتيجة' }),
              ),
            )
          : emptyState({
              iconName: 'calendar',
              title: 'لا جلسة قادمة',
              text: 'أضف قضية للجلسات أو جدول جلسة جديدة.',
              actions: [h('a', { class: 'btn btn--outline btn--sm', href: `#/hearings?new=1&file=${String(detail.file.id)}`, text: 'إضافة جلسة' })],
            }),
      }),
    ),
  );

  body.push(
    sectionCard({
      title: 'آخر المستندات',
      actions: [h('button', { class: 'section-link', type: 'button', text: 'إضافة مستند', on: { click: () => openDocumentForm(context, detail) } })],
      bodyClass: 'card__body--tight',
      body:
        detail.documents.length === 0
          ? h('p', { class: 'text-sm text-3', style: 'padding:12px', text: 'لا مستندات مرتبطة بالملف بعد.' })
          : h(
              'div',
              { class: 'record-list' },
              ...detail.documents.slice(0, 5).map((document) =>
                h(
                  'a',
                  { class: 'attention-item', href: `#/documents?focus=${String(document.id)}` },
                  h('span', { class: 'attention-item__icon' }, icon('document', 16)),
                  h(
                    'span',
                    { class: 'attention-item__body' },
                    h('span', { class: 'attention-item__title', text: String(document.title) }),
                    h('span', { class: 'attention-item__desc', text: [lookups.byId(String(document.doc_type_id ?? ''))?.nameAr, document.doc_number].filter(Boolean).join(' · ') }),
                  ),
                  h('span', { class: 'attention-item__meta', text: formatRelative(String(document.doc_date ?? document.created_at)) }),
                ),
              ),
            ),
    }),
  );

  return h('div', { class: 'stack' }, ...body);
}

function partiesTab(context: PageArgs, detail: FileDetail, refresh: () => void): HTMLElement {
  const lookups = context.workspace.lookups;
  const addButton = h(
    'button',
    {
      class: 'btn btn--primary btn--sm',
      type: 'button',
      on: { click: () => openPartyForm(context, detail, refresh) },
    },
    icon('plus', 15),
    h('span', { text: 'إضافة طرف' }),
  );
  const list =
    detail.parties.length === 0
      ? emptyState({
          iconName: 'users',
          title: 'لا أطراف في هذا الملف',
          text: 'أضف الموكل والخصوم وأصحاب الصفة ليكون الملف مكتمل الأطراف.',
          actions: [addButton],
        })
      : h(
          'div',
          { class: 'record-list' },
          ...detail.parties.map((party) =>
            h(
              'div',
              { class: 'record-card' },
              h(
                'div',
                { class: 'record-card__head' },
                h('span', { class: 'avatar', text: String(party.display_name).charAt(0) }),
                h(
                  'div',
                  { style: 'flex:1;min-inline-size:0' },
                  h(
                    'h3',
                    { class: 'record-card__title' },
                    h('a', {
                      href: party.party_id ? `#/parties/${String(party.party_id)}` : '#/parties',
                      text: String(party.display_name),
                    }),
                  ),
                  h('p', {
                    class: 'text-xs text-3',
                    text: [party.role_name, party.side_name !== '—' ? `صفة: ${party.side_name}` : ''].filter(Boolean).join(' · '),
                  }),
                ),
                h(
                  'div',
                  { class: 'row', style: 'gap:2px' },
                  h('span', { class: 'badge badge--quiet', text: party.role_name }),
                  h('button', {
                    class: 'icon-btn icon-btn--sm',
                    type: 'button',
                    attrs: { 'aria-label': `إزالة ${String(party.display_name)} من الملف` },
                    on: {
                      click: () => {
                        confirmDialog({
                          title: 'إزالة طرف من الملف',
                          message: `سيُزال «${String(party.display_name)}» من هذا الملف فقط، ولن يُحذف من سجل الأطراف.`,
                          confirmLabel: 'إزالة',
                          danger: true,
                          onConfirm: async () => {
                            await context.services.files.removeParty(String(party.id));
                            refresh();
                          },
                        });
                      },
                    },
                  }, icon('trash', 15)),
                ),
              ),
            ),
          ),
        );

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title' }, icon('users', 18), h('span', { text: 'أطراف الملف' })),
      addButton,
    ),
    lookups.items('party_role').length === 0 ? null : h('p', { class: 'text-xs text-3', text: 'لكل طرف دور (موكل، خصم، شاهد…) وصفة إجرائية.' }),
    list,
  );
}

function casesTab(context: PageArgs, detail: FileDetail): HTMLElement {
  const lookups = context.workspace.lookups;
  return h(
    'div',
    { class: 'stack' },
    detail.cases.length === 0
      ? emptyState({
          iconName: 'scale',
          title: 'لا قضايا مرتبطة بالملف',
          text: 'اربط دعوى قائمة أو أنشئ دعوى جديدة من صفحة القضايا.',
          actions: [h('a', { class: 'btn btn--primary btn--sm', href: `#/cases?new=1&file=${String(detail.file.id)}`, text: 'دعوى جديدة' })],
        })
      : h(
          'div',
          { class: 'stack' },
          ...detail.cases.map((row) =>
            sectionCard({
              title: `قضية ${row.legalCase.case_number} / ${row.legalCase.case_year}`,
              subtitle: [row.courtName, row.caseTypeName].filter(Boolean).join(' · '),
              actions: [h('a', { class: 'section-link', href: `#/cases/${String(row.legalCase.id)}`, text: 'فتح القضية' })],
              body: h(
                'div',
                { class: 'stack', style: 'gap:12px' },
                h(
                  'div',
                  { class: 'row-wrap', style: 'gap:8px' },
                  lookupBadge(lookups, 'case_status', String(row.legalCase.status_id ?? '')),
                  h('span', { class: 'chip', text: `${formatNumber(row.hearingsCount)} جلسة` }),
                  row.nextHearingAt
                    ? h('span', { class: 'chip', text: `الجلسة القادمة ${formatDate(row.nextHearingAt, 'short')} ${formatTime(row.nextHearingAt)}` })
                    : h('span', { class: 'chip', text: 'لا جلسة قادمة' }),
                ),
                hearingsTable(context, detail.hearings.filter((hearing) => String(hearing.hearing.case_id) === String(row.legalCase.id))),
              ),
            }),
          ),
        ),
    detail.judgments.length > 0
      ? sectionCard({
          title: 'الأحكام',
          body: h(
            'div',
            { class: 'record-list' },
            ...detail.judgments.map((judgment) =>
              h(
                'div',
                { class: 'attention-item' },
                h('span', { class: 'attention-item__icon' }, icon('stamp', 16)),
                h(
                  'span',
                  { class: 'attention-item__body' },
                  h('span', { class: 'attention-item__title', text: `حكم ${judgment.typeName} — قضية ${judgment.caseNumber}` }),
                  h('span', { class: 'attention-item__desc', text: [judgment.statusName, judgment.judgment.issued_on ? formatDate(String(judgment.judgment.issued_on), 'short') : ''].filter(Boolean).join(' · ') }),
                ),
              ),
            ),
          ),
          bodyClass: 'card__body--tight',
        })
      : null,
  );
}

function hearingsTable(context: PageArgs, hearings: FileDetail['hearings']): HTMLElement {
  const lookups = context.workspace.lookups;
  if (hearings.length === 0) return h('p', { class: 'text-sm text-3', text: 'لا جلسات مسجلة لهذه القضية.' });
  return h(
    'div',
    { class: 'table-scroll', style: 'max-block-size:320px' },
    h(
      'table',
      { class: 'data-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { attrs: { scope: 'col' } }, h('div', { class: 'table-head-cell', text: 'الموعد' })),
          h('th', { attrs: { scope: 'col' } }, h('div', { class: 'table-head-cell', text: 'المحكمة' })),
          h('th', { attrs: { scope: 'col' } }, h('div', { class: 'table-head-cell', text: 'الغرض' })),
          h('th', { attrs: { scope: 'col' } }, h('div', { class: 'table-head-cell', text: 'الحالة' })),
          h('th', { attrs: { scope: 'col' } }, h('div', { class: 'table-head-cell', text: 'النتيجة' })),
          h('th', { class: 'col-actions', attrs: { scope: 'col' } }, h('span', { class: 'visually-hidden', text: 'إجراءات' })),
        ),
      ),
      h(
        'tbody',
        null,
        ...hearings.map((row) => {
          const status = lookups.byId(String(row.hearing.status_id ?? ''));
          return h(
            'tr',
            null,
            h('td', null, h('span', { class: 'num', text: `${formatDate(String(row.hearing.scheduled_at), 'short')} ${formatTime(String(row.hearing.scheduled_at))}` })),
            h('td', { text: row.courtName }),
            h('td', { class: 'text-2', text: row.purposeName }),
            h('td', null, h('span', { class: `badge badge--${statusTone(status?.code ?? '')}`, text: row.statusName })),
            h('td', { class: 'text-2 truncate', text: String(row.hearing.outcome_summary ?? '—') }),
            h(
              'td',
              { class: 'col-actions' },
              h('a', { class: 'icon-btn icon-btn--sm', href: `#/hearings?focus=${String(row.hearing.id)}`, attrs: { 'aria-label': 'فتح الجلسة' } }, icon('external', 15)),
            ),
          );
        }),
      ),
    ),
  );
}

function documentsTab(context: PageArgs, detail: FileDetail, refresh: () => void): HTMLElement {
  const lookups = context.workspace.lookups;
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title' }, icon('document', 18), h('span', { text: 'مستندات الملف' })),
      h('button', {
        class: 'btn btn--primary btn--sm',
        type: 'button',
        on: { click: () => openDocumentForm(context, detail, refresh) },
      }, icon('plus', 15), h('span', { text: 'إضافة مستند' })),
    ),
    notice('neutral', 'البرنامج يحفظ بيانات المستند ونسخه (اسم الملف، النوع، مرجع التخزين). لا يرفع الملفات إلى أي خادم، والملفات الكبيرة تُحفظ بمرجع مسار محلي.', { iconName: 'info' }),
    detail.documents.length === 0
      ? emptyState({ iconName: 'document', title: 'لا مستندات بعد', text: 'أضف المستندات المهمة واربطها بالملف.' })
      : h(
          'div',
          { class: 'record-list' },
          ...detail.documents.map((document) =>
            h(
              'div',
              { class: 'record-card' },
              h(
                'div',
                { class: 'record-card__head' },
                h('span', { class: 'avatar' }, icon('document', 17)),
                h(
                  'div',
                  { style: 'flex:1;min-inline-size:0' },
                  h('h3', { class: 'record-card__title', text: String(document.title) }),
                  h('p', { class: 'text-xs text-3', text: [lookups.byId(String(document.doc_type_id ?? ''))?.nameAr, document.doc_number, document.doc_date ? formatDate(String(document.doc_date), 'short') : ''].filter(Boolean).join(' · ') }),
                ),
                h('a', { class: 'btn btn--ghost btn--sm', href: `#/documents?focus=${String(document.id)}`, text: 'التفاصيل' }),
              ),
            ),
          ),
        ),
  );
}

function financeTab(context: PageArgs, detail: FileDetail): HTMLElement {
  const lookups = context.workspace.lookups;
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'grid-2' },
      statCard({
        label: 'المستحق على الملف',
        value: formatMoney(detail.outstandingMinor),
        iconName: 'wallet',
        tone: detail.outstandingMinor > 0 ? 'warning' : 'success',
        meta: `${formatNumber(detail.charges.length)} مستحق`,
        small: true,
        href: `#/finance?tab=charges&file=${String(detail.file.id)}`,
      }),
      statCard({
        label: 'مدفوعات مسجلة على الملف',
        value: formatMoney(detail.transactions.filter((row) => String(row.direction) === 'in').reduce((sum, row) => sum + Number(row.amount_minor), 0)),
        iconName: 'download',
        meta: `${formatNumber(detail.transactions.length)} حركة مالية`,
        small: true,
        href: `#/finance?tab=transactions&file=${String(detail.file.id)}`,
      }),
    ),
    sectionCard({
      title: 'المستحقات المالية',
      subtitle: 'الأتعاب والمصاريف المسجلة على هذا الملف.',
      actions: [
        h('a', { class: 'section-link', href: `#/finance?tab=charges&file=${String(detail.file.id)}&new=1`, text: 'إضافة مستحق' }),
      ],
      bodyClass: 'card__body--tight',
      body:
        detail.charges.length === 0
          ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا مستحقات مسجلة على الملف.' })
          : h(
              'div',
              { class: 'record-list' },
              ...detail.charges.map((charge) => {
                const status = lookups.byId(String(charge.status_id ?? ''));
                return h(
                  'div',
                  { class: 'attention-item' },
                  h('span', { class: 'attention-item__icon' }, icon('wallet', 16)),
                  h(
                    'span',
                    { class: 'attention-item__body' },
                    h('span', { class: 'attention-item__title', text: String(charge.description) }),
                    h('span', { class: 'attention-item__desc', text: [charge.issued_on ? formatDate(String(charge.issued_on), 'short') : '', charge.due_on ? `استحقاق ${formatDate(String(charge.due_on), 'short')}` : ''].filter(Boolean).join(' · ') }),
                  ),
                  h('span', { class: 'row', style: 'gap:8px' }, h('span', { class: `badge badge--${statusTone(status?.code ?? '')}`, text: status?.nameAr ?? '—' }), h('span', { class: 'num strong', text: formatMoney(Number(charge.amount_minor)) })),
                );
              }),
            ),
    }),
    detail.transactions.length > 0
      ? sectionCard({
          title: 'الحركات المالية',
          bodyClass: 'card__body--tight',
          body: h(
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
        })
      : null,
  );
}

function activityTab(context: PageArgs, detail: FileDetail, refresh: () => void): HTMLElement {
  return h(
    'div',
    { class: 'stack' },
    sectionCard({
      title: 'ملاحظات الملف',
      subtitle: 'الملاحظات الخاصة لا تظهر في النسخ المطبوعة.',
      actions: [h('button', { class: 'btn btn--outline btn--sm', type: 'button', text: 'إضافة ملاحظة', on: { click: () => openNoteForm(context, detail, refresh) } })],
      body:
        detail.notes.length === 0
          ? h('p', { class: 'text-sm text-3', text: 'لا ملاحظات مسجلة بعد.' })
          : h(
              'div',
              { class: 'timeline' },
              ...detail.notes.map((note) =>
                h(
                  'div',
                  { class: 'timeline__item' },
                  h('span', { class: 'timeline__dot' }, icon(note.is_private === 1 ? 'lock' : 'edit', 13)),
                  h(
                    'div',
                    { class: 'timeline__body' },
                    h('p', { class: 'text-sm', text: String(note.body) }),
                    h('p', { class: 'timeline__meta', text: `${note.is_private === 1 ? 'ملاحظة خاصة · ' : ''}${formatRelative(String(note.created_at))}` }),
                  ),
                ),
              ),
            ),
    }),
    sectionCard({
      title: 'سجل النشاط',
      subtitle: 'كل تغيير مسجّل في audit_log مع إخفاء القيم الحساسة.',
      body:
        detail.activity.length === 0
          ? h('p', { class: 'text-sm text-3', text: 'لا نشاط مسجّل بعد.' })
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
                    h('p', { class: 'timeline__title', text: actionName(String(entry.action)) }),
                    h('p', { class: 'timeline__meta', text: `${String(entry.summary ?? '')} · ${formatRelative(String(entry.occurred_at))}` }),
                  ),
                ),
              ),
            ),
    }),
  );
}

// ---------------------------------------------------------------------------
function openQuickActions(context: PageArgs, detail: FileDetail): void {
  const actions = [
    { label: 'إضافة طرف للملف', iconName: 'users', onClick: () => openPartyForm(context, detail, () => navigate(`/files/${String(detail.file.id)}?tab=parties`, { replace: true })) },
    { label: 'إضافة قضية', iconName: 'scale', onClick: () => navigate(`/cases?new=1&file=${String(detail.file.id)}`) },
    { label: 'إضافة جلسة', iconName: 'gavel', onClick: () => navigate(`/hearings?new=1&file=${String(detail.file.id)}`) },
    { label: 'إضافة مستند', iconName: 'document', onClick: () => openDocumentForm(context, detail) },
    { label: 'إضافة مهمة', iconName: 'tasks', onClick: () => openTaskForm(context, detail) },
    { label: 'إضافة مستحق مالي', iconName: 'wallet', onClick: () => navigate(`/finance?tab=charges&file=${String(detail.file.id)}&new=1`) },
  ];
  const content = h(
    'div',
    { class: 'stack', style: 'gap:6px' },
    ...actions.map((action) =>
      h(
        'button',
        {
          class: 'menu__item',
          type: 'button',
          style: 'padding:10px;border:1px solid var(--c-line-soft);border-radius:8px',
          on: { click: () => { handle.close(); action.onClick(); } },
        },
        icon(action.iconName, 17),
        h('span', { text: action.label }),
      ),
    ),
  );
  const handle = openDialog({ title: 'إضافة إلى الملف', size: 'sm', content });
}

function openPartyForm(context: PageArgs, detail: FileDetail, onSaved: () => void): void {
  const lookups = context.workspace.lookups;
  const picker = entityPicker({
    name: 'partyId',
    label: 'الطرف',
    required: true,
    placeholder: 'ابحث بالاسم…',
    search: (query) => context.services.clients.searchOptions(query, false, 10),
    createLabel: 'إضافة طرف جديد',
    onCreate: (query, controls) => {
      controls.close();
      navigate(`/parties?new=1&name=${encodeURIComponent(query)}&file=${String(detail.file.id)}`);
    },
  });
  const role = selectField({
    label: 'الدور في الملف',
    name: 'roleCode',
    required: true,
    value: 'client',
    options: lookups.items('party_role').map((item) => ({ value: item.code, label: item.nameAr })),
  });
  const side = selectField({
    label: 'الصفة الإجرائية',
    name: 'sideCode',
    options: lookups.items('party_side').map((item) => ({ value: item.code, label: item.nameAr })),
  });
  const primary = checkboxField({ label: 'طرف رئيسي في الملف', name: 'isPrimary' });

  const content = h('div', { class: 'stack', style: 'gap:16px' }, picker.root, h('div', { class: 'form-grid' }, role, side), primary);
  openFormDialog({
    title: 'إضافة طرف إلى الملف',
    description: `الملف: ${String(detail.file.title)}`,
    iconName: 'users',
    content,
    submitLabel: 'إضافة الطرف',
    successMessage: 'تمت إضافة الطرف إلى الملف',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const partyId = picker.getValue();
      if (!partyId) {
        picker.input.setAttribute('aria-invalid', 'true');
        picker.input.focus();
        throw new Error('اختر الطرف أولًا.');
      }
      const values = readForm(form);
      await context.services.files.addParty({
        fileId: String(detail.file.id),
        partyId,
        roleCode: values.roleCode ?? 'client',
        ...(values.sideCode ? { sideCode: values.sideCode } : {}),
        ...(form.querySelector<HTMLInputElement>('[name="isPrimary"]')?.checked ? { isPrimary: true } : {}),
      });
    },
  });
}

function openNoteForm(context: PageArgs, detail: FileDetail, onSaved: () => void): void {
  const body = textareaField({ label: 'الملاحظة', name: 'body', required: true, rows: 4, maxlength: 2000 });
  const isPrivate = checkboxField({ label: 'ملاحظة خاصة (داخلية فقط)', name: 'isPrivate' });
  const content = h('div', { class: 'stack', style: 'gap:16px' }, body, isPrivate);
  openFormDialog({
    title: 'إضافة ملاحظة',
    iconName: 'edit',
    content,
    submitLabel: 'حفظ الملاحظة',
    successMessage: 'تم حفظ الملاحظة',
    onSuccess: onSaved,
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.body) {
        setFieldError(form, 'body', 'نص الملاحظة مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      await context.services.files.addNote({
        fileId: String(detail.file.id),
        body: values.body,
        ...(form.querySelector<HTMLInputElement>('[name="isPrivate"]')?.checked ? { isPrivate: true } : {}),
      });
    },
  });
}

function openDocumentForm(context: PageArgs, detail: FileDetail, onSaved?: () => void): void {
  const lookups = context.workspace.lookups;
  const title = textField({ label: 'عنوان المستند', name: 'title', required: true, maxlength: 200, placeholder: 'مثال: مذكرة دفاع — الدفعة الأولى' });
  const type = selectField({
    label: 'نوع المستند',
    name: 'docTypeCode',
    required: true,
    options: lookups.items('document_type').map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'pleading',
  });
  const docNumber = textField({ label: 'رقم المستند', name: 'docNumber', maxlength: 60 });
  const docDate = dateField({ label: 'تاريخ المستند', name: 'docDate', value: isoDateToday() });
  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    title,
    h('div', { class: 'form-grid' }, type, docDate),
    docNumber,
  );
  openFormDialog({
    title: 'إضافة مستند للملف',
    description: String(detail.file.title),
    iconName: 'document',
    content,
    submitLabel: 'إضافة المستند',
    successMessage: 'تم إضافة المستند وربطه بالملف',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.title) {
        setFieldError(form, 'title', 'عنوان المستند مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      await context.services.documents.create({
        title: values.title,
        docTypeCode: values.docTypeCode ?? 'pleading',
        ...(values.docNumber ? { docNumber: values.docNumber } : {}),
        ...(values.docDate ? { docDate: values.docDate } : {}),
        fileId: String(detail.file.id),
      });
    },
  });
}

function openTaskForm(context: PageArgs, detail: FileDetail): void {
  const lookups = context.workspace.lookups;
  const title = textField({ label: 'عنوان المهمة', name: 'title', required: true, maxlength: 200 });
  const type = selectField({
    label: 'نوع المهمة',
    name: 'typeCode',
    required: true,
    options: lookups.items('task_type').map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'administrative',
  });
  const due = dateField({ label: 'تاريخ الاستحقاق', name: 'dueAt', value: isoDateToday(), required: true });
  const priority = selectField({
    label: 'الأولوية',
    name: 'priorityCode',
    options: lookups.items('priority').map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'normal',
  });
  const notes = textareaField({ label: 'تفاصيل', name: 'notes', rows: 3, maxlength: 1000 });
  const content = h('div', { class: 'stack', style: 'gap:16px' }, title, h('div', { class: 'form-grid' }, type, due), priority, notes);
  openFormDialog({
    title: 'مهمة على الملف',
    description: String(detail.file.title),
    iconName: 'tasks',
    content,
    submitLabel: 'إنشاء المهمة',
    successMessage: 'تم إنشاء المهمة',
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.title) {
        setFieldError(form, 'title', 'عنوان المهمة مطلوب.');
        throw new Error('راجع الحقول المطلوبة.');
      }
      await context.services.tasks.create({
        title: values.title,
        taskTypeCode: values.typeCode ?? 'administrative',
        fileId: String(detail.file.id),
        ...(values.dueAt ? { dueAt: new Date(`${values.dueAt}T09:00:00`).toISOString() } : {}),
        ...(values.priorityCode ? { priorityCode: values.priorityCode } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
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

function actionName(action: string): string {
  switch (action) {
    case 'insert':
      return 'إنشاء';
    case 'update':
      return 'تحديث';
    case 'delete':
      return 'حذف';
    case 'restore':
      return 'استعادة';
    case 'archive':
      return 'أرشفة';
    default:
      return action;
  }
}

