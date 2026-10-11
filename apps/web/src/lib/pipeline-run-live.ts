import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PipelineNodeRun, PipelineRun, PipelineRunLog } from '@/lib/pipeline-runs';

/* ================================================================
   Phase C — one run, live or replayed. Fetches run + node runs +
   logs, and while the run is active subscribes to Realtime on the
   three tables (60_pipeline_execution_model.sql adds them to the
   supabase_realtime publication) with a short polling fallback.
   ================================================================ */

const ACTIVE = new Set(['queued', 'running']);

export type PipelineRunLive = {
  run: PipelineRun | null;
  nodeRuns: PipelineNodeRun[];
  nodeByNodeId: Map<string, PipelineNodeRun>;
  logs: PipelineRunLog[];
  isActive: boolean;
};

async function fetchRunLive(runId: string): Promise<PipelineRunLive> {
  const [{ data: run }, { data: nodeRuns }, { data: logs }] = await Promise.all([
    supabase.from('data_job_runs').select('*').eq('id', runId).maybeSingle(),
    supabase.from('data_job_node_runs').select('*').eq('run_id', runId),
    supabase
      .from('data_job_run_logs')
      .select('*')
      .eq('run_id', runId)
      .order('logged_at', { ascending: true })
      .limit(2000),
  ]);

  const nr = (nodeRuns ?? []) as PipelineNodeRun[];
  return {
    run: (run ?? null) as PipelineRun | null,
    nodeRuns: nr,
    nodeByNodeId: new Map(nr.map((n) => [n.node_id, n])),
    logs: (logs ?? []) as PipelineRunLog[],
    isActive: run ? ACTIVE.has(String(run.status)) : false,
  };
}

export function usePipelineRunLive(runId: string | undefined) {
  const qc = useQueryClient();
  const [liveTick, setLiveTick] = useState(0);

  const query = useQuery({
    queryKey: ['pipeline-run-live', runId, liveTick],
    enabled: Boolean(runId),
    queryFn: () => fetchRunLive(runId as string),
    // Poll while the run is active; stop once it reaches a terminal state.
    refetchInterval: (q) => (q.state.data?.isActive ? 3_000 : false),
  });

  useEffect(() => {
    if (!runId) return;
    const bump = () => {
      setLiveTick((t) => t + 1);
      qc.invalidateQueries({ queryKey: ['pipeline-run-live', runId] });
    };
    const channel = supabase
      .channel(`pipeline-run-${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'data_job_runs', filter: `id=eq.${runId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'data_job_node_runs', filter: `run_id=eq.${runId}` }, bump)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'data_job_run_logs', filter: `run_id=eq.${runId}` }, bump)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, qc]);

  return query;
}
