// push-subscribe — website push SDK backend (D-022).
//
//   POST { action: 'config', site_id, write_key }            → public Firebase web config,
//        VAPID public key and prompt settings for this site's workspace (all public values).
//   POST { site_id, write_key, fcm_token, ecid?, browser?, os?, device?, permission_status?, old_token? }
//        → save / refresh this browser's subscription; sends the welcome push (server-side,
//          through the outbox) the first time a browser subscribes.
//   DELETE { site_id, write_key, fcm_token } → unsubscribe this browser.
//
// SEC-02: tenant/environment come ONLY from a verified site key (origin-checked) or a
// secret API key — never from the request. A browser can only be linked to a customer
// SERVER-SIDE: through its website anonymous id (ecid) in customer_identities, or by a
// caller holding a secret API key. A `customer_id` sent with a public site key is ignored,
// otherwise anyone could attach their own browser to someone else's notifications.
// Deploy with "Enforce JWT Verification" OFF: website visitors have no Supabase login.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { AuthError } from '../_shared/auth.ts';
import { authenticateIngest, clientIp, rateLimited, tooLarge } from '../_shared/ingest-auth.ts';

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// FCM registration tokens: URL-safe base64 + ':' / '-' / '_'.
const TOKEN_RE = /^[A-Za-z0-9:_\-]{20,4096}$/;

