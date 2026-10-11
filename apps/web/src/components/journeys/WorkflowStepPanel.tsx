import { useMemo, useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Play, RotateCcw, Users } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { NodePopulationPreview } from '@/components/journeys/NodePopulationPreview';
import { parseCampaignGraph } from '@/lib/campaign-graph';
import { paletteItem } from '@/lib/campaign-nodes';
import {
  fetchOrCreateWorkflowRun,
  getExecutableOrder,
  resetWorkflowRun,
  runWorkflowStep,
  type NodePopulationResult,
} from '@/lib/workflow-engine';

type Props = {
  journeyId: string;
  versionId: string;
  journeyName: string;
  canvasJson: unknown;
  tenantId: string;
  environment: string;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onNodeResultsChange?: (results: Record<string, NodePopulationResult>) => void;
};

export function WorkflowStepPanel({
  journeyId,
  versionId,
  journeyName,
  canvasJson,
  tenantId,
  environment,
  selectedNodeId,
  onSelectNode,
  onNodeResultsChange,
}: Props) {
  const queryClient = useQueryClient();
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const activeNodeId = selectedNodeId ?? localSelected;

  const graph = useMemo(() => parseCampaignGraph(canvasJson), [canvasJson]);
  const order = useMemo(() => getExecutableOrder(graph), [graph]);

  const { data: runState, error: runError } = useQuery({
    queryKey: ['workflow-run', journeyId, versionId],
    queryFn: () => fetchOrCreateWorkflowRun(journeyId, versionId, tenantId, environment),
    enabled: Boolean(journeyId && versionId && tenantId),
    retry: false,
  });

  const nodeResults = runState?.node_results ?? {};

  const onResultsRef = useRef(onNodeResultsChange);
  onResultsRef.current = onNodeResultsChange;

  useEffect(() => {
    if (runState?.node_results) {
      onResultsRef.current?.(runState.node_results);
    }
  }, [runState?.id, runState?.node_results]);

  const selectNode = (nodeId: string | null) => {
    setLocalSelected(nodeId);
    onSelectNode?.(nodeId);
  };

  const runMutation = useMutation({
    mutationFn: (nodeId: string) =>
      runWorkflowStep({
        runId: runState!.id,
        journeyId,
        journeyName,
        canvasJson,
        nodeId,
        tenantId,
        environment,
        nodeResults,
      }),
    onSuccess: ({ nodeResults: updated }) => {
      queryClient.setQueryData(['workflow-run', journeyId, versionId], (prev: typeof runState) =>
        prev ? { ...prev, node_results: updated, status: 'running' as const } : prev,
      );
      onNodeResultsChange?.(updated);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetWorkflowRun(runState!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-run', journeyId, versionId] });
      onNodeResultsChange?.({});
      selectNode(null);
    },
  });

  const activeResult = activeNodeId
    ? nodeResults[activeNodeId] ??
      Object.values(nodeResults).find((r) => r.nodeId === activeNodeId && !r.handle)
    : null;

  const nextRunnable = order.find((id) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return false;
    const hasResult = Object.values(nodeResults).some((r) => r.nodeId === id);
    if (hasResult) return false;
    const isSource = ['query', 'read_list', 'incremental_query'].includes(node.data.stepType);
    if (isSource) return true;
    const inbound = graph.edges.filter((e) => e.target === id);
    return inbound.every((e) =>
      Object.values(nodeResults).some((r) => r.nodeId === e.source),
    );
  });

  const handleRun = (nodeId: string) => {
    selectNode(nodeId);
    runMutation.mutate(nodeId);
  };

  const populationTotal = Object.values(nodeResults).reduce((max, r) => Math.max(max, r.count), 0);

  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Workflow execution</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Adobe Campaign–style targeting — run each activity, preview population, then continue
          </p>
          <div className="mt-2 flex gap-4 text-sm">
            <span className="text-slate-500">
              Status: <strong className="text-slate-800">{runState?.status ?? 'idle'}</strong>
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <Users className="h-3.5 w-3.5" />
              {populationTotal.toLocaleString()} max population
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={resetMutation.isPending || !runState}
            onClick={() => resetMutation.mutate()}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reset workflow
          </Button>
          {nextRunnable && (
            <Button
              size="sm"
              disabled={runMutation.isPending || !runState}
              onClick={() => handleRun(nextRunnable)}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              Run next: {graph.nodes.find((n) => n.id === nextRunnable)?.data.label ?? 'step'}
            </Button>
          )}
          {activeNodeId && (
            <Button
              size="sm"
              variant="secondary"
              disabled={runMutation.isPending || !runState}
              onClick={() => handleRun(activeNodeId)}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              Re-run selected
            </Button>
          )}
        </div>
      </div>

      {runError && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Workflow state unavailable: {(runError as Error).message}. Run{' '}
          <code className="rounded bg-amber-100 px-1">31_workflow_runs.sql</code> in Supabase if you have not yet.
        </p>
      )}

      {runMutation.isError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {(runMutation.error as Error).message}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Activities ({order.length})
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {order.map((nodeId) => {
              const node = graph.nodes.find((n) => n.id === nodeId);
              if (!node) return null;
              const meta = paletteItem(node.data.stepType);
              const result = Object.values(nodeResults).find((r) => r.nodeId === nodeId && !r.handle);
              const isActive = activeNodeId === nodeId;
              const isDone = Boolean(result);

              return (
                <li key={nodeId}>
                  <button
                    type="button"
                    onClick={() => selectNode(nodeId)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                      isActive ? 'bg-white shadow-sm ring-1 ring-sky-200' : 'hover:bg-white/80'
                    }`}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: isDone ? '#22c55e' : meta?.accent ?? '#94a3b8' }}
                    >
                      {isDone ? '✓' : order.indexOf(nodeId) + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{node.data.label}</span>
                      <span className="block truncate text-[10px] text-slate-500">{meta?.label ?? node.data.stepType}</span>
                    </span>
                    {result && (
                      <span className="shrink-0 text-xs font-bold tabular-nums text-sky-600">
                        {result.count.toLocaleString()}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <NodePopulationPreview result={activeResult} loading={runMutation.isPending} />
      </div>
    </Card>
  );
}
