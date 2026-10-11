import { createFilterRoot, formatFilterRoot, type FilterRoot, type SchemaFilterField } from './schema-filters';

export function buildQuerySummary(
  filterRoot: FilterRoot,
  quickSearch: string,
  fields: SchemaFilterField[],
): string {
  const parts: string[] = [];
  const filterText = formatFilterRoot(filterRoot, fields);
  if (filterText) parts.push(filterText);
  if (quickSearch.trim()) parts.push(`contains "${quickSearch.trim()}"`);
  return parts.join(' or ') || 'All records (no filter)';
}

export type QueryAggregateMode = 'none' | 'count' | 'sum' | 'avg' | 'min' | 'max';

export type QueryWorkTableMeta = {
  schemaSlug: string;
  targetingDimension: string;
  additionalFields: string[];
  segmentCode?: string;
  aggregateMode: QueryAggregateMode;
  aggregateField?: string;
  aggregateGroupBy?: string[];
};

export type QueryWorkTableRecord = {
  pk: string;
  segmentCode?: string;
  data: Record<string, unknown>;
};

export type QueryWorkTableResult = {
  records: QueryWorkTableRecord[];
  primaryKeys: string[];
  previewRows: Record<string, unknown>[];
  meta: QueryWorkTableMeta;
};

export const QUERY_PIPELINE_STAGES = [
  {
    id: 'schema',
    label: 'Database schema',
    description: 'Select the document type or schema to query in the Campaign database.',
  },
  {
    id: 'filter',
    label: 'Filtering conditions & joins',
    description: 'Define criteria, logical groups, and related-schema conditions on the source data.',
  },
  {
    id: 'dimension',
    label: 'Targeting dimension',
    description: 'Choose the primary key returned to the workflow — typically recipient or profile identifiers.',
  },
  {
    id: 'additional',
    label: 'Additional data',
    description: 'Optionally attach extra attributes to the work table for personalization or downstream steps.',
  },
  {
    id: 'segment',
    label: 'Segment code',
    description: 'Optional label stamped on every matching record in the temporary work table.',
  },
  {
    id: 'aggregate',
    label: 'Aggregates',
    description: 'Optional counts, sums, averages, minimums, or maximums with group-by dimensions.',
  },
  {
    id: 'transition',
    label: 'Outgoing transition',
    description: 'Primary keys and additional data flow to the next workflow activity via the work table.',
  },
] as const;

const DEFAULT_DIMENSION_BY_SCHEMA: Record<string, string> = {
  customer: 'id',
  customers: 'id',
  events: 'customer_id',
  event: 'customer_id',
  web_push_subscriber: 'customer_id',
  web_push_subscribers: 'customer_id',
  engagement_log: 'customer_id',
};

const PK_FIELD_CANDIDATES = ['id', 'customer_id', 'recipient_id', 'profile_id', 'subscriber_id'];

export function defaultQueryActivityConfig(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    query_source: 'schema',
    schema_slug: 'customer',
    audience_slug: '',
    quick_search: '',
    filter_json: createFilterRoot(),
    query_label: '',
    work_table_label: 'Result',
    targeting_dimension: 'id',
    additional_fields: [] as string[],
    segment_code: '',
    aggregate_mode: 'none' as QueryAggregateMode,
    aggregate_field: '',
    aggregate_group_by: [] as string[],
    ...overrides,
  };
}

export function resolveTargetingDimension(
  schemaSlug: string,
  fields: SchemaFilterField[],
  configured?: string,
): string {
  if (configured && fields.some((f) => f.key === configured)) return configured;
  const bySchema = DEFAULT_DIMENSION_BY_SCHEMA[schemaSlug];
  if (bySchema && fields.some((f) => f.key === bySchema)) return bySchema;
  for (const candidate of PK_FIELD_CANDIDATES) {
    if (fields.some((f) => f.key === candidate)) return candidate;
  }
  return fields[0]?.key ?? 'id';
}

function fieldValue(row: Record<string, unknown>, key: string, fields: SchemaFilterField[]): unknown {
  const field = fields.find((f) => f.key === key);
  if (field) return field.getValue(row);
  return row[key];
}

function extractPrimaryKey(
  row: Record<string, unknown>,
  dimension: string,
  fields: SchemaFilterField[],
): string | null {
  const raw = fieldValue(row, dimension, fields);
  if (raw == null || raw === '') return null;
  return String(raw);
}

