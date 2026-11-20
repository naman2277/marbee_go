// schema-records — CRUD on published custom-schema tables (cs_*) for signed-in app users.
//
// SEC-01 fix (Phase 0): previously used the service role and trusted tenant_id from the
// request body, so anyone with the public anon key could read/alter any tenant's records.
// Now: the caller must be a signed-in user, must be an active member of the tenant, and
// every query runs AS the caller, so the cs_* RLS policy (tenant_id IN user_tenant_ids())
// enforces isolation in the database as a second layer.
//
// Public form submissions do not use this function (they go through form-submit).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { AuthError, authenticateUser, requireTenantMember } from '../_shared/auth.ts';

type Action = 'list' | 'create' | 'update' | 'delete' | 'get';
const ACTIONS: readonly Action[] = ['list', 'create', 'update', 'delete', 'get'];
const ENVIRONMENTS = ['production', 'staging', 'development'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await authenticateUser(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return errorResponse('JSON body required', 400);

    const action = body.action as Action;
    if (!ACTIONS.includes(action)) return errorResponse('Invalid action. Use list|get|create|update|delete', 400);

    const tenantId = await requireTenantMember(user, body.tenant_id);
    const environment = (body.environment as string) ?? 'production';
    if (!(ENVIRONMENTS as readonly string[]).includes(environment)) return errorResponse('Invalid environment', 400);

    const schemaId = body.schema_id as string | undefined;
    const tableName = body.table_name as string | undefined;
    const recordId = body.id as string | undefined;
    const record = body.record as Record<string, unknown> | undefined;
    if (recordId !== undefined && (typeof recordId !== 'string' || !UUID_RE.test(recordId))) {
      return errorResponse('id must be a UUID', 400);
    }

    const db = user.db; // every query below runs as the caller (RLS enforced)

    let resolvedTable = tableName;
    if (!resolvedTable && schemaId) {
      const { data: schema } = await db
        .from('schema_definitions')
        .select('table_name, status, tenant_id, environment')
        .eq('id', schemaId)
        .maybeSingle();

      if (!schema?.table_name || schema.status !== 'published') {
        return errorResponse('Schema is not published or has no backing table', 400);
      }
      if (schema.tenant_id !== tenantId || schema.environment !== environment) {
        return errorResponse('Schema tenant/environment mismatch', 403);
      }
      resolvedTable = schema.table_name;
    }

    if (!resolvedTable) return errorResponse('table_name or schema_id is required', 400);
    if (!/^cs_[a-z0-9_]+$/.test(resolvedTable)) return errorResponse('Invalid table name', 400);

    // A table name supplied directly must belong to one of this tenant's published schemas.
    if (tableName) {
      const { data: owned } = await db
        .from('schema_definitions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('table_name', resolvedTable)
        .eq('status', 'published')
        .limit(1);
      if (!owned?.length) return errorResponse('Table not found for this tenant', 404);
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 500) || 500, 1), 1000);

    switch (action) {
      case 'list': {
        const { data, error } = await db
          .from(resolvedTable)
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('environment', environment)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) return dbError(error.message);
        return jsonResponse({ records: data });
      }

      case 'get': {
        if (!recordId) return errorResponse('id is required', 400);
        const { data, error } = await db
          .from(resolvedTable)
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('environment', environment)
          .eq('id', recordId)
          .maybeSingle();
        if (error) return dbError(error.message);
        return jsonResponse({ record: data });
      }

      case 'create': {
        if (!record || typeof record !== 'object') return errorResponse('record is required', 400);
        const { tenant_id: _t, environment: _e, id: _id, ...payload } = record;
        const { data, error } = await db
          .from(resolvedTable)
          .insert({ ...payload, tenant_id: tenantId, environment })
          .select()
          .single();
        if (error) return dbError(error.message);
        return jsonResponse({ record: data });
      }

      case 'update': {
        if (!recordId || !record || typeof record !== 'object') return errorResponse('id and record are required', 400);
        const { tenant_id: _t, environment: _e, id: _id, created_at: _c, ...payload } = record;
        const { data, error } = await db
          .from(resolvedTable)
          .update(payload)
          .eq('tenant_id', tenantId)
          .eq('environment', environment)
          .eq('id', recordId)
          .select()
          .single();
        if (error) return dbError(error.message);
        return jsonResponse({ record: data });
      }

      case 'delete': {
        if (!recordId) return errorResponse('id is required', 400);
        const { error } = await db
          .from(resolvedTable)
          .delete()
          .eq('tenant_id', tenantId)
          .eq('environment', environment)
          .eq('id', recordId);
        if (error) return dbError(error.message);
        return jsonResponse({ success: true });
      }
    }
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, err.status);
    console.error('schema-records unhandled', err instanceof Error ? err.message : err);
    return errorResponse('Internal error', 500);
  }
});

function dbError(message: string) {
  // Validation errors (bad column, constraint) are useful to the signed-in user; log everything.
  console.error('schema-records db error', message);
  return errorResponse(message, 400);
}
