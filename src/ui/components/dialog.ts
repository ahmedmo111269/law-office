import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { registerOverlay } from '../overlays.ts';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'sheet';

export interface DialogHandle {
  readonly root: HTMLElement;
  close(): void;
  setBusy(busy: boolean): void;
  isOpen(): boolean;
}

export interface DialogOptions {
  title: string;
  description?: string;
  content: Node;
  footer?: Node;
  size?: DialogSize;
  dismissible?: boolean;
  initialFocus?: HTMLElement | null;
  onClose?: () => void;
  iconName?: string;
}

let openCount = 0;

export function openDialog(options: DialogOptions): DialogHandle {
  const dismissible = options.dismissible ?? true;
  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const titleId = `dialog-title-${Math.random().toString(36).slice(2)}`;
  const descriptionId = `dialog-desc-${Math.random().toString(36).slice(2)}`;

  const closeButton = h(
    'button',
    {
      class: 'icon-btn dialog__close',
      type: 'button',
      attrs: { 'aria-label': 'إغلاق' },
      on: { click: () => close() },
    },
    icon('close', 18),
  );

  const panel = h(
    'section',
    {
      class: `dialog dialog--${options.size ?? 'md'}`,
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        ...(options.description ? { 'aria-describedby': descriptionId } : {}),
      },
    },
    h(
      'header',
      { class: 'dialog__header' },
      options.iconName
        ? h('span', { class: 'dialog__icon' }, icon(options.iconName, 22))
        : null,
      h(
        'div',
        { class: 'dialog__heading' },
        h('h2', { id: titleId, class: 'dialog__title', text: options.title }),
        options.description
          ? h('p', {
              id: descriptionId,
              class: 'dialog__description',
              text: options.description,
            })
          : null,
      ),
      dismissible ? closeButton : null,
    ),
    h('div', { class: 'dialog__content' }, options.content),
    options.footer
      ? h('footer', { class: 'dialog__footer' }, options.footer)
      : null,
  );

  const backdrop = h(
    'div',
    {
      class: 'dialog-backdrop',
      on: {
        mousedown: (event) => {
          if (event.target === backdrop && dismissible) close();
        },
      },
    },
    panel,
  );

  let open = true;
  const previouslyFocused = previousFocus;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      !backdrop.classList.contains('is-open') ||
      [...document.querySelectorAll('.dialog-backdrop.is-open')].at(-1) !==
        backdrop ||
      document.querySelector('.menu')
    )
      return;
    if (event.key === 'Escape' && dismissible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (el) =>
        el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== 'hidden',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.body.appendChild(backdrop);
  const releaseOverlay = registerOverlay(() => close());
  openCount += 1;
  document.body.classList.add('has-modal');
  window.requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    const target =
      options.initialFocus ??
      [
        ...panel.querySelectorAll<HTMLElement>(
          '.dialog__content input:not([type="hidden"]):not([disabled]), .dialog__content select:not([disabled]), .dialog__content textarea:not([disabled])',
        ),
      ].find((el) => el.getClientRects().length > 0) ??
      panel.querySelector<HTMLElement>(
        '.dialog__content button, .btn--primary',
      ) ??
      panel.querySelector<HTMLElement>('button');
    target?.focus();
  });

  const close = (): void => {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKeyDown, true);
    releaseOverlay();
    backdrop.classList.remove('is-open');
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.classList.remove('has-modal');
    window.setTimeout(() => {
      backdrop.remove();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      options.onClose?.();
    }, 140);
  };

  return {
    root: backdrop,
    close,
    setBusy: (busy: boolean) => {
      panel.classList.toggle('is-busy', busy);
      panel.setAttribute('aria-busy', busy ? 'true' : 'false');
      for (const button of panel.querySelectorAll<HTMLButtonElement>('button'))
        button.disabled = busy;
    },
    isOpen: () => open,
  };
}

export function confirmDialog(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  detail?: string;
  onConfirm: () => Promise<void>;
}): DialogHandle {
  let handle: DialogHandle;
  const cancel = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    text: options.cancelLabel ?? 'إلغاء',
    on: { click: () => handle.close() },
  });
  const confirm = h('button', {
    class: `btn ${options.danger ? 'btn--danger' : 'btn--primary'}`,
    type: 'button',
    text: options.confirmLabel ?? 'تأكيد',
  });
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    cancel.disabled = true;
    confirm.textContent = 'جارٍ التنفيذ…';
    try {
      await options.onConfirm();
      handle.close();
    } catch (error) {
      confirm.disabled = false;
      cancel.disabled = false;
      confirm.textContent = options.confirmLabel ?? 'تأكيد';
      const { toastError } = await import('./toast.ts');
      const { toUiError } = await import('../errors.ts');
      const ui = toUiError(error);
      toastError(ui.message, ui.detail);
    }
  });
  handle = openDialog({
    title: options.title,
    ...(options.message ? { description: options.message } : {}),
    iconName: options.danger ? 'alert' : 'info',
    size: 'sm',
    content: h(
      'div',
      { class: 'confirm-body' },
      h('p', { class: 'confirm-body__text', text: options.message }),
      options.detail
        ? h('p', { class: 'muted small', text: options.detail })
        : null,
    ),
    footer: h('div', { class: 'dialog__actions' }, cancel, confirm),
  });
  return handle;
}

export function promptDialog(options: {
  title: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => Promise<void> | void;
}): void {
  let handle: DialogHandle;
  const input = h('input', {
    class: 'input',
    type: 'text',
    value: options.value ?? '',
    attrs: {
      'aria-label': options.label,
      placeholder: options.placeholder ?? '',
      maxlength: 60,
    },
  });
  const form = h(
    'form',
    { class: 'form-stack' },
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label', text: options.label }),
      input,
    ),
  );
  const cancel = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    text: 'إلغاء',
    on: { click: () => handle.close() },
  });
  const submit = h('button', {
    class: 'btn btn--primary',
    type: 'submit',
    text: options.confirmLabel ?? 'حفظ',
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    submit.disabled = true;
    try {
      await options.onSubmit(value);
      handle.close();
    } finally {
      submit.disabled = false;
    }
  });
  handle = openDialog({
    title: options.title,
    size: 'sm',
    content: form,
    footer: h('div', { class: 'dialog__actions' }, cancel, submit),
    initialFocus: input,
  });
}
