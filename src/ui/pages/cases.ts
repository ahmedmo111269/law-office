import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatMoney, formatNumber, formatRelative, formatTime, isoDateToday } from '../format.ts';
import { dataTable, type Column } from '../components/data-table.ts';
import { definitionList, emptyState, notice, pageHeader, sectionCard, statCard, tabPanel, tabs } from '../components/page.ts';
import { dateField, selectField, textField, textareaField } from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { navigate } from '../app/router.ts';
import type { PageArgs } from '../app/context.ts';
import type { CaseDetail, CaseRow } from '../services/cases.ts';
import { lookupBadge, openFormDialog, setFieldError, statusTone } from './shared.ts';
import { openHearingOutcome } from './today.ts';

export async function renderCases(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;

  const columns: Column<CaseRow>[] = [
    {
      key: 'case',
      label: 'رقم القضية',
      width: 155,
      sortable: true,
      defaultPinned: true,
      cardRole: 'meta',
      render: (row) =>
        h(
          'span',
          { class: 'mono' },
          h('bdi', { text: `${String(row.legalCase.case_number)} / ${String(row.legalCase.case_year)}`, dir: 'ltr' }),
        ),
      text: (row) => `${String(row.legalCase.case_number)} / ${String(row.legalCase.case_year)}`,
    },
    {
      key: 'court',
      label: 'المحكمة',
      width: 230,
      sortable: true,
      cardRole: 'title',
      render: (row) =>
        h(
          'div',
          { class: 'cell-main' },
          h('a', { class: 'cell-title cell-link', href: `#/cases/${String(row.legalCase.id)}`, text: row.courtName }),
          h('span', { class: 'cell-sub', text: [row.caseTypeName, lookups.byId(String(row.legalCase.litigation_degree_id ?? ''))?.nameAr].filter(Boolean).join(' · ') }),
        ),
      text: (row) => row.courtName,
    },
    {
      key: 'clients',
      label: 'الموكلون',
      width: 200,
      cardRole: 'detail',
      render: (row) => h('span', { text: row.clientNames.length > 0 ? row.clientNames.join('، ') : '—' }),
      text: (row) => row.clientNames.join('، '),
    },
    {
      key: 'type',
      label: 'نوع الدعوى',
      width: 140,
      defaultHidden: true,
      render: (row) => h('span', { class: 'text-2', text: row.caseTypeName }),
      text: (row) => row.caseTypeName,
    },
    {
      key: 'status',
      label: 'الحالة',
      width: 130,
      cardRole: 'meta',
      render: (row) => lookupBadge(lookups, 'case_status', String(row.legalCase.status_id ?? '')),
      text: (row) => row.statusName,
    },
    {
      key: 'next',
      label: 'الجلسة القادمة',
      width: 160,
      cardRole: 'meta',
      render: (row) =>
        row.nextHearingAt
          ? h('span', { class: 'num', text: `${formatDate(row.nextHearingAt, 'short')} ${formatTime(row.nextHearingAt)}` })
          : h('span', { class: 'text-3', text: 'لا جلسة' }),
      text: (row) => row.nextHearingAt ?? '',
    },
    {
      key: 'hearings',
      label: 'الجلسات',
      width: 90,
      align: 'end',
      numeric: true,
      defaultHidden: true,
      render: (row) => h('span', { class: 'num', text: formatNumber(row.hearingsCount) }),
      text: (row) => String(row.hearingsCount),
    },
  ];

  const header = pageHeader({
    title: 'القضايا',
    subtitle: 'الدعاوى أمام المحاكم المصرية بدرجات التقاضي، مرتبطة بملفات العملاء وجلساتها.',
    count: 0,
    actions: [
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => openCaseForm(context) } },
        icon('plus', 17), h('span', { text: 'دعوى جديدة' })),
    ],
  });
  const countNode = header.querySelector('.page-title__count');

  const table = dataTable<CaseRow>(
    {
      id: 'cases',
      title: 'القضايا',
      columns,
      load: (request) => services.cases.list(request),
      rowKey: (row) => String(row.legalCase.id),
      rowHref: (row) => `#/cases/${String(row.legalCase.id)}`,
      searchPlaceholder: 'ابحث برقم القضية أو المحكمة أو اسم الموكل…',
      defaultSort: { key: 'case', dir: 'desc' },
      filters: [
        { key: 'status', label: 'كل الحالات', options: lookups.items('case_status').map((item) => ({ value: item.code, label: item.nameAr })) },
        { key: 'type', label: 'كل الأنواع', options: lookups.items('case_type').map((item) => ({ value: item.code, label: item.nameAr })) },
      ],
      onRowCount: (total) => {
        if (countNode) countNode.textContent = `(${formatNumber(total)})`;
      },
      actions: (row) => [
        h('a', { class: 'icon-btn icon-btn--sm', href: `#/cases/${String(row.legalCase.id)}`, title: 'فتح القضية', attrs: { 'aria-label': 'فتح القضية' } }, icon('external', 16)),
      ],
      emptyTitle: 'لا توجد قضايا مسجلة',
      emptyText: 'أضف أول دعوى، واربطها بملف العميل. رقم القضية والمحكمة والدرجة أساس التنظيم.',
      emptyIcon: 'scale',
      emptyActions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'دعوى جديدة', on: { click: () => openCaseForm(context) } })],
    },
    workspace.preferences,
  );

  const page = h('div', { class: 'page' }, header, table.root);
  if (context.query.get('new') === '1') {
    window.setTimeout(() => openCaseForm(context, () => table.reload()), 80);
  }
  return page;
}

