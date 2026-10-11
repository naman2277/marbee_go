import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/* ================================================================
   Pipeline execution model (Phase A) — client types + hooks for the
   60_pipeline_execution_model.sql tables. Definition (data_jobs +
   data_job_versions) is kept separate from run (data_job_runs +
   node_runs + logs + artifacts).
   ================================================================ */

export type PipelineRunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'canceled';
export type PipelineTriggerSource = 'manual' | 'schedule' | 'webhook' | 'api' | 'backfill';
export type PipelineRunMode = 'full' | 'dry_run' | 'preview' | 'resume' | 'partial';

export type PipelineVersion = {
  id: string;
  job_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_notes: string | null;
  published_at: string;
};

export type PipelineRun = {
  id: string;
  job_id: string;
  tenant_id: string | null;
  environment: string;
  version_id: string | null;
  version_number: number | null;
  status: string;
  trigger_source: string;
  run_mode: string;
  records_processed: number | null;
  records_failed: number | null;
  error_log: unknown;
  plan: unknown;
  stats: Record<string, unknown> | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
};

export type PipelineNodeRun = {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  node_label: string | null;
  state: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'canceled' | 'retrying';
  attempt: number;
  records_in: number;
  records_out: number;
  records_failed: number;
  error: unknown;
  started_at: string | null;
  completed_at: string | null;
};

export type PipelineRunLog = {
  id: number;
  run_id: string;
  node_id: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context: unknown;
  logged_at: string;
};

/* ---------------- versions ---------------- */

export function usePipelineVersions(jobId: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-versions', jobId],
    enabled: Boolean(jobId),
    queryFn: async (): Promise<PipelineVersion[]> => {
      const { data, error } = await supabase
        .from('data_job_versions')
        .select('*')
        .eq('job_id', jobId as string)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PipelineVersion[];
    },
  });
}

export function usePublishPipelineVersion(jobId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changeNotes?: string): Promise<number> => {
      const { data, error } = await supabase.rpc('publish_data_job_version', {
        p_job_id: jobId,
        p_change_notes: changeNotes ?? null,
      });
      if (error) throw error;
      const version = (data as { version?: number } | null)?.version ?? 0;

      const { data: job } = await supabase
        .from('data_jobs')
        .select('tenant_id, environment, name')
        .eq('id', jobId as string)
        .maybeSingle();
      if (job) {
        void logAudit({
          tenantId: job.tenant_id,
          environment: job.environment,
          action: 'publish',
          resourceType: 'data_job',
          resourceId: jobId as string,
          resourceName: job.name,
          summary: `Published pipeline v${version}`,
          metadata: { version, change_notes: changeNotes },
        });
      }
      return version;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-versions', jobId] });
      qc.invalidateQueries({ queryKey: ['data-job', jobId] });
    },
  });
}

/* ---------------- runs ---------------- */

export type StartRunInput = {
  jobId: string;
  tenantId: string;
  environment: string;
  currentVersion: number;
  mode?: PipelineRunMode;
  triggerSource?: PipelineTriggerSource;
  /** run-until-node: stop after this graph node */
  untilNodeId?: string | null;
};

/**
 * Queue a real run. If the pipeline has never been published, publish v1 first
 * so the run is pinned to an immutable graph. The Phase-B worker picks up rows
 * with status 'queued'.
 */
export function useStartPipelineRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartRunInput): Promise<PipelineRun> => {
      let versionNumber = input.currentVersion;

      if (versionNumber < 1) {
        const { data, error } = await supabase.rpc('publish_data_job_version', {
          p_job_id: input.jobId,
          p_change_notes: 'Auto-published on first run',
        });
        if (error) throw error;
        versionNumber = (data as { version?: number } | null)?.version ?? 1;
      }

      const { data: version } = await supabase
        .from('data_job_versions')
        .select('id')
        .eq('job_id', input.jobId)
        .eq('version_number', versionNumber)
        .maybeSingle();

      const { data: run, error: runErr } = await supabase
        .from('data_job_runs')
        .insert({
          job_id: input.jobId,
          tenant_id: input.tenantId,
          environment: input.environment,
          version_id: version?.id ?? null,
          version_number: versionNumber,
          status: 'queued',
          trigger_source: input.triggerSource ?? 'manual',
          run_mode: input.mode ?? 'full',
          until_node_id: input.untilNodeId ?? null,
          records_processed: 0,
          records_failed: 0,
        })
        .select('*')
        .single();
      if (runErr) throw runErr;

      // Kick the worker immediately; a cron fallback sweeps anything left queued.
      void supabase.functions
        .invoke('pipeline-run-worker', { body: { run_id: (run as PipelineRun).id } })
        .catch(() => {});

      return run as PipelineRun;
    },
    onSuccess: (_run, input) => {
      qc.invalidateQueries({ queryKey: ['data-job-runs', input.jobId] });
      qc.invalidateQueries({ queryKey: ['job-center'] });
    },
  });
}

export function usePipelineRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-run', runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const [{ data: run }, { data: nodeRuns }, { data: logs }] = await Promise.all([
        supabase.from('data_job_runs').select('*').eq('id', runId as string).maybeSingle(),
        supabase.from('data_job_node_runs').select('*').eq('run_id', runId as string),
        supabase
          .from('data_job_run_logs')
          .select('*')
          .eq('run_id', runId as string)
          .order('logged_at', { ascending: true })
          .limit(1000),
      ]);
      return {
        run: (run ?? null) as PipelineRun | null,
        nodeRuns: (nodeRuns ?? []) as PipelineNodeRun[],
        logs: (logs ?? []) as PipelineRunLog[],
      };
    },
  });
}

/** Request cooperative cancellation; the worker observes this between nodes. */
export function useCancelPipelineRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string): Promise<void> => {
      const { error } = await supabase
        .from('data_job_runs')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('id', runId)
        .in('status', ['queued', 'running']);
      if (error) throw error;
    },
    onSuccess: (_data, runId) => {
      qc.invalidateQueries({ queryKey: ['pipeline-run', runId] });
      qc.invalidateQueries({ queryKey: ['job-center'] });
    },
  });
}
