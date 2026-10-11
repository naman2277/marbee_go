// Real-Time Messages — public ingest endpoint.
//
//   POST /functions/v1/rtm-ingest        → the "POST /v1/messages" surface
//   POST /functions/v1/rtm-ingest?dry=1  → render only, never send  (":test")
//
// Deploy with JWT verification OFF. Auth is done here: a tenant-scoped API key
// (Bearer) for external callers, or a Supabase user JWT + X-Tenant-Id for the
// in-console test harness.
//
// Does the minimum synchronously — auth, envelope shape, idempotency, insert,
// 202 — then hands off to the processing pipeline via EdgeRuntime.waitUntil().

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { validatePayload, type SchemaField } from '../_shared/rtm.ts';
import { processMessage } from '../_shared/rtm-process.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-environment, idempotency-key, x-marbee-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function service(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

type Ctx = { tenantId: string; environment: string; via: 'api_key' | 'console' };

async function authenticate(req: Request, supabase: SupabaseClient): Promise<Ctx | { error: string; status: number }> {
  const auth = req.headers.get('authorization') ?? '';
  const raw = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!raw) return { error: 'Missing Authorization: Bearer <key>', status: 401 };

  // 1. tenant-scoped API key
  const { data: keyRows } = await supabase.rpc('verify_api_key', { p_raw_key: raw });
  if (keyRows?.length) {
    const k = keyRows[0];
    const scopes: string[] = k.scopes ?? [];
    if (!scopes.includes('events:write') && !scopes.includes('custom_api:invoke')) {
      return { error: 'API key is missing the events:write scope', status: 403 };
    }
    const environment = req.headers.get('x-environment') || k.environment || 'production';
    return { tenantId: k.tenant_id, environment, via: 'api_key' };
  }

  // 2. console: Supabase user JWT + explicit tenant
  const tenantHeader = req.headers.get('x-tenant-id');
  if (tenantHeader) {
    const { data: userData } = await supabase.auth.getUser(raw);
    if (userData?.user) {
      const { data: member } = await supabase
        .from('tenant_users').select('tenant_id')
        .eq('user_id', userData.user.id).eq('tenant_id', tenantHeader).maybeSingle();
      if (member) {
        return { tenantId: tenantHeader, environment: req.headers.get('x-environment') || 'production', via: 'console' };
      }
    }
  }
  return { error: 'Invalid API key', status: 401 };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = service();
  const dryRun = new URL(req.url).searchParams.get('dry') === '1';

  const ctx = await authenticate(req, supabase);
  if ('error' in ctx) return json({ error: ctx.error }, ctx.status);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be valid JSON' }, 400);
  }

  // ---- envelope shape --------------------------------------------------------
  const event = typeof body.event === 'string' ? body.event.trim() : '';
  if (!event) return json({ error: 'event is required' }, 422);

  const to = (body.to && typeof body.to === 'object' && !Array.isArray(body.to))
    ? body.to as Record<string, unknown> : {};
  if (!to.customer_id && !to.email && !to.phone && !to.push_token) {
    return json({ error: 'to must include one of: customer_id, email, phone, push_token' }, 422);
  }
  const data = (body.data && typeof body.data === 'object' && !Array.isArray(body.data))
    ? body.data as Record<string, unknown> : {};
  const channel = typeof body.channel === 'string' ? body.channel : 'auto';
  const locale = typeof body.locale === 'string' ? body.locale : null;

  // ---- load the definition (for schema validation + fast no_match) ---------
  const { data: def } = await supabase.from('rtm_definitions')
    .select('id, payload_schema, status')
    .eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment)
    .eq('event_type', event).eq('status', 'active')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();

  if (def) {
    const errs = validatePayload((def.payload_schema ?? []) as SchemaField[], data);
    if (errs.length) return json({ error: 'Payload failed validation', fields: errs }, 422);
  }

  // ---- idempotency --------------------------------------------------------
  const idemKey = req.headers.get('idempotency-key')
    || (typeof body.idempotency_key === 'string' ? body.idempotency_key : null);

  if (idemKey) {
    const { data: existing } = await supabase.from('rtm_idempotency')
      .select('message_id').eq('tenant_id', ctx.tenantId).eq('idempotency_key', idemKey).maybeSingle();
    if (existing) {
      return json({ message_id: existing.message_id, status: 'duplicate', event }, 200);
    }
  }

  // ---- create the message row --------------------------------------------
  const messageId = `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();
  const initialState = def
    ? { state: 'accepted', at: now }
    : { state: 'accepted', at: now, detail: 'No active definition at ingest — will re-check on process' };

  const { error: insErr } = await supabase.from('rtm_messages').insert({
    message_id: messageId,
    tenant_id: ctx.tenantId,
    environment: ctx.environment,
    definition_id: def?.id ?? null,
    event_type: event,
    idempotency_key: idemKey,
    recipient: to,
    payload: data,
    channel,
    locale,
    status: 'accepted',
    state_history: [initialState],
  });
  if (insErr) {
    // unique violation on idempotency → someone raced us; return the winner
    if (insErr.code === '23505' && idemKey) {
      const { data: winner } = await supabase.from('rtm_messages')
        .select('message_id').eq('tenant_id', ctx.tenantId).eq('idempotency_key', idemKey).maybeSingle();
      if (winner) return json({ message_id: winner.message_id, status: 'duplicate', event }, 200);
    }
    return json({ error: insErr.message }, 500);
  }

  if (idemKey) {
    await supabase.from('rtm_idempotency').insert({
      tenant_id: ctx.tenantId, idempotency_key: idemKey, message_id: messageId,
    }).then(() => {}, () => {});
  }

  if (def) {
    await supabase.rpc('rtm_bump_usage', {
      p_tenant_id: ctx.tenantId, p_environment: ctx.environment,
      p_definition_id: def.id, p_channel: channel === 'auto' ? 'web_push' : channel,
      p_metric: 'accepted', p_credits: 0,
    });
  }

  // ---- hand off ---------------------------------------------------------
  if (dryRun) {
    // Process synchronously and return the trace instead of firing-and-forgetting.
    await processMessage(supabase, messageId);
    const { data: final } = await supabase.from('rtm_messages').select('*').eq('message_id', messageId).maybeSingle();
    return json({ message_id: messageId, status: final?.status ?? 'unknown', dry_run: true, trace: final }, 200);
  }

  const runner = processMessage(supabase, messageId);
  // deno-lint-ignore no-explicit-any
  const edge = (globalThis as any).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(runner);
  else runner.catch((e) => console.error('processMessage failed', e));

  return json({ message_id: messageId, status: 'accepted', event }, 202);
});
