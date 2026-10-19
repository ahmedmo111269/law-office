import { h } from '../dom.ts';
import type { PageArgs } from '../app/context.ts';
import { notice, sectionCard } from '../components/page.ts';
import {
  checkboxField,
  selectField,
  textField,
  textareaField,
} from '../components/forms.ts';
import { entityPicker } from '../components/picker.ts';
import { openFormDialog } from './shared.ts';
import {
  fieldError,
  parseObject,
  assertTemplate,
} from '../../cases/validation.ts';
import type { CaseTemplate, FieldDefinition } from '../../cases/types.ts';
import type { EngineRow } from '../../portable/store.ts';
const str = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v);
function read(root: HTMLElement): Record<string, string> {
  const v: Record<string, string> = {};
  for (const c of root.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('[name]'))
    v[c.name] = c.value.trim();
  return v;
}

export async function caseSettingsPanel(
  context: PageArgs,
): Promise<HTMLElement> {
  const l = context.workspace.lookups;
  const type = selectField({
    label: 'القالب الافتراضي لنوع القضية',
    name: 'templateType',
    value: 'civil',
    options: l
      .items('case_type')
      .map((i) => ({ value: i.code, label: i.nameAr })),
  });
  const refs = selectField({
    label: 'القائمة المرجعية',
    name: 'referenceList',
    value: 'case_classification',
    options: [
      'case_type',
      'case_classification',
      'legal_subject',
      'stage_type',
      'stage_status',
      'court_kind',
      'party_role',
      'case_relation_type',
      'litigation_degree',
    ].map((code) => ({ value: code, label: l.list(code)?.nameAr ?? code })),
  });
  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    notice(
      'warning',
      'هذه قواميس وقوالب عمل للمكتب، وليست قواعد تشريعية. إضافة مسار أو طريق طعن لا تعني جوازه قانونًا. لا تُضاف مواعيد محسوبة آليًا.',
    ),
    sectionCard({
      title: 'قوالب إدخال القضايا',
      subtitle:
        'مجموعات مرتبة، حقول إلزامية أو اختيارية، وشروط ظهور؛ تحفظ الملفات القديمة لقطة إصدارها.',
      body: h(
        'div',
        { class: 'stack' },
        type,
        h('button', {
          type: 'button',
          class: 'btn btn--primary',
          text: 'إدارة القالب المختار',
          on: {
            click: () => {
              void openTemplateEditor(
                context,
                type.querySelector('select')!.value,
              );
            },
          },
        }),
      ),
    }),
    sectionCard({
      title: 'التصنيف وقاموس الموضوعات والمراحل والصفات',
      subtitle:
        'تعديل الاسم أو تعطيل قيمة لا يحذف السجلات القديمة أو ارتباطاتها.',
      body: h(
        'div',
        { class: 'stack' },
        refs,
        h(
          'div',
          { class: 'row-wrap' },
          h('button', {
            type: 'button',
            class: 'btn btn--outline',
            text: 'إضافة / تعديل قيمة مرجعية',
            on: {
              click: () =>
                openReferenceEditor(
                  context,
                  refs.querySelector('select')!.value,
                ),
            },
          }),
          h('button', {
            type: 'button',
            class: 'btn btn--ghost',
            text: 'دمج مصطلحين متكررين',
            on: { click: () => openTermMerge(context) },
          }),
        ),
      ),
    }),
    sectionCard({
      title: 'دليل الجهات الموحد والدوائر',
      subtitle:
        'المحاكم والنيابات وأقسام الشرطة ومكاتب العمل والتسوية واللجان تستخدم سجل الجهات الحالي نفسه.',
      body: h(
        'div',
        { class: 'row-wrap' },
        h('button', {
          type: 'button',
          class: 'btn btn--outline',
          text: 'إضافة / تعديل جهة',
          on: {
            click: () => {
              void openAuthorityEditor(context);
            },
          },
        }),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'إضافة / تعديل دائرة',
          on: {
            click: () => {
              void openCircuitEditor(context);
            },
          },
        }),
      ),
    }),
    notice(
      'info',
      'النسخة الحالية تخزن البيانات على هذا الجهاز ولا تملك نظام صلاحيات متعدد المستخدمين. لا تدخل بيانات أطفال غير لازمة؛ حقول الأسرة الخاصة مستبعدة من الفهرس العام لكنها ليست مشفرة أو محمية بصلاحيات منفصلة.',
    ),
  );
}

