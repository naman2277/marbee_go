import type { FormField, FormFieldMapping, FormFieldType, FormFieldTransform, FormFieldTypeCast } from './forms';
import type { SchemaMappingOption } from './form-mapping';
import { CUSTOMER_SCHEMA_SLUG } from './form-mapping';

export type MappingTypeFamily = 'string' | 'number' | 'boolean' | 'date';

export type FieldMappingIssue = {
  severity: 'error' | 'warning';
  message: string;
};

export type FieldMappingValidation = {
  valid: boolean;
  configured: boolean;
  issues: FieldMappingIssue[];
};

const FORM_TYPE_FAMILY: Record<FormFieldType, MappingTypeFamily> = {
  text: 'string',
  email: 'string',
  phone: 'string',
  number: 'number',
  textarea: 'string',
  select: 'string',
  checkbox: 'boolean',
  date: 'date',
  // Field types added by the Form Studio revamp (were missing → undefined family).
  url: 'string',
  radio: 'string',
  multiselect: 'string',
  consent: 'boolean',
  rating: 'number',
  hidden: 'string',
  heading: 'string',
  divider: 'string',
};

/** Normalize schema field_type strings to mapping families */
export function schemaTypeFamily(fieldType: string | undefined): MappingTypeFamily {
  const t = (fieldType ?? 'string').toLowerCase();
  if (['number', 'integer', 'float', 'decimal', 'int', 'numeric'].includes(t)) return 'number';
  if (['boolean', 'bool'].includes(t)) return 'boolean';
  if (['date', 'datetime', 'timestamp', 'timestamptz'].includes(t)) return 'date';
  return 'string';
}

export function formTypeFamily(fieldType: FormFieldType): MappingTypeFamily {
  return FORM_TYPE_FAMILY[fieldType];
}

export function getSchemaFieldMeta(
  schemas: SchemaMappingOption[],
  storageTarget: 'customer' | 'schema',
  schemaSlug: string | undefined,
  columnName: string,
): { name: string; field_type: string } | null {
  const slug = storageTarget === 'customer' ? CUSTOMER_SCHEMA_SLUG : schemaSlug;
  if (!slug) return null;
  const schema = schemas.find((s) => s.slug === slug);
  const field = schema?.schema_fields?.find((f) => f.name === columnName);
  return field ? { name: field.name, field_type: field.field_type } : null;
}

export function typesCompatible(source: MappingTypeFamily, target: MappingTypeFamily): boolean {
  if (source === target) return true;
  if (target === 'string') return true;
  if (source === 'string' && target === 'number') return false;
  if (source === 'string' && target === 'boolean') return false;
  if (source === 'string' && target === 'date') return false;
  return false; // (anything → string already returned true above)
}

/** Allowed type casts from source family to target family (excludes 'none'). */
export function allowedTypeCasts(
  source: MappingTypeFamily,
  target: MappingTypeFamily,
): FormFieldTypeCast[] {
  if (source === target) return ['none'];
  const casts: FormFieldTypeCast[] = ['none'];
  if (target === 'string') casts.push('string');
  if (source === 'string' && target === 'number') casts.push('number');
  if (source === 'string' && target === 'boolean') casts.push('boolean');
  if (source === 'string' && target === 'date') casts.push('date');
  if (source === 'number' && target === 'string') casts.push('string');
  if (source === 'boolean' && target === 'string') casts.push('string');
  if (source === 'date' && target === 'string') casts.push('string');
  return [...new Set(casts)];
}

export function isCastRequired(source: MappingTypeFamily, target: MappingTypeFamily): boolean {
  return !typesCompatible(source, target);
}

export const TRANSFORM_OPTIONS: Array<{ value: FormFieldTransform; label: string }> = [
  { value: 'none', label: 'No transform' },
  { value: 'trim', label: 'Trim whitespace' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'uppercase', label: 'Uppercase' },
];

export const TYPE_CAST_LABELS: Record<FormFieldTypeCast, string> = {
  none: 'No cast',
  string: 'Cast to text',
  number: 'Cast to number',
  boolean: 'Cast to boolean',
  date: 'Cast to date',
};

