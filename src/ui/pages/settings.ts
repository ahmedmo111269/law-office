import { caseSettingsPanel } from './case-settings.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatDate, formatNumber } from '../format.ts';
import {
  definitionList,
  notice,
  pageHeader,
  sectionCard,
  tabPanel,
  tabs,
} from '../components/page.ts';
import { selectField, textField, textareaField } from '../components/forms.ts';
import { confirmDialog } from '../components/dialog.ts';
import { toastError, toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import type { PageArgs } from '../app/context.ts';
import type {
  PortableBackup,
  PortableBackupVerification,
} from '../../portable/portable-database.ts';
import { APP_VERSION } from '../state/workspace.ts';
import { setFieldError } from './shared.ts';

type TabId = 'office' | 'appearance' | 'tables' | 'cases' | 'backup' | 'about';

export async function renderSettings(context: PageArgs): Promise<HTMLElement> {
  const { workspace } = context;
  const preferences = workspace.preferences;
  const requested = (context.query.get('tab') as TabId | null) ?? 'office';
  const active: TabId = (
    ['office', 'appearance', 'tables', 'cases', 'backup', 'about'] as const
  ).includes(requested)
    ? requested
    : 'office';

  const panels: Record<TabId, HTMLElement> = {
    office: tabPanel('office', officePanel(context)),
    appearance: tabPanel('appearance', appearancePanel(context)),
    tables: tabPanel('tables', await tablesPanel(context)),
    cases: tabPanel('cases', await caseSettingsPanel(context)),
    backup: tabPanel('backup', await backupPanel(context)),
    about: tabPanel('about', aboutPanel(context)),
  };
  for (const [key, panel] of Object.entries(panels))
    panel.hidden = key !== active;
  const handle = tabs(
    [
      { id: 'office', label: 'بيانات المكتب', iconName: 'briefcase' },
      { id: 'appearance', label: 'المظهر', iconName: 'display' },
      { id: 'tables', label: 'الجداول', iconName: 'columns' },
      { id: 'cases', label: 'القضايا والمراجع', iconName: 'scale' },
      { id: 'backup', label: 'النسخ الاحتياطي', iconName: 'shield' },
      { id: 'about', label: 'عن البرنامج', iconName: 'info' },
    ],
    active,
    (id) => {
      for (const [key, panel] of Object.entries(panels))
        panel.hidden = key !== id;
      handle.setActive(id);
      const url = new URL(window.location.href);
      url.hash = `#/settings${id === 'office' ? '' : `?tab=${id}`}`;
      window.history.replaceState(null, '', url.toString());
    },
  );

  void preferences;
  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'الإعدادات',
      subtitle:
        'بيانات المكتب، مظهر الواجهة، تفضيلات الجداول، والنسخ الاحتياطي. كل الإعدادات الشخصية محفوظة في قاعدة البيانات المحلية.',
    }),
    handle.root,
    ...Object.values(panels),
  );
}

