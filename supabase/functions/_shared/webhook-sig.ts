// Constant-time compare + HMAC signature verification (Phase 0 · SEC-18).
// No imports, so it is easy to test and safe to share.

export function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i += 1) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** HMAC-SHA* of `body` (the exact raw bytes received) with `secret`, as lowercase hex and base64. */
export async function hmacDigests(secret: string, body: string | Uint8Array, algorithm: string): Promise<{ hex: string; b64: string }> {
  const algo = algorithm.toUpperCase();
  const hash = algo === 'SHA512' ? 'SHA-512' : algo === 'SHA1' ? 'SHA-1' : 'SHA-256';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash }, false, ['sign']);
  const bytes: Uint8Array<ArrayBuffer> = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return { hex, b64: btoa(bin) };
}

/**
 * Verify a webhook signature header. Accepts bare hex, bare base64, or
 * "<algo>=<hex>" (e.g. GitHub's "sha256=…"). Constant-time compare.
 */
export async function verifyHmacSignature(secret: string, body: string | Uint8Array, algorithm: string, provided: string): Promise<boolean> {
  if (!secret || !provided) return false;
  const value = provided.trim().replace(/^(sha1|sha256|sha512)=/i, '');
  const { hex, b64 } = await hmacDigests(secret, body, algorithm);
  return constantTimeEqual(value.toLowerCase(), hex) || constantTimeEqual(value, b64);
}
