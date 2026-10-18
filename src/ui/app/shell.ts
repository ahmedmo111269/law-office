import { clear, h, debounce } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatNumber } from '../format.ts';
import { confirmDialog } from '../components/dialog.ts';
import type { SearchHit } from '../../portable/portable-database.ts';
import type { Workspace } from '../state/workspace.ts';
import type { Services } from '../services/index.ts';
import { BOTTOM_NAV, NAV_GROUPS, activeNavPath, navTitle } from './nav.ts';

export interface AppShell {
  readonly root: HTMLElement;
  readonly outlet: HTMLElement;
  refreshNavigationCounts(): Promise<void>;
  setOnline(online: boolean): void;
  announce(message: string): void;
  setDrawer(open: boolean): void;
  openSearch(initialQuery?: string): void;
}

interface NavCounts {
  tasks: number;
  hearings: number;
  finance: number;
}

const ENTITY_LABELS: Record<string, string> = {
  party: 'طرف',
  client_profile: 'عميل',
  case_file: 'ملف',
  legal_case: 'قضية',
  hearing: 'جلسة',
  judgment: 'حكم',
  task: 'مهمة',
  document: 'مستند',
  contract: 'عقد',
  power_of_attorney: 'توكيل',
  appointment: 'موعد',
  financial_charge: 'مستحق',
};

/**
 * Builds the permanent application chrome once. Pages only ever render inside
 * `outlet`; the shell never touches legal data beyond names and counts.
 */
