import { AppError } from '../../errors.ts';
import { toUiError } from '../errors.ts';
import {
  openBrowserDatabase,
  indexedDbAvailable,
  type BrowserDatabase,
} from '../../browser/browser-database.ts';
import type { PortableLawOffice } from '../../portable/portable-database.ts';
import type { EngineRow } from '../../portable/store.ts';
import { configureFormatting } from '../format.ts';
import { Preferences } from './preferences.ts';
import { Lookups } from './lookups.ts';

export const APP_NAME = 'مِداد';
export const APP_VERSION = '0.3.0';

export interface StorageStatus {
  readonly persisted: boolean | null;
  readonly usage: number | null;
  readonly quota: number | null;
  readonly supported: boolean;
}

export interface OfficeSettings {
  readonly timezone: string;
  readonly dateFormat: string;
  readonly language: string;
  readonly backupReminderDays: number;
  readonly defaultCurrency: string;
  readonly defaultAppointmentMinutes: number;
}

type Listener = () => void;

/**
 * The single browser workspace. Opens the real IndexedDB engine through
 * `openBrowserDatabase` and keeps reference data + preferences in memory for
 * the session. No business data is copied to localStorage.
 */
export class Workspace {
  readonly handle: BrowserDatabase;
  readonly db: PortableLawOffice;
  readonly preferences: Preferences;
  lookups!: Lookups;
  profile: EngineRow;
  settings: EngineRow[];
  storage: StorageStatus;
  readonly startedAt = Date.now();
  private readonly listeners = new Set<Listener>();
  private persistRequested = false;

  private constructor(
    handle: BrowserDatabase,
    profile: EngineRow,
    settings: EngineRow[],
    storage: StorageStatus,
  ) {
    this.handle = handle;
    this.db = handle.db;
    this.profile = profile;
    this.settings = settings;
    this.storage = storage;
    this.preferences = new Preferences(this.db);
  }

  static async open(
    onProgress?: (message: string) => void,
  ): Promise<Workspace> {
    if (!indexedDbAvailable()) {
      throw new Error('INDEXEDDB_UNAVAILABLE');
    }
    // A real v1→v2 index rebuild can exceed 20 seconds on a large office.
    // Report committed batches/blocked tabs rather than timing out healthy work.
    const handle = await openBrowserDatabase({
      name: 'law-office',
      appVersion: APP_VERSION,
      deviceLabel: deviceLabel(),
      timezone: 'Africa/Cairo',
      platform: 'web',
      ...(onProgress ? { onProgress } : {}),
    });
    const profileRows = await handle.db.query('office_profile', {
      limit: 1,
      includeDeleted: false,
    });
    const settingsPage = await handle.db.query('office_setting', {
      limit: 100,
      orderBy: [{ column: 'key', direction: 'asc' }],
    });
    const storage = await readStorage();
    const workspace = new Workspace(
      handle,
      profileRows.rows[0] ?? {
        id: '',
        name: 'مكتب المحاماة',
        is_configured: 0,
      },
      settingsPage.rows,
      storage,
    );
    await workspace.preferences.load();
    workspace.lookups = await Lookups.load(handle.db);
    workspace.applyFormatting();
    void workspace.requestPersistence();
    return workspace;
  }

  static openFailed(error: unknown): string {
    if (error instanceof Error && error.message === 'INDEXEDDB_UNAVAILABLE') {
      return 'هذا المتصفح لا يوفر IndexedDB. جرّب متصفحًا حديثًا، أو اخرج من وضع التصفح الخاص.';
    }
    if (
      error instanceof AppError &&
      [
        'MIGRATION_CHECKSUM_MISMATCH',
        'MIGRATION_FAILED',
        'SCHEMA_TOO_NEW',
      ].includes(error.code)
    )
      return toUiError(error).message;
    return 'تعذر فتح قاعدة البيانات المحلية. تأكد من السماح للموقع بالتخزين ثم أعد المحاولة.';
  }

