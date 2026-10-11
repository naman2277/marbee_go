import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { AlertCircle, ArrowDownRight, ArrowUpRight, X } from 'lucide-react';
import { PageHeader, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { neighbours, useLineage, type LineageGraph, type LineageNode } from '@/lib/lineage';
import { DataMonitorTabs } from '@/components/data/DataMonitorTabs';

const KIND_DOT: Record<string, string> = {
  schema: 'bg-indigo-500',
  pipeline: 'bg-violet-500',
  connector: 'bg-emerald-500',
};

const EMPTY_GRAPH: LineageGraph = { nodes: [], edges: [] };

function LineageInner() {
  const { tenantId, environment } = useAuth();
  const { data, isLoading, isError, refetch } = useLineage(tenantId, environment);
  const [selected, setSelected] = useState<LineageNode | null>(null);

  const graph = data ?? EMPTY_GRAPH;
  const nbrs = useMemo(() => (selected ? neighbours(graph, selected.id) : null), [selected, graph]);

  if (isError) {
    return (
      <Card className="flex items-center gap-3 p-6 text-sm text-red-700">
        <AlertCircle className="h-5 w-5" />
        <button type="button" onClick={() => refetch()} className="underline">
          Retry
        </button>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Data Lineage"
        description="How datasets connect through pipelines and connectors. Built from their definitions."
      />

      <DataMonitorTabs active="lineage" />

      <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
        {(['schema', 'pipeline', 'connector'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 capitalize">
            <span className={cn('h-2 w-2 rounded-full', KIND_DOT[k])} />
            {k}
          </span>
        ))}
      </div>

      <div className="relative h-[600px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Building lineage…</div>
        ) : graph.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No lineage yet — connect a pipeline or connector to a schema.
          </div>
        ) : (
          <ReactFlow
            nodes={graph.nodes.map((n) => ({ ...n, selected: n.id === selected?.id }))}
            edges={graph.edges}
            onNodeClick={(_, n) => setSelected(n as LineageNode)}
            onPaneClick={() => setSelected(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={null}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        )}

        {selected && nbrs && (
          <div className="absolute right-3 top-3 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{selected.data.kind}</p>
                <Link to={selected.data.route} className="font-semibold text-slate-900 hover:text-brand-700">
                  {selected.data.label}
                </Link>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <NeighbourList title="Upstream" icon={<ArrowUpRight className="h-3 w-3" />} items={nbrs.upstream} />
            <NeighbourList title="Downstream" icon={<ArrowDownRight className="h-3 w-3" />} items={nbrs.downstream} />
          </div>
        )}
      </div>
    </div>
  );
}

function NeighbourList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: LineageNode[];
}) {
  return (
    <div className="mt-3">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">none</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((n) => (
            <li key={n.id}>
              <Link to={n.data.route} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-brand-700">
                <span className={cn('h-1.5 w-1.5 rounded-full', KIND_DOT[n.data.kind])} />
                {n.data.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LineagePage() {
  return (
    <ReactFlowProvider>
      <LineageInner />
    </ReactFlowProvider>
  );
}
