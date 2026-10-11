import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Sparkles, Minimize2 } from 'lucide-react';
import { CampaignCanvasContext } from '@/components/journeys/CampaignCanvasContext';
import { CampaignPalette } from '@/components/journeys/CampaignPalette';
import { CampaignNodeConfigPanel } from '@/components/journeys/CampaignNodeConfigPanel';
import { CampaignToolbar } from '@/components/journeys/CampaignToolbar';
import { campaignEdgeTypes } from '@/components/journeys/CampaignThreadEdge';
import { campaignNodeTypes } from '@/components/journeys/CampaignStepNode';
import { useCampaignKeyboard } from '@/components/journeys/useCampaignKeyboard';
import { DeliveryPrepModal } from '@/components/journeys/DeliveryPrepModal';
import { WorkflowErrorHelpIcon } from '@/components/journeys/WorkflowErrorHelpIcon';
import { helpForValidationMessage } from '@/lib/workflow-error-help';
import { CampaignDeliveriesPanel } from '@/components/journeys/CampaignDeliveriesPanel';
import { useCampaignWorkflow } from '@/components/journeys/useCampaignWorkflow';
import { ThreadTransitionPanel } from '@/components/journeys/ThreadTransitionPanel';
import {
  autoLayoutCampaign,
  parseCampaignGraph,
  serializeCampaignGraph,
  validateCampaign,
  type CampaignNodeData,
} from '@/lib/campaign-graph';
import { categoryAccent, defaultConfigForType, isCampaignWorkflowMode, paletteItem, type CampaignModeInput } from '@/lib/campaign-nodes';
import { spectrumCategoryAccent } from '@/lib/spectrum-canvas-tokens';
import type { ActivityExecutionStatus } from '@/lib/campaign-acc-stages';
import {
  bridgeDataSignature,
  type CampaignActivityRow,
  type CampaignEditorBridgeState,
} from '@/components/journeys/campaign/CampaignEditorBridge';
import { setCampaignRuntime } from '@/lib/campaign-runtime-store';
import { getPopulationForSource } from '@/lib/workflow-thread';
import {
  personalizationFromNodeResult,
  upstreamPersonalizationForNode,
} from '@/lib/template-personalization';
import { deliveryChannelForStep } from '@/components/journeys/WorkflowDeliverySetupPanel';

export type BlastCampaignCanvasProps = {
  canvasJson: unknown;
  tenantId: string;
  environment: string;
  mode?: CampaignModeInput;
  journeyId?: string;
  versionId?: string;
  journeyName?: string;
  nodeLiveCounts?: Record<string, number>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onSave: (json: ReturnType<typeof serializeCampaignGraph>) => void;
  savePending?: boolean;
  onLoadTemplate?: () => void;
  templatePending?: boolean;
  classicLayout?: boolean;
  onBridgeChange?: (state: CampaignEditorBridgeState) => void;
};

