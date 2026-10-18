/**
 * Arabic display formatting for dates, times and money.
 *
 * Dates entered as calendar days (`YYYY-MM-DD`) are displayed as calendar
 * days, never shifted through a timezone. Timestamps are UTC in storage and
 * are displayed in the office timezone (Africa/Cairo by default). Legal
 * numbers stay Latin-digit and direction-isolated even when the interface is
 * configured to show Arabic-Indic digits.
 */

export type DigitStyle = 'western' | 'eastern';

export interface FormatSettings {
  digits: DigitStyle;
  timezone: string;
  dateFormat: string;
}

let settings: FormatSettings = {
  digits: 'western',
  timezone: 'Africa/Cairo',
  dateFormat: 'dd/MM/yyyy',
};

export function configureFormatting(next: Partial<FormatSettings>): void {
  settings = { ...settings, ...next };
}

export function formatSettings(): FormatSettings {
  return settings;
}

function locale(): string {
  return settings.digits === 'eastern' ? 'ar-EG' : 'ar-EG-u-nu-latn';
}

function intlOptions(): Intl.DateTimeFormatOptions {
  return { timeZone: settings.timezone };
}

export function formatDate(value: string | null | undefined, style: 'short' | 'medium' | 'long' | 'full' = 'short'): string {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const options: Intl.DateTimeFormatOptions = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { timeZone: 'UTC' }
    : {};
  switch (style) {
    case 'long':
      Object.assign(options, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      break;
    case 'full':
      Object.assign(options, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
      break;
    case 'medium':
      Object.assign(options, { day: 'numeric', month: 'short', year: 'numeric' });
      break;
    default:
      Object.assign(options, { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return new Intl.DateTimeFormat(locale(), options).format(date);
}

export function formatTimestamp(value: string | null | undefined, includeTime = true): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(), {
    ...intlOptions(),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(), {
    ...intlOptions(),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDayName(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(), { ...intlOptions(), weekday: 'long' }).format(date);
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale(), options).format(value);
}

export const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  EGP: 'ج.م',
  USD: 'US$',
  EUR: '€',
  GBP: '£',
  SAR: 'ر.س',
  AED: 'د.إ',
};

export function formatMoney(minor: number | null | undefined, currency = 'EGP', withDecimals = true): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '—';
  const value = minor / 100;
  const digits = withDecimals ? 2 : Number.isInteger(value) ? 0 : 2;
  const number = new Intl.NumberFormat(locale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${number} ${CURRENCY_SYMBOLS[currency] ?? currency}`;
}

export function formatMoneyCompact(minor: number | null | undefined, currency = 'EGP'): string {
  if (minor === null || minor === undefined) return '—';
  const value = minor / 100;
  if (Math.abs(value) >= 1_000_000) {
    return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value / 1_000_000)} م ${CURRENCY_SYMBOLS[currency] ?? currency}`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(value / 1000)} ألف ${CURRENCY_SYMBOLS[currency] ?? currency}`;
  }
  return formatMoney(minor, currency, !Number.isInteger(value));
}

export function formatPercent(value: number, digits = 0): string {
  return new Intl.NumberFormat(locale(), {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatRelative(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
  if (abs < 60_000) return 'الآن';
  if (abs < 3_600_000) return formatter.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return formatter.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return formatter.format(Math.round(diff / 86_400_000), 'day');
  if (abs < 365 * 86_400_000) return formatter.format(Math.round(diff / (30 * 86_400_000)), 'month');
  return formatter.format(Math.round(diff / (365 * 86_400_000)), 'year');
}

export function calendarDaysUntil(value: string | null | undefined, from = new Date()): number | null {
  if (!value) return null;
  const target = value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((end - start) / 86_400_000);
}

export function isoDateToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isoNow(): string {
  return new Date().toISOString();
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(date: Date, timeZone = settings.timezone): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock date/time in the office zone to a UTC instant. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = settings.timezone,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let index = 0; index < 2; index += 1) {
    const offset = offsetMs(new Date(guess), timeZone);
    guess = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
  }
  return new Date(guess);
}

export function startOfZonedDay(date: Date, timeZone = settings.timezone): Date {
  const parts = zonedParts(date, timeZone);
  return zonedToUtc(parts.year, parts.month, parts.day, 0, 0, 0, timeZone);
}

export function endOfZonedDay(date: Date, timeZone = settings.timezone): Date {
  const start = startOfZonedDay(date, timeZone);
  const next = new Date(start.getTime() + 26 * 3_600_000);
  const nextParts = zonedParts(startOfZonedDay(next, timeZone), timeZone);
  return zonedToUtc(nextParts.year, nextParts.month, nextParts.day, 0, 0, 0, timeZone);
}

export function dayKey(value: string | Date, timeZone = settings.timezone): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function dayRangeIso(key: string, timeZone = settings.timezone): { from: string; to: string } {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  const start = zonedToUtc(year, month, day, 0, 0, 0, timeZone);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  const end = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, timeZone);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** UTC ISO -> value accepted by `<input type="datetime-local">` in office time. */
export function toDateTimeLocal(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = zonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function fromDateTimeLocal(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return zonedToUtc(Number(year), Number(month), Number(day), Number(hour), Number(minute)).toISOString();
}

export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function humanDayLabel(key: string, today = isoDateToday()): string {
  if (key === today) return 'اليوم';
  if (key === addDaysToKey(today, 1)) return 'غدًا';
  if (key === addDaysToKey(today, -1)) return 'أمس';
  return formatDate(key, 'long');
}

export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '؟';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '؟';
  if (words.length === 1) return words[0]!.slice(0, 2);
  return `${words[0]![0] ?? ''}${words[words.length - 1]![0] ?? ''}`;
}
