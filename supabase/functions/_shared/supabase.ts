import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

/**
 * Connection string for functions that talk raw Postgres (deno-postgres / pg).
 * At 1000+ tenants you MUST go through Supavisor in TRANSACTION mode (port 6543)
 * so a burst of concurrent functions doesn't exhaust backend connections.
 * Set SUPABASE_DB_POOL_URL to the "Transaction pooler" URI from
 * Dashboard -> Project Settings -> Database. Falls back to the direct URL.
 * RLS in v2 reads the JWT (no session GUCs) so transaction pooling is safe.
 */
export function getPooledConnectionString(): string {
  return (
    Deno.env.get('SUPABASE_DB_POOL_URL') ??
    Deno.env.get('SUPABASE_DB_URL') ??
    ''
  );
}

export function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-environment',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export async function resolveTenantContext(req: Request) {
  const tenantId = req.headers.get('x-tenant-id');
  const environment = req.headers.get('x-environment') ?? 'production';

  if (!tenantId) {
    return { error: 'Missing X-Tenant-Id header' };
  }

  return { tenantId, environment };
}

export async function validateApiKey(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const key = authHeader.slice(7);
  const prefix = key.slice(0, 8);

  const { data } = await supabase
    .from('api_keys')
    .select('tenant_id, environment, scopes, revoked_at')
    .eq('key_prefix', prefix)
    .is('revoked_at', null)
    .maybeSingle();

  if (!data) return null;

  // In production: bcrypt compare key_hash
  return data;
}
