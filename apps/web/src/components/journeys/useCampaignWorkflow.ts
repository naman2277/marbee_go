import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serializeCampaignGraph, validateCampaign, validateNodeForRun, type CampaignNodeData } from '@/lib/campaign-graph';
import type { CampaignModeInput } from '@/lib/campaign-nodes';
import type { DeliveryPrepData } from '@/lib/delivery-prep';
import { extractDeployedDeliveries } from '@/lib/campaign-deliveries';
import { markCampaignDeployed } from '@/lib/journeys';
import {
  completeWorkflowRun,
  purgeWorkflowTransitionData,
  fetchOrCreateWorkflowRun,
  getExecutableOrder,
  getNextRunnableNode,
  explainNodeNotRunnable,
  explainWorkflowStall,
  isDeliveryStep,
  isNodeRunnable,
  resetWorkflowRun,
  runWorkflowStep,
  type NodePopulationResult,
} from '@/lib/workflow-engine';
import { createLogEntry, type WorkflowLogEntry } from '@/lib/campaign-workflow-log';
import type { Edge, Node } from 'reactflow';

type WorkflowContext = {
  journeyId: string;
  versionId: string;
  journeyName: string;
  tenantId: string;
  environment: string;
};

export type WorkflowExecutionPhase = 'idle' | 'running' | 'paused' | 'awaiting_delivery' | 'finished';

