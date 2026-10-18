import { ValidationError } from '../errors.ts';
import { normalizeArabicDigits } from './arabic.ts';

/**
 * Money is always integer minor units (piastres for EGP: 1 EGP = 100 piastres).
 * No binary floating point is used for storage or arithmetic. A future currency
 * with different minor-unit precision must record that fact explicitly; the
 * current schema assumes exactly two decimals and documents it.
 */

export const MINOR_UNITS_PER_UNIT = 100;

export function assertMinorAmount(value: unknown, field = 'amount_minor'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ValidationError(`${field} must be a safe integer number of minor units`, { field });
  }
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new ValidationError(`${field} is out of range`, { field });
  }
  return value;
}

export function assertPositiveMinorAmount(value: unknown, field = 'amount_minor'): number {
  const amount = assertMinorAmount(value, field);
  if (amount <= 0) {
    throw new ValidationError(`${field} must be greater than zero`, { field });
  }
  return amount;
}

/**
 * Parses user input such as "1,250.50", "١٢٥٠٫٥٠", "1250", "-125.75" into
 * integer minor units. Rejects more than two decimal places instead of
 * silently rounding, because silently changing money is unacceptable.
 */
export function parseAmountToMinor(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new ValidationError('amount is not finite');
    const scaled = input * MINOR_UNITS_PER_UNIT;
    if (!Number.isSafeInteger(scaled)) {
      throw new ValidationError('amount has more than two decimal places or is out of range', {
        input,
      });
    }
    return scaled;
  }
  let text = normalizeArabicDigits(input.trim())
    .replace(/\u066B/g, '.') // Arabic decimal separator
    .replace(/\u066C/g, '') // Arabic thousands separator
    .replace(/[\s\u00A0]/g, '')
    .replace(/,/g, '');
  if (text === '' || text === '-' || text === '+') {
    throw new ValidationError('amount is empty');
  }
  const match = /^([+-])?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new ValidationError('amount must be a number with at most two decimal places', {
      input,
    });
  }
  const sign = match[1] === '-' ? -1 : 1;
  const whole = Number(match[2]);
  const fraction = (match[3] ?? '').padEnd(2, '0');
  const minor = whole * MINOR_UNITS_PER_UNIT + Number(fraction);
  if (!Number.isSafeInteger(minor)) {
    throw new ValidationError('amount is out of range', { input });
  }
  return sign * minor;
}

export function formatMinorAsDecimal(minor: number): string {
  assertMinorAmount(minor);
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const whole = Math.floor(absolute / MINOR_UNITS_PER_UNIT);
  const fraction = String(absolute % MINOR_UNITS_PER_UNIT).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

/**
 * Sums integer minor amounts and fails loudly if JavaScript safe-integer range
 * would be exceeded. Never returns a silently imprecise result.
 */
export function sumMinor(amounts: Iterable<number>): number {
  let total = 0;
  for (const amount of amounts) {
    assertMinorAmount(amount);
    total += amount;
    if (!Number.isSafeInteger(total)) {
      throw new ValidationError('money sum exceeds safe integer range');
    }
  }
  return total;
}
