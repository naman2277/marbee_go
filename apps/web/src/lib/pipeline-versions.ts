import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { parseWorkflowGraph } from '@/lib/data-jobs';
import type { PipelineVersion } from '@/lib/pipeline-runs';

/* ================================================================
   Phase D — pipeline version diff + restore. A version's snapshot
   is { job, graph }; we diff the graph node/edge structure.
   ================================================================ */

export type PipelineChangeKind =
  | 'node_added'
  | 'node_removed'
  | 'node_retyped'
  | 'node_relabeled'
  | 'node_reconfigured'
  | 'edge_added'
  | 'edge_removed';

export type PipelineDiffEntry = {
  kind: PipelineChangeKind;
  ref: string; // node label or edge "a → b"
  detail?: string;
};

type NodeLite = { id: string; type: string; label: string; config: Record<string, unknown> };

function graphOf(snapshot: Record<string, unknown> | undefined) {
  const g = parseWorkflowGraph((snapshot as { graph?: unknown } | undefined)?.graph);
  const nodes: NodeLite[] = g.nodes.map((n) => ({
    id: n.id,
    type: n.data.stepType,
    label: n.data.label,
    config: (n.data.config ?? {}) as Record<string, unknown>,
  }));
  const edges = g.edges.map((e) => `${e.source}→${e.target}${e.sourceHandle ? `:${e.sourceHandle}` : ''}`);
  return { nodes, edges, byId: new Map(nodes.map((n) => [n.id, n])) };
}

/** Diff FROM older snapshot `a` TO newer `b`. */
export function diffPipelineSnapshots(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): PipelineDiffEntry[] {
  const ga = graphOf(a);
  const gb = graphOf(b);
  const out: PipelineDiffEntry[] = [];

  for (const n of gb.nodes) {
    if (!ga.byId.has(n.id)) out.push({ kind: 'node_added', ref: n.label, detail: n.type });
  }
  for (const n of ga.nodes) {
    if (!gb.byId.has(n.id)) out.push({ kind: 'node_removed', ref: n.label, detail: n.type });
  }
  for (const n of gb.nodes) {
    const prev = ga.byId.get(n.id);
    if (!prev) continue;
    if (prev.type !== n.type) out.push({ kind: 'node_retyped', ref: n.label, detail: `${prev.type} → ${n.type}` });
    if (prev.label !== n.label) out.push({ kind: 'node_relabeled', ref: n.label, detail: `was "${prev.label}"` });
    if (JSON.stringify(prev.config) !== JSON.stringify(n.config))
      out.push({ kind: 'node_reconfigured', ref: n.label, detail: changedKeys(prev.config, n.config) });
  }

  const ae = new Set(ga.edges);
  const be = new Set(gb.edges);
  const labelFor = (edgeKey: string, g: typeof ga) => {
    const [src, rest] = edgeKey.split('→');
    const [tgt] = rest.split(':');
    return `${g.byId.get(src)?.label ?? src} → ${g.byId.get(tgt)?.label ?? tgt}`;
  };
  for (const e of be) if (!ae.has(e)) out.push({ kind: 'edge_added', ref: labelFor(e, gb) });
  for (const e of ae) if (!be.has(e)) out.push({ kind: 'edge_removed', ref: labelFor(e, ga) });

  return out;
}

function changedKeys(a: Record<string, unknown>, b: Record<string, unknown>): string {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed = [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return changed.length ? changed.join(', ') : 'config changed';
}

/** Restore a prior version: overwrite the live graph with its snapshot, then
 *  publish a new version equal to it. History is append-only. */
export function useRestorePipelineVersion(jobId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (version: PipelineVersion): Promise<number> => {
      const graph = (version.snapshot as { graph?: unknown } | undefined)?.graph ?? null;
      if (!graph) throw new Error('That version has no stored graph');

      const { error: upErr } = await supabase
        .from('data_jobs')
        .update({ workflow_json: graph, updated_at: new Date().toISOString() })
        .eq('id', jobId as string);
      if (upErr) throw upErr;

      const { data, error } = await supabase.rpc('publish_data_job_version', {
        p_job_id: jobId,
        p_change_notes: `Restored from v${version.version_number}`,
      });
      if (error) throw error;
      const newVersion = (data as { version?: number } | null)?.version ?? 0;

      const { data: job } = await supabase
        .from('data_jobs')
        .select('tenant_id, environment, name')
        .eq('id', jobId as string)
        .maybeSingle();
      if (job) {
        void logAudit({
          tenantId: job.tenant_id,
          environment: job.environment,
          action: 'update',
          resourceType: 'data_job',
          resourceId: jobId as string,
          resourceName: job.name,
          summary: `Restored pipeline to v${version.version_number} (published as v${newVersion})`,
          metadata: { restored_from: version.version_number, new_version: newVersion },
        });
      }
      return newVersion;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-versions', jobId] });
      qc.invalidateQueries({ queryKey: ['data-job', jobId] });
    },
  });
}
