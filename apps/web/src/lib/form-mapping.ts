import type { FormField, FormFieldMapping, FormSchemaMapping } from './forms';
import { validateFieldMapping } from './form-field-mapping-rules';

export type CustomerMatchKey = 'email' | 'mobile' | 'email_or_mobile';

export type FormStorageTarget = 'customer' | 'schema';

export const CUSTOMER_SCHEMA_SLUG = 'customer';

/** Columns that must never be written from form field mappings */
export const CUSTOMER_PROTECTED_COLUMNS = new Set([
  'id',
  'tenant_id',
  'environment',
  'created_at',
  'updated_at',
  'deleted_at',
]);

export type SchemaMappingOption = {
  slug: string;
  name: string;
  schema_fields?: Array<{ name: string; field_type: string }>;
};

export function getStorageTarget(mapping?: FormSchemaMapping): FormStorageTarget {
  if (!mapping) return 'customer';
  if (mapping.storage_target) return mapping.storage_target;
  if (mapping.target_schema_slug) return 'schema';
  if (mapping.upsert_customer) return 'customer';
  return 'customer';
}

export function getFieldMapping(
  mapping?: FormSchemaMapping,
  formFieldName?: string,
): FormFieldMapping | undefined {
  if (!mapping || !formFieldName) return undefined;
  return mapping.field_mappings?.find((m) => m.form_field === formFieldName);
}

export function setFieldMapping(
  mapping: FormSchemaMapping | undefined,
  formFieldName: string,
  schemaField: string | null,
): FormSchemaMapping {
  const base = mapping ?? {};
  const rest = (base.field_mappings ?? []).filter((m) => m.form_field !== formFieldName);
  if (!schemaField) {
    return { ...base, field_mappings: rest };
  }
  return {
    ...base,
    field_mappings: [...rest, { form_field: formFieldName, schema_field: schemaField }],
  };
}

export function isFieldMapped(mapping?: FormSchemaMapping, formFieldName?: string): boolean {
  if (!mapping || !formFieldName) return false;
  const row = getFieldMapping(mapping, formFieldName);
  return Boolean(row?.schema_field);
}

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'custom' | 'unmapped';

export function getMatchConfidence(field: FormField, targetColumn: string | undefined): { confidence: MatchConfidence; score: number; label: string } {
  if (!targetColumn) {
    return { confidence: 'unmapped', score: 0, label: 'Unmapped' };
  }

  const fname = field.name.toLowerCase();
  const flabel = field.label.toLowerCase();
  const col = targetColumn.toLowerCase();

  if (fname === col || flabel === col) {
    return { confidence: 'exact', score: 100, label: '100% Match' };
  }

  if (
    (fname.includes('email') && col.includes('email')) ||
    (fname.includes('phone') && (col.includes('phone') || col.includes('mobile'))) ||
    (fname.includes('mobile') && (col.includes('phone') || col.includes('mobile'))) ||
    (fname.includes('first') && col.includes('first')) ||
    (fname.includes('last') && col.includes('last'))
  ) {
    return { confidence: 'high', score: 90, label: '90% High Match' };
  }

  if (fname.includes(col) || col.includes(fname) || flabel.includes(col) || col.includes(flabel)) {
    return { confidence: 'medium', score: 75, label: '75% Fuzzy Match' };
  }

  return { confidence: 'custom', score: 50, label: 'Custom Mapping' };
}

export function generateSampleFieldValue(field: FormField): string {
  const name = field.name.toLowerCase();
  const type = field.field_type;

  if (type === 'email' || name.includes('email')) return 'sarah.connor@cyberdyne.io';
  if (type === 'phone' || name.includes('phone') || name.includes('mobile')) return '+1 (555) 234-5678';
  if (type === 'number' || name.includes('age') || name.includes('qty')) return '28';
  if (type === 'date' || name.includes('date') || name.includes('dob')) return '1996-08-15';
  if (type === 'checkbox') return 'true';
  if (type === 'select' && field.options?.length) return field.options[0];
  if (name.includes('first')) return 'Sarah';
  if (name.includes('last')) return 'Connor';
  if (name.includes('company')) return 'Acme Corp';
  if (name.includes('city')) return 'San Francisco';
  if (name.includes('country')) return 'United States';
  return `Sample ${field.label}`;
}