// ---------------------------------------------------------------------------
export async function openCaseForm(context: PageArgs, onSaved?: () => void, presetFileId?: string): Promise<void> {
  const { workspace, services } = context;
  const lookups = workspace.lookups;
  const courts = await services.cases.courts();

  const caseNumber = textField({ label: 'رقم القضية', name: 'caseNumber', required: true, dir: 'ltr', inputmode: 'numeric', maxlength: 40, placeholder: 'مثال: 1234' });
  const year = textField({ label: 'السنة', name: 'caseYear', required: true, dir: 'ltr', inputmode: 'numeric', maxlength: 4, value: String(new Date().getFullYear()) });
  const court = h(
    'div',
    { class: 'field' },
    h('label', { class: 'field__label', attrs: { for: 'case-court' } }, h('span', { text: 'المحكمة' }), h('span', { class: 'field__required', text: ' *' })),
    h(
      'select',
      { class: 'input select', name: 'courtId', id: 'case-court', attrs: { required: '' } },
      h('option', { value: '', text: '— اختر المحكمة —' }),
      ...courts.map((entry) => h('option', { value: String(entry.id), text: String(entry.name) })),
    ),
    h('p', { class: 'field__help', text: 'قائمة المحاكم المستخدمة في المكتب. تُدار من بيانات المحاكم.' }),
    h('p', { class: 'field__error' }),
  );
  const caseType = selectField({ label: 'نوع الدعوى', name: 'caseTypeCode', required: true, options: lookups.items('case_type').map((item) => ({ value: item.code, label: item.nameAr })), value: 'civil' });
  const degree = selectField({ label: 'درجة التقاضي', name: 'litigationDegreeCode', options: lookups.items('litigation_degree').map((item) => ({ value: item.code, label: item.nameAr })), value: 'first_instance' });
  const status = selectField({ label: 'حالة القضية', name: 'statusCode', options: lookups.items('case_status').map((item) => ({ value: item.code, label: item.nameAr })), value: 'registered' });
  const subject = textareaField({ label: 'موضوع الدعوى والطلبات', name: 'subject', rows: 3, maxlength: 1000 });
  const claimAmount = textField({ label: 'قيمة الدعوى (بالجنيه)', name: 'claimAmount', dir: 'ltr', inputmode: 'decimal', help: 'اختياري. تُحفظ بالقروش داخليًا.' });
  const filePicker = presetFileId
    ? null
    : entityPicker({
        name: 'fileId',
        label: 'ربط بملف (اختياري)',
        placeholder: 'ابحث برقم الملف أو عنوانه…',
        search: (query) => services.files.searchOptions(query, 10),
      });

  const content = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h('div', { class: 'form-grid' }, caseNumber, year),
    court,
    h('div', { class: 'form-grid' }, caseType, degree),
    h('div', { class: 'form-grid' }, status, claimAmount),
    subject,
    filePicker ? filePicker.root : null,
    courts.length === 0
      ? notice('warning', 'لا توجد محاكم مسجلة. يمكنك حفظ القضية دون محكمة، أو إضافة المحكمة أولًا من بيانات المحاكم.', { iconName: 'building' })
      : null,
  );

  openFormDialog({
    title: 'دعوى جديدة',
    description: 'رقم القضية والسنة والمحكمة تحدد هوية الدعوى. يمكن ربطها بملف العميل الآن أو لاحقًا.',
    iconName: 'scale',
    size: 'lg',
    content,
    submitLabel: 'تسجيل الدعوى',
    successMessage: 'تم تسجيل الدعوى وحفظها',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.caseNumber) { setFieldError(form, 'caseNumber', 'رقم القضية مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      const caseYear = Number(values.caseYear);
      if (!Number.isInteger(caseYear) || caseYear < 1900 || caseYear > 2200) {
        setFieldError(form, 'caseYear', 'أدخل سنة صحيحة (مثال: 2025).');
        throw new Error('السنة غير صحيحة.');
      }
      const fileId = presetFileId ?? filePicker?.getValue() ?? '';
      const claim = values.claimAmount ? Math.round(Number(values.claimAmount.replace(/,/g, '')) * 100) : undefined;
      if (claim !== undefined && (!Number.isFinite(claim) || claim < 0)) {
        setFieldError(form, 'claimAmount', 'أدخل مبلغًا صحيحًا.');
        throw new Error('قيمة الدعوى غير صحيحة.');
      }
      await services.cases.create({
        caseNumber: values.caseNumber,
        caseYear,
        ...(values.courtId ? { courtId: values.courtId } : {}),
        ...(values.caseTypeCode ? { caseTypeCode: values.caseTypeCode } : {}),
        ...(values.litigationDegreeCode ? { litigationDegreeCode: values.litigationDegreeCode } : {}),
        ...(values.subject ? { subject: values.subject } : {}),
        ...(values.statusCode ? { statusCode: values.statusCode } : {}),
        ...(claim !== undefined ? { claimAmountMinor: claim } : {}),
        ...(fileId ? { fileIds: [fileId] } : {}),
      });
    },
  });
}

