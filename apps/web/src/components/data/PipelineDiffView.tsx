import { ArrowRight, GitCompare, Minus, Plus, PencilRuler, Unlink, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineChangeKind, PipelineDiffEntry } from '@/lib/pipeline-versions';

const META: Record<PipelineChangeKind, { label: string; className: string; icon: typeof Plus }> = {
  node_added: { label: 'Node added', className: 'text-emerald-700 bg-emerald-50', icon: Plus },
  node_removed: { label: 'Node removed', className: 'text-red-700 bg-red-50', icon: Minus },
  node_retyped: { label: 'Type changed', className: 'text-amber-700 bg-amber-50', icon: PencilRuler },
  node_relabeled: { label: 'Renamed', className: 'text-slate-700 bg-slate-100', icon: PencilRuler },
  node_reconfigured: { label: 'Config changed', className: 'text-amber-700 bg-amber-50', icon: PencilRuler },
  edge_added: { label: 'Connection added', className: 'text-emerald-700 bg-emerald-50', icon: Link2 },
  edge_removed: { label: 'Connection removed', className: 'text-red-700 bg-red-50', icon: Unlink },
};

export function PipelineDiffView({
  fromVersion,
  toVersion,
  diff,
}: {
  fromVersion: number;
  toVersion: number;
  diff: PipelineDiffEntry[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <GitCompare className="h-4 w-4 text-slate-400" />
        <span className="font-mono text-slate-500">v{fromVersion}</span>
        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-mono font-semibold text-slate-900">v{toVersion}</span>
        <span
          className={cn(
            'ml-2 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
            diff.length
              ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
              : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          )}
        >
          {diff.length ? `${diff.length} change${diff.length > 1 ? 's' : ''}` : 'identical'}
        </span>
      </div>

      {diff.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          These two versions have the same graph.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {diff.map((d, i) => {
            const m = META[d.kind];
            const Icon = m.icon;
            return (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium', m.className)}>
                  <Icon className="h-3 w-3" />
                  {m.label}
                </span>
                <span className="font-medium text-slate-800">{d.ref}</span>
                {d.detail && <span className="ml-auto truncate font-mono text-xs text-slate-500">{d.detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