export function validateFieldMapping(input: {
  field: FormField;
  mapping: FormFieldMapping | undefined;
  allMappings: FormFieldMapping[];
  columnOptions: string[];
  schemas: SchemaMappingOption[];
  storageTarget: 'customer' | 'schema';
  schemaSlug?: string;
}): FieldMappingValidation {
  const { field, mapping, allMappings, columnOptions, schemas, storageTarget, schemaSlug } = input;
  const issues: FieldMappingIssue[] = [];

  if (!mapping?.schema_field) {
    issues.push({
      severity: 'error',
      message: 'Select a destination column and click Apply to configure this field.',
    });
    return { valid: false, configured: false, issues };
  }

  const column = mapping.schema_field;

  if (storageTarget === 'schema' && !schemaSlug) {
    issues.push({
      severity: 'error',
      message: 'Choose a schema table above before mapping fields.',
    });
  }

  if (!columnOptions.includes(column)) {
    issues.push({
      severity: 'error',
      message: `Column "${column}" is not available in the selected table. Pick a column from the list.`,
    });
  }

  if (storageTarget === 'customer' && column === 'email' && field.field_type !== 'email') {
    const hint = `${field.name} ${field.label}`.toLowerCase();
    if (!hint.includes('email')) {
      issues.push({
        severity: 'error',
        message: 'Only email fields can map to the email column. Map your phone field to mobile instead.',
      });
    }
  }

  if (storageTarget === 'customer' && column === 'mobile' && field.field_type !== 'phone') {
    const hint = `${field.name} ${field.label}`.toLowerCase();
    if (!hint.includes('mobile') && !hint.includes('phone')) {
      issues.push({
        severity: 'error',
        message: 'Only phone/mobile fields can map to the mobile column.',
      });
    }
  }

  const duplicate = allMappings.filter(
    (m) => m.form_field !== field.name && m.schema_field === column,
  );
  if (duplicate.length > 0) {
    issues.push({
      severity: 'error',
      message: `Column "${column}" is already mapped to "${duplicate[0].form_field}". Each column can only be used once.`,
    });
  }

  const meta = getSchemaFieldMeta(schemas, storageTarget, schemaSlug, column);
  const sourceFamily = formTypeFamily(field.field_type);
  const targetFamily = schemaTypeFamily(meta?.field_type);

  const cast = mapping.type_cast ?? 'none';
  const allowedCasts = allowedTypeCasts(sourceFamily, targetFamily);
  const needsCast = isCastRequired(sourceFamily, targetFamily);

  if (needsCast && cast === 'none') {
    issues.push({
      severity: 'error',
      message: `Type mismatch: "${field.field_type}" cannot map to ${targetFamily} column "${column}" without a type cast. Open the cast control (⇄) and choose an allowed cast.`,
    });
  }

  if (cast !== 'none' && !allowedCasts.includes(cast)) {
    issues.push({
      severity: 'error',
      message: `Cast "${TYPE_CAST_LABELS[cast]}" is not allowed from ${sourceFamily} to ${targetFamily}. Choose an allowed cast.`,
    });
  }

  if (cast !== 'none' && cast !== targetFamily && !(cast === 'string' && targetFamily === 'string')) {
    if (!allowedCasts.includes(cast)) {
      issues.push({
        severity: 'error',
        message: `Invalid cast for target column type ${targetFamily}.`,
      });
    }
  }

  const valid = issues.filter((i) => i.severity === 'error').length === 0;
  return { valid, configured: true, issues };
}

export function isFieldMappingValid(
  field: FormField,
  mapping: FormFieldMapping | undefined,
  ctx: Omit<Parameters<typeof validateFieldMapping>[0], 'field' | 'mapping'>,
): boolean {
  return validateFieldMapping({ ...ctx, field, mapping }).valid;
}

export function applyFieldMappingValue(raw: unknown, mapping: FormFieldMapping): unknown {
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

  switch (cast) {
    case 'string':
      return String(value);
    case 'number': {
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === '1' || value === 'on') return true;
      if (value === 'false' || value === '0' || value === 'off') return false;
      return Boolean(value);
    case 'date': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
    }
    default:
      return value;
  }
}
