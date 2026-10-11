// Deploy: Supabase Dashboard → Edge Functions → form-submit
// Paste this entire file. Turn OFF "Enforce JWT Verification".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

const PROTECTED_CUSTOMER_COLUMNS = new Set([
  'id',
  'tenant_id',
  'environment',
  'created_at',
  'updated_at',
  'deleted_at',
]);

type FormFieldMapping = {
  form_field: string;
  schema_field: string;
  transform?: string;
  type_cast?: string;
};

type FormSchemaMapping = {
  storage_target?: 'customer' | 'schema';
  target_schema_slug?: string;
  field_mappings?: FormFieldMapping[];
  upsert_customer?: boolean;
  customer_match_key?: 'email' | 'mobile' | 'email_or_mobile';
  customer_email_field?: string;
  customer_mobile_field?: string;
};

type FormField = {
  name: string;
  label: string;
  field_type: string;
  required?: boolean;
};

function getStorageTarget(mapping: FormSchemaMapping): 'customer' | 'schema' {
  if (mapping.storage_target) return mapping.storage_target;
  if (mapping.target_schema_slug) return 'schema';
  if (mapping.upsert_customer) return 'customer';
  return 'customer';
}

const IDENTITY_COLUMNS = new Set(['email', 'mobile']);

function suggestIdentityField(fields: FormField[], kind: 'email' | 'mobile'): string | undefined {
  if (kind === 'email') {
    const typed = fields.find((f) => f.field_type === 'email');
    if (typed) return typed.name;
    return fields.find((f) => f.name.toLowerCase().includes('email'))?.name;
  }
  const typed = fields.find((f) => f.field_type === 'phone');
  if (typed) return typed.name;
  return fields.find((f) => {
    if (f.field_type === 'email') return false;
    const n = f.name.toLowerCase();
    const label = f.label.toLowerCase();
    return n.includes('mobile') || n.includes('phone') || label.includes('mobile') || label.includes('phone');
  })?.name;
}

function resolveIdentityValues(
  data: Record<string, unknown>,
  fields: FormField[],
  mapping: FormSchemaMapping,
): { email?: string; mobile?: string } {
  const emailField = mapping.customer_email_field ?? suggestIdentityField(fields, 'email');
  const mobileField = mapping.customer_mobile_field ?? suggestIdentityField(fields, 'mobile');

  const readField = (name: string | undefined): string | undefined => {
    if (!name) return undefined;
    if (!fields.some((f) => f.name === name)) return undefined;
    const raw = data[name];
    if (raw === undefined || raw === null || raw === '') return undefined;
    return String(raw).trim() || undefined;
  };

  const email = readField(emailField);
  const mobile = readField(mobileField);
  return {
    email: email ? email.toLowerCase() : undefined,
    mobile,
  };
}

