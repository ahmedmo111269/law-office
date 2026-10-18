import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatMoneyCompact, formatNumber, formatRelative, formatTime, humanDayLabel, isoDateToday, isoNow } from '../format.ts';
import { emptyState, notice, pageHeader, sectionCard, statCard } from '../components/page.ts';
import { openDialog } from '../components/dialog.ts';
import { toastError, toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import { dateTimeField, textareaField } from '../components/forms.ts';
import { navigate } from '../app/router.ts';
import type { PageArgs } from '../app/context.ts';
import type { AppointmentRow, HearingRow } from '../services/agenda.ts';
import type { TaskRow } from '../services/tasks.ts';
import type { AttentionItem, DashboardData, ReadinessItem } from '../services/dashboard.ts';
import { relevanceLabel, statusTone } from './shared.ts';

export async function renderToday(context: PageArgs): Promise<HTMLElement> {
  const { workspace, services } = context;
  const data = await services.dashboard.load(workspace.preferences, workspace.officeSettings().backupReminderDays);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'طاب نهارك' : 'مساء الخير';

  const page = h('div', { class: 'page' });
  page.appendChild(
    pageHeader({
      title: `${greeting} — ${workspace.officeName()}`,
      subtitle: data.isEmpty
        ? 'ابدأ بإعداد المكتب وإضافة أول عميل وملف. كل ما تضيفه يُحفظ في قاعدة البيانات المحلية على هذا الجهاز.'
        : 'صورة العمل اليوم من بيانات المكتب الفعلية: ما حان موعده، وما تأخر، وما يحتاج قرارًا منك.',
      meta: [
        h('span', { class: 'chip' }, icon('calendar', 14), h('span', { text: humanDayLabel(isoDateToday()) })),
        h('span', { class: 'chip' }, icon('clock', 14), h('span', { text: formatDate(isoNow(), 'long') })),
        !navigator.onLine ? h('span', { class: 'chip', text: 'وضع عدم الاتصال — يعمل محليًا' }) : null,
      ].filter(Boolean) as Child[],
      actions: [
        h('button', { class: 'btn btn--outline', type: 'button', on: { click: () => navigate('/tasks?new=1') } },
          icon('plus', 17), h('span', { text: 'مهمة جديدة' })),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => navigate('/finance?tab=transactions&new=1') } },
          icon('wallet', 17), h('span', { text: 'تسجيل تحصيل' })),
      ],
    }),
  );

  if (data.isEmpty) {
    page.appendChild(onboarding(context));
    return page;
  }

  page.appendChild(
    h(
      'div',
      { class: 'grid-4' },
      statCard({
        label: 'جلسات اليوم',
        value: formatNumber(data.hearingsToday.length),
        iconName: 'gavel',
        meta: data.hearingsTomorrow.length > 0 ? `غدًا ${formatNumber(data.hearingsTomorrow.length)} جلسة` : 'لا جلسات غدًا',
        tone: data.hearingsToday.length > 0 ? 'info' : 'default',
        href: '#/hearings',
      }),
      statCard({
        label: 'مهام متأخرة',
        value: formatNumber(data.tasksOverdue.length),
        iconName: 'alert',
        meta: data.tasksToday.length > 0 ? `و${formatNumber(data.tasksToday.length)} مستحقة اليوم` : 'لا مهام مستحقة اليوم',
        tone: data.tasksOverdue.length > 0 ? 'danger' : 'success',
        href: '#/tasks',
      }),
      statCard({
        label: 'مستحقات غير محصّلة',
        value: formatMoneyCompact(data.outstandingMinor),
        iconName: 'wallet',
        meta: data.overdueCharges > 0 ? 'منها ما تأخر سداده' : 'كل المستحقات ضمن مواعيدها',
        tone: data.outstandingMinor > 0 ? 'warning' : 'success',
        href: '#/finance?tab=charges',
        small: true,
      }),
      statCard({
        label: 'مهام مفتوحة',
        value: formatNumber(data.tasksOpenCount),
        iconName: 'tasks',
        meta: data.needsAttention.length > 0 ? `${formatNumber(data.needsAttention.length)} بند يحتاج انتباهك` : 'لا بنود معلّقة',
        href: '#/tasks',
      }),
    ),
  );

  const main = h(
    'div',
    { class: 'detail-main' },
    hearingsCard(context, data.hearingsToday, data.hearingsTomorrow),
    data.needsAttention.length > 0 ? attentionCard(data.needsAttention) : null,
    tasksCard(context, data.tasksToday, data.tasksOverdue),
    recentFilesCard(data.recentFiles),
  );
  const aside = h(
    'div',
    { class: 'detail-aside' },
    data.appointmentsToday.length > 0 ? appointmentsCard(data.appointmentsToday) : null,
    data.readiness.length > 0 ? readinessCard(data.readiness) : null,
    activityCard(data.recentActivity),
    sectionCard({
      title: 'إجراءات سريعة',
      bodyClass: 'card__body--tight',
      body: h(
        'div',
        { class: 'stack', style: 'gap:2px;padding:4px' },
        quickAction('إضافة جلسة لقضية', 'gavel', '/hearings?new=1'),
        quickAction('تسجيل مستحق مالي', 'wallet', '/finance?tab=charges&new=1'),
        quickAction('مستند جديد', 'document', '/documents?new=1'),
        quickAction('إضافة عميل', 'users', '/clients?new=1'),
      ),
    }),
  );

  page.appendChild(h('div', { class: 'detail-layout' }, main, aside));
  return page;
}

