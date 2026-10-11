import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Download, Radio } from 'lucide-react';
import { Card } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { cn, formatNumber } from '@/lib/utils';
import { parseWorkflowGraph } from '@/lib/data-jobs';
import { StatusPill } from '@/components/data/StatusPill';
import { RunCanvas, type RunNodeOverlay } from '@/components/data/RunCanvas';
import { RunLogViewer } from '@/components/data/RunLogViewer';
import { DataTable, type Column } from '@/components/data/DataTable';
import { usePipelineRunLive } from '@/lib/pipeline-run-live';

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { data, isLoading, isError } = usePipelineRunLive(runId);
  const run = data?.run ?? null;
  const [focusNode, setFocusNode] = useState<string | null>(null);

  const ctx = useQuery({
    queryKey: ['run-detail-ctx', runId, run?.job_id, run?.version_id],
    enabled: Boolean(run),
    queryFn: async () => {
      const [{ data: job }, versionRes] = await Promise.all([
        supabase.from('data_jobs').select('id, name, workflow_json').eq('id', run!.job_id).maybeSingle(),
        run!.version_id
          ? supabase.from('data_job_versions').select('snapshot').eq('id', run!.version_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const snapshotGraph = (versionRes.data?.snapshot as { graph?: unknown } | undefined)?.graph;
      return {
        jobName: job?.name ?? 'Pipeline',
        graph: snapshotGraph ?? job?.workflow_json ?? null,
      };
    },
  });

  const artifacts = useQuery({
    queryKey: ['run-artifacts', runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('data_job_run_artifacts')
        .select('*')
        .eq('run_id', runId as string)
        .order('created_at', { ascending: true });
      return rows ?? [];
    },
  });

  const overlay = useMemo(() => {
    const m = new Map<string, RunNodeOverlay>();
    for (const n of data?.nodeRuns ?? []) {
      m.set(n.node_id, {
        state: n.state,
        in: Number(n.records_in ?? 0),
        out: Number(n.records_out ?? 0),
        failed: Number(n.records_failed ?? 0),
      });
    }
    return m;
  }, [data?.nodeRuns]);

  const nodeLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of parseWorkflowGraph(ctx.data?.graph).nodes) m.set(n.id, n.data.label);
    for (const n of data?.nodeRuns ?? []) if (n.node_label) m.set(n.node_id, n.node_label);
    return m;
  }, [ctx.data?.graph, data?.nodeRuns]);

  if (isError) {
    return (
      <Card className="m-1 flex items-center gap-3 p-6 text-sm text-red-700">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span>Couldn&apos;t load this run.</span>
        <Link to="/data/runs" className="underline">
          Back to Job Center
        </Link>
      </Card>
    );
  }

  if (isLoading || !run) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded bg-slate-100" />
        <div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      </div>
    );
  }

  const errorEntries = Array.isArray(run.error_log) ? (run.error_log as Array<Record<string, unknown>>) : [];
  const stats = (run.stats ?? {}) as { duration_ms?: number; nodes?: number };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/data/runs" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{ctx.data?.jobName ?? 'Pipeline run'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <StatusPill status={run.status} />
              {run.version_number != null && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  v{run.version_number}
                </span>
              )}
              {run.trigger_source && run.trigger_source !== 'manual' && (
                <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] uppercase">{run.trigger_source}</span>
              )}
              {run.run_mode && run.run_mode !== 'full' && (
                <span className="rounded bg-amber-50 px-1 py-0.5 font-mono text-[10px] uppercase text-amber-700">
                  {run.run_mode}
                </span>
              )}
              <span>·</span>
              <span className="tabular-nums">
                {formatNumber(run.records_processed ?? 0)} written
                {(run.records_failed ?? 0) > 0 && (
                  <span className="text-red-600"> · {formatNumber(run.records_failed ?? 0)} failed</span>
                )}
              </span>
              {stats.duration_ms != null && <span>· {fmtMs(stats.duration_ms)}</span>}
            </div>
          </div>
        </div>
        {data?.isActive && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
            <Radio className="h-3.5 w-3.5" />
            Live · refreshing
          </span>
        )}
      </div>

      {ctx.data?.graph ? (
        <RunCanvas
          workflowJson={ctx.data.graph}
          overlay={overlay}
          selectedNodeId={focusNode}
          onSelectNode={setFocusNode}
        />
      ) : (
        <Card className="p-6 text-sm text-slate-500">This run has no stored graph snapshot.</Card>
      )}

      {/* node summary */}
      {(data?.nodeRuns.length ?? 0) > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-900">Nodes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Node</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 text-right font-medium">In → Out</th>
                  <th className="px-4 py-2 text-right font-medium">Failed</th>
                  <th className="px-4 py-2 text-right font-medium">Attempt</th>
                </tr>
              </thead>
              <tbody>
                {[...(data?.nodeRuns ?? [])]
                  .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''))
                  .map((n) => (
                    <tr
                      key={n.id}
                      onClick={() => setFocusNode(n.node_id)}
                      className={cn('cursor-pointer border-t border-slate-50 hover:bg-slate-50', focusNode === n.node_id && 'bg-brand-50')}
                    >
                      <td className="px-4 py-2 font-medium text-slate-800">{n.node_label ?? n.node_id}</td>
                      <td className="px-4 py-2"><StatusPill status={n.state} /></td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-slate-600">
                        {formatNumber(n.records_in)} → {formatNumber(n.records_out)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">
                        {n.records_failed > 0 ? <span className="text-red-600">{formatNumber(n.records_failed)}</span> : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-slate-500">{n.attempt}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* preview sample (D8) */}
      {artifacts.data
        ?.filter((a) => String(a.kind) === 'preview')
        .map((a) => <PreviewArtifact key={a.id as string} artifact={a} />)}

      {/* artifacts */}
      {(artifacts.data?.filter((a) => String(a.kind) !== 'preview').length ?? 0) > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Artifacts</h3>
          <ul className="space-y-1.5">
            {artifacts.data!.filter((a) => String(a.kind) !== 'preview').map((a) => (
              <li key={a.id as string} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="truncate">
                  <span className="font-mono text-xs uppercase text-slate-400">{String(a.kind)}</span>{' '}
                  <span className="text-slate-700">{String(a.storage_path).split('/').pop()}</span>
                  <span className="ml-2 font-mono text-[11px] text-slate-400">
                    {formatNumber(Number(a.row_count ?? 0))} rows
                  </span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const { data: signed } = await supabase.storage
                      .from(String(a.storage_bucket ?? 'data-artifacts'))
                      .createSignedUrl(String(a.storage_path), 600);
                    if (signed?.signedUrl) window.open(signed.signedUrl, '_blank', 'noopener');
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* logs */}
      <RunLogViewer
        logs={data?.logs ?? []}
        nodeLabels={nodeLabels}
        onFocusNode={setFocusNode}
        activeNodeId={focusNode}
      />

      {/* validation / run-level errors when there are no structured logs */}
      {(data?.logs.length ?? 0) === 0 && errorEntries.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-red-700">Errors</h3>
          <ul className="space-y-1 font-mono text-xs text-slate-700">
            {errorEntries.map((e, i) => (
              <li key={i}>{String(e.message ?? e.reason ?? JSON.stringify(e))}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

type ProfileCol = { column: string; type: string; nullPct: number; distinct: number; samples: string[] };

function PreviewArtifact({ artifact }: { artifact: Record<string, unknown> }) {
  const path = String(artifact.storage_path);
  const bucket = String(artifact.storage_bucket ?? 'data-artifacts');
  const { profile, nodeLabel } = useMemo(() => {
    const meta = (artifact.meta ?? null) as { profile?: ProfileCol[]; node_label?: string } | null;
    return { profile: (meta?.profile ?? []) as ProfileCol[], nodeLabel: meta?.node_label ?? null };
  }, [artifact.meta]);

  const rows = useQuery({
    queryKey: ['preview-artifact', path],
    queryFn: async (): Promise<Record<string, unknown>[]> => {
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
      if (!signed?.signedUrl) return [];
      const res = await fetch(signed.signedUrl);
      return res.ok ? ((await res.json()) as Record<string, unknown>[]) : [];
    },
  });

  const columns = useMemo<Column<Record<string, unknown>>[]>(() => {
    const keys = profile.length ? profile.map((p) => p.column) : Object.keys(rows.data?.[0] ?? {});
    return keys.map((k) => ({
      key: k,
      header: k,
      width: 150,
      render: (r) => {
        const v = r[k];
        return v === null || v === undefined ? <span className="text-slate-300">null</span> : String(v);
      },
      exportValue: (r) => (r[k] === null || r[k] === undefined ? '' : String(r[k])),
    }));
  }, [profile, rows.data]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Data preview</h3>
        {nodeLabel && <span className="font-mono text-xs text-slate-400">after "{nodeLabel}"</span>}
        <span className="ml-auto font-mono text-xs text-slate-400">
          {formatNumber(Number(artifact.row_count ?? 0))} sample rows
        </span>
      </div>

      {profile.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="text-xs">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="pr-4 font-medium">Column</th>
                <th className="pr-4 font-medium">Type</th>
                <th className="pr-4 font-medium">Null %</th>
                <th className="pr-4 font-medium">Distinct</th>
                <th className="font-medium">Samples</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {profile.map((p) => (
                <tr key={p.column} className="border-t border-slate-50">
                  <td className="py-1 pr-4 text-slate-700">{p.column}</td>
                  <td className="py-1 pr-4 text-slate-500">{p.type}</td>
                  <td className={cn('py-1 pr-4 tabular-nums', p.nullPct > 0 ? 'text-amber-600' : 'text-slate-400')}>
                    {p.nullPct}%
                  </td>
                  <td className="py-1 pr-4 tabular-nums text-slate-500">{p.distinct}</td>
                  <td className="py-1 text-slate-400">{p.samples.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.isLoading ? (
        <p className="text-sm text-slate-400">Loading sample…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={(rows.data ?? []).map((r, i) => ({ ...r, __rid: i }))}
          rowKey={(r) => String(r.__rid)}
          totalCount={rows.data?.length ?? 0}
          emptyState="Preview produced no rows."
        />
      )}
    </Card>
  );
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}
