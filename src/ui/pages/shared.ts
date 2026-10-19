import { AppError } from '../../errors.ts';
import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import {
  openDialog,
  type DialogSize,
  type DialogHandle,
} from '../components/dialog.ts';
import { toastError, toastSuccess } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import { formatNumber } from '../format.ts';
import type { Lookups } from '../state/lookups.ts';
import type { AppContext } from '../app/context.ts';
import { notifyDataChanged } from '../events.ts';

export type BadgeTone =
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'primary'
  | 'quiet'
  | 'accent';

const STATUS_TONES: Record<string, BadgeTone> = {
  active: 'success',
  open: 'info',
  in_progress: 'info',
  waiting: 'warning',
  blocked: 'danger',
  done: 'success',
  completed: 'success',
  cancelled: 'quiet',
  canceled: 'quiet',
  archived: 'quiet',
  scheduled: 'primary',
  postponed: 'warning',
  held: 'success',
  stayed: 'warning',
  appealed: 'info',
  closed: 'quiet',
  draft: 'quiet',
  signed: 'success',
  expired: 'danger',
  revoked: 'danger',
  expired_soon: 'warning',
  pending: 'warning',
  served: 'success',
  failed: 'danger',
  unpaid: 'danger',
  paid: 'success',
  partially_paid: 'warning',
  outstanding: 'warning',
  overdue: 'danger',
  posted: 'success',
  reversed: 'quiet',
  void: 'quiet',
  no_show: 'danger',
  rescheduled: 'warning',
  confirmed: 'info',
  new: 'info',
  in_review: 'info',
  suspended: 'warning',
  appeal_pending: 'warning',
};

export function statusTone(code: string | null | undefined): BadgeTone {
  if (!code) return 'quiet';
  return STATUS_TONES[code] ?? 'quiet';
}

export function codeBadge(
  code: string | null | undefined,
  label: string,
): HTMLElement {
  return h('span', { class: `badge badge--${statusTone(code)}`, text: label });
}

export function lookupBadge(
  lookups: Lookups,
  listCode: string,
  id: string | null | undefined,
): HTMLElement {
  const byId = lookups.byId(String(id ?? ''));
  const item = byId ? (lookups.item(listCode, byId.code) ?? byId) : undefined;
  if (!item) return h('span', { class: 'text-3', text: '—' });
  return codeBadge(item.code, item.nameAr);
}

export function lookupName(
  lookups: Lookups,
  id: string | null | undefined,
): string {
  return lookups.byId(String(id ?? ''))?.nameAr ?? '—';
}

export function lookupOptions(
  lookups: Lookups,
  listCode: string,
): Array<{ value: string; label: string }> {
  return lookups
    .items(listCode)
    .map((item) => ({ value: item.code, label: item.nameAr }));
}

export function lookupId(
  lookups: Lookups,
  listCode: string,
  code: string,
): string {
  const id = lookups.id(listCode, code);
  if (!id) throw new Error(`قيمة مرجعية غير معروفة: ${listCode}/${code}`);
  return id;
}

export interface FormDialogOptions {
  title: string;
  description?: string;
  size?: DialogSize;
  iconName?: string;
  content: HTMLElement;
  submitLabel: string;
  /** Return a user-facing error string to keep the dialog open, or void on success. */
  onSubmit: (form: HTMLFormElement) => Promise<void>;
  onSuccess?: () => void | Promise<void>;
  successMessage: string;
  extraFooter?: Child[];
}

/**
 * Wraps a form in a dialog with honest save semantics: the success toast fires
 * only after `onSubmit` resolved, which the pages implement as real DB writes.
 */
