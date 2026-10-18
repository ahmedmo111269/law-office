import { h } from '../dom.ts';
import { icon } from '../icons.ts';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  kind?: ToastKind;
  message: string;
  detail?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

let container: HTMLElement | null = null;

function host(): HTMLElement {
  if (container) return container;
  container = h('div', {
    class: 'toast-region',
    attrs: { role: 'region', 'aria-label': 'إشعارات النظام', 'aria-live': 'polite' },
  });
  document.body.appendChild(container);
  return container;
}

export function toast(options: ToastOptions): () => void {
  const kind = options.kind ?? 'info';
  const duration = options.duration ?? (kind === 'error' ? 9000 : 5000);
  const node = h(
    'div',
    { class: `toast toast--${kind}`, attrs: { role: kind === 'error' ? 'alert' : 'status' } },
    h('span', { class: 'toast__icon' }, icon(kind === 'success' ? 'check' : kind === 'error' ? 'alert' : kind === 'warning' ? 'alert' : 'info', 18)),
    h(
      'div',
      { class: 'toast__body' },
      h('p', { class: 'toast__message', text: options.message }),
      options.detail ? h('p', { class: 'toast__detail', text: options.detail }) : null,
    ),
    options.action
      ? h('button', {
          class: 'toast__action',
          type: 'button',
          text: options.action.label,
          on: {
            click: () => {
              options.action?.onClick();
              close();
            },
          },
        })
      : null,
    h('button', {
      class: 'icon-btn icon-btn--sm toast__close',
      type: 'button',
      attrs: { 'aria-label': 'إغلاق الإشعار' },
      on: { click: () => close() },
    }, icon('close', 16)),
  );
  host().appendChild(node);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    node.classList.add('toast--leaving');
    window.setTimeout(() => node.remove(), 180);
  };
  if (duration > 0) window.setTimeout(close, duration);
  while (host().children.length > 4) host().firstElementChild?.remove();
  return close;
}

export function toastSuccess(message: string, detail?: string): void {
  toast({ kind: 'success', message, ...(detail ? { detail } : {}) });
}

export function toastError(message: string, detail?: string): void {
  toast({ kind: 'error', message, ...(detail ? { detail } : {}) });
}
