// Pipeline graph parsing + planning (Phase B).
// Ports the shape produced by apps/web `serializeWorkflowGraph` and the legacy
// `{ steps: [...] }` seed format.

export type GNode = {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  disabled: boolean;
};

export type GEdge = {
  source: string;
  target: string;
  sourceHandle: string | null;
};

export type Graph = { nodes: GNode[]; edges: GEdge[] };

const LEGACY_TYPE: Record<string, string> = { transform: 'transform_map', sql: 'source_query' };
const norm = (t: string) => LEGACY_TYPE[t] ?? t;

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

export function parseGraph(raw: unknown): Graph {
  const g = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const rawNodes = g.nodes as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(rawNodes) && rawNodes.length) {
    const nodes: GNode[] = rawNodes.map((n) => {
      const data = (n.data ?? {}) as Record<string, unknown>;
      return {
        id: String(n.id),
        type: norm(String(data.stepType ?? n.type ?? 'source')),
        label: String(data.label ?? n.id),
        config: (data.config ?? {}) as Record<string, unknown>,
        disabled: Boolean(data.disabled),
      };
    });
    const edges: GEdge[] = ((g.edges as Array<Record<string, unknown>>) ?? []).map((e) => ({
      source: String(e.source),
      target: String(e.target),
      sourceHandle: e.sourceHandle ? String(e.sourceHandle) : null,
    }));
    return { nodes, edges };
  }

  const rawSteps = g.steps as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(rawSteps) && rawSteps.length) {
    const nodes: GNode[] = rawSteps.map((s) => ({
      id: String(s.id),
      type: norm(String(s.type ?? 'source')),
      label: String(s.label ?? s.id),
      config: (s.config ?? {}) as Record<string, unknown>,
      disabled: Boolean(s.disabled),
    }));
    const edges: GEdge[] = nodes.slice(1).map((s, i) => ({
      source: nodes[i].id,
      target: s.id,
      sourceHandle: null,
    }));
    return { nodes, edges };
  }

  return { nodes: [], edges: [] };
}

export type Plan = {
  order: string[];
  bySource: Map<string, GEdge[]>;
  byTarget: Map<string, GEdge[]>;
  errors: string[];
};

/** Topological plan + the validation checks that block a run. */
export function buildPlan(g: Graph): Plan {
  const errors: string[] = [];
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const indeg = new Map<string, number>();
  const bySource = new Map<string, GEdge[]>();
  const byTarget = new Map<string, GEdge[]>();

  g.nodes.forEach((n) => indeg.set(n.id, 0));
  for (const e of g.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    push(bySource, e.source, e);
    push(byTarget, e.target, e);
  }

  const queue = g.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const work = new Map(indeg);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of bySource.get(id) ?? []) {
      work.set(e.target, (work.get(e.target) ?? 1) - 1);
      if ((work.get(e.target) ?? 0) === 0) queue.push(e.target);
    }
  }

  if (!g.nodes.length) errors.push('Workflow has no nodes');
  if (order.length < g.nodes.length) errors.push('Workflow graph has a cycle');
  if (g.nodes.length && !g.nodes.some((n) => n.type.startsWith('source') || n.type.startsWith('trigger')))
    errors.push('Add at least one trigger or source node');
  if (g.nodes.length && !g.nodes.some((n) => n.type.startsWith('target')))
    errors.push('Add at least one destination node');

  return { order, bySource, byTarget, errors };
}
