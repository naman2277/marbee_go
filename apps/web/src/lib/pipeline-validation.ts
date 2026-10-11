import type { Edge, Node } from 'reactflow';
import type { WorkflowNodeData } from '@/lib/data-jobs';

/* ================================================================
   Phase D — pipeline validation engine. Runs client-side on the
   live graph; blocks Publish / Run while any 'error' stands. The
   worker re-validates structure server-side as a backstop.
   ================================================================ */

export type PipelineIssueLevel = 'error' | 'warn';

export type PipelineIssue = {
  level: PipelineIssueLevel;
  message: string;
  nodeId?: string;
  nodeLabel?: string;
};

/** Config keys that must be present (non-empty) for a node type to be runnable. */
const REQUIRED: Record<string, { key: string; label: string }[]> = {
  source: [{ key: 'schema', label: 'source schema' }],
  target: [{ key: 'schema', label: 'target schema' }],
  validate_schema: [{ key: 'schema', label: 'schema' }],
  transform_map: [{ key: 'target_schema', label: 'target schema' }, { key: 'mapping_text', label: 'field mappings' }],
  transform_join: [{ key: 'right_schema', label: 'right schema' }],
  enrich_lookup: [{ key: 'lookup_schema', label: 'lookup schema' }],
  source_api: [{ key: 'url', label: 'API URL' }],
  source_file: [{ key: 'path', label: 'storage path' }],
  source_query: [{ key: 'query', label: 'SQL query' }],
  source_db_query: [{ key: 'connector_id', label: 'database connector' }, { key: 'query', label: 'query' }],
  source_api_graphql: [{ key: 'url', label: 'endpoint' }, { key: 'query', label: 'query' }],
  source_storage: [{ key: 'bucket', label: 'bucket name' }],
  filter: [{ key: 'conditions_text', label: 'at least one condition' }],
  transform_expression: [{ key: 'field', label: 'source field' }, { key: 'expression', label: 'expression' }],
  transform_calculate: [{ key: 'output_field', label: 'output field' }, { key: 'expression', label: 'expression' }],
  transform_split: [{ key: 'field', label: 'split field' }],
  branch_if: [{ key: 'field', label: 'condition field' }],
  decision_condition: [{ key: 'field', label: 'condition field' }],
  decision_freq_cap: [{ key: 'max_per_day', label: 'daily cap' }],
  ai_generate: [{ key: 'prompt', label: 'prompt' }],
  ai_classify: [{ key: 'categories', label: 'categories' }, { key: 'input_field', label: 'input field' }],
  ai_extract: [{ key: 'schema', label: 'extraction schema' }, { key: 'input_field', label: 'input field' }],
  ai_translate: [{ key: 'input_field', label: 'input field' }, { key: 'target_lang', label: 'target language' }],
  action_sms: [{ key: 'to_field', label: 'phone field' }, { key: 'message', label: 'message' }],
  action_whatsapp: [{ key: 'to_field', label: 'phone field' }, { key: 'template_id', label: 'template' }],
  action_webhook: [{ key: 'url', label: 'endpoint URL' }],
  action_http: [{ key: 'url', label: 'API URL' }],
  action_db_write: [{ key: 'schema', label: 'target schema' }],
  action_export: [{ key: 'format', label: 'export format' }],
  target_webhook: [{ key: 'url', label: 'endpoint URL' }],
  validate: [{ key: 'rules_text', label: 'at least one rule' }],
  monitor_track: [{ key: 'event_name', label: 'event name' }],
  monitor_alert: [{ key: 'webhook_url', label: 'webhook URL' }],
  trigger_schedule: [{ key: 'frequency', label: 'schedule frequency' }],
  trigger_event: [{ key: 'event_name', label: 'event name' }],
};