// ---------------------------------------------------------------------------
function officePanel(context: PageArgs): HTMLElement {
  const { workspace } = context;
  const profile = workspace.profile;
  const lookups = workspace.lookups;
  const existing = new Map(
    workspace.settings.map((row) => [String(row.key), row]),
  );

  const name = textField({
    label: 'اسم المكتب',
    name: 'name',
    required: true,
    value: String(profile.name ?? ''),
    maxlength: 160,
  });
  const legalForm = textField({
    label: 'الشكل القانوني',
    name: 'legalForm',
    value: String(profile.legal_form ?? ''),
    maxlength: 80,
    placeholder: 'مكتب محاماة فردي / شركة محاماة',
  });
  const barNo = textField({
    label: 'رقم القيد بالنقابة',
    name: 'barAssociationNo',
    dir: 'ltr',
    value: String(profile.bar_association_no ?? ''),
    maxlength: 40,
  });
  const taxNo = textField({
    label: 'الرقم الضريبي',
    name: 'taxRegistrationNo',
    dir: 'ltr',
    value: String(profile.tax_registration_no ?? ''),
    maxlength: 40,
  });
  const crNo = textField({
    label: 'السجل التجاري',
    name: 'commercialRegistryNo',
    dir: 'ltr',
    value: String(profile.commercial_registry_no ?? ''),
    maxlength: 40,
  });
  const phone = textField({
    label: 'الهاتف',
    name: 'phone',
    dir: 'ltr',
    inputmode: 'tel',
    value: String(profile.phone ?? ''),
    maxlength: 30,
  });
  const email = textField({
    label: 'البريد الإلكتروني',
    name: 'email',
    dir: 'ltr',
    type: 'email',
    value: String(profile.email ?? ''),
    maxlength: 120,
  });
  const website = textField({
    label: 'الموقع',
    name: 'website',
    dir: 'ltr',
    value: String(profile.website ?? ''),
    maxlength: 120,
  });
  const city = textField({
    label: 'المدينة',
    name: 'city',
    value: String(profile.city ?? ''),
    maxlength: 80,
  });
  const governorate = selectField({
    label: 'المحافظة',
    name: 'governorateId',
    options: lookups
      .items('governorate')
      .map((item) => ({ value: item.id, label: item.nameAr })),
    value: String(profile.governorate_id ?? ''),
  });
  const address = textareaField({
    label: 'العنوان',
    name: 'addressLine',
    rows: 2,
    maxlength: 300,
    value: String(profile.address_line ?? ''),
  });
  const notes = textareaField({
    label: 'ملاحظات داخلية',
    name: 'notes',
    rows: 2,
    maxlength: 1000,
    value: String(profile.notes ?? ''),
  });
  const status = h('span', { class: 'text-xs text-3' });

  const saveButton = h(
    'button',
    { class: 'btn btn--primary', type: 'button' },
    icon('save', 17),
    h('span', { text: 'حفظ بيانات المكتب' }),
  );
  saveButton.addEventListener('click', () => {
    void (async () => {
      const form = saveButton.closest('.settings-form') as HTMLElement;
      const values: Record<string, string> = {};
      for (const control of form.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('input, select, textarea')) {
        if (control.name) values[control.name] = control.value.trim();
      }
      if (!values.name) {
        setFieldError(form as HTMLFormElement, 'name', 'اسم المكتب مطلوب.');
        return;
      }
      saveButton.classList.add('is-busy');
      saveButton.setAttribute('disabled', 'true');
      try {
        await workspace.db.update('office_profile', String(profile.id), {
          name: values.name,
          legal_form: values.legalForm || null,
          bar_association_no: values.barAssociationNo || null,
          tax_registration_no: values.taxRegistrationNo || null,
          commercial_registry_no: values.crNo || null,
          phone: values.phone || null,
          email: values.email || null,
          website: values.website || null,
          city: values.city || null,
          governorate_id: values.governorateId || null,
          address_line: values.addressLine || null,
          notes: values.notes || null,
          is_configured: 1,
        });
        const refreshed = await workspace.db.query('office_profile', {
          limit: 1,
        });
        if (refreshed.rows[0]) workspace.profile = refreshed.rows[0];
        status.textContent = 'تم الحفظ في قاعدة البيانات.';
        toastSuccess('تم تحديث بيانات المكتب');
        const officeNameNode = document.querySelector('.sidebar-office__name');
        if (officeNameNode) officeNameNode.textContent = workspace.officeName();
        const topbarName = document.querySelector('.topbar-avatar');
        if (topbarName) topbarName.textContent = values.name.charAt(0);
      } catch (error) {
        const ui = toUiError(error);
        toastError(ui.message, ui.detail);
      } finally {
        saveButton.classList.remove('is-busy');
        saveButton.removeAttribute('disabled');
      }
    })();
  });

  const officeSetting = async (
    key: string,
    value: string,
    label: string,
  ): Promise<void> => {
    try {
      const row = existing.get(key);
      if (row)
        await workspace.db.update('office_setting', String(row.id), { value });
      else
        await workspace.db.insert('office_setting', {
          key,
          value,
          value_type: 'string',
          description: label,
        });
      toastSuccess('تم حفظ الإعداد');
      context.shell.announce('تم حفظ الإعداد');
    } catch (error) {
      const ui = toUiError(error);
      toastError(ui.message, ui.detail);
    }
  };

  const makeSettingSelect = (
    key: string,
    label: string,
    options: Array<{ value: string; label: string }>,
    fallback: string,
  ): HTMLElement => {
    const current = String(existing.get(key)?.value ?? fallback);
    const select = h(
      'select',
      {
        class: 'input select',
        id: `setting-${key}`,
        attrs: { 'aria-label': label },
      },
      ...options.map((option) =>
        h('option', {
          value: option.value,
          text: option.label,
          ...(option.value === current ? { selected: true } : {}),
        }),
      ),
    );
    select.addEventListener(
      'change',
      () => void officeSetting(key, select.value, label),
    );
    return h(
      'div',
      { class: 'field' },
      h('label', {
        class: 'field__label',
        attrs: { for: `setting-${key}` },
        text: label,
      }),
      select,
    );
  };

  return h(
    'form',
    {
      class: 'settings-form stack',
      on: { submit: (event) => event.preventDefault() },
    },
    sectionCard({
      title: 'هوية المكتب',
      subtitle: 'تظهر في الشريط الجانبي وترويسة المستندات المطبوعة.',
      body: h(
        'div',
        { class: 'stack' },
        h('div', { class: 'form-grid' }, name, legalForm),
        h('div', { class: 'form-grid' }, barNo, taxNo, crNo),
        h('div', { class: 'form-grid' }, phone, email, website),
        h('div', { class: 'form-grid' }, city, governorate),
        address,
        notes,
        h(
          'div',
          { class: 'row-wrap', style: 'justify-content:space-between' },
          status,
          saveButton,
        ),
      ),
    }),
    sectionCard({
      title: 'إعدادات العمل',
      body: h(
        'div',
        { class: 'form-grid form-grid--3' },
        makeSettingSelect(
          'finance.default_currency',
          'العملة الافتراضية',
          [{ value: 'EGP', label: 'الجنيه المصري (EGP)' }],
          'EGP',
        ),
        makeSettingSelect(
          'locale.date_format',
          'صيغة التاريخ',
          [
            { value: 'dd/MM/yyyy', label: 'يوم/شهر/سنة' },
            { value: 'yyyy-MM-dd', label: 'سنة-شهر-يوم' },
          ],
          'dd/MM/yyyy',
        ),
        makeSettingSelect(
          'locale.timezone',
          'المنطقة الزمنية',
          [{ value: 'Africa/Cairo', label: 'القاهرة (Africa/Cairo)' }],
          'Africa/Cairo',
        ),
        makeSettingSelect(
          'appointments.default_duration_minutes',
          'مدة الموعد الافتراضية',
          [
            { value: '30', label: '٣٠ دقيقة' },
            { value: '45', label: '٤٥ دقيقة' },
            { value: '60', label: 'ساعة' },
          ],
          '30',
        ),
        makeSettingSelect(
          'backup.reminder_days',
          'تذكير النسخ الاحتياطي',
          [
            { value: '3', label: 'كل ٣ أيام' },
            { value: '7', label: 'كل أسبوع' },
            { value: '30', label: 'كل شهر' },
          ],
          '7',
        ),
        makeSettingSelect(
          'finance.receipt_on_payment',
          'إصدار إيصال مع كل تحصيل',
          [
            { value: '1', label: 'نعم' },
            { value: '0', label: 'لا' },
          ],
          '1',
        ),
      ),
    }),
    notice(
      'neutral',
      'هذه القيم تُحفظ في جدول إعدادات المكتب داخل قاعدة البيانات نفسها، وليست تفضيلات متصفح.',
      { iconName: 'info' },
    ),
  );
}

