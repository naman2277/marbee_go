import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ArrowRight,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Info,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Move,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Table2,
  Target,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import {
  buildErdGraph,
  buildErdSchemaMeta,
  edgeHandles,
  getRelatedSchemaSlugs,
  getRelationshipsForSlug,
  type ErdSchemaInput,
  type ErdSchemaMeta,
} from '@/lib/schema-erd';
import { erdNodeTypes, type ErdTableNodeData } from '@/components/schemas/ErdTableNode';
import { erdEdgeTypes } from '@/components/schemas/ErdRelationEdge';
import {
  getSchemaStatusBadgeVariant,
  getSchemaStatusLabel,
  getSchemaTypeBadgeVariant,
  getSchemaTypeLabel,
} from '@/lib/schema-labels';

type Props = {
  schemas?: ErdSchemaInput[];
  highlightSlug?: string;
  compact?: boolean;
};

type ViewMode = 'focused' | 'all';

type CanvasToolbarProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onFitView: () => void;
  onResetLayout: () => void;
  compactCards: boolean;
  onToggleCompactCards: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
  visibleCount: number;
  edgeCount: number;
  canFocus: boolean;
};

function CanvasToolbar({
  viewMode,
  onViewModeChange,
  isFullscreen,
  onToggleFullscreen,
  onFitView,
  onResetLayout,
  compactCards,
  onToggleCompactCards,
  showInspector,
  onToggleInspector,
  visibleCount,
  edgeCount,
  canFocus,
}: CanvasToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            disabled={!canFocus}
            onClick={() => onViewModeChange('focused')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'focused'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 disabled:opacity-40'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
            Focused
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('all')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'all'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            All tables
          </button>
        </div>
        <span className="hidden text-xs text-slate-500 sm:inline">
          {visibleCount} tables · {edgeCount} links
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onFitView}>
          <Crosshair className="h-3.5 w-3.5" />
          <span className="ml-1.5 hidden sm:inline">Fit</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onResetLayout}>
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="ml-1.5 hidden sm:inline">Reset</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleCompactCards}>
          {compactCards ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="ml-1.5 hidden sm:inline">{compactCards ? 'Compact' : 'Detailed'}</span>
        </Button>
        {isFullscreen && (
          <Button variant="ghost" size="sm" onClick={onToggleInspector}>
            {showInspector ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onToggleFullscreen}>
          {isFullscreen ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" />
              <span className="ml-1.5">Exit</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="ml-1.5">Fullscreen</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function RelationshipCanvas({
  schemas,
  schemaMeta,
  highlightSlug,
  compact,
  fullscreen,
  viewMode,
  compactCards,
  layoutKey,
  selectedSlug,
  onSelectSlug,
  onOpenSlug,
  onRegisterFitView,
}: {
  schemas?: ErdSchemaInput[];
  schemaMeta: ErdSchemaMeta[];
  highlightSlug?: string;
  compact?: boolean;
  fullscreen?: boolean;
  viewMode: ViewMode;
  compactCards: boolean;
  layoutKey: number;
  selectedSlug: string | null;
  onSelectSlug: (slug: string) => void;
  onOpenSlug: (slug: string) => void;
  onRegisterFitView: (fn: () => void) => void;
}) {
  const { fitView } = useReactFlow();
  const focusSlug = selectedSlug ?? highlightSlug ?? null;
  const savedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [pinnedEdgeId, setPinnedEdgeId] = useState<string | null>(null);

  const layoutGraph = useMemo(
    () => buildErdGraph(schemas, highlightSlug ?? undefined),
    [schemas, layoutKey, highlightSlug],
  );

  const relatedSlugs = useMemo(() => {
    if (!focusSlug) return null;
    return new Set(getRelatedSchemaSlugs(focusSlug, schemas));
  }, [focusSlug, schemas]);

  const visibleNodes = useMemo(() => {
    if (viewMode === 'focused' && relatedSlugs) {
      return layoutGraph.nodes.filter((n) => relatedSlugs.has(n.slug));
    }
    return layoutGraph.nodes;
  }, [layoutGraph.nodes, viewMode, relatedSlugs]);

  const visibleSlugKey = useMemo(
    () => visibleNodes.map((n) => n.slug).sort().join('|'),
    [visibleNodes],
  );

  const visibleSlugs = useMemo(() => new Set(visibleNodes.map((n) => n.slug)), [visibleNodes]);

  const visibleEdges = useMemo(
    () => layoutGraph.edges.filter((e) => visibleSlugs.has(e.from) && visibleSlugs.has(e.to)),
    [layoutGraph.edges, visibleSlugs],
  );

  const metaBySlug = useMemo(() => new Map(schemaMeta.map((m) => [m.slug, m])), [schemaMeta]);

  const makeNode = useCallback(
    (s: (typeof visibleNodes)[0], position: { x: number; y: number }): Node<ErdTableNodeData> => {
      const meta = metaBySlug.get(s.slug);
      const dimmed = viewMode === 'all' && relatedSlugs != null && !relatedSlugs.has(s.slug);
      const selected = selectedSlug === s.slug;
      const highlighted = focusSlug === s.slug;
      const fkCount = meta?.fields?.filter((f) => f.fk).length ?? 0;

      return {
        id: s.slug,
        type: 'erdTable',
        position,
        data: {
          label: meta?.name ?? s.label,
          table: meta?.table_name ?? s.table,
          slug: s.slug,
          fields: meta?.fields ?? [],
          fieldCount: meta?.fieldCount ?? 0,
          selected,
          dimmed,
          highlighted,
          compactView: compactCards,
          fkCount,
        },
      };
    },
    [metaBySlug, viewMode, relatedSlugs, selectedSlug, focusSlug, compactCards],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ErdTableNodeData>>([]);

  useEffect(() => {
    savedPositionsRef.current = {};
  }, [layoutKey]);

  useEffect(() => {
    setNodes((prev) => {
      const prevPos = new Map(prev.map((n) => [n.id, n.position]));
      return visibleNodes.map((s) => {
        const defaultPos = { x: s.x, y: s.y };
        const position =
          savedPositionsRef.current[s.slug] ?? prevPos.get(s.slug) ?? defaultPos;
        return makeNode(s, position);
      });
    });
  }, [visibleSlugKey, layoutKey, visibleNodes, makeNode, setNodes]);

  const positionBySlug = useMemo(() => new Map(nodes.map((n) => [n.id, n.position])), [nodes]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    savedPositionsRef.current[node.id] = node.position;
  }, []);

  const onToggleEdgePin = useCallback((edgeId: string) => {
    setPinnedEdgeId((current) => (current === edgeId ? null : edgeId));
  }, []);

  const edges: Edge[] = useMemo(
    () =>
      visibleEdges.map((rel) => {
        const active =
          viewMode === 'focused' ||
          relatedSlugs == null ||
          (relatedSlugs.has(rel.from) && relatedSlugs.has(rel.to));

        const sourcePos = positionBySlug.get(rel.from) ?? { x: 0, y: 0 };
        const targetPos = positionBySlug.get(rel.to) ?? { x: 0, y: 0 };
        const handles = edgeHandles(sourcePos, targetPos);
        const isPinned = pinnedEdgeId === rel.id;

        return {
          id: rel.id,
          source: rel.from,
          target: rel.to,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'erdRelation',
          selected: isPinned,
          data: {
            join: rel.join,
            active,
            isPinned,
            onTogglePin: onToggleEdgePin,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: isPinned ? '#4338ca' : active ? '#4f46e5' : '#cbd5e1',
          },
          style: {
            stroke: isPinned ? '#4338ca' : active ? '#4f46e5' : '#cbd5e1',
            strokeWidth: isPinned ? 3 : active ? 2 : 1,
            opacity: active ? 1 : 0.35,
          },
        };
      }),
    [visibleEdges, viewMode, relatedSlugs, positionBySlug, pinnedEdgeId, onToggleEdgePin],
  );

  const runFitView = useCallback(() => {
    const targetIds =
      viewMode === 'focused' && relatedSlugs
        ? nodes.filter((n) => relatedSlugs.has(n.id)).map((n) => ({ id: n.id }))
        : nodes.map((n) => ({ id: n.id }));

    if (!targetIds.length) return;

    fitView({
      nodes: targetIds,
      padding: fullscreen ? 0.18 : compact ? 0.28 : 0.2,
      duration: 400,
      maxZoom: fullscreen ? 1.2 : 1,
    });
  }, [fitView, fullscreen, compact, viewMode, relatedSlugs, nodes]);

  useEffect(() => {
    onRegisterFitView(runFitView);
  }, [onRegisterFitView, runFitView]);

  // Auto-fit only when view mode, fullscreen, or layout reset changes — not on drag/select
  useEffect(() => {
    const t = window.setTimeout(runFitView, 180);
    return () => window.clearTimeout(t);
  }, [layoutKey, viewMode, fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  const canvasHeight = fullscreen ? 'h-full min-h-[420px] flex-1' : compact ? 'h-[480px]' : 'h-[600px]';

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 ${canvasHeight}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={erdNodeTypes}
        edgeTypes={erdEdgeTypes}
        nodeDragHandle=".erd-node-drag-handle"
        onNodeClick={(_, node) => onSelectSlug(node.id)}
        onNodeDoubleClick={(_, node) => onOpenSlug(node.id)}
        onPaneClick={() => setPinnedEdgeId(null)}
        minZoom={0.15}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnScroll
        panOnDrag
        selectionOnDrag={false}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'erdRelation' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d1d5db" />
        <Controls showInteractive={false} className="!rounded-xl !border-slate-200 !shadow-md" />
        <MiniMap
          pannable
          zoomable
          className="!rounded-xl !border !border-slate-200 !bg-white/90 !shadow-md"
          nodeColor={(node) => (node.data?.highlighted ? '#4f46e5' : '#a5b4fc')}
          maskColor="rgba(241, 245, 249, 0.75)"
        />
      </ReactFlow>

      <div className="pointer-events-none absolute bottom-3 left-3 max-w-md rounded-lg border border-slate-200/80 bg-white/95 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur-sm">
        <span className="inline-flex items-center gap-1">
          <Move className="h-3 w-3" />
          Drag table headers to reposition
        </span>
        <span className="mx-2 text-slate-300">·</span>
        <span className="inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          Click <strong className="font-medium text-slate-600">ⓘ</strong> on a line for keys & SQL
        </span>
        <span className="mx-2 text-slate-300">·</span>
        <span>Layout stays fixed until you click Fit or Reset</span>
      </div>
    </div>
  );
}

function SchemaInspector({
  meta,
  schemas,
  onOpen,
  onOpenRelated,
}: {
  meta: ErdSchemaMeta;
  schemas?: ErdSchemaInput[];
  onOpen: () => void;
  onOpenRelated: (slug: string) => void;
}) {
  const relationships = getRelationshipsForSlug(meta.slug, schemas);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{meta.name ?? meta.slug}</h3>
            <p className="mt-0.5 font-mono text-xs text-slate-400">{meta.table_name ?? meta.slug}</p>
          </div>
          <Button size="sm" onClick={onOpen}>
            Open
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={getSchemaTypeBadgeVariant(meta.is_system ?? true)}>
            {getSchemaTypeLabel(meta.is_system ?? true)}
          </Badge>
          <Badge variant={getSchemaStatusBadgeVariant(meta.is_system ?? true, meta.status ?? 'active')}>
            {getSchemaStatusLabel(meta.is_system ?? true, meta.status ?? 'active')}
          </Badge>
          <Badge variant="default">{meta.fieldCount ?? 0} fields</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Table2 className="h-3.5 w-3.5" />
            Table definition
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Column</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {(meta.fields ?? []).map((f) => (
                  <tr key={f.name} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-mono text-slate-800">{f.name}</td>
                    <td className="px-3 py-2 text-slate-500">{f.type}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {f.pk && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">PK</span>}
                        {f.fk && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">FK</span>}
                        {f.pii && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">PII</span>}
                        {!f.pk && !f.fk && !f.pii && <span className="text-slate-300">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {relationships.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <GitBranch className="h-3.5 w-3.5" />
              Relationships ({relationships.length})
            </div>
            <div className="space-y-2">
              {relationships.map((rel) => (
                <button
                  key={`${rel.direction}-${rel.relatedSlug}-${rel.field}`}
                  type="button"
                  onClick={() => onOpenRelated(rel.relatedSlug)}
                  className="group flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/50"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${rel.direction === 'outbound' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                    <ArrowRight className={`h-4 w-4 ${rel.direction === 'inbound' ? 'rotate-180' : ''}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-700">
                      {rel.direction === 'outbound' ? 'References' : 'Referenced by'} {rel.relatedLabel}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {rel.join
                        ? `${rel.join.sourceTable}.${rel.join.sourceColumn} → ${rel.join.targetTable}.${rel.join.targetColumn}`
                        : `${rel.field} · ${rel.relatedTable}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExplorerInner({ schemas, highlightSlug, compact }: Props) {
  const navigate = useNavigate();
  const graph = useMemo(() => buildErdGraph(schemas, highlightSlug), [schemas, highlightSlug]);
  const schemaMeta = useMemo(() => buildErdSchemaMeta(schemas), [schemas]);
  const fitViewFnRef = useRef<(() => void) | null>(null);

  const defaultSlug =
    highlightSlug && graph.nodes.some((n) => n.slug === highlightSlug)
      ? highlightSlug
      : graph.nodes.find((n) => n.slug === 'customer')?.slug ?? graph.nodes[0]?.slug ?? null;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(defaultSlug);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(highlightSlug ? 'focused' : 'all');
  const [compactCards, setCompactCards] = useState(true);
  const [layoutKey, setLayoutKey] = useState(0);

  useEffect(() => {
    if (highlightSlug && graph.nodes.some((n) => n.slug === highlightSlug)) {
      setSelectedSlug(highlightSlug);
      setViewMode('focused');
    }
  }, [highlightSlug, graph.nodes]);

  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

  const selectedMeta = schemaMeta.find((m) => m.slug === selectedSlug) ?? schemaMeta[0];
  const focusSlug = selectedSlug ?? highlightSlug ?? null;
  const relatedSlugs = focusSlug ? new Set(getRelatedSchemaSlugs(focusSlug, schemas)) : null;
  const visibleCount =
    viewMode === 'focused' && relatedSlugs
      ? graph.nodes.filter((n) => relatedSlugs.has(n.slug)).length
      : graph.nodes.length;
  const visibleEdgeCount =
    viewMode === 'focused' && relatedSlugs
      ? graph.edges.filter((e) => relatedSlugs.has(e.from) && relatedSlugs.has(e.to)).length
      : graph.edges.length;

  const openSchema = (slug: string) => navigate(`/data/schemas/${slug}`);

  const toolbar = (
    <CanvasToolbar
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      isFullscreen={isFullscreen}
      onToggleFullscreen={() => setIsFullscreen((v) => !v)}
      onFitView={() => fitViewFnRef.current?.()}
      onResetLayout={() => setLayoutKey((k) => k + 1)}
      compactCards={compactCards}
      onToggleCompactCards={() => setCompactCards((v) => !v)}
      showInspector={showInspector}
      onToggleInspector={() => setShowInspector((v) => !v)}
      visibleCount={visibleCount}
      edgeCount={visibleEdgeCount}
      canFocus={Boolean(focusSlug)}
    />
  );

  const canvas = (
    <RelationshipCanvas
      schemas={schemas}
      schemaMeta={schemaMeta}
      highlightSlug={highlightSlug}
      compact={compact}
      fullscreen={isFullscreen}
      viewMode={viewMode}
      compactCards={compactCards}
      layoutKey={layoutKey}
      selectedSlug={selectedSlug}
      onSelectSlug={setSelectedSlug}
      onOpenSlug={openSchema}
      onRegisterFitView={(fn) => {
        fitViewFnRef.current = fn;
      }}
    />
  );

  const inspector = selectedMeta ? (
    <SchemaInspector
      meta={selectedMeta}
      schemas={schemas}
      onOpen={() => openSchema(selectedMeta.slug)}
      onOpenRelated={setSelectedSlug}
    />
  ) : null;

  const shellClass = isFullscreen
    ? 'fixed inset-0 z-[200] flex flex-col bg-slate-100'
    : 'space-y-3';

  return (
    <div className={shellClass}>
      <div className={`${isFullscreen ? 'shrink-0 border-b border-slate-200 bg-white px-5 py-3' : ''}`}>
        {!isFullscreen && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {highlightSlug ? `Relationships · ${selectedMeta?.name ?? highlightSlug}` : 'Data model map'}
              </h3>
              <p className="text-sm text-slate-500">Drag tables to arrange · Open fullscreen for more space</p>
            </div>
            {selectedSlug && (
              <Button variant="secondary" size="sm" onClick={() => openSchema(selectedSlug)}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open schema
              </Button>
            )}
          </div>
        )}

        {isFullscreen && (
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Schema relationship map</h2>
              <p className="text-sm text-slate-500">{selectedMeta?.name ?? 'Select a table'} · Esc to exit</p>
            </div>
          </div>
        )}

        {toolbar}
      </div>

      <div
        className={
          isFullscreen
            ? 'flex min-h-0 flex-1 gap-0 p-4'
            : `grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-[1fr_340px]'}`
        }
      >
        <div className={isFullscreen ? 'flex min-w-0 flex-1 flex-col' : ''}>{canvas}</div>

        {inspector && showInspector && !compact && (
          <div
            className={
              isFullscreen
                ? 'hidden w-[380px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:flex lg:flex-col'
                : 'hidden overflow-hidden rounded-xl border border-slate-200 shadow-sm xl:flex xl:max-h-[600px] xl:flex-col'
            }
          >
            {inspector}
          </div>
        )}
      </div>

      {compact && inspector && !isFullscreen && (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">{inspector}</div>
      )}
    </div>
  );
}

export function SchemaRelationshipExplorer(props: Props) {
  return (
    <ReactFlowProvider>
      <ExplorerInner {...props} />
    </ReactFlowProvider>
  );
}

/** @deprecated Use SchemaRelationshipExplorer */
export function SchemaErdDiagram(props: Props) {
  return <SchemaRelationshipExplorer {...props} />;
}
