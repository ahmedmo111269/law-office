import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { addDaysToKey, formatDate, isoDateToday, toDateInput } from '../format.ts';

let fieldSequence = 0;

function fieldId(name: string): string {
  fieldSequence += 1;
  return `f-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}-${fieldSequence}`;
}

export interface FieldConfig {
  label: string;
  name: string;
  value?: string | number | null;
  required?: boolean;
  help?: string;
  placeholder?: string;
  disabled?: boolean;
  autocomplete?: string;
  inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search';
  dir?: 'rtl' | 'ltr' | 'auto';
  maxlength?: number;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  type?: 'text' | 'tel' | 'email' | 'url' | 'number' | 'search' | 'password';
  inline?: boolean;
  optionalLabel?: boolean;
}

export function fieldWrapper(config: FieldConfig, control: HTMLElement, extra?: Child): HTMLElement {
  const id = control.id || fieldId(config.name);
  control.id = id;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  control.setAttribute('aria-describedby', [config.help ? helpId : '', errorId].filter(Boolean).join(' '));
  if (config.required) {
    control.setAttribute('aria-required', 'true');
    control.setAttribute('required', '');
  }
  return h(
    'div',
    { class: `field${config.inline ? ' field--inline' : ''}`, dataset: { field: config.name } },
    h('label', { class: 'field__label', attrs: { for: id } },
      h('span', { text: config.label }),
      config.required
        ? h('span', { class: 'field__required', attrs: { 'aria-hidden': 'true' }, text: ' *' })
        : config.optionalLabel
          ? h('span', { class: 'field__optional', text: ' اختياري' })
          : null,
    ),
    control,
    config.help ? h('p', { class: 'field__help', id: helpId, text: config.help }) : null,
    extra ?? null,
    h('p', { class: 'field__error', id: errorId, attrs: { 'aria-live': 'polite' } }),
  );
}

export function textField(config: FieldConfig): HTMLElement {
  const input = h('input', {
    class: 'input',
    type: config.type ?? 'text',
    name: config.name,
    value: config.value === null || config.value === undefined ? '' : String(config.value),
    ...(config.placeholder ? { placeholder: config.placeholder } : {}),
    ...(config.disabled ? { disabled: true } : {}),
    ...(config.autocomplete ? { autocomplete: config.autocomplete } : { autocomplete: 'off' }),
    ...(config.inputmode ? { inputmode: config.inputmode } : {}),
    ...(config.dir ? { dir: config.dir } : {}),
    ...(config.maxlength ? { maxlength: config.maxlength } : {}),
    ...(config.min !== undefined ? { min: String(config.min) } : {}),
    ...(config.max !== undefined ? { max: String(config.max) } : {}),
    ...(config.step !== undefined ? { step: String(config.step) } : {}),
  });
  return fieldWrapper(config, input);
}

