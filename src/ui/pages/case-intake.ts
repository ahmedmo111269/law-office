import { isSensitiveCaseGroup } from '../../cases/template-privacy.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import type { PageArgs } from '../app/context.ts';
import { navigate } from '../app/router.ts';
import {
  checkboxField,
  dateField,
  selectField,
  textField,
  textareaField,
} from '../components/forms.ts';
import { confirmDialog, openDialog } from '../components/dialog.ts';
import { entityPicker, type PickerOption } from '../components/picker.ts';
import { definitionList, notice, sectionCard } from '../components/page.ts';
import { openFormDialog } from './shared.ts';
import { formatDate, isoDateToday } from '../format.ts';
import { toastError } from '../components/toast.ts';
import type { EngineRow } from '../../portable/store.ts';
import type {
  CaseTemplate,
  FieldDefinition,
  IntakeInput,
  IntakeParty,
  SpecializedValues,
  StageInput,
} from '../../cases/types.ts';
import { fieldError, parseObject } from '../../cases/validation.ts';
import { parseAmountToMinor } from '../../util/money.ts';
import { normalizeArabicDigits } from '../../util/arabic.ts';
import type { IntakeDetail } from '../../cases/intake-operations.ts';
import { completionIssues } from '../../cases/validation.ts';
import { scopedPartyLinks } from '../../cases/party-scope.ts';
import { openMenu } from '../components/menu.ts';
import { dataTable } from '../components/data-table.ts';

const str = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v);
function valuesOf(root: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const el of root.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('[name]'))
    values[el.name] = el.value.trim();
  return values;
}
const DATES = { withQuickPicks: false };
interface Layout {
  order: string[];
  hidden: string[];
  closed: string[];
  hiddenFields: string[];
}
interface IntakeOptions {
  fileId?: string;
  caseId?: string;
  sourceStageId?: string;
  relatedCaseId?: string;
  relationCode?: string;
  judgmentId?: string;
  focusField?: string;
  registerCase?: boolean;
  onSaved?: () => void;
}