// ---------------------------------------------------------------------------
export async function renderCaseDetail(context: PageArgs): Promise<HTMLElement> {
  const caseId = context.params.id ?? '';
  const detail = await context.services.cases.get(caseId);
  if (!detail) {
    return h('div', { class: 'page' }, emptyState({
      iconName: 'scale',
      title: 'القضية غير موجودة',
      text: 'قد تكون محذوفة أو أن الرابط غير صحيح.',
      actions: [h('a', { class: 'btn btn--primary', href: '#/cases', text: 'العودة إلى القضايا' })],
    }));
  }
  const lookups = context.workspace.lookups;
  const legalCase = detail.legalCase;
  const upcoming = detail.hearings.filter((row) => String(row.hearing.scheduled_at) >= new Date().toISOString());
  const nextHearing = upcoming[0];

  const page = h(
    'div',
    { class: 'page' },
    pageHeader({
      title: `قضية ${String(legalCase.case_number)} / ${String(legalCase.case_year)}`,
      breadcrumb: [{ label: 'القضايا', href: '#/cases' }, { label: `${String(legalCase.case_number)} / ${String(legalCase.case_year)}` }],
      meta: [
        h('span', { class: 'chip', text: detail.courtName }),
        lookupBadge(lookups, 'case_status', String(legalCase.status_id ?? '')),
        h('span', { class: 'chip', text: detail.degreeName }),
        detail.circuitName !== '—' ? h('span', { class: 'chip', text: detail.circuitName }) : null,
      ].filter(Boolean) as Child[],
      actions: [
        h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => window.print() } }, icon('printer', 17), h('span', { class: 'topbar-hide-mobile', text: 'طباعة' })),
        h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => openHearingDialog(context, detail) } }, icon('calendar', 17), h('span', { text: 'جلسة جديدة' })),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => navigate(`/judgments?new=1&case=${caseId}`) } }, icon('stamp', 17), h('span', { text: 'تسجيل حكم' })),
      ],
    }),
    h(
      'div',
      { class: 'grid-4' },
      statCard({ label: 'الجلسات', value: formatNumber(detail.hearings.length), iconName: 'gavel', meta: nextHearing ? `القادمة ${formatDate(String(nextHearing.hearing.scheduled_at), 'short')}` : 'لا جلسة قادمة' }),
      statCard({ label: 'الأحكام', value: formatNumber(detail.judgments.length), iconName: 'stamp', meta: 'كل درجات التقاضي' }),
      statCard({ label: 'المستندات', value: formatNumber(detail.documents.length), iconName: 'document', meta: `${formatNumber(detail.parties.length)} طرف` }),
      statCard({
        label: 'قيمة الدعوى',
        value: legalCase.claim_amount_minor ? formatMoney(Number(legalCase.claim_amount_minor)) : '—',
        iconName: 'wallet',
        small: true,
        meta: 'مسجلة في بيانات القضية',
      }),
    ),
    legalCase.subject ? notice('neutral', String(legalCase.subject), { title: 'موضوع الدعوى', iconName: 'scale' }) : null,
  );

  const overview = tabPanel('overview', h(
    'div',
    { class: 'detail-layout' },
    h(
      'div',
      { class: 'detail-main' },
      sectionCard({
        title: 'الجلسات',
        subtitle: 'سجّل نتيجة كل جلسة، وأضف الجلسة التالية عند التأجيل.',
        actions: [h('button', { class: 'btn btn--outline btn--sm', type: 'button', text: 'جلسة جديدة', on: { click: () => openHearingDialog(context, detail, () => navigate(`/cases/${caseId}`, { replace: true })) } })],
        bodyClass: 'card__body--tight',
        body: hearingsList(context, detail, () => navigate(`/cases/${caseId}`, { replace: true })),
      }),
      sectionCard({
        title: 'الأحكام',
        actions: [h('a', { class: 'section-link', href: `#/judgments?case=${caseId}`, text: 'كل الأحكام' })],
        bodyClass: 'card__body--tight',
        body:
          detail.judgments.length === 0
            ? h('p', { class: 'text-sm text-3', style: 'padding:16px', text: 'لا أحكام مسجلة على هذه القضية.' })
            : h(
                'div',
                { class: 'record-list' },
                ...detail.judgments.map((judgment) =>
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
                        h('h3', { class: 'record-card__title', text: judgment.typeName }),
                        h('p', { class: 'text-xs text-3', text: [judgment.statusName, judgment.judgment.issued_on ? formatDate(String(judgment.judgment.issued_on), 'medium') : ''].filter(Boolean).join(' · ') }),
                      ),
                    ),
                    judgment.judgment.operative_part
                      ? h('p', { class: 'text-sm text-2 clamp-2', text: String(judgment.judgment.operative_part) })
                      : null,
                  ),
                ),
              ),
      }),
    ),
    h(
      'div',
      { class: 'detail-aside' },
      sectionCard({
        title: 'بيانات القضية',
        body: definitionList([
          { label: 'المحكمة', value: detail.courtName },
          { label: 'الدائرة', value: detail.circuitName },
          { label: 'نوع الدعوى', value: detail.caseTypeName },
          { label: 'درجة التقاضي', value: detail.degreeName },
          { label: 'الحالة', value: detail.statusName },
          { label: 'تاريخ القيد', value: legalCase.filed_on ? formatDate(String(legalCase.filed_on), 'medium') : '—' },
          { label: 'الموكلون', value: detail.parties.filter((party) => party.roleName === 'عميل').map((party) => String(party.party.display_name)).join('، ') || '—' },
        ]),
      }),
      sectionCard({
        title: 'ملفات القضية',
        body: h(
          'div',
          { class: 'stack', style: 'gap:6px' },
          ...detail.files.map((file) => h('a', { class: 'menu__item', href: `#/files/${String(file.id)}`, style: 'text-decoration:none' }, icon('folder', 16), h('span', { text: String(file.title) }))),
          detail.files.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا ملفات مرتبطة.' }) : null,
        ),
      }),
      sectionCard({
        title: 'مهام القضية',
        actions: [h('a', { class: 'section-link', href: `#/tasks?case=${caseId}`, text: 'إدارة' })],
        body: h(
          'div',
          { class: 'stack', style: 'gap:8px' },
          ...detail.tasks.slice(0, 5).map((task) =>
            h(
              'div',
              { class: 'row', style: 'gap:8px;align-items:flex-start' },
              h('span', { class: 'status-dot', style: `background:var(--c-${task.due_at && new Date(String(task.due_at)) < new Date() ? 'danger' : 'primary'})` }),
              h(
                'div',
                { style: 'flex:1;min-inline-size:0' },
                h('p', { class: 'text-sm truncate', text: String(task.title) }),
                h('p', { class: 'text-xs text-3', text: task.due_at ? formatRelative(String(task.due_at)) : 'بلا موعد' }),
              ),
            ),
          ),
          detail.tasks.length === 0 ? h('p', { class: 'text-sm text-3', text: 'لا مهام مرتبطة.' }) : null,
        ),
      }),
    ),
  ));

  const partiesPanel = tabPanel('parties', detail.parties.length === 0
    ? emptyState({ iconName: 'users', title: 'لا أطراف مرتبطون', text: 'أضف الأطراف من صفحة ملف العميل.' })
    : h(
        'div',
        { class: 'record-list' },
        ...detail.parties.map((entry) =>
          h(
            'div',
            { class: 'record-card' },
            h(
              'div',
              { class: 'record-card__head' },
              h('span', { class: 'avatar', text: String(entry.party.display_name).charAt(0) }),
              h(
                'div',
                { style: 'flex:1;min-inline-size:0' },
                h('h3', { class: 'record-card__title' }, h('a', { href: `#/parties/${String(entry.party.id)}`, text: String(entry.party.display_name) })),
                h('p', { class: 'text-xs text-3', text: `${entry.roleName}${entry.sideName !== '—' ? ` · ${entry.sideName}` : ''}` }),
              ),
              entry.fileId ? h('a', { class: 'btn btn--ghost btn--sm', href: `#/files/${entry.fileId}`, text: 'الملف' }) : null,
            ),
          ),
        ),
      ));

  const docsPanel = tabPanel('documents', detail.documents.length === 0
    ? emptyState({ iconName: 'document', title: 'لا مستندات مرتبطة', text: 'أضف المستندات من صفحة الملف أو من قسم المستندات.', actions: [h('a', { class: 'btn btn--outline btn--sm', href: '#/documents?new=1', text: 'إضافة مستند' })] })
    : h(
        'div',
        { class: 'record-list' },
        ...detail.documents.map((document) =>
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
            h('span', { class: 'attention-item__meta', text: document.doc_date ? formatDate(String(document.doc_date), 'short') : '' }),
          ),
        ),
      ));

  const activityPanel = tabPanel('activity', detail.activity.length === 0
    ? h('p', { class: 'text-sm text-3', text: 'لا نشاط مسجل.' })
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

  const panels = { overview, parties: partiesPanel, documents: docsPanel, activity: activityPanel };
  const initial = (context.query.get('tab') as keyof typeof panels | null) ?? 'overview';
  const active = panels[initial] ? initial : 'overview';
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== active;
  const tabsHandle = tabs(
    [
      { id: 'overview', label: 'الجلسات والأحكام', iconName: 'gavel' },
      { id: 'parties', label: 'الأطراف', count: detail.parties.length, iconName: 'users' },
      { id: 'documents', label: 'المستندات', count: detail.documents.length, iconName: 'document' },
      { id: 'activity', label: 'النشاط', iconName: 'history' },
    ],
    active,
    (id) => {
      for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
      tabsHandle.setActive(id);
    },
  );
  page.appendChild(tabsHandle.root);
  page.append(...Object.values(panels));
  return page;
}