export function textareaField(config: FieldConfig & { rows?: number; maxlength?: number }): HTMLElement {
  const control = h('textarea', {
    class: 'input textarea',
    name: config.name,
    rows: config.rows ?? 4,
    ...(config.placeholder ? { placeholder: config.placeholder } : {}),
    ...(config.maxlength ? { maxlength: config.maxlength } : {}),
    ...(config.dir ? { dir: config.dir } : {}),
  });
  control.value = config.value === null || config.value === undefined ? '' : String(config.value);
  return fieldWrapper(config, control);
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function selectField(config: FieldConfig & { options: readonly SelectOption[]; includeEmpty?: boolean; emptyLabel?: string }): HTMLElement {
  const select = h('select', {
    class: 'input select',
    name: config.name,
    ...(config.disabled ? { disabled: true } : {}),
  });
  const empty = h('option', {
    value: '',
    text: config.emptyLabel ?? '— غير محدد —',
  });
  if (!config.required) select.appendChild(empty);
  for (const option of config.options) {
    select.appendChild(h('option', {
      value: option.value,
      text: option.label,
      ...(option.disabled ? { disabled: true } : {}),
    }));
  }
  const value = config.value === null || config.value === undefined ? '' : String(config.value);
  select.value = config.options.some((option) => option.value === value) || !config.required ? value : '';
  return fieldWrapper(config, select);
}

export function checkboxField(config: {
  label: string;
  name: string;
  checked?: boolean;
  help?: string;
  disabled?: boolean;
}): HTMLElement {
  const id = fieldId(config.name);
  const input = h('input', {
    type: 'checkbox',
    id,
    name: config.name,
    class: 'checkbox',
    ...(config.checked ? { checked: true } : {}),
    ...(config.disabled ? { disabled: true } : {}),
  });
  return h('div', { class: 'field field--check', dataset: { field: config.name } },
    h('label', { class: 'check-row', attrs: { for: id } },
      input,
      h('span', { class: 'check-row__label' },
        h('span', { text: config.label }),
        config.help ? h('span', { class: 'field__help', text: config.help }) : null,
      ),
    ),
  );
}

export function dateField(config: FieldConfig, options: { withQuickPicks?: boolean } = {}): HTMLElement {
  const control = h('input', {
    class: 'input',
    type: 'date',
    name: config.name,
    value: config.value ? toDateInput(String(config.value)) : '',
    ...(config.required ? { required: 'true' } : {}),
    ...(config.min ? { min: String(config.min) } : {}),
    ...(config.max ? { max: String(config.max) } : {}),
  });
  const quick = options.withQuickPicks === false
    ? null
    : h('div', { class: 'quick-dates' },
        h('button', { type: 'button', class: 'chip chip--button', text: 'اليوم', on: { click: () => { control.value = isoDateToday(); control.dispatchEvent(new Event('input', { bubbles: true })); } } }),
        h('button', { type: 'button', class: 'chip chip--button', text: 'غدًا', on: { click: () => { control.value = addDaysToKey(isoDateToday(), 1); control.dispatchEvent(new Event('input', { bubbles: true })); } } }),
        h('button', { type: 'button', class: 'chip chip--button', text: 'بعد أسبوع', on: { click: () => { control.value = addDaysToKey(isoDateToday(), 7); control.dispatchEvent(new Event('input', { bubbles: true })); } } }),
      );
  return fieldWrapper(config, control, quick);
}

export function dateTimeField(config: FieldConfig): HTMLElement {
  const control = h('input', {
    class: 'input',
    type: 'datetime-local',
    name: config.name,
    value: config.value === null || config.value === undefined ? '' : String(config.value),
    ...(config.required ? { required: 'true' } : {}),
    ...(config.min ? { min: String(config.min) } : {}),
  });
  return fieldWrapper(
    { ...config, help: config.help ?? `بتوقيت المكتب. ${formatDate(isoDateToday(), 'medium')}` },
    control,
  );
}

export function formGrid(...children: Child[]): HTMLElement {
  return h('div', { class: 'form-grid' }, ...children);
}

export function formSection(options: {
  title: string;
  description?: string;
  children: Child | Child[];
  number?: number;
}): HTMLElement {
  return h('section', { class: 'form-section' },
    h('header', { class: 'form-section__head' },
      options.number ? h('span', { class: 'form-section__number', text: String(options.number) }) : null,
      h('div', null,
        h('h3', { class: 'form-section__title', text: options.title }),
        options.description ? h('p', { class: 'form-section__desc', text: options.description }) : null,
      ),
    ),
    h('div', { class: 'form-section__body' }, ...(Array.isArray(options.children) ? options.children : [options.children])),
  );
}

export function formErrorSummary(): HTMLElement {
  return h('div', { class: 'form-errors', attrs: { role: 'alert', hidden: 'hidden' } });
}

export function setFormError(field: Element, message: string | null): void {
  const wrapper = field.closest<HTMLElement>('.field');
  const error = wrapper?.querySelector<HTMLElement>('.field__error');
  const control = wrapper?.querySelector<HTMLElement>('.input, .checkbox');
  if (!wrapper || !error) return;
  wrapper.classList.toggle('field--invalid', Boolean(message));
  error.textContent = message ?? '';
  if (control) control.setAttribute('aria-invalid', message ? 'true' : 'false');
}

export function clearFormErrors(root: ParentNode): void {
  for (const wrapper of root.querySelectorAll<HTMLElement>('.field--invalid')) {
    wrapper.classList.remove('field--invalid');
    const error = wrapper.querySelector<HTMLElement>('.field__error');
    if (error) error.textContent = '';
    const control = wrapper.querySelector<HTMLElement>('.input, .checkbox');
    if (control) control.setAttribute('aria-invalid', 'false');
  }
  const summary = root.querySelector<HTMLElement>('.form-errors');
  if (summary) {
    summary.hidden = true;
    summary.textContent = '';
  }
}

export function showFormSummary(root: ParentNode, message: string): void {
  const summary = root.querySelector<HTMLElement>('.form-errors');
  if (!summary) return;
  summary.hidden = false;
  summary.replaceChildren(icon('alert', 18), h('span', { text: message }));
  summary.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * Validates required fields and a supplied validator map. Keeps all entered
 * values intact; never resets the form on failure.
 */
export function validateForm(
  form: HTMLFormElement,
  validators: Record<string, (value: string, data: FormData) => string | null> = {},
): boolean {
  clearFormErrors(form);
  const data = new FormData(form);
  let firstInvalid: HTMLElement | null = null;
  let firstMessage = '';
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    if (control.disabled || !control.name) continue;
    const value = String(data.get(control.name) ?? '').trim();
    let message: string | null = null;
    if (control.required && !value) {
      const label = control.closest('.field')?.querySelector('.field__label span')?.textContent ?? 'هذا الحقل';
      message = `${label} مطلوب.`;
    } else {
      message = validators[control.name]?.(value, data) ?? null;
    }
    if (message) {
      setFormError(control, message);
      if (!firstInvalid) {
        firstInvalid = control;
        firstMessage = message;
      }
    }
  }
  if (firstInvalid) {
    showFormSummary(form, firstMessage);
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }
  return true;
}

export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === 'string') values[key] = value.trim();
  }
  return values;
}

export function submitButton(label: string, options: { kind?: 'primary' | 'danger'; iconName?: string } = {}): HTMLButtonElement {
  return h('button', {
    class: `btn btn--${options.kind ?? 'primary'}`,
    type: 'submit',
  }, options.iconName ? icon(options.iconName, 18) : null, h('span', { text: label }));
}

export function cancelButton(onClick: () => void, label = 'إلغاء'): HTMLButtonElement {
  return h('button', { class: 'btn btn--ghost', type: 'button', text: label, on: { click: onClick } });
}

export function setSubmitting(button: HTMLButtonElement, busy: boolean, label?: string): void {
  button.disabled = busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (busy) {
    button.dataset.label = button.dataset.label ?? button.textContent ?? '';
    button.replaceChildren(h('span', { class: 'spinner spinner--sm', attrs: { 'aria-hidden': 'true' } }), h('span', { text: label ?? 'جارٍ الحفظ…' }));
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
}