type Behavior = Record<string, unknown>;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST' && req.method !== 'DELETE') return errorResponse('Method not allowed', 405);
  if (tooLarge(req, 16 * 1024)) return errorResponse('Payload too large', 413);

  try {
    const supabase = getServiceClient();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('JSON body required', 400);

    const ctx = await authenticateIngest(req, supabase, body, 'events:write');
    const ip = clientIp(req);
    if (rateLimited(`push-sub:${ctx.siteId ?? ctx.tenantId}:${ip}`, 30)) return errorResponse('Rate limit exceeded', 429);

    const { data: provider } = await supabase.from('channel_providers').select('id, config, status')
      .eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).eq('channel', 'web_push')
      .eq('is_default', true).limit(1).maybeSingle();
    const cfg = (provider?.config ?? {}) as Record<string, unknown>;
    const behavior = (cfg.web_push ?? {}) as Behavior;

    // ---- public config for the SDK --------------------------------------------------
    if (body.action === 'config') {
      if (!provider || provider.status === 'disabled') return errorResponse('Web Push is not set up for this website', 404);
      const s = (k: string) => (typeof cfg[k] === 'string' ? String(cfg[k]).trim() : '');
      if (!s('api_key') || !s('project_id') || !s('sender_id') || !s('app_id') || !s('vapid_public_key')) {
        return errorResponse('Web Push is not fully configured for this website', 404);
      }
      return jsonResponse({
        firebase: {
          apiKey: s('api_key'),
          authDomain: s('auth_domain') || `${s('project_id')}.firebaseapp.com`,
          projectId: s('project_id'),
          messagingSenderId: s('sender_id'),
          appId: s('app_id'),
        },
        vapid_public_key: s('vapid_public_key'),
        prompt: {
          enabled: behavior.prompt_enabled !== false,
          delay_ms: Math.min(Math.max(Number(behavior.prompt_delay_ms ?? 4000) || 0, 0), 120000),
          title: String(behavior.prompt_title ?? 'Stay in the loop').slice(0, 120),
          message: String(behavior.prompt_message ?? 'Get timely updates in your browser.').slice(0, 300),
          accept_label: String(behavior.prompt_accept_label ?? 'Allow').slice(0, 40),
          dismiss_label: String(behavior.prompt_dismiss_label ?? 'Not now').slice(0, 40),
          icon_url: typeof behavior.default_icon_url === 'string' ? behavior.default_icon_url.slice(0, 500) : null,
        },
      });
    }

    const fcmToken = str(body.fcm_token, 4096);
    if (!fcmToken || !TOKEN_RE.test(fcmToken)) return errorResponse('fcm_token is required');

    if (req.method === 'DELETE') {
      const { data: gone } = await supabase.from('web_push_subscribers')
        .update({ subscription_status: 'inactive', token_invalidated_at: new Date().toISOString() })
        .eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).eq('fcm_token', fcmToken)
        .select('id');
      const ids = (gone ?? []).map((r: { id: string }) => r.id);
      if (ids.length) await supabase.from('channel_endpoints').update({ status: 'inactive' }).eq('tenant_id', ctx.tenantId).in('subscriber_id', ids);
      return jsonResponse({ success: true });
    }

    // Token rotated by the browser: retire the old one, and keep its customer link (otherwise a
    // linked customer silently drops out of campaigns whenever Chrome rotates the token). The old
    // token is a long random secret only that browser knows; the link never leaves this workspace.
    const oldToken = str(body.old_token, 4096);
    let inheritedCustomer: string | null = null;
    if (oldToken && oldToken !== fcmToken && TOKEN_RE.test(oldToken)) {
      const { data: old } = await supabase.from('web_push_subscribers')
        .update({ subscription_status: 'inactive', token_invalidated_at: new Date().toISOString() })
        .eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).eq('fcm_token', oldToken)
        .select('customer_id');
      inheritedCustomer = (old ?? []).map((r: { customer_id: string | null }) => r.customer_id).find(Boolean) ?? null;
    }

    // Website anonymous id (analytics SDK: "mb_<uuid>"). Strictly validated, never "cleaned":
    // a value that fails the pattern is simply not used for linking or stored.
    const rawEcid = str(body.ecid, 200);
    const ecid = rawEcid && /^[A-Za-z0-9_.-]{8,200}$/.test(rawEcid) ? rawEcid : null;
    // Who is this browser? Only the server decides (see header).
    let customerId: string | null = null;
    if (ctx.via === 'api_key' && typeof body.customer_id === 'string' && UUID_RE.test(body.customer_id)) {
      const { data: c } = await supabase.from('customers').select('id')
        .eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).eq('id', body.customer_id).maybeSingle();
      customerId = c?.id ?? null;
    }
    if (!customerId && inheritedCustomer) customerId = inheritedCustomer;
    if (!customerId && ecid) {
      const { data: ident } = await supabase.from('customer_identities').select('customer_id')
        .eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment)
        .or(`ecid.eq.${ecid},anonymous_id.eq.${ecid}`)
        .not('customer_id', 'is', null).limit(1).maybeSingle();
      customerId = ident?.customer_id ?? null;
    }

    const { data: existing } = await supabase.from('web_push_subscribers').select('id, subscription_status, customer_id')
      .eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).eq('fcm_token', fcmToken).maybeSingle();

    const row: Record<string, unknown> = {
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      fcm_token: fcmToken,
      ecid,
      browser: str(body.browser, 100),
      os: str(body.os, 100),
      device: str(body.device, 50),
      permission_status: 'granted',
      subscription_status: 'active',
      token_invalidated_at: null,
      last_seen: new Date().toISOString(),
    };
    // Never un-link a known customer because this request couldn't identify them.
    if (customerId) row.customer_id = customerId;
    // Which website this browser subscribed on — only from the verified site key, never the body.
    if (ctx.via === 'site_key' && ctx.siteId) row.site_id = ctx.siteId;

    const { data, error } = await supabase.from('web_push_subscribers')
      .upsert(row, { onConflict: 'tenant_id,environment,fcm_token' })
      .select('id').single();
    if (error) {
      console.error('push-subscribe upsert failed', error.message);
      return errorResponse('Could not save subscription', 500);
    }

    const { data: endpoint } = await supabase.from('channel_endpoints').select('id')
      .eq('tenant_id', ctx.tenantId).eq('subscriber_id', data.id).eq('channel', 'web_push').limit(1).maybeSingle();
    if (endpoint) {
      await supabase.from('channel_endpoints').update({ status: 'active', address: fcmToken }).eq('id', endpoint.id);
    } else {
      await supabase.from('channel_endpoints').insert({
        tenant_id: ctx.tenantId, environment: ctx.environment, subscriber_id: data.id,
        channel: 'web_push', provider: 'firebase', address: fcmToken, status: 'active',
      });
    }

    // Welcome push — first subscription of this browser only; idempotent by device.
    const isNew = !existing || existing.subscription_status !== 'active';
    let welcome = false;
    if (isNew && behavior.welcome_enabled !== false && provider && provider.status !== 'disabled') {
      const { data: q, error: qErr } = await supabase.rpc('enqueue_web_push_internal', {
        p_tenant_id: ctx.tenantId,
        p_environment: ctx.environment,
        p_customer_ids: [],
        p_subscriber_ids: [data.id],
        p_content: {
          title: String(behavior.welcome_title ?? 'Notifications enabled').slice(0, 200),
          body: String(behavior.welcome_body ?? 'You will receive updates from us here.').slice(0, 1000),
          click_url: typeof behavior.welcome_click_url === 'string' ? behavior.welcome_click_url : '/',
          icon_url: typeof behavior.default_icon_url === 'string' ? behavior.default_icon_url : undefined,
          tag: 'marbee-welcome',
        },
        p_idempotency_key: `welcome:${data.id}`,
        p_delivery_name: 'Welcome notification',
      });
      if (qErr) console.error('welcome enqueue failed', qErr.message);
      welcome = Number((q as { queued?: number } | null)?.queued ?? 0) > 0;
    }

    return jsonResponse({ success: true, subscribed: true, welcome_queued: welcome });
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, err.status);
    console.error('push-subscribe unhandled', err instanceof Error ? err.message : err);
    return errorResponse('Internal error', 500);
  }
});