function hearingsList(context: PageArgs, detail: CaseDetail, refresh: () => void): HTMLElement {
  const lookups = context.workspace.lookups;
  if (detail.hearings.length === 0) {
    return emptyState({
      iconName: 'gavel',
      title: 'لا جلسات مسجلة',
      text: 'أضف أول جلسة لهذه القضية مع موعدها وغرضها.',
      actions: [h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'إضافة جلسة', on: { click: () => openHearingDialog(context, detail, refresh) } })],
    });
  }
  return h(
    'div',
    { class: 'timeline', style: 'padding:8px' },
    ...detail.hearings.map((row) => {
      const status = lookups.byId(String(row.hearing.status_id ?? ''));
      const isUpcoming = String(row.hearing.scheduled_at) >= new Date().toISOString();
      return h(
        'div',
        { class: 'timeline__item' },
        h('span', {
          class: 'timeline__dot',
          style: isUpcoming ? 'background:var(--c-primary-soft);color:var(--c-primary)' : '',
        }, icon(isUpcoming ? 'calendar' : 'check', 13)),
        h(
          'div',
          { class: 'timeline__body' },
          h(
            'div',
            { class: 'row-wrap', style: 'gap:8px' },
            h('span', { class: 'timeline__title num', text: `${formatDate(String(row.hearing.scheduled_at), 'medium')} — ${formatTime(String(row.hearing.scheduled_at))}` }),
            h('span', { class: `badge badge--${statusTone(status?.code ?? '')}`, text: row.statusName }),
            h('span', { class: 'badge badge--quiet', text: row.purposeName }),
          ),
          h('p', { class: 'timeline__meta', text: row.courtName }),
          row.hearing.outcome_summary ? h('p', { class: 'text-sm', style: 'margin-block-start:4px', text: String(row.hearing.outcome_summary) }) : null,
          h(
            'div',
            { class: 'row-wrap', style: 'margin-block-start:6px;gap:4px' },
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'تسجيل النتيجة', on: { click: () => openHearingOutcome(context, toHearingRow(context, row), refresh) } }),
            status?.code !== 'postponed'
              ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'تأجيل وإضافة جلسة', on: { click: () => openHearingDialog(context, detail, refresh, String(row.hearing.id)) } })
              : null,
          ),
        ),
      );
    }),
  );
}

