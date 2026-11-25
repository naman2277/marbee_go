// channel-send — immediate Web Push sends: Settings "Test push" (test_connection) and
// real-time messages from the RTM engine. Campaign / journey sends do NOT come here any
// more: they are queued with enqueue_web_push() and sent by push-worker (D-022).
//
// Callers: the engine (service-role key) or a signed-in member with journeys.publish /
// settings.manage (test: settings.manage). Never for a suspended workspace.
// The Firebase service-account key is read server-side only (sql/95
// channel_provider_secrets), sealed with MARBEE_SECRETS_KEY.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { AuthError } from '../_shared/auth.ts';
import { assertTenantActive, isServiceCaller, requireMemberWithPermission } from '../_shared/tenant-guard.ts';
import { isSealed, openSecret, sealSecret } from '../_shared/secret-box.ts';
import {
  explainFcmError,
  getFcmAccessToken,
  loadServiceAccountJson,
  normalizeContent,
  parseServiceAccount,
  sendFcm,
  type ServiceAccount,
} from '../_shared/web-push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-environment',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const errorResponse = (message: string, status = 400) => json({ error: message }, status);

function getServiceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENVS = ['production', 'staging', 'development'];

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
  journey_id?: string;
  delivery_id?: string;
  delivery_name?: string;
  tenant_id?: string;
  environment?: string;
}

type ConnectionCheck = { label: string; ok: boolean; detail?: string };

async function loadProvider(supabase: SupabaseClient, tenantId: string, environment: string, providerId?: string) {
  let q = supabase.from('channel_providers').select('id, tenant_id, credentials_encrypted, config, status')
    .eq('tenant_id', tenantId).eq('environment', environment).eq('channel', 'web_push');
  q = providerId && UUID_RE.test(providerId) ? q.eq('id', providerId) : q.eq('is_default', true);
  const { data } = await q.limit(1).maybeSingle();
  return data as { id: string; tenant_id: string; credentials_encrypted: string | null; config: Record<string, unknown>; status: string } | null;
}

async function loadSa(supabase: SupabaseClient, provider: { id: string; tenant_id: string; credentials_encrypted: string | null }): Promise<ServiceAccount> {
  const raw = await loadServiceAccountJson(supabase, provider, { openSecret, sealSecret, isSealed });
  if (!raw) throw new Error('Service account JSON not configured — paste the Firebase service-account key in Channels → Web Push');
  return parseServiceAccount(raw);
}

const engageUrl = () => `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/push-engage`;

