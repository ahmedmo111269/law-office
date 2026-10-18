import { h } from '../dom.ts';
import { icon } from '../icons.ts';

export interface MenuItem {
  label?: string;
  iconName?: string;
  onClick?: () => void;
  separator?: boolean;
  heading?: boolean;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  shortcut?: string;
}

let closeCurrent: (() => void) | null = null;

/**
 * Accessible popover menu anchored to a trigger rectangle. Only one menu is
 * open at a time; Escape and clicking outside close it.
 */
export function openMenu(rect: DOMRect, items: readonly MenuItem[]): void {
  closeCurrent?.();
  const menu = h('div', { class: 'menu', attrs: { role: 'menu' } });
  const buttons: HTMLButtonElement[] = [];

  for (const item of items) {
    if (item.separator) {
      menu.appendChild(h('div', { class: 'menu__sep', attrs: { role: 'separator' } }));
      continue;
    }
    if (item.heading) {
      menu.appendChild(h('p', { class: 'menu__label', text: item.label ?? '' }));
      continue;
    }
    const button = h(
      'button',
      {
        class: `menu__item${item.danger ? ' menu__item--danger' : ''}`,
        type: 'button',
        attrs: { role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox', ...(item.checked !== undefined ? { 'aria-checked': String(item.checked) } : {}) },
        ...(item.disabled ? { disabled: true } : {}),
        on: {
          click: () => {
            if (item.disabled) return;
            close();
            item.onClick?.();
          },
        },
      },
      item.iconName ? h('span', { class: 'menu__item-icon' }, icon(item.iconName, 17)) : null,
      h('span', { class: 'truncate', text: item.label ?? '' }),
      item.checked ? icon('check', 15) : null,
      item.shortcut ? h('span', { class: 'menu__shortcut', text: item.shortcut }) : null,
    );
    buttons.push(button);
    menu.appendChild(button);
  }

  document.body.appendChild(menu);
  const margin = 8;
  const menuWidth = Math.min(menu.offsetWidth, window.innerWidth - margin * 2);
  let left = rect.left + rect.width - menuWidth;
  if (document.dir === 'rtl') left = rect.right - menuWidth;
  left = Math.max(margin, Math.min(window.innerWidth - menuWidth - margin, left));
  const spaceBelow = window.innerHeight - rect.bottom;
  const openAbove = spaceBelow < Math.min(menu.offsetHeight + 12, 240) && rect.top > spaceBelow;
  const top = openAbove
    ? Math.max(margin, rect.top - menu.offsetHeight - 6)
    : Math.min(window.innerHeight - menu.offsetHeight - margin, rect.bottom + 6);
  menu.style.top = `${Math.max(margin, top)}px`;
  menu.style.left = `${left}px`;

  function close(): void {
    menu.remove();
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (closeCurrent === close) closeCurrent = null;
    trigger?.focus();
  }

  function onMouseDown(event: MouseEvent): void {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    close();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = index;
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    buttons[next]?.focus();
  }

  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  buttons.find((button) => !button.disabled)?.focus();
  window.setTimeout(() => {
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  }, 0);
  closeCurrent = close;
}