/** One create/edit form. Template snapshots, not a switch statement, render specialist groups. */
export async function openCaseIntake(
  context: PageArgs,
  options: IntakeOptions = {},
): Promise<void> {
  const { services, workspace } = context;
  const db = workspace.db;
  const lookups = workspace.lookups;
  const judicial = options.caseId
    ? await db.require('legal_case', options.caseId)
    : null;
  const file = options.fileId
    ? await db.require('case_file', options.fileId)
    : null;
  const intake = file ? await services.cases.intake(str(file.id)) : null;
  const typeInitial =
    lookups.codeById(str(judicial?.case_type_id ?? file?.case_type_id)) ||
    'civil';
  let type = typeInitial;
  let template = await services.cases.template(type, file ?? undefined);
  let specialized = parseObject<SpecializedValues>(file?.specialized_json, {});
  let confirmTypeChange = false;
  const classifications = new Map<
    string,
    { subtype: string; nature: string }
  >();
  classifications.set(type, {
    subtype: str(file?.subtype_id),
    nature: str(file?.nature_id),
  });
  const layout = workspace.preferences.getJson<Layout>('ui.caseForm.layout', {
    order: [],
    hidden: [],
    closed: [],
    hiddenFields: [],
  });
  const sectionHost = h('div', { class: 'case-intake__sections' });
  const specializedHost = h('div', { class: 'case-intake__specialized' });
  const navHost = h('nav', {
    class: 'case-intake__nav',
    attrs: { 'aria-label': 'أقسام إدخال القضية' },
  });
  const sections = new Map<string, HTMLDetailsElement>();
  const pendingParties: Array<IntakeParty & { label: string }> = [];
  const pendingDocuments: PickerOption[] = [];
  const selectedFileId = options.fileId ?? '';
  let formHandle: ReturnType<typeof openFormDialog> | undefined;
  const documentHost = h('div', { class: 'row-wrap' });
  const partyHost = h('div', { class: 'stack', style: 'gap:8px' });
  let result: Awaited<ReturnType<typeof services.cases.saveIntake>> | null =
    null;

  const addSection = (
    key: string,
    title: string,
    body: HTMLElement,
    open = false,
  ): HTMLDetailsElement => {
    const section = h(
      'details',
      {
        class: 'intake-section',
        dataset: { section: key },
        open: open && !layout.closed.includes(key),
      },
      h(
        'summary',
        null,
        h(
          'span',
          { class: 'intake-section__marker' },
          icon('chevron-down', 16),
        ),
        h('span', { text: title }),
      ),
      h('div', { class: 'intake-section__body' }, body),
    );
    section.addEventListener('toggle', () => {
      const closed = new Set(layout.closed);
      if (section.open) closed.delete(key);
      else closed.add(key);
      layout.closed = [...closed];
      void workspace.preferences
        .set('ui.caseForm.layout', JSON.stringify(layout), 'json')
        .catch(() => toastError('تعذر حفظ تخصيص نموذج القضية. أعد المحاولة.'));
    });
    sections.set(key, section);
    return section;
  };
  const typeField = selectField({
    label: 'نوع القضية الرئيسي',
    name: 'caseTypeCode',
    required: true,
    value: type,
    options: lookups
      .allItems('case_type')
      .filter((t) => t.isActive || t.code === type)
      .map((t) => ({ value: t.code, label: t.nameAr })),
  });
  const subtype = selectField({
    label: 'التصنيف الفرعي',
    name: 'subtypeId',
    options: [],
    value: '',
  });
  const nature = selectField({
    label: 'طبيعة / موضوع التصنيف',
    name: 'natureId',
    options: [],
    value: '',
  });
  const typeSelect = typeField.querySelector('select')!;
  const subtypeSelect = subtype.querySelector('select')!;
  const natureSelect = nature.querySelector('select')!;
  const updateClassifications = (): void => {
    const saved = classifications.get(type) ?? {
      subtype: specialized[type]?._subtype_id ?? '',
      nature: specialized[type]?._nature_id ?? '',
    };
    subtypeSelect.replaceChildren(
      h('option', { value: '', text: '— يحدد لاحقًا —' }),
      ...lookups
        .allItems('case_classification')
        .filter(
          (i) =>
            (i.isActive ||
              i.id === str(file?.subtype_id) ||
              i.id === str(file?.nature_id)) &&
            i.parentId === lookups.id('case_type', type),
        )
        .map((i) => h('option', { value: i.id, text: i.nameAr })),
    );
    subtypeSelect.value = saved.subtype;
    updateNatures(saved.nature);
  };
  const updateNatures = (value = ''): void => {
    natureSelect.replaceChildren(
      h('option', { value: '', text: '— اختياري —' }),
      ...lookups
        .allItems('case_classification')
        .filter(
          (i) =>
            (i.isActive ||
              i.id === str(file?.subtype_id) ||
              i.id === str(file?.nature_id)) &&
            i.parentId === subtypeSelect.value,
        )
        .map((i) => h('option', { value: i.id, text: i.nameAr })),
    );
    natureSelect.value = value;
  };
  updateClassifications();
  const classification = addSection(
    'classification',
    '١. النوع والتصنيف',
    h(
      'div',
      { class: 'stack' },
      h('div', { class: 'form-grid' }, typeField, subtype, nature),
      h('p', {
        class: 'field__help',
        text: 'تصنيف عملي قابل للتعديل، وليس تحديدًا للاختصاص أو تقريرًا لصحة إجراء قانوني.',
      }),
    ),
    true,
  );
  classification.open = true;

  const filePicker =
    !options.fileId && !options.caseId
      ? entityPicker({
          name: 'fileId',
          label: 'استخدام ملف مكتب موجود بدل إنشاء ملف جديد',
          search: (q) => services.files.searchOptions(q),
          help: 'اختيار ملف يحمل بياناته وقالب إصداره بعد تأكيد ترك المدخلات غير المحفوظة.',
        })
      : null;
  filePicker?.root.addEventListener('change', () => {
    const id = filePicker.getValue();
    if (!id) return;
    filePicker.setValue(null);
    confirmDialog({
      title: 'تحميل بيانات ملف موجود',
      message:
        'سيُفتح النموذج ببيانات الملف المحفوظة وقالب إصداره بدل المدخلات غير المحفوظة الآن. لن تُستبدل بيانات الملف بقيم فارغة. هل تريد المتابعة؟',
      confirmLabel: 'تحميل الملف',
      onConfirm: async () => {
        formHandle?.close();
        await openCaseIntake(context, { ...options, fileId: id });
      },
    });
  });
  const lawyer = entityPicker({
    name: 'responsiblePartyId',
    label: 'المحامي / المسؤول عن المتابعة',
    search: (q) => services.parties.searchOptions(q),
    ...(file?.responsible_party_id
      ? {
          initial: {
            value: str(file.responsible_party_id),
            label: str(
              (await db.get('party', str(file.responsible_party_id)))
                ?.display_name,
            ),
          },
        }
      : {}),
  });
  const basic = h(
    'div',
    { class: 'stack' },
    file
      ? h('p', {
          class: 'chip',
          text: `رقم الملف الداخلي: ${str(file.file_number)}`,
        })
      : filePicker?.root,
    textField({
      label: 'عنوان ملف النزاع',
      name: 'title',
      value: str(file?.title),
      maxlength: 250,
      help: 'يكفي عنوان واضح ونوع رئيسي لإنشاء ملف قبل القيد. رقم الملف يولد داخليًا ولا يحل محل رقم الدعوى.',
    }),
    textareaField({
      label: 'موضوع النزاع',
      name: 'subject',
      value: str(judicial?.subject ?? file?.subject),
      rows: 2,
      maxlength: 10000,
    }),
    textareaField({
      label: 'الوقائع / نطاق العمل المختصر',
      name: 'facts',
      value: str(file?.facts),
      rows: 2,
      maxlength: 20000,
    }),
    textareaField({
      label: 'الطلبات الأساسية',
      name: 'requests',
      value: str(file?.requests),
      rows: 2,
      maxlength: 10000,
    }),
    h(
      'div',
      { class: 'form-grid' },
      textField({
        label: 'صفة المكتب / الموكل في هذه المرحلة',
        name: 'officeCapacity',
        value: str(judicial?.office_capacity ?? file?.office_capacity),
      }),
      lawyer.root,
    ),
    h(
      'div',
      { class: 'form-grid' },
      dateField(
        {
          label: 'تاريخ الاستلام بالمكتب',
          name: 'receivedOn',
          value: str(file?.opened_on) || isoDateToday(),
        },
        DATES,
      ),
      dateField(
        {
          label: 'بدء النزاع إن كان معلومًا',
          name: 'disputeStartedOn',
          value: str(file?.dispute_started_on),
        },
        DATES,
      ),
    ),
  );
  addSection('basic', '٢. البيانات المشتركة', basic, true);
  const partyPicker = entityPicker({
    name: 'partyId',
    label: 'الموكل أو الخصم من سجل الأشخاص / الجهات',
    search: (q) => services.parties.searchOptions(q),
  });
  const partyRole = selectField({
    label: 'صفة الطرف في هذه القضية',
    name: 'roleCode',
    value: 'client',
    required: true,
    options: lookups
      .items('party_role')
      .map((i) => ({ value: i.code, label: i.nameAr })),
  });
  const partySide = selectField({
    label: 'جانب الطرف',
    name: 'sideCode',
    value: '',
    options: lookups
      .items('party_side')
      .map((i) => ({ value: i.code, label: i.nameAr })),
  });
  const client = checkboxField({
    label: 'هذا الطرف يمثله المكتب',
    name: 'officeClient',
    checked: true,
    help: 'التمثيل مستقل عن الصفة الإجرائية؛ لا ينشئ شخصًا أو موكلًا مكررًا.',
  });
  const savedPartyRows = new Map<
    string,
    { node: HTMLElement; link: EngineRow; label: string }
  >();
  const renderPending = (): void => {
    for (const [id, { node, link, label }] of savedPartyRows) {
      const edit = pendingParties.find((p) => p.linkId === id);
      node.textContent = `${label} · ${lookups.name('party_role', edit?.roleCode ?? str(link.role_id))}${(edit?.isClient ?? link.is_office_client === 1) ? ' · يمثله المكتب' : ''} (${edit ? 'تعديل معلق حتى حفظ النموذج' : 'علاقة محفوظة'})`;
    }
    partyHost.replaceChildren(
      ...pendingParties.map((p, index) =>
        h(
          'div',
          { class: 'intake-party' },
          h('span', {
            text: `${p.label} · ${lookups.name('party_role', p.roleCode)}${p.isClient ? ' · يمثله المكتب' : ''}`,
          }),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-btn',
              title: 'إزالة الاختيار قبل الحفظ',
              attrs: { 'aria-label': `إزالة ${p.label}` },
              on: {
                click: () => {
                  pendingParties.splice(index, 1);
                  renderPending();
                },
              },
            },
            icon('close', 16),
          ),
        ),
      ),
    );
  };
  const existingParties = h('div', { class: 'stack', style: 'gap:6px' });
  const scopedSaved = judicial
    ? scopedPartyLinks(intake?.parties ?? [], str(judicial.id))
    : (intake?.parties ?? []).filter((p) => !p.case_id);
  const partyNames = await services.deps.cache.many(
    'party',
    scopedSaved.map((link) => str(link.party_id)),
  );
  for (const link of scopedSaved) {
    const label = str(partyNames.get(str(link.party_id))?.display_name),
      node = h('span', { class: 'text-sm text-3' });
    savedPartyRows.set(str(link.id), { node, link, label });
    existingParties.append(
      h(
        'div',
        { class: 'intake-party' },
        node,
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          text: 'تعديل العلاقة',
          on: {
            click: () => {
              const current = pendingParties.find(
                (p) => p.linkId === str(link.id),
              );
              const role = selectField({
                name: 'roleCode',
                label: 'صفة الطرف في هذه الدرجة',
                required: true,
                value: current?.roleCode ?? lookups.codeById(str(link.role_id)),
                options: lookups
                  .items('party_role')
                  .map((i) => ({ value: i.code, label: i.nameAr })),
              });
              const side = selectField({
                name: 'sideCode',
                label: 'جانب الطرف',
                value: current?.sideCode ?? lookups.codeById(str(link.side_id)),
                options: lookups
                  .items('party_side')
                  .map((i) => ({ value: i.code, label: i.nameAr })),
              });
              const represented = checkboxField({
                name: 'represented',
                label: 'يمثله المكتب في هذا النطاق',
                checked: current?.isClient ?? link.is_office_client === 1,
              });
              openFormDialog({
                title: `تعديل علاقة ${label}`,
                description:
                  judicial && !link.case_id
                    ? 'يُنشأ تخصيص لهذه الدعوى عند حفظ النموذج؛ لا تتغير العلاقة العامة أو درجات أخرى.'
                    : 'التعديل معلق حتى حفظ نموذج القضية كاملًا؛ سجل الشخص لا يتغير.',
                content: h('div', { class: 'stack' }, role, side, represented),
                submitLabel: 'اعتماد التعديل في النموذج',
                successMessage: 'تعديل معلق — احفظ نموذج القضية لاعتماده',
                onSubmit: async (form) => {
                  const v = valuesOf(form);
                  if (!v.roleCode) fieldError('roleCode', 'اختر الصفة.');
                  const edit = {
                    linkId: str(link.id),
                    partyId: str(link.party_id),
                    label,
                    roleCode: v.roleCode,
                    sideCode: v.sideCode ?? '',
                    isClient: represented.querySelector('input')!.checked,
                  };
                  const index = pendingParties.findIndex(
                    (p) => p.linkId === str(link.id),
                  );
                  if (index < 0) pendingParties.push(edit);
                  else pendingParties[index] = edit;
                  renderPending();
                },
              });
            },
          },
        }),
      ),
    );
  }
  renderPending();
  addSection(
    'parties',
    '٣. الموكلون والأطراف',
    h(
      'div',
      { class: 'stack' },
      notice(
        'info',
        'الأطراف اختيارية عند فتح ملف ناقص. يمكنك إضافة أكثر من موكل وخصم، ولكل شخص صفته في هذه الدرجة دون تغيير سجل الشخص.',
      ),
      existingParties,
      partyPicker.root,
      h('div', { class: 'form-grid' }, partyRole, partySide),
      client,
      h('button', {
        type: 'button',
        class: 'btn btn--outline btn--sm',
        text: 'إضافة هذا الطرف للقائمة',
        on: {
          click: () => {
            const id = partyPicker.getValue();
            if (!id) {
              toastError('اختر طرفًا أولًا');
              return;
            }
            const role = partyRole.querySelector('select')!.value;
            if (
              pendingParties.some(
                (p) => p.partyId === id && p.roleCode === role,
              )
            ) {
              toastError('الطرف مضاف بهذه الصفة');
              return;
            }
            pendingParties.push({
              partyId: id,
              label: partyPicker.input.value,
              roleCode: role,
              sideCode: partySide.querySelector('select')!.value,
              isClient: client.querySelector('input')!.checked,
            });
            renderPending();
            partyPicker.setValue(null);
          },
        },
      }),
      partyHost,
    ),
  );

  const courtPicker = entityPicker({
    label: 'المحكمة / الجهة التي تنظر الدعوى',
    name: 'courtId',
    search: (q) => services.cases.authorityOptions(q),
    ...(judicial?.court_id
      ? {
          initial: {
            value: str(judicial.court_id),
            label: str((await db.get('court', str(judicial.court_id)))?.name),
          },
        }
      : {}),
  });
  const courtField = courtPicker.root;
  const circuits = judicial?.court_id
    ? await services.cases.circuits(str(judicial.court_id))
    : [];
  const circuitField = selectField({
    label: 'الدائرة',
    name: 'circuitId',
    options: circuits.map((c) => ({ value: str(c.id), label: str(c.name) })),
    value: str(judicial?.circuit_id),
  });
  let circuitValue = str(judicial?.circuit_id);
  courtField.addEventListener('change', async () => {
    const courtId = courtPicker.getValue();
    const items = courtId ? await services.cases.circuits(courtId) : [];
    const node = circuitField.querySelector('select')!;
    node.replaceChildren(
      h('option', { value: '', text: '— لم تحدد —' }),
      ...items.map((c) => h('option', { value: str(c.id), text: str(c.name) })),
    );
    node.value = circuitValue;
    if (circuitValue && !items.some((c) => c.id === circuitValue)) {
      node.append(
        h('option', {
          value: circuitValue,
          text: 'الدائرة السابقة — اختر محكمتها أو دائرة مناسبة',
          selected: true,
        }),
      );
    }
  });
  circuitField.querySelector('select')!.addEventListener('change', () => {
    circuitValue = circuitField.querySelector('select')!.value;
  });
  const degreeField = selectField({
    label: 'درجة التقاضي المسجلة فعليًا',
    name: 'litigationDegreeCode',
    value: lookups.codeById(str(judicial?.litigation_degree_id)) || '',
    options: [],
  });
  const updateDegrees = (): void => {
    const current =
      degreeField.querySelector('select')!.value ||
      lookups.codeById(str(judicial?.litigation_degree_id));
    const allowed = new Set([
      'first_instance',
      'execution',
      'other',
      ...(type === 'administrative'
        ? [
            'administrative_first',
            'administrative_appeal',
            'supreme_administrative',
          ]
        : template.possibleRelations.filter((c) =>
            ['appeal', 'cassation'].includes(c),
          )),
    ]);
    const choices = lookups
      .items('litigation_degree')
      .filter((i) => allowed.has(i.code) || i.code === current);
    degreeField
      .querySelector('select')!
      .replaceChildren(
        h('option', { value: '', text: '— تحدد من الأوراق —' }),
        ...choices.map((i) => h('option', { value: i.code, text: i.nameAr })),
      );
    degreeField.querySelector('select')!.value = current;
  };
  updateDegrees();
  const relationMap: Record<string, string> = {
    appeal: 'appeal_of',
    cassation: 'cassation_of',
    opposition: 'opposition_of',
    retrial: 'retrial_of',
    grievance: 'grievance_of',
    execution_dispute: 'execution_dispute_of',
    administrative_appeal: 'appeal_of',
    supreme_administrative: 'appeal_of',
    other: 'other',
  };
  const relationField = options.relatedCaseId
    ? selectField({
        label: 'نوع الارتباط المختار من الأوراق — لا يثبت جوازه قانونًا',
        name: 'relationCode',
        value: options.relationCode ?? 'other',
        options: [
          ...new Set(
            template.possibleRelations.map((c) =>
              lookups.item('case_relation_type', c)
                ? c
                : (relationMap[c] ?? 'other'),
            ),
          ),
        ].map((code) => ({
          value: code,
          label: lookups.name('case_relation_type', code),
        })),
      })
    : null;
  const relatedPicker = options.relatedCaseId
    ? null
    : entityPicker({
        name: 'relatedCaseId',
        label: 'دعوى سابقة أو مرتبطة (اختياري)',
        search: (q) => services.cases.searchOptions(q),
      });
  addSection(
    'registration',
    '٤. بيانات الدعوى إن قُيدت',
    h(
      'div',
      { class: 'stack' },
      notice(
        'info',
        'اترك الرقم والسنة فارغين لفتح ملف قبل القيد. لا يُنشأ رقم محكمة وهمي، ولا ينقل النظام المرحلة تلقائيًا. كل درجة لها رقمها المستقل.',
      ),
      h(
        'div',
        { class: 'form-grid' },
        textField({
          label: 'رقم القضية لدى المحكمة',
          name: 'caseNumber',
          value: str(judicial?.case_number),
          dir: 'ltr',
          maxlength: 80,
        }),
        textField({
          label: 'السنة كما بالأوراق',
          name: 'caseYear',
          value: str(judicial?.case_year),
          inputmode: 'numeric',
          maxlength: 4,
          dir: 'ltr',
        }),
      ),
      h('div', { class: 'form-grid' }, courtField, circuitField),
      h(
        'div',
        { class: 'form-grid' },
        degreeField,
        selectField({
          label: 'الحالة التشغيلية للدعوى',
          name: 'statusCode',
          value: lookups.codeById(str(judicial?.status_id)) || 'registered',
          options: lookups
            .items('case_status')
            .map((i) => ({ value: i.code, label: i.nameAr })),
        }),
      ),
      h(
        'div',
        { class: 'form-grid' },
        dateField(
          {
            label: 'تاريخ القيد الوارد بالأوراق',
            name: 'registrationDate',
            value: str(judicial?.registration_date),
          },
          DATES,
        ),
        textField({
          label: 'قيمة المطالبة في هذه الدرجة — ليست أتعاب المكتب',
          name: 'claimAmount',
          value:
            judicial?.claim_amount_minor !== null &&
            judicial?.claim_amount_minor !== undefined
              ? str(Number(judicial.claim_amount_minor) / 100)
              : '',
          inputmode: 'decimal',
          dir: 'ltr',
        }),
        selectField({
          label: 'العملة',
          name: 'currencyCode',
          value: str(judicial?.currency_code) || 'EGP',
          options: (await db.store.getAll('currency')).map((c) => ({
            value: str(c.code),
            label: str(c.name_ar),
          })),
        }),
      ),
      relationField ?? relatedPicker?.root,
      notice(
        'warning',
        'اختيارات الدرجات والمسارات اقتراحات عمل فقط. سجل ما تم فعلًا بناءً على الأوراق؛ لا يحسب البرنامج مواعيد الطعن ولا يؤكد قبول طريق معين.',
      ),
    ),
    Boolean(
      judicial ||
        options.relatedCaseId ||
        options.sourceStageId ||
        options.registerCase,
    ),
  );

  const initialType = selectField({
    label: 'إضافة مرحلة سابقة / حالية عند فتح الملف',
    name: 'initialStageType',
    value: '',
    options: [],
  });
  const initialAuthority = entityPicker({
    label: 'جهة المرحلة السابقة',
    name: 'initialAuthorityId',
    search: (q) => services.cases.authorityOptions(q),
  }).root;
  const initialFields = h(
    'div',
    { class: 'stack', hidden: true },
    textField({
      label: 'وصف المرحلة عند اختيار أخرى',
      name: 'initialCustomType',
    }),
    initialAuthority,
    h(
      'div',
      { class: 'form-grid' },
      textField({
        label: 'رقم الطلب / المحضر / الشكوى',
        name: 'initialReference',
      }),
      dateField(
        {
          label: 'تاريخ بدء المرحلة الوارد بالأوراق',
          name: 'initialStartedOn',
        },
        DATES,
      ),
    ),
    h(
      'div',
      { class: 'form-grid' },
      selectField({
        label: 'حالة المرحلة',
        name: 'initialStatus',
        value: 'ongoing',
        options: lookups
          .items('stage_status')
          .map((i) => ({ value: i.code, label: i.nameAr })),
      }),
      textField({ label: 'مصدر البيانات / المستند', name: 'initialSource' }),
    ),
    textareaField({
      label: 'نتيجة المرحلة إن وجدت',
      name: 'initialOutcome',
      rows: 2,
    }),
  );
  initialType.querySelector('select')!.addEventListener('change', () => {
    initialFields.hidden = !initialType.querySelector('select')!.value;
  });
  const updateStages = (): void => {
    const selected = initialType.querySelector('select')!.value;
    const list = lookups
      .items('stage_type')
      .filter(
        (i) =>
          template.possibleStages.includes(i.code) ||
          i.code === 'other' ||
          i.code === selected,
      );
    initialType
      .querySelector('select')!
      .replaceChildren(
        h('option', { value: '', text: '— لا توجد مرحلة إضافية الآن —' }),
        ...list.map((i) => h('option', { value: i.code, text: i.nameAr })),
      );
    initialType.querySelector('select')!.value = selected;
  };
  updateStages();
  addSection(
    'stages',
    '٥. المرحلة السابقة والمسار الفعلي',
    h(
      'div',
      { class: 'stack' },
      notice(
        'info',
        options.sourceStageId
          ? 'سترتبط الدعوى بالمرحلة التي اخترتها، مع الاحتفاظ برقمها ونتيجتها وتاريخها دون استبدال.'
          : 'لا مرحلة إلزامية لكل القضايا. أضف فقط ما حدث فعلًا؛ تتاح التواريخ التفصيلية ومحاضر المتابعة من سجل المراحل بعد الحفظ.',
      ),
      initialType,
      initialFields,
      ...(intake?.stages.length
        ? [
            h('p', {
              class: 'field__help',
              text: `يوجد ${str(intake.stages.length)} سجل مرحلة محفوظًا. إضافة مرحلة جديدة لا تمحو أي سجل سابق.`,
            }),
          ]
        : []),
    ),
  );

  const termIds = new Set(
    (intake?.terms ?? []).filter((t) => !t.case_id).map((t) => str(t.term_id)),
  );
  const termHost = h('div', { class: 'row-wrap' });
  const termSelect = selectField({
    label: 'موضوع من القاموس المرجعي',
    name: 'termIds',
    options: lookups
      .items('legal_subject')
      .map((t) => ({ value: t.id, label: t.nameAr })),
  });
  const renderTerms = (): void => {
    termHost.replaceChildren(
      ...[...termIds].map((id) =>
        h('button', {
          class: 'chip chip--button',
          type: 'button',
          title: 'إزالة الارتباط فقط، لا يحذف المصطلح',
          text: `${lookups.byId(id)?.nameAr ?? 'مصطلح محفوظ'} ×`,
          on: {
            click: () => {
              termIds.delete(id);
              renderTerms();
            },
          },
        }),
      ),
    );
  };
  renderTerms();
  const docPicker = entityPicker({
    name: 'documentIds',
    label: 'مستند مرجعي مسجل',
    search: async (q) => {
      if (q.trim())
        return (
          await db.searchPage(q, { entityType: 'document', limit: 12 })
        ).hits.map((hit) => ({ value: hit.entityId, label: hit.title }));
      return (
        await db.query('document', {
          orderBy: [{ column: 'created_at', direction: 'desc' }],
          limit: 12,
        })
      ).rows.map((d) => ({ value: str(d.id), label: str(d.title) }));
    },
  });
  addSection(
    'indexing',
    '٦. الفهرسة والمستندات المرجعية',
    h(
      'div',
      { class: 'stack' },
      termSelect,
      h('button', {
        type: 'button',
        class: 'btn btn--outline btn--sm',
        text: 'ربط الموضوع',
        on: {
          click: () => {
            const id = termSelect.querySelector('select')!.value;
            if (id) termIds.add(id);
            renderTerms();
          },
        },
      }),
      termHost,
      textField({
        label: 'كلمات مفتاحية إضافية تفصل بفاصلة',
        name: 'keywords',
        placeholder: 'اسم معاملة، وصف مستند، مصطلح متداول بالمكتب',
        help: 'تُنشأ في القاموس المحلي وتُربط بالملف؛ لا تستخدم خدمة خارجية.',
      }),
      docPicker.root,
      h('button', {
        type: 'button',
        class: 'btn btn--outline btn--sm',
        text: 'إضافة المستند للروابط',
        on: {
          click: () => {
            const id = docPicker.getValue();
            if (!id || pendingDocuments.some((d) => d.value === id)) return;
            pendingDocuments.push({ value: id, label: docPicker.input.value });
            documentHost.append(
              h('span', { class: 'chip', text: docPicker.input.value }),
            );
            docPicker.setValue(null);
          },
        },
      }),
      documentHost,
    ),
  );
  addSection(
    'followup',
    '٧. المتابعة الداخلية',
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'form-grid' },
        dateField(
          {
            label: 'تاريخ آخر إجراء مسجل',
            name: 'lastActionOn',
            value: str(file?.last_action_on),
          },
          DATES,
        ),
        dateField(
          {
            label: 'موعد متابعة يدوي للمكتب',
            name: 'followUpOn',
            value: str(file?.follow_up_on),
          },
          DATES,
        ),
      ),
      textareaField({
        label: 'الإجراء التالي المتوقع / المطلوب',
        name: 'nextAction',
        value: str(file?.next_action),
        rows: 2,
      }),
      selectField({
        label: 'أولوية العمل',
        name: 'priorityCode',
        value: lookups.codeById(str(file?.priority_id)) || 'normal',
        options: lookups
          .items('priority')
          .map((i) => ({ value: i.code, label: i.nameAr })),
      }),
      textareaField({
        label: 'ملاحظات داخلية — لا تدخل فهرس البحث العام',
        name: 'notes',
        value: str(file?.internal_notes ?? file?.notes ?? judicial?.notes),
        rows: 2,
      }),
      h('p', {
        class: 'field__help',
        text: 'المتابعة تاريخ يحدده المكتب، وليست ميعاد طعن أو تقادم محسوبًا. التواريخ الأخرى تنقل كما في المستندات.',
      }),
    ),
  );
  const reviewHost = h('div', { class: 'stack' });
  const review = addSection('review', '٨. مراجعة الاكتمال', reviewHost);
  const content = h(
    'div',
    { class: 'case-intake', dataset: { caseIntake: 'true' } },
    notice(
      'info',
      'ملف نزاع واحد، وسجلات مستقلة لكل مرحلة ودرجة. الحقول ذات النجمة لازمة للحفظ؛ بقية النواقص لا تمنع فتح الملف واستكماله لاحقًا.',
    ),
    h('div', { class: 'case-intake__layout' }, navHost, sectionHost),
  );
  const applyLayout = (): void => {
    const base = [...sections.keys()];
    const ordered = [
      ...new Set([...layout.order.filter((k) => sections.has(k)), ...base]),
    ];
    sectionHost.replaceChildren();
    navHost.replaceChildren();
    for (const key of ordered) {
      const section = sections.get(key)!;
      section.hidden =
        layout.hidden.includes(key) &&
        !['classification', 'basic', 'review'].includes(key);
      if (!section.hidden)
        navHost.append(
          h('button', {
            type: 'button',
            class: 'case-intake__nav-item',
            text: section.querySelector('summary')!.textContent ?? key,
            on: {
              click: () => {
                section.open = true;
                section.scrollIntoView({ block: 'start', behavior: 'instant' });
                section
                  .querySelector<HTMLElement>(
                    'input:not([type="hidden"]),select,textarea,summary',
                  )
                  ?.focus();
              },
            },
          }),
        );
      sectionHost.append(section);
      if (key === 'basic') sectionHost.append(specializedHost);
    }
    for (const field of content.querySelectorAll<HTMLElement>(
      '.field[data-field]',
    )) {
      const required =
        ['title', 'subject', 'caseTypeCode'].includes(
          field.dataset.field ?? '',
        ) || !!field.querySelector('[required]');
      field.hidden =
        !required && layout.hiddenFields.includes(field.dataset.field ?? '');
    }
  };
  const renderSpecialized = (): void => {
    specializedHost.replaceChildren();
    const data = (specialized[type] ??= {});
    const subtypeCode = lookups.byId(subtypeSelect.value)?.code ?? '';
    for (const group of template.groups) {
      if (
        group.classificationCodes?.length &&
        !group.classificationCodes.includes(subtypeCode)
      )
        continue;
      const fields = h('div', { class: 'form-grid' });
      const controls = new Map<string, HTMLElement>();
      for (const f of group.fields) {
        const config = {
          label: f.label,
          name: `special_${f.key}`,
          required: f.required,
          value: data[f.key] ?? '',
        };
        const field =
          f.type === 'textarea'
            ? textareaField({ ...config, rows: 2, maxlength: 20000 })
            : f.type === 'date'
              ? dateField(config, DATES)
              : f.type === 'select'
                ? selectField({ ...config, options: f.options ?? [] })
                : textField({
                    ...config,
                    ...(f.type === 'money' || f.type === 'number'
                      ? { inputmode: 'decimal' as const, dir: 'ltr' as const }
                      : {}),
                    maxlength: 2000,
                  });
        const control = field.querySelector<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >('input,textarea,select')!;
        control.addEventListener('input', () => {
          data[f.key] = control.value;
          updateVisibility();
        });
        control.addEventListener('change', () => {
          data[f.key] = control.value;
          updateVisibility();
        });
        controls.set(f.key, field);
        fields.append(field);
      }
      const updateVisibility = (): void => {
        for (const f of group.fields) {
          const el = controls.get(f.key)!;
          el.hidden =
            (group.when &&
              data[group.when.field] !== group.when.equals &&
              f.key !== group.controller) ||
            (f.when && data[f.when.field] !== f.when.equals) ||
            (!f.required && layout.hiddenFields.includes(`special_${f.key}`)) ||
            false;
        }
      };
      updateVisibility();
      const key = `special-${type}-${group.key}`;
      const section = h(
        'details',
        {
          class: 'intake-section intake-section--specialized',
          dataset: { section: key, specializedType: type },
          open: !layout.closed.includes(key),
        },
        h(
          'summary',
          null,
          h(
            'span',
            { class: 'intake-section__marker' },
            icon(
              isSensitiveCaseGroup(template.typeCode, group)
                ? 'shield'
                : 'document',
              16,
            ),
          ),
          h('span', { text: group.label }),
          h('span', {
            class: 'badge badge--quiet',
            text: `${template.title} · إصدار ${str(template.version)}`,
          }),
        ),
        h(
          'div',
          { class: 'intake-section__body' },
          group.help
            ? h('p', { class: 'field__help', text: group.help })
            : null,
          fields,
        ),
      );
      section.addEventListener('toggle', () => {
        const closed = new Set(layout.closed);
        if (section.open) closed.delete(key);
        else closed.add(key);
        layout.closed = [...closed];
        void workspace.preferences
          .set('ui.caseForm.layout', JSON.stringify(layout), 'json')
          .catch(() =>
            toastError('تعذر حفظ تخصيص نموذج القضية. أعد المحاولة.'),
          );
      });
      specializedHost.append(section);
    }
  };
  renderSpecialized();
  applyLayout();
  subtypeSelect.addEventListener('change', () => {
    updateNatures();
    classifications.set(type, { subtype: subtypeSelect.value, nature: '' });
    renderSpecialized();
  });
  natureSelect.addEventListener('change', () => {
    classifications.set(type, {
      subtype: subtypeSelect.value,
      nature: natureSelect.value,
    });
  });
  typeSelect.addEventListener('change', () => {
    const next = typeSelect.value;
    if (next === type) return;
    const change = async (): Promise<void> => {
      const nextTemplate = await services.cases.template(
        next,
        file ?? undefined,
      );
      classifications.set(type, {
        subtype: subtypeSelect.value,
        nature: natureSelect.value,
      });
      type = next;
      template = nextTemplate;
      typeSelect.value = next;
      confirmTypeChange = true;
      updateClassifications();
      renderSpecialized();
      updateDegrees();
      updateStages();
    };
    if (
      file ||
      Object.values(specialized[type] ?? {}).some(Boolean) ||
      subtypeSelect.value
    ) {
      typeSelect.value = type;
      confirmDialog({
        title: 'تغيير تصنيف القضية',
        message:
          'ستتغير الحقول الظاهرة فقط. تبقى بيانات النوع السابق ولقطة قالبه محفوظة، ويمكن الرجوع إليها عند إعادة اختياره. راجع التصنيف والجهة بعد التغيير.',
        confirmLabel: 'تغيير النوع مع الاحتفاظ بالبيانات',
        onConfirm: change,
      });
    } else
      void change().catch(() => {
        typeSelect.value = type;
        toastError('تعذر تحميل قالب النوع');
      });
  });
  const updateReview = (): void => {
    const v = valuesOf(content);
    const items: Array<{ field: string; text: string }> = [];
    if (!v.subject)
      items.push({ field: 'subject', text: 'موضوع النزاع غير مسجل' });
    if (!v.requests)
      items.push({
        field: 'requests',
        text: 'الطلبات الأساسية تحتاج استكمالًا',
      });
    if (!pendingParties.length && !intake?.parties.length)
      items.push({ field: 'partyId', text: 'لم تسجل الأطراف بعد' });
    if (!v.subtypeId)
      items.push({ field: 'subtypeId', text: 'التصنيف الفرعي غير مسجل' });
    if (v.caseNumber && !v.courtId)
      items.push({ field: 'courtId', text: 'القضية المقيدة دون محكمة' });
    if (v.caseNumber && !v.registrationDate)
      items.push({
        field: 'registrationDate',
        text: 'تاريخ القيد الوارد بالأوراق غير مسجل',
      });
    if (!termIds.size && !v.keywords)
      items.push({
        field: 'keywords',
        text: 'لم تضف موضوعات أو كلمات للفهرسة',
      });
    reviewHost.replaceChildren(
      notice(
        items.length ? 'warning' : 'success',
        items.length
          ? 'يمكن حفظ الملف الآن، وهذه قائمة محددة بما يستكمل لاحقًا. الحفظ لا يعني صحة المسار قانونًا.'
          : 'البيانات الأساسية المسجلة جاهزة للحفظ. راجع الأوراق لتأكيد المسار الفعلي.',
      ),
      ...items.map((i) =>
        h('button', {
          class: 'btn btn--ghost btn--sm intake-review-link',
          type: 'button',
          text: i.text,
          on: { click: () => focusField(content, i.field) },
        }),
      ),
    );
  };
  review.addEventListener('toggle', updateReview);
  content.addEventListener('input', updateReview);
  updateReview();

  const customize = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    text: 'تخصيص الأقسام',
    on: {
      click: () => {
        const host = h('div', { class: 'stack' });
        for (const [key, section] of sections) {
          const check = checkboxField({
            label: section.querySelector('summary')!.textContent ?? key,
            name: `visible_${key}`,
            checked: !section.hidden,
            disabled: ['classification', 'basic', 'review'].includes(key),
          });
          check.querySelector('input')!.addEventListener('change', () => {
            const hidden = new Set(layout.hidden);
            if (check.querySelector('input')!.checked) hidden.delete(key);
            else hidden.add(key);
            layout.hidden = [...hidden];
            applyLayout();
            void workspace.preferences
              .set('ui.caseForm.layout', JSON.stringify(layout), 'json')
              .catch(() =>
                toastError('تعذر حفظ تخصيص نموذج القضية. أعد المحاولة.'),
              );
          });
          host.append(
            h(
              'div',
              { class: 'row-wrap' },
              check,
              h('button', {
                class: 'btn btn--ghost btn--sm',
                type: 'button',
                text: 'نقل للأعلى',
                on: {
                  click: () => {
                    const order = [
                      ...sectionHost.querySelectorAll<HTMLDetailsElement>(
                        ':scope > details',
                      ),
                    ].map((d) => d.dataset.section!);
                    const index = order.indexOf(key);
                    if (index > 0)
                      [order[index - 1], order[index]] = [
                        order[index]!,
                        order[index - 1]!,
                      ];
                    layout.order = order;
                    applyLayout();
                    void workspace.preferences
                      .set('ui.caseForm.layout', JSON.stringify(layout), 'json')
                      .catch(() =>
                        toastError(
                          'تعذر حفظ تخصيص نموذج القضية. أعد المحاولة.',
                        ),
                      );
                  },
                },
              }),
            ),
          );
        }
        const fieldList = h(
          'details',
          null,
          h('summary', { text: 'إظهار / إخفاء الحقول الاختيارية' }),
        );
        for (const field of content.querySelectorAll<HTMLElement>(
          '.field[data-field]',
        )) {
          if (
            ['title', 'subject', 'caseTypeCode'].includes(
              field.dataset.field ?? '',
            ) ||
            field.querySelector('[required]')
          )
            continue;
          const name = field.dataset.field!;
          const check = checkboxField({
            label: field.querySelector('label')?.textContent ?? name,
            name: `field_${name}`,
            checked: !layout.hiddenFields.includes(name),
          });
          check.querySelector('input')!.addEventListener('change', () => {
            const hidden = new Set(layout.hiddenFields);
            if (check.querySelector('input')!.checked) hidden.delete(name);
            else hidden.add(name);
            layout.hiddenFields = [...hidden];
            field.hidden = hidden.has(name);
            void workspace.preferences
              .set('ui.caseForm.layout', JSON.stringify(layout), 'json')
              .catch(() =>
                toastError('تعذر حفظ تخصيص نموذج القضية. أعد المحاولة.'),
              );
          });
          fieldList.append(check);
        }
        host.append(
          fieldList,
          h('button', {
            type: 'button',
            class: 'btn btn--outline',
            text: 'استعادة الترتيب والإظهار الافتراضي',
            on: {
              click: () => {
                layout.order = [];
                layout.hidden = [];
                layout.hiddenFields = [];
                applyLayout();
                renderSpecialized();
                void workspace.preferences
                  .set('ui.caseForm.layout', JSON.stringify(layout), 'json')
                  .catch(() =>
                    toastError('تعذر حفظ تخصيص نموذج القضية. أعد المحاولة.'),
                  );
              },
            },
          }),
        );
        openDialog({
          title: 'تخصيص نموذج القضية',
          description:
            'تفضيلات على هذا الجهاز باستخدام نظام التخصيص الحالي. إخفاء حقل لا يمحو قيمته.',
          size: 'md',
          content: host,
        });
      },
    },
  });
  formHandle = openFormDialog({
    title: options.relatedCaseId
      ? 'درجة / دعوى مرتبطة جديدة'
      : options.registerCase || options.sourceStageId
        ? 'قيد دعوى جديدة في ملف النزاع'
        : judicial || file
          ? 'تعديل ملف القضية وبياناتها'
          : 'قضية / ملف نزاع جديد',
    description:
      'بيانات مناسبة للنوع، ومراحل مستقلة، وفهرسة محلية. يمكنك البدء قبل معرفة المحكمة أو الرقم.',
    size: 'xl',
    iconName: 'scale',
    content,
    submitLabel: judicial || file ? 'حفظ التعديلات' : 'حفظ وفتح الملف',
    successMessage: 'تم الحفظ محليًا مع المراحل والروابط',
    extraFooter: [customize],
    onSubmit: async () => {
      const v = valuesOf(content);
      if ((options.registerCase || options.sourceStageId) && !v.caseNumber)
        fieldError(
          'caseNumber',
          'هذه العملية لقيد دعوى جديدة؛ أدخل رقمها الحقيقي وسنتها، أو ألغِ واحتفظ بالملف قبل القيد.',
        );
      const title =
        v.title ||
        v.subject ||
        (v.caseNumber
          ? `${template.title} — ${v.caseNumber} / ${v.caseYear}`
          : '');
      if (!title) fieldError('title', 'اكتب عنوان ملف النزاع أو موضوعه.');
      let amount: number | undefined;
      if (v.claimAmount) {
        try {
          amount = parseAmountToMinor(v.claimAmount);
        } catch {
          fieldError(
            'claimAmount',
            'أدخل مبلغًا صحيحًا بحد أقصى منزلتين عشريتين.',
          );
        }
      }
      const yearText = normalizeArabicDigits(v.caseYear ?? '');
      const input: IntakeInput = {
        ...(selectedFileId ? { fileId: selectedFileId } : {}),
        ...(options.caseId ? { caseId: options.caseId } : {}),
        title,
        caseTypeCode: type,
        subtypeId: v.subtypeId || null,
        natureId: v.natureId || null,
        subject: v.subject ?? '',
        facts: v.facts ?? '',
        requests: v.requests ?? '',
        officeCapacity: v.officeCapacity ?? '',
        responsiblePartyId: lawyer.getValue() || null,
        receivedOn: v.receivedOn || isoDateToday(),
        disputeStartedOn: v.disputeStartedOn || null,
        lastActionOn: v.lastActionOn || null,
        nextAction: v.nextAction ?? '',
        followUpOn: v.followUpOn || null,
        priorityCode: v.priorityCode || 'normal',
        notes: v.notes ?? '',
        specialized,
        termIds: [...termIds],
        keywords: (v.keywords ?? '')
          .split(/[,،\n]/)
          .map((k) => k.trim())
          .filter(Boolean),
        parties: pendingParties,
        ...(v.caseNumber
          ? {
              caseNumber: normalizeArabicDigits(v.caseNumber),
              caseYear: Number(yearText),
            }
          : {}),
        ...(options.caseId && !v.caseNumber ? { caseNumber: '' } : {}),
        courtId: v.courtId ?? '',
        circuitId: v.circuitId ?? '',
        litigationDegreeCode: v.litigationDegreeCode ?? '',
        statusCode: v.statusCode || 'registered',
        registrationDate: v.registrationDate ?? '',
        ...(amount !== undefined ? { claimAmountMinor: amount } : {}),
        currencyCode: v.currencyCode || 'EGP',
        confirmTypeChange,
        ...(options.sourceStageId
          ? { sourceStageId: options.sourceStageId }
          : {}),
        documentIds: pendingDocuments.map((d) => d.value),
        ...(v.relatedCaseId
          ? { relatedCaseId: v.relatedCaseId, relationCode: 'related' }
          : {}),
      };
      if (v.initialStageType)
        input.initialStage = {
          fileId: selectedFileId,
          typeCode: v.initialStageType,
          customType: v.initialCustomType ?? '',
          authorityId: v.initialAuthorityId || null,
          referenceNumber: v.initialReference ?? '',
          startedOn: v.initialStartedOn || null,
          statusCode: v.initialStatus || 'ongoing',
          outcome: v.initialOutcome ?? '',
          dataSource: v.initialSource ?? '',
        };
      result = options.relatedCaseId
        ? await services.cases.createRelatedCase(
            options.relatedCaseId,
            input,
            v.relationCode || 'other',
            options.judgmentId,
          )
        : await services.cases.saveIntake(input);
    },
    onSuccess: () => {
      options.onSaved?.();
      if (result)
        navigate(
          result.legalCase
            ? `/cases/${str(result.legalCase.id)}?tab=procedure`
            : `/files/${str(result.file.id)}?tab=procedure`,
        );
    },
  });
  if (options.focusField)
    window.setTimeout(() => focusField(content, options.focusField!), 80);
}

