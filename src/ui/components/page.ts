import { h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatNumber } from '../format.ts';

export interface PageHeaderOptions {
  title: string;
  subtitle?: string;
  actions?: Child[];
  count?: number;
  breadcrumb?: Array<{ label: string; href?: string }>;
  meta?: Child[];
}

export function pageHeader(options: PageHeaderOptions): HTMLElement {
  return h(
    'div',
    { class: 'page-head' },
    h(
      'div',
      { class: 'page-head__main' },
      options.breadcrumb && options.breadcrumb.length > 0
        ? h(
            'nav',
            { class: 'breadcrumb', attrs: { 'aria-label': 'مسار التصفح' } },
            ...options.breadcrumb.flatMap((crumb, index) => {
              const node = crumb.href
                ? h('a', { href: crumb.href, text: crumb.label })
                : h('span', { text: crumb.label, attrs: { 'aria-current': 'page' } });
              return index === 0 ? [node] : [h('span', { class: 'breadcrumb__sep', text: '/' }), node];
            }),
          )
        : null,
      h(
        'h1',
        { class: 'page-title', dataset: { pageTitle: 'true' } },
        h('span', { text: options.title }),
        options.count !== undefined
          ? h('span', { class: 'page-title__count', text: `(${formatNumber(options.count)})` })
          : null,
      ),
      options.subtitle ? h('p', { class: 'page-subtitle', text: options.subtitle }) : null,
      options.meta && options.meta.length > 0 ? h('div', { class: 'row-wrap', style: 'margin-top:8px' }, ...options.meta) : null,
    ),
    options.actions && options.actions.length > 0 ? h('div', { class: 'page-actions' }, ...options.actions) : null,
  );
}

export function pageSkeleton(): HTMLElement {
  return h(
    'div',
    { class: 'page', attrs: { 'aria-busy': 'true' } },
    h(
      'div',
      { class: 'stack', style: 'gap:12px' },
      h('span', { class: 'skeleton skeleton--title' }),
      h('span', { class: 'skeleton skeleton--text', style: 'max-inline-size:420px' }),
    ),
    h(
      'div',
      { class: 'grid-4' },
      ...Array.from({ length: 4 }, () => h('div', { class: 'skeleton skeleton--card' })),
    ),
    h('div', { class: 'skeleton skeleton--card', style: 'block-size:320px' }),
  );
}

export function emptyState(options: {
  iconName?: string;
  title: string;
  text?: string;
  actions?: Child[];
}): HTMLElement {
  return h(
    'div',
    { class: 'empty-state' },
    h('span', { class: 'empty-state__icon' }, icon(options.iconName ?? 'folder-open', 26)),
    h('p', { class: 'empty-state__title', text: options.title }),
    options.text ? h('p', { class: 'empty-state__text', text: options.text }) : null,
    options.actions && options.actions.length > 0 ? h('div', { class: 'empty-state__actions' }, ...options.actions) : null,
  );
}

export function sectionCard(options: {
  title: string;
  subtitle?: string;
  actions?: Child[];
  body: Child | Child[];
  footer?: Child | Child[];
  bodyClass?: string;
}): HTMLElement {
  return h(
    'section',
    { class: 'card' },
    h(
      'header',
      { class: 'card__head' },
      h(
        'div',
        { style: 'flex:1;min-inline-size:0' },
        h('h2', { class: 'card__title', text: options.title }),
        options.subtitle ? h('p', { class: 'card__subtitle', text: options.subtitle }) : null,
      ),
      options.actions ? h('div', { class: 'row-wrap' }, ...options.actions) : null,
    ),
    h('div', { class: `card__body ${options.bodyClass ?? ''}` }, ...(Array.isArray(options.body) ? options.body : [options.body])),
    options.footer
      ? h('footer', { class: 'card__foot' }, ...(Array.isArray(options.footer) ? options.footer : [options.footer]))
      : null,
  );
}

export function statCard(options: {
  label: string;
  value: string;
  iconName: string;
  meta?: string;
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'info';
  href?: string;
  small?: boolean;
}): HTMLElement {
  const content = [
    h(
      'div',
      { class: 'stat__head' },
      h('span', { text: options.label }),
      h('span', { class: 'stat__icon' }, icon(options.iconName, 17)),
    ),
    h('p', { class: `stat__value${options.small ? ' stat__value--sm' : ''}`, text: options.value }),
    options.meta ? h('p', { class: 'stat__meta', text: options.meta }) : null,
  ];
  const className = `stat${options.tone && options.tone !== 'default' ? ` stat--${options.tone}` : ''}`;
  if (options.href) {
    return h('a', { class: className, href: options.href, style: 'text-decoration:none;color:inherit' }, ...content);
  }
  return h('div', { class: className }, ...content);
}

