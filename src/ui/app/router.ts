import { clear, h } from '../dom.ts';
import { icon } from '../icons.ts';
import { toastError } from '../components/toast.ts';
import { toUiError } from '../errors.ts';
import { pageSkeleton } from '../components/page.ts';

export interface RouteContext {
  /** Path segments after the page name, e.g. `#/files/abc` → `['abc']`. */
  readonly params: Record<string, string>;
  readonly query: URLSearchParams;
  readonly path: string;
}

export type RouteHandler = (context: RouteContext) => HTMLElement | Promise<HTMLElement>;

export interface RouteDefinition {
  readonly pattern: string;
  readonly handler: RouteHandler;
  readonly title: (context: RouteContext) => string;
}

export interface RouterEvents {
  onBeforeNavigate?: (to: string) => boolean | void;
  onAfterRender?: (path: string, context: RouteContext) => void;
  onError?: (error: unknown) => void;
}

/**
 * Hash router. The app is served from a GitHub Pages sub-path, so hash routing
 * keeps deep links and reloads working without any server rewrite rules.
 */
export class Router {
  private readonly routes: RouteDefinition[] = [];
  private readonly outlet: HTMLElement;
  private readonly events: RouterEvents;
  private renderToken = 0;
  private current = '';
  private scrollPositions = new Map<string, number>();
  private started = false;

  constructor(outlet: HTMLElement, events: RouterEvents = {}) {
    this.outlet = outlet;
    this.events = events;
  }

  add(definition: RouteDefinition): this {
    this.routes.push(definition);
    return this;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('hashchange', () => void this.render());
    void this.render();
  }

  get path(): string {
    return this.current;
  }

  async render(): Promise<void> {
    const token = ++this.renderToken;
    const raw = window.location.hash.replace(/^#/, '') || '/';
    const [pathPart = '/', queryPart = ''] = raw.split('?');
    const path = normalizePath(pathPart);
    if (this.events.onBeforeNavigate?.(path) === false) return;

    if (this.current) this.scrollPositions.set(this.current, window.scrollY);
    this.current = path;

    const match = this.match(path);
    if (!match) {
      this.outlet.replaceChildren(notFound(path));
      this.events.onAfterRender?.(path, { params: {}, query: new URLSearchParams(queryPart), path });
      return;
    }

    clear(this.outlet);
    this.outlet.appendChild(pageSkeleton());
    document.body.dataset.routeState = 'loading';
    try {
      const node = await match.definition.handler({
        params: match.params,
        query: new URLSearchParams(queryPart),
        path,
      });
      if (token !== this.renderToken) return;
      this.outlet.replaceChildren(node);
      document.body.dataset.routeState = 'ready';
      const title = match.definition.title({ params: match.params, query: new URLSearchParams(queryPart), path });
      document.title = `${title} · مِداد`;
      const previous = this.scrollPositions.get(path) ?? 0;
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: previous, behavior: 'instant' as ScrollBehavior });
        focusPageHeading(this.outlet);
      });
      this.events.onAfterRender?.(path, { params: match.params, query: new URLSearchParams(queryPart), path });
    } catch (error) {
      if (token !== this.renderToken) return;
      document.body.dataset.routeState = 'error';
      this.events.onError?.(error);
      const ui = toUiError(error);
      toastError(ui.message, ui.detail);
      this.outlet.replaceChildren(routeError(ui.message));
    }
  }

  private match(path: string): { definition: RouteDefinition; params: Record<string, string> } | null {
    const segments = splitPath(path);
    for (const definition of this.routes) {
      const patternSegments = splitPath(definition.pattern);
      if (patternSegments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let index = 0; index < patternSegments.length; index += 1) {
        const pattern = patternSegments[index]!;
        const value = segments[index]!;
        if (pattern.startsWith(':')) {
          params[pattern.slice(1)] = decodeURIComponent(value);
        } else if (pattern !== value) {
          matched = false;
          break;
        }
      }
      if (matched) return { definition, params };
    }
    return null;
  }
}

export function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') return '/today';
  return trimmed.startsWith('/') ? trimmed.replace(/\/+$/, '') || '/today' : `/${trimmed}`;
}

export function navigate(path: string, options: { replace?: boolean; keepScroll?: boolean } = {}): void {
  const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
  if (options.replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, '', url);
    void new Promise<void>((resolve) => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      resolve();
    });
    return;
  }
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = target;
}

export function currentPath(): string {
  return normalizePath(window.location.hash.replace(/^#/, '') || '/');
}

export function queryParam(name: string): string | null {
  const raw = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(raw).get(name);
}

export function buildPath(path: string, params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function focusPageHeading(outlet: HTMLElement): void {
  const heading = outlet.querySelector<HTMLElement>('[data-page-title], h1');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  document.body.dataset.lastPage = heading.textContent ?? '';
}

function notFound(path: string): HTMLElement {
  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('alert', 26)),
      h('h1', { class: 'empty-state__title', text: 'الصفحة غير موجودة' }),
      h('p', { class: 'empty-state__text', text: `لا يوجد قسم بهذا العنوان داخل البرنامج: ${path}` }),
      h(
        'div',
        { class: 'empty-state__actions' },
        h('a', { class: 'btn btn--primary', href: '#/today', text: 'العودة إلى مكتب اليوم' }),
      ),
    ),
  );
}

function routeError(message: string): HTMLElement {
  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'card__body' },
        h('h1', { class: 'page-title', text: 'تعذر عرض هذه الصفحة' }),
        h('p', { class: 'page-subtitle', text: message }),
        h(
          'div',
          { class: 'row-wrap', style: 'margin-top:16px' },
          h('button', {
            class: 'btn btn--primary',
            type: 'button',
            text: 'إعادة المحاولة',
            on: { click: () => void new Promise((resolve) => { window.dispatchEvent(new HashChangeEvent('hashchange')); resolve(null); }) },
          }),
          h('a', { class: 'btn btn--ghost', href: '#/today', text: 'مكتب اليوم' }),
        ),
      ),
    ),
  );
}