function focusField(root: HTMLElement, name: string): void {
  name =
    (
      {
        typeCode: 'initialStageType',
        authorityId: 'initialAuthorityId',
        referenceNumber: 'initialReference',
      } as Record<string, string>
    )[name] ?? name;
  const field = root.querySelector<HTMLElement>(`[name="${name}"]`);
  if (!field) return;
  const wrapper = field.closest<HTMLElement>('.field');
  if (wrapper) wrapper.hidden = false;
  let p = field.parentElement;
  while (p) {
    if (p instanceof HTMLDetailsElement) {
      p.hidden = false;
      p.open = true;
    }
    p = p.parentElement;
  }
  const focus =
    field instanceof HTMLInputElement && field.type === 'hidden'
      ? wrapper?.querySelector<HTMLElement>('input:not([type="hidden"])')
      : field;
  focus?.scrollIntoView({ block: 'center' });
  focus?.focus();
}

export async function openStageForm(
  context: PageArgs,
  fileId: string,
  options: {
    stage?: EngineRow;
    previousStageId?: string;
    caseId?: string;
    onSaved?: () => void;
  } = {},
): Promise<void> {
  const { services, workspace } = context;
  const l = workspace.lookups;
  const s = options.stage;
  const intake = await services.cases.intake(fileId);
  const authority = entityPicker({
    label: 'الجهة المختصة',
    name: 'authorityId',
    search: (q) => services.cases.authorityOptions(q),
    ...(s?.authority_id
      ? {
          initial: {
            value: str(s.authority_id),
            label: str(
              (await workspace.db.get('court', str(s.authority_id)))?.name,
            ),
          },
        }
      : {}),
  });
  const typeCode = l.codeById(str(s?.type_id)) || 'other';
  const stageType = selectField({
    label: 'نوع المرحلة المسجلة فعليًا',
    name: 'typeCode',
    required: true,
    value: typeCode,
    options: l
      .items('stage_type')
      .filter(
        (i) =>
          intake.template.possibleStages.includes(i.code) ||
          i.code === typeCode ||
          i.code === 'other',
      )
      .map((i) => ({ value: i.code, label: i.nameAr })),
  });
  const source = entityPicker({
    name: 'sourceDocumentId',
    label: 'المستند المصدر المسجل',
    search: async (q) =>
      (
        await workspace.db.searchPage(q, { entityType: 'document', limit: 12 })
      ).hits.map((d) => ({ value: d.entityId, label: d.title })),
    ...(s?.source_document_id
      ? {
          initial: {
            value: str(s.source_document_id),
            label: str(
              (await workspace.db.get('document', str(s.source_document_id)))
                ?.title,
            ),
          },
        }
      : {}),
  });
  const dates: Array<[keyof StageInput, string, string]> = [
    ['startedOn', 'التاريخ الأساسي / بدء المرحلة', 'started_on'],
    ['submittedOn', 'تاريخ تقديم الطلب', 'submitted_on'],
    ['notifiedOn', 'تاريخ الإعلان أو الإخطار', 'notified_on'],
    ['attendedOn', 'تاريخ الحضور / الجلسة', 'attended_on'],
    ['decisionOn', 'تاريخ المحضر أو القرار', 'decision_on'],
    ['completedOn', 'تاريخ انتهاء المرحلة', 'completed_on'],
    [
      'followUpOn',
      'متابعة المكتب اليدوية (ليست ميعادًا قانونيًا)',
      'follow_up_on',
    ],
  ];
  const content = h(
    'div',
    { class: 'stack' },
    notice(
      'info',
      'تسجل هذه المرحلة وحدها؛ لا يؤدي انتهاؤها لإنشاء دعوى أو تعديل مرحلة سابقة تلقائيًا. استخدم «مرحلة تالية» أو «إنشاء دعوى مرتبطة» صراحةً.',
    ),
    h(
      'div',
      { class: 'form-grid' },
      stageType,
      textField({
        label: 'وصف الإجراء اليدوي عند اختيار أخرى',
        name: 'customType',
        value: str(s?.custom_type),
      }),
    ),
    authority.root,
    h(
      'div',
      { class: 'form-grid' },
      textField({
        label: 'رقم الطلب / المحضر / التظلم / الطعن',
        name: 'referenceNumber',
        value: str(s?.reference_number),
      }),
      textField({
        label: 'السنة إن كانت واردة بالأوراق',
        name: 'referenceYear',
        value: str(s?.reference_year),
        inputmode: 'numeric',
        dir: 'ltr',
      }),
    ),
    h(
      'div',
      { class: 'form-grid' },
      ...dates.map(([name, label, column]) =>
        dateField({ label, name, value: str(s?.[column]) }, DATES),
      ),
    ),
    h(
      'div',
      { class: 'form-grid' },
      selectField({
        label: 'حالة المرحلة',
        name: 'statusCode',
        value: l.codeById(str(s?.status_id)) || 'ongoing',
        options: l
          .items('stage_status')
          .map((i) => ({ value: i.code, label: i.nameAr })),
      }),
      selectField({
        label: 'المرحلة السابقة — يسمح بالتفرع',
        name: 'previousStageId',
        value: options.previousStageId ?? str(s?.previous_stage_id),
        options: intake.stages
          .filter((x) => x.id !== s?.id)
          .map((x) => ({
            value: str(x.id),
            label: `${l.name('stage_type', str(x.type_id))} · ${str(x.reference_number) || 'بلا رقم'}`,
          })),
      }),
    ),
    selectField({
      label: 'الدعوى المرتبطة بهذه المرحلة إن وجدت',
      name: 'caseId',
      value: options.caseId ?? str(s?.case_id),
      options: intake.cases.map((c) => ({
        value: str(c.id),
        label: `${str(c.case_number)} / ${str(c.case_year)}`,
      })),
    }),
    textareaField({
      label: 'نتيجة المرحلة',
      name: 'outcome',
      value: str(s?.outcome),
      rows: 2,
    }),
    textareaField({
      label: 'القرار أو المحضر الصادر',
      name: 'decision',
      value: str(s?.decision),
      rows: 2,
    }),
    textField({
      label: 'سبب الانتهاء',
      name: 'closingReason',
      value: str(s?.closing_reason),
    }),
    source.root,
    textField({
      label: 'مصدر البيانات / المرجع المثبت بالأوراق',
      name: 'dataSource',
      value: str(s?.data_source),
    }),
    textareaField({
      label: 'ملاحظات المتابعة',
      name: 'notes',
      value: str(s?.notes),
      rows: 2,
    }),
  );
  openFormDialog({
    title: s
      ? 'تعديل المرحلة — مع حفظ سجل التعديلات'
      : 'تسجيل مرحلة إجرائية مستقلة',
    size: 'xl',
    content,
    iconName: 'history',
    submitLabel: 'حفظ المرحلة',
    successMessage: 'حُفظت المرحلة دون استبدال أي مرحلة أخرى',
    ...(options.onSaved ? { onSuccess: options.onSaved } : {}),
    onSubmit: async () => {
      const v = valuesOf(content);
      const input: StageInput = {
        ...(s ? { id: str(s.id) } : {}),
        fileId,
        typeCode: v.typeCode || 'other',
        customType: v.customType ?? '',
        authorityId: v.authorityId || null,
        referenceNumber: v.referenceNumber ?? '',
        referenceYear: v.referenceYear
          ? Number(normalizeArabicDigits(v.referenceYear))
          : null,
        statusCode: v.statusCode || 'ongoing',
        outcome: v.outcome ?? '',
        decision: v.decision ?? '',
        closingReason: v.closingReason ?? '',
        previousStageId: v.previousStageId || null,
        caseId: v.caseId || null,
        sourceDocumentId: source.getValue() || null,
        dataSource: v.dataSource ?? '',
        notes: v.notes ?? '',
      };
      for (const [key] of dates)
        (input as unknown as Record<string, unknown>)[key] = v[key] || null;
      await services.cases.saveStage(input);
    },
  });
}

