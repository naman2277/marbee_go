import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';

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

  try {
    const payload = (await req.json()) as EngageRequest;
    const tenantId = payload.tenant_id;
    const environment = payload.environment ?? 'production';
    const messageId = payload.message_id;
    const event = payload.event;

    if (!tenantId || !messageId || !event) {
      return errorResponse('Missing tenant_id, message_id, or event', 400);
    }
    if (event !== 'opened' && event !== 'clicked') {
      return errorResponse('event must be opened or clicked', 400);
    }

    const supabase = getServiceClient();

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

    if (lookupError) return errorResponse(lookupError.message, 500);

    let meta: Record<string, unknown>;
    let customerId: string | null = null;
    let channel = 'web_push';
    let journeyId: string | null = null;

    if (original) {
      meta = (original.metadata ?? {}) as Record<string, unknown>;
      customerId = original.customer_id;
      channel = original.channel;
      journeyId = original.journey_id;
    } else {
      meta = {
        delivery_id: payload.delivery_id ?? null,
        delivery_name: payload.delivery_name ?? null,
        title: payload.title ?? null,
        body: payload.body ?? null,
        click_url: payload.click_url ?? null,
      };
      if (!meta.delivery_id && !meta.delivery_name) {
        return errorResponse('Message not found', 404);
      }
    }

    if (!journeyId && payload.journey_id) {
      journeyId = payload.journey_id;
    }

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

    if (insertError) return errorResponse(insertError.message, 500);

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
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});