// ---------------------------------------------------------------------------
function appearancePanel(context: PageArgs): HTMLElement {
  const preferences = context.workspace.preferences;
  const themeChips = h('div', {
    class: 'row-wrap',
    style: 'gap:6px',
    attrs: { role: 'group', 'aria-label': 'الوضع اللوني' },
  });
  const densityChips = h('div', {
    class: 'row-wrap',
    style: 'gap:6px',
    attrs: { role: 'group', 'aria-label': 'كثافة العرض' },
  });

  const renderTheme = (): void => {
    const current = preferences.get('ui.theme');
    themeChips.replaceChildren(
      ...[
        { value: 'light', label: 'فاتح', icon: 'sun' },
        { value: 'dark', label: 'داكن', icon: 'moon' },
        { value: 'system', label: 'حسب النظام', icon: 'monitor' },
      ].map((option) =>
        h(
          'button',
          {
            class: `chip chip--button${current === option.value ? ' chip--active' : ''}`,
            type: 'button',
            attrs: { 'aria-pressed': String(current === option.value) },
            on: {
              click: () => {
                void preferences.set('ui.theme', option.value);
                renderTheme();
                context.shell.announce(`الوضع ${option.label}`);
              },
            },
          },
          icon(option.icon, 15),
          h('span', { text: option.label }),
        ),
      ),
    );
  };
  const renderDensity = (): void => {
    const current = preferences.get('ui.density');
    densityChips.replaceChildren(
      ...[
        { value: 'compact', label: 'مضغوطة', hint: 'أسطر أقل ارتفاعًا' },
        { value: 'comfortable', label: 'مريحة', hint: 'مساحة أكبر' },
      ].map((option) =>
        h(
          'button',
          {
            class: `chip chip--button${current === option.value ? ' chip--active' : ''}`,
            type: 'button',
            title: option.hint,
            attrs: { 'aria-pressed': String(current === option.value) },
            on: {
              click: () => {
                void preferences.set('ui.density', option.value);
                renderDensity();
              },
            },
          },
          h('span', { text: option.label }),
        ),
      ),
    );
  };

  const scaleInput = h('input', {
    class: 'input',
    type: 'range',
    min: '85',
    max: '125',
    step: '5',
    value: preferences.get('ui.fontScale'),
    attrs: { 'aria-label': 'حجم الخط' },
    on: {
      input: (event) => {
        const value = (event.currentTarget as HTMLInputElement).value;
        void preferences.set('ui.fontScale', value);
        scaleValue.textContent = `${value}%`;
      },
    },
  });
  const scaleValue = h('span', {
    class: 'num text-sm strong',
    text: `${preferences.get('ui.fontScale')}%`,
  });

  const motionToggle = h('input', {
    class: 'checkbox',
    type: 'checkbox',
    id: 'reduce-motion',
    ...(preferences.get('ui.reduceMotion') === 'reduce'
      ? { checked: true }
      : {}),
    on: {
      change: (event) => {
        void preferences.set(
          'ui.reduceMotion',
          (event.currentTarget as HTMLInputElement).checked ? 'reduce' : 'auto',
        );
      },
    },
  });

  renderTheme();
  renderDensity();

  return h(
    'div',
    { class: 'stack' },
    sectionCard({
      title: 'الوضع اللوني',
      subtitle: 'يُطبق فورًا على كل الواجهة ويُحفظ لهذا الجهاز.',
      body: themeChips,
    }),
    sectionCard({
      title: 'كثافة المعلومات',
      subtitle: 'تقليل ارتفاع الأسطر يعرض سجلات أكثر دون تصغير الخط نفسه.',
      body: densityChips,
    }),
    sectionCard({
      title: 'حجم الخط',
      subtitle: 'من ٨٥٪ إلى ١٢٥٪. التخطيط يتكيف ولا يقطع النصوص.',
      body: h(
        'div',
        { class: 'row-wrap' },
        h('div', { class: 'grow', style: 'min-inline-size:220px' }, scaleInput),
        scaleValue,
      ),
    }),
    sectionCard({
      title: 'طريقة العرض',
      body: h(
        'label',
        { class: 'check-row', attrs: { for: 'reduce-motion' } },
        motionToggle,
        h(
          'span',
          { class: 'check-row__text' },
          h('span', { text: 'تقليل الحركة' }),
          h('span', {
            class: 'check-row__hint',
            text: 'يوقف الانتقالات والحركات غير الضرورية. يحترم أيضًا إعداد النظام.',
          }),
        ),
      ),
    }),
    notice(
      'info',
      'التفضيلات الشخصية تُخزَّن في جدول إعدادات الجهاز (device_setting) ولا تختلط ببيانات المكتب القانونية.',
      { iconName: 'info' },
    ),
  );
}

