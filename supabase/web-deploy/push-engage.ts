// Paste into Supabase Dashboard → Edge Functions → push-engage → Deploy
// Turn OFF "Enforce JWT Verification" (public push click tracking)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();
    const tenantId = payload.tenant_id;
    const environment = payload.environment ?? 'production';
    const messageId = payload.message_id;
    const event = payload.event;

    if (!tenantId || !messageId || !event) {
      return json({ error: 'Missing tenant_id, message_id, or event' }, 400);
    }
    if (event !== 'opened' && event !== 'clicked') {
      return json({ error: 'event must be opened or clicked' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

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

    if (lookupError) return json({ error: lookupError.message }, 500);

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
        engagement_source: 'push_open_fallback',
      };
      if (!meta.delivery_id && !meta.delivery_name) {
        return json({ error: 'Message not found' }, 404);
      }
    }

    if (!journeyId && payload.journey_id) {
      journeyId = payload.journey_id;
    }

    if (duplicate) {
      return json({
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

    if (insertError) return json({ error: insertError.message }, 500);

    return json({
      success: true,
      event,
      title: meta.title ?? null,
      body: meta.body ?? null,
      click_url: meta.click_url ?? meta.click_action ?? null,
      delivery_id: meta.delivery_id ?? null,
      delivery_name: meta.delivery_name ?? null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
