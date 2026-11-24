// events-ingest — track events into a tenant.
// SEC-02 (Phase 0): tenant/environment come ONLY from a verified credential:
//   server-to-server: `x-api-key: mk_…` (or `Authorization: Bearer mk_…`), scope events:write
//   browser SDK:      body { site_id, write_key, events: [...] } — origin-checked site key
// The old X-Tenant-Id / X-Environment headers are ignored.
// Deploy with "Enforce JWT Verification" OFF: callers send API/site keys, not Supabase JWTs.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { AuthError } from '../_shared/auth.ts';
import { authenticateIngest, clientIp, rateLimited, tooLarge } from '../_shared/ingest-auth.ts';

const MAX_BODY_BYTES = 512 * 1024;
const MAX_EVENTS = 500;
const EVENT_TYPE_RE = /^[A-Za-z0-9_.:\-]{1,100}$/;

/** Accept client timestamps from the last 30 days up to 1 hour ahead; otherwise use now. */
function safeTimestamp(v: unknown): string {
  const now = Date.now();
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t >= now - 30 * 86_400_000 && t <= now + 3_600_000
    ? new Date(t).toISOString()
    : new Date(now).toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (tooLarge(req, MAX_BODY_BYTES)) return errorResponse('Payload too large', 413);

  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== 'object') return errorResponse('JSON body required', 400);

    const envelope = Array.isArray(body) ? null : (body as Record<string, unknown>);
    const ctx = await authenticateIngest(req, supabase, envelope, 'events:write');

    // Floods: per credential and, for public site keys, per visitor IP too.
    const limiterKey = ctx.via === 'api_key' ? `key:${ctx.tenantId}` : `site:${ctx.siteId}`;
    if (rateLimited(limiterKey, ctx.via === 'api_key' ? 6000 : 1200)) return errorResponse('Rate limit exceeded', 429);
    if (ctx.via === 'site_key' && rateLimited(`ip:${ctx.siteId}:${clientIp(req)}`, 120)) {
      return errorResponse('Rate limit exceeded', 429);
    }

    const events: IngestEvent[] = Array.isArray(body)
      ? body
      : Array.isArray(envelope?.events) ? (envelope!.events as IngestEvent[]) : [envelope as unknown as IngestEvent];
    if (events.length === 0) return errorResponse('No events', 400);
    if (events.length > MAX_EVENTS) return errorResponse(`At most ${MAX_EVENTS} events per request`, 413);
    for (const e of events) {
      if (!e || typeof e.event_type !== 'string' || !EVENT_TYPE_RE.test(e.event_type)) {
        return errorResponse('Each event needs a valid event_type', 400);
      }
    }

    const records = events.map((event) => ({
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      event_type: event.event_type,
      customer_id: event.identity?.customer_id ?? null,
      anonymous_id: event.identity?.anonymous_id ?? null,
      ecid: event.identity?.ecid ?? null,
      timestamp: safeTimestamp(event.timestamp),
      source: ctx.via === 'site_key' ? 'sdk' : (typeof event.source === 'string' ? event.source.slice(0, 50) : 'api'),
      properties: event.properties ?? {},
      context: event.context ?? {},
    }));

    // Bulk insert — the events table is monthly-partitioned (v2/53), the write
    // lands in the current partition with no extra work on the request path.
    const { data, error } = await supabase.from('events').insert(records).select('id, event_type, timestamp');
    if (error) {
      console.error("events insert failed", error.message);
      return errorResponse("Could not store events", 500);
    }

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
    if (err instanceof AuthError) return errorResponse(err.message, err.status);
    console.error("events-ingest unhandled", err instanceof Error ? err.message : err);
    return errorResponse('Internal error', 500);
  }
});

type IngestEvent = {
  event_type: string;
  identity?: Record<string, string>;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp?: string;
  source?: string;
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
