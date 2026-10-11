import { supabase } from './supabase';
import { buildFirebaseConfig, type FirebaseWebConfig } from './firebase-push';

/** OneSignal-style web push behavior (stored in channel_providers.config.web_push). */
export type WebPushBehaviorConfig = {
  site_name?: string;
  default_icon_url?: string;
  auto_resubscribe?: boolean;
  prompt_enabled?: boolean;
  prompt_delay_ms?: number;
  prompt_title?: string;
  prompt_message?: string;
  prompt_accept_label?: string;
  prompt_dismiss_label?: string;
  welcome_enabled?: boolean;
  welcome_title?: string;
  welcome_body?: string;
  welcome_click_url?: string;
  /** When true (default), clicks go via /push/open for open/click tracking. */
  track_opens?: boolean;
  default_ttl_seconds?: number;
};

export type WebPushAction = { action: string; title: string; url?: string };

export type ResolvedWebPushPayload = {
  title: string;
  body: string;
  clickAction?: string;
  iconUrl?: string;
  imageUrl?: string;
  badgeUrl?: string;
  tag?: string;
  ttlSeconds?: number;
  actions?: WebPushAction[];
  trackOpens?: boolean;
};

export type WebPushRuntimeConfig = {
  tenantId: string;
  environment: string;
  providerId: string;
  firebase: FirebaseWebConfig;
  vapidPublicKey: string;
  behavior: WebPushBehaviorConfig;
};

export type WebPushDiagnosticCheck = {
  label: string;
  pass: boolean;
  detail: string;
};

export type WebPushDiagnostic = {
  ok: boolean;
  checks: WebPushDiagnosticCheck[];
};

export const DEFAULT_WEB_PUSH_BEHAVIOR: WebPushBehaviorConfig = {
  site_name: 'Marbee',
  default_icon_url: '/favicon.svg',
  auto_resubscribe: true,
  prompt_enabled: true,
  prompt_delay_ms: 4000,
  prompt_title: 'Stay in the loop',
  prompt_message: 'Get timely updates and campaign alerts in your browser.',
  prompt_accept_label: 'Allow notifications',
  prompt_dismiss_label: 'Not now',
  welcome_enabled: true,
  welcome_title: 'Notifications enabled',
  welcome_body: 'You will receive updates from us here.',
  welcome_click_url: '/',
  track_opens: true,
  default_ttl_seconds: 86400,
};

type ProviderRow = {
  id?: string;
  config?: Record<string, unknown>;
  credentials_encrypted?: string | null;
  status?: string;
  is_default?: boolean;
};

function hasServiceAccountJson(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  try {
    const parsed = JSON.parse(raw) as { type?: string; private_key?: string };
    return parsed?.type === 'service_account' && Boolean(parsed.private_key);
  } catch {
    return false;
  }
}

function readFirebaseClientFields(cfg: Record<string, unknown>): {
  api_key?: string;
  auth_domain?: string;
  project_id?: string;
  sender_id?: string;
  app_id?: string;
  vapid_public_key?: string;
} {
  return {
    api_key: String(cfg.api_key ?? '').trim() || undefined,
    auth_domain: String(cfg.auth_domain ?? '').trim() || undefined,
    project_id: String(cfg.project_id ?? '').trim() || undefined,
    sender_id: String(cfg.sender_id ?? '').trim() || undefined,
    app_id: String(cfg.app_id ?? '').trim() || undefined,
    vapid_public_key: String(cfg.vapid_public_key ?? '').trim() || undefined,
  };
}

export function parseWebPushBehavior(config: Record<string, unknown> | undefined): WebPushBehaviorConfig {
  const raw = (config?.web_push ?? {}) as WebPushBehaviorConfig;
  return { ...DEFAULT_WEB_PUSH_BEHAVIOR, ...raw };
}

