import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { tenantIsActive } from '../_shared/tenant-guard.ts';

type EngageRequest = {
  tenant_id: string;
  environment?: string;
  message_id: string;
  event: 'opened' | 'clicked';
  delivery_id?: string;
  delivery_name?: string;
  journey_id?: string;
  title?: string;
  body?: string;
  click_url?: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  // SEC-02 (Phase 0): an open/click can only be recorded against a message Marbee
  // actually sent (an existing sent/delivered/failed row for that tenant + message).
  // Title, body and click_url come ONLY from that stored message — never from the
  // request — so /push/open can't be turned into an open redirect or fake-stats tool.
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const payload = (await req.json().catch(() => null)) as EngageRequest | null;
    if (!payload || typeof payload !== 'object') return errorResponse('JSON body required', 400);
    const tenantId = payload.tenant_id;
    const environment = payload.environment ?? 'production';
    const messageId = payload.message_id;
    const event = payload.event;

    if (!tenantId || !messageId || !event) {
      return errorResponse('Missing tenant_id, message_id, or event', 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return errorResponse('Invalid tenant_id', 400);
    }
    if (typeof messageId !== 'string' || messageId.length > 200) return errorResponse('Invalid message_id', 400);
    if (!['production', 'staging', 'development'].includes(environment)) return errorResponse('Invalid environment', 400);
    if (event !== 'opened' && event !== 'clicked') {
      return errorResponse('event must be opened or clicked', 400);
    }

    const supabase = getServiceClient();
    if (!(await tenantIsActive(supabase, tenantId))) return errorResponse('This workspace is suspended', 403);

    const { data: duplicate } = await supabase
      .from('engagement_log')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .eq('message_id', messageId)
      .eq('event', event)
      .maybeSingle();

    const { data: original, error: lookupError } = await supabase
      .from('engagement_log')
      .select('customer_id, channel, journey_id, metadata')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .eq('message_id', messageId)
      .in('event', ['sent', 'delivered', 'failed'])
      .order('timestamp', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error('push-engage lookup failed', lookupError.message);
      return errorResponse('Could not record engagement', 500);
    }
    if (!original) return errorResponse('Message not found', 404);

    const meta = (original.metadata ?? {}) as Record<string, unknown>;
    const customerId: string | null = original.customer_id;
    const channel: string = original.channel;
    const journeyId: string | null = original.journey_id;

    if (duplicate) {
      return jsonResponse({
        success: true,
        duplicate: true,
        event,
        title: meta.title ?? null,
        body: meta.body ?? null,
        click_url: meta.click_url ?? meta.click_action ?? null,
        delivery_id: meta.delivery_id ?? null,
        delivery_name: meta.delivery_name ?? null,
      });
    }

    const { error: insertError } = await supabase.from('engagement_log').insert({
      tenant_id: tenantId,
      environment,
      customer_id: customerId,
      channel,
      message_id: messageId,
      event,
      journey_id: journeyId,
      metadata: { ...meta, engagement_source: 'push_open' },
    });

    if (insertError) {
      console.error('push-engage insert failed', insertError.message);
      return errorResponse('Could not record engagement', 500);
    }

    return jsonResponse({
      success: true,
      event,
      title: meta.title ?? null,
      body: meta.body ?? null,
      click_url: meta.click_url ?? meta.click_action ?? null,
      delivery_id: meta.delivery_id ?? null,
      delivery_name: meta.delivery_name ?? null,
    });
  } catch (err) {
    console.error('push-engage unhandled', err instanceof Error ? err.message : err);
    return errorResponse('Internal error', 500);
  }
});
