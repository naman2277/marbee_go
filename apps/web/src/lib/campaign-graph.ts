import type { Edge, Node } from 'reactflow';
import {
  defaultConfigForType,
  normalizeCampaignMode,
  normalizeStepType,
  paletteItem,
  type CampaignModeInput,
} from './campaign-nodes';

export type CampaignNodeData = {
  label: string;
  stepType: string;
  config: Record<string, unknown>;
  status?: 'ok' | 'warn' | 'error';
  /** Workflow step execution state (campaign mode) */
  runStatus?: 'idle' | 'running' | 'done' | 'error' | 'delivery_pending';
  scale?: number;
  /** Live population count shown on nodes after running */
  liveCount?: number;
  /** Legacy journey editor field */
  nodeType?: string;
};

export type CampaignGraph = {
  nodes: Node<CampaignNodeData>[];
  edges: Edge[];
};

export const CAMPAIGN_NODE_SCALE_DEFAULT = 1;

export function parseCampaignGraph(json: unknown): CampaignGraph {
  if (!json || typeof json !== 'object') return { nodes: [], edges: [] };
  const obj = json as { nodes?: Node<CampaignNodeData>[]; edges?: Edge[] };
  return {
    nodes: (obj.nodes ?? []).map(normalizeCampaignNode),
    edges: (obj.edges ?? []).map(normalizeCampaignEdge),
  };
}

function normalizeCampaignNode(node: Node<CampaignNodeData>): Node<CampaignNodeData> {
  const stepType = normalizeStepType(node.data?.stepType ?? node.data?.nodeType as string ?? 'segment_entry');
  const meta = paletteItem(stepType);
  return {
    ...node,
    type: 'campaignStep',
    position: node.position ?? { x: 0, y: 0 },
    data: {
      label: node.data?.label ?? meta?.label ?? 'Step',
      stepType,
      config: node.data?.config ?? defaultConfigForType(stepType),
      status: node.data?.status,
      scale: node.data?.scale ?? CAMPAIGN_NODE_SCALE_DEFAULT,
      liveCount: node.data?.liveCount,
    },
  };
}

function normalizeCampaignEdge(edge: Edge): Edge {
  const handle = edge.sourceHandle;
  const isNo = handle === 'no' || edge.label === 'No' || edge.label === '✗';
  const isYes = handle === 'yes' || edge.label === 'Yes' || edge.label === '✓';
  return {
    ...edge,
    type: 'campaignThread',
    animated: false,
    style: {
      stroke: isNo ? '#f97316' : isYes ? '#3b82f6' : '#94a3b8',
      strokeWidth: 2,
    },
    labelStyle: { fill: isNo ? '#ea580c' : '#2563eb', fontWeight: 600, fontSize: 11 },
  };
}

export function serializeCampaignGraph(nodes: Node<CampaignNodeData>[], edges: Edge[]) {
  return {
    nodes: nodes.map(({ id, type, position, data }) => ({
      id,
      type: type ?? 'campaignStep',
      position,
      data: {
        label: data.label,
        stepType: data.stepType,
        config: data.config,
        status: data.status,
        scale: data.scale,
      },
    })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle, type, label }) => ({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      type,
      label,
    })),
  };
}

const SOURCE_QUERY_STEP_TYPES = ['query', 'read_list', 'incremental_query'] as const;

export function isWorkflowSourceStep(stepType: string): boolean {
  return (
    (SOURCE_QUERY_STEP_TYPES as readonly string[]).includes(stepType) ||
    Boolean(paletteItem(stepType)?.entryOnly)
  );
}

/** Single source activity on canvas — query can run and preview without delivery steps. */
export function isQueryOnlyWorkflow(nodes: Node<CampaignNodeData>[]): boolean {
  return nodes.length === 1 && isWorkflowSourceStep(nodes[0]!.data.stepType);
}

function validateSourceQueryConfig(stepType: string, config: Record<string, unknown>): string[] {
  const messages: string[] = [];
  if (stepType === 'read_list') {
    if (!String(config.list_slug ?? config.audience_slug ?? '').trim()) {
      messages.push('Select an audience list before running');
    }
    return messages;
  }
  if (stepType === 'query' || stepType === 'incremental_query') {
    const source = String(config.query_source ?? (config.audience_slug ? 'audience' : 'schema'));
    if (source === 'audience' && !String(config.audience_slug ?? '').trim()) {
      messages.push('Select an audience before running this query');
    }
    if (source === 'schema' && !String(config.schema_slug ?? '').trim()) {
      messages.push('Select a schema before running this query');
    }
  }
  return messages;
}