export async function fetchWebPushRuntimeConfig(
  tenantId: string,
  environment: string,
  providerId?: string,
): Promise<WebPushRuntimeConfig | null> {
  let query = supabase
    .from('channel_providers')
    .select('id, config, credentials_encrypted, status, is_default')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('channel', 'web_push');

  if (providerId) {
    query = query.eq('id', providerId);
  } else {
    query = query.eq('is_default', true);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ProviderRow;
  if (row.status === 'disabled') return null;
  if (!row.id) return null;

  const cfg = row.config ?? {};
  const fields = readFirebaseClientFields(cfg);
  const firebase = buildFirebaseConfig(fields);
  const vapidPublicKey = fields.vapid_public_key ?? '';
  if (!firebase || !vapidPublicKey) return null;

  return {
    tenantId,
    environment,
    providerId: row.id,
    firebase,
    vapidPublicKey,
    behavior: parseWebPushBehavior(cfg),
  };
}

export async function diagnoseWebPushSetup(tenantId: string, environment: string): Promise<WebPushDiagnostic> {
  const checks: WebPushDiagnosticCheck[] = [];

  const { data, error } = await supabase
    .from('channel_providers')
    .select('config, credentials_encrypted, status, is_default, provider_type')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('channel', 'web_push')
    .eq('is_default', true)
    .maybeSingle();

  if (error) {
    checks.push({ label: 'Provider record', pass: false, detail: error.message });
    return { ok: false, checks };
  }

  if (!data) {
    checks.push({
      label: 'Default web push provider',
      pass: false,
      detail: `No default Firebase provider for ${environment}. Save one in Channels → Web Push.`,
    });
    return { ok: false, checks };
  }

  const row = data as ProviderRow & { provider_type?: string };
  checks.push({
    label: 'Default web push provider',
    pass: true,
    detail: `${row.provider_type ?? 'firebase'} is default for ${environment}`,
  });

  const cfg = row.config ?? {};
  const fields = readFirebaseClientFields(cfg);
  const missing: string[] = [];
  if (!fields.project_id) missing.push('Project ID');
  if (!fields.sender_id) missing.push('Sender ID');
  if (!fields.app_id) missing.push('App ID');
  if (!fields.api_key) missing.push('Web API key');
  if (!fields.vapid_public_key) missing.push('VAPID public key');

  checks.push({
    label: 'Browser / SDK config',
    pass: missing.length === 0,
    detail:
      missing.length === 0
        ? 'Project ID, Sender ID, App ID, Web API key, and VAPID key are present.'
        : `Missing in config: ${missing.join(', ')}. Open the provider, re-enter values, and Save again.`,
  });

  const hasSa = hasServiceAccountJson(row.credentials_encrypted);
  checks.push({
    label: 'Service account (server send)',
    pass: hasSa,
    detail: hasSa
      ? 'Service account JSON is stored for FCM HTTP v1 sends.'
      : 'Service account JSON missing — paste it from Firebase → Project settings → Service accounts.',
  });

  if (typeof window !== 'undefined') {
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    checks.push({
      label: 'Browser notification permission',
      pass: perm === 'granted',
      detail:
        perm === 'granted'
          ? 'Permission granted on this browser.'
          : perm === 'denied'
            ? 'Permission blocked — reset in browser site settings, then run Test push again.'
            : perm === 'default'
              ? 'Not granted yet — click Test push and choose Allow.'
              : 'Notifications not supported in this browser.',
    });

    checks.push({
      label: 'Secure context (HTTPS or localhost)',
      pass: window.isSecureContext,
      detail: window.isSecureContext
        ? 'This page can register for web push.'
        : 'Web push requires HTTPS or localhost — not available on plain HTTP.',
    });
  }

  const stats = await fetchWebPushSubscriberStats(tenantId, environment);
  checks.push({
    label: 'Active subscribers',
    pass: stats.active > 0,
    detail:
      stats.active > 0
        ? `${stats.active} active subscriber(s) in ${environment}.`
        : 'No active subscribers — run Test push on this browser to register your device.',
  });

  const runtime = await fetchWebPushRuntimeConfig(tenantId, environment);
  checks.push({
    label: 'Runtime config load',
    pass: Boolean(runtime),
    detail: runtime
      ? 'App can initialize Firebase for this environment.'
      : 'Config incomplete — save provider again with all required Firebase fields.',
  });

  return { ok: checks.every((c) => c.pass), checks };
}

export async function fetchWebPushSubscriberStats(tenantId: string, environment: string) {
  const { data, error } = await supabase
    .from('web_push_subscribers')
    .select('subscription_status, permission_status')
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (error) throw error;

  const rows = data ?? [];
  return {
    total: rows.length,
    active: rows.filter((r) => r.subscription_status === 'active').length,
    inactive: rows.filter((r) => r.subscription_status !== 'active').length,
    granted: rows.filter((r) => r.permission_status === 'granted').length,
  };
}
