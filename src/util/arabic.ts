import { ValidationError } from '../errors.ts';

/**
 * Arabic text handling for search only.
 *
 * The stored text is NEVER modified. A normalised projection is written to the
 * search index so that common Arabic spelling variations match, while exact
 * original text, diacritics and hamza forms are preserved in the source column.
 */

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g;
const TATWEEL = /\u0640/g;

const LETTER_FOLD: Readonly<Record<string, string>> = {
  '\u0622': '\u0627', // آ
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0671': '\u0627', // ٱ
  '\u0672': '\u0627',
  '\u0673': '\u0627',
  '\u0675': '\u0627',
  '\u0624': '\u0648', // ؤ
  '\u0626': '\u064A', // ئ
  '\u0649': '\u064A', // ى
  '\u0629': '\u0647', // ة → ه
  '\u06C0': '\u0647',
  '\u06C2': '\u0647',
  '\u06D5': '\u0647',
};

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669]/g;
const EXTENDED_ARABIC_INDIC_DIGITS = /[\u06F0-\u06F9]/g;

export function normalizeArabicDigits(input: string): string {
  return input
    .replace(ARABIC_INDIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/**
 * Folds Arabic orthographic variants: hamza forms, alef maqsura, taa marbuta,
 * diacritics and tatweel. Keeps the words and their order.
 */
export function normalizeArabic(input: string): string {
  if (typeof input !== 'string') return '';
  let output = normalizeArabicDigits(input.normalize('NFKC'));
  output = output.replace(TASHKEEL, '').replace(TATWEEL, '');
  let folded = '';
  for (const char of output) {
    folded += LETTER_FOLD[char] ?? char;
  }
  // Collapse whitespace so token boundaries are stable.
  return folded.replace(/\s+/g, ' ').trim();
}

/** True when two strings are equal after Arabic search normalisation. */
export function equalsNormalizedArabic(a: string, b: string): boolean {
  return normalizeArabic(a) === normalizeArabic(b);
}

/**
 * Builds the normalised body indexed by the search engine. It also indexes
 * digit runs without leading zeros (so "00123" matches "123").
 */
export function buildSearchBody(parts: ReadonlyArray<string | null | undefined>): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') continue;
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    chunks.push(trimmed);
    const normalized = normalizeArabic(trimmed);
    if (normalized !== trimmed) chunks.push(normalized);
    const digitless = normalized.replace(/0+(?=\d)/g, '');
    if (digitless !== normalized) chunks.push(digitless);
  }
  return chunks.join('\n');
}

export function assertNonEmptyText(value: unknown, field: string, maxLength = 2000): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be text`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field} must not be empty`, { field });
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} exceeds ${maxLength} characters`, { field });
  }
  return trimmed;
}