export function createShell(workspace: Workspace, services: Services): AppShell {
  const counts: NavCounts = { tasks: 0, hearings: 0, finance: 0 };
  const countNodes = new Map<string, HTMLElement>();
  const badgeNodes = new Map<string, HTMLElement>();
  let searchOpen: (() => void) | null = null;

  const liveRegion = h('div', {
    class: 'visually-hidden',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });

  const menuButton = h(
    'button',
    {
      class: 'icon-btn topbar-menu',
      type: 'button',
      attrs: { 'aria-label': 'فتح قائمة التنقل', 'aria-expanded': 'false', 'aria-controls': 'app-sidebar' },
      on: {
        click: () => {
          const open = !sidebar.element.classList.contains('is-open');
          setDrawer(open);
          menuButton.setAttribute('aria-expanded', String(open));
        },
      },
    },
    icon('menu', 20),
  );

  const sidebar = buildSidebar();
  const backdrop = h('button', {
    class: 'sidebar-backdrop',
    type: 'button',
    tabindex: -1,
    attrs: { 'aria-label': 'إغلاق القائمة', 'aria-hidden': 'true' },
    on: { click: () => setDrawer(false) },
  });
  const banner = h('div', { class: 'online-banner', hidden: 'hidden' });
  const topbar = h('header', { class: 'topbar' });
  const outlet = h('main', {
    class: 'app-main',
    id: 'main',
    attrs: { tabindex: '-1' },
  });
  const bottomNav = buildBottomNav();
  const root = h(
    'div',
    { class: 'app-shell', dataset: { rail: String(sidebarCollapsed()) } },
    sidebar.element,
    backdrop,
    h('div', { class: 'app-body' }, topbar, banner, outlet, bottomNav),
    liveRegion,
  );

  buildTopbar();
  applyDrawerState();

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
  });

  function sidebarCollapsed(): boolean {
    return workspace.preferences.getString('ui.sidebar', 'full') === 'rail';
  }

  function setDrawer(open: boolean): void {
    sidebar.element.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    backdrop.tabIndex = open ? 0 : -1;
    document.body.dataset.drawer = open ? 'open' : 'closed';
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) {
      window.setTimeout(() => {
        sidebar.element.querySelector<HTMLAnchorElement>('a.nav-link')?.focus();
      }, 80);
    }
  }

  function applyDrawerState(): void {
    sidebar.element.classList.remove('is-open');
    backdrop.classList.remove('is-open');
  }

  function setOnline(online: boolean): void {
    banner.hidden = online;
    if (!online) {
      banner.replaceChildren(
        icon('info', 15),
        h('span', { text: 'أنت غير متصل بالشبكة. البرنامج يعمل محليًا وتُحفظ كل التغييرات على هذا الجهاز.' }),
      );
    }
  }

  function announce(message: string): void {
    liveRegion.textContent = '';
    window.setTimeout(() => {
      liveRegion.textContent = message;
    }, 40);
  }

  // ------------------------------------------------------------- sidebar
  function buildSidebar(): { element: HTMLElement } {
    const nav = h('nav', {
      class: 'sidebar-nav',
      id: 'app-sidebar-nav',
      attrs: { 'aria-label': 'التنقل الرئيسي' },
    });
    for (const group of NAV_GROUPS) {
      const section = h('div', { class: 'nav-group' }, h('p', { class: 'nav-group__label', text: group.label }));
      for (const item of group.items) {
        const count = h('span', { class: 'nav-link__count', hidden: 'hidden' });
        const badge = h('span', { class: 'nav-link__count nav-link__count--alert', hidden: 'hidden' });
        countNodes.set(item.path, count);
        badgeNodes.set(item.path, badge);
        const link = h(
          'a',
          {
            class: 'nav-link',
            href: `#${item.path}`,
            title: item.description,
            dataset: { title: item.label },
            attrs: { 'aria-label': item.label },
            on: {
              click: () => {
                if (window.matchMedia('(max-width: 1023px)').matches) setDrawer(false);
              },
            },
          },
          h('span', { class: 'nav-link__icon', attrs: { 'aria-hidden': 'true' } }, icon(item.icon, 19)),
          h('span', { class: 'nav-link__label', text: item.label }),
          count,
          badge,
        );
        section.appendChild(link);
      }
      nav.appendChild(section);
    }

    const collapseButton = h(
      'button',
      {
        class: 'icon-btn sidebar-collapse',
        type: 'button',
        title: 'طيّ القائمة',
        attrs: { 'aria-label': 'طيّ القائمة الجانبية', 'aria-pressed': String(sidebarCollapsed()) },
        on: {
          click: () => {
            const next = root.dataset.rail === 'true' ? 'false' : 'true';
            root.dataset.rail = next;
            collapseButton.setAttribute('aria-pressed', String(next === 'true'));
            void workspace.preferences.set('ui.sidebar', next === 'true' ? 'rail' : 'full');
          },
        },
      },
      icon('columns', 17),
    );

    const storage = h(
      'a',
      { class: 'storage-chip', href: '#/settings?tab=backup', title: 'حالة التخزين والنسخ الاحتياطي' },
      icon('shield', 15),
      h(
        'span',
        { class: 'storage-chip__body' },
        h('span', { text: storageSummary(workspace) }),
        h(
          'span',
          { class: 'storage-bar', attrs: { 'aria-hidden': 'true' } },
          h('span', {
            class: 'storage-bar__fill',
            style: `inline-size:${storageFill(workspace)}%`,
          }),
        ),
      ),
    );

    const element = h(
      'aside',
      { class: 'sidebar', id: 'app-sidebar', attrs: { 'aria-label': 'قائمة المكتب' } },
      h(
        'div',
        { class: 'sidebar-brand' },
        h(
          'a',
          { class: 'brand', href: '#/today', attrs: { 'aria-label': 'مِداد — مكتب اليوم' } },
          h('span', { class: 'brand__mark', attrs: { 'aria-hidden': 'true' } }, icon('scale', 19)),
          h(
            'span',
            { class: 'brand__text' },
            h('span', { class: 'brand__name', text: 'مِداد' }),
            h('span', { class: 'brand__sub', text: 'إدارة مكتب المحاماة' }),
          ),
        ),
        collapseButton,
      ),
      h(
        'div',
        { class: 'sidebar-scroll' },
        h(
          'div',
          { class: 'sidebar-office' },
          h('span', { class: 'avatar', style: 'inline-size:28px;block-size:28px;font-size:11px', attrs: { 'aria-hidden': 'true' }, text: initialsOf(workspace.officeName()) }),
          h(
            'span',
            { class: 'sidebar-office__body' },
            h('span', { class: 'sidebar-office__name', text: workspace.officeName() }),
            h('span', { class: 'sidebar-office__sub', text: 'الجهاز الحالي · بيانات محلية' }),
          ),
        ),
        nav,
      ),
      h(
        'div',
        { class: 'sidebar-foot' },
        storage,
        h(
          'button',
          {
            class: 'sidebar-user',
            type: 'button',
            attrs: { 'aria-haspopup': 'menu' },
            on: {
              click: (event) => openProfileMenu(event.currentTarget as HTMLElement),
            },
          },
          h('span', { class: 'avatar', attrs: { 'aria-hidden': 'true' }, text: initialsOf(workspace.officeName()) }),
          h(
            'span',
            { class: 'sidebar-user__body' },
            h('span', { class: 'sidebar-user__name', text: 'إعدادات المكتب' }),
            h('span', { class: 'sidebar-user__role', text: 'الملف الشخصي والمظهر والنسخ' }),
          ),
          icon('chevron-left', 15),
        ),
        h(
          'div',
          { class: 'sidebar-status', id: 'sidebar-status' },
          h('span', { class: 'status-dot status-dot--online', attrs: { 'aria-hidden': 'true' } }),
          h('span', { text: 'جاهز · دون اتصال بالشبكة' }),
        ),
      ),
    );
    return { element };
  }

  function buildBottomNav(): HTMLElement {
    const items = BOTTOM_NAV.map((item) => {
      const isMore = item.path === 'more';
      const badgeKind = !isMore && 'badge' in item ? item.badge : undefined;
      const badge = badgeKind ? h('span', { class: 'bottom-nav__badge', hidden: 'hidden' }) : null;
      if (badge && badgeKind) {
        if (badgeKind === 'hearings') badgeNodes.set('/today', badge);
        if (badgeKind === 'tasks') badgeNodes.set('/tasks', badge);
        if (badgeKind === 'finance') badgeNodes.set('/finance', badge);
      }
      return h(
        'a',
        {
          class: 'bottom-nav__item',
          href: isMore ? '#/today' : `#${item.path}`,
          dataset: { bottomNav: isMore ? 'more' : item.path },
          on: {
            click: (event) => {
              if (isMore) {
                event.preventDefault();
                setDrawer(true);
              }
            },
          },
        },
        icon(item.icon, 20),
        h('span', { text: item.label }),
        badge,
      );
    });
    return h('nav', { class: 'bottom-nav', attrs: { 'aria-label': 'التنقل السريع' } }, h('div', { class: 'bottom-nav__inner' }, ...items));
  }

  // -------------------------------------------------------------- topbar
  function buildTopbar(): void {
    const titles = h(
      'div',
      { class: 'topbar-titles' },
      h('span', { class: 'topbar-section', text: 'مِداد' }),
      h('h1', { class: 'topbar-page', text: 'مكتب اليوم' }),
    );

    const searchButton = h(
      'button',
      {
        class: 'search-trigger',
        type: 'button',
        attrs: { 'aria-label': 'بحث شامل في كل بيانات المكتب (Ctrl+K)', 'aria-keyshortcuts': 'Control+K' },
        on: { click: () => openSearch() },
      },
      icon('search', 16),
      h('span', { class: 'search-trigger__label', text: 'ابحث في كل المكتب…' }),
      h('kbd', { class: 'kbd', attrs: { 'aria-hidden': 'true' }, text: 'Ctrl K' }),
    );

    const quickAdd = h(
      'button',
      {
        class: 'btn btn--primary btn--sm topbar-hide-mobile',
        type: 'button',
        attrs: { 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
        on: {
          click: (event) => {
            const button = event.currentTarget as HTMLElement;
            openQuickAdd(button);
          },
        },
      },
      icon('plus', 16),
      h('span', { text: 'إضافة' }),
    );

    const themeButton = h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: 'الوضع الداكن / الفاتح',
        attrs: { 'aria-label': 'تبديل الوضع الداكن' },
        on: {
          click: () => {
            const next = workspace.preferences.resolvedTheme() === 'dark' ? 'light' : 'dark';
            void workspace.preferences.set('ui.theme', next);
            themeButton.replaceChildren(icon(next === 'dark' ? 'sun' : 'moon', 18));
            announce(next === 'dark' ? 'تم تفعيل الوضع الداكن' : 'تم تفعيل الوضع الفاتح');
          },
        },
      },
      icon(workspace.preferences.resolvedTheme() === 'dark' ? 'sun' : 'moon', 18),
    );

    const profileButton = h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: 'قائمة المكتب',
        attrs: { 'aria-haspopup': 'menu', 'aria-label': 'قائمة المكتب والإعدادات' },
        on: { click: (event) => openProfileMenu(event.currentTarget as HTMLElement) },
      },
      h('span', { class: 'topbar-avatar', attrs: { 'aria-hidden': 'true' }, text: initialsOf(workspace.officeName()) }),
    );

    topbar.replaceChildren(
      menuButton,
      titles,
      h(
        'div',
        { class: 'topbar-actions' },
        searchButton,
        h('span', { class: 'topbar-divider', attrs: { 'aria-hidden': 'true' } }),
        quickAdd,
        themeButton,
        h('span', { class: 'topbar-divider topbar-hide-mobile', attrs: { 'aria-hidden': 'true' } }),
        profileButton,
      ),
    );
  }

  function openQuickAdd(anchor: HTMLElement): void {
    const actions: Array<{ label: string; iconName: string; href: string }> = [
      { label: 'ملف جديد', iconName: 'folder', href: '#/files?new=1' },
      { label: 'عميل جديد', iconName: 'users', href: '#/clients?new=1' },
      { label: 'قضية جديدة', iconName: 'scale', href: '#/cases?new=1' },
      { label: 'مهمة جديدة', iconName: 'tasks', href: '#/tasks?new=1' },
      { label: 'جلسة جديدة', iconName: 'gavel', href: '#/hearings?new=1' },
      { label: 'موعد جديد', iconName: 'calendar-clock', href: '#/appointments?new=1' },
      { label: 'مستند جديد', iconName: 'document', href: '#/documents?new=1' },
      { label: 'مستحق مالي', iconName: 'wallet', href: '#/finance?tab=charges&new=1' },
    ];
    anchor.setAttribute('aria-expanded', 'true');
    openAnchoredMenu(anchor, actions.map((action) => ({
      label: action.label,
      iconName: action.iconName,
      onSelect: () => {
        window.location.hash = action.href.slice(1);
        anchor.setAttribute('aria-expanded', 'false');
      },
    })), () => anchor.setAttribute('aria-expanded', 'false'));
  }

  function openProfileMenu(anchor: HTMLElement): void {
    openAnchoredMenu(anchor, [
      { label: 'الإعدادات', iconName: 'settings', onSelect: () => navigateTo('#/settings') },
      { label: 'بيانات المكتب', iconName: 'briefcase', onSelect: () => navigateTo('#/settings?tab=office') },
      { label: 'المظهر والكثافة', iconName: 'display', onSelect: () => navigateTo('#/settings?tab=appearance') },
      { label: 'النسخ الاحتياطي', iconName: 'shield', onSelect: () => navigateTo('#/settings?tab=backup') },
      { label: 'ما الجديد وحدود النسخة', iconName: 'info', onSelect: () => navigateTo('#/settings?tab=about') },
    ], () => undefined);
  }

  // -------------------------------------------------------- search overlay
  function openSearch(initialQuery = ''): void {
    if (searchOpen) {
      searchOpen();
      return;
    }
    let entries: Array<{ hit: SearchHit; route: string }> = [];
    let active = -1;
    let closed = false;

    const input = h('input', {
      class: 'input',
      type: 'search',
      placeholder: 'اسم عميل، رقم ملف، رقم قضية، عنوان مستند…',
      attrs: {
        'aria-label': 'البحث الشامل',
        'aria-controls': 'global-search-results',
        'aria-autocomplete': 'list',
        autocomplete: 'off',
        spellcheck: 'false',
      },
    });
    const results = h('div', {
      class: 'search-overlay__results',
      id: 'global-search-results',
      attrs: { role: 'listbox', 'aria-label': 'نتائج البحث' },
    });
    const status = h('p', { class: 'visually-hidden', attrs: { role: 'status', 'aria-live': 'polite' } });
    const overlay = h(
      'div',
      { class: 'search-overlay', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'البحث الشامل' } },
      h(
        'div',
        { class: 'search-overlay__panel' },
        h('div', { class: 'search-overlay__input' }, icon('search', 19), input, h('kbd', { class: 'kbd', text: 'Esc' })),
        results,
        h(
          'div',
          { class: 'search-overlay__foot' },
          h('span', null, h('kbd', { class: 'kbd', text: '↑' }), ' ', h('kbd', { class: 'kbd', text: '↓' }), ' للتنقل'),
          h('span', null, h('kbd', { class: 'kbd', text: 'Enter' }), ' للفتح'),
          h('span', { class: 'grow' }),
          status,
        ),
      ),
    );

    const close = (): void => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.body.dataset.scrollLocked = 'false';
      searchOpen = null;
      trigger.focus();
    };
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;

    const setActive = (index: number): void => {
      active = index;
      const buttons = [...results.querySelectorAll<HTMLButtonElement>('.search-result')];
      buttons.forEach((button, i) => {
        button.classList.toggle('is-active', i === index);
        button.setAttribute('aria-selected', String(i === index));
      });
      if (index >= 0) buttons[index]?.scrollIntoView({ block: 'nearest' });
    };

    const go = (route: string): void => {
      close();
      navigateTo(route);
    };

    const renderIdle = (): void => {
      entries = [];
      results.replaceChildren(
        h(
          'div',
          { class: 'search-overlay__hint' },
          icon('search', 26),
          h('p', { class: 'strong', style: 'margin-block:8px 4px', text: 'ابحث في كل بيانات المكتب' }),
          h('p', { class: 'text-sm text-3', text: 'الأسماء، أرقام الملفات والقضايا، عناوين المستندات، وملاحظات السجلات. النتائج تظهر أثناء الكتابة.' }),
        ),
      );
      status.textContent = '';
    };

    const renderHits = (hits: Array<{ hit: SearchHit; route: string }>): void => {
      entries = hits;
      if (hits.length === 0) {
        results.replaceChildren(h('div', { class: 'search-overlay__hint' }, h('p', { class: 'strong', text: 'لا نتائج مطابقة' }), h('p', { class: 'text-sm text-3', text: 'جرّب كلمة أقصر أو رقم ملف بدلًا من الاسم الكامل.' })));
        status.textContent = 'لا نتائج';
        return;
      }
      results.replaceChildren(
        ...hits.map((entry, index) =>
          h(
            'button',
            {
              class: 'search-result',
              type: 'button',
              attrs: { role: 'option', 'aria-selected': 'false' },
              on: { click: () => go(entry.route), mousemove: () => setActive(index) },
            },
            h('span', { class: 'search-result__icon', attrs: { 'aria-hidden': 'true' } }, icon(iconForEntity(entry.hit.entityType), 16)),
            h(
              'span',
              { class: 'search-result__body' },
              h('span', { class: 'search-result__title', text: entry.hit.title || '—' }),
              h('span', { class: 'search-result__sub', text: entry.hit.subtitle || entry.hit.snippet || '' }),
            ),
            h('span', { class: 'search-result__type', text: ENTITY_LABELS[entry.hit.entityType] ?? 'سجل' }),
          ),
        ),
      );
      status.textContent = `${formatNumber(hits.length)} نتيجة`;
      setActive(-1);
    };

    const search = debounce(async (value: string) => {
      if (!value.trim()) {
        renderIdle();
        return;
      }
      results.replaceChildren(h('div', { class: 'route-loading' }, h('span', { class: 'spinner' }), h('span', { text: 'جارٍ البحث…' })));
      try {
        const page = await workspace.db.searchPage(value.trim(), { limit: 20 });
        const resolved: Array<{ hit: SearchHit; route: string }> = [];
        for (const hit of page.hits) {
          const route = await routeForHit(workspace, services, hit);
          if (route) resolved.push({ hit, route });
        }
        renderHits(resolved);
      } catch {
        results.replaceChildren(h('div', { class: 'notice notice--danger', style: 'margin:12px' }, icon('alert', 18), h('span', { text: 'تعذر تنفيذ البحث الآن.' })));
      }
    }, 160);

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (entries.length > 0) setActive((active + 1) % entries.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (entries.length > 0) setActive(active <= 0 ? entries.length - 1 : active - 1);
        return;
      }
      if (event.key === 'Enter') {
        const entry = entries[active];
        if (entry) {
          event.preventDefault();
          go(entry.route);
        }
      }
    };

    input.addEventListener('input', () => {
      void search(input.value);
    });
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    document.body.dataset.scrollLocked = 'true';
    if (initialQuery) input.value = initialQuery;
    input.focus();
    if (initialQuery) void search(initialQuery);
    else renderIdle();
    searchOpen = () => {
      input.focus();
      input.select();
    };
  }

  // --------------------------------------------------------------- counts
  async function refreshNavigationCounts(): Promise<void> {
    try {
      const { db, lookups } = workspace;
      const openTaskIds = ['open', 'in_progress', 'waiting', 'blocked']
        .map((code) => lookups.id('task_status', code))
        .filter((value): value is string => Boolean(value));
      const chargeStatusIds = ['open', 'partial']
        .map((code) => lookups.id('charge_status', code))
        .filter((value): value is string => Boolean(value));
      const [dueTasks, hearings, charges] = await Promise.all([
        db.query('task', {
          filters: [
            { column: 'due_at', op: 'notNull' },
            { column: 'due_at', op: 'lte', value: new Date().toISOString() },
            ...(openTaskIds.length > 0 ? [{ column: 'status_id', op: 'in' as const, value: openTaskIds }] : []),
          ],
          limit: 0,
        }),
        db.query('hearing', {
          filters: [
            { column: 'scheduled_at', op: 'gte', value: startOfTodayIso() },
            { column: 'scheduled_at', op: 'lte', value: endOfTodayIso() },
          ],
          limit: 0,
        }),
        chargeStatusIds.length > 0
          ? db.query('financial_charge', { filters: [{ column: 'status_id', op: 'in', value: chargeStatusIds }], limit: 0 })
          : Promise.resolve({ total: 0, rows: [] }),
      ]);
      counts.tasks = dueTasks.total;
      counts.hearings = hearings.total;
      counts.finance = charges.total;
      updateCount('/tasks', counts.tasks);
      updateCount('/today', counts.hearings);
      updateCount('/finance', counts.finance);
    } catch {
      // Counts are a convenience; navigation must never fail because of them.
    }
  }

  function updateCount(path: string, value: number): void {
    for (const node of [countNodes.get(path), badgeNodes.get(path)]) {
      if (!node) continue;
      node.textContent = value > 0 ? formatNumber(value) : '';
      node.hidden = value <= 0;
    }
  }

  return {
    root,
    outlet,
    refreshNavigationCounts,
    setOnline,
    announce,
    setDrawer,
    openSearch,
  };
}

