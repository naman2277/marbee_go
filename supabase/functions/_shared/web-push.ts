// Web Push over Firebase Cloud Messaging HTTP v1 (D-022).
//
// Shared by channel-send (tests + real-time sends) and push-worker (campaign/journey
// outbox). Pure pieces — service-account parsing, message building, response
// classification — are unit-tested in supabase/tests/functions/web-push.test.mjs.
//
// Messages are DATA-ONLY: the Marbee service worker (public/sdk/v1/marbee-push-sw.js)
// always draws the notification itself, so there is never a second, auto-drawn copy.

export type ServiceAccount = {
  type?: string;
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type PushAction = { action?: string; title?: string; url?: string };

/** What a send carries. Everything here ends up visible on the device — no secrets. */
export type PushContent = {
  title: string;
  body?: string;
  icon_url?: string;
  image_url?: string;
  badge_url?: string;
  tag?: string;
  click_url?: string;
  ttl_seconds?: number;
  actions?: PushAction[];
  track_clicks?: boolean;
};

export type PushContext = {
  message_id: string;
  tenant_id: string;
  environment: string;
  journey_id?: string | null;
  delivery_id?: string | null;
  delivery_name?: string | null;
  /** Full URL of the push-engage function, so the service worker can report clicks. */
  engage_url?: string;
};

export type SendOutcome = 'delivered' | 'retry' | 'invalid_token' | 'failed';
export type SendResult = { outcome: SendOutcome; error?: string; retryAfterSeconds?: number; httpStatus?: number };

export function parseServiceAccount(raw: string): ServiceAccount {
  let sa: Partial<ServiceAccount>;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error('Service account JSON is not valid JSON');
  }
  if (sa?.type !== 'service_account') {
    throw new Error('JSON must be a Firebase service account (type: "service_account")');
  }
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error('Invalid service account — needs project_id, client_email, and private_key');
  }
  if (/your[-_]?gcp|your[-_]?project|placeholder|example\.com/i.test(sa.project_id)) {
    throw new Error('Service account project_id looks like a placeholder');
  }
  if (/your[-_]?service|placeholder|example\.com/i.test(sa.client_email)) {
    throw new Error('Service account client_email looks like a placeholder');
  }
  if (sa.private_key.includes('...') || sa.private_key.length < 400) {
    throw new Error('Service account private_key appears truncated or fake — paste the full key from Firebase');
  }
  if (sa.token_uri && !sa.token_uri.includes('oauth2.googleapis.com')) {
    throw new Error('token_uri must be https://oauth2.googleapis.com/token — use JSON downloaded from Firebase');
  }
  if (!/^[a-z0-9-]{4,40}$/.test(sa.project_id)) throw new Error('Service account project_id is not a valid Firebase project id');
  return sa as ServiceAccount;
}

const httpUrl = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const s = v.trim();
  if (s.startsWith('/')) {
    // Relative to the subscribing site. "//host" and "/\host" would leave it.
    return s.startsWith('//') || s.startsWith('/\\') ? undefined : s.slice(0, 2000);
  }
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().slice(0, 2000) : undefined;
  } catch {
    return undefined;
  }
};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Clean user-supplied content: trims lengths, keeps only http(s)/relative URLs, max 2 actions. */
export function normalizeContent(input: Record<string, unknown>): PushContent {
  const actions = Array.isArray(input.actions) ? (input.actions as PushAction[]) : [];
  const ttl = Number(input.ttl_seconds ?? input.ttlSeconds);
  return {
    title: text(input.title, 200),
    body: text(input.body, 1000),
    icon_url: httpUrl(input.icon_url ?? input.iconUrl),
    image_url: httpUrl(input.image_url ?? input.imageUrl),
    badge_url: httpUrl(input.badge_url ?? input.badgeUrl),
    tag: text(input.tag, 100) || undefined,
    click_url: httpUrl(input.click_url ?? input.clickAction ?? input.click_action),
    ttl_seconds: Number.isFinite(ttl) && ttl > 0 ? Math.min(Math.floor(ttl), 2419200) : 86400,
    actions: actions.slice(0, 2).map((a, i) => ({
      action: text(a?.action, 40) || `action_${i + 1}`,
      title: text(a?.title, 40) || 'Open',
      url: httpUrl(a?.url),
    })),
    track_clicks: input.track_clicks !== false && input.track_opens !== false && input.trackOpens !== false,
  };
}

