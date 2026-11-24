import type { FormField, FormFieldMapping, FormSchemaMapping } from './forms';
import { applyFieldMappingValue } from './form-field-mapping-rules';
import {
  CUSTOMER_PROTECTED_COLUMNS,
  resolveIdentityValues,
  type CustomerMatchKey,
} from './form-mapping';
import type { SupabaseClient } from '@supabase/supabase-js';

const IDENTITY_COLUMNS = new Set(['email', 'mobile']);

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeMobile(value: string): string {
  return value.trim();
}

/** Build customer row from form mappings — email/mobile come only from identity fields, not cross-mapped columns. */
export function buildCustomerPayloadFromForm(
  data: Record<string, unknown>,
  fields: FormField[],
  mapping: FormSchemaMapping,
  storageTarget: 'customer' | 'schema' = 'customer',
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (storageTarget === 'customer') {
    for (const m of mapping.field_mappings ?? []) {
      if (CUSTOMER_PROTECTED_COLUMNS.has(m.schema_field)) continue;
      if (IDENTITY_COLUMNS.has(m.schema_field)) continue;
      const raw = data[m.form_field];
      if (raw !== undefined && raw !== null && raw !== '') {
        payload[m.schema_field] = applyFieldMappingValue(raw, m);
      }
    }

    if (!payload.first_name) {
      const legacyName =
        (data.first_name as string | undefined) ??
        (data.name as string | undefined) ??
        (data.full_name as string | undefined);
      if (legacyName) payload.first_name = legacyName;
    }
  }

  const { email, mobile } = resolveIdentityValues(data, fields, mapping);
  if (email) payload.email = normalizeEmail(email);
  if (mobile) payload.mobile = normalizeMobile(mobile);

  return payload;
}

async function findCustomerByEmail(
  supabase: SupabaseClient,
  tenantId: string,
  environment: string,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('email', email.trim().toLowerCase()) // TD-17: stored emails are lower-case (sql/92), so look up the same way.
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function findCustomerByMobile(
  supabase: SupabaseClient,
  tenantId: string,
  environment: string,
  mobile: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('mobile', mobile)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export async function upsertCustomerFromForm(input: {
  supabase: SupabaseClient;
  tenantId: string;
  environment: string;
  data: Record<string, unknown>;
  fields: FormField[];
  mapping: FormSchemaMapping;
}): Promise<{ customerId: string | null; action: 'created' | 'updated' | null }> {
  const { supabase, tenantId, environment, data, fields, mapping } = input;
  const matchKey: CustomerMatchKey = mapping.customer_match_key ?? 'email_or_mobile';
  const storageTarget = mapping.storage_target ?? (mapping.target_schema_slug ? 'schema' : 'customer');
  const payload = buildCustomerPayloadFromForm(data, fields, mapping, storageTarget);
  const email = payload.email as string | undefined;
  const mobile = payload.mobile as string | undefined;

  const canMatch =
    (matchKey === 'email' && email) ||
    (matchKey === 'mobile' && mobile) ||
    (matchKey === 'email_or_mobile' && (email || mobile));

  if (!canMatch) return { customerId: null, action: null };

  const baseRow = {
    tenant_id: tenantId,
    environment,
    status: 'active',
    ...payload,
  };

  let existingId: string | null = null;

  if (email && (matchKey === 'email' || matchKey === 'email_or_mobile')) {
    existingId = await findCustomerByEmail(supabase, tenantId, environment, email);
  } else if (mobile && (matchKey === 'mobile' || matchKey === 'email_or_mobile')) {
    existingId = await findCustomerByMobile(supabase, tenantId, environment, mobile);
  }

  if (existingId) {
    const { error: updateErr } = await supabase.from('customers').update(payload).eq('id', existingId);
    if (updateErr) throw new Error(updateErr.message);
    return { customerId: existingId, action: 'updated' };
  }

  const { data: created, error: insertErr } = await supabase
    .from('customers')
    .insert(baseRow)
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return { customerId: created.id, action: 'created' };
}

export function isIdentityColumnMapping(mapping: FormFieldMapping): boolean {
  return IDENTITY_COLUMNS.has(mapping.schema_field);
}
