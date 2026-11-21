import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { AuthError } from '../_shared/auth.ts';
import { assertTenantActive, isServiceCaller, requireMemberWithPermission } from '../_shared/tenant-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-environment',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return json({ error: message }, status);
}

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

interface SendRequest {
  action?: 'test_connection' | 'send';
  provider_id?: string;
  customer_id?: string;
  fcm_token?: string;
  title?: string;
  body?: string;
  icon_url?: string;
  image_url?: string;
  badge_url?: string;
  tag?: string;
  ttl_seconds?: number;
  actions?: Array<{ action?: string; title?: string; url?: string }>;
  track_opens?: boolean;
  click_action?: string;
  app_origin?: string;
  data?: Record<string, string>;
  journey_id?: string;
  delivery_id?: string;
  delivery_name?: string;
  tenant_id?: string;
  environment?: string;
}

type ConnectionCheck = { label: string; ok: boolean; detail?: string };

type ServiceAccount = {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

function parseServiceAccount(raw: string): ServiceAccount {
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw) as ServiceAccount;
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
  return sa;
}

async function loadWebPushProvider(
  supabase: ReturnType<typeof getServiceClient>,
  tenantId: string,
  environment: string,
  providerId?: string,
) {
  let query = supabase
    .from('channel_providers')
    .select('credentials_encrypted, config')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('channel', 'web_push');

  if (providerId) {
    query = query.eq('id', providerId);
  } else {
    query = query.eq('is_default', true);
  }

  const { data: provider } = await query.maybeSingle();
  return provider;
}

