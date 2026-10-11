import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui';

type Props = {
  count: number;
  resourceLabel: string;
  onDelete: () => void;
  onClear: () => void;
  disabled?: boolean;
};

export function BulkActionBar({ count, resourceLabel, onDelete, onClear, disabled }: Props) {
  if (count === 0) return null;

  const plural = count === 1 ? resourceLabel : `${resourceLabel}s`;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50/80 px-6 py-3">
      <span className="text-sm font-medium text-brand-900">
        {count} {plural} selected
      </span>
      <Button
        size="sm"
        className="bg-red-600 hover:bg-red-700"
        onClick={onDelete}
        disabled={disabled}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        Delete selected
      </Button>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        <X className="h-3.5 w-3.5" />
        Clear selection
      </button>
    </div>
  );
}