// ---------------------------------------------------------------------------
function hearingsCard(context: PageArgs, today: HearingRow[], tomorrow: HearingRow[]): HTMLElement {
  const body: Child[] = [];
  if (today.length === 0) {
    body.push(
      emptyState({
        iconName: 'gavel',
        title: 'لا جلسات محددة اليوم',
        text: tomorrow.length > 0 ? `لديك ${formatNumber(tomorrow.length)} جلسة غدًا.` : 'جدول اليوم خالٍ من الجلسات، ويمكنك متابعة المهام أو مراجعة المستحقات.',
        actions: [
          h('a', { class: 'btn btn--outline btn--sm', href: '#/hearings?period=week', text: 'جلسات الأسبوع' }),
          h('a', { class: 'btn btn--primary btn--sm', href: '#/hearings?new=1', text: 'إضافة جلسة' }),
        ],
      }),
    );
  } else {
    body.push(
      h(
        'div',
        { class: 'timeline', style: 'padding:4px' },
        ...today.map((row) => {
          const done = row.statusCode !== 'scheduled';
          return h(
            'div',
            { class: 'timeline__item', dataset: { hearing: String(row.hearing.id) } },
            h('span', {
              class: 'timeline__dot',
              style: done ? 'background:var(--c-success-soft);color:var(--c-success)' : '',
            }, icon(done ? 'check' : 'gavel', 14)),
            h(
              'div',
              { class: 'timeline__body' },
              h(
                'div',
                { class: 'row-wrap', style: 'gap:8px' },
                h('span', { class: 'timeline__title', text: row.caseLabel }),
                h('span', { class: 'num badge badge--quiet', text: formatTime(String(row.hearing.scheduled_at)) }),
                h('span', { class: `badge badge--${statusTone(row.statusCode)}`, text: row.statusName }),
              ),
              h('p', { class: 'timeline__meta', text: `${row.courtName} · ${row.purposeName}` }),
              row.clientNames.length > 0
                ? h('p', { class: 'timeline__meta', text: `الموكل: ${row.clientNames.join('، ')}` })
                : null,
              row.hearing.outcome_summary
                ? h('p', { class: 'text-xs', style: 'margin-block-start:4px', text: String(row.hearing.outcome_summary) })
                : null,
              h(
                'div',
                { class: 'row-wrap', style: 'margin-block-start:6px;gap:4px' },
                h('a', { class: 'btn btn--ghost btn--sm', href: `#/cases/${String(row.hearing.case_id)}`, text: 'ملف القضية' }),
                h('button', {
                  class: `btn btn--sm ${done ? 'btn--ghost' : 'btn--secondary'}`,
                  type: 'button',
                  text: done ? 'تحديث النتيجة' : 'تسجيل النتيجة',
                  on: { click: () => openHearingOutcome(context, row) },
                }),
              ),
            ),
          );
        }),
      ),
    );
  }
  if (tomorrow.length > 0) {
    body.push(
      notice('neutral', tomorrow.map((row) => `${formatTime(String(row.hearing.scheduled_at))} · ${row.caseLabel} — ${row.courtName}`).join('  |  '), {
        title: 'غدًا',
        iconName: 'calendar',
      }),
    );
  }
  return sectionCard({
    title: 'جلسات اليوم',
    ...(today.length > 0 ? { subtitle: 'مرتبة بحسب موعد الانعقاد؛ سجّل النتيجة فور انتهاء الجلسة.' } : {}),
    actions: [h('a', { class: 'section-link', href: '#/hearings', text: 'كل الجلسات' })],
    body,
    bodyClass: 'card__body--tight',
  });
}