// ---------------------------------------------------------------------------
async function tablesPanel(context: PageArgs): Promise<HTMLElement> {
  const { workspace } = context;
  const rows = await workspace.db.listDeviceSettings();
  const tableRows = rows.filter(
    (row) =>
      String(row.key).startsWith('ui.table.') ||
      String(row.key).startsWith('ui.views.'),
  );
  const host = h('div', { class: 'stack' });
  if (tableRows.length === 0) {
    host.appendChild(
      notice(
        'neutral',
        'لا تفضيلات جداول محفوظة بعد. خصّص أي جدول من زر «الأعمدة» وستُحفظ تلقائيًا.',
        { iconName: 'columns' },
      ),
    );
  } else {
    host.appendChild(
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'card__body card__body--tight' },
          h(
            'div',
            { class: 'record-list' },
            ...tableRows.map((row) =>
              h(
                'div',
                { class: 'row', style: 'padding:10px 16px;gap:10px' },
                icon(
                  String(row.key).startsWith('ui.views.') ? 'book' : 'columns',
                  16,
                ),
                h(
                  'div',
                  { class: 'cell-main grow' },
                  h('span', {
                    class: 'cell-title mono',
                    text: String(row.key)
                      .replace('ui.table.', '')
                      .replace('ui.views.', 'عرض محفوظ: '),
                  }),
                  h('span', {
                    class: 'cell-sub',
                    text: String(row.key).startsWith('ui.views.')
                      ? 'عروض محفوظة للجدول'
                      : 'أعمدة وترتيب وكثافة وصفحات',
                  }),
                ),
                h('button', {
                  class: 'btn btn--ghost btn--sm',
                  type: 'button',
                  text: 'إعادة ضبط',
                  on: {
                    click: () => {
                      confirmDialog({
                        title: 'إعادة ضبط تفضيلات الجدول',
                        message:
                          'سيعود الجدول إلى أعمدته وترتيبه الافتراضي. لا تُمس بيانات السجلات.',
                        confirmLabel: 'إعادة الضبط',
                        onConfirm: async () => {
                          await workspace.db.removeDeviceSetting(
                            String(row.key),
                          );
                          toastSuccess(
                            'تمت إعادة الضبط',
                            'أعد تحميل الصفحة لرؤية التغيير.',
                          );
                        },
                      });
                    },
                  },
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
  return h(
    'div',
    { class: 'stack' },
    sectionCard({
      title: 'تفضيلات الجداول لهذا الجهاز',
      subtitle:
        'الأعمدة الظاهرة، ترتيبها، عرضها، التثبيت، والفرز والتصفية — محفوظة تلقائيًا لكل جدول.',
      body: host,
    }),
    notice(
      'info',
      'تفضيلات الجداول منفصلة عن البيانات: تغيير الأعمدة لا يغيّر أي سجل قانوني.',
      { iconName: 'info' },
    ),
  );
}

// ---------------------------------------------------------------------------
async function backupPanel(context: PageArgs): Promise<HTMLElement> {
  const { workspace } = context;
  const stats = await workspace.db.stats();
  const lastBackup = workspace.preferences.get('ui.lastBackupAt');
  const healthHost = h('div', { class: 'stack', style: 'gap:6px' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'input',
    attrs: { 'aria-label': 'ملف النسخة الاحتياطية' },
  });

  const exportBackup = async (): Promise<void> => {
    try {
      const backup = await workspace.db.exportBackup();
      downloadJson(
        backup,
        `law-office-backup-${backup.createdAt.slice(0, 10)}.json`,
      );
      await workspace.preferences.set(
        'ui.lastBackupAt',
        new Date().toISOString(),
      );
      toastSuccess(
        'تم تنزيل النسخة الاحتياطية',
        `${formatNumber(Object.values(backup.counts).reduce((sum, value) => sum + value, 0))} سجلًا.`,
      );
      lastBackupNode.textContent = formatDate(
        new Date().toISOString(),
        'medium',
      );
    } catch (error) {
      const ui = toUiError(error);
      toastError(ui.message, ui.detail);
    }
  };

  const lastBackupNode = h('span', {
    class: 'strong',
    text: lastBackup ? formatDate(lastBackup, 'medium') : 'لم تُؤخذ نسخة بعد',
  });

  fileInput.addEventListener('change', () => {
    void (async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed: unknown = JSON.parse(text);
        const verification = await workspace.db.verifyBackup(parsed);
        showVerification(parsed, verification);
      } catch (error) {
        const ui = toUiError(error);
        toastError('ملف غير صالح', ui.detail ?? ui.message);
      } finally {
        fileInput.value = '';
      }
    })();
  });

  const showVerification = (
    backup: unknown,
    verification: PortableBackupVerification,
  ): void => {
    if (!verification.valid) {
      confirmDialog({
        title: 'النسخة غير صالحة',
        message: 'فشل التحقق من سلامة الملف. لن تُستورد أي بيانات.',
        detail: verification.errors.join(' · '),
        confirmLabel: 'حسنًا',
        cancelLabel: 'إغلاق',
        onConfirm: async () => undefined,
      });
      return;
    }
    const candidate = backup as PortableBackup;
    const total = Object.values(candidate.counts).reduce(
      (sum, value) => sum + value,
      0,
    );
    confirmDialog({
      title: 'استعادة نسخة احتياطية',
      message:
        'ستستبدل الاستعادة كل البيانات الحالية ببيانات هذه النسخة. لا يمكن التراجع إلا بنسخة أخرى.',
      detail: `التاريخ: ${formatDate(candidate.createdAt, 'medium')} · السجلات: ${formatNumber(total)} · الجهاز المصدر: ${candidate.deviceId.slice(0, 8)}…`,
      confirmLabel: 'استبدال البيانات',
      danger: true,
      onConfirm: async () => {
        const result = await workspace.db.restoreBackup(candidate);
        toastSuccess(
          'تمت الاستعادة',
          `${formatNumber(result.restoredRows)} سجلًا.`,
        );
        window.setTimeout(() => window.location.reload(), 900);
      },
    });
  };

  const runHealth = async (): Promise<void> => {
    healthHost.replaceChildren(
      h('span', { class: 'text-sm text-3', text: 'جارٍ فحص القاعدة…' }),
    );
    try {
      const result = await workspace.db.healthCheck();
      healthHost.replaceChildren(
        result.ok
          ? notice(
              'success',
              `القاعدة سليمة: ${formatNumber(result.tables)} جدولًا و${formatNumber(result.rows)} سجلًا.`,
              { iconName: 'check' },
            )
          : notice(
              'danger',
              ['فحص القاعدة أظهر مشاكل:', ...result.errors].join(' '),
              { iconName: 'alert' },
            ),
      );
    } catch (error) {
      const ui = toUiError(error);
      healthHost.replaceChildren(
        notice('danger', ui.message, { iconName: 'alert' }),
      );
    }
  };

  return h(
    'div',
    { class: 'stack' },
    sectionCard({
      title: 'نسخة احتياطية كاملة',
      subtitle:
        'ملف JSON يحتوي كل جداول المكتب مع بصمة SHA-256 للتحقق. لا يُرفع لأي خادم — يبقى على جهازك.',
      body: h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'row-wrap', style: 'justify-content:space-between' },
          h(
            'div',
            { class: 'stack', style: 'gap:2px' },
            h('span', { class: 'text-sm strong', text: 'آخر نسخة' }),
            lastBackupNode,
          ),
          h(
            'button',
            {
              class: 'btn btn--primary',
              type: 'button',
              on: { click: () => void exportBackup() },
            },
            icon('download', 17),
            h('span', { text: 'تنزيل نسخة' }),
          ),
        ),
        h('hr', { class: 'divider' }),
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'field__label', text: 'استعادة من ملف' }),
          fileInput,
          h('p', {
            class: 'field__help',
            text: 'يُتحقق من بنية الملف وبصمته قبل الاستعادة. أي خلل يمنع الاستيراد بالكامل.',
          }),
        ),
      ),
    }),
    sectionCard({
      title: 'سلامة البيانات',
      subtitle: 'فحص بنيوي للجداول والعلاقات.',
      body: h(
        'div',
        { class: 'stack' },
        healthHost,
        h(
          'button',
          {
            class: 'btn btn--outline btn--sm',
            type: 'button',
            on: { click: () => void runHealth() },
          },
          icon('shield', 15),
          h('span', { text: 'فحص الآن' }),
        ),
      ),
    }),
    sectionCard({
      title: 'إحصاءات القاعدة',
      body: definitionList(
        Object.entries(stats).map(([table, count]) => ({
          label: tableLabel(table),
          value: formatNumber(count),
        })),
      ),
    }),
    notice(
      'warning',
      'النسخة الاحتياطية غير مشفّرة. لا تحفظها في مكان عام أو على خدمة سحابية غير موثوقة. البرنامج لا يدّعي تشفيرًا لم يُنفّذ.',
      { iconName: 'alert' },
    ),
  );
}

