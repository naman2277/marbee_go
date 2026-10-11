import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse, resolveTenantContext } from '../_shared/supabase.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const supabase = getServiceClient();
    const ctx = await resolveTenantContext(req);
    if ('error' in ctx) return errorResponse(ctx.error, 401);

    const body = await req.json();
    const events = Array.isArray(body) ? body : [body];

    const records = events.map((event) => ({
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      event_type: event.event_type,
      customer_id: event.identity?.customer_id ?? null,
      anonymous_id: event.identity?.anonymous_id ?? null,
      ecid: event.identity?.ecid ?? null,
      timestamp: event.timestamp ?? new Date().toISOString(),
      source: event.source ?? 'api',
      properties: event.properties ?? {},
      context: event.context ?? {},
    }));

    // Bulk insert — the events table is monthly-partitioned (v2/53), the write
    // lands in the current partition with no extra work on the request path.
    const { data, error } = await supabase.from('events').insert(records).select('id, event_type, timestamp');
    if (error) return errorResponse(error.message, 500);

    // Fan trigger evaluation OUT to a worker via the queue (v2/56). This keeps
    // ingest latency flat regardless of how many real-time triggers a tenant has.
    const enqueued = await enqueueForProcessing(supabase, ctx.tenantId, ctx.environment, events, data ?? []);

    // Graceful degradation: if the queue RPC isn't deployed yet, do the old
    // inline evaluation so nothing is dropped.
    if (!enqueued) {
      for (const event of events) {
        await evaluateRealTimeTriggers(supabase, ctx.tenantId, ctx.environment, event);
      }
    }

    return jsonResponse({ success: true, queued: enqueued, events: data });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});

type IngestEvent = {
  event_type: string;
  identity?: Record<string, string>;
  properties?: Record<string, unknown>;
};

async function enqueueForProcessing(
  supabase: ReturnType<typeof getServiceClient>,
  tenantId: string,
  environment: string,
  events: IngestEvent[],
  inserted: Array<{ id: string; event_type: string; timestamp: string }>,
): Promise<boolean> {
  const messages = events.map((event, i) => ({
    tenant_id: tenantId,
    environment,
    event_id: inserted[i]?.id ?? null,
    event_type: event.event_type,
    identity: event.identity ?? {},
    properties: event.properties ?? {},
    ts: inserted[i]?.timestamp ?? new Date().toISOString(),
  }));

  const { error } = await supabase.rpc('mq_send_batch', {
    p_queue: 'q_events_process',
    p_msgs: messages,
  });

  if (error) {
    console.warn('mq_send_batch unavailable, falling back to inline trigger eval:', error.message);
    return false;
  }
  return true;
}

// Retained as the fallback path (pre-v2/56) and reused by the events-worker.
async function evaluateRealTimeTriggers(
  supabase: ReturnType<typeof getServiceClient>,
  tenantId: string,
  environment: string,
  event: IngestEvent,
) {
  const { data: triggers } = await supabase
    .from('real_time_triggers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('event_type', event.event_type)
    .eq('status', 'active')
    .order('priority', { ascending: false });

  if (!triggers?.length) return;

  const rows = triggers.map((trigger) => ({
    tenant_id: tenantId,
    environment,
    customer_id: event.identity?.customer_id ?? null,
    channel: trigger.channel,
    message_id: crypto.randomUUID(),
    event: 'sent',
    metadata: { trigger_id: trigger.id, event_type: event.event_type },
  }));

  // one batched insert instead of N round-trips
  await supabase.from('engagement_log').insert(rows);
}
