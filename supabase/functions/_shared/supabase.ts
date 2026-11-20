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

// resolveTenantContext (trusted X-Tenant-Id) and validateApiKey (prefix-only check) were
// removed in Phase 0 (SEC-02 / SEC-04). Use _shared/auth.ts for signed-in users, or
// _shared/ingest-auth.ts (API keys via verify_api_key, site keys via resolve_ingest_site).