export interface TabDefinition {
  id: string;
  label: string;
  count?: number;
  iconName?: string;
}

export interface TabsHandle {
  readonly root: HTMLElement;
  setActive(id: string): void;
}

export function tabs(
  items: readonly TabDefinition[],
  activeId: string,
  onChange: (id: string) => void,
): TabsHandle {
  const root = h('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'أقسام الصفحة' } });
  const buttons = new Map<string, HTMLButtonElement>();
  for (const item of items) {
    const selected = item.id === activeId;
    const button = h(
      'button',
      {
        class: 'tab',
        type: 'button',
        attrs: {
          role: 'tab',
          'aria-selected': selected ? 'true' : 'false',
          'aria-controls': `tabpanel-${item.id}`,
          id: `tab-${item.id}`,
          ...(selected ? {} : { tabindex: '-1' }),
        },
        on: {
          click: () => {
            if (button.getAttribute('aria-selected') === 'true') return;
            onChange(item.id);
          },
          keydown: (event) => {
            const keyboard = event as KeyboardEvent;
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(keyboard.key)) return;
            keyboard.preventDefault();
            const index = items.findIndex((candidate) => candidate.id === button.dataset.tabId);
            let next = index;
            // In RTL the visual order is mirrored: ArrowRight moves to the previous tab.
            if (keyboard.key === 'ArrowRight') next = index - 1;
            if (keyboard.key === 'ArrowLeft') next = index + 1;
            if (keyboard.key === 'Home') next = 0;
            if (keyboard.key === 'End') next = items.length - 1;
            if (next < 0) next = items.length - 1;
            if (next >= items.length) next = 0;
            const target = items[next];
            if (!target) return;
            buttons.get(target.id)?.focus();
            buttons.get(target.id)?.click();
          },
        },
      },
      item.iconName ? icon(item.iconName, 15) : null,
      h('span', { text: item.label }),
      item.count !== undefined ? h('span', { class: 'tab__count', text: formatNumber(item.count) }) : null,
    );
    button.dataset.tabId = item.id;
    buttons.set(item.id, button);
    root.appendChild(button);
  }
  return {
    root,
    setActive: (id: string) => {
      for (const [key, button] of buttons) {
        const selected = key === id;
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        if (selected) button.removeAttribute('tabindex');
        else button.setAttribute('tabindex', '-1');
      }
    },
  };
}

export function tabPanel(id: string, content: Child | Child[]): HTMLElement {
  return h(
    'div',
    {
      class: 'tab-panel',
      id: `tabpanel-${id}`,
      attrs: { role: 'tabpanel', 'aria-labelledby': `tab-${id}` },
    },
    ...(Array.isArray(content) ? content : [content]),
  );
}

export function notice(
  tone: 'info' | 'warning' | 'danger' | 'success' | 'neutral',
  message: string,
  options: { iconName?: string; title?: string } = {},
): HTMLElement {
  return h(
    'div',
    { class: `notice${tone === 'info' ? '' : ` notice--${tone}`}`, attrs: { role: tone === 'danger' ? 'alert' : 'status' } },
    icon(options.iconName ?? (tone === 'danger' || tone === 'warning' ? 'alert' : tone === 'success' ? 'check' : 'info'), 18),
    h(
      'div',
      null,
      options.title ? h('p', { class: 'strong', text: options.title }) : null,
      h('p', { text: message }),
    ),
  );
}

export function definitionList(rows: Array<{ label: string; value: Child }>): HTMLElement {
  const dl = h('dl', { class: 'kv' });
  for (const row of rows) {
    dl.appendChild(h('dt', { text: row.label }));
    const dd = h('dd');
    if (typeof row.value === 'string' || typeof row.value === 'number') dd.textContent = String(row.value);
    else if (row.value instanceof Node) dd.appendChild(row.value);
    dl.appendChild(dd);
  }
  return dl;
}

export function loadingRows(count = 5): HTMLElement {
  return h(
    'div',
    { class: 'stack', style: 'padding:16px' },
    ...Array.from({ length: count }, () =>
      h('div', { class: 'row', style: 'gap:12px' },
        h('span', { class: 'skeleton', style: 'inline-size:36px;block-size:36px;border-radius:50%' }),
        h('span', { class: 'skeleton skeleton--text', style: 'flex:1' }),
      ),
    ),
  );
}

/** `dir="auto"` wrapper for numbers, case numbers, phones and mixed text. */
export function bdi(text: string): HTMLElement {
  return h('bdi', { text, dir: 'auto' });
}

export function inlineActions(...buttons: Child[]): HTMLElement {
  return h('div', { class: 'row', style: 'gap:4px;justify-content:flex-end' }, ...buttons);
}
