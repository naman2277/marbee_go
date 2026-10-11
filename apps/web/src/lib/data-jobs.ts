import type { Edge, Node } from 'reactflow';
export type {
  NodeCategory,
  NodeIconKey,
  NodePaletteItem,
  ConfigField,
} from '@/lib/data-job-nodes';
export {
  NODE_PALETTE,
  NODE_ICONS,
  NODE_CATEGORIES,
  NODE_CONFIG_FIELDS,
  STEP_TYPES,
  paletteItem,
  categoryAccent,
  normalizeStepType,
  defaultConfigForType,
  configSummary,
  validateNodeConfig,
  LEGACY_TYPE_MAP,
} from '@/lib/data-job-nodes';

import {
  paletteItem,
  normalizeStepType,
  defaultConfigForType,
} from '@/lib/data-job-nodes';

export type WorkflowStep = {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  disabled?: boolean;
};

export type PipelineNodeRunState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'canceled'
  | 'retrying';

export type WorkflowNodeData = {
  label: string;
  stepType: string;
  config: Record<string, unknown>;
  /** Validation status shown on node */
  status?: 'ok' | 'warn' | 'error';
  /** Visual scale (1 = default size) */
  scale?: number;
  /** Phase C run overlay — set only in replay / live-run canvases, never the editor */
  runState?: PipelineNodeRunState;
  runCounts?: { in: number; out: number; failed: number };
  /** Disabled nodes are skipped at execution and pass their input straight through. */
  disabled?: boolean;
};

export const NODE_SCALE_DEFAULT = 1;
export const NODE_SCALE_MIN = 0.5;
export const NODE_SCALE_MAX = 2;
export const NODE_SCALE_STEP = 0.08;

export type WorkflowGraph = {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
};

export const JOB_TYPES = [
  { value: 'import', label: 'Import', description: 'Pull data into Marbee schemas' },
  { value: 'export', label: 'Export', description: 'Export schema data to files or connectors' },
  { value: 'etl', label: 'ETL', description: 'Extract, transform, and load pipeline' },
  { value: 'validate', label: 'Validate', description: 'Run data quality checks' },
  { value: 'transform', label: 'Transform', description: 'Map and reshape data between schemas' },
  { value: 'sql', label: 'SQL Query', description: 'Run custom SQL against tenant data' },
  { value: 'api_trigger', label: 'API Trigger', description: 'Pipeline triggered via REST API endpoint' },
  { value: 'journey_workflow', label: 'Journey / Workflow', description: 'Pipeline driven by customer journey or automation workflow' },
] as const;

export function emptyStep(type = 'source'): WorkflowStep {
  const item = paletteItem(type);
  return {
    id: crypto.randomUUID(),
    type,
    label: item?.label ?? type,
    config: defaultConfigForType(type),
  };
}

export function parseWorkflow(json: unknown): WorkflowStep[] {
  const graph = parseWorkflowGraph(json);
  return graphToSteps(graph.nodes, graph.edges);
}

export function parseWorkflowGraph(json: unknown): WorkflowGraph {
  if (!json || typeof json !== 'object') return { nodes: [], edges: [] };
  const obj = json as {
    nodes?: Node<WorkflowNodeData>[];
    edges?: Edge[];
    steps?: WorkflowStep[];
  };

  if (obj.nodes?.length) {
    return {
      nodes: obj.nodes.map(normalizeWorkflowNode),
      edges: obj.edges ?? [],
    };
  }

  if (obj.steps?.length) {
    const steps = obj.steps.map((s) => ({
      ...s,
      type: normalizeStepType(s.type),
    }));
    return stepsToGraph(steps);
  }

  return { nodes: [], edges: [] };
}

function normalizeWorkflowNode(node: Node<WorkflowNodeData>): Node<WorkflowNodeData> {
  const stepType = normalizeStepType(node.data?.stepType ?? 'source');
  return {
    ...node,
    type: 'dataJobStep',
    data: {
      label: node.data?.label ?? paletteItem(stepType)?.label ?? 'Step',
      stepType,
      config: node.data?.config ?? defaultConfigForType(stepType),
      status: node.data?.status,
      scale: node.data?.scale ?? NODE_SCALE_DEFAULT,
      disabled: node.data?.disabled ?? false,
    },
  };
}

export function stepsToGraph(steps: WorkflowStep[]): WorkflowGraph {
  const nodes: Node<WorkflowNodeData>[] = steps.map((step, i) => ({
    id: step.id,
    type: 'dataJobStep',
    position: { x: 80 + i * 320, y: 160 + (i % 2) * 80 },
    data: {
      label: step.label,
      stepType: normalizeStepType(step.type),
      config: step.config ?? defaultConfigForType(step.type),
      disabled: step.disabled ?? false,
    },
  }));

  const edges: Edge[] = steps.slice(1).map((step, i) => ({
    id: `e-${steps[i].id}-${step.id}`,
    source: steps[i].id,
    target: step.id,
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 2 },
  }));

  return { nodes, edges };
}

