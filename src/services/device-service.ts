import type { DatabaseAdapter, SqlRow } from '../db/adapter.ts';
import { AppError, NotFoundError, ValidationError } from '../errors.ts';
import type { Clock } from '../util/clock.ts';
import { toCanonicalTimestamp } from '../util/dates.ts';
import { stableStringify } from '../util/stable.ts';
import { newId } from '../util/uuid.ts';

export type DevicePlatform =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'android'
  | 'ios'
  | 'web'
  | 'system'
  | 'test'
  | 'unknown';

export interface DeviceRecord extends SqlRow {
  readonly id: string;
  readonly label: string;
  readonly platform: DevicePlatform;
  readonly short_code: string;
  readonly app_version: string | null;
  readonly timezone: string;
  readonly is_local: number;
  readonly is_active: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly revision: number;
  readonly sync_status: string;
}

export interface RegisterDeviceOptions {
  readonly label?: string;
  readonly platform?: DevicePlatform;
  /**
   * Optional human-chosen code. Defaults to a value derived from the device
   * UUID so two devices that both start at "first run" cannot receive the same
   * prefix for display numbers.
   */
  readonly shortCode?: string;
}

const SHORT_CODE_RE = /^[A-Z0-9]{3,8}$/;

export function detectPlatform(): DevicePlatform {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'android':
      return 'android';
    default:
      return 'unknown';
  }
}

/**
 * Local device identity.
 *
 * Every database belongs to exactly one local device. The identifier is a UUID
 * and is also written to the sync outbox so other devices can learn about it.
 * A backup restored onto new hardware must call `rotateIdentity`, otherwise two
 * machines would write as the same device.
 */
export class DeviceService {
  private readonly db: DatabaseAdapter;
  private readonly clock: Clock;
  private readonly appVersion: string;

  constructor(db: DatabaseAdapter, clock: Clock, appVersion: string) {
    this.db = db;
    this.clock = clock;
    this.appVersion = appVersion;
  }

  private now(): string {
    return toCanonicalTimestamp(this.clock.now());
  }