function navigateTo(hash: string): void {
  window.location.hash = hash.startsWith('#') ? hash.slice(1) : hash;
}

// ---------------------------------------------------------------------------
// Anchored menu (topbar quick actions, profile menu)
// ---------------------------------------------------------------------------
interface MenuAction {
  label: string;
  iconName: string;
  onSelect: () => void;
}

function openAnchoredMenu(anchor: HTMLElement, actions: MenuAction[], onClose: () => void): void {
  document.querySelector<HTMLElement>('.menu[data-floating]')?.remove();
  const menu = h('div', {
    class: 'menu',
    dataset: { floating: 'true' },
    attrs: { role: 'menu' },
  });
  for (const action of actions) {
    menu.appendChild(
      h(
        'button',
        {
          class: 'menu__item',
          type: 'button',
          attrs: { role: 'menuitem' },
          on: {
            click: () => {
              close();
              action.onSelect();
            },
          },
        },
        icon(action.iconName, 16),
        h('span', { text: action.label }),
      ),
    );
  }
  const rect = anchor.getBoundingClientRect();
  menu.style.insetBlockStart = `${Math.round(rect.bottom + 6)}px`;
  menu.style.insetInlineEnd = `${Math.round(window.innerWidth - rect.right)}px`;
  menu.style.insetInlineStart = 'auto';
  const close = (): void => {
    menu.remove();
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    onClose();
    anchor.focus();
  };
  const onOutside = (event: MouseEvent): void => {
    if (!menu.contains(event.target as Node) && !anchor.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  document.body.appendChild(menu);
  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  window.requestAnimationFrame(() => menu.querySelector<HTMLButtonElement>('.menu__item')?.focus());
}

// ---------------------------------------------------------------------------
// Route synchronisation
// ---------------------------------------------------------------------------
export function syncShellForRoute(shell: AppShell, path: string, workspace: Workspace): void {
  const root = shell.root;
  const active = activeNavPath(path);
  for (const link of root.querySelectorAll<HTMLAnchorElement>('.nav-link')) {
    const href = link.getAttribute('href') ?? '';
    const isActive = href === `#${active}`;
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const bottom of root.querySelectorAll<HTMLAnchorElement>('[data-bottom-nav]')) {
    if (bottom.dataset.bottomNav === active) bottom.setAttribute('aria-current', 'page');
    else bottom.removeAttribute('aria-current');
  }
  const title = navTitle(path);
  const sectionNode = root.querySelector('.topbar-section');
  const pageNode = root.querySelector('.topbar-page');
  if (sectionNode) sectionNode.textContent = title.section;
  if (pageNode) pageNode.textContent = title.title;
  const officeNode = root.querySelector('.sidebar-office__name');
  if (officeNode) officeNode.textContent = workspace.officeName();
  if (window.matchMedia('(max-width: 1023px)').matches) {
    const drawerOpen = document.body.dataset.drawer === 'open';
    if (drawerOpen) {
      document.body.dataset.drawer = 'closed';
      root.querySelector('.sidebar')?.classList.remove('is-open');
      root.querySelector('.sidebar-backdrop')?.classList.remove('is-open');
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function startOfTodayIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

function endOfTodayIso(): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return end.toISOString();
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0)).join('') || 'م';
}

function storageSummary(workspace: Workspace): string {
  const usage = workspace.storage.usage;
  if (usage === null) return 'IndexedDB · بيانات على الجهاز';
  const mb = usage / (1024 * 1024);
  return `تخزين محلي · ${mb < 1 ? 'أقل من 1' : mb.toFixed(1)} م.ب`;
}

function storageFill(workspace: Workspace): number {
  const { usage, quota } = workspace.storage;
  if (!usage || !quota) return 3;
  return Math.min(100, Math.max(2, Math.round((usage / quota) * 100)));
}

function iconForEntity(type: string): string {
  switch (type) {
    case 'party':
      return 'user';
    case 'client_profile':
      return 'users';
    case 'case_file':
      return 'folder';
    case 'legal_case':
      return 'scale';
    case 'hearing':
      return 'gavel';
    case 'judgment':
      return 'stamp';
    case 'task':
      return 'tasks';
    case 'document':
      return 'document';
    case 'contract':
      return 'briefcase';
    case 'power_of_attorney':
      return 'stamp';
    case 'appointment':
      return 'calendar-clock';
    case 'financial_charge':
      return 'wallet';
    default:
      return 'info';
  }
}

export async function routeForHit(workspace: Workspace, services: Services, hit: SearchHit): Promise<string | null> {
  switch (hit.entityType) {
    case 'party': {
      const client = await workspace.db.get('client_profile', hit.entityId);
      return client ? `#/clients/${hit.entityId}` : `#/parties/${hit.entityId}`;
    }
    case 'client_profile':
      return `#/clients/${hit.entityId}`;
    case 'case_file':
      return `#/files/${hit.entityId}`;
    case 'legal_case':
      return `#/cases/${hit.entityId}`;
    case 'hearing':
      return `#/hearings?focus=${hit.entityId}`;
    case 'task':
      return `#/tasks?focus=${hit.entityId}`;
    case 'document':
      return `#/documents?focus=${hit.entityId}`;
    case 'contract':
      return `#/contracts?focus=${hit.entityId}`;
    case 'power_of_attorney':
      return `#/contracts?tab=poa&focus=${hit.entityId}`;
    case 'appointment':
      return `#/appointments?focus=${hit.entityId}`;
    case 'financial_charge':
      return `#/finance?tab=charges&focus=${hit.entityId}`;
    case 'judgment':
      return `#/judgments?focus=${hit.entityId}`;
    default:
      void services;
      return null;
  }
}

export function confirmDelete(options: {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onDone: () => void;
}): void {
  confirmDialog({
    title: options.title,
    message: options.message,
    ...(options.detail ? { detail: options.detail } : {}),
    confirmLabel: options.confirmLabel ?? 'نعم، احذف',
    danger: true,
    onConfirm: async () => {
      await options.onConfirm();
      options.onDone();
    },
  });
}

export function attachOnlineListeners(shell: AppShell): () => void {
  const update = (): void => shell.setOnline(navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}

export function clearOutlet(outlet: HTMLElement): void {
  clear(outlet);
}

