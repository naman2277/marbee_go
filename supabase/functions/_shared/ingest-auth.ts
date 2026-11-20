// Authentication for PUBLIC ingest endpoints (Phase 0, SEC-02).
//
// Two credential types — tenant/environment always come from the credential, never the request:
//   • Secret API key (server-to-server): `x-api-key: mk_…` or `Authorization: Bearer mk_…`.
//     Verified by public.verify_api_key() (bcrypt). Must carry the required scope.
//   • Site key (browser SDKs): body `site_id` + `write_key` (public by design, like a
//     Segment write key). Verified by public.resolve_ingest_site(): key, site status and
//     the browser Origin against the site's domain / allowed_origins.
//
// Because a site key is public, it can be copied and replayed from a script. Defences:
// per-site + per-IP rate limits here (per isolate — a backstop), frequency caps at send
// time (Wave 1 guardrails), and identity verification for identified users (SEC-13).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AuthError } from './auth.ts';

export type IngestContext = {
  tenantId: string;
  environment: string;
  via: 'api_key' | 'site_key';
  siteId?: string;
  siteUuid?: string;
};

/** Read the secret API key if one was sent. JWTs (anon/user tokens) are ignored here. */
export function readApiKey(req: Request): string | null {
  const header = req.headers.get('x-api-key')?.trim();
  if (header) return header;
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  // Supabase JWTs have three dot-separated parts; Marbee API keys don't.
  if (bearer && bearer.split('.').length !== 3) return bearer;
  return null;
}

export async function authenticateApiKey(db: SupabaseClient, rawKey: string, scope: string): Promise<IngestContext> {
  const { data, error } = await db.rpc('verify_api_key', { p_raw_key: rawKey });
  if (error) {
    console.error('verify_api_key failed', error.message);
    throw new AuthError(500, 'Could not verify API key');
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new AuthError(401, 'Invalid or revoked API key');
  const scopes: string[] = row.scopes ?? [];
  if (!scopes.includes(scope) && !scopes.includes('*')) throw new AuthError(403, `API key is missing the ${scope} scope`);
  return { tenantId: row.tenant_id, environment: row.environment ?? 'production', via: 'api_key' };
}

export async function authenticateSiteKey(
  db: SupabaseClient,
  siteId: unknown,
  writeKey: unknown,
  origin: string | null,
): Promise<IngestContext> {
  if (typeof siteId !== 'string' || typeof writeKey !== 'string') {
    throw new AuthError(401, 'site_id and write_key are required');
  }
  const { data, error } = await db.rpc('resolve_ingest_site', {
    p_site_id: siteId, p_write_key: writeKey, p_origin: origin,
  });
  if (error) {
    console.error('resolve_ingest_site failed', error.message);
    throw new AuthError(500, 'Could not verify site key');
  }
  const r = data as { ok: boolean; reason?: string; tenant_id?: string; environment?: string; site_id?: string; site_uuid?: string };
  if (!r?.ok) {
    const status = r?.reason === 'invalid_key' ? 401 : 403;
    const message = r?.reason === 'origin_not_allowed'
      ? 'This website is not allowed to use this site key'
      : r?.reason?.startsWith('site_') ? 'Site is not active' : 'Invalid site key';
    throw new AuthError(status, message);
  }
  return { tenantId: r.tenant_id!, environment: r.environment ?? 'production', via: 'site_key', siteId: r.site_id, siteUuid: r.site_uuid };
}

/** API key if present, otherwise site key from the parsed body. */
export async function authenticateIngest(
  req: Request,
  db: SupabaseClient,
  body: Record<string, unknown> | null,
  scope: string,
): Promise<IngestContext> {
  const apiKey = readApiKey(req);
  if (apiKey) return authenticateApiKey(db, apiKey, scope);
  return authenticateSiteKey(db, body?.site_id, body?.write_key, req.headers.get('origin'));
}

// --------------------------------------------------------------------------------------
// Rate limit — fixed window per isolate. A backstop against floods, not a billing meter.
// --------------------------------------------------------------------------------------
const windows = new Map<string, { start: number; count: number }>();

export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) windows.clear(); // bound memory
    return false;
  }
  w.count += 1;
  return w.count > max;
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

/** Reject oversized bodies before parsing (Content-Length when present). */
export function tooLarge(req: Request, maxBytes: number): boolean {
  const len = Number(req.headers.get('content-length') ?? 0);
  return Number.isFinite(len) && len > maxBytes;
}
