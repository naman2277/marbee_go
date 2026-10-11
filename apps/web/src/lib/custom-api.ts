import { supabase } from './supabase';
import { logAudit } from './audit';
import type { ApiPipelineStep } from './api-pipeline';
import { validatePipeline } from './api-pipeline';
import type { ApiScope } from './api-scopes';

export type CustomApiEndpoint = {
  id: string;
  tenantId: string;
  environment: string;
  name: string;
  slug: string;
  description: string | null;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH';
  requiredScopes: ApiScope[];
  pipeline: ApiPipelineStep[];
  status: 'draft' | 'published' | 'disabled';
  createdAt: string;
  updatedAt: string;
};

function mapEndpoint(row: Record<string, unknown>): CustomApiEndpoint {
  const pipelineRaw = row.pipeline;
  const validated = validatePipeline(pipelineRaw);
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    environment: row.environment as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    httpMethod: row.http_method as CustomApiEndpoint['httpMethod'],
    requiredScopes: (row.required_scopes as ApiScope[]) ?? [],
    pipeline: validated.ok ? validated.steps : [],
    status: row.status as CustomApiEndpoint['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function fetchCustomApiEndpoints(
  tenantId: string,
  environment: string,
): Promise<CustomApiEndpoint[]> {
  const { data, error } = await supabase.rpc('list_custom_api_endpoints', {
    p_tenant_id: tenantId,
    p_environment: environment,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapEndpoint(row));
}

export async function saveCustomApiEndpoint(input: {
  tenantId: string;
  environment: string;
  id?: string;
  name: string;
  slug: string;
  description?: string;
  httpMethod: CustomApiEndpoint['httpMethod'];
  requiredScopes: ApiScope[];
  pipeline: ApiPipelineStep[];
  status: CustomApiEndpoint['status'];
}): Promise<string> {
  const validated = validatePipeline(input.pipeline);
  if (!validated.ok) {
    throw new Error(validated.errors[0]);
  }

  const { data, error } = await supabase.rpc('upsert_custom_api_endpoint', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_id: input.id ?? null,
    p_name: input.name.trim(),
    p_slug: input.slug.trim().toLowerCase(),
    p_description: input.description?.trim() ?? null,
    p_http_method: input.httpMethod,
    p_required_scopes: input.requiredScopes,
    p_pipeline: validated.steps,
    p_status: input.status,
  });
  if (error) throw error;

  const endpointId = data as string;
  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: input.id ? 'update' : 'create',
    resourceType: 'custom_api_endpoint',
    resourceId: endpointId,
    resourceName: input.name,
  });

  return endpointId;
}

export async function deleteCustomApiEndpoint(
  tenantId: string,
  environment: string,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_custom_api_endpoint', {
    p_tenant_id: tenantId,
    p_id: id,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'custom_api_endpoint',
    resourceId: id,
    resourceName: name,
  });
}

export function customApiInvokeUrl(slug: string, supabaseUrl?: string): string {
  const base = supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '';
  return `${String(base).replace(/\/$/, '')}/functions/v1/tenant-api/${slug}`;
}