  private meta(key: string): string | undefined {
    return this.db.get<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key])?.value;
  }

  private setMeta(tx: DatabaseAdapter, key: string, value: string): void {
    tx.run(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, this.now()],
    );
  }

  current(): DeviceRecord {
    const id = this.meta('local.device_id');
    if (!id) throw new NotFoundError('local_device', 'local.device_id');
    const row = this.db.get<DeviceRecord>('SELECT * FROM local_device WHERE id = ?', [id]);
    if (!row) {
      throw new AppError('INVALID_STATE', 'local device registration points to a missing row', {
        deviceId: id,
      });
    }
    return row;
  }

  currentId(): string {
    return this.current().id;
  }

  ensureRegistered(options: RegisterDeviceOptions = {}): DeviceRecord {
    const existingId = this.meta('local.device_id');
    if (existingId) {
      const row = this.db.get<DeviceRecord>('SELECT * FROM local_device WHERE id = ?', [existingId]);
      if (!row) {
        throw new AppError('INVALID_STATE', 'local.device_id references a missing device');
      }
      return row;
    }

    // Repair a half-completed registration: a device row exists but app_meta
    // was lost. Do not create a second local identity.
    const locals = this.db.query<DeviceRecord>(
      'SELECT * FROM local_device WHERE is_local = 1 AND deleted_at IS NULL',
    );
    if (locals.length === 1) {
      this.setMeta(this.db, 'local.device_id', locals[0]!.id);
      return locals[0]!;
    }
    if (locals.length > 1) {
      throw new AppError('INVALID_STATE', 'multiple local devices are registered');
    }

    const label = options.label?.trim() || 'جهاز محلي';
    const platform = options.platform ?? detectPlatform();
    const timezone =
      this.db.get<{ value: string }>(
        "SELECT value FROM office_setting WHERE key = 'locale.timezone' AND deleted_at IS NULL",
      )?.value ?? 'Africa/Cairo';

    return this.db.transaction((tx) => {
      const id = newId();
      const shortCode = this.resolveShortCode(tx, id, options.shortCode);
      const now = this.now();
      tx.run(
        `INSERT INTO local_device
          (id, label, platform, short_code, app_version, timezone, is_local, is_active,
           notes, created_at, updated_at, deleted_at, origin_device_id, revision,
           sync_status, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, NULL, ?, ?, NULL, ?, 1, 'pending', NULL)`,
        [id, label, platform, shortCode, this.appVersion, timezone, now, now, id],
      );
      this.enqueueDeviceOutbox(tx, id, 'insert', [
        'id',
        'label',
        'platform',
        'short_code',
        'app_version',
        'timezone',
        'is_local',
        'is_active',
      ]);
      this.setMeta(tx, 'local.device_id', id);
      this.setMeta(tx, 'local.device_created_at', now);
      this.setMeta(tx, 'local.app_version', this.appVersion);
      this.setMeta(tx, 'setup.device_registered_at', now);
      this.setMeta(tx, 'setup.office_configured', this.meta('setup.office_configured') ?? '0');

      tx.run(
        `INSERT INTO audit_log
          (id, occurred_at, actor_device_id, action, entity_type, entity_id,
           summary, changes_json, correlation_id)
         VALUES (?, ?, ?, 'setup', 'device', ?, 'registered local device', NULL, NULL)`,
        [newId(), toCanonicalTimestamp(this.clock.now()), id, id],
      );

      return tx.get<DeviceRecord>('SELECT * FROM local_device WHERE id = ?', [id])!;
    });
  }

  /**
   * Must be used when a database backup is restored onto different hardware.
   * The old device row is kept (inactive) for audit/sync history; a new local
   * identity is created and advertised.
   */
  rotateIdentity(reason: string): DeviceRecord {
    if (!reason.trim()) throw new ValidationError('reason is required');
    const old = this.current();

    return this.db.transaction((tx) => {
      const now = this.now();
      const newDeviceId = newId();
      const shortCode = this.resolveShortCode(tx, newDeviceId, undefined);

      tx.run(
        `UPDATE local_device
         SET is_local = 0, is_active = 0, updated_at = ?, revision = revision + 1,
             sync_status = 'pending'
         WHERE id = ?`,
        [now, old.id],
      );
      this.enqueueDeviceOutbox(tx, old.id, 'update', ['is_local', 'is_active'], newDeviceId);

      tx.run(
        `INSERT INTO local_device
          (id, label, platform, short_code, app_version, timezone, is_local, is_active,
           notes, created_at, updated_at, deleted_at, origin_device_id, revision,
           sync_status, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, NULL, ?, 1, 'pending', NULL)`,
        [
          newDeviceId,
          old.label,
          old.platform,
          shortCode,
          this.appVersion,
          old.timezone,
          `هوية جهاز جديدة بعد استعادة نسخة احتياطية: ${reason.trim()}`,
          now,
          now,
          newDeviceId,
        ],
      );
      this.enqueueDeviceOutbox(
        tx,
        newDeviceId,
        'insert',
        [
          'id',
          'label',
          'platform',
          'short_code',
          'app_version',
          'timezone',
          'is_local',
          'is_active',
        ],
        newDeviceId,
      );

      this.setMeta(tx, 'local.device_id', newDeviceId);
      this.setMeta(tx, 'local.device_created_at', now);
      this.setMeta(tx, 'local.app_version', this.appVersion);

      tx.run(
        `INSERT INTO audit_log
          (id, occurred_at, actor_device_id, action, entity_type, entity_id,
           summary, changes_json, correlation_id)
         VALUES (?, ?, ?, 'identity_rotate', 'device', ?, ?, ?, NULL)`,
        [
          newId(),
          now,
          newDeviceId,
          newDeviceId,
          'rotated local device identity',
          stableStringify({ oldDeviceId: old.id, reason: reason.trim() }),
        ],
      );

      return tx.get<DeviceRecord>('SELECT * FROM local_device WHERE id = ?', [newDeviceId])!;
    });
  }

  listKnown(limit = 100): DeviceRecord[] {
    return this.db.query<DeviceRecord>(
      'SELECT * FROM local_device ORDER BY is_local DESC, created_at ASC LIMIT ?',
      [Math.max(1, Math.min(1000, limit))],
    );
  }

  private resolveShortCode(
    tx: DatabaseAdapter,
    deviceId: string,
    requested: string | undefined,
  ): string {
    if (requested !== undefined) {
      const code = requested.trim().toUpperCase();
      if (!SHORT_CODE_RE.test(code)) {
        throw new ValidationError('device short code must be 3-8 letters or digits');
      }
      if (tx.get('SELECT id FROM local_device WHERE short_code = ?', [code])) {
        throw new ValidationError('device short code is already used on this device');
      }
      return code;
    }
    const compact = deviceId.replace(/-/g, '').toUpperCase();
    for (const length of [6, 8, 10, 12]) {
      const candidate = compact.slice(0, length);
      if (!tx.get('SELECT id FROM local_device WHERE short_code = ?', [candidate])) {
        return candidate;
      }
    }
    throw new AppError('INVALID_STATE', 'could not derive a unique device short code');
  }

  private enqueueDeviceOutbox(
    tx: DatabaseAdapter,
    deviceId: string,
    operation: 'insert' | 'update',
    changedFields: readonly string[],
    actorDeviceId: string = deviceId,
  ): void {
    const row = tx.get<SqlRow>('SELECT * FROM local_device WHERE id = ?', [deviceId]);
    if (!row) throw new AppError('INVALID_STATE', 'device row missing while queuing sync change');
    const sequence = tx.get<{ next: number }>(
      'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM sync_outbox',
    )?.next ?? 1;
    tx.run(
      `INSERT INTO sync_outbox
        (id, sequence, entity_type, entity_id, operation, payload_json, changed_fields_json,
         origin_device_id, created_at, state, attempt_count, last_attempt_at, last_error, sent_at)
       VALUES (?, ?, 'device', ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL)`,
      [
        newId(),
        sequence,
        deviceId,
        operation,
        stableStringify(row),
        stableStringify([...changedFields].sort()),
        actorDeviceId,
        this.now(),
      ],
    );
  }
}
