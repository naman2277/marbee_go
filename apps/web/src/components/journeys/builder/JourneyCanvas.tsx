import { useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
  type XYPosition,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { LayoutGrid } from 'lucide-react';
import type { CampaignNodeData } from '@/lib/campaign-graph';
import { paletteItem } from '@/lib/campaign-nodes';
import { journeyActivityDef } from '@/lib/journey-builder';
import {
  JourneyBuilderCanvasContext,
  type JourneyCanvasApi,
} from './JourneyBuilderCanvasContext';
import { JourneyActivityNode } from './JourneyActivityNode';
import { JourneyInsertEdge } from './JourneyInsertEdge';

export const JOURNEY_DND_MIME = 'application/journey-activity';

// Stable references — React Flow resets internal state when these change identity.
const NODE_TYPES = { journeyActivity: JourneyActivityNode };
const EDGE_TYPES = { journeyEdge: JourneyInsertEdge };
const DEFAULT_EDGE_OPTIONS = { type: 'journeyEdge' as const };
const FIT_VIEW_OPTIONS = { padding: 0.25 };
const DELETE_KEYS = ['Backspace', 'Delete'];
const CONNECTION_LINE_STYLE = { stroke: '#6366f1', strokeWidth: 2 };
const PRO_OPTIONS = { hideAttribution: true };

type Props = {
  nodes: Node<CampaignNodeData>[];
  edges: Edge[];
  api: JourneyCanvasApi;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onAddNode: (stepType: string, position?: XYPosition) => void;
  onAutoLayout: () => void;
  registerFitView?: (fn: () => void) => void;
};

function CanvasInner({
  nodes,
  edges,
  api,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onAddNode,
  onAutoLayout,
  registerFitView,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const rf = useReactFlow();

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const stepType = event.dataTransfer.getData(JOURNEY_DND_MIME);
      if (!stepType) return;
      const pos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onAddNode(stepType, pos);
    },
    [rf, onAddNode],
  );

  const minimapNodeColor = useCallback((n: Node) => {
    const stepType = (n.data as CampaignNodeData)?.stepType;
    return journeyActivityDef(stepType)?.accent ?? paletteItem(stepType)?.accent ?? '#94a3b8';
  }, []);

  return (
    <JourneyBuilderCanvasContext.Provider value={api}>
      <div
        ref={wrapperRef}
        className="relative min-w-0 flex-1 bg-slate-100"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={onDrop}
      >
        <button
          type="button"
          onClick={onAutoLayout}
          title="Auto layout"
          className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Tidy up
        </button>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(inst) => {
            flowRef.current = inst;
            registerFitView?.(() => inst.fitView({ padding: 0.25, duration: 300 }));
            requestAnimationFrame(() => inst.fitView({ padding: 0.25 }));
          }}
          onNodeClick={(_, node) => api.onSelectNode(node.id)}
          onPaneClick={() => api.onSelectNode(null)}
          onNodesDelete={(deleted) => deleted.forEach((n) => api.onDeleteNode(n.id))}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          connectionLineStyle={CONNECTION_LINE_STYLE}
          connectionRadius={40}
          deleteKeyCode={DELETE_KEYS}
          multiSelectionKeyCode="Shift"
          minZoom={0.2}
          maxZoom={1.5}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          proOptions={PRO_OPTIONS}
          className="bg-slate-100"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#cbd5e1" />
          <Controls
            showInteractive={false}
            className="!rounded-lg !border !border-slate-200 !bg-white !shadow-sm"
          />
          <MiniMap
            pannable
            zoomable
            className="!rounded-lg !border !border-slate-200 !bg-white !shadow-sm"
            maskColor="rgba(241, 245, 249, 0.85)"
            nodeColor={minimapNodeColor}
          />
        </ReactFlow>
      </div>
    </JourneyBuilderCanvasContext.Provider>
  );
}

export function JourneyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