export function suggestTargetColumn(field: FormField, columnOptions?: string[]): string {
  const options = columnOptions ?? [];
  const pick = (...candidates: string[]) => candidates.find((c) => options.length === 0 || options.includes(c)) ?? '';

  if (field.field_type === 'email') return pick('email') || 'email';
  if (field.field_type === 'phone') return pick('mobile', 'phone') || 'mobile';

  const name = field.name.toLowerCase();
  const label = field.label.toLowerCase();

  if (name.includes('email') || label.includes('email')) return pick('email') || 'email';
  if (name.includes('mobile') || name.includes('phone') || label.includes('mobile') || label.includes('phone')) {
    return pick('mobile', 'phone') || 'mobile';
  }
  if (name.includes('first') && name.includes('name')) return pick('first_name') || 'first_name';
  if (name.includes('last') && name.includes('name')) return pick('last_name') || 'last_name';
  if (name === 'name' || name === 'full_name' || label === 'full name') return pick('first_name', 'title') || 'first_name';
  if (name.includes('company') || name.includes('organization') || name.includes('organisation') || label.includes('company')) {
    return pick('title', 'company', name) || 'title';
  }
  if (name.includes('city') || label.includes('city')) return pick('city', 'country', name) || 'country';
  if (name.includes('country') || label.includes('country')) return pick('country', name) || 'country';
  if (name.includes('gender')) return pick('gender', name) || 'gender';
  if (name.includes('dob') || name.includes('birth')) return pick('dob', name) || 'dob';

  const exact = options.find((c) => c.toLowerCase() === name);
  if (exact) return exact;

  return pick(field.name) || field.name;
}

function fieldMatchesCustomerColumn(field: FormField, column: string): boolean {
  const name = field.name.toLowerCase();
  const label = field.label.toLowerCase();
  if (column === 'email') {
    return field.field_type === 'email' || name.includes('email') || label.includes('email');
  }
  if (column === 'mobile') {
    return (
      field.field_type === 'phone' ||
      name.includes('mobile') ||
      name.includes('phone') ||
      label.includes('mobile') ||
      label.includes('phone')
    );
  }
  return true;
}

/** Build valid field mappings from detected form fields (skips fields with no matching column). */
export function buildAutoFieldMappings(
  fields: FormField[],
  columnOptions: string[],
  schemas: SchemaMappingOption[],
  storageTarget: 'customer' | 'schema',
  schemaSlug?: string,
): FormFieldMapping[] {
  if (fields.length === 0 || columnOptions.length === 0) return [];

  const mappings: FormFieldMapping[] = [];
  const usedColumns = new Set<string>();

  for (const field of fields) {
    const candidates = [
      suggestTargetColumn(field, columnOptions),
      field.name,
      ...columnOptions.filter((col) => col.toLowerCase() === field.name.toLowerCase()),
      ...columnOptions.filter((col) => col.toLowerCase() === field.label.toLowerCase().replace(/\s+/g, '_')),
    ];

    const schema_field = [...new Set(candidates)].find(
      (col) =>
        col &&
        columnOptions.includes(col) &&
        !usedColumns.has(col) &&
        fieldMatchesCustomerColumn(field, col),
    );
    if (!schema_field) continue;

    const draft: FormFieldMapping = {
      form_field: field.name,
      schema_field,
      transform: field.field_type === 'email' ? 'lowercase' : 'trim',
      type_cast: 'none',
    };

    const validation = validateFieldMapping({
      field,
      mapping: draft,
      allMappings: mappings,
      columnOptions,
      schemas,
      storageTarget,
      schemaSlug,
    });

    if (validation.valid) {
      mappings.push({
        ...draft,
        transform: field.field_type === 'email' ? 'lowercase' : 'none',
      });
      usedColumns.add(schema_field);
    }
  }

  return mappings;
}

