import { NotFoundError, ValidationError } from '../errors.ts';
import { SEED_OFFICE_SETTINGS } from '../schema/v1/seed.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import { BaseRepository, type EntityRecord, type RepositoryDependencies } from './base-repository.ts';

export type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

export interface SettingRecord extends EntityRecord {
  key: string;
  value: string;
  value_type: SettingValueType;
  description: string | null;
}

const DEFAULTS = new Map(SEED_OFFICE_SETTINGS.map((setting) => [setting.key, setting]));
const KEY_RE = /^[a-z][a-z0-9_.-]{0,100}$/;

export class SettingsRepository {
  private readonly repo: BaseRepository<SettingRecord>;

  constructor(deps: RepositoryDependencies) {
    this.repo = new BaseRepository<SettingRecord>(deps, getSyncEntity('office_setting'));
  }

  get(key: string): SettingRecord | undefined {
    const row = this.repo.list({
      filters: [{ column: 'key', value: key }],
      limit: 1,
    })[0];
    return row;
  }

  require(key: string): SettingRecord {
    const row = this.get(key);
    if (!row) throw new NotFoundError('office_setting', key);
    return row;
  }

  getString(key: string, fallback?: string): string {
    const row = this.get(key);
    if (row) return row.value;
    if (fallback !== undefined) return fallback;
    const seeded = DEFAULTS.get(key);
    if (seeded) return seeded.value;
    throw new NotFoundError('office_setting', key);
  }

  getNumber(key: string, fallback?: number): number {
    const value = this.getString(key, fallback === undefined ? undefined : String(fallback));
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new ValidationError(`setting ${key} is not a number`);
    }
    return parsed;
  }

  getBoolean(key: string, fallback?: boolean): boolean {
    const raw = this.getString(key, fallback === undefined ? undefined : String(fallback)).toLowerCase();
    if (['true', '1', 'yes'].includes(raw)) return true;
    if (['false', '0', 'no'].includes(raw)) return false;
    throw new ValidationError(`setting ${key} is not a boolean`);
  }

  getJson<T>(key: string): T {
    const raw = this.getString(key);
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new ValidationError(`setting ${key} is not valid JSON`);
    }
  }

  listAll(): SettingRecord[] {
    return this.repo.list({ limit: 1000, orderBy: { column: 'key', direction: 'asc' } });
  }

  set(
    key: string,
    value: string | number | boolean,
    valueType?: SettingValueType,
    description?: string,
  ): SettingRecord {
    if (!KEY_RE.test(key)) throw new ValidationError('invalid setting key', { key });
    const type = valueType ?? DEFAULTS.get(key)?.valueType ?? 'string';
    const stringValue = this.normaliseValue(value, type);
    const existing = this.get(key);

    if (existing) {
      return this.repo.update(existing.id, {
        value: stringValue,
        value_type: type,
        ...(description === undefined ? {} : { description }),
      });
    }

    return this.repo.insert({
      key,
      value: stringValue,
      value_type: type,
      description: description ?? DEFAULTS.get(key)?.descriptionAr ?? null,
    });
  }

  private normaliseValue(value: string | number | boolean, type: SettingValueType): string {
    switch (type) {
      case 'number': {
        const numberValue = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numberValue)) {
          throw new ValidationError('setting value must be a number');
        }
        return String(numberValue);
      }
      case 'boolean': {
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        const text = String(value).toLowerCase();
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(text)) {
          throw new ValidationError('setting value must be boolean');
        }
        return ['true', '1', 'yes'].includes(text) ? 'true' : 'false';
      }
      case 'json': {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        try {
          JSON.parse(text);
        } catch {
          throw new ValidationError('setting value must be valid JSON');
        }
        return text;
      }
      case 'string':
      default:
        return String(value);
    }
  }
}

/** Per-device preferences: never synced, never leave this machine. */
export class DeviceSettingsRepository {
  private readonly deps: RepositoryDependencies;

  constructor(deps: RepositoryDependencies) {
    this.deps = deps;
  }

  get(key: string): string | undefined {
    return this.deps.db.get<{ value: string }>(
      'SELECT value FROM device_setting WHERE device_id = ? AND key = ?',
      [this.deps.deviceId, key],
    )?.value;
  }

  set(key: string, value: string, valueType: SettingValueType = 'string'): void {
    if (!KEY_RE.test(key)) throw new ValidationError('invalid device setting key', { key });
    const normalised =
      valueType === 'json'
        ? JSON.stringify(JSON.parse(value))
        : valueType === 'boolean'
          ? ['true', '1', 'yes'].includes(value.toLowerCase())
            ? 'true'
            : 'false'
          : valueType === 'number'
            ? String(Number(value))
            : value;
    this.deps.db.run(
      `INSERT INTO device_setting (device_id, key, value, value_type, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id, key) DO UPDATE SET
         value = excluded.value,
         value_type = excluded.value_type,
         updated_at = excluded.updated_at`,
      [
        this.deps.deviceId,
        key,
        normalised,
        valueType,
        new Date(this.deps.clock.now()).toISOString(),
      ],
    );
  }

  remove(key: string): void {
    this.deps.db.run('DELETE FROM device_setting WHERE device_id = ? AND key = ?', [
      this.deps.deviceId,
      key,
    ]);
  }

  all(): Array<{ key: string; value: string; value_type: SettingValueType }> {
    return this.deps.db.query(
      'SELECT key, value, value_type FROM device_setting WHERE device_id = ? ORDER BY key',
      [this.deps.deviceId],
    );
  }
}
