import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Plus } from 'lucide-react';
import { PageHeader, Card, Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { cn, formatNumber } from '@/lib/utils';
import {
  RANGE_OPTIONS,
  useIngestionOverview,
  type RangeKey,
} from '@/lib/ingestion-overview';
import { MetricTile } from '@/components/data/MetricTile';
import { StatusPill } from '@/components/data/StatusPill';
import { ActivityStream } from '@/components/data/ActivityStream';
import { IngestPipelineStrip } from '@/components/data/IngestPipelineStrip';
import { DataMonitorTabs } from '@/components/data/DataMonitorTabs';

export function DataOverviewPage() {
  const { tenantId, environment } = useAuth();
  const [range, setRange] = useState<RangeKey>('24h');
  const rangeHours = RANGE_OPTIONS.find((r) => r.key === range)?.hours ?? 24;

  const { data, isLoading, isError, refetch } = useIngestionOverview(tenantId, environment, rangeHours);

  return (
    <div>
      <PageHeader
        title="Ingestion Overview"
        description="Is the pipeline healthy right now? Volume, connector health, and every run in one place."
        action={
          <Link to="/data/connectors/new">
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              Add connector
            </Button>
          </Link>
        }
      />

      <DataMonitorTabs active="overview" />

      {/* Time range */}
      <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRange(opt.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              range === opt.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isError ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Couldn&apos;t load ingestion metrics.</p>
            <button type="button" onClick={() => refetch()} className="mt-1 text-red-600 underline">
              Retry
            </button>
          </div>
        </Card>
      ) : isLoading || !data ? (
        <OverviewSkeleton />
      ) : (
        <div className="space-y-6">
          {/* Volume band */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile
              label="Records today"
              value={formatNumber(data.recordsToday)}
              spark={data.volumeSpark}
              sub={`${formatNumber(data.recordsMonth)} this month`}
            />
            <MetricTile
              label="Throughput"
              value={`${formatNumber(data.recordsPerMin)}/min`}
              sub="rolling last 60 min"
              sparkTone="ok"
              spark={data.volumeSpark}
            />
            <MetricTile
              label="Ingested"
              value={formatNumber(data.recordsIngested)}
              sub={`${formatNumber(data.recordsExported)} exported`}
            />
            <MetricTile
              label="Failed records"
              value={formatNumber(data.recordsFailed)}
              sparkTone={data.recordsFailed > 0 ? 'fail' : 'ok'}
              sub={
                data.recordsSucceeded + data.recordsFailed > 0
                  ? `${successRate(data.recordsSucceeded, data.recordsFailed)} success rate`
                  : 'no records yet'
              }
            />
          </div>

          {/* Health row */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-slate-900">Connector health</h3>
                <span className="font-mono text-sm tabular-nums text-slate-400">{data.totalConnectors} total</span>
              </div>
              <ul className="mt-3 space-y-2">
                {data.connectorHealth.map((b) => (
                  <li key={b.key} className="flex items-center justify-between">
                    <StatusPill tone={b.tone} label={b.label} />
                    <span className="font-mono text-sm tabular-nums text-slate-700">{b.count}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-slate-900">Sync health</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <Stat label="Active runs" value={formatNumber(data.activeRuns)} tone={data.activeRuns > 0 ? 'run' : undefined} />
                <Stat label="Completed" value={formatNumber(data.completedRuns)} />
                <Stat label="Failed" value={formatNumber(data.failedRuns)} tone={data.failedRuns > 0 ? 'fail' : undefined} />
                <Stat label="Queued pipelines" value={formatNumber(data.queuedPipelines)} />
                <Stat label="Avg run" value={formatDuration(data.avgRunSeconds)} />
              </dl>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-slate-900">Data quality</h3>
              <div className="mt-3 flex gap-6">
                <div>
                  <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-600">
                    {formatNumber(data.quality.validRecords)}
                  </p>
                  <p className="text-xs text-slate-500">valid</p>
                </div>
                <div>
                  <p className="font-mono text-2xl font-semibold tabular-nums text-red-600">
                    {formatNumber(data.quality.invalidRecords)}
                  </p>
                  <p className="text-xs text-slate-500">invalid</p>
                </div>
              </div>
              {data.quality.causes.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                  {data.quality.causes.map((c) => (
                    <li key={c.label} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-600">{c.label}</span>
                      <span className="font-mono tabular-nums text-slate-400">{c.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  {data.quality.runsWithErrors > 0
                    ? `${data.quality.runsWithErrors} run(s) reported errors — no structured causes logged.`
                    : 'No validation errors logged in this window.'}
                </p>
              )}
            </Card>
          </div>

          {/* Pipeline reference */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900">How data flows</h3>
            <p className="mt-1 text-sm text-slate-500">
              Every connector follows the same loop. Each run is asynchronous, observable, and resumable.
            </p>
            <IngestPipelineStrip className="mt-3" showHints />
          </Card>

          {/* Activity */}
          <Card className="overflow-hidden p-0">
            <ActivityStream runs={data.runs} onLiveEvent={() => refetch()} />
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'run' | 'fail' }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        className={cn(
          'font-mono text-lg font-semibold tabular-nums',
          tone === 'run' && 'text-blue-600',
          tone === 'fail' && 'text-red-600',
          !tone && 'text-slate-900',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
    </div>
  );
}

function successRate(ok: number, failed: number): string {
  const total = ok + failed;
  if (total === 0) return '—';
  return `${((ok / total) * 100).toFixed(total > 100 ? 1 : 0)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
