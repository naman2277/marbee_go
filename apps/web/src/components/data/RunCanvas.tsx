import { useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { parseWorkflowGraph, type WorkflowNodeData, type PipelineNodeRunState } from '@/lib/data-jobs';
import { dataJobNodeTypes } from '@/components/data-jobs/DataJobStepNode';

export type RunNodeOverlay = { state: PipelineNodeRunState; in: number; out: number; failed: number };

/**
 * Read-only pipeline canvas for run replay / live view. No palette, no toolbar,
 * no editing — it renders the pinned graph with per-node run state overlaid.
 */
function RunCanvasInner({
  workflowJson,
  overlay,
  selectedNodeId,
  onSelectNode,
}: {
  workflowJson: unknown;
  overlay: Map<string, RunNodeOverlay>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
}) {
  const graph = useMemo(() => parseWorkflowGraph(workflowJson), [workflowJson]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph.nodes, graph.edges, setNodes, setEdges]);

  const decorated = useMemo(
    () =>
      nodes.map((n) => {
        const o = overlay.get(n.id);
        return {
          ...n,
          selected: n.id === selectedNodeId,
          draggable: false,
          connectable: false,
          data: {
            ...n.data,
            runState: o?.state ?? 'idle',
            runCounts: o ? { in: o.in, out: o.out, failed: o.failed } : undefined,
          },
        } as Node<WorkflowNodeData>;
      }),
    [nodes, overlay, selectedNodeId],
  );

  const litEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const src = overlay.get(e.source)?.state;
        const active = src === 'running' || src === 'retrying';
        const done = src === 'succeeded';
        return {
          ...e,
          animated: active,
          style: {
            stroke: active ? '#3b82f6' : done ? '#10b981' : '#475569',
            strokeWidth: 2,
          },
        };
      }),
    [edges, overlay],
  );

  return (
    <div className="h-[520px] overflow-hidden rounded-2xl border border-slate-800 bg-[#0c0f1a]">
      <ReactFlow
        nodes={decorated}
        edges={litEdges}
        nodeTypes={dataJobNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelectNode?.(node.id)}
        onPaneClick={() => onSelectNode?.(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        className="bg-[#0c0f1a]"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
        <Controls showInteractive={false} className="!bg-slate-900 !border-slate-700" />
        <MiniMap pannable zoomable className="!bg-slate-900" maskColor="rgba(12,15,26,0.7)" />
      </ReactFlow>
    </div>
  );
}

export function RunCanvas(props: Parameters<typeof RunCanvasInner>[0]) {
  return (
    <ReactFlowProvider>
      <RunCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
