import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toneForStatus, type StatusTone } from '@/components/data/StatusPill';

/* ================================================================
   Job Center — one list where every large operation (connector
   sync run + data-job workflow run) is a tracked, controllable row.
   Merges two source tables into a common JobRow shape.
   ================================================================ */

export type JobSource = 'connector' | 'workflow';

export type JobRow = {
  id: string;
  source: JobSource;
  kind: string; // Import / Export / Sync / ETL / …
  name: string;
  refRoute: string; // where "view" navigates
  status: string;
  tone: StatusTone;
  recordsProcessed: number;
  recordsFailed: number;
  startedAt: string;
  completedAt: string | null;
  durationSec: number | null;
  /** workflow runs only */
  versionNumber?: number | null;
  triggerSource?: string | null;
};

export type JobCenterFilters = {
  status: 'all' | StatusTone;
  source: 'all' | JobSource;
  search: string;
};

export const DEFAULT_JOB_FILTERS: JobCenterFilters = { status: 'all', source: 'all', search: '' };

const PAGE = 50;

function kindForConnector(direction: string | null | undefined): string {
  return (direction ?? 'inbound') === 'outbound' ? 'Export' : 'Sync';
}

function durationSec(started: string, completed: string | null): number | null {
  if (!completed) return null;
  const d = (new Date(completed).getTime() - new Date(started).getTime()) / 1000;
  return d >= 0 && d < 86_400 * 7 ? d : null;
}

async function fetchJobs(
  tenantId: string,
  environment: string,
  filters: JobCenterFilters,
  limit: number,
): Promise<{ rows: JobRow[]; hasMore: boolean }> {
  const wantConnector = filters.source !== 'workflow';
  const wantWorkflow = filters.source !== 'connector';

  const connectorSelect =
    'id, status, records_processed, records_failed, started_at, completed_at,' +
    ' connector:connectors!inner ( id, name, direction, tenant_id, environment )';
  const workflowSelect =
    'id, status, records_processed, records_failed, started_at, completed_at, version_number, trigger_source,' +
    ' job:data_jobs!inner ( id, name, job_type, tenant_id, environment )';

  const [connRes, wfRes] = await Promise.all([
    wantConnector
      ? supabase
          .from('connector_runs')
          .select(connectorSelect)
          .eq('connector.tenant_id', tenantId)
          .eq('connector.environment', environment)
          .order('started_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as unknown[] }),
    wantWorkflow
      ? supabase
          .from('data_job_runs')
          .select(workflowSelect)
          .eq('job.tenant_id', tenantId)
          .eq('job.environment', environment)
          .order('started_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const unwrap = <R,>(v: R | R[] | null | undefined): R | null =>
    Array.isArray(v) ? v[0] ?? null : (v ?? null);

  const connRows: JobRow[] = ((connRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const c = unwrap(r.connector as never) as { id: string; name: string; direction: string } | null;
    return {
      id: r.id as string,
      source: 'connector' as const,
      kind: kindForConnector(c?.direction),
      name: c?.name ?? 'Unknown connector',
      refRoute: c?.id ? `/data/connectors/${c.id}/monitor` : '/data/connectors',
      status: (r.status as string) ?? 'unknown',
      tone: toneForStatus(r.status as string).tone,
      recordsProcessed: Math.max(0, (r.records_processed as number) ?? 0),
      recordsFailed: Math.max(0, (r.records_failed as number) ?? 0),
      startedAt: r.started_at as string,
      completedAt: (r.completed_at as string) ?? null,
      durationSec: durationSec(r.started_at as string, (r.completed_at as string) ?? null),
    };
  });

  const wfRows: JobRow[] = ((wfRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const j = unwrap(r.job as never) as { id: string; name: string; job_type: string } | null;
    return {
      id: r.id as string,
      source: 'workflow' as const,
      kind: j?.job_type ? j.job_type.charAt(0).toUpperCase() + j.job_type.slice(1) : 'Workflow',
      name: j?.name ?? 'Untitled workflow',
      refRoute: `/data/runs/${r.id as string}`,
      status: (r.status as string) ?? 'unknown',
      tone: toneForStatus(r.status as string).tone,
      recordsProcessed: Math.max(0, (r.records_processed as number) ?? 0),
      recordsFailed: Math.max(0, (r.records_failed as number) ?? 0),
      startedAt: r.started_at as string,
      completedAt: (r.completed_at as string) ?? null,
      durationSec: durationSec(r.started_at as string, (r.completed_at as string) ?? null),
      versionNumber: (r.version_number as number | null) ?? null,
      triggerSource: (r.trigger_source as string | null) ?? null,
    };
  });

  const hasMore = connRows.length >= limit || wfRows.length >= limit;

  let merged = [...connRows, ...wfRows].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const q = filters.search.trim().toLowerCase();
  if (q) merged = merged.filter((r) => r.name.toLowerCase().includes(q) || r.kind.toLowerCase().includes(q));
  if (filters.status !== 'all') merged = merged.filter((r) => r.tone === filters.status);

  return { rows: merged.slice(0, limit), hasMore };
}

export function useJobCenter(
  tenantId: string | null | undefined,
  environment: string,
  filters: JobCenterFilters,
  pages: number,
) {
  return useQuery({
    queryKey: ['job-center', tenantId, environment, filters, pages],
    enabled: Boolean(tenantId),
    refetchInterval: 20_000,
    placeholderData: (prev) => prev,
    queryFn: () => fetchJobs(tenantId as string, environment, filters, pages * PAGE),
  });
}

export const JOB_CENTER_PAGE = PAGE;