function attentionCard(items: AttentionItem[]): HTMLElement {
  const icons: Record<string, string> = { task: 'tasks', hearing: 'gavel', finance: 'wallet', document: 'document', backup: 'database' };
  return sectionCard({
    title: 'يحتاج انتباهك',
    subtitle: 'بنود مستخرجة من البيانات: تأخير، أو مستحق، أو إجراء ناقص.',
    actions: [h('a', { class: 'section-link', href: '#/tasks?status=open', text: 'كل المهام' })],
    bodyClass: 'card__body--tight',
    body: h(
      'div',
      { class: 'attention-list' },
      ...items.map((item) =>
        h(
          'a',
          { class: `attention-item${item.severity === 'normal' ? '' : ` attention-item--${item.severity}`}`, href: item.route },
          h('span', { class: 'attention-item__icon' }, icon(icons[item.kind] ?? 'alert', 17)),
          h(
            'span',
            { class: 'attention-item__body' },
            h('span', { class: 'attention-item__title', text: item.title }),
            h('span', { class: 'attention-item__desc', text: item.description }),
          ),
          h('span', { class: 'attention-item__meta', text: item.dueLabel }),
        ),
      ),
    ),
  });
}

function tasksCard(context: PageArgs, today: TaskRow[], overdue: TaskRow[]): HTMLElement {
  const rows = [...overdue.slice(0, 4), ...today.slice(0, 4)];
  return sectionCard({
    title: 'مهام اليوم والمتأخرة',
    subtitle: 'إنجاز المهمة يُحدّث حالتها في قاعدة البيانات فورًا.',
    actions: [h('a', { class: 'section-link', href: '#/tasks', text: 'إدارة المهام' })],
    bodyClass: 'card__body--tight',
    body:
      rows.length === 0
        ? emptyState({
            iconName: 'check-square',
            title: 'لا مهام مستحقة اليوم',
            text: 'كل التكليفات المفتوحة إما مجدولة لاحقًا أو منتهية.',
            actions: [h('a', { class: 'btn btn--outline btn--sm', href: '#/tasks', text: 'عرض كل المهام' })],
          })
        : h(
            'div',
            { class: 'attention-list' },
            ...rows.map((row) => {
              const isOverdue = overdue.includes(row);
              return h(
                'div',
                { class: 'attention-item', style: 'align-items:center' },
                h('span', { class: 'attention-item__icon' }, icon('tasks', 17)),
                h(
                  'span',
                  { class: 'attention-item__body' },
                  h('span', { class: 'attention-item__title', text: String(row.task.title) }),
                  h('span', { class: 'attention-item__desc', text: [row.clientName, row.fileLabel, row.priorityName].filter(Boolean).join(' · ') }),
                ),
                h(
                  'span',
                  { class: 'row', style: 'gap:8px' },
                  h('span', {
                    class: `badge badge--${isOverdue ? 'danger' : 'warning'}`,
                    text: row.task.due_at ? formatRelative(String(row.task.due_at)) : 'بلا موعد',
                  }),
                  h(
                    'button',
                    {
                      class: 'btn btn--outline btn--sm',
                      type: 'button',
                      text: 'إنجاز',
                      on: {
                        click: async (event) => {
                          const button = event.currentTarget as HTMLButtonElement;
                          button.disabled = true;
                          try {
                            await context.services.tasks.changeStatus(String(row.task.id), 'completed');
                            toastSuccess('تم إنجاز المهمة وحفظها');
                            navigate('/today');
                          } catch (error) {
                            const ui = toUiError(error);
                            toastError(ui.message, ui.detail);
                            button.disabled = false;
                          }
                        },
                      },
                    },
                    icon('check', 14),
                  ),
                ),
              );
            }),
          ),
  });
}