function BlastCampaignCanvasEditor({
  canvasJson,
  tenantId,
  environment,
  mode = 'flow',
  journeyId,
  versionId,
  journeyName,
  nodeLiveCounts,
  selectedNodeId: _selectedNodeId,
  onSelectNode: _onSelectNode,
  onSave,
  savePending,
  onLoadTemplate,
  templatePending,
  classicLayout = false,
  onBridgeChange,
}: BlastCampaignCanvasProps) {
  const initial = useMemo(() => parseCampaignGraph(canvasJson), [canvasJson]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CampaignNodeData>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [threadPreview, setThreadPreview] = useState<{
    sourceNodeId: string;
    sourceHandle?: string | null;
    sourceLabel: string;
    targetNodeId: string;
    targetLabel: string;
  } | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [validateFlash, setValidateFlash] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sideTab, setSideTab] = useState<'activity' | 'deliveries'>('activity');
  const containerRef = useRef<HTMLDivElement>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const hydratedRef = useRef(false);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    setNodes(initial.nodes);
    setEdges(
      initial.edges.map((e) => ({
        ...e,
        type: e.type ?? 'campaignThread',
        animated: false,
      })),
    );
  }, [initial.nodes, initial.edges, setNodes, setEdges]);

  useEffect(() => {
    if (!fullscreen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [fullscreen]);

  useEffect(() => {
    if (fullscreen) {
      setTimeout(() => flowRef.current?.fitView({ padding: 0.2 }), 80);
    }
  }, [fullscreen]);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedId(nodeId);
    if (nodeId) {
      setSelectedEdgeId(null);
      setThreadPreview(null);
    }
  }, []);

  const openThreadTransition = useCallback((edge: Edge) => {
    const sourceNode = nodesRef.current.find((n) => n.id === edge.source);
    const targetNode = nodesRef.current.find((n) => n.id === edge.target);
    setSelectedEdgeId(edge.id);
    setThreadPreview({
      sourceNodeId: edge.source,
      sourceHandle: edge.sourceHandle,
      sourceLabel: sourceNode?.data.label ?? edge.source,
      targetNodeId: edge.target,
      targetLabel: targetNode?.data.label ?? edge.target,
    });
    setSelectedId(null);
    setSelectedIds([]);
    setSideTab('activity');
  }, []);

  const openThreadPreview = useCallback(
    (sourceNodeId: string, sourceHandle?: string | null) => {
      const edge = edges.find(
        (e) => e.source === sourceNodeId && (sourceHandle == null || e.sourceHandle === sourceHandle),
      );
      if (edge) {
        openThreadTransition(edge);
      }
    },
    [edges, openThreadTransition],
  );

  const workflowCtx =
    isCampaignWorkflowMode(mode) && journeyId && versionId && journeyName
      ? { journeyId, versionId, journeyName, tenantId, environment }
      : undefined;

  const workflow = useCampaignWorkflow(workflowCtx, nodes, edges, selectedId, selectNode, {
    mode,
    onValidationBlocked: (messages) => {
      setValidationMessages(messages);
      setValidateFlash(true);
      setTimeout(() => setValidateFlash(false), 5000);
    },
  });

  const {
    enabled: workflowEnabled,
    runningNodeId,
    runStatusByNode,
    countsByNode,
    nodeResults,
    errorNodeIds,
  } = workflow;

  const runningNodeLabel = workflow.runningNodeId
    ? nodes.find((n) => n.id === workflow.runningNodeId)?.data.label
    : undefined;

  const handleStartWorkflow = useCallback(() => {
    void workflow.startWorkflow();
  }, [workflow.startWorkflow]);

  useEffect(() => {
    if (workflow.isFinished) {
      setSideTab('deliveries');
    }
  }, [workflow.isFinished]);

  useLayoutEffect(() => {
    setCampaignRuntime({
      workflowEnabled,
      runningNodeId,
      deliveryPendingNodeId: workflow.deliveryPendingNodeId,
      runStatusByNode,
      countsByNode,
      nodeResults,
      errorNodeIds,
      selectedEdgeId,
      nodeLiveCounts,
    });
  }, [
    workflowEnabled,
    runningNodeId,
    workflow.deliveryPendingNodeId,
    runStatusByNode,
    countsByNode,
    nodeResults,
    errorNodeIds,
    selectedEdgeId,
    nodeLiveCounts,
  ]);

  const canvasContextValue = useMemo(
    () => ({ onThreadPreview: openThreadPreview, spectrumTheme: classicLayout }),
    [openThreadPreview, classicLayout],
  );

  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'campaignThread',
          },
          eds,
        ),
      );
    },
    [setEdges],
  );


  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      openThreadTransition(edge);
    },
    [openThreadTransition],
  );

  const clearSelection = useCallback(() => {
    selectNode(null);
    setSelectedEdgeId(null);
    setThreadPreview(null);
    setSelectedIds([]);
  }, [selectNode]);

  const addNodeAt = useCallback(
    (stepType: string, position?: { x: number; y: number }) => {
      const meta = paletteItem(stepType);
      const id = crypto.randomUUID();
      const pos = position ?? {
        x: 60 + (nodes.length % 4) * 80,
        y: 120 + Math.floor(nodes.length / 4) * 100,
      };
      const newNode: Node<CampaignNodeData> = {
        id,
        type: 'campaignStep',
        position: pos,
        data: {
          label: meta?.label ?? stepType,
          stepType,
          config: defaultConfigForType(stepType),
        },
      };
      setNodes((nds) => [...nds, newNode]);
      selectNode(id);
    },
    [nodes.length, setNodes, selectNode],
  );

  const addNodeAtCenter = useCallback(
    (stepType: string) => {
      if (reactFlowWrapper.current && flowRef.current) {
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const position = flowRef.current.screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        });
        addNodeAt(stepType, position);
        return;
      }
      addNodeAt(stepType);
    },
    [addNodeAt],
  );

  const updateNode = useCallback((nodeId: string, patch: Partial<CampaignNodeData>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, ...patch, config: patch.config ?? n.data.config } }
          : n,
      ),
    );
  }, [setNodes]);

  const deleteNodes = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
      setEdges((eds) => eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
      if (selectedId && idSet.has(selectedId)) selectNode(null);
      setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
      if (threadPreview && idSet.has(threadPreview.sourceNodeId)) {
        setThreadPreview(null);
        setSelectedEdgeId(null);
      }
    },
    [setNodes, setEdges, selectedId, selectNode, threadPreview],
  );

  const deleteNode = useCallback((nodeId: string) => deleteNodes([nodeId]), [deleteNodes]);

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const source = nodes.find((n) => n.id === nodeId);
      if (!source) return;
      const id = crypto.randomUUID();
      setNodes((nds) => [
        ...nds,
        {
          ...source,
          id,
          position: { x: source.position.x + 48, y: source.position.y + 48 },
          data: { ...source.data, label: `${source.data.label} (copy)`, runStatus: 'idle', liveCount: undefined },
        },
      ]);
      selectNode(id);
    },
    [nodes, setNodes, selectNode],
  );

  const pasteNode = useCallback(
    (node: Node<CampaignNodeData>) => {
      setNodes((nds) => [...nds, node]);
      selectNode(node.id);
    },
    [setNodes, selectNode],
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const previewLabel = threadPreview
    ? `${threadPreview.sourceLabel} → ${threadPreview.targetLabel}${
        threadPreview.sourceHandle ? ` (${threadPreview.sourceHandle})` : ''
      }`
    : undefined;

  useCampaignKeyboard({
    containerRef,
    selectedIds,
    selectedNode,
    onDelete: deleteNodes,
    onDuplicate: duplicateNode,
    onPaste: pasteNode,
    onDeselect: clearSelection,
    onToggleFullscreen: toggleFullscreen,
    fullscreen,
  });

  const dragStartPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const onNodeDragStart = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const getDownstream = (startId: string): Set<string> => {
        const set = new Set<string>();
        const queue = [startId];
        while (queue.length > 0) {
          const curr = queue.shift()!;
          edges.filter((e) => e.source === curr).forEach((e) => {
            if (!set.has(e.target)) {
              set.add(e.target);
              queue.push(e.target);
            }
          });
        }
        return set;
      };

      const groupIds = getDownstream(node.id);
      groupIds.add(node.id);

      nodes.filter((n) => selectedIds.includes(n.id)).forEach((sel) => {
        groupIds.add(sel.id);
        getDownstream(sel.id).forEach((id) => groupIds.add(id));
      });

      const posMap = new Map<string, { x: number; y: number }>();
      nodes.forEach((nd) => {
        if (groupIds.has(nd.id)) {
          posMap.set(nd.id, { x: nd.position.x, y: nd.position.y });
        }
      });
      dragStartPosRef.current = posMap;
    },
    [nodes, edges, selectedIds],
  );

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const initialStart = dragStartPosRef.current.get(node.id);
      if (!initialStart) return;

      const dx = node.position.x - initialStart.x;
      const dy = node.position.y - initialStart.y;
      if (dx === 0 && dy === 0) return;

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) return n;
          const initial = dragStartPosRef.current.get(n.id);
          if (!initial) return n;
          return {
            ...n,
            position: {
              x: initial.x + dx,
              y: initial.y + dy,
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const onNodeDragStop = useCallback(() => {
    dragStartPosRef.current.clear();
  }, []);

  const onDragStart = (event: React.DragEvent, stepType: string) => {
    event.dataTransfer.setData('application/campaign-node', stepType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const stepType = event.dataTransfer.getData('application/campaign-node');
    if (!stepType || !reactFlowWrapper.current || !flowRef.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = flowRef.current.screenToFlowPosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    addNodeAt(stepType, position);
  };

  const handleValidate = () => {
    const result = validateCampaign(nodes, edges, mode);
    setValidationMessages(result.messages);
    setValidateFlash(true);
    setTimeout(() => setValidateFlash(false), 2500);
  };

  const handleLayout = () => {
    setNodes((nds) => autoLayoutCampaign(nds, edges));
    setTimeout(() => flowRef.current?.fitView({ padding: 0.25 }), 50);
  };

  const handleFitView = () => flowRef.current?.fitView({ padding: 0.25 });

  const handleSave = () => onSave(serializeCampaignGraph(nodes, edges));

  const bridgeActionsRef = useRef({
    handleSave,
    handleValidate,
    handleLayout,
    handleFitView,
    updateNode,
    deleteNode,
    duplicateNode,
    runNode: (nodeId: string) => workflow.runNode(nodeId),
    onLoadTemplate,
  });
  bridgeActionsRef.current = {
    handleSave,
    handleValidate,
    handleLayout,
    handleFitView,
    updateNode,
    deleteNode,
    duplicateNode,
    runNode: (nodeId: string) => workflow.runNode(nodeId),
    onLoadTemplate,
  };

  const stableBridgeActions = useMemo(
    () => ({
      onSave: () => bridgeActionsRef.current.handleSave(),
      onValidate: () => bridgeActionsRef.current.handleValidate(),
      onAutoLayout: () => bridgeActionsRef.current.handleLayout(),
      onFitView: () => bridgeActionsRef.current.handleFitView(),
      onUpdateNode: (nodeId: string, patch: Partial<CampaignNodeData>) =>
        bridgeActionsRef.current.updateNode(nodeId, patch),
      onDeleteNode: (nodeId: string) => bridgeActionsRef.current.deleteNode(nodeId),
      onDuplicateNode: (nodeId: string) => bridgeActionsRef.current.duplicateNode(nodeId),
      onLoadTemplate: () => bridgeActionsRef.current.onLoadTemplate?.(),
      onRunActivity: () => {
        const id = selectedId;
        if (id) bridgeActionsRef.current.runNode(id);
      },
    }),
    [selectedId],
  );

  const previewResult = useMemo(() => {
    if (!workflowEnabled) return null;
    if (threadPreview) {
      return getPopulationForSource(
        threadPreview.sourceNodeId,
        threadPreview.sourceHandle,
        nodeResults,
      );
    }
    return workflow.activeResult;
  }, [threadPreview, workflowEnabled, nodeResults, workflow.activeResult]);

  const templatePersonalization = useMemo(() => {
    if (!selectedNode || !workflowEnabled) {
      return { fields: undefined, sample: null as Record<string, unknown> | null };
    }
    if (deliveryChannelForStep(selectedNode.data.stepType)) {
      return upstreamPersonalizationForNode(selectedNode.id, edges, nodeResults);
    }
    if (['query', 'incremental_query'].includes(selectedNode.data.stepType)) {
      return personalizationFromNodeResult(previewResult);
    }
    return { fields: undefined, sample: null as Record<string, unknown> | null };
  }, [selectedNode, workflowEnabled, edges, nodeResults, previewResult]);

  const bridgePayload = useMemo((): CampaignEditorBridgeState => {
    const activityRows: CampaignActivityRow[] = nodes.map((n) => {
      let status: ActivityExecutionStatus = 'idle';
      if (workflow.deliveryPendingNodeId === n.id) status = 'delivery_pending';
      else if (workflow.runningNodeId === n.id) status = 'running';
      else if (workflow.errorNodeIds.has(n.id)) status = 'error';
      else if (nodeResults[n.id]) status = 'done';
      const count = workflow.countsByNode[n.id] ?? nodeResults[n.id]?.count;
      return {
        nodeId: n.id,
        label: n.data.label,
        stepType: n.data.stepType,
        status,
        count,
      };
    });

    return {
      workflow,
      workflowLog: workflow.workflowLog,
      activityRows,
      selectedNode,
      previewResult,
      previewLabel,
      personalizationFields: templatePersonalization.fields,
      personalizationSample: templatePersonalization.sample,
      threadPreviewLabel: previewLabel,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      validationMessages,
      savePending,
      templatePending,
      ...stableBridgeActions,
      onRunActivity:
        selectedNode && workflow.enabled ? stableBridgeActions.onRunActivity : undefined,
    };
  }, [
    workflow,
    selectedNode,
    previewResult,
    previewLabel,
    nodes,
    nodeResults,
    workflow.countsByNode,
    workflow.deliveryPendingNodeId,
    workflow.runningNodeId,
    workflow.errorNodeIds,
    nodes.length,
    edges.length,
    validationMessages,
    savePending,
    templatePending,
    templatePersonalization.fields,
    templatePersonalization.sample,
    stableBridgeActions,
  ]);

  const bridgeSignature = bridgeDataSignature(bridgePayload);
  const lastBridgeSignatureRef = useRef('');

  useLayoutEffect(() => {
    if (!classicLayout || !onBridgeChange) return;
    if (bridgeSignature === lastBridgeSignatureRef.current) return;
    lastBridgeSignatureRef.current = bridgeSignature;
    onBridgeChange(bridgePayload);
  }, [classicLayout, onBridgeChange, bridgeSignature, bridgePayload]);

  const shellClass = classicLayout
    ? 'flex h-full min-h-0 flex-1 overflow-hidden'
    : fullscreen
      ? 'flex h-full min-h-0 flex-1 overflow-hidden'
      : 'flex h-full min-h-[calc(100vh-11rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg';

  const editor = (
    <CampaignCanvasContext.Provider value={canvasContextValue}>
    <div
      ref={containerRef}
      tabIndex={0}
      className={`${shellClass} outline-none`}
      onMouseDown={() => containerRef.current?.focus()}
    >
      <CampaignPalette mode={mode} light modern onAddNode={addNodeAtCenter} onDragStart={onDragStart} />

      <div
        ref={reactFlowWrapper}
        className={`relative min-w-0 flex-1 ${classicLayout ? 'spectrum-canvas modern-canvas' : 'modern-canvas bg-slate-100'}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={onDrop}
      >
        {!classicLayout && (
          <CampaignToolbar
            mode={mode}
            nodeCount={nodes.length}
            edgeCount={edges.length}
            validationMessages={validationMessages}
            savePending={savePending}
            runPending={workflow.runMutation.isPending}
            executionPhase={workflow.executionPhase}
            isLoopActive={workflow.isLoopActive}
            pauseRequested={workflow.pauseRequested}
            stopRequested={workflow.stopRequested}
            workflowLoading={workflow.runLoading}
            resetPending={workflow.resetMutation.isPending}
            populationTotal={workflow.populationTotal}
            onSave={handleSave}
            onAutoLayout={handleLayout}
            onFitView={handleFitView}
            onValidate={handleValidate}
            onStartWorkflow={workflow.enabled ? handleStartWorkflow : undefined}
            onPauseWorkflow={workflow.enabled ? workflow.pauseWorkflow : undefined}
            onStopWorkflow={workflow.enabled ? workflow.stopWorkflow : undefined}
            onRunNext={workflow.enabled && workflow.nextRunnable ? workflow.runNext : undefined}
            onResetWorkflow={
              workflow.enabled
                ? () => {
                    setSideTab('activity');
                    workflow.resetMutation.mutate();
                  }
                : undefined
            }
            runningNodeLabel={runningNodeLabel}
            workflowFinished={workflow.isFinished}
            deliveryCount={workflow.deployedDeliveries.length}
            onLoadTemplate={onLoadTemplate}
            templatePending={templatePending}
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
          />
        )}

        {!classicLayout && workflow.pendingDelivery && (
          <DeliveryPrepModal
            prep={workflow.pendingDelivery}
            confirming={workflow.confirmingDelivery}
            onConfirm={() => void workflow.confirmDelivery()}
            onCancel={workflow.cancelDelivery}
          />
        )}

        {workflow.runError && (
          <div className="absolute bottom-20 left-1/2 z-20 max-w-lg -translate-x-1/2 rounded-xl border border-amber-500/30 bg-amber-950/95 px-4 py-3 text-xs text-amber-200 shadow-xl backdrop-blur">
            Workflow unavailable: {(workflow.runError as Error).message}. Run{' '}
            <code className="rounded bg-amber-900/50 px-1">31_workflow_runs.sql</code> in Supabase.
          </div>
        )}

        {workflow.runMutation.isError && (
          <div className="absolute bottom-20 left-1/2 z-20 max-w-lg -translate-x-1/2 rounded-xl border border-red-500/30 bg-red-950/95 px-4 py-3 text-xs text-red-200 shadow-xl backdrop-blur">
            <div className="flex items-start gap-2">
              <span className="flex-1">{(workflow.runMutation.error as Error).message}</span>
              <WorkflowErrorHelpIcon
                message={(workflow.runMutation.error as Error).message}
                level="error"
              />
            </div>
          </div>
        )}

        {validateFlash && validationMessages.length > 0 && (
          <div className="absolute bottom-20 left-1/2 z-20 max-w-lg -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-xl">
            <p className="mb-1 text-xs font-semibold text-amber-900">Fix workflow connections before running</p>
            <ul className="space-y-1.5 text-xs text-amber-800">
              {validationMessages.map((m) => (
                <li key={m} className="flex items-start gap-2">
                  <span className="flex-1">• {m}</span>
                  <WorkflowErrorHelpIcon
                    message={m}
                    level="error"
                    variant="warning"
                    help={helpForValidationMessage(m)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={campaignNodeTypes}
          edgeTypes={campaignEdgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          connectionRadius={48}
          connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2.5 }}
          defaultEdgeOptions={{ type: 'campaignThread', animated: false }}
          onInit={(inst) => {
            flowRef.current = inst;
            requestAnimationFrame(() => inst.fitView({ padding: 0.25 }));
          }}
          onNodeClick={(_, node) => {
            setSelectedIds([node.id]);
            selectNode(node.id);
          }}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={clearSelection}
          selectionOnDrag
          panOnDrag={[1, 2]}
          selectionKeyCode={null}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.15}
          maxZoom={1.5}
          elevateEdgesOnSelect
          proOptions={{ hideAttribution: true }}
          className={classicLayout ? 'bg-transparent' : 'bg-slate-100'}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={classicLayout ? 22 : 24}
            size={1.2}
            color="#cbd5e1"
          />
          {classicLayout ? (
            <>
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  const meta = paletteItem(n.data?.stepType);
                  return meta ? spectrumCategoryAccent(meta.category) : '#94a3b8';
                }}
                maskColor="rgba(241, 245, 249, 0.85)"
              />
            </>
          ) : (
            <>
              <Controls className="!rounded-xl !border-slate-200 !bg-white !shadow-lg [&>button]:!border-slate-200 [&>button]:!bg-white [&>button]:!fill-slate-500 [&>button:hover]:!bg-slate-50" />
              <MiniMap
                className="!rounded-xl !border-slate-200 !bg-white !shadow-lg"
                maskColor="rgba(241, 245, 249, 0.85)"
                nodeColor={(n) => {
                  const meta = paletteItem(n.data?.stepType);
                  return meta ? categoryAccent(meta.category) : '#94a3b8';
                }}
              />
            </>
          )}
        </ReactFlow>

        {!nodes.length && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="max-w-sm rounded-2xl border border-slate-200 bg-white/95 px-8 py-8 text-center shadow-xl backdrop-blur-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100">
                <Sparkles className="h-7 w-7 text-brand-600" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-900">
                {isCampaignWorkflowMode(mode) ? 'Build your campaign workflow' : 'Design your journey'}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {isCampaignWorkflowMode(mode)
                  ? 'Drag from the right dot on one activity to the left dot on the next to connect threads.'
                  : 'Double-click nodes in the library to add wait, email, and decision steps.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {!classicLayout && (
      <aside className={`modern-campaign-inspector flex shrink-0 flex-col border-l border-slate-200 ${sideTab === 'deliveries' ? 'w-[440px]' : 'w-[440px]'}`}>
        {isCampaignWorkflowMode(mode) && workflow.enabled && (
          <div className="flex border-b border-slate-200 bg-slate-50/80">
            {([
              ['activity', 'Activity'],
              ['deliveries', `Deliveries${workflow.deployedDeliveries.length ? ` (${workflow.deployedDeliveries.length})` : ''}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSideTab(key)}
                className={`flex-1 px-3 py-2.5 text-[11px] font-semibold transition ${
                  sideTab === key
                    ? 'border-b-2 border-brand-600 text-brand-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {sideTab === 'deliveries' && isCampaignWorkflowMode(mode) && workflow.enabled ? (
          <CampaignDeliveriesPanel
            tenantId={tenantId}
            environment={environment}
            nodeResults={workflow.nodeResults}
            isFinished={workflow.isFinished}
            completedAt={workflow.completedAt}
          />
        ) : selectedNode ? (
          <CampaignNodeConfigPanel
            node={selectedNode}
            tenantId={tenantId}
            environment={environment}
            mode={mode}
            variant="light"
            populationResult={previewResult}
            personalizationFields={templatePersonalization.fields}
            personalizationSample={templatePersonalization.sample}
            previewLabel={previewLabel}
            runPending={workflow.runMutation.isPending}
            canRun={workflow.canRunNode(selectedNode.id)}
            onRun={() => workflow.runNode(selectedNode.id)}
            onUpdate={updateNode}
            onDelete={deleteNode}
            onDuplicate={duplicateNode}
          />
        ) : threadPreview ? (
          <ThreadTransitionPanel
            sourceLabel={threadPreview.sourceLabel}
            targetLabel={threadPreview.targetLabel}
            sourceHandle={threadPreview.sourceHandle}
            result={previewResult}
            loading={workflow.runMutation.isPending}
            isFinished={workflow.isFinished}
            onClose={clearSelection}
          />
        ) : selectedIds.length > 1 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-medium text-slate-700">{selectedIds.length} activities selected</p>
            <p className="mt-2 max-w-[220px] text-xs leading-relaxed text-slate-400">
              Delete with Backspace · Copy with Ctrl+C · Duplicate with Ctrl+D
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-medium text-slate-600">Select an activity</p>
            <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-slate-400">
              {isCampaignWorkflowMode(mode)
                ? 'Drag to box-select · right-click a thread to inspect transition data'
                : 'Configure delivery, wait, or rules'}
            </p>
          </div>
        )}
      </aside>
      )}
    </div>
    </CampaignCanvasContext.Provider>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col bg-slate-950">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-[#080b14] px-5 py-3">
          <p className="truncate text-sm font-medium text-white">
            {journeyName ?? (isCampaignWorkflowMode(mode) ? 'Campaign workflow' : 'Journey')}
          </p>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Exit
          </button>
        </header>
        <div className="min-h-0 flex-1">{editor}</div>
      </div>
    );
  }

  return editor;
}

export function BlastCampaignCanvas(props: BlastCampaignCanvasProps) {
  return (
    <ReactFlowProvider>
      <BlastCampaignCanvasEditor {...props} />
    </ReactFlowProvider>
  );
}
