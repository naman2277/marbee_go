import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';
import type { JourneyValidationResult } from '@/lib/journey-builder';

type Props = {
  open: boolean;
  result: JourneyValidationResult;
  onClose: () => void;
  onFocusNode?: (nodeId: string) => void;
};

export function JourneyValidationDrawer({ open, result, onClose, onFocusNode }: Props) {
  if (!open) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 z-30 flex w-[360px] flex-col border-l border-slate-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          {result.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-rose-500" />
          )}
          <h3 className="text-sm font-semibold text-slate-900">
            {result.ok ? 'Ready to publish' : `${result.errors.length} issue${result.errors.length === 1 ? '' : 's'} to fix`}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {result.ok && !result.warnings.length && (
          <p className="text-xs text-slate-500">
            No blocking issues. Run a test send, then publish.
          </p>
        )}

        {result.errors.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-rose-500">
              Errors — blocking
            </p>
            <ul className="space-y-1.5">
              {result.errors.map((iss, i) => (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!iss.nodeId}
                    onClick={() => iss.nodeId && onFocusNode?.(iss.nodeId)}
                    className={`flex w-full items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-2 text-left text-xs text-rose-800 ${
                      iss.nodeId ? 'hover:border-rose-300' : ''
                    }`}
                  >
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {iss.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.warnings.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-500">
              Warnings
            </p>
            <ul className="space-y-1.5">
              {result.warnings.map((iss, i) => (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!iss.nodeId}
                    onClick={() => iss.nodeId && onFocusNode?.(iss.nodeId)}
                    className={`flex w-full items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2 text-left text-xs text-amber-800 ${
                      iss.nodeId ? 'hover:border-amber-300' : ''
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {iss.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