async function openTemplateEditor(
  context: PageArgs,
  typeCode: string,
): Promise<void> {
  const current = await context.services.cases.template(typeCode);
  let template = structuredClone(current);
  const groupHost = h('div', { class: 'stack', style: 'gap:12px' });
  const editor = textareaField({
    label: 'التعريف المتقدم (JSON محلي، بمفاتيح ثابتة)',
    name: 'template',
    value: JSON.stringify(template, null, 2),
    rows: 12,
    dir: 'ltr',
    help: 'لإضافة شروط أو مراحل مقترحة أو قواعد اكتمال. لا يغير القالب الجديد تفسير بيانات الملفات السابقة.',
  });
  const syncJson = (): void => {
    editor.querySelector('textarea')!.value = JSON.stringify(template, null, 2);
  };
  const active = checkboxField({
    label: 'القالب مفعل لإنشاء ملفات جديدة',
    name: 'active',
    checked: template.active,
  });
  active.querySelector('input')!.addEventListener('change', () => {
    template.active = active.querySelector('input')!.checked;
    syncJson();
  });
  const render = (): void => {
    groupHost.replaceChildren();
    template.groups.forEach((group, index) => {
      const title = textField({
        label: 'اسم المجموعة',
        name: `group_${group.key}`,
        value: group.label,
      });
      title.querySelector('input')!.addEventListener('input', () => {
        group.label = title.querySelector('input')!.value;
        syncJson();
      });
      const fields = h(
        'div',
        { class: 'stack' },
        ...group.fields.map((f) => {
          const label = textField({
            label: `اسم الحقل · ${f.key}`,
            name: `label_${f.key}`,
            value: f.label,
          });
          const required = checkboxField({
            label: 'مطلوب عند ظهور الحقل',
            name: `required_${f.key}`,
            checked: f.required,
          });
          label.querySelector('input')!.addEventListener('input', () => {
            f.label = label.querySelector('input')!.value;
            syncJson();
          });
          required.querySelector('input')!.addEventListener('change', () => {
            f.required = required.querySelector('input')!.checked;
            syncJson();
          });
          return h('div', { class: 'form-grid' }, label, required);
        }),
      );
      const reorder = h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--sm',
        text: 'نقل المجموعة للأعلى',
        on: {
          click: () => {
            if (!index) return;
            const groups = [...template.groups];
            [groups[index - 1], groups[index]] = [
              groups[index]!,
              groups[index - 1]!,
            ];
            template.groups = groups;
            syncJson();
            render();
          },
        },
      });
      groupHost.append(
        h(
          'details',
          { class: 'intake-section' },
          h('summary', {
            text: `${group.label} (${str(group.fields.length)} حقل)`,
          }),
          h(
            'div',
            { class: 'intake-section__body stack' },
            title,
            reorder,
            fields,
          ),
        ),
      );
    });
  };
  render();
  const addField = h('button', {
    type: 'button',
    class: 'btn btn--outline',
    text: 'إضافة حقل أو مجموعة',
    on: {
      click: () => {
        const content = h(
          'div',
          { class: 'stack' },
          selectField({
            label: 'المجموعة (أو أنشئ جديدة)',
            name: 'groupKey',
            options: template.groups.map((g) => ({
              value: g.key,
              label: g.label,
            })),
          }),
          textField({
            label: 'مفتاح مجموعة جديدة — إنجليزي ثابت',
            name: 'newGroupKey',
          }),
          textField({ label: 'اسم المجموعة الجديدة', name: 'newGroupLabel' }),
          textField({
            label: 'مفتاح الحقل — إنجليزي ثابت',
            name: 'fieldKey',
            required: true,
          }),
          textField({ label: 'اسم الحقل', name: 'fieldLabel', required: true }),
          selectField({
            label: 'نوع القيمة',
            name: 'fieldType',
            required: true,
            value: 'text',
            options: [
              { value: 'text', label: 'نص' },
              { value: 'textarea', label: 'نص متعدد الأسطر' },
              { value: 'date', label: 'تاريخ' },
              { value: 'money', label: 'مبلغ' },
              { value: 'number', label: 'رقم' },
            ],
          }),
        );
        openFormDialog({
          title: 'توسعة قالب الإدخال',
          content,
          submitLabel: 'إضافة للتعريف',
          successMessage: 'أضيف الحقل للتعريف؛ احفظ القالب لاعتماده',
          onSubmit: async () => {
            const v = read(content);
            const candidate = structuredClone(template);
            let group = candidate.groups.find((g) => g.key === v.groupKey);
            if (!group) {
              group = {
                key: v.newGroupKey ?? '',
                label: v.newGroupLabel ?? '',
                fields: [],
              };
              candidate.groups = [...candidate.groups, group];
            }
            group.fields = [
              ...group.fields,
              {
                key: v.fieldKey ?? '',
                label: v.fieldLabel ?? '',
                type: (v.fieldType || 'text') as FieldDefinition['type'],
                required: false,
              },
            ];
            assertTemplate(candidate);
            template = candidate;
            syncJson();
            render();
          },
        });
      },
    },
  });
  const content = h(
    'div',
    { class: 'stack' },
    notice(
      'info',
      `الإصدار الحالي ${str(current.version)}. الحفظ ينشئ إصدارًا أحدث للملفات الجديدة فقط؛ لا يغير لقطات الملفات السابقة.`,
    ),
    active,
    groupHost,
    addField,
    h(
      'details',
      { class: 'intake-section' },
      h('summary', { text: 'التعريف المتقدم وشروط الظهور' }),
      h('div', { class: 'intake-section__body' }, editor),
    ),
  );
  openFormDialog({
    title: `إدارة قالب ${current.title}`,
    size: 'xl',
    iconName: 'layers',
    content,
    submitLabel: 'حفظ إصدار جديد للقالب',
    successMessage: 'حُفظ القالب؛ تفسير بيانات الملفات القديمة لم يتغير',
    onSubmit: async () => {
      let value: CaseTemplate;
      try {
        value = JSON.parse(
          editor.querySelector('textarea')!.value,
        ) as CaseTemplate;
      } catch {
        fieldError('template', 'تعريف JSON غير صالح. راجع الأقواس والقيم.');
      }
      value.typeCode = typeCode;
      value.version = current.version + 1;
      await context.services.cases.saveTemplate(value);
    },
  });
}