const SOFT_REQUIRED: Record<string, { key: string; label: string }[]> = {
  action_email: [{ key: 'to', label: 'explicit static recipient (defaults to incoming customer email)' }],
  target: [{ key: 'match_key', label: 'match key (defaults to id)' }],
  source_connector: [{ key: 'connector_id', label: 'connector' }],
  target_connector: [{ key: 'connector_id', label: 'connector' }],
};

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export function validatePipeline(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): PipelineIssue[] {
  const issues: PipelineIssue[] = [];
  const add = (level: PipelineIssueLevel, message: string, n?: Node<WorkflowNodeData>) =>
    issues.push({ level, message, nodeId: n?.id, nodeLabel: n?.data.label });

  if (!nodes.length) {
    issues.push({ level: 'error', message: 'Pipeline has no nodes' });
    return issues;
  }

  const type = (n: Node<WorkflowNodeData>) => n.data.stepType;
  const active = nodes.filter((n) => !n.data.disabled);
  const hasSource = active.some((n) => type(n).startsWith('source') || type(n).startsWith('trigger'));
  if (!hasSource) issues.push({ level: 'error', message: 'Add at least one enabled trigger or source node' });

  // Connectivity.
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  nodes.forEach((n) => {
    inbound.set(n.id, 0);
    outbound.set(n.id, 0);
  });
  for (const e of edges) {
    inbound.set(e.target, (inbound.get(e.target) ?? 0) + 1);
    outbound.set(e.source, (outbound.get(e.source) ?? 0) + 1);
  }

  // Per-node config checks — skip disabled nodes, they don't run.
  for (const n of active) {
    const cfg = (n.data.config ?? {}) as Record<string, unknown>;
    for (const r of REQUIRED[type(n)] ?? []) {
      // Recipient for Send Email / SMS / WhatsApp is dynamic from previous node rows when connected
      if ((r.key === 'to' || r.key === 'to_field') && (inbound.get(n.id) ?? 0) > 0) {
        continue;
      }
      if (isBlank(cfg[r.key])) add('error', `"${n.data.label}" is missing ${r.label}`, n);
    }
    for (const r of SOFT_REQUIRED[type(n)] ?? []) {
      if (isBlank(cfg[r.key])) add('warn', `"${n.data.label}" has no ${r.label}`, n);
    }
  }
  if (nodes.length > 1) {
    for (const n of nodes) {
      if ((inbound.get(n.id) ?? 0) === 0 && (outbound.get(n.id) ?? 0) === 0) {
        add('warn', `"${n.data.label}" is not connected to anything`, n);
      }
    }
  }
  const nodeMap = new Map<string, Node<WorkflowNodeData>>(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const t = type(n);
    if (t.startsWith('target') && (inbound.get(n.id) ?? 0) === 0) {
      add('warn', `"${n.data.label}" has no incoming data`, n);
    }
    if (t.startsWith('trigger') && (inbound.get(n.id) ?? 0) > 0) {
      add('warn', `"${n.data.label}" is a trigger but has an incoming connection`, n);
    }
    if (t.startsWith('source') && (inbound.get(n.id) ?? 0) > 0) {
      const incomingEdges = edges.filter((e) => e.target === n.id);
      const hasNonTriggerInput = incomingEdges.some((e) => {
        const srcNode = nodeMap.get(e.source);
        return !srcNode || !type(srcNode).startsWith('trigger');
      });
      if (hasNonTriggerInput) {
        add('warn', `"${n.data.label}" is a source but has an incoming connection`, n);
      }
    }
  }

  // Cycle detection (Kahn).
  const indeg = new Map(inbound);
  const bySource = new Map<string, string[]>();
  for (const e of edges) bySource.set(e.source, [...(bySource.get(e.source) ?? []), e.target]);
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const t of bySource.get(id) ?? []) {
      indeg.set(t, (indeg.get(t) ?? 1) - 1);
      if ((indeg.get(t) ?? 0) === 0) queue.push(t);
    }
  }
  if (visited < nodes.length) issues.push({ level: 'error', message: 'Pipeline has a cycle — data flow must be acyclic' });

  return issues;
}

export function summarizeIssues(issues: PipelineIssue[]) {
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warn').length;
  return { errors, warnings, ok: errors === 0 };
}
