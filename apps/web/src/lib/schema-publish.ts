import { supabase } from './supabase';
import { logAudit } from './audit';

export type PublishResult = {
  success: boolean;
  table_name: string;
  version: number;
  primary_key: string;
};

export async function publishCustomSchema(
  schemaId: string,
  changeNotes?: string,
): Promise<{ data?: PublishResult; error?: string }> {
  const { data, error } = await supabase.rpc('publish_custom_schema', {
    p_schema_id: schemaId,
    p_change_notes: changeNotes ?? null,
  });

  if (error) return { error: error.message };
  const result = data as PublishResult;
  const { data: schemaRow } = await supabase
    .from('schema_definitions')
    .select('tenant_id, environment, name')
    .eq('id', schemaId)
    .maybeSingle();
  if (schemaRow) {
    void logAudit({
      tenantId: schemaRow.tenant_id,
      environment: schemaRow.environment,
      action: 'publish',
      resourceType: 'schema',
      resourceId: schemaId,
      resourceName: schemaRow.name,
      summary: `Published v${result.version} → ${result.table_name}`,
      metadata: { version: result.version, table_name: result.table_name, change_notes: changeNotes },
    });
  }
  return { data: result };
}

export async function revertSchemaToDraft(schemaId: string): Promise<{ error?: string }> {
  const { data: schemaRow } = await supabase
    .from('schema_definitions')
    .select('tenant_id, environment, name')
    .eq('id', schemaId)
    .maybeSingle();

  const { error } = await supabase
    .from('schema_definitions')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', schemaId)
    .eq('is_system', false);

  if (error) return { error: error.message };
  if (schemaRow) {
    void logAudit({
      tenantId: schemaRow.tenant_id,
      environment: schemaRow.environment,
      action: 'unpublish',
      resourceType: 'schema',
      resourceId: schemaId,
      resourceName: schemaRow.name,
      summary: 'Reverted to draft',
    });
  }
  return {};
}

export type SchemaVersion = {
  id: string;
  schema_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_notes: string | null;
  published_at: string;
};

export async function fetchSchemaVersions(schemaId: string): Promise<SchemaVersion[]> {
  const { data, error } = await supabase
    .from('schema_versions')
    .select('*')
    .eq('schema_id', schemaId)
    .order('version_number', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SchemaVersion[];
}