function computeAggregate(
  rows: Record<string, unknown>[],
  aggregateField: string,
  mode: QueryAggregateMode,
  fields: SchemaFilterField[],
): number {
  if (mode === 'count') return rows.length;
  const values = rows
    .map((row) => fieldValue(row, aggregateField, fields))
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((n) => Number.isFinite(n));
  if (!values.length) return 0;
  switch (mode) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return rows.length;
  }
}

function aggregateLabel(mode: QueryAggregateMode): string {
  switch (mode) {
    case 'count':
      return 'count';
    case 'sum':
      return 'sum';
    case 'avg':
      return 'avg';
    case 'min':
      return 'min';
    case 'max':
      return 'max';
    default:
      return mode;
  }
}

export function buildQueryWorkTable(
  rows: Record<string, unknown>[],
  config: Record<string, unknown>,
  schemaSlug: string,
  fields: SchemaFilterField[],
): QueryWorkTableResult {
  const targetingDimension = resolveTargetingDimension(
    schemaSlug,
    fields,
    String(config.targeting_dimension ?? ''),
  );
  const additionalFields = Array.isArray(config.additional_fields)
    ? (config.additional_fields as string[]).filter((f) => f && f !== targetingDimension)
    : [];
  const segmentCode = String(config.segment_code ?? '').trim() || undefined;
  const aggregateMode = (String(config.aggregate_mode ?? 'none') as QueryAggregateMode) || 'none';
  const aggregateField = String(config.aggregate_field ?? '');
  const aggregateGroupBy = Array.isArray(config.aggregate_group_by)
    ? (config.aggregate_group_by as string[])
    : [];

  const meta: QueryWorkTableMeta = {
    schemaSlug,
    targetingDimension,
    additionalFields,
    segmentCode,
    aggregateMode,
    aggregateField: aggregateField || undefined,
    aggregateGroupBy: aggregateGroupBy.length ? aggregateGroupBy : undefined,
  };

  const records: QueryWorkTableRecord[] = [];

  if (aggregateMode !== 'none' && aggregateGroupBy.length) {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const groupKey = aggregateGroupBy
        .map((field) => String(fieldValue(row, field, fields) ?? ''))
        .join('\u0001');
      const bucket = groups.get(groupKey) ?? [];
      bucket.push(row);
      groups.set(groupKey, bucket);
    }

    let index = 0;
    for (const groupRows of groups.values()) {
      const data: Record<string, unknown> = {};
      for (const field of aggregateGroupBy) {
        data[field] = fieldValue(groupRows[0]!, field, fields);
      }
      for (const field of additionalFields) {
        data[field] = fieldValue(groupRows[0]!, field, fields);
      }
      data[aggregateLabel(aggregateMode)] = computeAggregate(
        groupRows,
        aggregateField || aggregateGroupBy[0]!,
        aggregateMode,
        fields,
      );
      const pk =
        aggregateGroupBy.length === 1
          ? String(data[aggregateGroupBy[0]!] ?? `aggregate-${index}`)
          : `aggregate-${index}`;
      records.push({ pk, segmentCode, data });
      index += 1;
    }
  } else {
    const seen = new Set<string>();
    for (const row of rows) {
      const pk = extractPrimaryKey(row, targetingDimension, fields);
      if (!pk || seen.has(pk)) continue;
      seen.add(pk);
      const data: Record<string, unknown> = {};
      for (const field of additionalFields) {
        data[field] = fieldValue(row, field, fields);
      }
      records.push({ pk, segmentCode, data });
    }
  }

  const primaryKeys = records.map((r) => r.pk);
  const previewRows = records.slice(0, 20).map((record) => ({
    _pk: record.pk,
    ...(record.segmentCode ? { segment_code: record.segmentCode } : {}),
    ...record.data,
  }));

  return { records, primaryKeys, previewRows, meta };
}

export function queryConfigSummary(config: Record<string, unknown>): string {
  const source = String(config.query_source ?? (config.audience_slug ? 'audience' : 'schema'));
  const schema = source === 'audience' ? String(config.audience_slug || 'audience') : String(config.schema_slug || 'schema');
  const dimension = String(config.targeting_dimension || 'id');
  const extras = Array.isArray(config.additional_fields) ? (config.additional_fields as string[]).length : 0;
  const agg = String(config.aggregate_mode ?? 'none');
  const parts = [schema, `dim:${dimension}`];
  if (extras) parts.push(`+${extras} fields`);
  if (agg !== 'none') parts.push(agg);
  if (config.segment_code) parts.push('segment');
  return parts.join(' · ');
}

export function parseFilterRoot(value: unknown): FilterRoot {
  if (value && typeof value === 'object' && 'type' in (value as object)) {
    return value as FilterRoot;
  }
  return createFilterRoot();
}
