import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

type Props = {
  open: boolean;
  title: string;
  resourceLabel: string;
  items: { id: string; label: string }[];
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function BulkDeleteDialog({
  open,
  title,
  resourceLabel,
  items,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const count = items.length;
  const plural = count === 1 ? resourceLabel : `${resourceLabel}s`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={onCancel}
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm text-slate-600">
            You are about to permanently delete{' '}
            <span className="font-semibold text-slate-900">
              {count} {plural}
            </span>
            . This action cannot be undone.
          </p>
          <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-red-100 bg-red-50/50 p-3 text-sm">
            {items.map((item) => (
              <li key={item.id} className="truncate font-medium text-red-900">
                {item.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Deleting…' : `Delete ${count} ${plural}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
