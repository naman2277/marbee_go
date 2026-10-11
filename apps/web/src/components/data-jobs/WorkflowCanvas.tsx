import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type Node,
  type Edge,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Moon, Sparkles, Sun } from 'lucide-react';
import {
  autoLayoutGraph,
  categoryAccent,
  defaultConfigForType,
  parseWorkflowGraph,
  paletteItem,
  validateWorkflow,
  type WorkflowNodeData,
} from '@/lib/data-jobs';
import { dataJobNodeTypes } from '@/components/data-jobs/DataJobStepNode';
import { WorkflowNodeConfigPanel } from '@/components/data-jobs/WorkflowNodeConfigPanel';
import { WorkflowPalette } from '@/components/data-jobs/WorkflowPalette';
import { WorkflowToolbar } from '@/components/data-jobs/WorkflowToolbar';
import { useWorkflowKeyboard } from '@/components/data-jobs/useWorkflowKeyboard';

export type WorkflowCanvasChromeProps = {
  jobName: string;
  savePending?: boolean;
  runPending?: boolean;
  publishPending?: boolean;
  saveMsg?: string;
  runMsg?: string;
  onSave: () => void;
  onRun: () => void;
  onPublish?: () => void;
  onBack?: () => void;
};

type Props = {
  workflowJson: unknown;
  tenantId: string;
  environment: string;
  onGraphChange?: (nodes: Node<WorkflowNodeData>[], edges: Edge[]) => void;
  /** Notified when the selected node changes (for run-until / inspector wiring). */
  onSelectNode?: (nodeId: string | null) => void;
  /** Preview mode + run-until-this-node, invoked from the config panel. */
  onPreviewNode?: (nodeId: string) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  chrome?: WorkflowCanvasChromeProps;
};