function recentFilesCard(files: DashboardData['recentFiles']): HTMLElement {
  return sectionCard({
    title: 'ملفات عملت عليها مؤخرًا',
    subtitle: 'آخر الملفات تحديثًا في هذا الجهاز.',
    actions: [h('a', { class: 'section-link', href: '#/files', text: 'كل الملفات' })],
    bodyClass: 'card__body--tight',
    body:
      files.length === 0
        ? emptyState({
            iconName: 'folder',
            title: 'لا ملفات بعد',
            text: 'أنشئ ملفًا جديدًا لتبدأ تسجيل الأطراف والقضايا والمستندات.',
            actions: [h('a', { class: 'btn btn--primary btn--sm', href: '#/files?new=1', text: 'إنشاء ملف' })],
          })
        : h(
            'div',
            { class: 'record-list' },
            ...files.map((entry) =>
              h(
                'a',
                { class: 'attention-item', href: `#/files/${String(entry.file.id)}` },
                h('span', { class: 'attention-item__icon' }, icon('folder', 17)),
                h(
                  'span',
                  { class: 'attention-item__body' },
                  h('span', { class: 'attention-item__title', text: String(entry.file.title) }),
                  h('span', { class: 'attention-item__desc', text: [String(entry.file.file_number), entry.clientNames.join('، ')].filter(Boolean).join(' · ') }),
                ),
                h('span', { class: 'attention-item__meta', text: formatRelative(String(entry.file.updated_at)) }),
              ),
            ),
          ),
  });
}

function appointmentsCard(rows: AppointmentRow[]): HTMLElement {
  return sectionCard({
    title: 'مواعيد اليوم',
    actions: [h('a', { class: 'section-link', href: '#/appointments', text: 'المواعيد' })],
    body: h(
      'div',
      { class: 'stack', style: 'gap:8px' },
      ...rows.map((row) =>
        h(
          'div',
          { class: 'row', style: 'align-items:flex-start;gap:8px' },
          h('span', { class: 'badge badge--primary num', text: formatTime(String(row.appointment.start_at)) }),
          h(
            'div',
            { style: 'flex:1;min-inline-size:0' },
            h('p', { class: 'text-sm strong truncate', text: String(row.appointment.title) }),
            h('p', { class: 'text-xs text-3', text: [row.kindName, row.partyName, row.fileLabel].filter(Boolean).join(' · ') }),
          ),
        ),
      ),
    ),
  });
}