async function handleTestConnection(
  supabase: ReturnType<typeof getServiceClient>,
  tenantId: string,
  environment: string,
  payload: SendRequest,
) {
  const start = Date.now();
  const checks: ConnectionCheck[] = [];

  const provider = await loadWebPushProvider(supabase, tenantId, environment, payload.provider_id);
  if (!provider) {
    checks.push({
      label: 'Default web push provider',
      ok: false,
      detail: `No default Firebase provider for ${environment}`,
    });
    return json({
      success: false,
      status: 'failed',
      error: 'No default web push provider configured',
      checks,
      latency_ms: Date.now() - start,
    });
  }

  checks.push({
    label: 'Default web push provider',
    ok: true,
    detail: 'Provider record found in database',
  });

  const creds = provider.credentials_encrypted?.trim();
  if (!creds) {
    checks.push({
      label: 'Service account JSON',
      ok: false,
      detail: 'Missing — paste Firebase service account key in Channels → Web Push',
    });
    return json({
      success: false,
      status: 'failed',
      error: 'Service account JSON not configured',
      checks,
      latency_ms: Date.now() - start,
    });
  }

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = parseServiceAccount(creds);
    checks.push({
      label: 'Service account JSON',
      ok: true,
      detail: `Project ${serviceAccount.project_id}`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Invalid service account';
    checks.push({ label: 'Service account JSON', ok: false, detail });
    return json({
      success: false,
      status: 'failed',
      error: detail,
      checks,
      latency_ms: Date.now() - start,
    });
  }

  try {
    await getFirebaseAccessToken(serviceAccount as { client_email: string; private_key: string });
    checks.push({
      label: 'Google OAuth (FCM API)',
      ok: true,
      detail: `Authenticated as ${serviceAccount.client_email}`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'OAuth failed';
    checks.push({ label: 'Google OAuth (FCM API)', ok: false, detail });
    return json({
      success: false,
      status: 'failed',
      error: detail,
      checks,
      latency_ms: Date.now() - start,
    });
  }

  if (!payload.fcm_token) {
    return json({
      success: true,
      status: 'connected',
      message: 'Server credentials verified with Google — browser token required for end-to-end delivery test',
      checks,
      latency_ms: Date.now() - start,
    });
  }

  const appOrigin = payload.app_origin ?? Deno.env.get('APP_URL') ?? 'http://localhost:5173';
  try {
    await sendViaFirebase(creds, payload.fcm_token, {
      title: payload.title ?? 'Marbee Test Push',
      body: payload.body ?? 'Web Push via Firebase FCM HTTP v1 is working!',
      click_action: payload.click_action ?? appOrigin,
      app_origin: appOrigin,
      tenant_id: tenantId,
      environment,
      track_opens: false,
      tag: 'marbee-connection-test',
    });
    checks.push({
      label: 'FCM message delivery',
      ok: true,
      detail: 'Google FCM accepted the message for this device token',
    });
    return json({
      success: true,
      status: 'delivered',
      message: 'Test notification delivered via FCM',
      checks,
      latency_ms: Date.now() - start,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'FCM delivery failed';
    checks.push({ label: 'FCM message delivery', ok: false, detail });
    return json({
      success: false,
      status: 'failed',
      error: detail,
      checks,
      latency_ms: Date.now() - start,
    });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: SendRequest = await req.json();

    const tenantId = req.headers.get('x-tenant-id') ?? payload.tenant_id;
    const environment = req.headers.get('x-environment') ?? payload.environment ?? 'production';
    if (!tenantId) return errorResponse('Missing tenant_id in request body', 401);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return errorResponse('Invalid tenant_id', 400);
    }

    const supabase = getServiceClient();

    // Phase 0: this function used to accept ANY caller for ANY tenant. Now only the
    // engine (service role) or a signed-in member with send rights may use it, and
    // never for a suspended workspace.
    try {
      if (!isServiceCaller(req)) {
        await requireMemberWithPermission(
          supabase, req, tenantId,
          payload.action === 'test_connection' ? ['settings.manage'] : ['journeys.publish', 'settings.manage'],
        );
      }
      await assertTenantActive(supabase, tenantId);
    } catch (e) {
      if (e instanceof AuthError) return errorResponse(e.message, e.status);
      throw e;
    }

    if (payload.action === 'test_connection') {
      return await handleTestConnection(supabase, tenantId, environment, payload);
    }

    const ctx = { tenantId, environment };
    const messageId = crypto.randomUUID();
    const appOrigin =
      payload.app_origin ??
      Deno.env.get('APP_URL') ??
      'http://localhost:5173';
    const destinationUrl = payload.click_action ?? `${appOrigin}/`;
    const trackOpens = payload.track_opens !== false;
    const openUrl =
      `${appOrigin.replace(/\/$/, '')}/push/open?mid=${encodeURIComponent(messageId)}` +
      `&tid=${encodeURIComponent(tenantId)}&env=${encodeURIComponent(environment)}` +
      (payload.journey_id ? `&jid=${encodeURIComponent(String(payload.journey_id))}` : '') +
      (payload.delivery_id ? `&did=${encodeURIComponent(String(payload.delivery_id))}` : '') +
      (payload.delivery_name ? `&dn=${encodeURIComponent(String(payload.delivery_name))}` : '');
    const notificationLink = trackOpens ? openUrl : destinationUrl;

    let fcmToken = payload.fcm_token;
    if (!fcmToken && payload.customer_id) {
      const { data: sub } = await supabase
        .from('web_push_subscribers')
        .select('fcm_token')
        .eq('tenant_id', ctx.tenantId)
        .eq('environment', ctx.environment)
        .eq('customer_id', payload.customer_id)
        .eq('subscription_status', 'active')
        .order('last_seen', { ascending: false })
        .limit(1)
        .maybeSingle();
      fcmToken = sub?.fcm_token;
    }

    if (!fcmToken) return errorResponse('No active push subscription found', 404);

    if (payload.customer_id) {
      const { data: excluded } = await supabase
        .from('exclusions')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('customer_id', payload.customer_id)
        .or('channel.eq.web_push,channel.is.null')
        .lte('start_date', new Date().toISOString().split('T')[0])
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString().split('T')[0]}`)
        .maybeSingle();

      if (excluded) return errorResponse('Customer is excluded from web push', 403);
    }

    const provider = await loadWebPushProvider(supabase, ctx.tenantId, ctx.environment, payload.provider_id);

    let deliveryStatus = 'failed';
    let errorCode: string | null = null;
    const creds = provider?.credentials_encrypted?.trim();

    if (!creds) {
      errorCode =
        'Firebase Service Account JSON not configured. Add credentials in Settings → Channels → Web Push.';
    } else {
      try {
        parseServiceAccount(creds);
        await sendViaFirebase(creds, fcmToken, {
          ...payload,
          message_id: messageId,
          tenant_id: tenantId,
          environment,
          click_action: notificationLink,
          destination_url: destinationUrl,
          open_url: openUrl,
          track_opens: trackOpens,
        });
        deliveryStatus = 'delivered';
      } catch (err) {
        errorCode = err instanceof Error ? err.message : 'FCM_ERROR';
      }
    }

    await supabase.from('engagement_log').insert({
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      customer_id: payload.customer_id ?? null,
      channel: 'web_push',
      message_id: messageId,
      event: deliveryStatus === 'delivered' ? 'delivered' : 'failed',
      journey_id: payload.journey_id ?? null,
      metadata: {
        title: payload.title,
        body: payload.body,
        click_url: destinationUrl,
        click_action: destinationUrl,
        delivery_id: payload.delivery_id,
        delivery_name: payload.delivery_name,
        open_url: openUrl,
      },
    });

    await supabase.from('customer_delivery_log').insert({
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      customer_id: payload.customer_id ?? null,
      journey_id: payload.journey_id ?? null,
      channel: 'web_push',
      provider: 'firebase',
      message_id: messageId,
      status: deliveryStatus,
      error_code: errorCode,
    });

    return json({
      success: deliveryStatus === 'delivered',
      message_id: messageId,
      status: deliveryStatus,
      error: errorCode,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});

async function sendViaFirebase(
  serviceAccountJson: string,
  fcmToken: string,
  payload: SendRequest & { message_id?: string; tenant_id?: string; environment?: string; destination_url?: string; open_url?: string },
) {
  const serviceAccount = parseServiceAccount(serviceAccountJson);
  const accessToken = await getFirebaseAccessToken(serviceAccount as { client_email: string; private_key: string });
  const messageId = payload.message_id ?? crypto.randomUUID();
  const ttl = Number(payload.ttl_seconds ?? 86400);
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const webpushNotification: Record<string, unknown> = {};
  if (payload.icon_url) webpushNotification.icon = payload.icon_url;
  if (payload.badge_url) webpushNotification.badge = payload.badge_url;
  if (payload.image_url) webpushNotification.image = payload.image_url;
  if (payload.tag) webpushNotification.tag = payload.tag;
  if (actions.length) {
    webpushNotification.actions = actions.slice(0, 2).map((a) => ({
      action: a.action ?? 'open',
      title: a.title ?? 'Open',
    }));
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title: payload.title, body: payload.body },
          webpush: {
            headers: { TTL: String(ttl) },
            fcm_options: { link: payload.click_action },
            notification: Object.keys(webpushNotification).length ? webpushNotification : undefined,
          },
          data: {
            message_id: messageId,
            tenant_id: payload.tenant_id ?? '',
            environment: payload.environment ?? 'production',
            journey_id: payload.journey_id ?? '',
            title: String(payload.title ?? ''),
            body: String(payload.body ?? ''),
            click_url: payload.destination_url ?? payload.click_action ?? '/',
            open_url: payload.open_url ?? payload.click_action ?? '',
            delivery_id: payload.delivery_id ?? '',
            delivery_name: payload.delivery_name ?? '',
            icon_url: payload.icon_url ?? '',
            image_url: payload.image_url ?? '',
            badge_url: payload.badge_url ?? '',
            tag: payload.tag ?? '',
            actions_json: JSON.stringify(actions),
            track_opens: payload.track_opens === false ? 'false' : 'true',
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(formatFcmError(err));
  }
}

function formatFcmError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed.error?.message ?? raw;
    if (msg.includes('UNAUTHENTICATED') || msg.includes('invalid authentication')) {
      return 'Firebase auth failed. Re-download Service Account JSON from Firebase → Project Settings → Service Accounts. Also enable "Firebase Cloud Messaging API" in Google Cloud Console.';
    }
    if (msg.includes('NOT_FOUND') || msg.includes('registration token')) {
      return 'FCM rejected the device token — client Firebase config may not match the service account project. Re-save provider settings and run Test push again.';
    }
    return msg;
  } catch {
    return raw;
  }
}

async function getFirebaseAccessToken(serviceAccount: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );

  const jwt = `${header}.${claim}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

function base64UrlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
