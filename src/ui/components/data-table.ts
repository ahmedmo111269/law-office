import { clear, debounce, h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatNumber } from '../format.ts';
import { toastSuccess } from './toast.ts';
import { openMenu } from './menu.ts';
import { promptDialog } from './dialog.ts';
import { defaultTableState, PAGE_SIZES, type SavedTableView, type TableState } from './table-state.ts';
import { emptyState, loadingRows } from './page.ts';
import { onDataChanged } from '../events.ts';
import { registerOverlay } from '../overlays.ts';
import type { TableRequest, TableResult } from '../services/types.ts';
import type { Preferences } from '../state/preferences.ts';

export interface Column<Row> {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  /** Visible by default. Set false for secondary columns. */
  defaultHidden?: boolean;
  /** Sticky to the inline-start edge. */
  defaultPinned?: boolean;
  align?: 'start' | 'end';
  /** Cell renderer. Content is always inserted as text/nodes, never HTML. */
  render: (row: Row) => Child;
  /** Plain text used for card view, exports and accessible summaries. */
  text?: (row: Row) => string;
  /** Mobile card role: title is the card headline. */
  cardRole?: 'title' | 'meta' | 'detail';
  numeric?: boolean;
}

export interface TableFilterDefinition {
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value?: string;
}

export interface DataTableOptions<Row> {
  /** Stable id used for per-table preferences (device settings). */
  id: string;
  columns: readonly Column<Row>[];
  load: (request: TableRequest) => Promise<TableResult<Row>>;
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string | null;
  title: string;
  searchPlaceholder?: string;
  filters?: readonly TableFilterDefinition[];
  toolbar?: Child[];
  actions?: (row: Row) => Child[];
  bulkActions?: (rows: Row[], clear: () => void) => Child[];
  emptyTitle?: string;
  emptyText?: string;
  emptyIcon?: string;
  emptyActions?: Child[];
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  defaultPageSize?: number;
  /** Highlight and scroll to this row id after the first load. */
  focusRowId?: string | null;
  summary?: (total: number, rows: readonly Row[]) => string;
  onRowCount?: (total: number) => void;
  cardHint?: (row: Row) => string;
}

export interface DataTableHandle<Row> {
  readonly root: HTMLElement;
  reload(): Promise<void>;
  getRows(): Row[];
  setFilter(key: string, value: string): void;
}