function WorkflowCanvasEditor({
  workflowJson,
  tenantId,
  environment,
  onGraphChange,
  onSelectNode,
  onPreviewNode,
  fullscreen,
  onToggleFullscreen,
  chrome,
}: Props) {
  const initial = useMemo(() => parseWorkflowGraph(workflowJson), [workflowJson]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasDark, setCanvasDark] = useState(() => {
    try {
      return localStorage.getItem('marbee_canvas_theme') !== 'light';
    } catch {
      return true;
    }
  });
  const toggleCanvasTheme = useCallback(() => {
    setCanvasDark((d) => {
      const next = !d;
      try {
        localStorage.setItem('marbee_canvas_theme', next ? 'dark' : 'light');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [validateFlash, setValidateFlash] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial.nodes, initial.edges, setNodes, setEdges]);

  useEffect(() => {
    onGraphChange?.(nodes, edges);
  }, [nodes, edges, onGraphChange]);

  useEffect(() => {
    onSelectNode?.(selectedId);
  }, [selectedId, onSelectNode]);

  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [fullscreen]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const flowNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...connection, animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } },
          eds,
        ),
      );
    },
    [setEdges],
  );

  // Typed-port rules: no self-loop, nothing feeds a trigger, no duplicate edge.
  const isValidConnection = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      const target = nodes.find((n) => n.id === c.target);
      if (target?.data.stepType.startsWith('trigger')) return false;
      return !edges.some(
        (e) => e.source === c.source && e.target === c.target && (e.sourceHandle ?? null) === (c.sourceHandle ?? null),
      );
    },
    [nodes, edges],
  );

  const addNodeAt = useCallback(
    (stepType: string, position?: { x: number; y: number }) => {
      const meta = paletteItem(stepType);
      const id = crypto.randomUUID();
      const pos = position ?? {
        x: 180 + (nodes.length % 4) * 80,
        y: 140 + Math.floor(nodes.length / 4) * 100,
      };
      const newNode: Node<WorkflowNodeData> = {
        id,
        type: 'dataJobStep',
        position: pos,
        data: {
          label: meta?.label ?? stepType,
          stepType,
          config: defaultConfigForType(stepType),
          scale: 1,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedId(id);
    },
    [nodes.length, setNodes],
  );

  const addNodeAtViewportCenter = useCallback(
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

  const updateNode = useCallback((nodeId: string, patch: Partial<WorkflowNodeData>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch, config: patch.config ?? n.data.config } } : n,
      ),
    );
  }, [setNodes]);

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedId((id) => (id === nodeId ? null : id));
    },
    [setNodes, setEdges],
  );

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
          data: { ...source.data, label: `${source.data.label} (copy)` },
        },
      ]);
      setSelectedId(id);
    },
    [nodes, setNodes],
  );

  const pasteNode = useCallback(
    (node: Node<WorkflowNodeData>) => {
      setNodes((nds) => [...nds, node]);
      setSelectedId(node.id);
    },
    [setNodes],
  );

  useWorkflowKeyboard({
    containerRef,
    selectedId,
    selectedNode,
    onDelete: deleteNode,
    onDuplicate: duplicateNode,
    onPaste: pasteNode,
    onDeselect: () => setSelectedId(null),
    onToggleFullscreen,
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

      if (selectedId) {
        groupIds.add(selectedId);
        getDownstream(selectedId).forEach((id) => groupIds.add(id));
      }

      const posMap = new Map<string, { x: number; y: number }>();
      nodes.forEach((nd) => {
        if (groupIds.has(nd.id)) {
          posMap.set(nd.id, { x: nd.position.x, y: nd.position.y });
        }
      });
      dragStartPosRef.current = posMap;
    },
    [nodes, edges, selectedId],
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
    event.dataTransfer.setData('application/data-job-node', stepType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const stepType = event.dataTransfer.getData('application/data-job-node');
    if (!stepType || !reactFlowWrapper.current || !flowRef.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = flowRef.current.screenToFlowPosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    addNodeAt(stepType, position);
  };

  const handleAutoLayout = () => {
    setNodes((nds) => autoLayoutGraph(nds, edges));
    setTimeout(() => flowRef.current?.fitView({ padding: 0.2 }), 50);
  };

  const handleFitView = () => flowRef.current?.fitView({ padding: 0.2 });

  const handleValidate = () => {
    const result = validateWorkflow(nodes, edges);
    setValidationMessages(result.messages);
    setValidateFlash(true);
    setTimeout(() => setValidateFlash(false), 2000);
  };

  const editor = (
    <div
      ref={containerRef}
      tabIndex={0}
      className={`flex overflow-hidden outline-none ${
        fullscreen
          ? 'h-full w-full'
          : `h-full min-h-[calc(100vh-12rem)] rounded-2xl border shadow-2xl ${canvasDark ? 'border-slate-800' : 'border-slate-200'}`
      }`}
      onMouseDown={() => containerRef.current?.focus()}
    >
      <WorkflowPalette onAddNode={addNodeAtViewportCenter} onDragStart={onDragStart} />

      <div
        ref={reactFlowWrapper}
        className={`relative min-w-0 flex-1 ${canvasDark ? 'bg-[#0c0f1a]' : 'bg-slate-50'}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={onDrop}
      >
        <WorkflowToolbar
          nodeCount={nodes.length}
          edgeCount={edges.length}
          validationMessages={validationMessages}
          fullscreen={fullscreen}
          onAutoLayout={handleAutoLayout}
          onFitView={handleFitView}
          onValidate={handleValidate}
          onToggleFullscreen={onToggleFullscreen}
        />

        <button
          type="button"
          onClick={toggleCanvasTheme}
          title={canvasDark ? 'Light canvas' : 'Dark canvas'}
          className={`absolute right-3 top-3 z-20 rounded-lg border p-2 shadow-md transition-colors ${
            canvasDark
              ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {canvasDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {validateFlash && validationMessages.length > 0 && (
          <div className="absolute bottom-16 left-1/2 z-20 max-w-md -translate-x-1/2 rounded-xl border border-amber-500/30 bg-amber-950/90 px-4 py-3 shadow-xl backdrop-blur">
            <ul className="space-y-1 text-xs text-amber-200">
              {validationMessages.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
          </div>
        )}

        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          nodeTypes={dataJobNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => {
            // Don't deselect when email studio or template explorer is open
            if (document.body.getAttribute('data-email-studio-active') === 'true') return;
            setSelectedId(null);
          }}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          defaultEdgeOptions={{ animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } }}
          proOptions={{ hideAttribution: true }}
          className={canvasDark ? 'bg-[#0c0f1a]' : 'bg-slate-50'}
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={canvasDark ? '#1e293b' : '#cbd5e1'} />
          <Controls
            className={
              canvasDark
                ? '!rounded-xl !border-slate-700 !bg-slate-900/90 !shadow-xl [&>button]:!border-slate-700 [&>button]:!bg-slate-800 [&>button]:!fill-slate-300 [&>button:hover]:!bg-slate-700'
                : '!rounded-xl !border-slate-200 !bg-white !shadow-md [&>button]:!border-slate-200 [&>button]:!bg-white [&>button]:!fill-slate-600 [&>button:hover]:!bg-slate-100'
            }
          />
          <MiniMap
            className={
              canvasDark
                ? '!rounded-xl !border-slate-700 !bg-slate-900/90 !shadow-xl'
                : '!rounded-xl !border-slate-200 !bg-white !shadow-md'
            }
            maskColor={canvasDark ? 'rgba(12, 15, 26, 0.75)' : 'rgba(226, 232, 240, 0.7)'}
            nodeColor={(n) => {
              const meta = paletteItem((n.data as WorkflowNodeData)?.stepType);
              return meta ? categoryAccent(meta.category) : '#64748b';
            }}
          />
        </ReactFlow>

        {!nodes.length && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`max-w-sm rounded-2xl border px-8 py-8 text-center shadow-2xl backdrop-blur-md ${
                canvasDark ? 'border-slate-700/50 bg-slate-900/80' : 'border-slate-200 bg-white/90'
              }`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20">
                <Sparkles className="h-7 w-7 text-indigo-400" />
              </div>
              <p className={`mt-4 text-base font-semibold ${canvasDark ? 'text-white' : 'text-slate-900'}`}>
                Design your data pipeline
              </p>
              <p className={`mt-2 text-sm leading-relaxed ${canvasDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Double-click nodes in the library to add them — scroll over a node to resize it.
              </p>
            </div>
          </div>
        )}
      </div>

      <aside className="flex w-[360px] shrink-0 flex-col border-l border-slate-200 bg-white">
        {selectedNode ? (
          <WorkflowNodeConfigPanel
            node={selectedNode}
            tenantId={tenantId}
            environment={environment}
            onUpdate={updateNode}
            onDelete={deleteNode}
            onDuplicate={duplicateNode}
            onToggleDisabled={() => updateNode(selectedNode.id, { disabled: !selectedNode.data.disabled })}
            onPreview={onPreviewNode ? () => onPreviewNode(selectedNode.id) : undefined}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 p-5">
              <Sparkles className="h-8 w-8 text-indigo-500" />
            </div>
            <p className="mt-5 text-base font-semibold text-slate-800">Node inspector</p>
            <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-slate-500">
              Select a node to configure its settings.
            </p>
          </div>
        )}
      </aside>
    </div>
  );

  if (fullscreen && chrome) {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col bg-slate-950">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {chrome.onBack && (
              <button
                type="button"
                onClick={chrome.onBack}
                className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ← Back
              </button>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{chrome.jobName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {chrome.saveMsg && <span className="text-xs text-emerald-400">{chrome.saveMsg}</span>}
            {chrome.runMsg && <span className="text-xs text-emerald-400">{chrome.runMsg}</span>}
            <button
              type="button"
              onClick={chrome.onSave}
              disabled={chrome.savePending}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Save
            </button>
            {chrome.onPublish && (
              <button
                type="button"
                onClick={chrome.onPublish}
                disabled={chrome.publishPending}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                Publish
              </button>
            )}
            <button
              type="button"
              onClick={chrome.onRun}
              disabled={chrome.runPending}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Run now
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1">{editor}</div>
      </div>
    );
  }

  return editor;
}

function WorkflowCanvasInner(props: Props) {
  return <WorkflowCanvasEditor {...props} />;
}

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export function useWorkflowGraphRef() {
  const graphRef = useRef<{ nodes: Node<WorkflowNodeData>[], edges: Edge[] }>({ nodes: [], edges: [] });
  const onGraphChange = useCallback((nodes: Node<WorkflowNodeData>[], edges: Edge[]) => {
    graphRef.current = { nodes, edges };
  }, []);
  return { graphRef, onGraphChange };
}
