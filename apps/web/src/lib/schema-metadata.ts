import { supabase } from './supabase';
import { logAudit, diffChanges } from './audit';
import { toSchemaSlug } from './schema-slug';
import {
  normalizeCustomTableName,
  validateCustomTableName,
} from './schema-table-name';

export type UpdateCustomSchemaInput = {
  schemaId: string;
  tenantId: string;
  environment: string;
  name: string;
  description?: string | null;
  tableName?: string | null;
  status: string;
  currentVersion: number;
  currentSlug: string;
  currentTableName: string | null;
};

export function canDeleteDraftSchema(input: {
  isSystem: boolean;
  status: string;
  tableName: string | null;
  currentVersion?: number;
}): boolean {
  return (
    !input.isSystem &&
    input.status === 'draft' &&
    (input.currentVersion ?? 0) === 0
  );
}

export function canEditTableName(input: {
  isSystem: boolean;
  status: string;
  currentVersion?: number;
}): boolean {
  return !input.isSystem && input.status === 'draft' && (input.currentVersion ?? 0) === 0;
}

export function canRenameSchemaSlug(input: {
  isSystem: boolean;
  status: string;
  tableName: string | null;
  currentVersion?: number;
}): boolean {
  return (
    !input.isSystem &&
    input.status === 'draft' &&
    (input.currentVersion ?? 0) === 0
  );
}

async function assertUniqueTableName(
  tableName: string,
  schemaId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('schema_definitions')
    .select('id')
    .eq('table_name', tableName)
    .neq('id', schemaId)
    .maybeSingle();

  if (existing) return `Table name "${tableName}" is already in use`;
  return null;
}

export async function updateCustomSchema(
  input: UpdateCustomSchemaInput,
): Promise<{ slug: string; error?: string }> {
  const trimmedName = input.name.trim();
  if (!trimmedName) return { slug: input.currentSlug, error: 'Schema name is required' };

  const nextSlug = canRenameSchemaSlug({
    isSystem: false,
    status: input.status,
    tableName: input.currentTableName,
    currentVersion: input.currentVersion,
  })
    ? toSchemaSlug(trimmedName)
    : input.currentSlug;

  if (!nextSlug) {
    return { slug: input.currentSlug, error: 'Enter a valid schema name' };
  }

  let nextTableName = input.currentTableName;

  if (
    canEditTableName({
      isSystem: false,
      status: input.status,
      currentVersion: input.currentVersion,
    }) &&
    input.tableName != null
  ) {
    nextTableName = normalizeCustomTableName(input.tableName);
    const tableError = validateCustomTableName(nextTableName);
    if (tableError) return { slug: input.currentSlug, error: tableError };

    if (nextTableName !== input.currentTableName) {
      const uniqueError = await assertUniqueTableName(nextTableName, input.schemaId);
      if (uniqueError) return { slug: input.currentSlug, error: uniqueError };
    }
  }

  if (nextSlug !== input.currentSlug) {
    const { data: existing } = await supabase
      .from('schema_definitions')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('environment', input.environment)
      .eq('slug', nextSlug)
      .neq('id', input.schemaId)
      .maybeSingle();

    if (existing) {
      return { slug: input.currentSlug, error: `Schema slug "${nextSlug}" already exists` };
    }
  }

  const { error } = await supabase
    .from('schema_definitions')
    .update({
      name: trimmedName,
      slug: nextSlug,
      description: input.description?.trim() || null,
      table_name: nextTableName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.schemaId)
    .eq('is_system', false);

  if (error) return { slug: input.currentSlug, error: error.message };
  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'update',
    resourceType: 'schema',
    resourceId: input.schemaId,
    resourceName: trimmedName,
    summary: 'Updated schema metadata',
    changes: diffChanges(
      {
        name: input.name,
        slug: input.currentSlug,
        description: input.description,
        table_name: input.currentTableName,
      },
      { name: trimmedName, slug: nextSlug, description: input.description, table_name: nextTableName },
    ),
  });
  return { slug: nextSlug };
}

export async function deleteDraftSchema(schemaId: string): Promise<{ error?: string }> {
  const { data: schema, error: loadError } = await supabase
    .from('schema_definitions')
    .select('id, name, tenant_id, environment, is_system, status, table_name, current_version')
    .eq('id', schemaId)
    .single();

  if (loadError) return { error: loadError.message };
  if (!schema) return { error: 'Schema not found' };

  if (
    !canDeleteDraftSchema({
      isSystem: schema.is_system,
      status: schema.status,
      tableName: schema.table_name,
      currentVersion: schema.current_version ?? 0,
    })
  ) {
    return { error: 'Only unpublished draft schemas can be deleted' };
  }

  const { error } = await supabase.from('schema_definitions').delete().eq('id', schemaId);

  if (error) return { error: error.message };
  void logAudit({
    tenantId: schema.tenant_id,
    environment: schema.environment,
    action: 'delete',
    resourceType: 'schema',
    resourceId: schemaId,
    resourceName: schema.name,
  });
  return {};
}
