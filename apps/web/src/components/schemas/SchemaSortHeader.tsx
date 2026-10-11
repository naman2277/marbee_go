import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SchemaSortDir, SchemaSortField } from '@/lib/schema-list-filters';

type Props = {
  label: string;
  field: SchemaSortField;
  sortField: SchemaSortField;
  sortDir: SchemaSortDir;
  onSort: (field: SchemaSortField) => void;
  className?: string;
};

export function SchemaSortHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
  className,
}: Props) {
  const active = sortField === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        'group inline-flex items-center gap-1 rounded-md py-0.5 font-medium transition-colors hover:text-slate-800',
        active ? 'text-slate-900' : 'text-slate-500',
        className,
      )}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      {active ? (
        sortDir === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
        )
      ) : (
        <ChevronsUpDown
          className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-400"
          aria-hidden
        />
      )}
    </button>
  );
}
