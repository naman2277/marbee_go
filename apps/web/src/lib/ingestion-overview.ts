import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { StatusTone } from '@/components/data/StatusPill';
import { toneForStatus } from '@/components/data/StatusPill';

/* ------------------------------------------------------------------ */
/*  Row shapes (subset of columns we read)                            */
/* ------------------------------------------------------------------ */

export type OverviewConnector = {
  id: string;
  name: string;
  connector_type: string;
  direction: 'inbound' | 'outbound' | string;
  status: string;
  last_sync_at: string | null;
};

export type OverviewRun = {
  id: string;
  status: string;
  records_processed: number | null;
  records_failed: number | null;
  error_log: unknown;
  started_at: string;
  completed_at: string | null;
  connector: {
    id: string;
    name: string;
    connector_type: string;
    direction: string;
  } | null;
};

export type RangeKey = 'live' | '24h' | '7d' | '30d';

export const RANGE_OPTIONS: { key: RangeKey; label: string; hours: number }[] = [
  { key: 'live', label: 'Live', hours: 1 },
  { key: '24h', label: '24h', hours: 24 },
  { key: '7d', label: '7d', hours: 24 * 7 },
  { key: '30d', label: '30d', hours: 24 * 30 },
];

/* ------------------------------------------------------------------ */
/*  Derived shape                                                     */
/* ------------------------------------------------------------------ */

export type HealthBucket = { key: string; label: string; tone: StatusTone; count: number };

export type OverviewData = {
  runs: OverviewRun[];
  connectors: OverviewConnector[];

  recordsToday: number;
  recordsMonth: number;
  recordsPerMin: number;
  recordsIngested: number;
  recordsExported: number;
  recordsSucceeded: number;
  recordsFailed: number;
  volumeSpark: number[];

  connectorHealth: HealthBucket[];
  totalConnectors: number;

  activeRuns: number;
  completedRuns: number;
  failedRuns: number;
  queuedPipelines: number;
  avgRunSeconds: number | null;

  quality: {
    validRecords: number;
    invalidRecords: number;
    runsWithErrors: number;
    causes: { label: string; count: number }[];
  };
};

/* ------------------------------------------------------------------ */
/*  Fetch + aggregate                                                 */
/* ------------------------------------------------------------------ */

const RUN_SELECT =
  'id, status, records_processed, records_failed, error_log, started_at, completed_at,' +
  ' connector:connectors!inner ( id, name, connector_type, direction, tenant_id, environment )';

async function fetchOverview(
  tenantId: string,
  environment: string,
  rangeHours: number,
): Promise<OverviewData> {
  const rangeStart = new Date(Date.now() - rangeHours * 3600_000).toISOString();

  const [{ data: connectorsRaw }, { data: runsRaw }, { data: jobsRaw }] = await Promise.all([
    supabase
      .from('connectors')
      .select('id, name, connector_type, direction, status, last_sync_at')
      .eq('tenant_id', tenantId)
      .eq('environment', environment),
    supabase
      .from('connector_runs')
      .select(RUN_SELECT)
      .eq('connector.tenant_id', tenantId)
      .eq('connector.environment', environment)
      .gte('started_at', rangeStart)
      .order('started_at', { ascending: false })
      .limit(500),
    supabase
      .from('data_jobs')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('environment', environment),
  ]);

  const connectors = (connectorsRaw ?? []) as OverviewConnector[];
  const runs = ((runsRaw ?? []) as unknown as OverviewRun[]).map((r) => ({
    ...r,
    connector: Array.isArray(r.connector) ? r.connector[0] ?? null : r.connector,
  }));
  const jobs = (jobsRaw ?? []) as { id: string; status: string }[];

  return aggregate(connectors, runs, jobs, rangeHours);
}