export function graphToSteps(nodes: Node<WorkflowNodeData>[], edges: Edge[]): WorkflowStep[] {
  if (!nodes.length) return [];
  const order = topologicalNodeOrder(nodes, edges);
  return order.map((node) => ({
    id: node.id,
    type: node.data.stepType,
    label: node.data.label,
    config: node.data.config ?? {},
    disabled: node.data.disabled ?? false,
  }));
}

function topologicalNodeOrder(nodes: Node<WorkflowNodeData>[], edges: Edge[]): Node<WorkflowNodeData>[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));

  const queue = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  const result: Node<WorkflowNodeData>[] = [];

  while (queue.length) {
    const node = queue.shift()!;
    result.push(node);
    edges
      .filter((e) => e.source === node.id)
      .forEach((e) => {
        const next = (incoming.get(e.target) ?? 1) - 1;
        incoming.set(e.target, next);
        if (next === 0) {
          const target = byId.get(e.target);
          if (target) queue.push(target);
        }
      });
  }

  if (result.length < nodes.length) {
    const seen = new Set(result.map((n) => n.id));
    nodes.filter((n) => !seen.has(n.id)).forEach((n) => result.push(n));
  }

  return result;
}

export function serializeWorkflow(steps: WorkflowStep[]) {
  const graph = stepsToGraph(steps);
  return serializeWorkflowGraph(graph.nodes, graph.edges);
}

export function serializeWorkflowGraph(nodes: Node<WorkflowNodeData>[], edges: Edge[]) {
  const steps = graphToSteps(nodes, edges);
  return {
    nodes: nodes.map(({ id, type, position, data }) => ({
      id,
      type: type ?? 'dataJobStep',
      position,
      data,
    })),
    edges,
    steps,
  };
}

export function countWorkflowNodes(json: unknown): number {
  return parseWorkflowGraph(json).nodes.length;
}

/** Auto-layout nodes left-to-right by topological order */
export function autoLayoutGraph(nodes: Node<WorkflowNodeData>[], edges: Edge[]): Node<WorkflowNodeData>[] {
  const ordered = topologicalNodeOrder(nodes, edges);
  const posById = new Map(
    ordered.map((n, i) => [n.id, { x: 60 + i * 340, y: 200 + (i % 3) * 100 }]),
  );
  return nodes.map((n) => ({
    ...n,
    position: posById.get(n.id) ?? n.position,
  }));
}

export function validateWorkflow(nodes: Node<WorkflowNodeData>[], edges: Edge[]): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  if (!nodes.length) messages.push('Workflow has no nodes');
  const hasSource = nodes.some((n) => n.data.stepType.startsWith('source') || n.data.stepType.startsWith('trigger'));
  const hasTarget = nodes.some((n) => n.data.stepType.startsWith('target'));
  if (nodes.length && !hasSource) messages.push('Add at least one trigger or source node');
  if (nodes.length && !hasTarget) messages.push('Add at least one destination node');
  const orphan = nodes.filter(
    (n) => !edges.some((e) => e.target === n.id) && !edges.some((e) => e.source === n.id) && nodes.length > 1,
  );
  if (orphan.length) messages.push(`${orphan.length} disconnected node(s)`);
  return { ok: messages.length === 0, messages };
}

/** Parse workflow graph with local draft fallback */
export function getWorkflowGraph(j: { id: string; workflow_json: unknown }): WorkflowGraph {
  let json = j.workflow_json;
  try {
    const draft = localStorage.getItem(`data_job_draft_${j.id}`);
    if (draft) {
      const parsed = JSON.parse(draft);
      if (parsed.workflow_json) json = parsed.workflow_json;
    }
  } catch {}
  return parseWorkflowGraph(json);
}

/** Fetch run history for a workflow job, merging DB runs with local history */
export function getRunHistoryForJob(jobId: string, dbRuns?: any[]): any[] {
  let list: any[] = [];
  try {
    const raw = localStorage.getItem(`data_job_run_history_${jobId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch {}

  if (dbRuns && Array.isArray(dbRuns)) {
    const jobDbRuns = dbRuns.filter((r) => r.job_id === jobId);
    for (const r of jobDbRuns) {
      const exists = list.some((l) => l.id === r.id);
      if (!exists) {
        list.push({
          id: r.id,
          date: r.started_at ? new Date(r.started_at).toISOString().split('T')[0] : 'Today',
          timestamp: r.started_at ? new Date(r.started_at).toLocaleTimeString() : '',
          startedAtFormatted: r.started_at ? new Date(r.started_at).toLocaleString() : undefined,
          status: r.status,
          triggeredBy: r.triggered_by || 'Naman',
          triggerSource: r.trigger_source || 'manual',
          logs: [],
        });
      }
    }
  }

  return list;
}

