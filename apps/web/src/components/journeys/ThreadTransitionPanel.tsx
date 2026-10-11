import { ArrowRight } from 'lucide-react';
import { NodePopulationPreview } from '@/components/journeys/NodePopulationPreview';
import type { NodePopulationResult } from '@/lib/workflow-engine';

type Props = {
  sourceLabel: string;
  targetLabel?: string;
  sourceHandle?: string | null;
  result?: NodePopulationResult | null;
  loading?: boolean;
  isFinished?: boolean;
  onClose?: () => void;
};

export function ThreadTransitionPanel({
  sourceLabel,
  targetLabel,
  sourceHandle,
  result,
  loading,
  isFinished,
  onClose,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-100 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
              Transition data
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
              <span className="truncate">{sourceLabel}</span>
              {sourceHandle ? (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {sourceHandle}
                </span>
              ) : null}
              {targetLabel ? (
                <>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{targetLabel}</span>
                </>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Population passing through this thread from the upstream activity. Right-click a thread on
              the canvas to inspect transition data while the workflow is running.
            </p>
            {isFinished && (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                Transition data is cleared when the workflow finishes. Delivery summaries are kept.
              </p>
            )}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <NodePopulationPreview result={result} loading={loading} />
      </div>
    </div>
  );
}