function aggregate(
  connectors: OverviewConnector[],
  runs: OverviewRun[],
  jobs: { id: string; status: string }[],
  rangeHours: number,
): OverviewData {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const proc = (r: OverviewRun) => Math.max(0, r.records_processed ?? 0);
  const failed = (r: OverviewRun) => Math.max(0, r.records_failed ?? 0);
  const ts = (r: OverviewRun) => new Date(r.started_at).getTime();

  let recordsToday = 0;
  let recordsMonth = 0;
  let recordsPerMinRaw = 0;
  let recordsIngested = 0;
  let recordsExported = 0;
  let recordsSucceeded = 0;
  let recordsFailed = 0;

  for (const r of runs) {
    const t = ts(r);
    const p = proc(r);
    const f = failed(r);
    if (t >= startOfToday.getTime()) recordsToday += p;
    if (t >= startOfMonth.getTime()) recordsMonth += p;
    if (t >= now - 3600_000) recordsPerMinRaw += p;
    if ((r.connector?.direction ?? 'inbound') === 'outbound') recordsExported += p;
    else recordsIngested += p;
    recordsSucceeded += Math.max(0, p - f);
    recordsFailed += f;
  }

  // Volume sparkline: 12 evenly-spaced buckets across the selected range.
  const buckets = 12;
  const bucketMs = (rangeHours * 3600_000) / buckets;
  const volumeSpark = new Array(buckets).fill(0);
  for (const r of runs) {
    const age = now - ts(r);
    if (age < 0 || age > rangeHours * 3600_000) continue;
    const idx = Math.min(buckets - 1, Math.floor((rangeHours * 3600_000 - age) / bucketMs));
    volumeSpark[idx] += proc(r);
  }

  // Connector health buckets.
  const runningConnectorIds = new Set(
    runs.filter((r) => toneForStatus(r.status).tone === 'run').map((r) => r.connector?.id).filter(Boolean) as string[],
  );
  const health: Record<string, HealthBucket> = {
    connected: { key: 'connected', label: 'Connected', tone: 'ok', count: 0 },
    syncing: { key: 'syncing', label: 'Syncing', tone: 'run', count: 0 },
    delayed: { key: 'delayed', label: 'Delayed', tone: 'warn', count: 0 },
    failed: { key: 'failed', label: 'Failed', tone: 'fail', count: 0 },
    idle: { key: 'idle', label: 'Idle', tone: 'idle', count: 0 },
  };
  for (const c of connectors) {
    const tone = toneForStatus(c.status).tone;
    if (tone === 'fail') health.failed.count++;
    else if (runningConnectorIds.has(c.id)) health.syncing.count++;
    else if (tone === 'idle' && !c.last_sync_at) health.idle.count++;
    else if (c.last_sync_at && (now - new Date(c.last_sync_at).getTime()) / 3600_000 > 48) health.delayed.count++;
    else if (!c.last_sync_at) health.idle.count++;
    else health.connected.count++;
  }

  // Sync / run health.
  const activeRuns = runs.filter((r) => toneForStatus(r.status).tone === 'run').length;
  const failedRuns = runs.filter((r) => toneForStatus(r.status).tone === 'fail').length;
  const completedRuns = runs.filter((r) => toneForStatus(r.status).tone === 'ok').length;
  const queuedPipelines = jobs.filter((j) => ['queued', 'pending', 'scheduled'].includes((j.status ?? '').toLowerCase())).length;

  const durations = runs
    .filter((r) => r.completed_at)
    .map((r) => (new Date(r.completed_at as string).getTime() - ts(r)) / 1000)
    .filter((d) => d > 0 && d < 86_400);
  const avgRunSeconds = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  // Data quality causes — best-effort parse of error_log entries.
  const causeCounts = new Map<string, number>();
  let runsWithErrors = 0;
  for (const r of runs) {
    if (failed(r) > 0 || toneForStatus(r.status).tone === 'fail') runsWithErrors++;
    const log = r.error_log;
    if (!Array.isArray(log)) continue;
    for (const entry of log) {
      const label = errorLabel(entry);
      if (!label) continue;
      causeCounts.set(label, (causeCounts.get(label) ?? 0) + 1);
    }
  }
  const causes = [...causeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    runs,
    connectors,
    recordsToday,
    recordsMonth,
    recordsPerMin: Math.round(recordsPerMinRaw / 60),
    recordsIngested,
    recordsExported,
    recordsSucceeded,
    recordsFailed,
    volumeSpark,
    connectorHealth: Object.values(health),
    totalConnectors: connectors.length,
    activeRuns,
    completedRuns,
    failedRuns,
    queuedPipelines,
    avgRunSeconds,
    quality: {
      validRecords: recordsSucceeded,
      invalidRecords: recordsFailed,
      runsWithErrors,
      causes,
    },
  };
}

function errorLabel(entry: unknown): string | null {
  if (typeof entry === 'string') return truncate(entry);
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    const raw = o.reason ?? o.code ?? o.type ?? o.error ?? o.message ?? o.rule;
    if (typeof raw === 'string' && raw.trim()) return truncate(raw);
  }
  return null;
}

function truncate(s: string, n = 48) {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useIngestionOverview(
  tenantId: string | null | undefined,
  environment: string,
  rangeHours: number,
) {
  return useQuery({
    queryKey: ['ingestion-overview', tenantId, environment, rangeHours],
    enabled: Boolean(tenantId),
    refetchInterval: 30_000,
    queryFn: () => fetchOverview(tenantId as string, environment, rangeHours),
  });
}