const EMPTY_NODE_RESULTS: Record<string, never> = {};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useCampaignWorkflow(
  ctx: WorkflowContext | undefined,
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
  selectedNodeId: string | null,
  onSelectNode: (id: string | null) => void,
  options?: {
    mode?: CampaignModeInput;
    onValidationBlocked?: (messages: string[]) => void;
  },
) {
  const mode = options?.mode ?? 'campaign';
  const onValidationBlocked = options?.onValidationBlocked;
  const queryClient = useQueryClient();
  const enabled = Boolean(ctx);

  const { data: runState, error: runError, isLoading: runLoading } = useQuery({
    queryKey: ['workflow-run', ctx?.journeyId, ctx?.versionId],
    queryFn: () => fetchOrCreateWorkflowRun(ctx!.journeyId, ctx!.versionId, ctx!.tenantId, ctx!.environment),
    enabled,
    retry: false,
  });

  const [errorNodeIds, setErrorNodeIds] = useState<Set<string>>(new Set());
  const [executionPhase, setExecutionPhase] = useState<WorkflowExecutionPhase>('idle');
  const [batchNodeId, setBatchNodeId] = useState<string | null>(null);
  const [isLoopActive, setIsLoopActive] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<DeliveryPrepData | null>(null);
  const [deliveryPendingNodeId, setDeliveryPendingNodeId] = useState<string | null>(null);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [workflowLog, setWorkflowLog] = useState<WorkflowLogEntry[]>([]);

  const abortRef = useRef(false);
  const pauseRef = useRef(false);
  const loopActiveRef = useRef(false);
  const awaitingDeliveryRef = useRef(false);
  const pendingResultsRef = useRef<Record<string, NodePopulationResult>>({});

  const appendLog = useCallback(
    (level: WorkflowLogEntry['level'], message: string, activity?: string, detail?: string) => {
      setWorkflowLog((prev) => [...prev, createLogEntry(level, message, activity, detail)]);
    },
    [],
  );

  const nodeLabel = useCallback(
    (nodeId: string) => nodes.find((n) => n.id === nodeId)?.data.label ?? nodeId.slice(0, 8),
    [nodes],
  );

  const nodeResults = runState?.node_results ?? EMPTY_NODE_RESULTS;
  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const order = useMemo(() => getExecutableOrder(graph), [graph]);
  const orderKey = useMemo(() => order.join('|'), [order]);
  const errorKey = useMemo(() => [...errorNodeIds].sort().join('|'), [errorNodeIds]);

  const liveCanvasJson = useMemo(() => serializeCampaignGraph(nodes, edges), [nodes, edges]);

  const countsByNode = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of Object.values(nodeResults)) {
      if (!r.handle) counts[r.nodeId] = r.count;
    }
    return counts;
  }, [nodeResults]);

  const runStatusByNode = useMemo(() => {
    const map: Record<string, CampaignNodeData['runStatus']> = {};
    for (const id of order) {
      if (deliveryPendingNodeId === id) {
        map[id] = 'delivery_pending';
      } else if (errorNodeIds.has(id)) {
        map[id] = 'error';
      } else {
        const has = Object.values(nodeResults).some((r) => r.nodeId === id);
        map[id] = has ? 'done' : 'idle';
      }
    }
    return map;
  }, [nodeResults, orderKey, errorKey, errorNodeIds, deliveryPendingNodeId]);

  const nextRunnable = useMemo(() => {
    return getNextRunnableNode(order, nodes, edges, nodeResults);
  }, [orderKey, order, nodes, edges, nodeResults]);

  const remainingCount = useMemo(() => {
    return order.filter((id) => isNodeRunnable(id, nodes, edges, nodeResults)).length;
  }, [orderKey, order, nodes, edges, nodeResults]);

  const activeResult = selectedNodeId
    ? nodeResults[selectedNodeId] ??
      Object.values(nodeResults).find((r) => r.nodeId === selectedNodeId && !r.handle)
    : null;

  const populationTotal = Object.values(nodeResults).reduce((max, r) => Math.max(max, r.count), 0);

  const waitWhilePaused = useCallback(async () => {
    while (pauseRef.current && !abortRef.current) {
      setExecutionPhase('paused');
      await sleep(120);
    }
    if (!abortRef.current && loopActiveRef.current && !awaitingDeliveryRef.current) {
      setPauseRequested(false);
      setExecutionPhase('running');
    }
  }, []);

  const openDeliveryPrep = useCallback(
    (prep: DeliveryPrepData, results: Record<string, NodePopulationResult>) => {
      awaitingDeliveryRef.current = true;
      pendingResultsRef.current = results;
      setPendingDelivery(prep);
      setDeliveryPendingNodeId(prep.nodeId);
      setExecutionPhase('awaiting_delivery');
      setBatchNodeId(null);
      onSelectNode(prep.nodeId);
      appendLog(
        'warning',
        `Delivery ready — ${prep.toSendCount.toLocaleString()} to send`,
        nodeLabel(prep.nodeId),
        prep.deliveryName,
      );
    },
    [onSelectNode, appendLog, nodeLabel],
  );

  const prepareDeliveryNode = useCallback(
    async (nodeId: string, results: Record<string, NodePopulationResult>) => {
      if (!ctx || !runState) throw new Error('Workflow not ready');

      const { deliveryPrep } = await runWorkflowStep({
        runId: runState.id,
        journeyId: ctx.journeyId,
        journeyName: ctx.journeyName,
        canvasJson: liveCanvasJson,
        nodeId,
        tenantId: ctx.tenantId,
        environment: ctx.environment,
        nodeResults: results,
        deliveryPhase: 'prepare',
      });

      if (!deliveryPrep) throw new Error('Failed to prepare delivery');
      openDeliveryPrep(deliveryPrep, results);
      return deliveryPrep;
    },
    [ctx, runState, liveCanvasJson, openDeliveryPrep],
  );

  const runMutation = useMutation({
    onMutate: (nodeId) => {
      setBatchNodeId(nodeId);
      setExecutionPhase('running');
      const node = nodes.find((n) => n.id === nodeId);
      appendLog(
        'info',
        `Starting ${node?.data.stepType ?? 'activity'}…`,
        nodeLabel(nodeId),
        'Step execution',
      );
    },
    mutationFn: async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && isDeliveryStep(node.data.stepType)) {
        await prepareDeliveryNode(nodeId, nodeResults);
        return { skipped: true as const };
      }
      return runWorkflowStep({
        runId: runState!.id,
        journeyId: ctx!.journeyId,
        journeyName: ctx!.journeyName,
        canvasJson: liveCanvasJson,
        nodeId,
        tenantId: ctx!.tenantId,
        environment: ctx!.environment,
        nodeResults,
      });
    },
    onSuccess: (data, nodeId) => {
      setErrorNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      if (data && !('skipped' in data) && 'nodeResults' in data) {
        const result = data.nodeResults[nodeId];
        if (result) {
          appendLog(
            'success',
            `Completed — ${result.count.toLocaleString()} profiles`,
            nodeLabel(nodeId),
          );
        }
      }
      if (data && 'nodeResults' in data && data.nodeResults) {
        queryClient.setQueryData(['workflow-run', ctx!.journeyId, ctx!.versionId], (prev: typeof runState) =>
          prev ? { ...prev, node_results: data.nodeResults, status: 'running' as const } : prev,
        );
      }
      setBatchNodeId(null);
      setExecutionPhase('idle');
    },
    onError: (err, nodeId) => {
      setBatchNodeId(null);
      setExecutionPhase('idle');
      setErrorNodeIds((prev) => new Set(prev).add(nodeId));
      appendLog('error', (err as Error).message, nodeLabel(nodeId));
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetWorkflowRun(runState!.id),
    onSuccess: () => {
      abortRef.current = true;
      pauseRef.current = false;
      loopActiveRef.current = false;
      awaitingDeliveryRef.current = false;
      setIsLoopActive(false);
      setPauseRequested(false);
      setStopRequested(false);
      setExecutionPhase('idle');
      setBatchNodeId(null);
      setPendingDelivery(null);
      setDeliveryPendingNodeId(null);
      setErrorNodeIds(new Set());
      setWorkflowLog([createLogEntry('info', 'Workflow reset')]);
      queryClient.invalidateQueries({ queryKey: ['workflow-run', ctx!.journeyId, ctx!.versionId] });
      onSelectNode(null);
    },
  });

  const assertWorkflowValid = useCallback(() => {
    const result = validateCampaign(nodes, edges, mode);
    if (!result.ok) {
      onValidationBlocked?.(result.messages);
      for (const message of result.messages) {
        appendLog('error', message, undefined, 'Campaign validation');
      }
    }
    return result.ok;
  }, [nodes, edges, mode, onValidationBlocked, appendLog]);

  const assertNodeRunnable = useCallback(
    (nodeId: string) => {
      const validation = validateNodeForRun(nodeId, nodes, edges);
      if (!validation.ok) {
        onValidationBlocked?.(validation.messages);
        for (const message of validation.messages) {
          appendLog('error', message, nodeLabel(nodeId), 'Activity validation');
        }
        return false;
      }

      if (!isNodeRunnable(nodeId, nodes, edges, nodeResults)) {
        const blocker = explainNodeNotRunnable(nodeId, nodes, edges, nodeResults);
        if (blocker) {
          appendLog('error', blocker, nodeLabel(nodeId), 'Cannot run yet');
        }
        return false;
      }

      return true;
    },
    [nodes, edges, nodeResults, onValidationBlocked, appendLog, nodeLabel],
  );

  const canRunNode = useCallback(
    (nodeId: string) => {
      if (!enabled || !runState || isLoopActive) return false;
      if (!isNodeRunnable(nodeId, nodes, edges, nodeResults)) return false;
      return validateNodeForRun(nodeId, nodes, edges).ok;
    },
    [enabled, runState, isLoopActive, nodes, edges, nodeResults],
  );

  const runNode = useCallback(
    (nodeId: string) => {
      if (!assertNodeRunnable(nodeId)) return;
      onSelectNode(nodeId);
      runMutation.mutate(nodeId);
    },
    [onSelectNode, runMutation, assertNodeRunnable],
  );

  const runNext = useCallback(() => {
    if (nextRunnable) runNode(nextRunnable);
  }, [nextRunnable, runNode]);

  const stopWorkflow = useCallback(() => {
    if (!loopActiveRef.current && !awaitingDeliveryRef.current) return;
    abortRef.current = true;
    pauseRef.current = false;
    awaitingDeliveryRef.current = false;
    setPauseRequested(false);
    setStopRequested(true);
    setBatchNodeId(null);
    setPendingDelivery(null);
    setDeliveryPendingNodeId(null);
    setExecutionPhase('idle');
    loopActiveRef.current = false;
    setIsLoopActive(false);
    appendLog('warning', 'Campaign stopped');
  }, [appendLog]);

  const cancelDelivery = useCallback(() => {
    awaitingDeliveryRef.current = false;
    setPendingDelivery(null);
    setDeliveryPendingNodeId(null);
    if (loopActiveRef.current) {
      abortRef.current = true;
      loopActiveRef.current = false;
      setIsLoopActive(false);
    }
    setExecutionPhase('idle');
    appendLog('info', 'Delivery cancelled');
  }, [appendLog]);

  const executeWorkflowLoop = useCallback(async (resultsOverride?: Record<string, NodePopulationResult>) => {
    if (!ctx || !runState) return;

    let results = resultsOverride ?? { ...(runState.node_results ?? {}) };
    const queryKey = ['workflow-run', ctx.journeyId, ctx.versionId] as const;
    let failedNodeId: string | null = null;

    try {
      while (!abortRef.current) {
        await waitWhilePaused();
        if (abortRef.current) break;

        const nodeId = getNextRunnableNode(order, nodes, edges, results);
        if (!nodeId) break;

        failedNodeId = nodeId;
        const node = nodes.find((n) => n.id === nodeId);

        if (node && isDeliveryStep(node.data.stepType)) {
          setExecutionPhase('running');
          setBatchNodeId(nodeId);
          appendLog('info', 'Preparing delivery…', nodeLabel(nodeId), 'Delivery prep');
          try {
            await prepareDeliveryNode(nodeId, results);
          } catch (err) {
            if (failedNodeId) setErrorNodeIds((prev) => new Set(prev).add(failedNodeId!));
            appendLog('error', (err as Error).message, nodeLabel(nodeId), 'Delivery prep failed');
          }
          return;
        }

        setExecutionPhase('running');
        setBatchNodeId(nodeId);
        onSelectNode(nodeId);
        const stepType = node?.data.stepType ?? 'activity';
        appendLog('info', `Running ${stepType}…`, nodeLabel(nodeId), 'Step execution');

        const { nodeResults: updated } = await runWorkflowStep({
          runId: runState.id,
          journeyId: ctx.journeyId,
          journeyName: ctx.journeyName,
          canvasJson: liveCanvasJson,
          nodeId,
          tenantId: ctx.tenantId,
          environment: ctx.environment,
          nodeResults: results,
        });

        results = updated;
        setErrorNodeIds((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
        queryClient.setQueryData(queryKey, (prev: typeof runState) =>
          prev ? { ...prev, node_results: updated, status: 'running' as const, current_node_id: nodeId } : prev,
        );

        const result = updated[nodeId];
        if (result) {
          appendLog(
            'success',
            `Completed — ${result.count.toLocaleString()} profiles`,
            nodeLabel(nodeId),
          );
        }

        setBatchNodeId(null);
        if (abortRef.current) break;
        await waitWhilePaused();
      }

      if (abortRef.current || awaitingDeliveryRef.current) return;

      await waitWhilePaused();
      if (abortRef.current || awaitingDeliveryRef.current) return;

      const remaining = getNextRunnableNode(order, nodes, edges, results);
      if (!remaining) {
        const stallReasons = explainWorkflowStall(order, nodes, edges, results);
        if (stallReasons.length) {
          for (const reason of stallReasons) {
            appendLog('error', reason, undefined, 'Workflow blocked');
          }
          appendLog(
            'error',
            'Workflow cannot continue — fix the issues above and run again',
            undefined,
            'Workflow stalled',
          );
          return;
        }

        const purgedResults = purgeWorkflowTransitionData(results);
        await completeWorkflowRun(runState.id, results);
        queryClient.setQueryData(queryKey, (prev: typeof runState) =>
          prev
            ? {
                ...prev,
                node_results: purgedResults,
                status: 'completed' as const,
                current_node_id: null,
                completed_at: new Date().toISOString(),
              }
            : prev,
        );
        setExecutionPhase('finished');
        appendLog('success', 'Campaign finished — all activities complete');
        try {
          await markCampaignDeployed(ctx.journeyId, ctx.tenantId, ctx.environment, ctx.journeyName);
          queryClient.invalidateQueries({ queryKey: ['journey', ctx.journeyId] });
        } catch {
          /* non-fatal */
        }
      }
    } catch (err) {
      if (failedNodeId) {
        setErrorNodeIds((prev) => new Set(prev).add(failedNodeId!));
        appendLog('error', (err as Error).message, nodeLabel(failedNodeId), 'Step failed');
      } else {
        appendLog('error', (err as Error).message, undefined, 'Workflow error');
      }
    } finally {
      if (!awaitingDeliveryRef.current) {
        setBatchNodeId(null);
        loopActiveRef.current = false;
        setIsLoopActive(false);
        setPauseRequested(false);
        setStopRequested(false);
        if (executionPhase !== 'awaiting_delivery') {
          setExecutionPhase('idle');
        }
      }
    }
  }, [
    ctx,
    runState,
    order,
    nodes,
    edges,
    liveCanvasJson,
    onSelectNode,
    queryClient,
    waitWhilePaused,
    prepareDeliveryNode,
    executionPhase,
    appendLog,
    nodeLabel,
  ]);

  const confirmDelivery = useCallback(async () => {
    if (!pendingDelivery || !ctx || !runState) return;

    setConfirmingDelivery(true);
    const queryKey = ['workflow-run', ctx.journeyId, ctx.versionId] as const;

    try {
      const { nodeResults: updated } = await runWorkflowStep({
        runId: runState.id,
        journeyId: ctx.journeyId,
        journeyName: ctx.journeyName,
        canvasJson: liveCanvasJson,
        nodeId: pendingDelivery.nodeId,
        tenantId: ctx.tenantId,
        environment: ctx.environment,
        nodeResults: pendingResultsRef.current,
        deliveryPhase: 'confirm',
        deliveryToSendIds: pendingDelivery.toSendIds,
        deliveryRecord: {
          id: pendingDelivery.deliveryId,
          name: pendingDelivery.deliveryName,
          channel: pendingDelivery.channel,
          stepType: pendingDelivery.stepType,
          excludedCount: pendingDelivery.excludedCount,
          templateName: pendingDelivery.preview.templateName,
          confirmedAt: new Date().toISOString(),
        },
      });

      awaitingDeliveryRef.current = false;
      setPendingDelivery(null);
      setDeliveryPendingNodeId(null);
      setErrorNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(pendingDelivery.nodeId);
        return next;
      });

      queryClient.setQueryData(queryKey, (prev: typeof runState) =>
        prev
          ? { ...prev, node_results: updated, status: 'running' as const, current_node_id: pendingDelivery.nodeId }
          : prev,
      );

      appendLog(
        'success',
        `Delivery deployed — ${pendingDelivery.toSendCount.toLocaleString()} sent`,
        nodeLabel(pendingDelivery.nodeId),
        pendingDelivery.deliveryName,
      );

      try {
        await markCampaignDeployed(ctx.journeyId, ctx.tenantId, ctx.environment, ctx.journeyName);
        queryClient.invalidateQueries({ queryKey: ['journey', ctx.journeyId] });
      } catch {
        /* non-fatal — delivery still succeeded */
      }

      if (loopActiveRef.current && !abortRef.current) {
        await executeWorkflowLoop(updated);
      } else {
        setExecutionPhase('idle');
      }
    } catch (err) {
      setErrorNodeIds((prev) => new Set(prev).add(pendingDelivery.nodeId));
      awaitingDeliveryRef.current = false;
      setPendingDelivery(null);
      setDeliveryPendingNodeId(null);
      setExecutionPhase('idle');
      appendLog(
        'error',
        (err as Error).message || 'Delivery deployment failed',
        nodeLabel(pendingDelivery.nodeId),
        'Delivery send failed',
      );
    } finally {
      setConfirmingDelivery(false);
    }
  }, [pendingDelivery, ctx, runState, liveCanvasJson, queryClient, executeWorkflowLoop, appendLog, nodeLabel]);

  const startWorkflow = useCallback(async () => {
    if (!ctx || runMutation.isPending || confirmingDelivery) return;
    if (!runState) return;
    if (!assertWorkflowValid()) return;

    if (executionPhase === 'paused' && loopActiveRef.current) {
      pauseRef.current = false;
      abortRef.current = false;
      setPauseRequested(false);
      setExecutionPhase('running');
      return;
    }

    if (loopActiveRef.current || executionPhase === 'running' || executionPhase === 'awaiting_delivery') return;

    let resultsOverride: Record<string, NodePopulationResult> | undefined;
    const runnableNow = order.filter((id) => isNodeRunnable(id, nodes, edges, runState.node_results ?? {}));

    if (runnableNow.length === 0) {
      await resetWorkflowRun(runState.id);
      queryClient.setQueryData(['workflow-run', ctx.journeyId, ctx.versionId], (prev: typeof runState) =>
        prev
          ? { ...prev, node_results: {}, status: 'idle' as const, current_node_id: null }
          : prev,
      );
      setErrorNodeIds(new Set());
      setPendingDelivery(null);
      setDeliveryPendingNodeId(null);
      resultsOverride = {};
    }

    abortRef.current = false;
    pauseRef.current = false;
    awaitingDeliveryRef.current = false;
    setPauseRequested(false);
    setStopRequested(false);
    loopActiveRef.current = true;
    setIsLoopActive(true);
    setExecutionPhase('running');
    appendLog('info', 'Campaign started', undefined, `${runnableNow.length || order.length} activities in queue`);
    await executeWorkflowLoop(resultsOverride);
  }, [
    ctx,
    runState,
    runMutation.isPending,
    confirmingDelivery,
    executionPhase,
    order,
    nodes,
    edges,
    queryClient,
    executeWorkflowLoop,
    appendLog,
    assertWorkflowValid,
  ]);

  const pauseWorkflow = useCallback(() => {
    if (!loopActiveRef.current || awaitingDeliveryRef.current) return;
    pauseRef.current = true;
    setPauseRequested(true);
    setExecutionPhase('paused');
    appendLog('warning', 'Campaign paused');
  }, [appendLog]);

  const isWorkflowRunning =
    isLoopActive || executionPhase === 'running' || runMutation.isPending || confirmingDelivery;
  const isWorkflowPaused = executionPhase === 'paused';
  const isWorkflowActive =
    isLoopActive || isWorkflowRunning || isWorkflowPaused || executionPhase === 'awaiting_delivery';

  const deployedDeliveries = useMemo(
    () => extractDeployedDeliveries(nodeResults),
    [nodeResults],
  );

  const isFinished =
    executionPhase === 'finished' || runState?.status === 'completed';

  useEffect(() => {
    if (runState?.status === 'completed' && executionPhase !== 'finished') {
      setExecutionPhase('finished');
    }
  }, [runState?.status, executionPhase]);

  const runErrorLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runError) {
      runErrorLoggedRef.current = null;
      return;
    }
    const message = (runError as Error).message;
    if (runErrorLoggedRef.current === message) return;
    runErrorLoggedRef.current = message;
    appendLog('error', message, undefined, 'Workflow session');
  }, [runError, appendLog]);

  const runningNodeId =
    deliveryPendingNodeId ??
    (isLoopActive || executionPhase === 'running' || executionPhase === 'paused'
      ? batchNodeId
      : runMutation.isPending
        ? (runMutation.variables ?? null)
        : null);

  return useMemo(
    () => ({
      enabled,
      runState,
      runError,
      runLoading,
      nodeResults,
      countsByNode,
      runStatusByNode,
      errorNodeIds,
      runningNodeId,
      deliveryPendingNodeId,
      executionPhase,
      isLoopActive,
      pauseRequested,
      stopRequested,
      isWorkflowRunning,
      isWorkflowPaused,
      isWorkflowActive,
      nextRunnable,
      remainingCount,
      activeResult,
      populationTotal,
      deployedDeliveries,
      isFinished,
      completedAt: runState?.completed_at ?? null,
      pendingDelivery,
      confirmingDelivery,
      workflowLog,
      runMutation,
      resetMutation,
      runNode,
      runNext,
      canRunNode,
      startWorkflow,
      pauseWorkflow,
      stopWorkflow,
      confirmDelivery,
      cancelDelivery,
      order,
    }),
    [
      enabled,
      runState,
      runError,
      runLoading,
      nodeResults,
      countsByNode,
      runStatusByNode,
      errorNodeIds,
      runningNodeId,
      deliveryPendingNodeId,
      executionPhase,
      isLoopActive,
      pauseRequested,
      stopRequested,
      isWorkflowRunning,
      isWorkflowPaused,
      isWorkflowActive,
      nextRunnable,
      remainingCount,
      activeResult,
      populationTotal,
      deployedDeliveries,
      isFinished,
      pendingDelivery,
      confirmingDelivery,
      workflowLog,
      runMutation,
      resetMutation,
      runNode,
      runNext,
      canRunNode,
      startWorkflow,
      pauseWorkflow,
      stopWorkflow,
      confirmDelivery,
      cancelDelivery,
      order,
    ],
  );
}
