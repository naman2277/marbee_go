import type { SchemaFilterField } from '@/lib/schema-filters';
import type { Customer } from '@marbee/shared';
import { evaluateExpr, fieldExpr, formatExprCode, type ExprNode } from '@/lib/schema-expressions';
import { getCustomerDisplayName } from '@/lib/customers';
import { fieldToAlias, normalizeColumnSpec, resolveColumnSourceKey } from '@/lib/schema-explorer-columns';

type CustomerJoin = Pick<Customer, 'title' | 'first_name' | 'middle_name' | 'last_name' | 'email' | 'mobile'>;

const CUSTOMER_JOIN_SELECT = 'title, first_name, middle_name, last_name, email, mobile';

export type DataColumnSpec = {
  id: string;
  key: string;
  label: string;
  transform: ExprNode | null;
  alias: string;
  groupBy: boolean;
};

/** Default visible columns per table in the schema data explorer */
export const DEFAULT_TABLE_COLUMNS: Record<string, string[]> = {
  customers: ['id', 'first_name', 'last_name', 'email', 'mobile', 'updated_at'],
  pushSubscribers: [
    'browser',
    'os',
    'device',
    'website_domain',
    'optin_page',
    'optin_status',
    'subscription_status',
    'is_test_token',
    'fcm_token',
    'created_at',
  ],
  web_push_subscribers: [
    'browser',
    'os',
    'device',
    'website_domain',
    'optin_page',
    'optin_status',
    'subscription_status',
    'is_test_token',
    'fcm_token',
    'created_at',
  ],
};

function getJoinedCustomerName(row: Record<string, unknown>): string | undefined {
  const customer = row.customers as CustomerJoin | null;
  if (!customer) return undefined;
  const label = getCustomerDisplayName(customer);
  return label === 'Unknown customer' ? undefined : label;
}

export function formatFieldLabel(
  name: string,
  schemaFields?: Array<{ name: string; description?: string | null }>,
): string {
  const fromSchema = schemaFields?.find((f) => f.name === name)?.description?.trim();
  if (fromSchema) return fromSchema;
  if (name === 'dob') return 'DOB';
  if (name === 'id') return 'ID';
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Maps schema table_name → Supabase query config for the data explorer */
export const SCHEMA_TABLE_CONFIG: Record<
  string,
  {
    select: string;
    orderBy: string;
    ascending?: boolean;
    relationFields?: SchemaFilterField[];
    extraColumns?: string[];
  }
> = {
  pushSubscribers: {
    select: `*, customers(${CUSTOMER_JOIN_SELECT})`,
    orderBy: 'created_at',
    ascending: false,
    extraColumns: ['customer_name', 'customer_email'],
    relationFields: [
      {
        key: 'customer_name',
        label: 'Customer Name',
        type: 'string',
        getValue: (row) => getJoinedCustomerName(row),
      },
      {
        key: 'customer_email',
        label: 'Customer Email',
        type: 'string',
        getValue: (row) => (row.customers as { email?: string } | null)?.email,
      },
    ],
  },
  push_subscribers: {
    select: `*, customers(${CUSTOMER_JOIN_SELECT})`,
    orderBy: 'created_at',
    ascending: false,
    extraColumns: ['customer_name', 'customer_email'],
    relationFields: [
      {
        key: 'customer_name',
        label: 'Customer Name',
        type: 'string',
        getValue: (row) => getJoinedCustomerName(row),
      },
      {
        key: 'customer_email',
        label: 'Customer Email',
        type: 'string',
        getValue: (row) => (row.customers as { email?: string } | null)?.email,
      },
    ],
  },
  web_push_subscribers: {
    select: `*, customers(${CUSTOMER_JOIN_SELECT})`,
    orderBy: 'created_at',
    ascending: false,
    extraColumns: ['customer_name', 'customer_email'],
    relationFields: [
      {
        key: 'customer_name',
        label: 'Customer Name',
        type: 'string',
        getValue: (row) => getJoinedCustomerName(row),
      },
      {
        key: 'customer_email',
        label: 'Customer Email',
        type: 'string',
        getValue: (row) => (row.customers as { email?: string } | null)?.email,
      },
    ],
  },
  customers: { select: '*', orderBy: 'created_at', ascending: false },
  customer_identities: {
    select: `*, customers(${CUSTOMER_JOIN_SELECT})`,
    orderBy: 'created_at',
    ascending: false,
    extraColumns: ['customer_name', 'customer_email'],
    relationFields: [
      {
        key: 'customer_name',
        label: 'Customer Name',
        type: 'string',
        getValue: (row) => getJoinedCustomerName(row),
      },
      {
        key: 'customer_email',
        label: 'Customer Email',
        type: 'string',
        getValue: (row) => (row.customers as { email?: string } | null)?.email,
      },
    ],
  },
  events: {
    select: `*, customers(${CUSTOMER_JOIN_SELECT})`,
    orderBy: 'timestamp',
    ascending: false,
    extraColumns: ['customer_name', 'customer_email'],
    relationFields: [
      {
        key: 'customer_name',
        label: 'Customer Name',
        type: 'string',
        getValue: (row) => getJoinedCustomerName(row),
      },
      {
        key: 'customer_email',
        label: 'Customer Email',
        type: 'string',
        getValue: (row) => (row.customers as { email?: string } | null)?.email,
      },
    ],
  },
  engagement_log: {
    select: `*, customers(${CUSTOMER_JOIN_SELECT})`,
    orderBy: 'timestamp',
    ascending: false,
    extraColumns: ['customer_name', 'customer_email'],
    relationFields: [
      {
        key: 'customer_name',
        label: 'Customer Name',
        type: 'string',
        getValue: (row) => getJoinedCustomerName(row),
      },
      {
        key: 'customer_email',
        label: 'Customer Email',
        type: 'string',
        getValue: (row) => (row.customers as { email?: string } | null)?.email,
      },
    ],
  },
  exclusions: {
    select: `*, customers(${CUSTOMER_JOIN_SELECT})`,
    orderBy: 'created_at',
    ascending: false,
    extraColumns: ['customer_name', 'customer_email'],
    relationFields: [
      {
        key: 'customer_name',
        label: 'Customer Name',
        type: 'string',
        getValue: (row) => getJoinedCustomerName(row),
      },
      {
        key: 'customer_email',
        label: 'Customer Email',
        type: 'string',
        getValue: (row) => (row.customers as { email?: string } | null)?.email,
      },
    ],
  },
  deliveries: { select: '*', orderBy: 'created_at', ascending: false },
  real_time_triggers: { select: '*', orderBy: 'created_at', ascending: false },
};

export function canExploreSchema(schema: {
  table_name: string | null;
  is_system: boolean;
  status: string;
}): boolean {
  if (!schema.table_name) return false;
  if (schema.is_system) return Boolean(SCHEMA_TABLE_CONFIG[schema.table_name]);
  return schema.status === 'published';
}

export function listAvailableDataFields(
  _tableName: string | null | undefined,
  schemaFields: { name: string; sort_order: number; description?: string | null }[] | undefined,
  rows: Record<string, unknown>[] | undefined,
  tableConfig?: (typeof SCHEMA_TABLE_CONFIG)[string],
): Array<{ key: string; label: string }> {
  const extra = tableConfig?.extraColumns ?? [];
  let keys: string[] = [];

  if (schemaFields?.length) {
    keys = schemaFields
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => f.name);
  } else if (rows?.[0]) {
    keys = Object.keys(rows[0]).filter((k) => k !== 'customers');
  }

  const all = [...keys, ...extra.filter((c) => !keys.includes(c))];
  return all.map((key) => ({
    key,
    label: formatFieldLabel(key, schemaFields),
  }));
}

