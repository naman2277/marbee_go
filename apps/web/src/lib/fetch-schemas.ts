import { supabase } from './supabase';
import { SCHEMA_WITH_FIELDS_SELECT } from './schema-queries';

export type SchemaWithFields = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  slug: string;
  table_name: string | null;
  is_system: boolean;
  description: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  current_version?: number;
  published_at?: string | null;
  schema_fields: SchemaFieldRow[];
};

/** A row of public.schema_fields (sql/01). Extra keys are allowed (embeds, older shapes). */
export type SchemaFieldRow = {
  id?: string;
  schema_id?: string;
  name: string;
  field_type: string;
  is_required?: boolean;
  is_primary_key?: boolean;
  is_nullable?: boolean;
  is_pii?: boolean;
  is_indexed?: boolean;
  default_value?: string | null;
  description?: string | null;
  sort_order?: number;
  [key: string]: unknown;
};

/** Load schemas + fields; falls back to two queries if embed fails */
export async function fetchSchemasWithFields(
  tenantId: string,
  environment: string,
): Promise<SchemaWithFields[]> {
  const { data, error } = await supabase
    .from('schema_definitions')
    .select(SCHEMA_WITH_FIELDS_SELECT)
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('name');

  if (!error) {
    return normalizeSchemaRows(data ?? []);
  }

  // Fallback: separate queries (works even if PostgREST embed is misconfigured)
  const { data: definitions, error: defErr } = await supabase
    .from('schema_definitions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('name');

  if (defErr) throw defErr;
  if (!definitions?.length) return [];

  const ids = definitions.map((d) => d.id);
  const { data: fields, error: fieldErr } = await supabase
    .from('schema_fields')
    .select('*')
    .in('schema_id', ids)
    .order('sort_order');

  if (fieldErr) throw fieldErr;

  const fieldsBySchema = new Map<string, Record<string, unknown>[]>();
  for (const field of fields ?? []) {
    const sid = field.schema_id as string;
    if (!fieldsBySchema.has(sid)) fieldsBySchema.set(sid, []);
    fieldsBySchema.get(sid)!.push(field);
  }

  return definitions.map((def) => ({
    ...def,
    schema_fields: fieldsBySchema.get(def.id) ?? [],
  })) as SchemaWithFields[];
}

export async function fetchSchemaBySlug(
  tenantId: string,
  environment: string,
  slug: string,
): Promise<SchemaWithFields | null> {
  const querySlug =
    slug === 'pushSubscribers' || slug === 'push_subscribers' ? 'web_push_subscriber' : slug;

  const { data, error } = await supabase
    .from('schema_definitions')
    .select(SCHEMA_WITH_FIELDS_SELECT)
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('slug', querySlug)
    .maybeSingle();

  if (!error && data) {
    const [row] = normalizeSchemaRows([data]);
    return row ?? null;
  }

  const { data: definition, error: defErr } = await supabase
    .from('schema_definitions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('slug', querySlug)
    .maybeSingle();

  if (defErr) throw defErr;
  if (!definition) return null;

  const { data: schemaFields, error: fieldErr } = await supabase
    .from('schema_fields')
    .select('*')
    .eq('schema_id', definition.id)
    .order('sort_order');

  if (fieldErr) throw fieldErr;

  const [normalized] = normalizeSchemaRows([
    {
      ...definition,
      schema_fields: schemaFields ?? [],
    },
  ]);

  return normalized ?? null;
}

function normalizeSchemaRows(rows: Record<string, unknown>[]): SchemaWithFields[] {
  return rows.map((row) => {
    const isPushSub =
      row.slug === 'web_push_subscriber' ||
      row.table_name === 'web_push_subscribers' ||
      row.slug === 'pushSubscribers' ||
      row.slug === 'push_subscribers';

    return {
      ...row,
      name: isPushSub ? 'pushSubscribers' : (row.name as string),
      table_name: isPushSub ? 'pushSubscribers' : (row.table_name as string | null),
      description: isPushSub
        ? 'Web push subscriptions (feed synced with Web Analytics)'
        : (row.description as string | null),
      schema_fields: Array.isArray(row.schema_fields) ? row.schema_fields : [],
    };
  }) as SchemaWithFields[];
}
