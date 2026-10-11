import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataExplorerSortDir } from '@/lib/schema-explorer-columns';

type Props = {
  label: string;
  columnId: string;
  sortColumnId: string | null;
  sortDir: DataExplorerSortDir;
  onSort: (columnId: string) => void;
  className?: string;
};

export function DataExplorerSortHeader({
  label,
  columnId,
  sortColumnId,
  sortDir,
  onSort,
  className,
}: Props) {
  const active = sortColumnId === columnId;

  return (
    <button
      type="button"
      onClick={() => onSort(columnId)}
      className={cn(
        'group inline-flex items-center gap-1 rounded-md py-0.5 font-medium transition-colors hover:text-slate-800',
        active ? 'text-slate-900' : 'text-slate-500',
        className,
      )}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={active ? `Sorted ${sortDir === 'asc' ? 'ascending' : 'descending'}` : 'Sort column'}
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
