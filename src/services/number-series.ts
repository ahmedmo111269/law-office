import type { DatabaseAdapter } from '../db/adapter.ts';
import { ValidationError } from '../errors.ts';
import type { Clock } from '../util/clock.ts';
import { todayInTimeZone, toCanonicalTimestamp } from '../util/dates.ts';

export interface NextNumberOptions {
  /** Scope the counter (for example a year) so a series can reset. Default ''. */
  readonly scope?: string;
  /** Extra placeholders, e.g. `{device}` or `{year}`. */
  readonly variables?: Readonly<Record<string, string | number>>;
  /** Overrides the stored format for this call only. */
  readonly format?: string;
  readonly padding?: number;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface IssuedNumber {
  readonly key: string;
  readonly scope: string;
  readonly value: number;
  readonly formatted: string;
}

const PLACEHOLDER_RE = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
const SERIES_KEY_RE = /^[a-z][a-z0-9_.-]{0,63}$/;

/**
 * Visible-number generator. These numbers are display-only: identity is the
 * UUID. The default file/contract formats include the device short code, so
 * two offline devices cannot mint the same visible number.
 *
 * The counter is incremented inside a transaction; SQLite's write lock makes
 * this atomic even with multiple processes using the same file.
 */
export class NumberSeriesService {
  private readonly db: DatabaseAdapter;
  private readonly clock: Clock;

  constructor(db: DatabaseAdapter, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  next(key: string, options: NextNumberOptions = {}): IssuedNumber {
    if (!SERIES_KEY_RE.test(key)) {
      throw new ValidationError('invalid number series key', { key });
    }
    const scope = options.scope ?? '';
    const now = toCanonicalTimestamp(this.clock.now());

    return this.db.transaction((tx) => {
      let row = tx.get<{
        prefix: string;
        suffix: string;
        format: string;
        padding: number;
        next_value: number;
      }>(
        `SELECT prefix, suffix, format, padding, next_value
         FROM number_series WHERE key = ? AND scope = ?`,
        [key, scope],
      );

      if (!row) {
        const format = options.format ?? '{prefix}{value}{suffix}';
        const padding = options.padding ?? 4;
        tx.run(
          `INSERT INTO number_series
            (key, scope, prefix, suffix, format, padding, next_value, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            key,
            scope,
            options.prefix ?? '',
            options.suffix ?? '',
            format,
            padding,
            now,
          ],
        );
        row = {
          prefix: options.prefix ?? '',
          suffix: options.suffix ?? '',
          format,
          padding,
          next_value: 1,
        };
      }

      const value = row.next_value;
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new ValidationError('number series is exhausted or corrupted', { key, scope });
      }
      tx.run(
        `UPDATE number_series SET next_value = next_value + 1, updated_at = ?
         WHERE key = ? AND scope = ?`,
        [now, key, scope],
      );

      const padding = options.padding ?? row.padding;
      const formattedValue = String(value).padStart(padding, '0');
      const deviceCode = this.currentDeviceShortCode(tx);
      const year = this.currentYear(tx);
      const variables: Record<string, string | number> = {
        key,
        scope,
        prefix: options.prefix ?? row.prefix,
        suffix: options.suffix ?? row.suffix,
        value: formattedValue,
        raw_value: value,
        device: deviceCode,
        year,
        ...options.variables,
      };
      const template = options.format ?? row.format;

      return {
        key,
        scope,
        value,
        formatted: formatTemplate(template, variables),
      };
    });
  }

  peek(key: string, scope = ''): { nextValue: number; format: string; padding: number } | undefined {
    const row = this.db.get<{ next_value: number; format: string; padding: number }>(
      'SELECT next_value, format, padding FROM number_series WHERE key = ? AND scope = ?',
      [key, scope],
    );
    return row
      ? { nextValue: row.next_value, format: row.format, padding: row.padding }
      : undefined;
  }

  private currentDeviceShortCode(tx: DatabaseAdapter): string {
    const row = tx.get<{ short_code: string }>(
      `SELECT d.short_code
       FROM app_meta m JOIN local_device d ON d.id = m.value
       WHERE m.key = 'local.device_id'`,
    );
    return row?.short_code ?? '';
  }

  private currentYear(tx: DatabaseAdapter): string {
    const setting = tx.get<{ value: string }>(
      "SELECT value FROM office_setting WHERE key = 'locale.timezone' AND deleted_at IS NULL",
    );
    const timezone = setting?.value ?? 'Africa/Cairo';
    try {
      return todayInTimeZone(timezone, this.clock).slice(0, 4);
    } catch {
      return todayInTimeZone('UTC', this.clock).slice(0, 4);
    }
  }
}

export function formatTemplate(
  template: string,
  variables: Readonly<Record<string, string | number>>,
): string {
  return template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    if (!(name in variables)) {
      throw new ValidationError(`unknown number format placeholder {${name}}`, { placeholder: name });
    }
    return String(variables[name]);
  });
}
