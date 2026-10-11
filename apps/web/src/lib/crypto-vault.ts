/**
 * crypto-vault.ts — AES-256-GCM encryption primitives built on the Web Crypto API.
 *
 * Used for field-level encryption of form submissions, and for protecting the
 * secret payload of global variables at rest.
 *
 * Envelope format (string): `mbe1.<base64 iv>.<base64 ciphertext+tag>`
 *   - `mbe1` marks the Marbee envelope version so we can rotate the scheme later.
 *   - IV is 12 random bytes (the GCM recommendation).
 *   - Ciphertext carries the 128-bit auth tag appended by WebCrypto.
 */

export const ENVELOPE_PREFIX = 'mbe1';
export const AES_ALGORITHM = 'AES-GCM';
export const AES_KEY_BITS = 256;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Generate a fresh AES-256 key, returned as a base64 string safe to store. */
export async function generateAesKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: AES_ALGORITHM, length: AES_KEY_BITS }, true, [
    'encrypt',
    'decrypt',
  ]);
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64(new Uint8Array(raw));
}

/** Import a base64 key string into a CryptoKey usable for encrypt/decrypt. */
export async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key);
  if (raw.length !== AES_KEY_BITS / 8) {
    throw new Error(`Invalid AES-256 key: expected ${AES_KEY_BITS / 8} bytes, got ${raw.length}`);
  }
  return crypto.subtle.importKey('raw', raw, { name: AES_ALGORITHM }, false, ['encrypt', 'decrypt']);
}

/**
 * Derive a deterministic AES-256 key from a passphrase using PBKDF2-SHA256.
 * The salt must be stable for the derived key to round-trip.
 */
export async function deriveAesKey(passphrase: string, salt: string, iterations = 210_000): Promise<string> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    base,
    AES_KEY_BITS,
  );
  return toBase64(new Uint8Array(bits));
}

/** Encrypt a UTF-8 string into a self-describing envelope. */
export async function encryptValue(plaintext: string, base64Key: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    key,
    encoder.encode(plaintext),
  );
  return `${ENVELOPE_PREFIX}.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

/** Decrypt an envelope produced by `encryptValue`. Throws if the key or data is wrong. */
export async function decryptValue(envelope: string, base64Key: string): Promise<string> {
  const parts = envelope.split('.');
  if (parts.length !== 3 || parts[0] !== ENVELOPE_PREFIX) {
    throw new Error('Value is not a Marbee AES envelope');
  }
  const key = await importAesKey(base64Key);
  const plain = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: fromBase64(parts[1]) },
    key,
    fromBase64(parts[2]),
  );
  return decoder.decode(plain);
}

/** True when a string looks like a Marbee AES envelope (cheap check, no key needed). */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${ENVELOPE_PREFIX}.`);
}

/** SHA-256 fingerprint of a key, for displaying/verifying without revealing the key. */
export async function keyFingerprint(base64Key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', fromBase64(base64Key));
  const bytes = new Uint8Array(digest).slice(0, 8);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** Mask a secret for display: keeps a short head and tail. */
export function maskSecret(value: string, visible = 4): string {
  if (!value) return '';
  if (value.length <= visible * 2) return '•'.repeat(value.length);
  return `${value.slice(0, visible)}${'•'.repeat(12)}${value.slice(-visible)}`;
}

/**
 * Encrypt selected keys of a record, leaving the rest untouched.
 * Values are JSON-stringified first so non-string types round-trip.
 */
export async function encryptFields<T extends Record<string, unknown>>(
  data: T,
  fieldNames: string[],
  base64Key: string,
): Promise<Record<string, unknown>> {
  if (fieldNames.length === 0) return { ...data };
  const out: Record<string, unknown> = { ...data };
  for (const name of fieldNames) {
    const value = out[name];
    if (value === undefined || value === null || value === '') continue;
    out[name] = await encryptValue(JSON.stringify(value), base64Key);
  }
  return out;
}

/** Inverse of `encryptFields`. Values that are not envelopes are passed through. */
export async function decryptFields(
  data: Record<string, unknown>,
  fieldNames: string[],
  base64Key: string,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...data };
  for (const name of fieldNames) {
    const value = out[name];
    if (!isEncrypted(value)) continue;
    try {
      out[name] = JSON.parse(await decryptValue(value, base64Key));
    } catch {
      out[name] = '[decryption failed]';
    }
  }
  return out;
}
