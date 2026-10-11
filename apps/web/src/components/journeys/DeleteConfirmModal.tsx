import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui';

type Props = {
  open: boolean;
  title: string;
  name: string;
  itemType?: 'campaign' | 'journey';
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmModal({
  open,
  title,
  name,
  itemType = 'campaign',
  loading = false,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [confirmedCheck, setConfirmedCheck] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60"
        aria-label="Close"
        onClick={loading ? undefined : onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
        {/* Top Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-2xs">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black text-slate-900 leading-snug">{title}</h3>
            <p className="mt-1 text-xs text-rose-700 font-medium">
              Warning: This action is permanent and cannot be reverted.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Warning Details Body */}
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/60 p-3.5 space-y-2 text-xs text-rose-950">
          <p className="font-bold text-slate-900 truncate">
            {itemType === 'campaign' ? 'Campaign' : 'Journey'}: <span className="text-rose-700 font-mono font-black">"{name}"</span>
          </p>
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 leading-relaxed">
            <li>The workflow graph, steps, and activity nodes will be removed.</li>
            <li>All version history and configured schedule triggers will be deleted.</li>
            <li>Any pending delivery batches or draft messages will be cancelled.</li>
          </ul>
        </div>

        {/* Checkbox confirmation */}
        <label className="mt-4 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs font-semibold text-slate-800 cursor-pointer hover:bg-slate-100/80 transition select-none">
          <input
            type="checkbox"
            checked={confirmedCheck}
            onChange={(e) => setConfirmedCheck(e.target.checked)}
            disabled={loading}
            className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
          />
          <span>I understand that deleting this {itemType} is irreversible.</span>
        </label>

        {error && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={onClose}
            className="font-bold text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading || !confirmedCheck}
            onClick={onConfirm}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Permanently Delete {itemType === 'campaign' ? 'Campaign' : 'Journey'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
