import type { PortableLawOffice } from '../../portable/portable-database.ts';
import type { TableState } from '../components/table-state.ts';

export type ThemePreference = 'light' | 'dark' | 'system';
export type DensityPreference = 'compact' | 'comfortable';
export type DigitPreference = 'western' | 'eastern';

export interface PreferenceValues {
  'ui.theme': ThemePreference;
  'ui.fontScale': string;
  'ui.density': DensityPreference;
  'ui.digits': DigitPreference;
  'ui.reduceMotion': 'auto' | 'reduce';
  'ui.startPage': string;
  'ui.focusMode': string;
  'ui.lastRoute': string;
  'ui.onboardingDismissed': string;
  'ui.lastBackupAt': string;
}

const DEFAULTS: PreferenceValues = {
  'ui.theme': 'system',
  'ui.fontScale': '100',
  'ui.density': 'comfortable',
  'ui.digits': 'western',
  'ui.reduceMotion': 'auto',
  'ui.startPage': 'today',
  'ui.focusMode': '0',
  'ui.lastRoute': '',
  'ui.onboardingDismissed': '0',
  'ui.lastBackupAt': '',
};

type Listener = () => void;

/**
 * Per-device UI preferences. Stored only in `device_setting` (the approved
 * per-device table), never in localStorage and never mixed with office data.
 */
export class Preferences {
  private readonly db: PortableLawOffice;
  private readonly values = new Map<string, string>();
  private readonly listeners = new Set<Listener>();
  private media: MediaQueryList | null = null;

  constructor(db: PortableLawOffice) {
    this.db = db;
  }

  async load(): Promise<void> {
    const rows = await this.db.listDeviceSettings();
    for (const row of rows) {
      if (typeof row.key === 'string' && typeof row.value === 'string') {
        this.values.set(row.key, row.value);
      }
    }
    this.apply();
  }

  get<K extends keyof PreferenceValues>(key: K): PreferenceValues[K] {
    return (this.values.get(key) as PreferenceValues[K] | undefined) ?? DEFAULTS[key];
  }

  getString(key: string, fallback = ''): string {
    return this.values.get(key) ?? fallback;
  }

  getNumber(key: string, fallback: number): number {
    const parsed = Number(this.values.get(key));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  getJson<T>(key: string, fallback: T): T {
    const raw = this.values.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async set(key: string, value: string | number | boolean, type: 'string' | 'number' | 'boolean' | 'json' = 'string'): Promise<void> {
    await this.db.setDeviceSetting(key, value, type);
    this.values.set(key, String(value));
    this.apply();
    this.emit();
  }

  async remove(key: string): Promise<void> {
    await this.db.removeDeviceSetting(key);
    this.values.delete(key);
    this.apply();
    this.emit();
  }

  async reset(keys: readonly string[]): Promise<void> {
    for (const key of keys) await this.db.removeDeviceSetting(key);
    for (const key of keys) this.values.delete(key);
    this.apply();
    this.emit();
  }

  tableState(tableId: string, fallback: TableState): TableState {
    return this.getJson<TableState>(`ui.table.${tableId}`, fallback);
  }

  async saveTableState(tableId: string, state: TableState): Promise<void> {
    await this.set(`ui.table.${tableId}`, JSON.stringify(state), 'json');
  }

  async resetTableState(tableId: string): Promise<void> {
    await this.remove(`ui.table.${tableId}`);
  }

  getViews<T>(tableId: string): T[] {
    return this.getJson<T[]>(`ui.views.${tableId}`, []);
  }

  async saveViews<T>(tableId: string, views: T[]): Promise<void> {
    await this.set(`ui.views.${tableId}`, JSON.stringify(views), 'json');
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resolvedTheme(): 'light' | 'dark' {
    const preference = this.get('ui.theme');
    if (preference !== 'system') return preference;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  apply(): void {
    const root = document.documentElement;
    root.dataset.theme = this.resolvedTheme();
    root.dataset.density = this.get('ui.density');
    root.dataset.motion = this.get('ui.reduceMotion');
    root.style.setProperty('--user-font-scale', String(Math.min(125, Math.max(85, this.getNumber('ui.fontScale', 100))) / 100));
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute('content', this.resolvedTheme() === 'dark' ? '#101816' : '#f5f2ea');
    }
    if (!this.media) {
      this.media = window.matchMedia('(prefers-color-scheme: dark)');
      this.media.addEventListener('change', () => {
        if (this.get('ui.theme') === 'system') {
          this.apply();
          this.emit();
        }
      });
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const PREFERENCE_DEFAULTS = DEFAULTS;
