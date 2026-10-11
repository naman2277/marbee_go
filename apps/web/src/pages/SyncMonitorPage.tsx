import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Download,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn, formatNumber } from '@/lib/utils';
import { exportRowsToCsv, type Column } from '@/components/data/DataTable';
import { StatusPill } from '@/components/data/StatusPill';
import { IngestPipelineStrip } from '@/components/data/IngestPipelineStrip';
import { MiniAreaChart } from '@/components/data/MiniAreaChart';
import { useSyncMonitor } from '@/lib/sync-monitor';
import type { ErrorEntry } from '@/lib/error-log';

export function SyncMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useSyncMonitor(id);

  // Live: refetch on any run change for this connector.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`sync-monitor-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connector_runs', filter: `connector_id=eq.${id}` }, () =>
        refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, refetch]);

  const setConnectorStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from('connectors').update({ status }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sync-monitor', id] }),
  });

  const cancelRun = useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase
        .from('connector_runs')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', runId);
      if (error) throw error;
    },
    onSuccess: () => refetch(),
  });

  const queueRetry = useMutation({
    mutationFn: async (failedCount: number) => {
      const { error } = await supabase.from('connector_runs').insert({
        connector_id: id!,
        status: 'queued',
        records_processed: 0,
        records_failed: 0,
        error_log: [{ reason: 'retry_requested', message: `Replay of ${failedCount} failed records requested from monitor` }],
      });
      if (error) throw error;
    },
    onSuccess: () => refetch(),
  });

  if (isError) {
    return (
      <Card className="m-1 flex items-center gap-3 p-6 text-sm text-red-700">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span>Couldn&apos;t load this sync. It may have been deleted.</span>
        <Link to="/data/connectors" className="ml-2 underline">
          Back to connectors
        </Link>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      </div>
    );
  }

  const { connector, latestRun, totals, isActive, mode, stage, errorCauses, errorEntries } = data;
  const paused = connector.status.toLowerCase() === 'paused';

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={`/data/connectors/${connector.id}`}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{connector.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <StatusPill status={latestRun?.status ?? connector.status} />
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-500">
                {mode} sync
              </span>
              {isActive && <span className="text-xs text-blue-600">live · refreshing every 5s</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {paused ? (
            <Button size="sm" variant="secondary" onClick={() => setConnectorStatus.mutate('active')}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Resume
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConnectorStatus.mutate('paused')}>
              <Pause className="mr-1.5 h-3.5 w-3.5" />
              Pause
            </Button>
          )}
          {isActive && latestRun && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (confirm('Cancel the running sync? Progress up to the last checkpoint is kept.')) {
                  cancelRun.mutate(latestRun.id);
                }
              }}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Records this run" value={formatNumber(totals.processed)} sub={`${formatNumber(totals.succeeded)} written`} />
        <StatCard
          label="Throughput"
          value={totals.throughputPerMin ? `${formatNumber(totals.throughputPerMin)}/min` : '—'}
          sub={totals.durationSec ? `${fmtDuration(totals.durationSec)} elapsed` : 'in progress'}
        />
        <StatCard
          label="Errors / retries"
          value={`${formatNumber(totals.failed)} / ${formatNumber(totals.retries)}`}
          tone={totals.failed > 0 ? 'fail' : undefined}
        />
        <StatCard
          label="Last checkpoint"
          value={data.checkpoint ? shortCheckpoint(data.checkpoint) : '—'}
          sub={connector.last_sync_at ? `synced ${relTime(connector.last_sync_at)}` : 'never synced'}
          mono
        />
      </div>

      {/* stage strip */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Pipeline stage</h3>
          <span className="text-xs text-slate-400">{connector.connector_type}</span>
        </div>
        <IngestPipelineStrip active={stage} showHints />
      </Card>

      {/* charts */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Throughput / run</p>
          <MiniAreaChart values={data.throughputSeries} labels={data.runLabels} valueFormat={(v) => formatNumber(v)} />
        </Card>
        <Card className="p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Error rate %</p>
          <MiniAreaChart
            values={data.errorRateSeries}
            labels={data.runLabels}
            tone="fail"
            valueFormat={(v) => `${v.toFixed(1)}%`}
          />
        </Card>
        <Card className="p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Run duration (s)</p>
          <MiniAreaChart values={data.durationSeries} labels={data.runLabels} tone="warn" valueFormat={(v) => fmtDuration(v)} />
        </Card>
      </div>

      {/* failed records */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Failed records
            {errorEntries.length > 0 && (
              <span className="ml-2 font-mono text-xs text-red-600">{formatNumber(errorEntries.length)}</span>
            )}
          </h3>
          {errorEntries.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportRowsToCsv('sync-errors', ERROR_COLUMNS, errorEntries)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download error report
              </button>
              <Button
                size="sm"
                onClick={() => {
                  if (!tenantId) return;
                  if (confirm(`Queue a replay of ${totals.failed || errorEntries.length} failed records? The whole sync is not re-run.`)) {
                    queueRetry.mutate(totals.failed || errorEntries.length);
                  }
                }}
                disabled={queueRetry.isPending}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry failed records
              </Button>
            </div>
          )}
        </div>

        {errorEntries.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No failed records in the latest run{latestRun ? ` (${latestRun.status})` : ''}. Errors surface here grouped by cause.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-[220px_1fr]">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">By cause</p>
              <ul className="space-y-1">
                {errorCauses.map((c) => (
                  <li key={c.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-600">{c.label}</span>
                    <span className="font-mono tabular-nums text-slate-400">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="max-h-56 overflow-auto rounded-lg border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Record</th>
                    <th className="px-3 py-1.5 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {errorEntries.slice(0, 200).map((e, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="px-3 py-1.5 font-mono text-slate-500">{e.record ?? '—'}</td>
                      <td className="px-3 py-1.5 text-slate-700">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

const ERROR_COLUMNS: Column<ErrorEntry>[] = [
  { key: 'record', header: 'Record', render: (e) => String(e.record ?? ''), exportValue: (e) => e.record ?? '' },
  { key: 'cause', header: 'Cause', render: (e) => e.cause, exportValue: (e) => e.cause },
  { key: 'message', header: 'Message', render: (e) => e.message, exportValue: (e) => e.message },
];

function StatCard({
  label,
  value,
  sub,
  tone,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'fail';
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          mono ? 'font-mono text-base' : 'font-mono',
          tone === 'fail' ? 'text-red-600' : 'text-slate-900',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function relTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0s';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function shortCheckpoint(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  return v.length > 24 ? `${v.slice(0, 24)}…` : v;
}