export function resolveDataColumnSpecs(
  tableName: string | null | undefined,
  schemaFields: { name: string; sort_order: number; description?: string | null }[] | undefined,
  rows: Record<string, unknown>[] | undefined,
  tableConfig?: (typeof SCHEMA_TABLE_CONFIG)[string],
  customColumns?: DataColumnSpec[] | null,
): DataColumnSpec[] {
  if (customColumns?.length) return customColumns;

  const defaultKeys = tableName ? DEFAULT_TABLE_COLUMNS[tableName] : undefined;
  if (defaultKeys?.length) {
    return defaultKeys.map((key) =>
      normalizeColumnSpec({
        key,
        label: formatFieldLabel(key, schemaFields),
        transform: null,
      }),
    );
  }

  return listAvailableDataFields(tableName, schemaFields, rows, tableConfig).map((f) =>
    normalizeColumnSpec({
      key: f.key,
      label: f.label,
      transform: null,
    }),
  );
}

/** @deprecated Use resolveDataColumnSpecs */
export function resolveDataColumns(
  _tableName: string | null | undefined,
  schemaFields: { name: string; sort_order: number }[] | undefined,
  rows: Record<string, unknown>[] | undefined,
  tableConfig?: (typeof SCHEMA_TABLE_CONFIG)[string],
): string[] {
  return resolveDataColumnSpecs(_tableName, schemaFields, rows, tableConfig).map((c) => c.key);
}

export function formatCellValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);

  const str = String(value);
  if (key.endsWith('_at') || key === 'last_seen' || key === 'timestamp' || key === 'dob') {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
      return key === 'dob' ? d.toLocaleDateString() : d.toLocaleString();
    }
  }
  if (key === 'fcm_token' && str.length > 24) return `${str.slice(0, 24)}…`;
  if (key.endsWith('_id') && str.length > 12) return `${str.slice(0, 8)}…`;

  return str;
}

export function getDisplayValue(row: Record<string, unknown>, key: string): unknown {
  if (key === 'customer_name') {
    return getJoinedCustomerName(row);
  }
  if (key === 'customer_email') {
    return (row.customers as { email?: string } | null)?.email;
  }
  return row[key];
}

export function getColumnCellValue(
  row: Record<string, unknown>,
  col: DataColumnSpec,
  filterFields: SchemaFilterField[],
): unknown {
  if (typeof row.__group_count === 'number') {
    if (col.id in row) return row[col.id];
    if (col.key in row) return row[col.key];
  }
  if (col.transform) return evaluateExpr(col.transform, row, filterFields);
  return getDisplayValue(row, resolveColumnSourceKey(col));
}

export function getColumnHeaderLabel(col: DataColumnSpec, _filterFields?: SchemaFilterField[]): string {
  if (col.transform) {
    const code = formatExprCode(col.transform);
    return code ? `${col.label} · ${code}` : col.label;
  }
  return col.label;
}

export function createColumnSpec(
  key: string,
  schemaFields?: Array<{ name: string; description?: string | null }>,
): DataColumnSpec {
  return normalizeColumnSpec({
    key,
    label: formatFieldLabel(key, schemaFields),
    transform: null,
  });
}

export function defaultTransformForField(key: string): ExprNode {
  return fieldExpr(key);
}