function openReferenceEditor(context: PageArgs, listCode: string): void {
  const l = context.workspace.lookups;
  const list = l.list(listCode);
  if (!list) return;
  let selectedId = '';
  const choose = selectField({
    label: 'قيمة موجودة (اتركه فارغًا للإضافة)',
    name: 'existing',
    options: l
      .allItems(listCode)
      .map((i) => ({
        value: i.id,
        label: `${i.nameAr}${i.isActive ? '' : ' — معطل'}`,
      })),
  });
  const parentItems =
    listCode === 'case_classification'
      ? [...l.allItems('case_type'), ...l.allItems('case_classification')]
      : l.allItems(listCode);
  const parent = selectField({
    label: 'التصنيف / الموضوع الأب عند الحاجة',
    name: 'parentId',
    options: parentItems.map((i) => ({ value: i.id, label: i.nameAr })),
  });
  const name = textField({
    label: 'الاسم العربي',
    name: 'name',
    required: true,
  });
  const code = textField({
    label: 'المفتاح الثابت (إنجليزي / أرقام / _)',
    name: 'code',
    required: true,
    help: 'لا يتغير مفتاح قيمة قديمة حتى لا تتغير دلالتها.',
  });
  const aliases = textField({
    label: 'مرادفات وأسماء بديلة — فاصلة بين كل اسم',
    name: 'aliases',
  });
  const notes = textareaField({
    label: 'ملاحظات تحريرية',
    name: 'notes',
    rows: 2,
  });
  const active = checkboxField({
    label: 'القيمة مفعلة للاختيارات الجديدة',
    name: 'active',
    checked: true,
  });
  const related = selectField({
    label: 'موضوع ذو صلة (اختياري)',
    name: 'relatedId',
    options: l
      .items('legal_subject')
      .map((i) => ({ value: i.id, label: i.nameAr })),
  });
  const content = h(
    'div',
    { class: 'stack' },
    notice(
      'info',
      'التعطيل يحفظ كل الارتباطات القديمة. لا تحذف القيم النظامية. الأسماء والمرادفات لا تقرر قواعد قانونية.',
    ),
    choose,
    h('div', { class: 'form-grid' }, name, code),
    parent,
    aliases,
    listCode === 'legal_subject' ? related : null,
    notes,
    active,
  );
  choose.querySelector('select')!.addEventListener('change', () => {
    selectedId = choose.querySelector('select')!.value;
    const item = l.byId(selectedId);
    const meta = parseObject<{ aliases?: string[]; editorialNotes?: string }>(
      item?.description,
      {},
    );
    name.querySelector('input')!.value = item?.nameAr ?? '';
    code.querySelector('input')!.value = item?.code ?? '';
    code.querySelector('input')!.disabled = !!item;
    parent.querySelector('select')!.value = item?.parentId ?? '';
    aliases.querySelector('input')!.value = (meta.aliases ?? []).join('، ');
    notes.querySelector('textarea')!.value =
      meta.editorialNotes ?? item?.description ?? '';
    active.querySelector('input')!.checked = item?.isActive ?? true;
  });
  openFormDialog({
    title: `إدارة ${list.nameAr}`,
    size: 'lg',
    content,
    submitLabel: 'حفظ القيمة المرجعية',
    successMessage: 'حُفظت القيمة وارتباطات السجلات القديمة سليمة',
    onSubmit: async () => {
      const v = read(content);
      if (!v.name) fieldError('name', 'الاسم مطلوب.');
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(v.code ?? ''))
        fieldError(
          'code',
          'استخدم مفتاحًا ثابتًا من حروف إنجليزية صغيرة وأرقام وشرطة سفلية.',
        );
      const old = selectedId
        ? await context.workspace.db.require('lookup_item', selectedId)
        : null;
      const meta = parseObject<Record<string, unknown>>(old?.description, {});
      const patch = {
        name_ar: v.name,
        parent_id: v.parentId || null,
        description: JSON.stringify({
          ...meta,
          aliases: (v.aliases ?? '')
            .split(/[,،]/)
            .map((s) => s.trim())
            .filter(Boolean),
          editorialNotes: v.notes ?? '',
          ...(v.relatedId
            ? {
                related: [
                  ...new Set([
                    ...(Array.isArray(meta.related) ? meta.related : []),
                    v.relatedId,
                  ]),
                ],
              }
            : {}),
        }),
        is_active: active.querySelector('input')!.checked ? 1 : 0,
      };
      await context.workspace.db.transaction(async () => {
        if (old)
          await context.workspace.db.update('lookup_item', selectedId, patch);
        else
          await context.workspace.db.insert('lookup_item', {
            list_id: list.id,
            code: v.code,
            name_en: null,
            sort_order: 1000,
            is_system: 0,
            ...patch,
          });
        if (!old && listCode === 'case_type') {
          const template = structuredClone(
            await context.services.cases.template('other'),
          );
          template.typeCode = v.code!;
          template.title = v.name!;
          template.version = 1;
          await context.services.cases.saveTemplate(template);
        }
      });
      await l.refresh(context.workspace.db);
      context.services.deps.cache.invalidate();
    },
  });
}