/** Existing file and case details share this real, paged procedural panel. */
export async function caseProcedurePanel(
  context: PageArgs,
  fileId: string,
  caseId?: string,
): Promise<HTMLElement> {
  const { services, workspace } = context;
  const l = workspace.lookups;
  const intake: IntakeDetail = await services.cases.intake(fileId);
  const judicial = caseId ? intake.cases.find((c) => c.id === caseId) : null;
  const template = judicial
    ? await services.cases.template(
        l.codeById(str(judicial.case_type_id)),
        intake.file,
      )
    : intake.template;
  const completion = judicial
    ? completionIssues(
        intake.file,
        judicial,
        scopedPartyLinks(intake.parties, caseId),
        intake.stages.filter((s) => !s.case_id || s.case_id === caseId),
        intake.terms.filter((t) => !t.case_id || t.case_id === caseId).length,
        template,
        l.codeById(str(intake.file.subtype_id)),
      )
    : intake.completion;
  const refresh = (): void =>
    navigate(
      caseId
        ? `/cases/${caseId}?tab=procedure`
        : `/files/${fileId}?tab=procedure`,
      { replace: true },
    );
  const rows = definitionList([
    { label: 'رقم الملف الداخلي', value: str(intake.file.file_number) },
    {
      label: 'التصنيف',
      value: [
        l.name('case_type', str(intake.file.case_type_id)),
        l.name('case_classification', str(intake.file.subtype_id)),
        l.name('case_classification', str(intake.file.nature_id)),
      ]
        .filter((n) => n !== '—')
        .join(' ← '),
    },
    { label: 'الطلبات', value: str(intake.file.requests) || 'لم تسجل' },
    {
      label: 'الإجراء التالي',
      value: str(intake.file.next_action) || 'قرار يدوي للمكتب',
    },
    {
      label: 'المتابعة اليدوية',
      value: intake.file.follow_up_on
        ? formatDate(str(intake.file.follow_up_on))
        : 'لم تحدد',
    },
  ]);
  const specialized = parseObject<SpecializedValues>(
    intake.file.specialized_json,
    {},
  );
  const snapshots = parseObject<Record<string, CaseTemplate>>(
    intake.file.template_snapshot_json,
    {},
  );
  const specializedViews: HTMLElement[] = [];
  for (const [type, data] of Object.entries(specialized)) {
    const template = snapshots[type];
    if (!template) continue;
    for (const group of template.groups) {
      const fields = group.fields.filter((f) => data[f.key]);
      if (!fields.length) continue;
      const body = definitionList(
        fields.map((f: FieldDefinition) => ({
          label: f.label,
          value: str(data[f.key]),
        })),
      );
      specializedViews.push(
        h(
          'details',
          { class: 'intake-section', open: false },
          h('summary', {
            text: `${group.label} · ${template.title} · إصدار ${str(template.version)}${isSensitiveCaseGroup(template.typeCode, group) ? ' — بيانات خاصة' : ''}`,
          }),
          h('div', { class: 'intake-section__body' }, body),
        ),
      );
    }
  }
  const timeline = dataTable<EngineRow>(
    {
      id: `case-stages-${fileId}`,
      title: 'التاريخ الإجرائي',
      rowKey: (s) => str(s.id),
      searchPlaceholder: 'ابحث برقم الطلب…',
      defaultSort: { key: 'started_on', dir: 'asc' },
      columns: [
        {
          key: 'type',
          label: 'المرحلة',
          cardRole: 'title',
          render: (s) =>
            h('span', {
              class: 'strong',
              text: s.custom_type
                ? str(s.custom_type)
                : l.name('stage_type', str(s.type_id)),
            }),
        },
        {
          key: 'reference',
          label: 'الرقم / الجهة وقت التسجيل',
          cardRole: 'detail',
          render: (s) =>
            h(
              'div',
              null,
              h('bdi', { text: str(s.reference_number) || 'لم يسجل رقم' }),
              h('p', {
                class: 'text-xs text-3',
                text: str(s.authority_name_snapshot) || 'لم تسجل جهة',
              }),
            ),
        },
        {
          key: 'started_on',
          label: 'بدء المرحلة',
          sortable: true,
          cardRole: 'meta',
          render: (s) => h('span', { text: formatDate(str(s.started_on)) }),
        },
        {
          key: 'status',
          label: 'الحالة',
          cardRole: 'meta',
          render: (s) =>
            h('span', {
              class: 'badge badge--quiet',
              text: l.name('stage_status', str(s.status_id)),
            }),
        },
        {
          key: 'outcome',
          label: 'النتيجة / التسلسل الفعلي',
          cardRole: 'detail',
          render: (s) => {
            const prev = intake.stages.find(
              (p) => p.id === s.previous_stage_id,
            );
            return h(
              'div',
              { class: 'procedure-node' },
              prev
                ? h('p', {
                    class: 'text-xs text-3',
                    text: `↳ بعد ${l.name('stage_type', str(prev.type_id))} · ${str(prev.reference_number)}`,
                  })
                : h('p', {
                    class: 'text-xs text-3',
                    text: 'بداية مستقلة للمسار',
                  }),
              h('span', { text: str(s.outcome) || 'لم تسجل نتيجة' }),
              s.case_id
                ? h('a', {
                    class: 'cell-link',
                    href: `#/cases/${str(s.case_id)}`,
                    text: 'فتح الدعوى المرتبطة',
                  })
                : null,
            );
          },
        },
      ],
      load: async (req) => {
        const page = await workspace.db.query('procedural_stage', {
          filters: [
            { column: 'file_id', op: 'eq', value: fileId },
            ...(req.search
              ? [
                  {
                    column: 'reference_number',
                    op: 'contains' as const,
                    value: req.search,
                  },
                ]
              : []),
          ],
          orderBy: [
            {
              column:
                req.sortKey === 'created_at' ? 'created_at' : 'started_on',
              direction: req.sortDir ?? 'asc',
            },
          ],
          offset: (req.page - 1) * req.pageSize,
          limit: req.pageSize,
        });
        return page;
      },
      actions: (s) => [
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          text: 'تعديل / تواريخ',
          on: {
            click: () =>
              openStageForm(context, fileId, { stage: s, onSaved: refresh }),
          },
        }),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          text: 'مرحلة تالية',
          on: {
            click: () =>
              openStageForm(context, fileId, {
                previousStageId: str(s.id),
                onSaved: refresh,
              }),
          },
        }),
        h('button', {
          type: 'button',
          class: 'btn btn--outline btn--sm',
          text: 'إنشاء دعوى مرتبطة',
          on: {
            click: () =>
              openCaseIntake(context, { fileId, sourceStageId: str(s.id) }),
          },
        }),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          text: 'متابعة المرحلة',
          on: {
            click: (event) =>
              openMenu(
                (event.currentTarget as HTMLElement).getBoundingClientRect(),
                [
                  {
                    label: 'إنشاء مهمة مرتبطة',
                    iconName: 'tasks',
                    onClick: () => {
                      void import('./tasks.ts').then((m) =>
                        m.openTaskDialog(context, refresh, {
                          fileId,
                          stageId: str(s.id),
                          ...(s.case_id ? { caseId: str(s.case_id) } : {}),
                        }),
                      );
                    },
                  },
                  {
                    label: 'إنشاء موعد متابعة',
                    iconName: 'calendar',
                    onClick: () => {
                      void import('./appointments.ts').then((m) =>
                        m.openAppointmentForm(context, refresh, {
                          fileId,
                          stageId: str(s.id),
                          ...(s.case_id ? { caseId: str(s.case_id) } : {}),
                        }),
                      );
                    },
                  },
                  {
                    label: 'عرض أعمال ومواعيد المرحلة',
                    iconName: 'list',
                    onClick: () => openStageWork(context, str(s.id)),
                  },
                ],
              ),
          },
        }),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          text: 'سجل التعديلات',
          on: {
            click: () => {
              const audit = dataTable<EngineRow>(
                {
                  id: `stage-audit-${str(s.id)}`,
                  title: 'تدقيق المرحلة',
                  searchPlaceholder: 'ابحث بملخص الإجراء…',
                  rowKey: (e) => str(e.id),
                  columns: [
                    {
                      key: 'when',
                      label: 'التاريخ',
                      cardRole: 'meta',
                      render: (e) =>
                        h('span', { text: formatDate(str(e.occurred_at)) }),
                    },
                    {
                      key: 'action',
                      label: 'الإجراء',
                      cardRole: 'title',
                      render: (e) => h('span', { text: str(e.action) }),
                    },
                    {
                      key: 'summary',
                      label: 'ملخص آمن',
                      cardRole: 'detail',
                      render: (e) => h('span', { text: str(e.summary) }),
                    },
                  ],
                  load: (req) =>
                    workspace.db.auditTrailPage('procedural_stage', str(s.id), {
                      offset: (req.page - 1) * req.pageSize,
                      limit: req.pageSize,
                      ...(req.search
                        ? {
                            filters: [
                              {
                                column: 'summary',
                                op: 'contains' as const,
                                value: req.search,
                              },
                            ],
                          }
                        : {}),
                    }),
                },
                workspace.preferences,
              );
              openDialog({
                title: 'تدقيق المرحلة — جميع الصفحات',
                size: 'xl',
                content: audit.root,
              });
            },
          },
        }),
      ],
      emptyTitle: 'لم تسجل مراحل بعد',
      emptyText:
        'لا يفرض البرنامج أي مسار. أضف ما حدث فعليًا من تسوية أو شكوى أو محضر أو دعوى.',
    },
    workspace.preferences,
  );
  const graph = h(
    'ol',
    {
      class: 'procedure-graph',
      attrs: { 'aria-label': 'الدرجات القضائية المستقلة داخل ملف النزاع' },
    },
    ...intake.cases.map((c) =>
      h(
        'li',
        { class: 'procedure-graph__node' },
        h('span', {
          class: 'badge badge--quiet',
          text: l.name('litigation_degree', str(c.litigation_degree_id)),
        }),
        h('a', {
          href: `#/cases/${str(c.id)}`,
          class: 'cell-link',
          text: `${str(c.case_number)} / ${str(c.case_year)}`,
        }),
        h('span', { class: 'text-xs text-3', text: str(c.subject) }),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          text: 'إضافة درجة / دعوى مرتبطة',
          on: {
            click: () =>
              openCaseIntake(context, {
                fileId,
                relatedCaseId: str(c.id),
                ...(caseId === c.id ? {} : {}),
              }),
          },
        }),
      ),
    ),
  );
  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    notice(
      'warning',
      'سجل تشغيلي للمسار الفعلي، لا تقييم قانوني آلي. لا تحسب مواعيد الطعن أو السقوط أو التقادم هنا. بيانات الأسرة الخاصة لا تظهر في البحث العام؛ النسخة الحالية محلية دون صلاحيات مستخدمين متعددة.',
    ),
    sectionCard({
      title: 'ملف النزاع وبياناته المشتركة',
      body: rows,
      actions: [
        h('button', {
          type: 'button',
          class: 'btn btn--outline btn--sm',
          text: 'استكمال / تعديل البيانات',
          on: {
            click: () =>
              openCaseIntake(context, {
                fileId,
                ...(caseId ? { caseId } : {}),
              }),
          },
        }),
      ],
    }),
    ...specializedViews,
    sectionCard({
      title: 'قائمة النواقص الواضحة',
      subtitle: 'ليست نسبة شكلية ولا حكمًا على صحة الإجراء',
      body: h(
        'div',
        { class: 'stack' },
        ...completion.map((issue) =>
          h('button', {
            class: 'btn btn--ghost btn--sm intake-review-link',
            type: 'button',
            text: issue.message,
            on: {
              click: () =>
                issue.group === 'stages'
                  ? openStageForm(context, fileId, {
                      ...(intake.stages.find(
                        (s) => !s.authority_id || !s.reference_number,
                      )
                        ? {
                            stage: intake.stages.find(
                              (s) => !s.authority_id || !s.reference_number,
                            )!,
                          }
                        : {}),
                      onSaved: refresh,
                    })
                  : openCaseIntake(context, {
                      fileId,
                      ...(caseId ? { caseId } : {}),
                      focusField: issue.field,
                    }),
            },
          }),
        ),
      ),
    }),
    sectionCard({
      title: 'المراحل والإجراءات السابقة واللاحقة',
      subtitle:
        'سجل مستقل لكل مرحلة، مع فروع اختيارية وعدم استبدال التاريخ السابق',
      body: timeline.root,
      actions: [
        h('button', {
          type: 'button',
          class: 'btn btn--primary btn--sm',
          text: 'تسجيل مرحلة',
          on: {
            click: () =>
              openStageForm(context, fileId, {
                ...(caseId ? { caseId } : {}),
                onSaved: refresh,
              }),
          },
        }),
      ],
    }),
    sectionCard({
      title: 'الدرجات والدعاوى داخل ملف النزاع',
      body: intake.cases.length
        ? graph
        : h('p', {
            class: 'text-3',
            text: 'الملف قبل القيد؛ لا توجد دعوى ذات رقم قضائي حتى الآن.',
          }),
      actions: [
        h('button', {
          type: 'button',
          class: 'btn btn--outline btn--sm',
          text: 'قيد دعوى مستقلة في الملف',
          on: {
            click: () =>
              openCaseIntake(context, { fileId, registerCase: true }),
          },
        }),
      ],
    }),
    sectionCard({
      title: 'الموضوعات المرتبطة',
      body: h(
        'div',
        { class: 'row-wrap' },
        ...intake.terms.map((t) =>
          h('a', {
            class: 'chip',
            href: `#/cases?term=${str(t.term_id)}`,
            text: l.name('legal_subject', str(t.term_id)),
          }),
        ),
      ),
    }),
    h('a', {
      class: 'btn btn--ghost',
      href: '#/cases',
      text: 'العودة إلى نتائج القضايا المحفوظة',
    }),
  );
}

