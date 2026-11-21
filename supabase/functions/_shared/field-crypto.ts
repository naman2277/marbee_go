// Field-level encryption with a tenant data key (Phase 0 · SEC-05).
//
// Same format the browser used (apps/web/src/lib/crypto-vault.ts), so existing data
// and logic stay compatible:
//   data key  = 32 random bytes, base64 (stored as an `encryption_key` global variable,
//               itself sealed with MARBEE_SECRETS_KEY — see secret-box.ts)
//   field     = "mbe1.<base64 iv>.<base64 ciphertext+tag>" of JSON.stringify(value)
//
// Data keys now exist only on the server: generated here, sealed at rest, used here.

import { b64, unb64 } from './secret-box.ts';

const FIELD_PREFIX = 'mbe1';
const fieldEnc = new TextEncoder();
const fieldDec = new TextDecoder();

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = unb64(keyB64);
  if (raw.length !== 32) throw new Error('Data key must be 32 bytes');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function generateDataKey(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}

/** "a1b2 c3d4 e5f6 0718" — first 8 bytes of SHA-256, same as the browser's keyFingerprint. */
export async function dataKeyFingerprint(keyB64: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', unb64(keyB64))).slice(0, 8);
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('').replace(/(.{4})/g, '$1 ').trim();
}

export function isFieldEnvelope(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(`${FIELD_PREFIX}.`) && v.split('.').length === 3;
}

export async function encryptFieldsWithKey(
  data: Record<string, unknown>,
  fieldNames: string[],
  keyB64: string,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...data };
  if (fieldNames.length === 0) return out;
  const key = await importKey(keyB64);
  for (const name of fieldNames) {
    const value = out[name];
    if (value === undefined || value === null || value === '' || isFieldEnvelope(value)) continue;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fieldEnc.encode(JSON.stringify(value))));
    out[name] = `${FIELD_PREFIX}.${b64(iv)}.${b64(ct)}`;
  }
  return out;
}

export async function decryptFieldsWithKey(
  data: Record<string, unknown>,
  fieldNames: string[],
  keyB64: string,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...data };
  const key = await importKey(keyB64);
  for (const name of fieldNames) {
    const value = out[name];
    if (!isFieldEnvelope(value)) continue;
    try {
      const [, ivB64, ctB64] = value.split('.');
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64));
      out[name] = JSON.parse(fieldDec.decode(pt));
    } catch {
      out[name] = '[decryption failed]';
    }
  }
  return out;
}