function openTermMerge(context: PageArgs): void {
  const options = context.workspace.lookups
    .items('legal_subject')
    .map((i) => ({ value: i.id, label: i.nameAr }));
  const content = h(
    'div',
    { class: 'stack' },
    notice(
      'warning',
      'تعاد روابط الملفات إلى المصطلح الهدف، وتُنقل المرادفات. يبقى المصطلح المصدر معطلًا مع مرجع الدمج وسجل التعديلات؛ لا تحذف القضايا أو الموضوعات.',
    ),
    selectField({ label: 'المصطلح المصدر المتكرر', name: 'sourceId', options }),
    selectField({
      label: 'المصطلح الهدف الذي سيبقى مفعلًا',
      name: 'targetId',
      options,
    }),
  );
  openFormDialog({
    title: 'دمج مصطلحات القاموس',
    content,
    submitLabel: 'دمج الروابط والمرادفات',
    successMessage: 'تم الدمج مع الحفاظ على تاريخ الارتباطات',
    onSubmit: async () => {
      const v = read(content);
      if (!v.sourceId || !v.targetId) fieldError('sourceId', 'اختر المصطلحين.');
      await context.services.cases.mergeTerms(v.sourceId!, v.targetId!);
      await context.workspace.lookups.refresh(context.workspace.db);
    },
  });
}

