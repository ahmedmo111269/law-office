import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { formatNumber } from '../format.ts';
import { emptyState, notice, pageHeader } from '../components/page.ts';
import type { PageArgs } from '../app/context.ts';
import type { SearchHit } from '../../portable/portable-database.ts';
import { routeForHit } from '../app/shell.ts';

const TYPES: Array<{ value: string; label: string; icon: string }> = [
  { value: '', label: 'الكل', icon: 'search' },
  { value: 'case_file', label: 'الملفات', icon: 'folder' },
  { value: 'party', label: 'الأطراف', icon: 'user' },
  { value: 'legal_case', label: 'القضايا', icon: 'scale' },
  { value: 'hearing', label: 'الجلسات', icon: 'gavel' },
  { value: 'judgment', label: 'الأحكام', icon: 'stamp' },
  { value: 'task', label: 'المهام', icon: 'tasks' },
  { value: 'document', label: 'المستندات', icon: 'document' },
  { value: 'contract', label: 'العقود', icon: 'briefcase' },
  { value: 'appointment', label: 'المواعيد', icon: 'calendar-clock' },
  { value: 'financial_charge', label: 'المستحقات', icon: 'wallet' },
];

const ENTITY_LABELS: Record<string, string> = Object.fromEntries(TYPES.filter((type) => type.value).map((type) => [type.value, type.label]));

export async function renderSearch(context: PageArgs): Promise<HTMLElement> {
  const initialQuery = context.query.get('q') ?? '';
  const initialType = context.query.get('type') ?? '';
  let query = initialQuery;
  let type = TYPES.some((entry) => entry.value === initialType) ? initialType : '';
  let offset = 0;
  const limit = 20;
  let total = 0;
  let busy = false;

  const input = h('input', {
    class: 'input',
    type: 'search',
    value: initialQuery,
    placeholder: 'ابحث باسم أو رقم أو نص…',
    attrs: { 'aria-label': 'كلمة البحث', autocomplete: 'off' },
  });
  const summary = h('p', { class: 'text-sm text-3' });
  const results = h('div', { class: 'stack' });
  const moreHost = h('div', { class: 'row-wrap', style: 'justify-content:center' });

  const typeSwitch = h(
    'div',
    { class: 'row-wrap', style: 'gap:6px' },
    ...TYPES.map((entry) =>
      h('button', {
        class: `chip chip--button${entry.value === type ? ' chip--active' : ''}`,
        type: 'button',
        dataset: { type: entry.value },
        attrs: { 'aria-pressed': String(entry.value === type) },
        on: {
          click: () => {
            type = entry.value;
            typeSwitch.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
              const active = (chip.dataset.type ?? '') === type;
              chip.classList.toggle('chip--active', active);
              chip.setAttribute('aria-pressed', String(active));
            });
            void run(true);
          },
        },
      }, icon(entry.icon, 14), h('span', { text: entry.label })),
    ),
  );

  const run = async (reset: boolean): Promise<void> => {
    if (busy) return;
    busy = true;
    if (reset) {
      offset = 0;
      results.replaceChildren();
    }
    const trimmed = query.trim();
    if (!trimmed) {
      total = 0;
      summary.textContent = 'اكتب كلمة للبحث في كل بيانات المكتب.';
      results.replaceChildren(
        emptyState({
          iconName: 'search',
          title: 'ابحث في كل شيء',
          text: 'أسماء الأطراف، أرقام الملفات والقضايا، عناوين المستندات، وملاحظات السجلات. النتائج تُقرأ من فهرس البحث المحلي.',
        }),
      );
      moreHost.replaceChildren();
      busy = false;
      return;
    }
    moreHost.replaceChildren(h('span', { class: 'text-xs text-3' }, h('span', { class: 'spinner spinner--sm' }), ' جارٍ البحث…'));
    try {
      const page = await context.workspace.db.searchPage(trimmed, {
        limit,
        offset,
        ...(type ? { entityType: type } : {}),
      });
      total = page.total;
      summary.textContent = total === 0 ? `لا نتائج لـ «${trimmed}».` : `${formatNumber(total)} نتيجة لـ «${trimmed}» — تُعرض ${formatNumber(Math.min(offset + page.hits.length, total))}.`;
      if (reset && page.hits.length === 0) {
        results.replaceChildren(
          emptyState({
            iconName: 'search',
            title: 'لا نتائج مطابقة',
            text: 'جرّب كلمة أقصر، أو ابحث برقم ملف أو سنة، أو غيّر نوع السجل.',
            actions: [h('a', { class: 'btn btn--outline btn--sm', href: '#/files', text: 'تصفح الملفات' })],
          }),
        );
      }
      for (const hit of page.hits) {
        results.appendChild(await hitRow(context, hit));
      }
      offset += page.hits.length;
      moreHost.replaceChildren(
        offset < total
          ? h('button', { class: 'btn btn--outline', type: 'button', text: `عرض المزيد (${formatNumber(total - offset)} متبقٍ)`, on: { click: () => void run(false) } })
          : h('span', { class: 'text-xs text-3', text: 'نهاية النتائج' }),
      );
      if (context.shell.announce) context.shell.announce(`${total} نتيجة بحث`);
    } catch {
      moreHost.replaceChildren();
      results.replaceChildren(notice('danger', 'تعذر تنفيذ البحث. أعد المحاولة.', { iconName: 'alert' }));
    } finally {
      busy = false;
    }
  };

  let timer: number | null = null;
  input.addEventListener('input', () => {
    query = input.value;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.hash = `#/search?q=${encodeURIComponent(query.trim())}${type ? `&type=${type}` : ''}`;
      window.history.replaceState(null, '', url.toString());
      void run(true);
    }, 220);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void run(true);
    }
  });

  const page = h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'البحث',
      subtitle: 'بحث موحّد في كل سجلات المكتب، يعمل دون اتصال بالشبكة.',
      actions: [h('a', { class: 'btn btn--outline', href: '#/today' }, icon('today', 17), h('span', { text: 'مكتب اليوم' }))],
    }),
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'search-panel' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', attrs: { for: 'page-search' }, text: 'كلمة البحث' }), h('div', { class: 'row' }, input)),
        typeSwitch,
        summary,
      ),
    ),
    results,
    moreHost,
    notice('info', 'البحث يتجاهل السجلات المحذوفة (حذفًا ناعمًا)؛ يمكنك استعادتها من الأرشيف.', { iconName: 'info' }),
  );
  input.id = 'page-search';
  void run(true);
  return page;
}

async function hitRow(context: PageArgs, hit: SearchHit): Promise<HTMLElement> {
  const route = (await routeForHit(context.workspace, context.services, hit)) ?? '#/search';
  const typeEntry = TYPES.find((entry) => entry.value === hit.entityType);
  return h(
    'a',
    {
      class: 'card',
      href: route,
      style: 'text-decoration:none;color:inherit;display:flex;flex-direction:row;align-items:center;gap:12px;padding:12px 16px',
    },
    h('span', { class: 'avatar avatar--square', attrs: { 'aria-hidden': 'true' } }, icon(typeEntry?.icon ?? 'file', 18)),
    h(
      'div',
      { class: 'cell-main grow' },
      h('span', { class: 'cell-title', text: hit.title || '—' }),
      h('span', { class: 'cell-sub', text: hit.subtitle ?? hit.snippet ?? '' }),
    ),
    h('span', { class: 'badge badge--quiet', text: ENTITY_LABELS[hit.entityType] ?? 'سجل' }),
    icon('chevron-left', 16),
  );
}