async function markInvalid(supabase: SupabaseClient, tenantId: string, environment: string, token: string) {
  const { data } = await supabase.from('web_push_subscribers')
    .update({ subscription_status: 'invalid', token_invalidated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('environment', environment).eq('fcm_token', token)
    .select('id');
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  if (ids.length) await supabase.from('channel_endpoints').update({ status: 'invalid' }).eq('tenant_id', tenantId).in('subscriber_id', ids);
}

async function handleTestConnection(supabase: SupabaseClient, tenantId: string, environment: string, payload: SendRequest) {
  const start = Date.now();
  const checks: ConnectionCheck[] = [];
  const done = (success: boolean, status: string, extra: Record<string, unknown>) =>
    json({ success, status, checks, latency_ms: Date.now() - start, ...extra });

  const provider = await loadProvider(supabase, tenantId, environment, payload.provider_id);
  if (!provider) {
    checks.push({ label: 'Default web push provider', ok: false, detail: `No default Firebase provider for ${environment}` });
    return done(false, 'failed', { error: 'No default web push provider configured' });
  }
  checks.push({ label: 'Default web push provider', ok: true, detail: 'Provider record found' });

  let sa: ServiceAccount;
  try {
    sa = await loadSa(supabase, provider);
    checks.push({ label: 'Service account JSON', ok: true, detail: `Project ${sa.project_id} (stored server-side)` });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Invalid service account';
    checks.push({ label: 'Service account JSON', ok: false, detail });
    return done(false, 'failed', { error: detail });
  }

  const webProject = String(provider.config?.project_id ?? '');
  if (webProject && webProject !== sa.project_id) {
    const detail = `Web config is for project "${webProject}" but the service account is for "${sa.project_id}" — they must match`;
    checks.push({ label: 'Same Firebase project', ok: false, detail });
    return done(false, 'failed', { error: detail });
  }

  try {
    await getFcmAccessToken(sa, { force: true });
    checks.push({ label: 'Google OAuth (FCM API)', ok: true, detail: `Authenticated as ${sa.client_email}` });
  } catch (err) {
    const detail = explainFcmError(err instanceof Error ? err.message : 'OAuth failed');
    checks.push({ label: 'Google OAuth (FCM API)', ok: false, detail });
    return done(false, 'failed', { error: detail });
  }

  if (!payload.fcm_token) {
    return done(true, 'connected', { message: 'Server credentials verified with Google — allow notifications in this browser to test delivery' });
  }

  const content = normalizeContent({
    title: payload.title ?? 'Marbee test push',
    body: payload.body ?? 'Web Push via Firebase Cloud Messaging is working.',
    click_url: payload.click_action,
    tag: 'marbee-connection-test',
    track_clicks: false,
  });
  const result = await sendFcm(sa, payload.fcm_token, content, {
    message_id: crypto.randomUUID(), tenant_id: tenantId, environment, engage_url: engageUrl(),
  });
  if (result.outcome === 'delivered') {
    checks.push({ label: 'FCM message delivery', ok: true, detail: 'Google FCM accepted the message for this browser' });
    return done(true, 'delivered', { message: 'Test notification sent via FCM' });
  }
  if (result.outcome === 'invalid_token') await markInvalid(supabase, tenantId, environment, payload.fcm_token);
  const detail = explainFcmError(result.error ?? 'FCM delivery failed');
  checks.push({ label: 'FCM message delivery', ok: false, detail });
  return done(false, 'failed', { error: detail });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const payload = (await req.json().catch(() => null)) as SendRequest | null;
    if (!payload || typeof payload !== 'object') return errorResponse('JSON body required', 400);

    const tenantId = req.headers.get('x-tenant-id') ?? payload.tenant_id;
    const environment = req.headers.get('x-environment') ?? payload.environment ?? 'production';
    if (!tenantId) return errorResponse('Missing tenant_id in request body', 401);
    if (!UUID_RE.test(tenantId)) return errorResponse('Invalid tenant_id', 400);
    if (!ENVS.includes(environment)) return errorResponse('Invalid environment', 400);

    const supabase = getServiceClient();
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

    if (payload.action === 'test_connection') return await handleTestConnection(supabase, tenantId, environment, payload);

    // ---- single immediate send (RTM engine / manual) ----------------------------
    const messageId = crypto.randomUUID();
    const customerId = payload.customer_id && UUID_RE.test(payload.customer_id) ? payload.customer_id : null;

    // A raw token must belong to this workspace's own subscribers.
    let target: { id: string | null; fcm_token: string; customer_id: string | null } | null = null;
    if (payload.fcm_token) {
      const { data } = await supabase.from('web_push_subscribers').select('id, fcm_token, customer_id')
        .eq('tenant_id', tenantId).eq('environment', environment).eq('fcm_token', payload.fcm_token)
        .eq('subscription_status', 'active').maybeSingle();
      target = data;
      // The RTM engine may carry a token from the brand's own app (recipient.push_token).
      if (!target && isServiceCaller(req) && payload.fcm_token.length <= 4096) {
        target = { id: null, fcm_token: payload.fcm_token, customer_id: null };
      }
    } else if (customerId) {
      const { data } = await supabase.from('web_push_subscribers').select('id, fcm_token, customer_id')
        .eq('tenant_id', tenantId).eq('environment', environment).eq('customer_id', customerId)
        .eq('subscription_status', 'active').order('last_seen', { ascending: false }).limit(1).maybeSingle();
      target = data;
    }
    if (!target) return errorResponse('No active push subscription found', 404);
    const resolvedCustomer = customerId ?? target.customer_id;

    if (resolvedCustomer) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: excluded } = await supabase.from('exclusions').select('id')
        .eq('tenant_id', tenantId).eq('customer_id', resolvedCustomer)
        .or('channel.eq.web_push,channel.is.null').lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`).limit(1).maybeSingle();
      if (excluded) return errorResponse('Customer is excluded from web push', 403);
    }

    const content = normalizeContent({ ...payload, click_url: payload.click_action });
    if (!content.title) return errorResponse('title is required', 400);

    let status: 'delivered' | 'failed' = 'failed';
    let errorCode: string | null = null;
    const provider = await loadProvider(supabase, tenantId, environment, payload.provider_id);
    if (!provider) {
      errorCode = 'No default Web Push provider. Add one in Channels → Web Push.';
    } else {
      try {
        const sa = await loadSa(supabase, provider);
        const result = await sendFcm(sa, target.fcm_token, content, {
          message_id: messageId, tenant_id: tenantId, environment,
          journey_id: payload.journey_id ?? null, delivery_id: payload.delivery_id ?? null,
          delivery_name: payload.delivery_name ?? null, engage_url: engageUrl(),
        });
        if (result.outcome === 'delivered') status = 'delivered';
        else {
          errorCode = explainFcmError(result.error ?? 'FCM_ERROR');
          if (result.outcome === 'invalid_token') await markInvalid(supabase, tenantId, environment, target.fcm_token);
        }
      } catch (err) {
        errorCode = err instanceof Error ? err.message : 'FCM_ERROR';
      }
    }

    const journeyId = payload.journey_id && UUID_RE.test(payload.journey_id) ? payload.journey_id : null;
    await supabase.from('engagement_log').insert({
      tenant_id: tenantId, environment, customer_id: resolvedCustomer, channel: 'web_push',
      message_id: messageId, event: status, journey_id: journeyId,
      metadata: {
        title: content.title, body: content.body, click_url: content.click_url ?? null, click_action: content.click_url ?? null,
        delivery_id: payload.delivery_id, delivery_name: payload.delivery_name, subscriber_id: target.id,
        source: 'channel-send', error: errorCode ?? undefined,
      },
    });
    await supabase.from('customer_delivery_log').insert({
      tenant_id: tenantId, environment, customer_id: resolvedCustomer, journey_id: journeyId,
      channel: 'web_push', provider: 'firebase', message_id: messageId, status, error_code: errorCode?.slice(0, 200) ?? null,
    });

    return json({ success: status === 'delivered', message_id: messageId, status, error: errorCode });
  } catch (err) {
    console.error('channel-send unhandled', err instanceof Error ? err.message : err);
    return errorResponse('Internal error', 500);
  }
});