async function authorityOptions(context: PageArgs, query: string) {
  if (query.trim())
    return (
      await context.workspace.db.searchPage(query, {
        entityType: 'court',
        limit: 20,
      })
    ).hits.map((h) => ({ value: h.entityId, label: h.title }));
  return (
    await context.workspace.db.query('court', {
      orderBy: [{ column: 'name', direction: 'asc' }],
      limit: 20,
    })
  ).rows.map((c) => ({ value: str(c.id), label: str(c.name) }));
}
async function openAuthorityEditor(context: PageArgs): Promise<void> {
  const db = context.workspace.db,
    l = context.workspace.lookups;
  let existing: EngineRow | null = null;
  const picker = entityPicker({
    name: 'authorityId',
    label: 'اختر جهة لتعديلها — أو اتركه فارغًا للإضافة',
    search: (q) => authorityOptions(context, q),
  });
  const name = textField({ label: 'اسم الجهة', name: 'name', required: true });
  const kind = selectField({
    label: 'نوع الجهة',
    name: 'kind',
    options: l
      .items('court_kind')
      .map((i) => ({ value: i.id, label: i.nameAr })),
  });
  const governorate = selectField({
    label: 'المحافظة / النطاق',
    name: 'governorateId',
    options: l
      .items('governorate')
      .map((i) => ({ value: i.id, label: i.nameAr })),
  });
  const level = selectField({
    label: 'المستوى / الدرجة عند الانطباق',
    name: 'levelId',
    options: l
      .items('litigation_degree')
      .map((i) => ({ value: i.id, label: i.nameAr })),
  });
  const aliases = textField({
    label: 'أسماء بديلة للبحث — مفصولة بفاصلة',
    name: 'aliases',
  });
  const parent = entityPicker({
    name: 'parentId',
    label: 'الجهة الأعلى / المرتبطة',
    search: (q) => authorityOptions(context, q),
  });
  const active = checkboxField({
    label: 'الجهة مفعلة',
    name: 'active',
    checked: true,
  });
  const content = h(
    'div',
    { class: 'stack' },
    picker.root,
    name,
    h('div', { class: 'form-grid' }, kind, governorate, level),
    aliases,
    parent.root,
    active,
    notice(
      'info',
      'تعديل الاسم يحدث الاسم المرجعي الحالي؛ المراحل المسجلة تحتفظ باسم الجهة وقت تسجيلها.',
    ),
  );
  picker.root.addEventListener('change', () => {
    void (async () => {
      existing = picker.getValue()
        ? ((await db.get('court', picker.getValue())) ?? null)
        : null;
      name.querySelector('input')!.value = str(existing?.name);
      kind.querySelector('select')!.value = str(existing?.court_kind_id);
      governorate.querySelector('select')!.value = str(
        existing?.governorate_id,
      );
      level.querySelector('select')!.value = str(existing?.level_id);
      try {
        aliases.querySelector('input')!.value = (
          JSON.parse(str(existing?.aliases_json) || '[]') as string[]
        ).join('، ');
      } catch {
        aliases.querySelector('input')!.value = '';
      }
      active.querySelector('input')!.checked = existing
        ? existing.is_active === 1
        : true;
      const p = existing?.parent_id
        ? await db.get('court', str(existing.parent_id))
        : null;
      parent.setValue(p ? { value: str(p.id), label: str(p.name) } : null);
    })();
  });
  openFormDialog({
    title: 'دليل الجهات الموحد',
    size: 'lg',
    content,
    submitLabel: 'حفظ الجهة',
    successMessage: 'حُفظت الجهة في الدليل الحالي',
    onSubmit: async () => {
      const v = read(content);
      if (!v.name) fieldError('name', 'اسم الجهة مطلوب.');
      const patch = {
        name: v.name,
        court_kind_id: v.kind || null,
        governorate_id: v.governorateId || null,
        level_id: v.levelId || null,
        aliases_json: JSON.stringify(
          (v.aliases ?? '')
            .split(/[,،]/)
            .map((n) => n.trim())
            .filter(Boolean),
        ),
        parent_id: parent.getValue() || null,
        is_active: active.querySelector('input')!.checked ? 1 : 0,
      };
      if (existing) await db.update('court', str(existing.id), patch);
      else
        await db.insert('court', {
          ...patch,
          address: null,
          phone: null,
          notes: null,
          archived_at: null,
        });
      context.services.deps.cache.invalidate('court');
    },
  });
}
async function openCircuitEditor(context: PageArgs): Promise<void> {
  const db = context.workspace.db;
  let existingId = '';
  const court = entityPicker({
    name: 'courtId',
    label: 'المحكمة / الجهة',
    required: true,
    search: (q) => authorityOptions(context, q),
  });
  const existing = selectField({
    label: 'دائرة موجودة — أو اتركه فارغًا للإضافة',
    name: 'circuitId',
    options: [],
  });
  const name = textField({
    label: 'اسم الدائرة',
    name: 'name',
    required: true,
  });
  const location = textField({ label: 'مكان الانعقاد', name: 'location' });
  const active = checkboxField({
    label: 'الدائرة مفعلة',
    name: 'active',
    checked: true,
  });
  court.root.addEventListener('change', () => {
    void context.services.cases.circuits(court.getValue()).then((items) => {
      existing
        .querySelector('select')!
        .replaceChildren(
          h('option', { value: '', text: '— دائرة جديدة —' }),
          ...items.map((c) =>
            h('option', { value: str(c.id), text: str(c.name) }),
          ),
        );
      existingId = '';
    });
  });
  existing.querySelector('select')!.addEventListener('change', () => {
    existingId = existing.querySelector('select')!.value;
    void (
      existingId
        ? db.get('court_circuit', existingId)
        : Promise.resolve(undefined)
    ).then((row) => {
      name.querySelector('input')!.value = str(row?.name);
      location.querySelector('input')!.value = str(row?.location);
      active.querySelector('input')!.checked = row ? row.is_active === 1 : true;
    });
  });
  const content = h(
    'div',
    { class: 'stack' },
    court.root,
    existing,
    name,
    location,
    active,
  );
  openFormDialog({
    title: 'إدارة دوائر الجهة',
    content,
    submitLabel: 'حفظ الدائرة',
    successMessage: 'حُفظت الدائرة مرتبطة بجهتها',
    onSubmit: async () => {
      const v = read(content);
      if (!court.getValue()) fieldError('courtId', 'اختر الجهة.');
      if (!v.name) fieldError('name', 'اسم الدائرة مطلوب.');
      const patch = {
        name: v.name,
        location: v.location || null,
        is_active: active.querySelector('input')!.checked ? 1 : 0,
      };
      if (existingId) await db.update('court_circuit', existingId, patch);
      else
        await db.insert('court_circuit', {
          court_id: court.getValue(),
          ...patch,
          notes: null,
        });
      context.services.deps.cache.invalidate('court_circuit');
    },
  });
}