  officeName(): string {
    const name = this.profile.name;
    return typeof name === 'string' && name.trim() && name !== 'مكتب المحاماة'
      ? name.trim()
      : APP_NAME;
  }

  officeConfigured(): boolean {
    return Number(this.profile.is_configured ?? 0) === 1;
  }

  officeSettings(): OfficeSettings {
    const map = new Map(
      this.settings.map((row) => [String(row.key), String(row.value)]),
    );
    return {
      timezone: map.get('locale.timezone') ?? 'Africa/Cairo',
      dateFormat: map.get('locale.date_format') ?? 'dd/MM/yyyy',
      language: map.get('locale.language') ?? 'ar',
      backupReminderDays: Number(map.get('backup.reminder_days') ?? 7),
      defaultCurrency: map.get('finance.default_currency') ?? 'EGP',
      defaultAppointmentMinutes: Number(
        map.get('appointments.default_duration_minutes') ?? 30,
      ),
    };
  }

  applyFormatting(): void {
    const office = this.officeSettings();
    configureFormatting({
      digits: this.preferences.get('ui.digits'),
      timezone: office.timezone,
      dateFormat: office.dateFormat,
    });
  }

  async reloadProfile(): Promise<void> {
    const rows = await this.db.query('office_profile', { limit: 1 });
    if (rows.rows[0]) this.profile = rows.rows[0];
    const settingsPage = await this.db.query('office_setting', {
      limit: 100,
      orderBy: [{ column: 'key', direction: 'asc' }],
    });
    this.settings = settingsPage.rows;
    this.applyFormatting();
    this.emit();
  }

  async updateProfile(patch: Record<string, unknown>): Promise<void> {
    const id = String(this.profile.id);
    if (!id) throw new Error('office profile row is missing');
    this.profile = await this.db.update('office_profile', id, patch);
    this.emit();
  }

  async setOfficeSetting(key: string, value: string): Promise<void> {
    const row = this.settings.find((candidate) => candidate.key === key);
    if (row) {
      await this.db.update('office_setting', String(row.id), { value });
    } else {
      await this.db.insert('office_setting', {
        key,
        value,
        value_type: 'string',
        description: null,
      });
    }
    await this.reloadProfile();
  }

  async refreshStorage(): Promise<StorageStatus> {
    this.storage = await readStorage();
    return this.storage;
  }

  async requestPersistence(): Promise<void> {
    if (this.persistRequested) return;
    this.persistRequested = true;
    try {
      if (navigator.storage?.persist) {
        const persisted = await navigator.storage.persist();
        this.storage = { ...this.storage, persisted };
      }
    } catch {
      // Persistence is a browser hint, not a guarantee; settings show the truth.
    }
    this.emit();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}

function deviceLabel(): string {
  const agent = navigator.userAgent;
  if (agent.includes('Edg/')) return 'Edge على سطح المكتب';
  if (agent.includes('Chrome/'))
    return agent.includes('Mobile')
      ? 'Chrome على الهاتف'
      : 'Chrome على سطح المكتب';
  if (agent.includes('Safari/') && !agent.includes('Chrome'))
    return agent.includes('Mobile')
      ? 'Safari على الهاتف'
      : 'Safari على سطح المكتب';
  if (agent.includes('Firefox/')) return 'Firefox';
  return 'متصفح';
}

async function readStorage(): Promise<StorageStatus> {
  if (!navigator.storage?.estimate) {
    return { persisted: null, usage: null, quota: null, supported: false };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted
      ? await navigator.storage.persisted()
      : null;
    return {
      persisted,
      usage: typeof estimate.usage === 'number' ? estimate.usage : null,
      quota: typeof estimate.quota === 'number' ? estimate.quota : null,
      supported: true,
    };
  } catch {
    return { persisted: null, usage: null, quota: null, supported: false };
  }
}