function openStageWork(context: PageArgs, stageId: string): void {
  const tables = (['task', 'appointment'] as const).map((entity) =>
    dataTable<EngineRow>(
      {
        id: `stage-work-${entity}`,
        title: entity === 'task' ? 'مهام المرحلة' : 'مواعيد المرحلة',
        rowKey: (row) => str(row.id),
        searchPlaceholder: 'ابحث بعنوان المتابعة…',
        columns: [
          {
            key: 'title',
            label: 'العنوان',
            cardRole: 'title',
            render: (row) =>
              h('a', {
                class: 'cell-link',
                href: entity === 'task' ? '#/tasks' : '#/appointments',
                text: str(row.title),
              }),
          },
          {
            key: 'when',
            label: 'موعد المكتب',
            cardRole: 'meta',
            render: (row) =>
              h('span', {
                text: formatDate(
                  str(row[entity === 'task' ? 'due_at' : 'start_at']),
                ),
              }),
          },
          {
            key: 'status',
            label: 'الحالة',
            cardRole: 'detail',
            render: (row) =>
              h('span', {
                text: context.workspace.lookups.name(
                  entity === 'task' ? 'task_status' : 'appointment_status',
                  str(row.status_id),
                ),
              }),
          },
        ],
        load: (req) =>
          context.workspace.db.query(entity, {
            filters: [
              { column: 'stage_id', op: 'eq', value: stageId },
              ...(req.search
                ? [
                    {
                      column: 'title',
                      op: 'contains' as const,
                      value: req.search,
                    },
                  ]
                : []),
            ],
            orderBy: [
              {
                column: entity === 'task' ? 'due_at' : 'start_at',
                direction: 'asc',
              },
            ],
            offset: (req.page - 1) * req.pageSize,
            limit: req.pageSize,
          }),
      },
      context.workspace.preferences,
    ),
  );
  openDialog({
    title: 'المتابعات المرتبطة بهذه المرحلة',
    size: 'xl',
    content: h(
      'div',
      { class: 'stack' },
      notice('info', 'مواعيد عمل يحددها المكتب، وليست مواعيد قانونية محسوبة.'),
      ...tables.map((t) => t.root),
    ),
  });
}
