import { Link } from 'react-router-dom';
import { ArrowRight, Download, GitCompare, Minus, Plus, PencilRuler } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldDiff, ImpactRow } from '@/lib/schema-registry';

const KIND_META: Record<FieldDiff['kind'], { label: string; className: string; icon: typeof Plus }> = {
  added: { label: 'Added', className: 'text-emerald-700 bg-emerald-50', icon: Plus },
  removed: { label: 'Removed', className: 'text-red-700 bg-red-50', icon: Minus },
  type: { label: 'Type', className: 'text-amber-700 bg-amber-50', icon: PencilRuler },
  nullability: { label: 'Nullability', className: 'text-amber-700 bg-amber-50', icon: PencilRuler },
  required: { label: 'Required', className: 'text-amber-700 bg-amber-50', icon: PencilRuler },
  primary_key: { label: 'Primary key', className: 'text-red-700 bg-red-50', icon: PencilRuler },
  pii: { label: 'PII', className: 'text-slate-700 bg-slate-100', icon: PencilRuler },
};

const SEVERITY: Record<ImpactRow['severity'], { label: string; className: string }> = {
  safe: { label: 'Safe', className: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20' },
  review: { label: 'Review', className: 'text-amber-700 bg-amber-50 ring-amber-600/20' },
  break: { label: 'Breaking', className: 'text-red-700 bg-red-50 ring-red-600/20' },
};

export function SchemaDiffView({
  schemaName,
  fromVersion,
  toVersion,
  diff,
  impact,
}: {
  schemaName: string;
  fromVersion: number;
  toVersion: number;
  diff: FieldDiff[];
  impact: ImpactRow[];
}) {
  const breaking = diff.filter((d) => d.breaking).length;

  const exportJson = () => {
    const payload = { schema: schemaName, fromVersion, toVersion, generatedAt: new Date().toISOString(), diff, impact };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schemaName}-v${fromVersion}-to-v${toVersion}-diff.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <GitCompare className="h-4 w-4 text-slate-400" />
          <span className="font-mono text-slate-500">v{fromVersion}</span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-mono font-semibold text-slate-900">v{toVersion}</span>
          {breaking > 0 ? (
            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
              {breaking} breaking change{breaking > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              backward-compatible
            </span>
          )}
        </div>
        {diff.length > 0 && (
          <button
            type="button"
            onClick={exportJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export diff
          </button>
        )}
      </div>

      {diff.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          No field-level differences between these versions.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {diff.map((d, i) => {
            const meta = KIND_META[d.kind];
            const Icon = meta.icon;
            return (
              <li key={`${d.name}-${d.kind}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium', meta.className)}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                <code className="font-mono text-slate-800">{d.name}</code>
                <span className="ml-auto flex items-center gap-2 font-mono text-xs text-slate-500">
                  {d.before && <span className="line-through decoration-slate-300">{d.before}</span>}
                  {d.before && d.after && <ArrowRight className="h-3 w-3" />}
                  {d.after && <span className="text-slate-800">{d.after}</span>}
                  {d.breaking && <span className="rounded bg-red-50 px-1 text-[10px] font-semibold text-red-600">BREAK</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Impact · {impact.length} connector{impact.length === 1 ? '' : 's'}
        </h4>
        {impact.length === 0 ? (
          <p className="text-sm text-slate-500">No connectors map to this schema.</p>
        ) : (
          <ul className="space-y-1.5">
            {impact.map((r) => (
              <li key={r.connectorId} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', SEVERITY[r.severity].className)}>
                  {SEVERITY[r.severity].label}
                </span>
                <span className="font-medium text-slate-900">{r.connectorName}</span>
                <span className="truncate text-slate-500">— {r.note}</span>
                {r.severity !== 'safe' && (
                  <Link
                    to={`/data/connectors/${r.connectorId}`}
                    className="ml-auto shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Review mapping
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
