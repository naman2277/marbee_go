// events-worker — drains q_events_process (v2/56) and evaluates real-time
// triggers off the ingest request path. Invoke on a schedule (pg_cron ->
// net.http_post, or an external cron hitting this function every ~10s).
//
//   supabase functions deploy events-worker
//   curl -X POST "$SUPABASE_URL/functions/v1/events-worker" -H "Authorization: Bearer $SERVICE_ROLE_KEY"

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const QUEUE = 'q_events_process';
const BATCH = 50;
const MAX_LOOPS = 20; // ~1000 messages per invocation, then yield

type QueueMsg = {
  msg_id: number;
  read_ct: number;
  message: {
    tenant_id: string;
    environment: string;
    event_type: string;
    identity?: Record<string, string>;
    properties?: Record<string, unknown>;
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const supabase = getServiceClient();
    let processed = 0;
    let failed = 0;

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      const { data, error } = await supabase.rpc('mq_read', {
        p_queue: QUEUE,
        p_vt_seconds: 60,
        p_qty: BATCH,
      });
      if (error) return errorResponse(`mq_read failed: ${error.message}`, 500);

      const msgs = (data ?? []) as QueueMsg[];
      if (msgs.length === 0) break;

      for (const m of msgs) {
        try {
          await handleEvent(supabase, m.message);
          await supabase.rpc('mq_delete', { p_queue: QUEUE, p_msg_id: m.msg_id });
          processed++;
        } catch (err) {
          failed++;
          // leave the message; visibility timeout returns it for retry.
          console.error('event processing failed', m.msg_id, err);
        }
      }
    }

    return jsonResponse({ ok: true, processed, failed });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});

async function handleEvent(
  supabase: ReturnType<typeof getServiceClient>,
  msg: QueueMsg['message'],
) {
  const { data: triggers } = await supabase
    .from('real_time_triggers')
    .select('id, channel')
    .eq('tenant_id', msg.tenant_id)
    .eq('environment', msg.environment)
    .eq('event_type', msg.event_type)
    .eq('status', 'active')
    .order('priority', { ascending: false });

  if (!triggers?.length) return;

  const rows = triggers.map((t) => ({
    tenant_id: msg.tenant_id,
    environment: msg.environment,
    customer_id: msg.identity?.customer_id ?? null,
    channel: t.channel,
    message_id: crypto.randomUUID(),
    event: 'sent',
    metadata: { trigger_id: t.id, event_type: msg.event_type },
  }));

  const { error } = await supabase.from('engagement_log').insert(rows);
  if (error) throw new Error(error.message);

  // hand each trigger to the channel dispatcher
  await supabase.rpc('mq_send_batch', {
    p_queue: 'q_channel_send',
    p_msgs: triggers.map((t) => ({
      tenant_id: msg.tenant_id,
      environment: msg.environment,
      trigger_id: t.id,
      channel: t.channel,
      identity: msg.identity ?? {},
      properties: msg.properties ?? {},
    })),
  });
}