/** FCM v1 request body. Data values must all be strings. */
export function buildFcmMessage(token: string, content: PushContent, ctx: PushContext) {
  const data: Record<string, string> = {
    marbee: '1',
    message_id: ctx.message_id,
    tenant_id: ctx.tenant_id,
    environment: ctx.environment,
    journey_id: ctx.journey_id ?? '',
    delivery_id: ctx.delivery_id ?? '',
    delivery_name: ctx.delivery_name ?? '',
    title: content.title,
    body: content.body ?? '',
    icon_url: content.icon_url ?? '',
    image_url: content.image_url ?? '',
    badge_url: content.badge_url ?? '',
    tag: content.tag ?? '',
    click_url: content.click_url ?? '/',
    actions_json: JSON.stringify(content.actions ?? []),
    track_clicks: content.track_clicks === false ? 'false' : 'true',
    engage_url: ctx.engage_url ?? '',
  };
  return {
    message: {
      token,
      data,
      webpush: { headers: { TTL: String(content.ttl_seconds ?? 86400), Urgency: 'high' } },
    },
  };
}

type FcmErrorBody = { error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } };

/** Map an FCM v1 HTTP response to what the outbox should do next. */
export function classifyFcmResponse(status: number, bodyText: string, retryAfter?: string | null): SendResult {
  if (status >= 200 && status < 300) return { outcome: 'delivered', httpStatus: status };
  let parsed: FcmErrorBody = {};
  try { parsed = JSON.parse(bodyText); } catch { /* not JSON */ }
  const codes = (parsed.error?.details ?? []).map((d) => d?.errorCode).filter(Boolean) as string[];
  const st = parsed.error?.status ?? '';
  const msg = (parsed.error?.message ?? bodyText ?? '').slice(0, 300);
  const has = (c: string) => codes.includes(c) || st === c;
  const ra = retryAfter ? Number(retryAfter) : NaN;
  const retryAfterSeconds = Number.isFinite(ra) && ra > 0 ? Math.min(Math.floor(ra), 3600) : undefined;
  const error = `FCM ${status}${codes[0] || st ? ` ${codes[0] || st}` : ''}: ${msg}`.trim();

  if (status === 404 || status === 410 || has('UNREGISTERED')) return { outcome: 'invalid_token', error, httpStatus: status };
  if (has('SENDER_ID_MISMATCH')) return { outcome: 'invalid_token', error, httpStatus: status };
  if (status === 400 && /registration token/i.test(msg)) return { outcome: 'invalid_token', error, httpStatus: status };
  if (status === 429 || has('QUOTA_EXCEEDED')) return { outcome: 'retry', error, retryAfterSeconds: retryAfterSeconds ?? 60, httpStatus: status };
  if (status >= 500 || has('UNAVAILABLE') || has('INTERNAL')) return { outcome: 'retry', error, retryAfterSeconds, httpStatus: status };
  if (status === 401) return { outcome: 'retry', error, httpStatus: status }; // access token expired mid-run
  return { outcome: 'failed', error, httpStatus: status };
}

/** Human-readable hint for the settings page / delivery log. */
export function explainFcmError(error: string): string {
  if (/UNAUTHENTICATED|THIRD_PARTY_AUTH_ERROR|invalid authentication|PERMISSION_DENIED/i.test(error)) {
    return 'Firebase rejected the server key. Re-download the service-account JSON (Firebase → Project settings → Service accounts) and make sure "Firebase Cloud Messaging API (V1)" is enabled.';
  }
  if (/SENDER_ID_MISMATCH/i.test(error)) {
    return 'This browser was subscribed with a different Firebase project than the server key. Check the web config and service account belong to the same project.';
  }
  if (/UNREGISTERED|registration token/i.test(error)) return 'The browser subscription has expired or was removed — the device was pruned.';
  return error;
}

