// Server-side secret sealing (Phase 0 · SEC-05/SEC-07).
//
// Seals tenant secrets (AI provider keys, global-variable secrets) with AES-256-GCM
// using ONE server-only master key: the edge-function secret MARBEE_SECRETS_KEY
// (32 random bytes, base64). The database only ever stores the sealed envelope:
//
//     mbs1.<base64 12-byte IV>.<base64 ciphertext+tag>
//
// The browser never sees the master key or the plaintext. Values written before this
// existed are plaintext ("legacy"); openSecret() still returns them so nothing breaks,
// and callers re-seal them on next use.
//
// Generate a key:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Set it:          Supabase Dashboard → Edge Functions → Secrets → MARBEE_SECRETS_KEY

const PREFIX = 'mbs1';
const enc = new TextEncoder();
const dec = new TextDecoder();

let cachedKey: CryptoKey | null = null;
let cachedFrom: string | null = null;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function readMasterKey(): string {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  const v = env?.get('MARBEE_SECRETS_KEY')?.trim();
  if (!v) throw new Error('Server misconfigured: MARBEE_SECRETS_KEY is not set');
  return v;
}

async function masterKey(): Promise<CryptoKey> {
  const material = readMasterKey();
  if (cachedKey && cachedFrom === material) return cachedKey;
  const raw = unb64(material);
  if (raw.length !== 32) throw new Error('MARBEE_SECRETS_KEY must be 32 bytes (base64)');
  cachedKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  cachedFrom = material;
  return cachedKey;
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}.`);
}

/** Encrypt a secret for storage. */
export async function sealSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await masterKey(), enc.encode(plaintext)));
  return `${PREFIX}.${b64(iv)}.${b64(ct)}`;
}

/** Decrypt a stored secret. Legacy plaintext is returned as-is; empty → null. Tampered → throws. */
export async function openSecret(stored: string | null | undefined): Promise<string | null> {
  if (stored === null || stored === undefined) return null;
  const v = stored.trim();
  if (!v) return null;
  if (!isSealed(v)) return v; // legacy plaintext — caller should re-seal
  const [, ivB64, ctB64] = v.split('.');
  if (!ivB64 || !ctB64) throw new Error('Malformed sealed secret');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, await masterKey(), unb64(ctB64));
  return dec.decode(pt);
}

/** "…abcd" for display. Never reveals more than the last 4 characters. */
export function last4(plaintext: string): string {
  const t = plaintext.trim();
  return t.length <= 4 ? '' : t.slice(-4);
}
