import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toneForStatus } from '@/components/data/StatusPill';
import { groupErrorCauses, parseErrorLog, type ErrorCause, type ErrorEntry } from '@/lib/error-log';
import type { PipelineStageKey } from '@/components/data/IngestPipelineStrip';

export type MonitorRun = {
  id: string;
  status: string;
  records_processed: number | null;
  records_failed: number | null;
  error_log: unknown;
  started_at: string;
  completed_at: string | null;
};

export type MonitorConnector = {
  id: string;
  name: string;
  connector_type: string;
  direction: string;
  status: string;
  last_sync_at: string | null;
  schedule_cron: string | null;
  config: Record<string, unknown> | null;
};

export type SyncMonitorData = {
  connector: MonitorConnector;
  runs: MonitorRun[];
  latestRun: MonitorRun | null;
  isActive: boolean;
  mode: 'Incremental' | 'Full';
  stage: PipelineStageKey;
  throughputSeries: number[];
  errorRateSeries: number[];
  durationSeries: number[];
  runLabels: string[];
  totals: {
    processed: number;
    failed: number;
    succeeded: number;
    retries: number;
    throughputPerMin: number;
    durationSec: number | null;
  };
  checkpoint: string | null;
  errorEntries: ErrorEntry[];
  errorCauses: ErrorCause[];
};

const ACTIVE = new Set(['running', 'processing', 'syncing', 'in_progress', 'started', 'queued', 'pending']);

function stageFor(status: string, hasErrors: boolean): PipelineStageKey {
  const s = status.toLowerCase();
  if (['queued', 'pending'].includes(s)) return 'source';
  if (['running', 'processing', 'syncing', 'in_progress', 'started'].includes(s)) return hasErrors ? 'transform' : 'destination';
  return 'outcome';
}

async function fetchMonitor(connectorId: string): Promise<SyncMonitorData> {
  const [{ data: connector, error: cErr }, { data: runsRaw }] = await Promise.all([
    supabase
      .from('connectors')
      .select('id, name, connector_type, direction, status, last_sync_at, schedule_cron, config')
      .eq('id', connectorId)
      .maybeSingle(),
    supabase
      .from('connector_runs')
      .select('id, status, records_processed, records_failed, error_log, started_at, completed_at')
      .eq('connector_id', connectorId)
      .order('started_at', { ascending: false })
      .limit(30),
  ]);

  if (cErr) throw cErr;
  if (!connector) throw new Error('Connector not found');

  const runs = (runsRaw ?? []) as MonitorRun[];
  const latestRun = runs[0] ?? null;
  const chrono = [...runs].reverse();

  const proc = (r: MonitorRun) => Math.max(0, r.records_processed ?? 0);
  const fail = (r: MonitorRun) => Math.max(0, r.records_failed ?? 0);
  const dur = (r: MonitorRun) =>
    r.completed_at ? Math.max(0, (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000) : 0;

  const isActive = latestRun ? ACTIVE.has(latestRun.status.toLowerCase()) : false;
  const errorEntries = parseErrorLog(latestRun?.error_log);
  const hasErrors = errorEntries.length > 0 || (latestRun ? fail(latestRun) > 0 : false);

  const cfg = connector.config ?? {};
  const cursorField = (cfg.cursor ?? cfg.cursor_value ?? cfg.checkpoint ?? cfg.since) as string | undefined;
  const mode: 'Incremental' | 'Full' =
    cursorField || cfg.sync_mode === 'incremental' || cfg.incremental === true ? 'Incremental' : 'Full';

  const latestDur = latestRun ? dur(latestRun) : 0;

  return {
    connector: connector as MonitorConnector,
    runs,
    latestRun,
    isActive,
    mode,
    stage: latestRun ? stageFor(latestRun.status, hasErrors) : 'source',
    throughputSeries: chrono.map(proc),
    errorRateSeries: chrono.map((r) => (proc(r) > 0 ? (fail(r) / proc(r)) * 100 : 0)),
    durationSeries: chrono.map(dur),
    runLabels: chrono.map((r) => new Date(r.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
    totals: {
      processed: latestRun ? proc(latestRun) : 0,
      failed: latestRun ? fail(latestRun) : 0,
      succeeded: latestRun ? Math.max(0, proc(latestRun) - fail(latestRun)) : 0,
      retries: (latestRun?.error_log && Array.isArray(latestRun.error_log) ? latestRun.error_log.length : 0),
      throughputPerMin: latestDur > 0 && latestRun ? Math.round((proc(latestRun) / latestDur) * 60) : 0,
      durationSec: latestRun && latestRun.completed_at ? latestDur : null,
    },
    checkpoint: (typeof cursorField === 'string' ? cursorField : null) ?? connector.last_sync_at,
    errorEntries,
    errorCauses: groupErrorCauses(errorEntries),
  };
}

export function useSyncMonitor(connectorId: string | undefined) {
  return useQuery({
    queryKey: ['sync-monitor', connectorId],
    enabled: Boolean(connectorId),
    refetchInterval: (q) => (q.state.data?.isActive ? 5_000 : 20_000),
    queryFn: () => fetchMonitor(connectorId as string),
  });
}

export { toneForStatus };
