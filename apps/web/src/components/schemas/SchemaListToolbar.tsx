import { Search, ArrowUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  DEFAULT_SCHEMA_LIST_FILTERS,
  hasActiveSchemaFilters,
  SCHEMA_SORT_OPTIONS,
  type SchemaListFilters,
  type SchemaSortField,
  type SchemaStatusFilter,
  type SchemaTypeFilter,
} from '@/lib/schema-list-filters';

type Props = {
  filters: SchemaListFilters;
  onChange: (filters: SchemaListFilters) => void;
  totalCount: number;
  filteredCount: number;
};

export function SchemaListToolbar({ filters, onChange, totalCount, filteredCount }: Props) {
  const patch = (partial: Partial<SchemaListFilters>) => onChange({ ...filters, ...partial });

  const toggleSortDir = () => {
    patch({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' });
  };

  return (
    <div className="border-b border-slate-100 px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Search name, slug, table, description…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <select
          value={filters.type}
          onChange={(e) => patch({ type: e.target.value as SchemaTypeFilter })}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          <option value="system">System</option>
          <option value="custom">Custom</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => patch({ status: e.target.value as SchemaStatusFilter })}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>

        <div className="flex items-center gap-1">
          <select
            value={filters.sortField}
            onChange={(e) => patch({ sortField: e.target.value as SchemaSortField })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            aria-label="Sort by"
          >
            {SCHEMA_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleSortDir}
            title={filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <ArrowUpDown className={`h-4 w-4 ${filters.sortDir === 'desc' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {hasActiveSchemaFilters(filters) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_SCHEMA_LIST_FILTERS)}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{filteredCount}</span>
        {' '}of{' '}
        <span className="font-medium text-slate-700">{totalCount}</span>
        {' '}schemas
        {' · '}
        sorted by{' '}
        <span className="font-medium text-slate-700">
          {SCHEMA_SORT_OPTIONS.find((o) => o.value === filters.sortField)?.label ?? filters.sortField}
        </span>
        {filters.sortDir === 'asc' ? ' (asc)' : ' (desc)'}
        {' · click column headers to sort'}
      </p>
    </div>
  );
}
