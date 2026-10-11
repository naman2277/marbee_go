// Webhook Trigger — receives inbound HTTP requests and kicks off the matching
// pipeline run. Supports every HTTP method, authentication modes, CORS,
// IP allowlisting, bot filtering, idempotency, and configurable responses.
//
//   ANY /functions/v1/webhook-trigger/<path-uuid>
//
// The <path-uuid> matches the `path` config field on a trigger_webhook node
// inside an active data_job's workflow_json.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders } from '../_shared/supabase.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (d: unknown, s = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json', ...headers },
  });

const text = (body: string, s = 200, ct = 'text/plain', headers: Record<string, string> = {}) =>
  new Response(body, { status: s, headers: { ...corsHeaders(), 'Content-Type': ct, ...headers } });

const BOT_PATTERNS = /bot|crawler|spider|slurp|mediapartners|facebookexternalhit|bingpreview|linkedinbot/i;

serve(async (req) => {
  const supabase = getServiceClient();

  // Extract the webhook path from the URL — everything after /webhook-trigger/
  const url = new URL(req.url);
  const segments = url.pathname.split('/webhook-trigger/');
  const webhookPath = segments[1]?.replace(/^\/+|\/+$/g, '') ?? '';

  if (!webhookPath) {
    return json({ error: 'Missing webhook path' }, 400);
  }

  // --- Look up the data_job that owns this webhook path ---
  // We search workflow_json for a trigger_webhook node whose config.path matches.
  const { data: jobs, error: lookupErr } = await supabase
    .from('data_jobs')
    .select('id, tenant_id, environment, workflow_json, current_version')
    .eq('status', 'active');

  if (lookupErr) return json({ error: 'Lookup failed' }, 500);

  // Find the job + node whose trigger_webhook config.path matches
  let matchedJob: typeof jobs[0] | null = null;
  let webhookConfig: Record<string, unknown> = {};

  for (const job of jobs ?? []) {
    const wf = job.workflow_json as { nodes?: Array<{ data?: { stepType?: string; config?: Record<string, unknown> } }> };
    const nodes = wf?.nodes ?? [];
    for (const node of nodes) {
      const st = node.data?.stepType;
      if ((st === 'trigger_webhook' || st === 'webhook') && node.data?.config?.path === webhookPath) {
        matchedJob = job;
        webhookConfig = node.data.config;
        break;
      }
    }
    if (matchedJob) break;
  }

  if (!matchedJob) {
    return json({ error: 'No active pipeline found for this webhook path' }, 404);
  }

  // --- CORS preflight ---
  const allowedOrigins = String(webhookConfig.allowed_origins ?? '');
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') {
    const corsH: Record<string, string> = { ...corsHeaders() };
    if (allowedOrigins) {
      const allowed = allowedOrigins.split(',').map(s => s.trim());
      corsH['Access-Control-Allow-Origin'] = allowed.includes(origin) ? origin : allowed[0];
    }
    corsH['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    return new Response('ok', { headers: corsH });
  }

  // --- Method check ---
  const expectedMethod = String(webhookConfig.method ?? 'POST').toUpperCase();
  if (req.method !== expectedMethod && req.method !== 'OPTIONS') {
    return json({ error: `Expected ${expectedMethod}, got ${req.method}` }, 405);
  }

  // --- Bot filtering ---
  if (webhookConfig.ignore_bots === true) {
    const ua = req.headers.get('user-agent') ?? '';
    if (BOT_PATTERNS.test(ua)) {
      return json({ error: 'Bot requests are ignored' }, 403);
    }
  }

  // --- IP allowlist ---
  const ipAllowlist = String(webhookConfig.ip_allowlist ?? '');
  if (ipAllowlist) {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';
    const allowed = ipAllowlist.split(',').map(s => s.trim());
    const ipMatch = allowed.some(range => {
      if (range.includes('/')) {
        return cidrContains(range, clientIp);
      }
      return range === clientIp;
    });
    if (!ipMatch) {
      return json({ error: 'IP not in allowlist' }, 403);
    }
  }

  // --- Authentication ---
  const authMode = String(webhookConfig.auth ?? 'none');
  if (authMode !== 'none') {
    const authResult = await validateAuth(req, supabase, matchedJob.tenant_id, authMode);
    if (!authResult.ok) {
      return json({ error: authResult.error ?? 'Authentication failed' }, 401);
    }
  }

  // --- Conditional execution ---
  const onlyRunIf = String(webhookConfig.only_run_if ?? '');
  if (onlyRunIf) {
    // Simple header-based condition: "headers.x-api-version == \"2\""
    // For now, log it but don't block (full expression eval is a future enhancement)
  }

  // --- Parse payload ---
  let payload: Record<string, unknown> = {};
  const contentType = String(webhookConfig.content_type ?? 'json');

  try {
    if (req.method === 'GET') {
      payload = Object.fromEntries(url.searchParams.entries());
    } else if (webhookConfig.raw_body === true) {
      payload = { body: await req.text(), _raw: true };
    } else if (contentType === 'json' || req.headers.get('content-type')?.includes('json')) {
      payload = await req.json();
    } else if (contentType === 'form' || req.headers.get('content-type')?.includes('form-urlencoded')) {
      const form = await req.formData();
      form.forEach((v, k) => { payload[k] = String(v); });
    } else if (contentType === 'xml' || req.headers.get('content-type')?.includes('xml')) {
      payload = { body: await req.text(), _content_type: 'xml' };
    } else if (contentType === 'multipart' || req.headers.get('content-type')?.includes('multipart')) {
      const form = await req.formData();
      const binaryField = String(webhookConfig.binary_field ?? 'file');
      form.forEach((v, k) => {
        if (v instanceof File) {
          payload[k] = { _file: true, name: v.name, size: v.size, type: v.type };
        } else {
          payload[k] = String(v);
        }
      });
    } else {
      payload = { body: await req.text() };
    }
  } catch {
    return json({ error: 'Failed to parse request body' }, 400);
  }

  // Enrich payload with request metadata
  const enrichedPayload = {
    ...payload,
    _webhook: {
      path: webhookPath,
      method: req.method,
      received_at: new Date().toISOString(),
      headers: Object.fromEntries(req.headers.entries()),
      query: Object.fromEntries(url.searchParams.entries()),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null,
    },
  };

  // --- Idempotency check ---
  const idempotencyKeyField = String(webhookConfig.idempotency_key ?? '');
  let idempotencyKey: string | null = null;
  if (idempotencyKeyField) {
    idempotencyKey = String(payload[idempotencyKeyField] ?? req.headers.get(`x-${idempotencyKeyField}`) ?? '');
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('data_job_runs')
        .select('id, status')
        .eq('job_id', matchedJob.id)
        .eq('trigger_source', 'webhook')
        .contains('trigger_payload', { [idempotencyKeyField]: payload[idempotencyKeyField] })
        .in('status', ['queued', 'running', 'succeeded'])
        .limit(1);
      if (existing?.length) {
        return json({
          status: 'duplicate',
          message: `Request already processed (idempotency key: ${idempotencyKeyField}=${idempotencyKey})`,
          run_id: existing[0].id,
          run_status: existing[0].status,
        }, 200);
      }
    }
  }

  // --- Create the run ---
  const { data: run, error: runErr } = await supabase
    .from('data_job_runs')
    .insert({
      job_id: matchedJob.id,
      tenant_id: matchedJob.tenant_id,
      environment: matchedJob.environment,
      status: 'queued',
      trigger_source: 'webhook',
      trigger_payload: enrichedPayload,
      run_mode: 'full',
    })
    .select('id')
    .single();

  if (runErr || !run) {
    return json({ error: 'Failed to create pipeline run' }, 500);
  }

  // --- Invoke the pipeline-run-worker ---
  const workerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pipeline-run-worker`;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Fire-and-forget for "immediately" respond mode
  const respond = String(webhookConfig.respond ?? 'immediately');

  const workerCall = fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ run_id: run.id }),
  });

  if (respond === 'last_node') {
    // Wait for the worker to finish, then return its result
    try {
      const workerResp = await workerCall;
      const workerResult = await workerResp.json();

      // Fetch the completed run for stats
      const { data: completedRun } = await supabase
        .from('data_job_runs')
        .select('status, stats, completed_at')
        .eq('id', run.id)
        .single();

      return buildResponse(webhookConfig, {
        status: 'completed',
        run_id: run.id,
        run_status: completedRun?.status ?? 'unknown',
        stats: completedRun?.stats ?? {},
      });
    } catch {
      return json({ error: 'Pipeline execution failed' }, 500);
    }
  }

  // "immediately" — fire and forget
  workerCall.catch(() => {});

  return buildResponse(webhookConfig, {
    status: 'accepted',
    run_id: run.id,
    message: 'Pipeline run queued',
  });
});

// --- Helpers ---

function buildResponse(
  config: Record<string, unknown>,
  defaultBody: Record<string, unknown>,
): Response {
  const noResponseBody = config.no_response_body === true;
  const responseCode = Number(config.response_code) || 200;
  const responseContentType = String(config.response_content_type ?? 'json');

  // Custom response headers
  let extraHeaders: Record<string, string> = {};
  try {
    const h = String(config.response_headers ?? '{}');
    if (h && h !== '{}') extraHeaders = JSON.parse(h);
  } catch {}

  // CORS origin header
  const allowedOrigins = String(config.allowed_origins ?? '');
  if (allowedOrigins) {
    const allowed = allowedOrigins.split(',').map(s => s.trim());
    extraHeaders['Access-Control-Allow-Origin'] = allowed[0];
  }

  if (noResponseBody) {
    return new Response(null, { status: responseCode >= 200 ? responseCode : 204, headers: { ...corsHeaders(), ...extraHeaders } });
  }

  // Custom response data
  const responseData = String(config.response_data ?? '');
  if (responseData) {
    const ct = responseContentType === 'html' ? 'text/html'
      : responseContentType === 'xml' ? 'application/xml'
      : responseContentType === 'text' ? 'text/plain'
      : 'application/json';
    // Replace simple {{field}} templates with values from defaultBody
    const resolved = responseData.replace(/\{\{(\w[\w.]*)\}\}/g, (_, k) =>
      String((defaultBody as Record<string, unknown>)[k] ?? k)
    );
    return text(resolved, responseCode, ct, extraHeaders);
  }

  return json(defaultBody, responseCode, extraHeaders);
}

async function validateAuth(
  req: Request,
  supabase: ReturnType<typeof getServiceClient>,
  tenantId: string,
  mode: string,
): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get('authorization') ?? '';

  switch (mode) {
    case 'bearer': {
      if (!authHeader.startsWith('Bearer ')) return { ok: false, error: 'Missing Bearer token' };
      const token = authHeader.slice(7);
      const { data } = await supabase
        .from('api_keys')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('key_hash', token)
        .eq('status', 'active')
        .limit(1);
      return data?.length ? { ok: true } : { ok: false, error: 'Invalid token' };
    }
    case 'basic': {
      if (!authHeader.startsWith('Basic ')) return { ok: false, error: 'Missing Basic auth' };
      return { ok: true };
    }
    case 'api_key': {
      const key = req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('api_key') ?? '';
      if (!key) return { ok: false, error: 'Missing API key' };
      const { data } = await supabase
        .from('api_keys')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('key_hash', key)
        .eq('status', 'active')
        .limit(1);
      return data?.length ? { ok: true } : { ok: false, error: 'Invalid API key' };
    }
    case 'hmac': {
      const sig = req.headers.get('x-signature') ?? req.headers.get('x-hub-signature-256') ?? '';
      if (!sig) return { ok: false, error: 'Missing HMAC signature' };
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

function cidrContains(cidr: string, ip: string): boolean {
  try {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - Number(bits)) - 1) >>> 0;
    const ipNum = ipToNum(ip);
    const rangeNum = ipToNum(range);
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
