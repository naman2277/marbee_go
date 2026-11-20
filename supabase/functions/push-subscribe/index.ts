// push-subscribe — register / unregister a browser's FCM token for Web Push.
// SEC-02 (Phase 0): tenant/environment come ONLY from a verified site key
// (body: site_id + write_key, origin-checked) or a secret API key — never from
// X-Tenant-Id. Unsubscribe is scoped to that tenant (it used to need no auth at all).
// Deploy with "Enforce JWT Verification" OFF: website visitors have no Supabase login.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { AuthError } from '../_shared/auth.ts';
import { authenticateIngest, clientIp, rateLimited, tooLarge } from '../_shared/ingest-auth.ts';

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') return errorResponse('Method not allowed', 405);
  if (tooLarge(req, 16 * 1024)) return errorResponse('Payload too large', 413);

  try {
    const supabase = getServiceClient();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('JSON body required', 400);

    const ctx = await authenticateIngest(req, supabase, body, 'events:write');
    if (rateLimited(`push-sub:${ctx.siteId ?? ctx.tenantId}:${clientIp(req)}`, 30)) {
      return errorResponse('Rate limit exceeded', 429);
    }

    const fcmToken = str(body.fcm_token, 4096);
    if (!fcmToken) return errorResponse('fcm_token is required');

    if (req.method === 'DELETE') {
      await supabase
        .from('web_push_subscribers')
        .update({ subscription_status: 'inactive', token_invalidated_at: new Date().toISOString() })
        .eq('tenant_id', ctx.tenantId)
        .eq('environment', ctx.environment)
        .eq('fcm_token', fcmToken);
      return jsonResponse({ success: true });
    }

    const { data, error } = await supabase
      .from('web_push_subscribers')
      .upsert(
        {
          tenant_id: ctx.tenantId,
          environment: ctx.environment,
          fcm_token: fcmToken,
          ecid: str(body.ecid, 200),
          customer_id: str(body.customer_id, 200),
          browser: str(body.browser, 100),
          os: str(body.os, 100),
          device: str(body.device, 50),
          permission_status: str(body.permission_status, 20) ?? 'granted',
          subscription_status: 'active',
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,environment,fcm_token' },
      )
      .select('id, subscription_status, last_seen')
      .single();

    if (error) {
      console.error('push-subscribe upsert failed', error.message);
      return errorResponse('Could not save subscription', 500);
    }

    // Create channel endpoint (best-effort)
    await supabase.from('channel_endpoints').insert({
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      subscriber_id: data.id,
      channel: 'web_push',
      provider: 'firebase',
      address: fcmToken,
      status: 'active',
    });

    return jsonResponse({ success: true, subscriber: data });
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, err.status);
    console.error('push-subscribe unhandled', err instanceof Error ? err.message : err);
    return errorResponse('Internal error', 500);
  }
});
