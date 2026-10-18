/**
 * Minimal DOM builder.
 *
 * Data is always inserted as text nodes, never as HTML. That removes the main
 * XSS path for client names, notes and imported values. The only `innerHTML`
 * use in the UI is the static icon sprite (see icons.ts).
 */
export type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  class?: string;
  id?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string | number | boolean | null | undefined>;
  style?: string | Record<string, string>;
  on?: Record<string, EventListener>;
  [key: string]: unknown;
}

function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      append(parent, child as unknown as Child[]);
      continue;
    }
    parent.appendChild(typeof child === 'string' || typeof child === 'number'
      ? document.createTextNode(String(child))
      : child);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      switch (key) {
        case 'class':
          element.className = String(value);
          break;
        case 'text':
          element.textContent = String(value);
          break;
        case 'attrs':
          for (const [name, attribute] of Object.entries(value as Record<string, unknown>)) {
            if (attribute === undefined || attribute === null || attribute === false) continue;
            element.setAttribute(name, attribute === true ? '' : String(attribute));
          }
          break;
        case 'dataset':
          for (const [name, data] of Object.entries(value as Record<string, unknown>)) {
            if (data === undefined || data === null) continue;
            element.dataset[name] = String(data);
          }
          break;
        case 'style':
          if (typeof value === 'string') {
            element.style.cssText = value;
          } else {
            for (const [name, styleValue] of Object.entries(value as Record<string, string>)) {
              element.style.setProperty(name, styleValue);
            }
          }
          break;
        case 'on':
          for (const [name, listener] of Object.entries(value as Record<string, EventListener>)) {
            element.addEventListener(name, listener);
          }
          break;
        default:
          if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
          } else if (key in element) {
            (element as unknown as Record<string, unknown>)[key] = value;
          } else {
            element.setAttribute(key, String(value));
          }
      }
    }
  }
  append(element, children);
  return element;
}

export function fragment(...children: Child[]): DocumentFragment {
  const node = document.createDocumentFragment();
  append(node, children);
  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

export function mount(parent: Element, node: Node): void {
  parent.replaceChildren(node);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 250): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function on<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: (event: HTMLElementEventMap[K]) => void,
): void {
  element.addEventListener(type, listener as EventListener);
}

export function setText(node: Element, text: string): void {
  node.textContent = text;
}

export function focusFirst(container: ParentNode): void {
  const target = container.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  target?.focus();
}

export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
