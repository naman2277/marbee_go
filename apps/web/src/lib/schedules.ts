import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cronNext } from '@/lib/cron';

/* ================================================================
   Phase F — pipeline scheduling. next_run_at is computed here from
   the cron expression (Postgres has no cron parser) and persisted;
   the 61_*.sql cron enqueues runs where next_run_at has passed.
   ================================================================ */

export type ScheduleRow = {
  id: string;
  name: string;
  schedule_cron: string;
  schedule_enabled: boolean;
  schedule_tz: string;
  next_run_at: string | null;
  last_run_at: string | null;
  current_version: number;
  status: string;
  lastRunStatus: string | null;
};

async function fetchSchedules(tenantId: string, environment: string): Promise<ScheduleRow[]> {
  const { data: jobs } = await supabase
    .from('data_jobs')
    .select('id, name, schedule_cron, schedule_enabled, schedule_tz, next_run_at, last_run_at, current_version, status')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .not('schedule_cron', 'is', null)
    .order('name');

  const rows = (jobs ?? []) as Omit<ScheduleRow, 'lastRunStatus'>[];
  if (!rows.length) return [];

  const { data: runs } = await supabase
    .from('data_job_runs')
    .select('job_id, status, started_at')
    .in('job_id', rows.map((r) => r.id))
    .order('started_at', { ascending: false });

  const lastByJob = new Map<string, string>();
  for (const r of runs ?? []) if (!lastByJob.has(r.job_id as string)) lastByJob.set(r.job_id as string, r.status as string);

  // Backfill any missing next_run_at from the cron expression.
  const fixes: { id: string; next: string }[] = [];
  const now = new Date();
  const result: ScheduleRow[] = rows.map((r) => {
    let next = r.next_run_at;
    if (!next && r.schedule_cron && r.schedule_enabled) {
      const n = cronNext(r.schedule_cron, now);
      if (n) {
        next = n.toISOString();
        fixes.push({ id: r.id, next });
      }
    }
    return { ...r, next_run_at: next, lastRunStatus: lastByJob.get(r.id) ?? null };
  });

  if (fixes.length) {
    await Promise.all(
      fixes.map((f) => supabase.from('data_jobs').update({ next_run_at: f.next }).eq('id', f.id)),
    );
  }
  return result;
}

export function usePipelineSchedules(tenantId: string | null | undefined, environment: string) {
  return useQuery({
    queryKey: ['pipeline-schedules', tenantId, environment],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: () => fetchSchedules(tenantId as string, environment),
  });
}

export function useToggleSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled, cron }: { id: string; enabled: boolean; cron: string }) => {
      const next = enabled ? cronNext(cron, new Date())?.toISOString() ?? null : null;
      const { error } = await supabase
        .from('data_jobs')
        .update({ schedule_enabled: enabled, next_run_at: next })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline-schedules'] }),
  });
}

/** Queue one 'backfill' run per day in [start, end]. The cron sweep picks them up. */
export function useBackfillPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      jobId: string;
      tenantId: string;
      environment: string;
      currentVersion: number;
      start: string; // yyyy-mm-dd
      end: string;
    }) => {
      const days: string[] = [];
      const d = new Date(input.start);
      const end = new Date(input.end);
      while (d <= end && days.length < 90) {
        days.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
      }
      if (!days.length) throw new Error('Empty date range');

      let versionId: string | null = null;
      if (input.currentVersion > 0) {
        const { data } = await supabase
          .from('data_job_versions')
          .select('id')
          .eq('job_id', input.jobId)
          .eq('version_number', input.currentVersion)
          .maybeSingle();
        versionId = data?.id ?? null;
      }

      const rows = days.map((day) => ({
        job_id: input.jobId,
        tenant_id: input.tenantId,
        environment: input.environment,
        version_id: versionId,
        version_number: input.currentVersion || null,
        status: 'queued',
        trigger_source: 'backfill',
        run_mode: 'full',
        stats: { backfill_date: day },
      }));
      const { error } = await supabase.from('data_job_runs').insert(rows);
      if (error) throw error;
      return days.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-schedules'] });
      qc.invalidateQueries({ queryKey: ['job-center'] });
    },
  });
}
