import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse, resolveTenantContext } from '../_shared/supabase.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  if (req.method === 'DELETE') {
    const supabase = getServiceClient();
    const { fcm_token } = await req.json();
    await supabase
      .from('web_push_subscribers')
      .update({ subscription_status: 'inactive', token_invalidated_at: new Date().toISOString() })
      .eq('fcm_token', fcm_token);
    return jsonResponse({ success: true });
  }

  try {
    const supabase = getServiceClient();
    const ctx = await resolveTenantContext(req);
    if ('error' in ctx) return errorResponse(ctx.error, 401);

    const { fcm_token, ecid, customer_id, browser, os, device, permission_status } = await req.json();

    if (!fcm_token) return errorResponse('fcm_token is required');

    const { data, error } = await supabase
      .from('web_push_subscribers')
      .upsert(
        {
          tenant_id: ctx.tenantId,
          environment: ctx.environment,
          fcm_token,
          ecid: ecid ?? null,
          customer_id: customer_id ?? null,
          browser: browser ?? null,
          os: os ?? null,
          device: device ?? null,
          permission_status: permission_status ?? 'granted',
          subscription_status: 'active',
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,environment,fcm_token' },
      )
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    // Create channel endpoint (best-effort)
    await supabase.from('channel_endpoints').insert({
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      subscriber_id: data.id,
      channel: 'web_push',
      provider: 'firebase',
      address: fcm_token,
      status: 'active',
    });

    return jsonResponse({ success: true, subscriber: data });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});
