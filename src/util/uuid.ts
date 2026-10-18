import { ValidationError } from '../errors.ts';

/**
 * Record identifiers are UUIDs so that independently-created records on
 * different devices can never collide. Display numbers (file numbers, receipt
 * numbers, …) are stored separately in `number_series` and are never used as
 * keys.
 *
 * This module uses only WebCrypto and pure TypeScript so the exact same code
 * runs in Node and in the browser bundle (no `node:crypto`, no Buffer).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }
  if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') {
    throw new Error('this runtime provides no cryptographic random source');
  }
  const bytes = new Uint8Array(16);
  cryptoObject.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytesToUuid(bytes);
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

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32 || !/^[0-9a-f]+$/i.test(hex)) throw new TypeError('invalid uuid');
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Minimal SHA-1 (FIPS 180-1). Used only for deterministic seed identifiers. */
function sha1(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const padded = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 80; index += 1) {
      const value = words[index - 3]! ^ words[index - 8]! ^ words[index - 14]! ^ words[index - 16]!;
      words[index] = ((value << 1) | (value >>> 31)) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = ((((a << 5) | (a >>> 27)) >>> 0) + (f >>> 0) + e + k + words[index]!) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  for (const [index, word] of [h0, h1, h2, h3, h4].entries()) digestView.setUint32(index * 4, word);
  return digest;
}

/** RFC 4122 version 5 UUID (SHA-1) used for deterministic seed rows. */
export function uuidv5(name: string, namespace: string = SEED_NAMESPACE): string {
  const namespaceBytes = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const digest = sha1(input).slice(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  return bytesToUuid(digest);
}