function tableLabel(table: string): string {
  const labels: Record<string, string> = {
    party: 'الأطراف',
    client_profile: 'العملاء',
    case_file: 'الملفات',
    legal_case: 'القضايا',
    hearing: 'الجلسات',
    judgment: 'الأحكام',
    task: 'المهام',
    document: 'المستندات',
    financial_transaction: 'الحركات المالية',
    audit_log: 'سجل التدقيق',
    sync_outbox: 'طابور المزامنة',
    search_document: 'فهرس البحث',
  };
  return labels[table] ?? table;
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
function aboutPanel(context: PageArgs): HTMLElement {
  const { workspace } = context;
  return h(
    'div',
    { class: 'stack' },
    sectionCard({
      title: 'مِداد — إدارة مكتب المحاماة',
      subtitle: `النسخة ${APP_VERSION} · محرك التخزين: ${workspace.handle.engine === 'indexeddb' ? 'IndexedDB (متصفح)' : workspace.handle.engine}`,
      body: h(
        'div',
        { class: 'stack' },
        h('p', {
          class: 'text-sm',
          text: 'برنامج مكتب محاماة مصري يعمل بالكامل على جهازك دون خادم أو حساب أو اتصال. البيانات في قاعدة IndexedDB المحلية، ويمكن نقلها بنسخة احتياطية موثّقة.',
        }),
        definitionList([
          { label: 'تنفيذ قاعدة البيانات', value: workspace.handle.engine },
          { label: 'إصدار المخطط', value: 'v1 — 57 جدولًا' },
          {
            label: 'الواجهة',
            value: 'RTL عربي · IBM Plex Sans Arabic + Amiri (خطوط محلية)',
          },
          {
            label: 'التوافق',
            value: 'Chrome / Edge / Firefox الحديثة على سطح المكتب والهاتف',
          },
          {
            label: 'الترخيص',
            value: 'استخدام داخلي للمكتب. الخطوط بترخيص SIL OFL 1.1.',
          },
        ]),
      ),
    }),
    sectionCard({
      title: 'ما لا يفعله البرنامج (بصراحة)',
      body: h(
        'div',
        { class: 'stack', style: 'gap:8px' },
        ...[
          'لا يحسب مواعيد الطعن أو الإعلان آليًا؛ تُدخل يدويًا حفاظًا على الدقة القانونية.',
          'لا يدّعي تشفير قاعدة البيانات؛ الحماية تأتي من نظام التشغيل وحساب المستخدم.',
          'لا يرفع أي مرفق إلى السحابة؛ بيانات المستندات وصفية حتى الآن.',
          'لا يزامن بين الأجهزة تلقائيًا؛ النقل عبر النسخة الاحتياطية فقط.',
          'لا يعمل تعدد المستخدمين المتزامن؛ التخزين لجهاز واحد.',
          'لا يغني عن المراجعة القانونية لأي نص أو ميعاد يظهر في الواجهة.',
        ].map((text) => h('p', { class: 'text-sm text-2', text: `• ${text}` })),
      ),
    }),
    sectionCard({
      title: 'الخصوصية',
      body: h(
        'div',
        { class: 'stack', style: 'gap:6px' },
        h('p', {
          class: 'text-sm',
          text: 'لا يُجري البرنامج أي طلب شبكة: لا خطوط خارجية، لا تحليلات، لا خدمات. كل assets تُحمَّل من الموقع نفسه.',
        }),
        h('p', {
          class: 'text-sm',
          text: 'بعد أول تحميل يعمل التطبيق دون اتصال عبر Service Worker، بما في ذلك البحث والحفظ.',
        }),
        h('p', {
          class: 'text-xs text-3',
          text: `الجهاز: ${workspace.handle.db.constructor.name === 'PortableLawOffice' ? 'متصفح محلي' : 'غير معروف'} · التخزين: ${workspace.storage.persisted === true ? 'دائم' : workspace.storage.persisted === false ? 'غير مضمون (اطلب من المتصفح تثبيته)' : 'غير معروف'}`,
        }),
      ),
    }),
  );
}