function readinessCard(rows: ReadinessItem[]): HTMLElement {
  return sectionCard({
    title: 'جاهزية الجلسات القادمة',
    subtitle: 'ما ينتظر الإنجاز قبل موعد الانعقاد.',
    body: h(
      'div',
      { class: 'stack', style: 'gap:10px' },
      ...rows.map((item) =>
        h(
          'div',
          null,
          h(
            'div',
            { class: 'row', style: 'justify-content:space-between;gap:8px' },
            h('span', { class: 'text-sm strong truncate', text: item.hearing.caseLabel }),
            h('span', { class: 'badge badge--primary', text: relevanceLabel(item.daysAway) }),
          ),
          h('p', { class: 'text-xs text-3', text: `${item.hearing.courtName} · ${formatDate(String(item.hearing.hearing.scheduled_at), 'short')}` }),
          h(
            'p',
            { class: 'text-xs', style: 'margin-block-start:2px' },
            h('span', { class: item.openTasks > 0 ? 'text-warning' : 'text-success', text: `${formatNumber(item.openTasks)} مهمة مفتوحة` }),
            ' · ',
            h('span', { class: 'text-3', text: `${formatNumber(item.documents)} مستند مرتبط` }),
          ),
        ),
      ),
    ),
  });
}

function activityCard(activity: DashboardData['recentActivity']): HTMLElement {
  return sectionCard({
    title: 'نشاط المكتب',
    subtitle: 'آخر التغييرات المسجّلة في سجل النشاط.',
    actions: [h('a', { class: 'section-link', href: '#/archive', text: 'السجل' })],
    body:
      activity.length === 0
        ? h('p', { class: 'text-sm text-3', text: 'سيظهر هنا كل إنشاء أو تعديل أو حذف بمجرد تنفيذه.' })
        : h(
            'div',
            { class: 'timeline' },
            ...activity.map((item) =>
              h(
                'div',
                { class: 'timeline__item' },
                h('span', { class: 'timeline__dot' }, icon('history', 13)),
                h(
                  'div',
                  { class: 'timeline__body' },
                  item.route
                    ? h('a', { class: 'timeline__title', href: item.route, text: item.title })
                    : h('p', { class: 'timeline__title', text: item.title }),
                  h('p', { class: 'timeline__meta', text: `${item.summary} · ${formatRelative(item.occurredAt)}` }),
                ),
              ),
            ),
          ),
  });
}

function quickAction(label: string, iconName: string, href: string): HTMLElement {
  return h(
    'a',
    { class: 'menu__item', href, style: 'text-decoration:none' },
    icon(iconName, 17),
    h('span', { text: label }),
    icon('chevron-left', 14),
  );
}