// ---------------------------------------------------------------- OAuth
const tokenCache = new Map<string, { token: string; exp: number }>();

function base64Url(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Google access token for FCM, cached per service account for ~50 minutes. */
export async function getFcmAccessToken(sa: ServiceAccount, opts: { fetchFn?: typeof fetch; force?: boolean } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(sa.client_email);
  if (!opts.force && cached && cached.exp - 600 > now) return cached.token;

  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`)));
  const jwt = `${header}.${claim}.${base64Url(sig)}`;

  const res = await (opts.fetchFn ?? fetch)('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    // Never echo the response wholesale (could include request details); keep the error code.
    throw new Error(`Google OAuth failed: ${String(data.error ?? res.status)}${data.error_description ? ` — ${String(data.error_description).slice(0, 200)}` : ''}`);
  }
  tokenCache.set(sa.client_email, { token: data.access_token, exp: now + Number(data.expires_in ?? 3600) });
  return data.access_token;
}

export function forgetFcmAccessToken(sa: ServiceAccount): void {
  tokenCache.delete(sa.client_email);
}

/** Send one message. Never throws — network errors come back as a retry. */
export async function sendFcm(
  sa: ServiceAccount,
  token: string,
  content: PushContent,
  ctx: PushContext,
  opts: { fetchFn?: typeof fetch } = {},
): Promise<SendResult> {
  const f = opts.fetchFn ?? fetch;
  try {
    const access = await getFcmAccessToken(sa, opts);
    const res = await f(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildFcmMessage(token, content, ctx)),
      signal: AbortSignal.timeout(15000),
    });
    const result = classifyFcmResponse(res.status, res.ok ? '' : await res.text(), res.headers.get('retry-after'));
    if (res.status === 401) forgetFcmAccessToken(sa);
    return result;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    // A bad key is not going to fix itself on retry.
    if (/Google OAuth failed: (invalid_grant|invalid_client|unauthorized_client)/.test(m) || /pkcs8|DataError|import/i.test(m)) {
      return { outcome: 'failed', error: m };
    }
    return { outcome: 'retry', error: `Network: ${m}`.slice(0, 300) };
  }
}

// ---------------------------------------------------------------- provider key
type MinimalClient = {
  // deno-lint-ignore no-explicit-any
  from: (t: string) => any;
};

/**
 * Load a provider's service-account JSON from the server-only secrets table (sql/95),
 * re-sealing legacy plaintext on the way. Falls back to the pre-95 column so a deploy
 * of the functions before the SQL keeps working.
 */
export async function loadServiceAccountJson(
  supabase: MinimalClient,
  provider: { id: string; credentials_encrypted?: string | null },
  box: { openSecret: (s: string) => Promise<string | null>; sealSecret: (s: string) => Promise<string>; isSealed: (s: string) => boolean },
): Promise<string | null> {
  const { data, error } = await supabase.from('channel_provider_secrets').select('secret').eq('provider_id', provider.id).maybeSingle();
  if (!error && data?.secret) {
    const plain = await box.openSecret(data.secret);
    if (plain && !box.isSealed(data.secret)) {
      try {
        const sealed = await box.sealSecret(plain);
        await supabase.from('channel_provider_secrets').update({ secret: sealed, updated_at: new Date().toISOString() }).eq('provider_id', provider.id);
      } catch (e) {
        console.error('re-seal of web push key skipped', e instanceof Error ? e.message : e);
      }
    }
    return plain;
  }
  const legacy = provider.credentials_encrypted?.trim();
  return legacy && legacy !== '{}' ? legacy : null;
}

/** Backoff used by the outbox (mirrors complete_web_push in sql/95, for display/tests). */
export function backoffSeconds(attempt: number, retryAfter?: number): number {
  return Math.min(Math.max(30 * 4 ** Math.max(attempt - 1, 0), retryAfter ?? 0), 3600);
}
