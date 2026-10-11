import type { SchemaWithFields } from './fetch-schemas';
import { getSchemaStatusLabel } from './schema-labels';
import type { SchemaTableStats } from './schema-stats';

export type SchemaTypeFilter = 'all' | 'system' | 'custom';
export type SchemaStatusFilter = 'all' | 'active' | 'draft' | 'published';
export type SchemaSortField =
  | 'name'
  | 'type'
  | 'fields'
  | 'created_at'
  | 'updated_at'
  | 'records'
  | 'storage'
  | 'status';
export type SchemaSortDir = 'asc' | 'desc';

export type SchemaListFilters = {
  search: string;
  type: SchemaTypeFilter;
  status: SchemaStatusFilter;
  sortField: SchemaSortField;
  sortDir: SchemaSortDir;
};

export const DEFAULT_SCHEMA_LIST_FILTERS: SchemaListFilters = {
  search: '',
  type: 'all',
  status: 'all',
  sortField: 'name',
  sortDir: 'asc',
};

export function hasActiveSchemaFilters(filters: SchemaListFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.type !== 'all' ||
    filters.status !== 'all' ||
    filters.sortField !== DEFAULT_SCHEMA_LIST_FILTERS.sortField ||
    filters.sortDir !== DEFAULT_SCHEMA_LIST_FILTERS.sortDir
  );
}

function matchesSearch(schema: SchemaWithFields, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    schema.name,
    schema.slug,
    schema.table_name,
    schema.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(q);
}

function matchesType(schema: SchemaWithFields, type: SchemaTypeFilter): boolean {
  if (type === 'all') return true;
  if (type === 'system') return schema.is_system;
  return !schema.is_system;
}

function matchesStatus(schema: SchemaWithFields, status: SchemaStatusFilter): boolean {
  if (status === 'all') return true;
  return getSchemaStatusLabel(schema.is_system, schema.status) === status;
}

function sortValue(
  schema: SchemaWithFields,
  field: SchemaSortField,
  stats?: SchemaTableStats,
): string | number {
  switch (field) {
    case 'name':
      return schema.name.toLowerCase();
    case 'type':
      return schema.is_system ? 1 : 0;
    case 'created_at':
      return schema.created_at ? new Date(schema.created_at).getTime() : 0;
    case 'updated_at':
      return schema.updated_at ? new Date(schema.updated_at).getTime() : 0;
    case 'fields':
      return schema.schema_fields?.length ?? 0;
    case 'records':
      return stats?.record_count ?? 0;
    case 'storage':
      return stats?.size_bytes ?? 0;
    case 'status':
      return getSchemaStatusLabel(schema.is_system, schema.status);
    default:
      return schema.name.toLowerCase();
  }
}

export function filterAndSortSchemas(
  schemas: SchemaWithFields[],
  filters: SchemaListFilters,
  statsMap?: Map<string, SchemaTableStats>,
): SchemaWithFields[] {
  const filtered = schemas.filter(
    (schema) =>
      matchesSearch(schema, filters.search) &&
      matchesType(schema, filters.type) &&
      matchesStatus(schema, filters.status),
  );

  const dir = filters.sortDir === 'asc' ? 1 : -1;

  return [...filtered].sort((a, b) => {
    const aStats = statsMap?.get(a.slug);
    const bStats = statsMap?.get(b.slug);
    const aVal = sortValue(a, filters.sortField, aStats);
    const bVal = sortValue(b, filters.sortField, bStats);

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * dir;
    }

    return String(aVal).localeCompare(String(bVal)) * dir;
  });
}

export const SCHEMA_SORT_OPTIONS: Array<{ value: SchemaSortField; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'fields', label: 'Fields' },
  { value: 'created_at', label: 'Created on' },
  { value: 'updated_at', label: 'Last modified' },
  { value: 'records', label: 'Records' },
  { value: 'storage', label: 'Storage' },
  { value: 'status', label: 'Status' },
];

export function toggleSchemaSort(
  filters: SchemaListFilters,
  field: SchemaSortField,
): SchemaListFilters {
  if (filters.sortField === field) {
    return { ...filters, sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' };
  }

  const defaultDesc =
    field === 'created_at' ||
    field === 'updated_at' ||
    field === 'fields' ||
    field === 'records' ||
    field === 'storage';

  return { ...filters, sortField: field, sortDir: defaultDesc ? 'desc' : 'asc' };
}
