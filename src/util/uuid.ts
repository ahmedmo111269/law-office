import { createHash, randomUUID } from 'node:crypto';
import { ValidationError } from '../errors.ts';

/**
 * Record identifiers are UUIDs so that independently-created records on
 * different devices can never collide. Display numbers (file numbers, receipt
 * numbers, …) are stored separately in `number_series` and are never used as
 * keys.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newId(): string {
  return randomUUID();
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function assertUuid(value: unknown, field: string): string {
  if (!isUuid(value)) {
    throw new ValidationError(`${field} must be a UUID`, { field, valueType: typeof value });
  }
  return value;
}

/**
 * Deterministic namespace used only for seed data (reference lists, the system
 * device row). Seed identifiers must be identical on every device so that two
 * independently initialised databases converge instead of duplicating them.
 */
export const SEED_NAMESPACE = '0f6c5f3c-8c26-5f6b-9d5a-3f1f7a2b4c6e';

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** RFC 4122 version 5 UUID (SHA-1) used for deterministic seed rows. */
export function uuidv5(name: string, namespace: string = SEED_NAMESPACE): string {
  const hash = createHash('sha1')
    .update(uuidToBytes(namespace))
    .update(Buffer.from(name, 'utf8'))
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  return bytesToUuid(hash.subarray(0, 16));
}