export function validateCampaign(
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
  mode: CampaignModeInput = 'flow',
): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  if (!nodes.length) messages.push('Campaign canvas is empty');

  const isSourceStep = (stepType: string) =>
    ['query', 'read_list', 'incremental_query'].includes(stepType) || Boolean(paletteItem(stepType)?.entryOnly);

  const isDeliveryStep = (stepType: string) => stepType.startsWith('send_');

  const isTerminalStep = (stepType: string) =>
    Boolean(paletteItem(stepType)?.terminal) || stepType === 'exit' || isDeliveryStep(stepType);

  if (normalizeCampaignMode(mode) === 'campaign') {
    const hasSource = nodes.some((n) => isSourceStep(n.data.stepType));
    if (nodes.length && !hasSource) messages.push('Add a Query or Read list activity to start the workflow');

    const hasDelivery = nodes.some((n) => n.data.stepType.startsWith('send_'));
    if (nodes.length && !hasDelivery && !isQueryOnlyWorkflow(nodes)) {
      messages.push('Add an Email or channel delivery activity');
    }
  } else {
    const entryTypes = CAMPAIGN_ENTRY_TYPES;
    const hasEntry = nodes.some((n) => entryTypes.includes(n.data.stepType));
    if (nodes.length && !hasEntry) messages.push('Add an entry node (segment, schedule, or trigger)');

    const hasChannel = nodes.some((n) => n.data.stepType.startsWith('send_'));
    if (nodes.length && !hasChannel) messages.push('Add at least one channel delivery node');
  }

  if (nodes.length > 1) {
    const fullyDisconnected = nodes.filter((n) => {
      const hasIn = edges.some((e) => e.target === n.id);
      const hasOut = edges.some((e) => e.source === n.id);
      return !hasIn && !hasOut && !isSourceStep(n.data.stepType);
    });
    for (const n of fullyDisconnected) {
      messages.push(`"${n.data.label}" is not connected — connect an upstream activity to its left dot`);
    }

    const missingIncoming = nodes.filter((n) => {
      if (isSourceStep(n.data.stepType)) return false;
      const hasIn = edges.some((e) => e.target === n.id);
      const hasOut = edges.some((e) => e.source === n.id);
      return !hasIn && hasOut;
    });
    for (const n of missingIncoming) {
      messages.push(`"${n.data.label}" has no incoming thread — connect an upstream activity`);
    }

    const missingOutgoing = nodes.filter((n) => {
      if (isTerminalStep(n.data.stepType)) return false;
      if (paletteItem(n.data.stepType)?.outputs?.length) return false;
      const hasIn = edges.some((e) => e.target === n.id);
      const hasOut = edges.some((e) => e.source === n.id);
      if (
        (SOURCE_QUERY_STEP_TYPES as readonly string[]).includes(n.data.stepType) &&
        !hasOut
      ) {
        return true;
      }
      return hasIn && !hasOut;
    });
    for (const n of missingOutgoing) {
      const isQuerySource = (SOURCE_QUERY_STEP_TYPES as readonly string[]).includes(n.data.stepType);
      messages.push(
        isQuerySource
          ? `"${n.data.label}" must connect to the next activity — drag from the right dot to downstream steps`
          : `"${n.data.label}" has no outgoing thread — connect to the next step`,
      );
    }
  }

  const decisions = nodes.filter((n) => paletteItem(n.data.stepType)?.outputs?.length);
  for (const d of decisions) {
    const outs = edges.filter((e) => e.source === d.id);
    if (outs.length < 2) messages.push(`"${d.data.label}" needs both branch paths connected`);
  }

  return { ok: messages.length === 0, messages };
}

/** Validate only what is required to run a single activity (not the full workflow). */
export function validateNodeForRun(
  nodeId: string,
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
): { ok: boolean; messages: string[] } {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, messages: ['Activity not found on canvas'] };

  const messages: string[] = [];
  const stepType = node.data.stepType;
  const config = node.data.config ?? {};
  const multiNode = nodes.length > 1;
  const hasOut = edges.some((e) => e.source === nodeId);

  if (isWorkflowSourceStep(stepType)) {
    messages.push(...validateSourceQueryConfig(stepType, config));
    if (
      multiNode &&
      (SOURCE_QUERY_STEP_TYPES as readonly string[]).includes(stepType) &&
      !hasOut
    ) {
      messages.push(
        `"${node.data.label}" must connect to the next activity — drag from the right dot to downstream steps`,
      );
    }
    return { ok: messages.length === 0, messages };
  }

  const inbound = edges.filter((e) => e.target === nodeId);
  if (!inbound.length) {
    messages.push(`"${node.data.label}" needs an incoming connection — connect an upstream activity first`);
  }

  if (paletteItem(stepType)?.outputs?.length) {
    const outs = edges.filter((e) => e.source === nodeId);
    if (outs.length < 2) {
      messages.push(`"${node.data.label}" needs both branch paths connected before running`);
    }
  }

  return { ok: messages.length === 0, messages };
}

const CAMPAIGN_ENTRY_TYPES = [
  'segment_entry',
  'subscription_entry',
  'event_trigger',
  'schedule_blast',
];

export function autoLayoutCampaign(nodes: Node<CampaignNodeData>[], edges: Edge[]): Node<CampaignNodeData>[] {
  const order = getTopologicalOrder(nodes, edges);
  const levelById = new Map<string, number>();
  order.forEach((id, i) => levelById.set(id, i));

  const byLevel = new Map<number, string[]>();
  order.forEach((id) => {
    const lvl = levelById.get(id) ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(id);
  });

  const posById = new Map<string, { x: number; y: number }>();
  byLevel.forEach((ids, lvl) => {
    ids.forEach((id, i) => {
      posById.set(id, {
        x: 60 + lvl * 320,
        y: 120 + (i - (ids.length - 1) / 2) * 140,
      });
    });
  });

  return nodes.map((n) => ({
    ...n,
    position: posById.get(n.id) ?? n.position,
  }));
}

function getTopologicalOrder(nodes: Node<CampaignNodeData>[], edges: Edge[]): string[] {
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));

  const queue = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    edges
      .filter((e) => e.source === id)
      .forEach((e) => {
        const next = (incoming.get(e.target) ?? 1) - 1;
        incoming.set(e.target, next);
        if (next === 0) queue.push(e.target);
      });
  }

  nodes.forEach((n) => {
    if (!order.includes(n.id)) order.push(n.id);
  });

  return order;
}
