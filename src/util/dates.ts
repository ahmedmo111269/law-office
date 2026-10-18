import { ValidationError } from '../errors.ts';

/**
 * Date/time conventions (identical for every engine adapter):
 *  - Calendar-only dates: `YYYY-MM-DD` (Gregorian, no timezone semantics).
 *  - Timestamps: UTC ISO-8601 with milliseconds, e.g. `2026-10-18T12:00:00.000Z`.
 *  - Local wall-clock calendar fields (e.g. a hearing in Cairo) are stored as a
 *    timestamp plus an explicit IANA timezone, never as a bare local string.
 *  - Money is stored as integer minor units; float arithmetic is never used.
 *  - Booleans are stored as INTEGER 0/1 with CHECK constraints at the adapter.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function assertIsoDate(value: unknown, field: string): string {
  if (!isIsoDate(value)) {
    throw new ValidationError(`${field} must be a valid YYYY-MM-DD date`, { field });
  }
  return value;
}

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = TIMESTAMP_RE.exec(value);
  if (!match) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time);
}

/** Normalises any accepted timestamp to canonical UTC ISO-8601 (milliseconds). */
export function toCanonicalTimestamp(value: string | Date): string {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else {
    if (!isIsoTimestamp(value)) {
      throw new ValidationError('timestamp must be ISO-8601', { valueType: typeof value });
    }
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('invalid timestamp');
  }
  const iso = date.toISOString();
  // toISOString() always yields millisecond precision; enforce it even if the
  // platform changes.
  return iso.replace(/\.(\d{3})\d*Z$/, '.$1Z');
}

export function assertIsoTimestamp(value: unknown, field: string): string {
  if (!isIsoTimestamp(value)) {
    throw new ValidationError(`${field} must be an ISO-8601 timestamp`, { field });
  }
  return toCanonicalTimestamp(value);
}

/** Today's calendar date in a specific IANA timezone (not the host timezone). */
export function todayInTimeZone(timeZone: string, clock: { now(): Date }): string {
  assertTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(clock.now());
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function assertTimeZone(value: unknown, field = 'timezone'): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${field} must be an IANA timezone`, { field });
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    throw new ValidationError(`${field} is not a known IANA timezone`, { field });
  }
}

export function addDaysToIsoDate(date: string, days: number): string {
  const [year, month, day] = assertIsoDate(date, 'date').split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}
