import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';

type Action = 'list' | 'create' | 'update' | 'delete' | 'get';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const supabase = getServiceClient();
    const body = await req.json();
    const action = body.action as Action;
    const tenantId = body.tenant_id as string;
    const environment = (body.environment as string) ?? 'production';
    const schemaId = body.schema_id as string;
    const tableName = body.table_name as string | undefined;
    const recordId = body.id as string | undefined;
    const record = body.record as Record<string, unknown> | undefined;

    if (!tenantId) return errorResponse('tenant_id is required', 400);

    let resolvedTable = tableName;
    if (!resolvedTable && schemaId) {
      const { data: schema } = await supabase
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

    if (!/^cs_[a-z0-9_]+$/.test(resolvedTable)) {
      return errorResponse('Invalid table name', 400);
    }

    switch (action) {
      case 'list': {
        const { data, error } = await supabase
          .from(resolvedTable)
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('environment', environment)
          .order('created_at', { ascending: false })
          .limit(body.limit ?? 500);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ records: data });
      }

      case 'get': {
        if (!recordId) return errorResponse('id is required', 400);
        const { data, error } = await supabase
          .from(resolvedTable)
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('environment', environment)
          .eq('id', recordId)
          .maybeSingle();
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ record: data });
      }

      case 'create': {
        if (!record) return errorResponse('record is required', 400);
        const { tenant_id: _t, environment: _e, id: _id, ...payload } = record;
        const { data, error } = await supabase
          .from(resolvedTable)
          .insert({ ...payload, tenant_id: tenantId, environment })
          .select()
          .single();
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ record: data });
      }

      case 'update': {
        if (!recordId || !record) return errorResponse('id and record are required', 400);
        const { tenant_id: _t, environment: _e, id: _id, created_at: _c, ...payload } = record;
        const { data, error } = await supabase
          .from(resolvedTable)
          .update(payload)
          .eq('tenant_id', tenantId)
          .eq('environment', environment)
          .eq('id', recordId)
          .select()
          .single();
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ record: data });
      }

      case 'delete': {
        if (!recordId) return errorResponse('id is required', 400);
        const { error } = await supabase
          .from(resolvedTable)
          .delete()
          .eq('tenant_id', tenantId)
          .eq('environment', environment)
          .eq('id', recordId);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ success: true });
      }

      default:
        return errorResponse('Invalid action. Use list|get|create|update|delete', 400);
    }
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});
