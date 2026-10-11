import { useQuery } from '@tanstack/react-query';
import type { Edge, Node } from 'reactflow';
import { supabase } from '@/lib/supabase';
import { parseWorkflowGraph } from '@/lib/data-jobs';
import type { ConnectorMappingRow } from '@/lib/connector-mapping';

/* ================================================================
   Phase F — dataset lineage built from pipeline + connector defs.
   schema ──(read)──▶ pipeline ──(write)──▶ schema
   connector ──▶ schema   (inbound)   |   schema ──▶ connector (outbound)
   ================================================================ */

export type LineageKind = 'schema' | 'pipeline' | 'connector';

export type LineageNode = Node<{ label: string; kind: LineageKind; route: string }>;
export type LineageGraph = { nodes: LineageNode[]; edges: Edge[] };

const KIND_STYLE: Record<LineageKind, { bg: string; border: string }> = {
  schema: { bg: '#eef2ff', border: '#6366f1' },
  pipeline: { bg: '#f5f3ff', border: '#8b5cf6' },
  connector: { bg: '#ecfdf5', border: '#10b981' },
};

function mappingRows(m: unknown): ConnectorMappingRow[] {
  return Array.isArray(m) ? (m as ConnectorMappingRow[]) : [];
}

async function fetchLineage(tenantId: string, environment: string): Promise<LineageGraph> {
  const [{ data: schemas }, { data: jobs }, { data: connectors }] = await Promise.all([
    supabase
      .from('schema_definitions')
      .select('id, name, slug, table_name')
      .eq('tenant_id', tenantId)
      .eq('environment', environment),
    supabase
      .from('data_jobs')
      .select('id, name, workflow_json')
      .eq('tenant_id', tenantId)
      .eq('environment', environment),
    supabase
      .from('connectors')
      .select('id, name, direction, mapping')
      .eq('tenant_id', tenantId)
      .eq('environment', environment),
  ]);

  const schemaByRef = new Map<string, { id: string; name: string; slug: string }>();
  for (const s of schemas ?? []) {
    for (const key of [s.slug, s.name, s.table_name].filter(Boolean) as string[]) schemaByRef.set(key, s);
  }

  const edges: Edge[] = [];
  const usedSchemaSlugs = new Set<string>();
  const edgeKey = new Set<string>();
  const addEdge = (from: string, to: string, label: string) => {
    const k = `${from}->${to}`;
    if (edgeKey.has(k)) return;
    edgeKey.add(k);
    edges.push({ id: k, source: from, target: to, label, animated: false, style: { stroke: '#94a3b8' } });
  };

  // Pipelines
  for (const j of jobs ?? []) {
    const g = parseWorkflowGraph(j.workflow_json);
    let touched = false;
    for (const n of g.nodes) {
      const t = n.data.stepType;
      const ref = String((n.data.config as Record<string, unknown>)?.schema ?? '');
      const sch = ref ? schemaByRef.get(ref) : undefined;
      if (!sch) continue;
      usedSchemaSlugs.add(sch.slug);
      touched = true;
      if (t.startsWith('source')) addEdge(`schema:${sch.slug}`, `pipeline:${j.id}`, 'read');
      if (t.startsWith('target')) addEdge(`pipeline:${j.id}`, `schema:${sch.slug}`, 'write');
    }
    if (touched) {
      // ensure pipeline node exists even if only via edges
    }
  }

  // Connectors
  for (const c of connectors ?? []) {
    const targets = new Set(mappingRows(c.mapping).map((r) => r.target_schema).filter(Boolean));
    for (const ref of targets) {
      const sch = schemaByRef.get(ref);
      if (!sch) continue;
      usedSchemaSlugs.add(sch.slug);
      if (c.direction === 'outbound') addEdge(`schema:${sch.slug}`, `connector:${c.id}`, 'export');
      else addEdge(`connector:${c.id}`, `schema:${sch.slug}`, 'ingest');
    }
  }

  // Only include entities that participate in at least one edge.
  const nodeIds = new Set<string>();
  edges.forEach((e) => {
    nodeIds.add(e.source);
    nodeIds.add(e.target);
  });

  const mkNode = (id: string, label: string, kind: LineageKind, route: string, col: number, row: number): LineageNode => ({
    id,
    position: { x: col * 280, y: row * 90 },
    data: { label, kind, route },
    draggable: true,
    style: {
      background: KIND_STYLE[kind].bg,
      border: `1px solid ${KIND_STYLE[kind].border}`,
      borderRadius: 10,
      fontSize: 12,
      padding: '8px 12px',
      width: 200,
    },
  });

  const nodes: LineageNode[] = [];
  const lanes: Record<string, number> = { source: 0, connector: 1, pipeline: 2, target: 3 };
  const rowCounter: Record<number, number> = {};
  const laneRow = (col: number) => (rowCounter[col] = (rowCounter[col] ?? 0) + 1) - 1;

  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  edges.forEach((e) => {
    outCount.set(e.source, (outCount.get(e.source) ?? 0) + 1);
    inCount.set(e.target, (inCount.get(e.target) ?? 0) + 1);
  });

  for (const s of schemas ?? []) {
    const id = `schema:${s.slug}`;
    if (!nodeIds.has(id)) continue;
    const onlySource = (inCount.get(id) ?? 0) === 0;
    const col = onlySource ? lanes.source : lanes.target;
    nodes.push(mkNode(id, s.name, 'schema', `/data/schemas/${s.slug}`, col, laneRow(col)));
  }
  for (const c of connectors ?? []) {
    const id = `connector:${c.id}`;
    if (!nodeIds.has(id)) continue;
    nodes.push(mkNode(id, c.name, 'connector', `/data/connectors/${c.id}`, lanes.connector, laneRow(lanes.connector)));
  }
  for (const j of jobs ?? []) {
    const id = `pipeline:${j.id}`;
    if (!nodeIds.has(id)) continue;
    nodes.push(mkNode(id, j.name, 'pipeline', `/data/jobs/${j.id}`, lanes.pipeline, laneRow(lanes.pipeline)));
  }

  return { nodes, edges };
}

export function useLineage(tenantId: string | null | undefined, environment: string) {
  return useQuery({
    queryKey: ['lineage', tenantId, environment],
    enabled: Boolean(tenantId),
    queryFn: () => fetchLineage(tenantId as string, environment),
  });
}

export function neighbours(graph: LineageGraph, nodeId: string) {
  const upstream = graph.edges.filter((e) => e.target === nodeId).map((e) => e.source);
  const downstream = graph.edges.filter((e) => e.source === nodeId).map((e) => e.target);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return {
    upstream: upstream.map((id) => byId.get(id)).filter(Boolean) as LineageNode[],
    downstream: downstream.map((id) => byId.get(id)).filter(Boolean) as LineageNode[],
  };
}