export function suggestIdentityField(
  fields: FormField[] | undefined,
  kind: 'email' | 'mobile',
): string | undefined {
  if (!Array.isArray(fields) || fields.length === 0) return undefined;

  if (kind === 'email') {
    const typed = fields.find((f) => f?.field_type === 'email');
    if (typed) return typed.name;
    return fields.find((f) => f?.name?.toLowerCase().includes('email'))?.name;
  }

  const typed = fields.find((f) => f?.field_type === 'phone');
  if (typed) return typed.name;
  return fields.find((f) => {
    if (!f) return false;
    if (f.field_type === 'email') return false;
    const n = (f.name ?? '').toLowerCase();
    const label = (f.label ?? '').toLowerCase();
    return n.includes('mobile') || n.includes('phone') || label.includes('mobile') || label.includes('phone');
  })?.name;
}

export function customSchemaOptions(schemas?: SchemaMappingOption[]): SchemaMappingOption[] {
  if (!Array.isArray(schemas)) return [];
  return schemas.filter((s) => s && s.slug !== CUSTOMER_SCHEMA_SLUG);
}

export function customerSchemaFields(schemas?: SchemaMappingOption[]): string[] {
  if (!Array.isArray(schemas)) {
    return ['title', 'first_name', 'middle_name', 'last_name', 'email', 'mobile', 'dob', 'gender', 'country', 'status'];
  }
  const customer = schemas.find((s) => s && s.slug === CUSTOMER_SCHEMA_SLUG);
  return (
    customer?.schema_fields
      ?.map((f) => f.name)
      .filter((n) => !['id', 'tenant_id', 'environment', 'created_at', 'updated_at', 'deleted_at'].includes(n)) ?? [
      'title',
      'first_name',
      'middle_name',
      'last_name',
      'email',
      'mobile',
      'dob',
      'gender',
      'country',
      'status',
    ]
  );
}

export function schemaFieldNames(
  schemas?: SchemaMappingOption[],
  slug?: string | undefined,
): string[] {
  if (!slug || !Array.isArray(schemas)) return [];
  const schema = schemas.find((s) => s && s.slug === slug);
  return (
    schema?.schema_fields
      ?.map((f) => f.name)
      .filter((n) => !['id', 'tenant_id', 'environment', 'created_at', 'updated_at'].includes(n)) ?? []
  );
}

export function isMappingConfigured(mapping?: FormSchemaMapping): boolean {
  if (!mapping) return false;
  const hasMappings = (mapping.field_mappings ?? []).some((m) => m?.form_field && m?.schema_field);
  if (hasMappings) {
    const target = getStorageTarget(mapping);
    if (target === 'schema' && !mapping.target_schema_slug) return false;
    return true;
  }
  return Boolean(mapping.upsert_customer || mapping.target_schema_slug);
}

export function normalizeMapping(mapping?: FormSchemaMapping): FormSchemaMapping {
  const base = mapping ?? {};
  const storage_target = getStorageTarget(base);
  const upsert_customer =
    storage_target === 'customer' ? true : Boolean(base.upsert_customer);
  return {
    ...base,
    storage_target,
    upsert_customer,
    customer_match_key: base.customer_match_key ?? 'email_or_mobile',
  };
}

export function getFieldMappingLabel(
  mapping: FormSchemaMapping,
  fieldName: string,
): string | null {
  const row = getFieldMapping(mapping, fieldName);
  if (!row?.schema_field) return null;
  const target = getStorageTarget(mapping);
  if (target === 'customer') return `Customer · ${row.schema_field}`;
  return `${mapping.target_schema_slug ?? 'schema'} · ${row.schema_field}`;
}
export function resolveIdentityValues(
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
