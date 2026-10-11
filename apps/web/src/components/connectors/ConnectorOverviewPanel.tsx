import { ArrowRight, Clock, Link2, MapPin, Play, Zap } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import {
  connectorMeta,
  directionLabel,
  mappingPreview,
  syncHealth,
  type ConnectorDirection,
} from '@/lib/connector-meta';
import type { ConnectorMappingRow } from '@/lib/connector-mapping';
import { TRANSFORM_OPTIONS } from '@/lib/connector-mapping';

type Run = {
  id: string;
  status: string;
  records_processed: number | null;
  records_failed: number | null;
  started_at: string;
};

type Props = {
  name: string;
  connectorType: string;
  direction: ConnectorDirection;
  status: string;
  mapping: ConnectorMappingRow[];
  lastSyncAt: string | null;
  scheduleCron: string | null;
  runs: Run[];
  onRunSync: () => void;
  syncPending: boolean;
};

export function ConnectorOverviewPanel({
  name,
  connectorType,
  direction,
  status,
  mapping,
  lastSyncAt,
  scheduleCron,
  runs,
  onRunSync,
  syncPending,
}: Props) {
  const meta = connectorMeta(connectorType);
  const Icon = meta?.icon;
  const health = syncHealth(lastSyncAt, status);
  const preview = mappingPreview(mapping);
  const mappingCount = mapping.filter((m) => m.source_field && m.target_field).length;
  const latestRun = runs[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Field mappings" value={String(mappingCount)} icon={MapPin} />
        <KpiCard
          label="Sync health"
          value={health === 'healthy' ? 'Healthy' : health === 'warning' ? 'Stale' : health === 'idle' ? 'Never synced' : 'Issue'}
          icon={Zap}
          accent={health === 'healthy' ? 'emerald' : health === 'warning' ? 'amber' : health === 'idle' ? 'slate' : 'red'}
        />
        <KpiCard
          label="Last sync"
          value={lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : '—'}
          icon={Clock}
        />
        <KpiCard
          label="Schedule"
          value={scheduleCron ? 'Automated' : 'Manual'}
          icon={Play}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mapping preview */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Mapping pipeline</h3>
            <Badge variant="default">{mappingCount} fields</Badge>
          </div>
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-950 p-4">
            <div className="mb-3 flex items-center gap-2">
              {Icon && (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${meta?.accent}22`, color: meta?.accent }}
                >
                  <Icon className="h-4 w-4" />
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-white">{meta?.label ?? connectorType}</p>
                <p className="text-[10px] text-slate-500">{directionLabel(direction)}</p>
              </div>
            </div>
            {preview.length ? (
              <div className="space-y-1.5">
                {preview.map((row, i) => {
                  const tLabel = TRANSFORM_OPTIONS.find((t) => t.value === row.transform)?.label;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-emerald-300">{row.source_field}</span>
                      {tLabel && tLabel !== 'None' && (
                        <>
                          <ArrowRight className="h-2.5 w-2.5 text-slate-600" />
                          <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-violet-300">{tLabel}</span>
                        </>
                      )}
                      <ArrowRight className="h-2.5 w-2.5 text-slate-600" />
                      <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-blue-300">
                        {row.target_schema}.{row.target_field}
                      </span>
                    </div>
                  );
                })}
                {mappingCount > preview.length && (
                  <p className="text-[10px] text-slate-500">+{mappingCount - preview.length} more</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No mappings configured — open Mapping tab</p>
            )}
          </div>
        </div>

        {/* Quick actions + recent runs */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 p-6">
            <h3 className="font-semibold text-teal-900">Quick actions</h3>
            <p className="mt-1 text-sm text-teal-700">Sync {name} now or review configuration</p>
            <Button className="mt-4" onClick={onRunSync} disabled={syncPending}>
              <Play className="mr-1.5 h-4 w-4" />
              {syncPending ? 'Running…' : 'Run sync now'}
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">Recent syncs</h3>
            {!runs.length ? (
              <p className="mt-3 text-sm text-slate-500">No sync history yet</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {runs.slice(0, 4).map((run) => (
                  <li key={run.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-600">{new Date(run.started_at).toLocaleString()}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{run.records_processed ?? 0} rows</span>
                      <Badge variant={run.status === 'completed' ? 'success' : 'default'}>{run.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {latestRun && (
              <p className="mt-3 flex items-center gap-1 text-xs text-slate-400">
                <Link2 className="h-3 w-3" />
                Latest: {latestRun.records_processed ?? 0} processed, {latestRun.records_failed ?? 0} failed
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof Zap;
  accent?: string;
}) {
  const valueColor =
    accent === 'emerald' ? 'text-emerald-600' :
    accent === 'amber' ? 'text-amber-600' :
    accent === 'red' ? 'text-red-600' : 'text-slate-900';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className={`mt-2 text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}