// ---------------------------------------------------------------------------
function onboarding(context: PageArgs): HTMLElement {
  const configured = context.workspace.officeConfigured();
  const steps = [
    { title: 'بيانات المكتب', text: 'اسم المكتب والعنوان وبيانات التواصل تظهر في المستندات المطبوعة.', href: '#/settings?tab=office', done: configured, label: 'إعداد المكتب' },
    { title: 'أول عميل', text: 'سجّل عميلًا (شخصًا أو شركة) مع بيانات التواصل.', href: '#/clients?new=1', done: false, label: 'إضافة عميل' },
    { title: 'أول ملف', text: 'اجمع أطراف الملف وقضاياه ومستنداته في مكان واحد.', href: '#/files?new=1', done: false, label: 'إنشاء ملف' },
    { title: 'النسخة الاحتياطية', text: 'البيانات محفوظة على هذا الجهاز فقط؛ نزّل نسخة احتياطية دوريًا.', href: '#/settings?tab=backup', done: false, label: 'فتح النسخ الاحتياطي' },
  ];
  return h(
    'div',
    { class: 'detail-layout' },
    h(
      'div',
      { class: 'detail-main' },
      h(
        'section',
        { class: 'hero-band' },
        h(
          'div',
          { class: 'hero-band__main' },
          h('p', { class: 'chip', text: 'البداية' }),
          h('h2', { class: 'hero-band__title', text: 'مكتبك جاهز، ولم تُسجَّل بيانات بعد' }),
          h(
            'p',
            { class: 'page-subtitle', style: 'margin-block-start:8px;max-inline-size:60ch' },
            'لا توجد سجلات تجريبية معروضة كأنها حقيقية. ابدأ بالخطوات الأربع، وستكون لوحة اليوم والتقارير مبنية فقط على ما تدخله فعليًا.',
          ),
        ),
        h(
          'div',
          { class: 'hero-band__actions' },
          h('a', { class: 'btn btn--primary', href: '#/files?new=1', text: 'إنشاء أول ملف' }),
          h('a', { class: 'btn btn--ghost', href: '#/settings?tab=office', text: 'إعداد المكتب' }),
        ),
      ),
      sectionCard({
        title: 'خطوات البدء',
        subtitle: 'مرتبة بحسب الأهمية لبدء العمل.',
        body: h(
          'div',
          { class: 'record-list' },
          ...steps.map((step, index) =>
            h(
              'div',
              { class: 'record-card' },
              h(
                'div',
                { class: 'record-card__head' },
                h(
                  'span',
                  { class: 'avatar', style: step.done ? 'background:var(--c-success-soft);color:var(--c-success)' : '' },
                  step.done ? icon('check', 17) : document.createTextNode(String(index + 1)),
                ),
                h(
                  'div',
                  { style: 'flex:1;min-inline-size:0' },
                  h('h3', { class: 'record-card__title', text: step.title }),
                  h('p', { class: 'text-xs text-3', text: step.text }),
                ),
                h('a', { class: 'btn btn--outline btn--sm', href: step.href, text: step.label }),
              ),
            ),
          ),
        ),
      }),
      notice('neutral', 'البرنامج لا يرسل أي بيانات إلى الإنترنت. كل السجلات تُخزَّن محليًا عبر محرك IndexedDB، والنسخ الاحتياطي ملف تنزّله أنت.', {
        title: 'أين تُحفظ بياناتي؟',
        iconName: 'shield',
      }),
    ),
    h(
      'div',
      { class: 'detail-aside' },
      sectionCard({
        title: 'ما ستجده هنا',
        body: h(
          'div',
          { class: 'stack', style: 'gap:10px' },
          ...['جلسات اليوم وما يحتاج انتباهك', 'المهام المتأخرة والمستحقات', 'ملفات العملاء وقضاياهم', 'تقارير مبنية على بياناتك'].map((line) =>
            h('p', { class: 'row text-sm', style: 'gap:8px;align-items:flex-start' }, icon('check', 15), h('span', { text: line })),
          ),
        ),
      }),
      sectionCard({
        title: 'حالة التخزين',
        body: h(
          'div',
          { class: 'stack', style: 'gap:8px' },
          h('p', { class: 'text-sm text-2', text: 'المحرك: IndexedDB داخل المتصفح' }),
          h('p', {
            class: 'text-xs text-3',
            text: context.workspace.storage.persisted === true
              ? 'المتصفح وعد بالاحتفاظ بالبيانات (Persistent Storage).'
              : 'قد يطلب المتصفح مساحة إضافية؛ نزّل نسخة احتياطية دوريًا.',
          }),
          h('a', { class: 'btn btn--outline btn--sm', href: '#/settings?tab=backup', text: 'إدارة النسخ الاحتياطي' }),
        ),
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// تسجيل نتيجة جلسة — كتابة حقيقية في base البيانات
// ---------------------------------------------------------------------------
export function openHearingOutcome(context: PageArgs, row: HearingRow, onDone?: () => void): void {
  const statuses = ['held', 'postponed', 'stayed', 'cancelled'];

  const statusSelect = h(
    'select',
    { class: 'input select', name: 'status', attrs: { 'aria-label': 'نتيجة الجلسة' } },
    ...statuses.map((code) =>
      h('option', {
        value: code,
        text: context.workspace.lookups.item('hearing_status', code)?.nameAr ?? code,
        ...(code === (row.statusCode || 'held') ? { selected: true } : {}),
      }),
    ),
  );
  const heldAt = dateTimeField({
    label: 'وقت الانعقاد الفعلي',
    name: 'heldAt',
    value: toLocalInput(new Date(row.hearing.scheduled_at ? String(row.hearing.scheduled_at) : new Date().toISOString())),
    help: 'يُحفظ بالتوقيت العالمي ويُعرض بتوقيت القاهرة.',
  });
  const summary = textareaField({
    label: 'ملخص ما تم في الجلسة',
    name: 'outcome',
    placeholder: 'مثال: قدّم المدعى عليه مذكرة دفاع، وقررت المحكمة حجز الدعوى للحكم…',
    rows: 4,
    maxlength: 2000,
  });
  const nextDate = dateTimeField({
    label: 'موعد الجلسة القادمة (إن تأجلت)',
    name: 'nextAt',
    value: toLocalInput(addDays(new Date(), 30)),
    help: 'يجب أن يكون بعد موعد الجلسة الحالية؛ ينشئ جلسة جديدة مرتبطة بها.',
  });
  const nextWrapper = h('div', { hidden: statusSelect.value !== 'postponed' ? 'hidden' : undefined }, nextDate);
  statusSelect.addEventListener('change', () => {
    if (statusSelect.value === 'postponed') nextWrapper.removeAttribute('hidden');
    else nextWrapper.setAttribute('hidden', '');
  });

  const errorBox = h('p', { class: 'field__error', attrs: { role: 'alert' } });
  let busy = false;
  const save = h(
    'button',
    {
      class: 'btn btn--primary',
      type: 'button',
      on: {
        click: async () => {
          if (busy) return;
          busy = true;
          save.disabled = true;
          save.classList.add('is-loading');
          errorBox.textContent = '';
          try {
            const statusCode = statusSelect.value;
            const values = {
              heldAt: (form.querySelector<HTMLInputElement>('[name="heldAt"]')?.value ?? '').trim(),
              outcome: (form.querySelector<HTMLTextAreaElement>('[name="outcome"]')?.value ?? '').trim(),
              nextAt: (form.querySelector<HTMLInputElement>('[name="nextAt"]')?.value ?? '').trim(),
            };
            await context.services.agenda.recordHearing(String(row.hearing.id), {
              statusCode,
              ...(values.outcome ? { outcomeSummary: values.outcome } : {}),
              ...(values.heldAt ? { heldAt: new Date(values.heldAt).toISOString() } : {}),
            });
            if (statusCode === 'postponed') {
              if (!values.nextAt) throw new Error('حدد موعد الجلسة القادمة عند التأجيل.');
              await context.services.agenda.scheduleNext(String(row.hearing.id), new Date(values.nextAt).toISOString());
            }
            handle.close();
            toastSuccess('تم تسجيل نتيجة الجلسة وحفظها في قاعدة البيانات');
            onDone?.();
          } catch (error) {
            const ui = toUiError(error);
            errorBox.textContent = ui.message;
            save.disabled = false;
            save.classList.remove('is-loading');
            busy = false;
          }
        },
      },
    },
    icon('save', 17),
    h('span', { text: 'حفظ النتيجة' }),
  );

  const form = h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h(
      'div',
      { class: 'notice notice--neutral' },
      icon('gavel', 17),
      h('div', null, h('p', { class: 'strong', text: row.caseLabel }), h('p', { text: `${row.courtName} · ${row.purposeName}` })),
    ),
    labelledField('نتيجة الجلسة', statusSelect, true),
    heldAt,
    summary,
    nextWrapper,
    errorBox,
  );

  const handle = openDialog({
    title: 'تسجيل نتيجة الجلسة',
    description: row.caseLabel,
    iconName: 'gavel',
    size: 'md',
    content: form,
    footer: h(
      'div',
      { class: 'dialog__actions' },
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'إلغاء', on: { click: () => handle.close() } }),
      save,
    ),
  });
}

function labelledField(label: string, control: HTMLElement, required = false): HTMLElement {
  const id = control.id || `field-${Math.random().toString(36).slice(2)}`;
  control.id = id;
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field__label', attrs: { for: id } },
      h('span', { text: label }),
      required ? h('span', { class: 'field__required', text: ' *' }) : null,
    ),
    control,
  );
}

function toLocalInput(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
