// Deploy: supabase functions deploy tenant-api
// Dashboard: paste this file, JWT verification OFF for public API access via Bearer key

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
};

type ApiKeyCtx = { keyId: string; tenantId: string; environment: string; scopes: string[] };
type PipelineStep = Record<string, unknown>;
type ExecContext = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

async function verifyApiKey(supabase: ReturnType<typeof getServiceClient>, rawKey: string): Promise<ApiKeyCtx | null> {
  const { data, error } = await supabase.rpc('verify_api_key', { p_raw_key: rawKey });
  if (error || !data?.length) return null;
  const row = data[0] as { key_id: string; tenant_id: string; environment: string; scopes: string[] };
  return {
    keyId: row.key_id,
    tenantId: row.tenant_id,
    environment: row.environment,
    scopes: row.scopes ?? [],
  };
}

function hasScope(ctx: ApiKeyCtx, scope: string) {
  return ctx.scopes.includes(scope);
}

function pickField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitizeValue(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      if (FORBIDDEN_KEYS.test(k)) continue;
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 500);
}

const FORBIDDEN_KEYS = /__(proto|define|lookup)__|constructor|prototype/i;

async function executePipeline(
  supabase: ReturnType<typeof getServiceClient>,
  apiKey: ApiKeyCtx,
  steps: PipelineStep[],
  req: Request,
  bodyText: string,
): Promise<Response> {
  const ctx: ExecContext = { query: Object.fromEntries(new URL(req.url).searchParams) };
  let parsedBody: Record<string, unknown> | null = null;

  for (const step of steps) {
    const type = String(step.type ?? '');

    switch (type) {
      case 'require_scope': {
        const scope = String(step.scope ?? '');
        if (!hasScope(apiKey, scope)) {
          return json({ error: `Missing required scope: ${scope}` }, 403);
        }
        break;
      }
      case 'parse_body': {
        const maxBytes = Number(step.max_bytes ?? 32768);
        if (bodyText.length > maxBytes) {
          return json({ error: 'Request body too large' }, 413);
        }
        if (bodyText.trim()) {
          try {
            const parsed = JSON.parse(bodyText);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              return json({ error: 'Body must be a JSON object' }, 400);
            }
            parsedBody = parsed as Record<string, unknown>;
            ctx.body = parsedBody;
          } catch {
            return json({ error: 'Invalid JSON body' }, 400);
          }
        } else {
          parsedBody = {};
          ctx.body = parsedBody;
        }
        break;
      }
      case 'track_event': {
        if (!hasScope(apiKey, 'events:write')) {
          return json({ error: 'Missing scope events:write' }, 403);
        }
        const source = { ...(parsedBody ?? {}), ...ctx };
        const eventType = step.event_type
          ? String(step.event_type)
          : String(pickField(source as Record<string, unknown>, String(step.event_type_field ?? 'event_type')) ?? '');
        if (!eventType || eventType.length > 120) {
          return json({ error: 'event_type is required' }, 400);
        }
        const identity = pickField(source as Record<string, unknown>, String(step.identity_field ?? 'identity'));
        const properties = pickField(source as Record<string, unknown>, String(step.properties_field ?? 'properties'));
        const { error } = await supabase.from('events').insert({
          tenant_id: apiKey.tenantId,
          environment: apiKey.environment,
          event_type: eventType,
          customer_id: identity && typeof identity === 'object'
            ? String((identity as Record<string, unknown>).customer_id ?? '') || null
            : null,
          anonymous_id: identity && typeof identity === 'object'
            ? String((identity as Record<string, unknown>).anonymous_id ?? '') || null
            : null,
          ecid: identity && typeof identity === 'object'
            ? String((identity as Record<string, unknown>).ecid ?? '') || null
            : null,
          timestamp: new Date().toISOString(),
          source: 'custom_api',
          properties: sanitizeValue(properties ?? {}) as Record<string, unknown>,
          context: {},
        });
        if (error) return json({ error: error.message }, 500);
        break;
      }
      case 'upsert_customer': {
        if (!hasScope(apiKey, 'customers:write')) {
          return json({ error: 'Missing scope customers:write' }, 403);
        }
        const source = parsedBody ?? {};
        const matchKey = String(step.match_key ?? 'email');
        const fields = (step.fields ?? {}) as Record<string, string>;
        const payload: Record<string, unknown> = {
          tenant_id: apiKey.tenantId,
          environment: apiKey.environment,
        };
        for (const [target, sourceKey] of Object.entries(fields)) {
          if (FORBIDDEN_KEYS.test(target)) continue;
          const val = pickField(source, sourceKey);
          if (val !== undefined) payload[target] = val;
        }
        const matchVal = payload[matchKey];
        if (matchVal === undefined || matchVal === null || String(matchVal).trim() === '') {
          return json({ error: `Missing match field: ${matchKey}` }, 400);
        }
        const { error } = await supabase.from('customers').upsert(payload, {
          onConflict: 'tenant_id,environment,email',
        });
        if (error) return json({ error: error.message }, 500);
        break;
      }
      case 'get_customer': {
        if (!hasScope(apiKey, 'customers:read')) {
          return json({ error: 'Missing scope customers:read' }, 403);
        }
        const source = { ...(parsedBody ?? {}), ...ctx };
        const idField = String(step.id_field ?? 'customer_id');
        const customerId = String(
          pickField(source as Record<string, unknown>, idField)
          ?? pickField((source.query ?? {}) as Record<string, unknown>, idField)
          ?? '',
        );
        if (!customerId) return json({ error: `Missing ${idField}` }, 400);
        const { data, error } = await supabase
          .from('customers')
          .select('id, email, first_name, last_name, phone, created_at, updated_at')
          .eq('tenant_id', apiKey.tenantId)
          .eq('environment', apiKey.environment)
          .eq('id', customerId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: 'Customer not found' }, 404);
        const storeAs = String(step.store_as ?? 'customer');
        ctx[storeAs] = data;
        break;
      }
      case 'respond': {
        const status = Number(step.status ?? 200);
        const body = (step.body && typeof step.body === 'object' ? step.body : { ok: true }) as Record<string, unknown>;
        const include = Array.isArray(step.include) ? step.include as string[] : [];
        const response: Record<string, unknown> = { ...body };
        for (const key of include) {
          if (FORBIDDEN_KEYS.test(key)) continue;
          if (ctx[key] !== undefined) response[key] = sanitizeValue(ctx[key]);
        }
        return json(response, status);
      }
      default:
        return json({ error: `Unknown pipeline step: ${type}` }, 500);
    }
  }

  return json({ error: 'Pipeline did not respond' }, 500);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const slug = parts[parts.length - 1];
    if (!slug || slug === 'tenant-api') {
      return json({ error: 'Missing endpoint slug' }, 404);
    }

    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return json({ error: 'Missing Bearer API key' }, 401);
    }

    const supabase = getServiceClient();
    const apiKey = await verifyApiKey(supabase, auth.slice(7));
    if (!apiKey) {
      return json({ error: 'Invalid or revoked API key' }, 401);
    }

    if (!hasScope(apiKey, 'custom_api:invoke')) {
      return json({ error: 'API key missing custom_api:invoke scope' }, 403);
    }

    const { data: endpoint, error: endpointError } = await supabase
      .from('tenant_api_endpoints')
      .select('*')
      .eq('tenant_id', apiKey.tenantId)
      .eq('environment', apiKey.environment)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (endpointError) return json({ error: endpointError.message }, 500);
    if (!endpoint) return json({ error: 'Endpoint not found or not published' }, 404);

    if (String(endpoint.http_method) !== req.method) {
      return json({ error: `Method ${req.method} not allowed` }, 405);
    }

    const requiredScopes = (endpoint.required_scopes ?? []) as string[];
    for (const scope of requiredScopes) {
      if (!hasScope(apiKey, scope)) {
        return json({ error: `Missing required scope: ${scope}` }, 403);
      }
    }

    const pipeline = Array.isArray(endpoint.pipeline) ? endpoint.pipeline as PipelineStep[] : [];
    if (!pipeline.length) return json({ error: 'Endpoint pipeline not configured' }, 500);
    if (pipeline.length > 20) return json({ error: 'Pipeline too large' }, 500);

    const bodyText = req.method === 'GET' ? '' : await req.text();

    const timeoutMs = 8000;
    const result = await Promise.race([
      executePipeline(supabase, apiKey, pipeline, req, bodyText),
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(json({ error: 'Request timed out' }, 504)), timeoutMs)
      ),
    ]);

    return result;
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
