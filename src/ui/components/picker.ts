import { debounce, h } from '../dom.ts';
import { icon } from '../icons.ts';

export interface PickerOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

export interface PickerConfig {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  help?: string;
  search: (query: string) => Promise<PickerOption[]>;
  initial?: PickerOption | null;
  allowClear?: boolean;
  emptyText?: string;
  minChars?: number;
  createLabel?: string;
  onCreate?: (query: string, controls: { close: () => void; clear: () => void }) => void;
}

export interface PickerHandle {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly hidden: HTMLInputElement;
  getValue(): string;
  setValue(option: PickerOption | null): void;
  focus(): void;
}

let pickerSequence = 0;

export function entityPicker(config: PickerConfig): PickerHandle {
  pickerSequence += 1;
  const id = `picker-${config.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-${pickerSequence}`;
  const listId = `${id}-list`;
  let selected: PickerOption | null = config.initial ?? null;
  let options: PickerOption[] = [];
  let activeIndex = -1;
  let request = 0;
  let expanded = false;

  const hidden = h('input', { type: 'hidden', name: config.name, value: selected?.value ?? '' });
  const input = h('input', {
    class: 'input picker__input',
    type: 'text',
    id,
    role: 'combobox',
    autocomplete: 'off',
    spellcheck: 'false',
    attrs: {
      'aria-autocomplete': 'list',
      'aria-expanded': 'false',
      'aria-controls': listId,
      'aria-label': config.label,
      placeholder: config.placeholder ?? 'ابحث بالاسم أو الرقم…',
    },
  });
  input.value = selected?.label ?? '';

  const spinner = h('span', { class: 'spinner spinner--sm picker__spinner', attrs: { 'aria-hidden': 'true', hidden: 'hidden' } });
  const clearButton = h('button', {
    class: 'icon-btn icon-btn--sm picker__clear',
    type: 'button',
    attrs: { 'aria-label': 'مسح الاختيار' },
    on: {
      mousedown: (event) => event.preventDefault(),
      click: () => {
        selected = null;
        hidden.value = '';
        input.value = '';
        options = [];
        renderMenu();
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
      },
    },
  }, icon('close', 14));
  clearButton.hidden = !selected;

  const status = h('span', { class: 'visually-hidden', attrs: { 'aria-live': 'polite' } });
  const menu = h('div', { class: 'picker__menu', id: listId, attrs: { role: 'listbox', 'aria-label': config.label }, hidden: 'hidden' });
  const control = h('div', { class: 'picker__control' },
    h('span', { class: 'picker__search-icon', attrs: { 'aria-hidden': 'true' } }, icon('search', 16)),
    input,
    spinner,
    clearButton,
  );
  const root = h('div', { class: 'field picker', dataset: { field: config.name } },
    h('label', { class: 'field__label', attrs: { for: id } },
      h('span', { text: config.label }),
      config.required ? h('span', { class: 'field__required', attrs: { 'aria-hidden': 'true' }, text: ' *' }) : null,
    ),
    control,
    menu,
    status,
    config.help ? h('p', { class: 'field__help', text: config.help }) : null,
    h('p', { class: 'field__error', attrs: { 'aria-live': 'polite' } }),
  );

  function setExpanded(value: boolean): void {
    expanded = value;
    menu.hidden = !value;
    input.setAttribute('aria-expanded', value ? 'true' : 'false');
    root.classList.toggle('is-open', value);
  }

  function selectOption(option: PickerOption): void {
    selected = option;
    hidden.value = option.value;
    input.value = option.label;
    clearButton.hidden = false;
    setExpanded(false);
    input.setAttribute('aria-invalid', 'false');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    status.textContent = `تم اختيار ${option.label}`;
  }

  function setActive(index: number): void {
    activeIndex = index;
    const items = menu.querySelectorAll<HTMLElement>('[role="option"]');
    items.forEach((item, itemIndex) => {
      item.classList.toggle('is-active', itemIndex === index);
      item.setAttribute('aria-selected', itemIndex === index ? 'true' : 'false');
    });
    const active = items[index];
    if (active) {
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function renderMenu(): void {
    menu.replaceChildren();
    if (options.length === 0) {
      const query = input.value.trim();
      const empty = h('div', { class: 'picker__empty' },
        h('span', { text: config.emptyText ?? 'لا توجد نتائج مطابقة.' }),
      );
      if (config.createLabel && query) {
        empty.appendChild(h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          on: {
            mousedown: (event) => event.preventDefault(),
            click: () => config.onCreate?.(query, { close: () => setExpanded(false), clear: () => { input.value = ''; } }),
          },
        }, icon('plus', 15), h('span', { text: config.createLabel })));
      }
      menu.appendChild(empty);
      setActive(-1);
      return;
    }
    options.forEach((option, index) => {
      const item = h('button', {
        type: 'button',
        class: 'picker__option',
        id: `${listId}-opt-${index}`,
        attrs: { role: 'option', 'aria-selected': 'false' },
        dataset: { index: String(index) },
        on: {
          mousedown: (event) => event.preventDefault(),
          click: () => selectOption(option),
          mouseenter: () => setActive(index),
        },
      },
      h('span', { class: 'picker__option-main' },
        h('span', { class: 'picker__option-label', text: option.label }),
        option.description ? h('span', { class: 'picker__option-desc', text: option.description }) : null,
      ),
      option.badge ? h('span', { class: 'badge badge--quiet', text: option.badge }) : null,
      );
      menu.appendChild(item);
    });
    setActive(-1);
  }

  async function search(query: string): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length < (config.minChars ?? 0)) {
      options = [];
      renderMenu();
      return;
    }
    const current = ++request;
    spinner.hidden = false;
    try {
      const results = await config.search(trimmed);
      if (current !== request) return;
      options = results;
      renderMenu();
      setExpanded(true);
    } catch {
      if (current !== request) return;
      options = [];
      renderMenu();
      menu.appendChild(h('p', { class: 'picker__empty', text: 'تعذر البحث الآن. حاول مرة أخرى.' }));
    } finally {
      if (current === request) spinner.hidden = true;
    }
  }

  const debouncedSearch = debounce((value: string) => void search(value), 180);

  input.addEventListener('focus', () => {
    if (selected) input.select();
    if (!expanded) {
      void search(input.value === selected?.label ? '' : input.value);
    }
  });
  input.addEventListener('input', () => {
    if (selected && input.value !== selected.label) {
      selected = null;
      hidden.value = '';
      clearButton.hidden = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    debouncedSearch(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!expanded) void search(input.value);
      else setActive(Math.min(options.length - 1, activeIndex + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (event.key === 'Enter') {
      if (expanded && activeIndex >= 0 && options[activeIndex]) {
        event.preventDefault();
        selectOption(options[activeIndex]!);
      }
    } else if (event.key === 'Escape') {
      if (expanded) {
        event.preventDefault();
        setExpanded(false);
      }
    } else if (event.key === 'Tab') {
      setExpanded(false);
    }
  });
  input.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (!root.contains(document.activeElement)) {
        setExpanded(false);
        if (selected) input.value = selected.label;
      }
    }, 120);
  });

  const observer = new MutationObserver(() => {
    if (root.closest('[hidden]')) setExpanded(false);
  });
  observer.observe(root, { attributes: true, attributeFilter: ['hidden'] });

  return {
    root,
    input,
    hidden,
    getValue: () => hidden.value,
    setValue: (option) => {
      if (option) selectOption(option);
      else {
        selected = null;
        hidden.value = '';
        input.value = '';
        clearButton.hidden = true;
      }
    },
    focus: () => input.focus(),
  };
}