export function dataTable<Row>(options: DataTableOptions<Row>, preferences: Preferences): DataTableHandle<Row> {
  const defaults = defaultTableState(
    options.columns.map((column) => column.key),
    options.defaultSort ?? null,
  );
  const persisted = preferences.tableState(options.id, defaults);
  let state: TableState = normalizeState(persisted, options.columns, defaults);
  if (!persisted.pageSize) state = { ...state, pageSize: options.defaultPageSize ?? 25 };

  let page = 1;
  let rows: Row[] = [];
  let total = 0;
  let loading = true;
  let error: string | null = null;
  let selected = new Set<string>();
  let requestId = 0;
  let cardMode = window.matchMedia('(max-width: 640px)').matches;

  const tableHost = h('div', { class: 'table-shell' });
  const root = h('div', { class: 'stack', style: 'gap:12px' }, tableHost);
  const saveState = debounce(() => {
    void preferences.saveTableState(options.id, state);
  }, 300);

  // A dialog elsewhere on the page may have written a row this table shows.
  // Reload once the burst of writes settles, and detach with the view.
  let pendingRefresh: number | null = null;
  const unsubscribe = onDataChanged(() => {
    if (!root.isConnected) {
      unsubscribe();
      return;
    }
    if (pendingRefresh !== null) window.clearTimeout(pendingRefresh);
    pendingRefresh = window.setTimeout(() => {
      pendingRefresh = null;
      void reload();
    }, 60);
  });

  function updateState(patch: Partial<TableState>, refresh = true): void {
    state = { ...state, ...patch };
    saveState();
    if (refresh) {
      if ('pageSize' in patch || 'sort' in patch || 'search' in patch || 'filters' in patch) page = 1;
      void reload();
    } else {
      render();
    }
  }

  async function reload(): Promise<void> {
    const token = ++requestId;
    loading = rows.length === 0;
    error = null;
    render();
    try {
      const request: TableRequest = {
        page,
        pageSize: state.pageSize,
        search: state.search ?? '',
        filters: state.filters ?? {},
        ...(state.sort ? { sortKey: state.sort.key, sortDir: state.sort.dir } : {}),
      };
      const result = await options.load(request);
      if (token !== requestId) return;
      rows = result.rows;
      total = result.total;
      loading = false;
      if (rows.length === 0 && page > 1 && total > 0) {
        page = Math.max(1, Math.ceil(total / state.pageSize));
        await reload();
        return;
      }
      const visibleKeys = new Set(rows.map((row) => options.rowKey(row)));
      for (const key of [...selected]) if (!visibleKeys.has(key)) selected.delete(key);
      options.onRowCount?.(total);
      render();
      if (options.focusRowId && page === 1 && !options.focusRowId.startsWith('__')) {
        window.setTimeout(() => {
          const node = tableHost.querySelector<HTMLElement>(`[data-row-id="${cssEscape(options.focusRowId!)}"]`);
          node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          node?.classList.add('is-focused');
        }, 120);
      }
    } catch (caught) {
      if (token !== requestId) return;
      loading = false;
      error = caught instanceof Error ? caught.message : 'تعذر تحميل البيانات';
      render();
    }
  }

  // --- شريط الأدوات ------------------------------------------------------
  const searchInput = h('input', {
    class: 'input',
    type: 'search',
    placeholder: options.searchPlaceholder ?? 'ابحث…',
    value: state.search ?? '',
    attrs: { 'aria-label': `بحث في ${options.title}` },
  });
  const searchClear = h(
    'button',
    {
      class: 'icon-btn icon-btn--sm table-toolbar__clear',
      type: 'button',
      attrs: { 'aria-label': 'مسح البحث' },
      hidden: !state.search,
      on: {
        click: () => {
          searchInput.value = '';
          updateState({ search: '' });
          searchInput.focus();
        },
      },
    },
    icon('close', 15),
  );
  const debouncedSearch = debounce((value: string) => updateState({ search: value }), 260);
  searchInput.addEventListener('input', () => {
    searchClear.hidden = !searchInput.value;
    debouncedSearch(searchInput.value.trim());
  });

  const toolbar = h(
    'div',
    { class: 'table-toolbar', attrs: { role: 'toolbar', 'aria-label': `أدوات ${options.title}` } },
    h('div', { class: 'table-toolbar__search' }, icon('search', 16), searchInput, searchClear),
    ...(options.toolbar ?? []),
    h(
      'div',
      { class: 'table-toolbar__actions' },
      options.filters && options.filters.length > 0 ? filterBuilder() : null,
      savedViewsButton(),
      columnsButton(),
      densityButton(),
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          title: 'تحديث',
          attrs: { 'aria-label': 'تحديث البيانات' },
          on: { click: () => void reload() },
        },
        icon('refresh', 18),
      ),
    ),
  );

  function filterBuilder(): HTMLElement {
    const wrap = h('div', { class: 'row-wrap', style: 'gap:4px' });
    for (const filter of options.filters ?? []) {
      const current = state.filters?.[filter.key] ?? filter.value ?? '';
      const select = h(
        'select',
        {
          class: 'input select',
          style: 'min-block-size:34px;font-size:var(--text-xs);inline-size:auto;padding-block:2px',
          attrs: { 'aria-label': filter.label },
          on: {
            change: () => {
              const filters = { ...(state.filters ?? {}) };
              if (select.value) filters[filter.key] = select.value;
              else delete filters[filter.key];
              updateState({ filters });
            },
          },
        },
        h('option', { value: '', text: filter.label }),
        ...filter.options.map((option) =>
          h('option', { value: option.value, text: option.label, ...(option.value === current ? { selected: true } : {}) }),
        ),
      );
      select.value = current;
      wrap.appendChild(select);
    }
    return wrap;
  }

  function savedViewsButton(): HTMLElement {
    return h(
      'button',
      {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        attrs: { 'aria-haspopup': 'menu' },
        on: {
          click: (event) => {
            const views = preferences.getViews<SavedTableView>(options.id);
            openMenu((event.currentTarget as HTMLElement).getBoundingClientRect(), [
              { label: 'طرق العرض المحفوظة', heading: true },
              ...(views.length === 0
                ? [{ label: 'لا توجد طرق عرض محفوظة بعد', disabled: true }]
                : views.map((view) => ({
                    label: view.name,
                    iconName: 'layers',
                    onClick: () => {
                      state = normalizeState(
                        { ...view.state, ...(state.search ? { search: state.search } : {}) },
                        options.columns,
                        defaults,
                      );
                      page = 1;
                      void reload();
                      toastSuccess(`تم تطبيق طريقة العرض «${view.name}»`);
                    },
                  }))),
              { separator: true },
              {
                label: 'حفظ الحالة الحالية كطريقة عرض…',
                iconName: 'save',
                onClick: () => {
                  promptDialog({
                    title: 'حفظ طريقة عرض',
                    label: 'اسم طريقة العرض',
                    placeholder: 'مثال: مستحقات هذا الشهر',
                    confirmLabel: 'حفظ',
                    onSubmit: async (name) => {
                      const trimmed = name.trim();
                      if (!trimmed) return;
                      const next: SavedTableView[] = [
                        ...preferences.getViews<SavedTableView>(options.id),
                        {
                          id: `view-${Date.now().toString(36)}`,
                          name: trimmed,
                          state: { ...state },
                          createdAt: new Date().toISOString(),
                        },
                      ];
                      await preferences.saveViews(options.id, next);
                      toastSuccess('تم حفظ طريقة العرض على هذا الجهاز');
                    },
                  });
                },
              },
              {
                label: 'حذف كل طرق العرض',
                iconName: 'trash',
                danger: true,
                disabled: views.length === 0,
                onClick: () => {
                  void preferences.saveViews(options.id, []);
                  toastSuccess('تم حذف طرق العرض المحفوظة');
                },
              },
            ]);
          },
        },
      },
      icon('layers', 16),
      h('span', { class: 'topbar-hide-mobile', text: 'طرق العرض' }),
    );
  }

  function columnsButton(): HTMLElement {
    return h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: 'أعمدة الجدول',
        attrs: { 'aria-label': 'إعداد الأعمدة', 'aria-haspopup': 'dialog' },
        on: { click: () => openColumnPanel() },
      },
      icon('columns', 18),
    );
  }

  function densityButton(): HTMLElement {
    return h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: 'كثافة الجدول',
        attrs: { 'aria-label': `كثافة العرض الحالية: ${state.density === 'compact' ? 'مضغوطة' : 'مريحة'}` },
        on: {
          click: () => {
            const next = state.density === 'compact' ? 'comfortable' : 'compact';
            document.documentElement.dataset.density = next;
            updateState({ density: next }, false);
          },
        },
      },
      icon(state.density === 'compact' ? 'grid' : 'list', 18),
    );
  }

  function openColumnPanel(): void {
    let working = { ...state, order: [...state.order], hidden: [...state.hidden], pinned: [...state.pinned], widths: { ...state.widths } };
    const list = h('div');
    const backdrop = h('div', { class: 'panel-backdrop' });
    let dragKey: string | null = null;

    const renderList = (): void => {
      clear(list);
      for (const key of working.order) {
        const column = options.columns.find((candidate) => candidate.key === key);
        if (!column) continue;
        const visible = !working.hidden.includes(key);
        const pinned = working.pinned.includes(key);
        const row = h(
          'div',
          {
            class: 'column-row',
            dataset: { key },
            attrs: { draggable: 'true' },
            on: {
              dragstart: (event) => {
                dragKey = key;
                row.classList.add('is-dragging');
                (event as DragEvent).dataTransfer?.setData('text/plain', key);
              },
              dragend: () => {
                dragKey = null;
                row.classList.remove('is-dragging');
                list.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
              },
              dragover: (event) => {
                event.preventDefault();
                row.classList.add('is-drop-target');
              },
              dragleave: () => row.classList.remove('is-drop-target'),
              drop: (event) => {
                event.preventDefault();
                row.classList.remove('is-drop-target');
                const source = dragKey ?? (event as DragEvent).dataTransfer?.getData('text/plain') ?? null;
                if (!source || source === key) return;
                const order = working.order.filter((candidate) => candidate !== source);
                const targetIndex = order.indexOf(key);
                order.splice(targetIndex, 0, source);
                working = { ...working, order };
                renderList();
              },
            },
          },
          h('span', { class: 'column-row__handle', attrs: { 'aria-hidden': 'true' } }, icon('drag', 17)),
          h('input', {
            type: 'checkbox',
            class: 'checkbox',
            checked: visible,
            attrs: { 'aria-label': `إظهار عمود ${column.label}` },
            on: {
              change: (event) => {
                const checked = (event.target as HTMLInputElement).checked;
                working.hidden = checked
                  ? working.hidden.filter((candidate) => candidate !== key)
                  : [...working.hidden, key];
                renderList();
              },
            },
          }),
          h('span', { class: 'column-row__label', text: column.label }),
          h(
            'button',
            {
              class: `icon-btn icon-btn--sm${pinned ? ' is-active' : ''}`,
              type: 'button',
              title: pinned ? 'إلغاء تثبيت العمود' : 'تثبيت العمود في البداية',
              attrs: { 'aria-pressed': String(pinned), 'aria-label': `تثبيت عمود ${column.label}` },
              on: {
                click: () => {
                  working.pinned = pinned ? working.pinned.filter((candidate) => candidate !== key) : [...working.pinned, key];
                  renderList();
                },
              },
            },
            icon('pin', 15),
          ),
          h(
            'div',
            { class: 'row', style: 'gap:2px' },
            h('button', {
              class: 'icon-btn icon-btn--sm',
              type: 'button',
              attrs: { 'aria-label': 'تحريك لأعلى' },
              on: {
                click: () => {
                  const order = [...working.order];
                  const index = order.indexOf(key);
                  if (index > 0) {
                    [order[index - 1], order[index]] = [order[index]!, order[index - 1]!];
                    working = { ...working, order };
                    renderList();
                  }
                },
              },
            }, icon('chevron-up', 14)),
            h('button', {
              class: 'icon-btn icon-btn--sm',
              type: 'button',
              attrs: { 'aria-label': 'تحريك لأسفل' },
              on: {
                click: () => {
                  const order = [...working.order];
                  const index = order.indexOf(key);
                  if (index < order.length - 1) {
                    [order[index + 1], order[index]] = [order[index]!, order[index + 1]!];
                    working = { ...working, order };
                    renderList();
                  }
                },
              },
            }, icon('chevron-down', 14)),
          ),
        );
        list.appendChild(row);
      }
    };
    renderList();

    const panel = h(
      'aside',
      { class: 'panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'إعداد أعمدة الجدول', tabindex: '-1' } },
      h(
        'header',
        { class: 'panel__head' },
        icon('columns', 20),
        h('h2', { class: 'panel__title', text: 'الأعمدة' }),
        h('button', {
          class: 'icon-btn',
          type: 'button',
          attrs: { 'aria-label': 'إغلاق' },
          on: { click: () => close() },
        }, icon('close', 18)),
      ),
      h(
        'div',
        { class: 'panel__body' },
        h('p', { class: 'field__help', style: 'margin-block-end:12px' }, 'اسحب الصف أو استخدم الأسهم لإعادة الترتيب. التثبيت يُبقي العمود ظاهرًا عند التمرير أفقيًا.'),
        list,
        h(
          'div',
          { class: 'panel-section', style: 'margin-block-start:20px' },
          h('p', { class: 'panel-section__title', text: 'حجم الصفوف' }),
          h(
            'div',
            { class: 'segmented row', style: 'gap:4px;flex-wrap:wrap' },
            ...(['compact', 'comfortable'] as const).map((density) =>
              h('button', {
                class: `chip chip--button${working.density === density ? ' chip--active' : ''}`,
                type: 'button',
                text: density === 'compact' ? 'مضغوط' : 'مريح',
                on: {
                  click: (event) => {
                    working = { ...working, density };
                    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('chip--active'));
                    (event.currentTarget as HTMLElement).classList.add('chip--active');
                  },
                },
              }),
            ),
          ),
          h('p', { class: 'field__help', style: 'margin-block-start:8px' }, 'يُحفظ الاختيار لهذا الجدول على هذا الجهاز.'),
        ),
      ),
      h(
        'footer',
        { class: 'panel__foot' },
        h('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          text: 'إعادة الضبط',
          on: {
            click: () => {
              state = { ...defaults, pageSize: state.pageSize };
              void preferences.resetTableState(options.id);
              close();
              void reload();
            },
          },
        }),
        h('button', {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          text: 'تطبيق',
          on: {
            click: () => {
              state = { ...state, ...working };
              saveState();
              close();
              render();
            },
          },
        }),
      ),
    );
    panel.style.zIndex = '80';
    backdrop.style.zIndex = '79';
    const releaseOverlay = registerOverlay(() => close());
    const close = (): void => {
      releaseOverlay();
      panel.remove();
      backdrop.remove();
      document.body.dataset.scrollLocked = 'false';
    };
    backdrop.addEventListener('click', close);
    document.body.append(backdrop, panel);
    document.body.dataset.scrollLocked = 'true';
    window.requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      panel.classList.add('is-open');
      // Focus the panel container: a focused close button reads as a pressed
      // primary action, and the first control here is a checkbox column list.
      panel.focus();
    });
  }

  // --- الجدول -----------------------------------------------------------
  function visibleColumns(): Column<Row>[] {
    const ordered = state.order
      .map((key) => options.columns.find((column) => column.key === key))
      .filter((column): column is Column<Row> => Boolean(column))
      .filter((column) => !state.hidden.includes(column.key));
    for (const column of options.columns) {
      if (!ordered.includes(column) && !state.hidden.includes(column.key)) ordered.push(column);
    }
    const pinned = ordered.filter((column) => state.pinned.includes(column.key));
    const rest = ordered.filter((column) => !state.pinned.includes(column.key));
    return [...pinned, ...rest];
  }

  function widthOf(column: Column<Row>): number {
    return state.widths[column.key] ?? column.width ?? 150;
  }

  function renderHead(columns: Column<Row>[]): HTMLTableSectionElement {
    const head = h('thead');
    const tr = h('tr');
    const allSelected = rows.length > 0 && rows.every((row) => selected.has(options.rowKey(row)));
    const someSelected = rows.some((row) => selected.has(options.rowKey(row)));
    tr.appendChild(
      h(
        'th',
        { class: 'col-check', attrs: { scope: 'col' } },
        h('input', {
          type: 'checkbox',
          class: 'checkbox',
          checked: allSelected,
          attrs: { 'aria-label': 'تحديد كل الصفوف في الصفحة' },
          on: {
            change: (event) => {
              const checked = (event.target as HTMLInputElement).checked;
              selected = checked ? new Set(rows.map((row) => options.rowKey(row))) : new Set();
              render();
            },
          },
        }),
      ),
    );
    if (someSelected) {
      const box = tr.querySelector<HTMLInputElement>('.col-check .checkbox');
      if (box && !allSelected) box.indeterminate = true;
    }
    let pinOffset = 0;
    for (const column of columns) {
      const sortIndex = state.sort?.key === column.key ? 1 : -1;
      const pinned = state.pinned.includes(column.key);
      const width = widthOf(column);
      const th = h(
        'th',
        {
          style: `inline-size:${width}px;min-inline-size:${Math.max(64, column.minWidth ?? 90)}px`,
          ...(pinned ? { dataset: { pin: 'start' } } : {}),
          attrs: { scope: 'col' },
        },
      );
      if (pinned) {
        th.style.insetInlineStart = `${pinOffset}px`;
        pinOffset += width;
      }
      const label = h('span', { class: 'table-head-cell__label' }, h('span', { text: column.label }));
      const headCell = h('div', { class: 'table-head-cell' }, label);
      if (column.sortable) {
        const sortButton = h(
          'button',
          {
            class: 'table-sort',
            type: 'button',
            dataset: { sort: state.sort?.key === column.key ? state.sort.dir : '' },
            attrs: {
              'aria-label': `ترتيب حسب ${column.label}`,
              'aria-pressed': String(state.sort?.key === column.key),
            },
            on: {
              click: (event) => {
                event.stopPropagation();
                const dir =
                  state.sort?.key === column.key ? (state.sort.dir === 'asc' ? 'desc' : 'asc') : 'asc';
                updateState({ sort: { key: column.key, dir } });
              },
            },
          },
          icon(state.sort?.key === column.key && state.sort.dir === 'desc' ? 'arrow-down' : 'arrow-up', 14),
        );
        headCell.appendChild(sortButton);
        label.addEventListener('click', () => sortButton.click());
        void sortIndex;
      }
      th.appendChild(headCell);
      const resizer = h('span', {
        class: 'table-resizer',
        attrs: { role: 'separator', 'aria-orientation': 'vertical', 'aria-label': `تغيير عرض عمود ${column.label}`, tabindex: '0' },
        on: {
          pointerdown: (event) => {
            const startX = (event as PointerEvent).clientX;
            const startWidth = widthOf(column);
            const min = column.minWidth ?? 70;
            const max = column.maxWidth ?? 520;
            const target = resizer as HTMLElement;
            target.setPointerCapture((event as PointerEvent).pointerId);
            const move = (moveEvent: PointerEvent): void => {
              const delta = moveEvent.clientX - startX;
              const next = Math.min(max, Math.max(min, startWidth - delta));
              th.style.inlineSize = `${next}px`;
              th.dataset.pendingWidth = String(next);
            };
            const up = (): void => {
              target.removeEventListener('pointermove', move);
              target.removeEventListener('pointerup', up);
              const pending = Number(th.dataset.pendingWidth ?? 0);
              if (pending) {
                state = { ...state, widths: { ...state.widths, [column.key]: pending } };
                saveState();
                render();
              }
            };
            target.addEventListener('pointermove', move);
            target.addEventListener('pointerup', up);
          },
          keydown: (event) => {
            const keyboard = event as KeyboardEvent;
            if (keyboard.key !== 'ArrowLeft' && keyboard.key !== 'ArrowRight') return;
            keyboard.preventDefault();
            const delta = keyboard.key === 'ArrowRight' ? 16 : -16;
            const next = Math.min(column.maxWidth ?? 520, Math.max(column.minWidth ?? 70, widthOf(column) + delta));
            state = { ...state, widths: { ...state.widths, [column.key]: next } };
            saveState();
            render();
          },
        },
      });
      th.appendChild(resizer);
      tr.appendChild(th);
    }
    if (options.actions) {
      tr.appendChild(h('th', { class: 'col-actions', attrs: { scope: 'col' } }, h('span', { class: 'visually-hidden', text: 'إجراءات' })));
    }
    head.appendChild(tr);
    return head;
  }

  function renderTable(): HTMLElement {
    const columns = visibleColumns();
    const scroll = h('div', {
      class: 'table-scroll',
      attrs: { tabindex: '0', role: 'region', 'aria-label': `${options.title} — جدول قابل للتمرير` },
    });
    const table = h('table', { class: 'data-table' });
    table.style.minInlineSize = `${columns.reduce((sum, column) => sum + widthOf(column), 0) + 44 + (options.actions ? 84 : 0)}px`;
    table.appendChild(renderHead(columns));
    const body = h('tbody');
    for (const row of rows) {
      const key = options.rowKey(row);
      const href = options.rowHref?.(row) ?? null;
      const tr = h('tr', {
        dataset: { rowId: key },
        attrs: {
          'aria-selected': selected.has(key) ? 'true' : 'false',
          ...(href ? { 'data-href': href } : {}),
        },
        on: {
          click: (event) => {
            if ((event.target as Element).closest('button, a, input, [data-no-row-nav]')) return;
            if (href) window.location.hash = href.replace(/^#/, '');
          },
          keydown: (event) => {
            const keyboard = event as KeyboardEvent;
            if (keyboard.key === 'Enter' && href) window.location.hash = href.replace(/^#/, '');
          },
        },
      });
      tr.appendChild(
        h(
          'td',
          { class: 'col-check' },
          h('input', {
            type: 'checkbox',
            class: 'checkbox',
            checked: selected.has(key),
            attrs: { 'aria-label': `تحديد ${options.columns.find((column) => column.cardRole === 'title')?.text?.(row) ?? key}` },
            on: {
              change: (event) => {
                event.stopPropagation();
                if ((event.target as HTMLInputElement).checked) selected.add(key);
                else selected.delete(key);
                render();
              },
            },
          }),
        ),
      );
      let offset = 0;
      for (const column of columns) {
        const pinned = state.pinned.includes(column.key);
        const td = h(
          'td',
          {
            ...(pinned ? { dataset: { pin: 'start' }, style: `inset-inline-start:${offset}px` } : {}),
            ...(column.numeric ? { dataset: { cell: 'num' } } : {}),
            style: column.align === 'end' ? 'text-align:end' : '',
          },
          column.render(row),
        );
        if (pinned) offset += widthOf(column);
        tr.appendChild(td);
      }
      if (options.actions) {
        tr.appendChild(h('td', { class: 'col-actions' }, h('div', { class: 'row', style: 'justify-content:flex-end;gap:2px' }, ...options.actions(row))));
      }
      body.appendChild(tr);
    }
    if (rows.length === 0) {
      const colspan = columns.length + 1 + (options.actions ? 1 : 0);
      body.appendChild(
        h(
          'tr',
          null,
          h(
            'td',
            { colspan: String(colspan), class: 'table-empty' },
            emptyState({
              iconName: options.emptyIcon ?? 'folder-open',
              title: options.emptyTitle ?? 'لا توجد سجلات بعد',
              text: options.emptyText ?? 'ابدأ بإضافة أول سجل، أو غيّر عوامل التصفية.',
              ...(options.emptyActions ? { actions: options.emptyActions } : {}),
            }),
          ),
        ),
      );
    }
    table.appendChild(body);
    scroll.appendChild(table);
    return scroll;
  }

  function renderCards(): HTMLElement {
    const titleColumn = options.columns.find((column) => column.cardRole === 'title') ?? options.columns[0];
    const metaColumns = options.columns.filter((column) => column.cardRole === 'meta');
    const detailColumns = options.columns.filter(
      (column) => column.cardRole === 'detail' || (!column.cardRole && column.key !== titleColumn?.key && !state.hidden.includes(column.key)),
    ).slice(0, 4);
    const list = h('div', { class: 'record-list' });
    for (const row of rows) {
      const key = options.rowKey(row);
      const href = options.rowHref?.(row) ?? null;
      const card = h(
        'article',
        { class: 'record-card', dataset: { rowId: key } },
        h(
          'div',
          { class: 'record-card__head' },
          h(
            'h2',
            { class: 'record-card__title' },
            href
              ? h('a', { href, text: titleColumn?.text?.(row) ?? titleColumn?.label ?? key })
              : titleColumn?.text?.(row) ?? titleColumn?.label,
          ),
          options.actions
            ? h('div', { class: 'row', style: 'gap:0' }, ...(options.actions?.(row) ?? []))
            : null,
        ),
        metaColumns.length > 0
          ? h('div', { class: 'record-card__meta' }, ...metaColumns.map((column) => column.render(row)))
          : null,
        ...detailColumns.map((column) =>
          h(
            'div',
            { class: 'record-card__row' },
            h('span', { class: 'text-3 text-xs', text: column.label }),
            h('span', { style: 'min-inline-size:0;overflow:hidden;text-overflow:ellipsis' }, column.render(row)),
          ),
        ),
      );
      list.appendChild(card);
    }
    if (rows.length === 0) {
      list.appendChild(
        emptyState({
          iconName: options.emptyIcon ?? 'folder-open',
          title: options.emptyTitle ?? 'لا توجد سجلات بعد',
          text: options.emptyText ?? 'ابدأ بإضافة أول سجل، أو غيّر عوامل التصفية.',
          ...(options.emptyActions ? { actions: options.emptyActions } : {}),
        }),
      );
    }
    return list;
  }

  function pager(): HTMLElement {
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    const buttons: Child[] = [];
    const pushPage = (value: number): void => {
      buttons.push(
        h('button', {
          class: 'pager__page',
          type: 'button',
          text: formatNumber(value),
          attrs: { 'aria-label': `الصفحة ${formatNumber(value)}`, ...(value === page ? { 'aria-current': 'page' } : {}) },
          on: {
            click: () => {
              page = value;
              void reload();
            },
          },
        }),
      );
    };
    const windowStart = Math.max(1, Math.min(page - 1, pages - 2));
    if (pages <= 5) {
      for (let index = 1; index <= pages; index += 1) pushPage(index);
    } else {
      pushPage(1);
      if (windowStart > 2) buttons.push(h('span', { class: 'pager__ellipsis', text: '…' }));
      for (let index = Math.max(2, windowStart); index <= Math.min(pages - 1, windowStart + 2); index += 1) pushPage(index);
      if (windowStart + 2 < pages - 1) buttons.push(h('span', { class: 'pager__ellipsis', text: '…' }));
      pushPage(pages);
    }
    return h(
      'div',
      { class: 'pager', attrs: { role: 'navigation', 'aria-label': 'ترقيم الصفحات' } },
      h('button', {
        class: 'icon-btn icon-btn--sm',
        type: 'button',
        attrs: { 'aria-label': 'الصفحة السابقة' },
        disabled: page <= 1,
        on: { click: () => { page -= 1; void reload(); } },
      }, icon('chevron-right', 16)),
      h('div', { class: 'pager__pages' }, ...buttons),
      h('button', {
        class: 'icon-btn icon-btn--sm',
        type: 'button',
        attrs: { 'aria-label': 'الصفحة التالية' },
        disabled: page >= pages,
        on: { click: () => { page += 1; void reload(); } },
      }, icon('chevron-left', 16)),
    );
  }

  function footer(): HTMLElement {
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    const start = total === 0 ? 0 : (page - 1) * state.pageSize + 1;
    const end = Math.min(total, (page - 1) * state.pageSize + rows.length);
    const summary = options.summary?.(total, rows) ?? `إجمالي ${formatNumber(total)} سجل`;
    const pageSizeSelect = h(
      'select',
      {
        class: 'input select',
        attrs: { 'aria-label': 'عدد السجلات في الصفحة' },
        on: {
          change: () => {
            updateState({ pageSize: Number(pageSizeSelect.value) });
          },
        },
      },
      ...PAGE_SIZES.map((size) => h('option', { value: String(size), text: `${formatNumber(size)} / صفحة`, ...(size === state.pageSize ? { selected: true } : {}) })),
    );
    pageSizeSelect.value = String(state.pageSize);
    return h(
      'div',
      { class: 'table-footer' },
      h('span', { class: 'num', text: `${formatNumber(start)}–${formatNumber(end)}` }),
      h('span', { text: `من ${formatNumber(total)}` }),
      h('span', { class: 'text-3', text: `· ${summary}` }),
      h('span', { class: 'text-3 num', text: `صفحة ${formatNumber(page)} / ${formatNumber(pages)}` }),
      h('label', { class: 'page-size' }, h('span', { text: 'لكل صفحة' }), pageSizeSelect),
      rows.length > 0 ? h('div', { class: 'view-switch', attrs: { role: 'group', 'aria-label': 'طريقة العرض' } },
        h('button', {
          class: 'view-switch__btn', type: 'button',
          attrs: { 'aria-pressed': String(!cardMode), 'aria-label': 'عرض جدول' },
          on: { click: () => { cardMode = false; render(); } },
        }, icon('list', 16)),
        h('button', {
          class: 'view-switch__btn', type: 'button',
          attrs: { 'aria-pressed': String(cardMode), 'aria-label': 'عرض بطاقات' },
          on: { click: () => { cardMode = true; render(); } },
        }, icon('grid', 16)),
      ) : null,
      pager(),
    );
  }

  function bulkBar(): HTMLElement | null {
    if (!options.bulkActions || selected.size === 0) return null;
    const selectedRows = rows.filter((row) => selected.has(options.rowKey(row)));
    return h(
      'div',
      { class: 'bulk-bar', attrs: { role: 'status' } },
      icon('check-square', 16),
      h('span', { class: 'bulk-bar__count', text: `تم تحديد ${formatNumber(selected.size)}` }),
      h('div', { class: 'bulk-bar__actions' }, ...options.bulkActions(selectedRows, () => { selected.clear(); render(); })),
      h('button', {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        text: 'إلغاء التحديد',
        on: { click: () => { selected.clear(); render(); } },
      }),
    );
  }

  function render(): void {
    const content: Child[] = [toolbar];
    const bar = bulkBar();
    if (bar) content.push(bar);
    if (loading) {
      content.push(loadingRows(6));
    } else if (error) {
      content.push(
        h(
          'div',
          { class: 'notice notice--danger', style: 'margin:16px' },
          icon('alert', 18),
          h(
            'div',
            null,
            h('p', { text: 'تعذر تحميل البيانات.' }),
            h('p', { text: error, style: 'font-size:var(--text-xs);opacity:.85' }),
            h('button', {
              class: 'btn btn--sm btn--outline', type: 'button', text: 'إعادة المحاولة',
              style: 'margin-block-start:8px',
              on: { click: () => void reload() },
            }),
          ),
        ),
      );
    } else if (cardMode) {
      content.push(renderCards());
    } else {
      content.push(renderTable());
    }
    if (!loading && !error) content.push(footer());
    tableHost.replaceChildren(...(content as Node[]));
  }

  const handle: DataTableHandle<Row> = {
    root,
    reload,
    getRows: () => rows,
    setFilter: (key: string, value: string) => {
      const filters = { ...(state.filters ?? {}) };
      if (value) filters[key] = value;
      else delete filters[key];
      updateState({ filters });
    },
  };

  void reload();
  return handle;
}

function normalizeState<Row>(persisted: TableState, columns: readonly Column<Row>[], defaults: TableState): TableState {
  const validKeys = new Set(columns.map((column) => column.key));
  const order = (Array.isArray(persisted.order) ? persisted.order : []).filter((key) => validKeys.has(key));
  for (const column of columns) if (!order.includes(column.key)) order.push(column.key);
  const hidden = (Array.isArray(persisted.hidden) ? persisted.hidden : []).filter((key) => validKeys.has(key));
  const pinned = (Array.isArray(persisted.pinned) ? persisted.pinned : []).filter((key) => validKeys.has(key) && !hidden.includes(key));
  const widths: Record<string, number> = {};
  for (const [key, value] of Object.entries(persisted.widths ?? {})) {
    if (validKeys.has(key) && typeof value === 'number' && value >= 60 && value <= 600) widths[key] = value;
  }
  const pageSize = PAGE_SIZES.includes(persisted.pageSize as (typeof PAGE_SIZES)[number]) ? persisted.pageSize : defaults.pageSize;
  const sort = persisted.sort && validKeys.has(persisted.sort.key) ? persisted.sort : defaults.sort;
  return {
    order,
    hidden,
    widths,
    pinned,
    pageSize,
    density: persisted.density === 'compact' ? 'compact' : 'comfortable',
    sort,
    ...(persisted.search ? { search: persisted.search } : {}),
    ...(persisted.filters ? { filters: persisted.filters } : {}),
  };
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