function buildCustomerPayloadFromForm(
  data: Record<string, unknown>,
  fields: FormField[],
  mapping: FormSchemaMapping,
  storageTarget: 'customer' | 'schema',
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (storageTarget === 'customer') {
    for (const m of mapping.field_mappings ?? []) {
      if (PROTECTED_CUSTOMER_COLUMNS.has(m.schema_field)) continue;
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
  if (email) payload.email = email;
  if (mobile) payload.mobile = mobile;

  return payload;
}

function applyFieldMappingValue(raw: unknown, mapping: FormFieldMapping): unknown {
  let value = raw;
  switch (mapping.transform) {
    case 'trim':
      if (typeof value === 'string') value = value.trim();
      break;
    case 'lowercase':
      if (typeof value === 'string') value = value.toLowerCase();
      break;
    case 'uppercase':
      if (typeof value === 'string') value = value.toUpperCase();
      break;
    default:
      break;
  }
  const cast = mapping.type_cast ?? 'none';
  if (cast === 'none' || value === null || value === undefined || value === '') return value;
  if (cast === 'string') return String(value);
  if (cast === 'number') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (cast === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 'on') return true;
    if (value === 'false' || value === '0' || value === 'off') return false;
    return Boolean(value);
  }
  if (cast === 'date') {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
  }
  return value;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();
    const body = await req.json();
    const formId = body.form_id as string;
    const tenantId = body.tenant_id as string;
    const environment = (body.environment as string) ?? 'production';
    const data = body.data as Record<string, unknown>;

    if (!formId || !tenantId || !data || typeof data !== 'object') {
      return errorResponse('form_id, tenant_id, and data are required', 400);
    }

    const { data: form, error: formErr } = await supabase
      .from('forms')
      .select('id, tenant_id, environment, status, fields, schema_mapping')
      .eq('id', formId)
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .eq('status', 'published')
      .maybeSingle();

    if (formErr) return errorResponse(formErr.message, 500);
    if (!form) return errorResponse('Form not found or not published', 404);

    const fields = (form.fields ?? []) as FormField[];
    const mapping = (form.schema_mapping ?? {}) as FormSchemaMapping;
    const storageTarget = getStorageTarget(mapping);
    const shouldUpsertCustomer = storageTarget === 'customer' || Boolean(mapping.upsert_customer);

    for (const field of fields) {
      if (!field.required) continue;
      const val = data[field.name];
      if (val === undefined || val === null || val === '') {
        return errorResponse(`${field.label} is required`, 400);
      }
    }

    let customerId: string | null = null;
    let customerAction: 'created' | 'updated' | null = null;

    if (shouldUpsertCustomer) {
      const matchKey = mapping.customer_match_key ?? 'email_or_mobile';
      const payload = buildCustomerPayloadFromForm(data, fields, mapping, storageTarget);
      const email = payload.email as string | undefined;
      const mobile = payload.mobile as string | undefined;

      const canMatch =
        (matchKey === 'email' && email) ||
        (matchKey === 'mobile' && mobile) ||
        (matchKey === 'email_or_mobile' && (email || mobile));

      if (canMatch) {
        const baseRow = {
          tenant_id: tenantId,
          environment,
          status: 'active',
          ...payload,
        };

        let existingId: string | null = null;

        if (email && (matchKey === 'email' || matchKey === 'email_or_mobile')) {
          const { data: existing, error: lookupErr } = await supabase
            .from('customers')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('environment', environment)
            .eq('email', email)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (lookupErr) return errorResponse(lookupErr.message, 500);
          existingId = existing?.id ?? null;
        } else if (mobile && (matchKey === 'mobile' || matchKey === 'email_or_mobile')) {
          const { data: existing, error: lookupErr } = await supabase
            .from('customers')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('environment', environment)
            .eq('mobile', mobile)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (lookupErr) return errorResponse(lookupErr.message, 500);
          existingId = existing?.id ?? null;
        }

        if (existingId) {
          const { error: updateErr } = await supabase.from('customers').update(payload).eq('id', existingId);
          if (updateErr) return errorResponse(updateErr.message, 500);
          customerId = existingId;
          customerAction = 'updated';
        } else {
          const { data: created, error: insertErr } = await supabase
            .from('customers')
            .insert(baseRow)
            .select('id')
            .single();
          if (insertErr) return errorResponse(insertErr.message, 500);
          customerId = created.id;
          customerAction = 'created';
        }
      }
    }

    if (storageTarget === 'schema' && mapping.target_schema_slug && mapping.field_mappings?.length) {
      const { data: schemaDef } = await supabase
        .from('schema_definitions')
        .select('table_name, status')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .eq('slug', mapping.target_schema_slug)
        .eq('status', 'published')
        .maybeSingle();

      if (schemaDef?.table_name) {
        const record: Record<string, unknown> = {};
        for (const m of mapping.field_mappings) {
          if (data[m.form_field] !== undefined) {
            record[m.schema_field] = applyFieldMappingValue(data[m.form_field], m);
          }
        }
        if (Object.keys(record).length) {
          const { error: schemaErr } = await supabase
            .from(schemaDef.table_name)
            .insert({ ...record, tenant_id: tenantId, environment });
          if (schemaErr) return errorResponse(schemaErr.message, 500);
        }
      }
    }

    const { data: submission, error: subErr } = await supabase
      .from('form_submissions')
      .insert({
        form_id: form.id,
        tenant_id: tenantId,
        environment,
        customer_id: customerId,
        data,
      })
      .select('id')
      .single();

    if (subErr) return errorResponse(subErr.message, 500);

    return jsonResponse({
      submissionId: submission.id,
      customerId,
      customerAction,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});