export function openFormDialog(options: FormDialogOptions): DialogHandle {
  const form = h('form', {
    class: 'stack',
    style: 'gap:0',
    attrs: { novalidate: 'true' },
  });
  form.id = `form-${crypto.randomUUID()}`;
  form.appendChild(options.content);
  const errorBox = h('p', {
    class: 'field__error',
    attrs: { role: 'alert' },
    style: 'margin-block-start:8px',
  });
  form.appendChild(errorBox);
  form.appendChild(h('div', { class: 'form-actions' }));

  const submit = h(
    'button',
    { class: 'btn btn--primary', type: 'submit' },
    icon('save', 17),
    h('span', { text: options.submitLabel }),
  );
  submit.setAttribute('form', form.id);
  const cancel = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    text: 'إلغاء',
    on: { click: () => handle.close() },
  });

  const handle = openDialog({
    title: options.title,
    ...(options.description ? { description: options.description } : {}),
    ...(options.iconName ? { iconName: options.iconName } : {}),
    size: options.size ?? 'md',
    content: form,
    footer: h(
      'div',
      { class: 'dialog__actions' },
      ...(options.extraFooter ?? []),
      cancel,
      submit,
    ),
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    errorBox.textContent = '';
    for (const field of form.querySelectorAll('.field--invalid')) {
      field.classList.remove('field--invalid');
      field.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');
      const hint = field.querySelector('.field__error');
      if (hint) hint.textContent = '';
    }
    submit.disabled = true;
    submit.classList.add('is-loading');
    try {
      await options.onSubmit(form);
      handle.close();
      toastSuccess(options.successMessage);
      await options.onSuccess?.();
      notifyDataChanged();
    } catch (error) {
      const ui = toUiError(error);
      errorBox.textContent = ui.message;
      if (error instanceof AppError && typeof error.details?.field === 'string')
        setFieldError(form, error.details.field, ui.message);
      submit.classList.remove('is-loading');
      submit.disabled = false;
      const firstInvalid = form.querySelector<HTMLElement>(
        '[aria-invalid="true"], .field--invalid .input',
      );
      if (firstInvalid) {
        const wrapper = firstInvalid.closest<HTMLElement>('.field');
        if (wrapper) wrapper.hidden = false;
        let parent = firstInvalid.parentElement;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) {
            parent.hidden = false;
            parent.open = true;
          }
          parent = parent.parentElement;
        }
        firstInvalid.scrollIntoView({ block: 'center' });
        firstInvalid.focus();
      }
    }
  });
  return handle;
}

export async function runAction(
  label: string,
  action: () => Promise<void>,
  onDone?: () => void,
): Promise<void> {
  try {
    await action();
    toastSuccess(label);
    onDone?.();
    notifyDataChanged();
  } catch (error) {
    const ui = toUiError(error);
    toastError(ui.message, ui.detail);
  }
}

export function iconButton(options: {
  label: string;
  iconName: string;
  onClick: () => void;
  danger?: boolean;
}): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'icon-btn icon-btn--sm',
      type: 'button',
      title: options.label,
      attrs: { 'aria-label': options.label },
      on: {
        click: (event) => {
          event.stopPropagation();
          options.onClick();
        },
      },
      style: options.danger ? 'color:var(--c-danger)' : '',
    },
    icon(options.iconName, 16),
  );
}

export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === 'string') values[key] = value.trim();
  }
  return values;
}

export function setFieldError(
  form: HTMLFormElement,
  name: string,
  message: string,
): void {
  const control = form.querySelector<HTMLElement>(`[name="${name}"]`);
  const field = control?.closest<HTMLElement>('.field');
  if (!field) return;
  field.classList.add('field--invalid');
  control?.setAttribute('aria-invalid', 'true');
  const error = field.querySelector<HTMLElement>('.field__error');
  if (error) error.textContent = message;
}

export function clearFocusedRow(path: string): void {
  if (!window.location.hash.includes('focus=')) return;
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}#${path}`,
  );
}

export function money(valueMinor: number): string {
  return formatNumber(Math.round(valueMinor) / 100, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function devContextLabel(context: AppContext): string {
  const engine =
    context.workspace.handle.engine === 'indexeddb'
      ? 'IndexedDB'
      : context.workspace.handle.engine;
  return `محرك التخزين: ${engine}`;
}

export function entityTile(options: {
  title: string;
  subtitle?: string | null;
  href?: string;
  iconName?: string;
  actions?: Child[];
}): HTMLElement {
  return h(
    'div',
    { class: 'record-card' },
    h(
      'div',
      { class: 'record-card__head' },
      options.iconName
        ? h('span', { class: 'avatar' }, icon(options.iconName, 18))
        : null,
      h(
        'div',
        { style: 'flex:1;min-inline-size:0' },
        options.href
          ? h(
              'h3',
              { class: 'record-card__title' },
              h('a', { href: options.href, text: options.title }),
            )
          : h('h3', { class: 'record-card__title', text: options.title }),
        options.subtitle
          ? h('p', { class: 'text-xs text-3', text: options.subtitle })
          : null,
      ),
      options.actions
        ? h('div', { class: 'row', style: 'gap:2px' }, ...options.actions)
        : null,
    ),
  );
}

export function relevanceLabel(days: number): string {
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'غدًا';
  if (days === 2) return 'بعد يومين';
  if (days <= 10) return `بعد ${formatNumber(days)} أيام`;
  return `بعد ${formatNumber(days)} يومًا`;
}