function toHearingRow(context: PageArgs, row: CaseDetail['hearings'][number]) {
  return {
    hearing: row.hearing,
    caseLabel: `قضية ${row.caseNumber} / ${row.caseYear}`,
    caseNumber: row.caseNumber,
    caseYear: row.caseYear,
    courtName: row.courtName,
    purposeName: row.purposeName,
    statusName: row.statusName,
    statusCode: context.workspace.lookups.codeById(String(row.hearing.status_id ?? '')),
    clientNames: [],
  };
}

export function openHearingDialog(context: PageArgs, detail: CaseDetail, onSaved?: () => void, previousHearingId?: string): void {
  const lookups = context.workspace.lookups;
  const scheduledAt = dateField({ label: 'تاريخ الجلسة', name: 'date', required: true, value: isoDateToday() });
  const time = textField({ label: 'الوقت', name: 'time', type: 'text', required: true, value: '10:00', dir: 'ltr', inputmode: 'numeric', help: 'بتوقيت القاهرة. الصيغة 24 ساعة (مثال 10:30 أو 14:00).' });
  const purpose = selectField({
    label: 'غرض الجلسة',
    name: 'purposeCode',
    options: lookups.items('hearing_purpose').map((item) => ({ value: item.code, label: item.nameAr })),
    value: 'first_hearing',
  });
  const content = h('div', { class: 'stack', style: 'gap:16px' }, h('div', { class: 'form-grid' }, scheduledAt, time), purpose);

  openFormDialog({
    title: previousHearingId ? 'تأجيل الجلسة وإضافة جلسة جديدة' : 'إضافة جلسة',
    description: `قضية ${String(detail.legalCase.case_number)} / ${String(detail.legalCase.case_year)} — ${detail.courtName}`,
    iconName: 'gavel',
    content,
    submitLabel: 'حفظ الجلسة',
    successMessage: 'تم حفظ الجلسة في قاعدة البيانات',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.date) { setFieldError(form, 'date', 'تاريخ الجلسة مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      if (!/^\d{1,2}:\d{2}$/.test(values.time ?? '')) {
        setFieldError(form, 'time', 'أدخل الوقت بصيغة 24 ساعة، مثل 09:30.');
        throw new Error('الوقت غير صحيح.');
      }
      const [hoursText, minutesText] = (values.time ?? '10:00').split(':');
      const hours = Number(hoursText);
      const minutes = Number(minutesText);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        setFieldError(form, 'time', 'الوقت خارج النطاق الصحيح.');
        throw new Error('الوقت غير صحيح.');
      }
      const local = new Date(`${values.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
      const iso = local.toISOString();
      if (previousHearingId) {
        await context.services.cases.scheduleNext(previousHearingId, iso);
      } else {
        await context.services.cases.scheduleHearing({
          caseId: String(detail.legalCase.id),
          scheduledAt: iso,
          ...(values.purposeCode ? { purposeCode: values.purposeCode } : {}),
          ...(detail.legalCase.court_id ? { courtId: String(detail.legalCase.court_id) } : {}),
        });
      }
    },
  });
}

export function openJudgmentDialog(context: PageArgs, cases: Array<{ id: string; label: string }>, presetCaseId?: string, onSaved?: () => void): void {
  const lookups = context.workspace.lookups;
  const caseSelect = h(
    'div',
    { class: 'field' },
    h('label', { class: 'field__label', attrs: { for: 'judgment-case' } }, h('span', { text: 'القضية' }), h('span', { class: 'field__required', text: ' *' })),
    h(
      'select',
      { class: 'input select', name: 'caseId', id: 'judgment-case' },
      h('option', { value: '', text: '— اختر القضية —' }),
      ...cases.map((entry) => h('option', { value: entry.id, text: entry.label, ...(entry.id === presetCaseId ? { selected: true } : {}) })),
    ),
    h('p', { class: 'field__error' }),
  );
  const issuedOn = dateField({ label: 'تاريخ صدور الحكم', name: 'issuedOn', required: true, value: isoDateToday() });
  const type = selectField({ label: 'نوع الحكم', name: 'judgmentTypeCode', required: true, options: lookups.items('judgment_type').map((item) => ({ value: item.code, label: item.nameAr })), value: 'preliminary' });
  const status = selectField({ label: 'حالة الحكم', name: 'statusCode', options: lookups.items('judgment_status').map((item) => ({ value: item.code, label: item.nameAr })), value: 'issued' });
  const operative = textareaField({ label: 'منطوق الحكم', name: 'operativePart', rows: 3, maxlength: 3000 });
  const reasoning = textareaField({ label: 'الأسباب (اختياري)', name: 'reasoning', rows: 3, maxlength: 3000 });
  const content = h('div', { class: 'stack', style: 'gap:16px' }, caseSelect, h('div', { class: 'form-grid' }, type, issuedOn), status, operative, reasoning);

  openFormDialog({
    title: 'تسجيل حكم',
    description: 'يُسجَّل الحكم على القضية ويظهر في صفحة الأحكام وفي ملف القضية.',
    iconName: 'stamp',
    size: 'lg',
    content,
    submitLabel: 'حفظ الحكم',
    successMessage: 'تم تسجيل الحكم',
    ...(onSaved ? { onSuccess: onSaved } : {}),
    onSubmit: async (form) => {
      const values = readForm(form);
      if (!values.caseId) { setFieldError(form, 'caseId', 'اختر القضية.'); throw new Error('راجع الحقول المطلوبة.'); }
      if (!values.issuedOn) { setFieldError(form, 'issuedOn', 'تاريخ صدور الحكم مطلوب.'); throw new Error('راجع الحقول المطلوبة.'); }
      await context.services.cases.recordJudgment({
        caseId: values.caseId,
        issuedOn: values.issuedOn,
        ...(values.judgmentTypeCode ? { judgmentTypeCode: values.judgmentTypeCode } : {}),
        ...(values.statusCode ? { statusCode: values.statusCode } : {}),
        ...(values.operativePart ? { operativePart: values.operativePart } : {}),
        ...(values.reasoning ? { reasoning: values.reasoning } : {}),
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

