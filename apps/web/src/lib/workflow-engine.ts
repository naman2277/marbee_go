import type { Edge, Node } from 'reactflow';
import { supabase } from './supabase';
import { parseCampaignGraph, type CampaignNodeData } from './campaign-graph';
import { fetchSchemasWithFields } from './fetch-schemas';
import { evaluateAudienceMembers, buildAudienceFilterFields, type Audience } from './audiences';
import { fetchInformationServices } from './subscriptions';
import {
  buildQueryWorkTable,
  type QueryWorkTableMeta,
} from './query-activity';
import { applyFilterRoot, createFilterRoot, type FilterRoot, type SchemaFilterField } from './schema-filters';
import { applyQuickSearch } from '@/components/schemas/SchemaFilterEditor';
import { fetchSchemaRows } from './schema-records';
import { logAudit } from './audit';
import {
  buildDeliveryPrep,
  channelForDeliveryStep,
  type DeliveryPrepData,
} from './delivery-prep';
import { resolveWebPushDeliveryContent } from './content-templates';
import { describeEnqueue, enqueueWebPush } from './firebase-push';
import { testMailjetConnection, testResendConnection } from './channel-test';
import { renderBlocksToHtml } from './email-renderer';
import { DEFAULT_EMAIL_THEME } from './email-builder-types';

export { isDeliveryStep, DELIVERY_STEP_TYPES } from './delivery-prep';
export type { DeliveryPrepData } from './delivery-prep';

// ═══════════════════════════════════════════════════════════════════════════
// Workflow Engine V2 — Re-exports
// The V2 engine implements the production-grade architecture:
//   Three-Plane separation, Universal Node Contract, State Machines,
//   Atomic Claiming, Circuit Breaker, DLQ, Fan-Out/Fan-In, Sub-Workflows.
// Import from './workflow-v2' for the new engine, or continue using
// the existing exports below for backward compatibility.
// ═══════════════════════════════════════════════════════════════════════════
export {
  // Core execution engine
  createWorkflowRun as createWorkflowRunV2,
  initializeNodeExecutions,
  executeWorkflowCycle,
  checkWorkflowCompletion,
  cancelWorkflowRun as cancelWorkflowRunV2,
  sendHeartbeat,
  runWorkflowToCompletion,
  emitExecutionEvent,
  transitionWorkflowState,
  transitionNodeState,
  // Node registry
  nodeRegistry,
  // Reliability
  WorkflowError,
  CircuitBreaker,
  // Expression engine
  resolveTemplate as resolveTemplateV2,
  evaluateCondition,
  // Fan-out
  FanOutEngine,
  // Sub-workflows
  startSubWorkflow,
  cancelChildWorkflows,
  // DLQ
  enqueueToDLQ,
  fetchDLQEntries,
  replayDLQEntry,
  getDLQDepth,
} from './workflow-v2';

export type DeployedDeliveryRecord = {
  id: string;
  name: string;
  channel: string;
  stepType: string;
  confirmedAt: string;
  excludedCount: number;
  templateName?: string;
};

export type NodePopulationResult = {
  nodeId: string;
  handle?: string;
  count: number;
  customerIds: string[];
  sample: Record<string, unknown>[];
  executedAt: string;
  label?: string;
  delivery?: DeployedDeliveryRecord;
  /** Adobe Campaign-style query work table metadata (transition temp data). */
  query?: QueryWorkTableMeta;
};

export type WorkflowRunState = {
  id: string;
  journey_id: string;
  version_id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  current_node_id: string | null;
  node_results: Record<string, NodePopulationResult>;
  completed_at?: string | null;
};

function resultKey(nodeId: string, handle?: string) {
  return handle ? `${nodeId}:${handle}` : nodeId;
}

export const WORKFLOW_SOURCE_STEP_TYPES = [
  'query',
  'read_list',
  'incremental_query',
  'segment_entry',
  'schedule_blast',
] as const;

function compareCanvasOrder(
  a: { position: { x: number; y: number } },
  b: { position: { x: number; y: number } },
) {
  return a.position.x - b.position.x || a.position.y - b.position.y;
}

function upstreamResultReady(
  nodeResults: Record<string, NodePopulationResult>,
  sourceId: string,
  sourceHandle?: string | null,
): boolean {
  if (sourceHandle) {
    return Boolean(nodeResults[resultKey(sourceId, sourceHandle)]);
  }
  if (nodeResults[sourceId]) return true;
  return Object.values(nodeResults).some((r) => r.nodeId === sourceId && !r.handle);
}

async function fetchAudienceBySlug(tenantId: string, environment: string, slug: string): Promise<Audience | null> {
  const { data, error } = await supabase
    .from('audiences')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as Audience | null;
}

async function queryAudiencePopulation(
  tenantId: string,
  environment: string,
  audienceSlug: string,
  limit = 5000,
): Promise<{ ids: string[]; rows: Record<string, unknown>[] }> {
  const audience = await fetchAudienceBySlug(tenantId, environment, audienceSlug);
  if (!audience) return { ids: [], rows: [] };

  const schemas = await fetchSchemasWithFields(tenantId, environment);
  const schema = schemas.find((s) => s.slug === audience.schema_slug);
  if (!schema?.table_name) return { ids: [], rows: [] };

  const { members } = await evaluateAudienceMembers({
    tenantId,
    environment,
    schema,
    filterRoot: audience.filter_json,
    quickSearch: audience.quick_search ?? '',
    limit,
  });

  const ids = members.map((m) => String(m.id)).filter(Boolean);
  return { ids, rows: members };
}

async function querySchemaPopulation(
  tenantId: string,
  environment: string,
  schemaSlug: string,
  filterJson: FilterRoot | null,
  quickSearch: string,
  limit = 5000,
): Promise<{ ids: string[]; rows: Record<string, unknown>[]; schemaSlug: string }> {
  const schemas = await fetchSchemasWithFields(tenantId, environment);
  const schema = schemas.find((s) => s.slug === schemaSlug);
  if (!schema?.table_name) return { ids: [], rows: [], schemaSlug };

  const rows = await fetchSchemaRows(schema.table_name, tenantId, environment, limit);
  const fields = buildAudienceFilterFields(schema, rows);
  let filtered = applyFilterRoot(rows, filterJson ?? createFilterRoot(), fields);
  if (quickSearch.trim()) filtered = applyQuickSearch(filtered, quickSearch, fields);
  const ids = filtered.map((r) => String(r.id)).filter(Boolean);
  return { ids, rows: filtered, schemaSlug };
}

function finalizeQueryOutput(
  rows: Record<string, unknown>[],
  config: Record<string, unknown>,
  schemaSlug: string,
  fields: SchemaFilterField[],
): { ids: string[]; rows: Record<string, unknown>[]; query?: QueryWorkTableMeta } {
  const work = buildQueryWorkTable(rows, config, schemaSlug, fields);
  return {
    ids: work.primaryKeys,
    rows: work.previewRows,
    query: work.meta,
  };
}

async function fetchCustomersByIds(ids: string[]): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('customers').select('*').in('id', ids.slice(0, 100));
  if (error) throw error;
  return data ?? [];
}

function resolvePopulation(
  results: Record<string, NodePopulationResult>,
  sourceNodeId: string,
  sourceHandle?: string | null,
): string[] {
  const key = resultKey(sourceNodeId, sourceHandle ?? undefined);
  return results[key]?.customerIds ?? results[sourceNodeId]?.customerIds ?? [];
}

function gatherInboundIds(
  graph: { edges: Edge[] },
  nodeId: string,
  results: Record<string, NodePopulationResult>,
): string[][] {
  const inbound = graph.edges.filter((e) => e.target === nodeId);
  if (!inbound.length) return [];
  return inbound.map((e) => resolvePopulation(results, e.source, e.sourceHandle));
}

export async function fetchOrCreateWorkflowRun(
  journeyId: string,
  versionId: string,
  tenantId: string,
  environment: string,
): Promise<WorkflowRunState> {
  const { data: existing, error: fetchError } = await supabase
    .from('journey_workflow_runs')
    .select('*')
    .eq('journey_id', journeyId)
    .eq('version_id', versionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    return {
      id: existing.id,
      journey_id: existing.journey_id,
      version_id: existing.version_id,
      status: existing.status,
      current_node_id: existing.current_node_id,
      node_results: (existing.node_results ?? {}) as Record<string, NodePopulationResult>,
      completed_at: existing.completed_at ?? null,
    };
  }

  const { data, error } = await supabase
    .from('journey_workflow_runs')
    .insert({
      tenant_id: tenantId,
      environment,
      journey_id: journeyId,
      version_id: versionId,
      status: 'idle',
      node_results: {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return {
    id: data.id,
    journey_id: data.journey_id,
    version_id: data.version_id,
    status: data.status,
    current_node_id: data.current_node_id,
    node_results: {},
  };
}

export async function resetWorkflowRun(runId: string): Promise<void> {
  await supabase
    .from('journey_workflow_runs')
    .update({
      status: 'idle',
      current_node_id: null,
      node_results: {},
      started_at: null,
      completed_at: null,
    })
    .eq('id', runId);
}

/** Strip transition population between activities; keep delivery summaries for the finished run. */
export function purgeWorkflowTransitionData(
  nodeResults: Record<string, NodePopulationResult>,
): Record<string, NodePopulationResult> {
  const purged: Record<string, NodePopulationResult> = {};
  for (const [key, result] of Object.entries(nodeResults)) {
    if (!result.delivery) continue;
    purged[key] = {
      nodeId: result.nodeId,
      handle: result.handle,
      count: result.count,
      customerIds: [],
      sample: [],
      executedAt: result.executedAt,
      label: result.label,
      delivery: result.delivery,
    };
  }
  return purged;
}

export async function completeWorkflowRun(
  runId: string,
  nodeResults?: Record<string, NodePopulationResult>,
): Promise<void> {
  const purged = nodeResults ? purgeWorkflowTransitionData(nodeResults) : {};
  await supabase
    .from('journey_workflow_runs')
    .update({
      status: 'completed',
      current_node_id: null,
      completed_at: new Date().toISOString(),
      node_results: purged,
    })
    .eq('id', runId);
}

export function isNodeRunnable(
  nodeId: string,
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
  nodeResults: Record<string, NodePopulationResult>,
): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return false;

  const hasResult = Object.values(nodeResults).some((r) => r.nodeId === nodeId);
  if (hasResult) return false;

  const isSource = WORKFLOW_SOURCE_STEP_TYPES.includes(
    node.data.stepType as (typeof WORKFLOW_SOURCE_STEP_TYPES)[number],
  );
  if (isSource) return true;

  const inbound = edges.filter((e) => e.target === nodeId);
  if (!inbound.length) return false;

  return inbound.every((e) => upstreamResultReady(nodeResults, e.source, e.sourceHandle));
}

export function getNextRunnableNode(
  order: string[],
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
  nodeResults: Record<string, NodePopulationResult>,
): string | undefined {
  return order.find((id) => isNodeRunnable(id, nodes, edges, nodeResults));
}

/** Human-readable reason why an activity cannot run yet. */
export function explainNodeNotRunnable(
  nodeId: string,
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
  nodeResults: Record<string, NodePopulationResult>,
): string | null {
  if (isNodeRunnable(nodeId, nodes, edges, nodeResults)) return null;

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return 'Activity not found on canvas';

  const hasResult = Object.values(nodeResults).some((r) => r.nodeId === nodeId);
  if (hasResult) return 'Already completed';

  const isSource = WORKFLOW_SOURCE_STEP_TYPES.includes(
    node.data.stepType as (typeof WORKFLOW_SOURCE_STEP_TYPES)[number],
  );
  if (isSource) return 'Source activity is blocked by configuration';

  const inbound = edges.filter((e) => e.target === nodeId);
  if (!inbound.length) return 'No incoming connection — connect an upstream activity';

  const waiting = inbound.filter((e) => !upstreamResultReady(nodeResults, e.source, e.sourceHandle));
  if (waiting.length) {
    const labels = waiting.map((e) => {
      const src = nodes.find((n) => n.id === e.source);
      return src?.data.label ?? e.source.slice(0, 8);
    });
    return `Waiting for upstream: ${labels.join(', ')}`;
  }

  return 'Not ready to run';
}

/** Summarise why the workflow cannot advance to the next activity. */
export function explainWorkflowStall(
  order: string[],
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
  nodeResults: Record<string, NodePopulationResult>,
): string[] {
  const pending = order.filter(
    (id) => !Object.values(nodeResults).some((r) => r.nodeId === id),
  );
  if (!pending.length) return [];

  const reasons: string[] = [];
  for (const id of pending) {
    const label = nodes.find((n) => n.id === id)?.data.label ?? id.slice(0, 8);
    const reason = explainNodeNotRunnable(id, nodes, edges, nodeResults);
    if (reason) reasons.push(`${label}: ${reason}`);
  }
  return reasons;
}

async function executeDeliverySend(
  stepType: string,
  config: Record<string, unknown>,
  sendIds: string[],
  ctx: { tenantId: string; environment: string; journeyId?: string },
  deliveryMeta?: { deliveryId: string; deliveryName: string },
): Promise<void> {
  const channel = channelForDeliveryStep(stepType);
  const deliveryName = deliveryMeta?.deliveryName ?? String(config.delivery_name ?? 'Delivery');
  const deliveryId = deliveryMeta?.deliveryId;

  if (stepType === 'send_web_push') {
    // D-022: queue server-side; push-worker sends with retries even if this tab closes.
    const pushContent = await resolveWebPushDeliveryContent(config);
    if (!pushContent.title) throw new Error('Web push needs a title — pick a template or enter one.');
    if (!sendIds.length) throw new Error('No recipients in audience for this delivery.');
    const result = await enqueueWebPush({
      tenantId: ctx.tenantId,
      environment: ctx.environment,
      customerIds: sendIds,
      idempotencyKey: deliveryId
        ? `delivery:${deliveryId}`
        : `workflow:${ctx.journeyId ?? 'adhoc'}:${deliveryName}:${crypto.randomUUID()}`,
      content: { ...pushContent, tag: pushContent.tag ?? deliveryId },
      journeyId: ctx.journeyId,
      deliveryId,
      deliveryName,
    });
    if (!result.queued && !result.duplicate) {
      throw new Error(
        result.no_subscription
          ? 'No active web push subscription for this audience. Visitors subscribe through the website push script (Web Analytics → Web Push).'
          : `Nothing was queued: ${describeEnqueue(result)}`,
      );
    }
    return;
  }

  if (stepType === 'send_email') {
    const { data: customerRows } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name')
      .in('id', sendIds.slice(0, 25));

    // Fetch active provider settings
    let providerRow: any = null;
    if (config.channel_provider_id) {
      const { data } = await supabase
        .from('channel_providers')
        .select('*')
        .eq('id', config.channel_provider_id)
        .maybeSingle();
      providerRow = data;
    }
    if (!providerRow) {
      const { data } = await supabase
        .from('channel_providers')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('environment', ctx.environment)
        .eq('channel', 'email')
        .eq('status', 'active')
        .maybeSingle();
      providerRow = data;
    }

    const providerType = providerRow?.provider_type || config.channel_provider_type || 'resend';
    let creds: Record<string, string> = {};
    if (providerRow?.credentials_encrypted) {
      try {
        creds = JSON.parse(providerRow.credentials_encrypted);
      } catch {}
    }
    const conf = (providerRow?.config as Record<string, unknown>) ?? {};

    let sessionDraft: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(`marbee_test_draft_email_${providerType}`);
        if (cached) sessionDraft = JSON.parse(cached);
      } catch {}
    }

    const apiKey = String(
      config.api_key ||
      creds.api_key ||
      conf.api_key ||
      sessionDraft.apiKey ||
      '',
    );
    const secretKey = String(
      config.secret_key ||
      creds.secret_key ||
      conf.secret_key ||
      sessionDraft.secretKey ||
      '',
    );
    const fromEmail = String(
      config.from_email ||
      conf.from_email ||
      sessionDraft.fromEmail ||
      (providerType === 'resend' ? 'onboarding@resend.dev' : ''),
    );
    const fromName = String(
      config.from_name ||
      conf.from_name ||
      sessionDraft.fromName ||
      'Marbee Team',
    );

    if (providerType === 'resend' && !apiKey) {
      throw new Error(
        'Resend dispatch blocked: No Resend API Key found. Please configure your key in Settings → Channels → Email → Resend or in the Delivery modal.',
      );
    }
    if (providerType === 'mailjet' && (!apiKey || !secretKey)) {
      throw new Error(
        'Mailjet dispatch blocked: Mailjet API Key or Secret Key is missing. Please configure your keys in Settings → Channels → Email → Mailjet.',
      );
    }

    // Compile configured template HTML from blocks, published template, or custom HTML
    let templateHtml = String(config.html_body || '');
    let templateText = String(config.plain_text || config.text_body || config.body || '');
    let templateSubject = String(config.subject || 'Marbee Campaign Notification');

    if (Array.isArray(config.blocks) && config.blocks.length > 0) {
      templateHtml = renderBlocksToHtml(config.blocks as any, (config.theme as any) || DEFAULT_EMAIL_THEME);
    } else if (!templateHtml && config.content_template_id) {
      const { data: tplRow } = await supabase
        .from('content_templates')
        .select('*')
        .eq('id', config.content_template_id)
        .maybeSingle();
      if (tplRow?.content) {
        const c = tplRow.content as Record<string, any>;
        templateSubject = c.subject || templateSubject;
        if (Array.isArray(c.blocks) && c.blocks.length > 0) {
          templateHtml = renderBlocksToHtml(c.blocks, c.theme || DEFAULT_EMAIL_THEME);
        } else {
          templateHtml = c.html_body || c.body || templateHtml;
        }
        templateText = c.plain_text || c.text_body || templateText;
      }
    } else if (!templateHtml && config.body) {
      templateHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; font-size: 15px; line-height: 1.6;">${String(config.body)}</div>`;
    }

    for (const cust of customerRows ?? []) {
      const recipientEmail = cust.email ? String(cust.email) : '';
      const messageId = crypto.randomUUID();

      if (!recipientEmail || !recipientEmail.includes('@')) {
        await supabase.from('engagement_log').insert({
          tenant_id: ctx.tenantId,
          environment: ctx.environment,
          customer_id: cust.id,
          channel: 'email',
          message_id: messageId,
          event: 'failed',
          metadata: {
            delivery_name: deliveryName,
            delivery_id: deliveryId,
            error: 'missing_recipient_email',
            error_detail: 'Customer record does not have a valid email address.',
            workflow: true,
          },
        });
        throw new Error(`Recipient profile (${cust.first_name || cust.id}) has no valid email address.`);
      }

      // Interpolate personalization tokens for the recipient profile
      let customerSubject = templateSubject;
      let customerHtml = templateHtml;
      let customerText = templateText;

      const profileData: Record<string, unknown> = {
        first_name: cust.first_name || '',
        last_name: cust.last_name || '',
        name: [cust.first_name, cust.last_name].filter(Boolean).join(' ') || 'Valued Customer',
        email: recipientEmail,
        customer_id: cust.id,
      };

      for (const [k, v] of Object.entries(profileData)) {
        const token = `{{${k}}}`;
        customerSubject = customerSubject.split(token).join(String(v ?? ''));
        customerHtml = customerHtml.split(token).join(String(v ?? ''));
        customerText = customerText.split(token).join(String(v ?? ''));
      }

      let dispatchOk = false;
      let dispatchError = '';

      if (providerType === 'mailjet') {
        const res = await testMailjetConnection({
          apiKey,
          secretKey,
          fromEmail,
          fromName,
          recipientEmail,
          sandboxMode: 'false',
          subject: customerSubject,
          htmlBody: customerHtml,
          textBody: customerText,
        });
        dispatchOk = res.ok;
        dispatchError = res.message;
      } else if (providerType === 'resend') {
        const res = await testResendConnection({
          apiKey,
          fromEmail,
          fromName,
          recipientEmail,
          useBatchEndpoint: false,
          subject: customerSubject,
          htmlBody: customerHtml,
          textBody: customerText,
        });
        dispatchOk = res.ok;
        dispatchError = res.message;
      } else {
        dispatchOk = true;
      }

      await supabase.from('engagement_log').insert({
        tenant_id: ctx.tenantId,
        environment: ctx.environment,
        customer_id: cust.id,
        channel: 'email',
        message_id: messageId,
        event: dispatchOk ? 'sent' : 'failed',
        metadata: {
          delivery_name: deliveryName,
          delivery_id: deliveryId,
          recipient_email: recipientEmail,
          channel_provider_type: providerType || 'none',
          subject: customerSubject,
          error_detail: dispatchError || undefined,
          workflow: true,
          confirmed: true,
        },
      });

      if (!dispatchOk) {
        throw new Error(`Email provider error (${providerType}): ${dispatchError}`);
      }
    }
    return;
  }

  const sampleIds = sendIds.slice(0, 25);
  for (const customerId of sampleIds) {
    const messageId = crypto.randomUUID();
    await supabase.from('engagement_log').insert({
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      customer_id: customerId,
      channel,
      message_id: messageId,
      event: 'sent',
      metadata: {
        delivery_name: deliveryName,
        delivery_id: deliveryId,
        content_template_id: config.content_template_id,
        content_template_name: config.content_template_name,
        channel_provider_id: config.channel_provider_id,
        channel_provider_name: config.channel_provider_name,
        message_traffic_type: config.message_traffic_type,
        subject: config.subject,
        title: config.title,
        body: config.body,
        sandbox: channel !== 'web_push',
        workflow: true,
        confirmed: true,
      },
    });
  }
}

async function executeTargetingNode(
  node: Node<CampaignNodeData>,
  inboundSets: string[][],
  ctx: { tenantId: string; environment: string; journeyId?: string },
  options?: {
    deliveryPhase?: 'prepare' | 'confirm';
    deliveryToSendIds?: string[];
    deliveryRecord?: DeployedDeliveryRecord;
  },
): Promise<{ ids: string[]; rows: Record<string, unknown>[]; handles?: Record<string, string[]>; deliveryPrep?: DeliveryPrepData; query?: QueryWorkTableMeta }> {
  const stepType = node.data.stepType;
  const config = node.data.config ?? {};

  switch (stepType) {
    case 'query':
    case 'incremental_query': {
      const source = String(config.query_source ?? (config.audience_slug ? 'audience' : 'schema'));
      const filterJson = (config.filter_json as FilterRoot) ?? createFilterRoot();
      const quickSearch = String(config.quick_search ?? '');

      if (source === 'audience') {
        const audienceSlug = String(config.audience_slug ?? '');
        if (audienceSlug) {
          const audience = await fetchAudienceBySlug(ctx.tenantId, ctx.environment, audienceSlug);
          const schemas = await fetchSchemasWithFields(ctx.tenantId, ctx.environment);
          const schemaSlug = audience?.schema_slug ?? 'customer';
          const schema = schemas.find((s) => s.slug === schemaSlug);
          const pop = await queryAudiencePopulation(ctx.tenantId, ctx.environment, audienceSlug);
          let filteredRows = pop.rows;

          if ((filterJson.children.length || quickSearch.trim()) && schema?.table_name && pop.rows.length) {
            const fields = buildAudienceFilterFields(schema, pop.rows);
            filteredRows = applyFilterRoot(pop.rows, filterJson, fields);
            if (quickSearch.trim()) filteredRows = applyQuickSearch(filteredRows, quickSearch, fields);
          }

          if (schema?.table_name) {
            const fields = buildAudienceFilterFields(schema, filteredRows.length ? filteredRows : pop.rows);
            return finalizeQueryOutput(
              filteredRows.length ? filteredRows : pop.rows,
              config,
              schemaSlug,
              fields,
            );
          }
          return { ids: pop.ids, rows: pop.rows };
        }
      }

      const schemaSlug = String(config.schema_slug ?? 'customer');
      const pop = await querySchemaPopulation(
        ctx.tenantId,
        ctx.environment,
        schemaSlug,
        filterJson,
        quickSearch,
      );
      const schemas = await fetchSchemasWithFields(ctx.tenantId, ctx.environment);
      const schema = schemas.find((s) => s.slug === schemaSlug);
      if (schema?.table_name && pop.rows.length) {
        const fields = buildAudienceFilterFields(schema, pop.rows);
        return finalizeQueryOutput(pop.rows, config, schemaSlug, fields);
      }
      return { ids: pop.ids, rows: pop.rows };
    }
    case 'read_list': {
      const listSlug = String(config.list_slug ?? config.audience_slug ?? '');
      const pop = listSlug
        ? await queryAudiencePopulation(ctx.tenantId, ctx.environment, listSlug)
        : { ids: [], rows: [] };
      return { ids: pop.ids, rows: pop.rows };
    }
    case 'union': {
      const merged = [...new Set(inboundSets.flat())];
      const rows = await fetchCustomersByIds(merged.slice(0, 100));
      return { ids: merged, rows };
    }
    case 'intersection': {
      if (!inboundSets.length) return { ids: [], rows: [] };
      let ids = inboundSets[0];
      for (let i = 1; i < inboundSets.length; i++) {
        const set = new Set(inboundSets[i]);
        ids = ids.filter((id) => set.has(id));
      }
      const rows = await fetchCustomersByIds(ids.slice(0, 100));
      return { ids, rows };
    }
    case 'exclusion': {
      const main = inboundSets[0] ?? [];
      const exclude = new Set(inboundSets[1] ?? []);
      const ids = main.filter((id) => !exclude.has(id));
      const rows = await fetchCustomersByIds(ids.slice(0, 100));
      return { ids, rows };
    }
    case 'deduplication': {
      const ids = [...new Set(inboundSets.flat())];
      const field = String(config.dedupe_field ?? 'email');
      const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .in('id', ids.slice(0, 2000));
      const seen = new Set<string>();
      const uniqueIds: string[] = [];
      for (const c of customers ?? []) {
        const key = String((c as Record<string, unknown>)[field] ?? c.id);
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueIds.push(String(c.id));
      }
      const rows = (customers ?? []).filter((c) => uniqueIds.includes(String(c.id))).slice(0, 100);
      return { ids: uniqueIds, rows: rows as Record<string, unknown>[] };
    }
    case 'split':
    case 'split_targeting': {
      const ids = [...new Set(inboundSets.flat())];
      const pct = Number(config.split_a_percent ?? 50);
      const splitAt = Math.floor((ids.length * pct) / 100);
      return {
        ids,
        rows: await fetchCustomersByIds(ids.slice(0, 50)),
        handles: { a: ids.slice(0, splitAt), b: ids.slice(splitAt) },
      };
    }
    case 'enrichment':
    case 'list_update': {
      const ids = [...new Set(inboundSets.flat())];
      return { ids, rows: await fetchCustomersByIds(ids.slice(0, 100)) };
    }
    case 'subscription_services_targeting': {
      const serviceSlug = String(config.service_slug ?? '');
      const base = new Set(inboundSets.flat());
      if (!serviceSlug) return { ids: [...base], rows: await fetchCustomersByIds([...base].slice(0, 100)) };
      const services = await fetchInformationServices(ctx.tenantId, ctx.environment);
      const service = services.find((s) => s.slug === serviceSlug);
      if (!service) return { ids: [], rows: [] };
      const { data: subs } = await supabase
        .from('service_subscriptions')
        .select('customer_id')
        .eq('service_id', service.id)
        .eq('status', 'active');
      const subIds = new Set((subs ?? []).map((s) => s.customer_id));
      const ids = [...base].filter((id) => subIds.has(id));
      return { ids, rows: await fetchCustomersByIds(ids.slice(0, 100)) };
    }
    case 'send_email':
    case 'send_sms':
    case 'send_web_push':
    case 'send_whatsapp':
    case 'send_rcs':
    case 'send_in_app':
    case 'send_direct_mail': {
      const ids = [...new Set(inboundSets.flat())];

      if (options?.deliveryPhase === 'prepare') {
        const deliveryPrep = await buildDeliveryPrep({
          nodeId: node.id,
          stepType,
          config,
          targetIds: ids,
          tenantId: ctx.tenantId,
          environment: ctx.environment,
        });
        return {
          ids: deliveryPrep.toSendIds,
          rows: deliveryPrep.sampleRecipients,
          deliveryPrep,
        };
      }

      const sendIds = options?.deliveryToSendIds?.length
        ? options.deliveryToSendIds
        : ids;

      await executeDeliverySend(stepType, config, sendIds, ctx, options?.deliveryRecord
        ? { deliveryId: options.deliveryRecord.id, deliveryName: options.deliveryRecord.name }
        : undefined);
      return { ids: sendIds, rows: await fetchCustomersByIds(sendIds.slice(0, 100)) };
    }
    case 'segment_entry':
    case 'schedule_blast': {
      const slug = String(config.audience_slug ?? '');
      const pop = slug
        ? await queryAudiencePopulation(ctx.tenantId, ctx.environment, slug)
        : { ids: [], rows: [] };
      return { ids: pop.ids, rows: pop.rows };
    }
    default: {
      const ids = [...new Set(inboundSets.flat())];
      return { ids, rows: await fetchCustomersByIds(ids.slice(0, 100)) };
    }
  }
}

export async function runWorkflowStep(input: {
  runId: string;
  journeyId: string;
  journeyName: string;
  canvasJson: unknown;
  nodeId: string;
  tenantId: string;
  environment: string;
  nodeResults: Record<string, NodePopulationResult>;
  deliveryPhase?: 'prepare' | 'confirm';
  deliveryToSendIds?: string[];
  deliveryRecord?: DeployedDeliveryRecord;
}): Promise<{
  result: NodePopulationResult;
  nodeResults: Record<string, NodePopulationResult>;
  deliveryPrep?: DeliveryPrepData;
}> {
  const graph = parseCampaignGraph(input.canvasJson);
  const node = graph.nodes.find((n) => n.id === input.nodeId);
  if (!node) throw new Error('Node not found on canvas');

  const inboundSets = gatherInboundIds(graph, input.nodeId, input.nodeResults);
  const isSource = WORKFLOW_SOURCE_STEP_TYPES.includes(
    node.data.stepType as (typeof WORKFLOW_SOURCE_STEP_TYPES)[number],
  );

  if (!isSource && !inboundSets.length) {
    throw new Error('Run upstream activities first — this node has no inbound population.');
  }

  const output = await executeTargetingNode(node, inboundSets, {
    tenantId: input.tenantId,
    environment: input.environment,
    journeyId: input.journeyId,
  }, {
    deliveryPhase: input.deliveryPhase,
    deliveryToSendIds: input.deliveryToSendIds,
    deliveryRecord: input.deliveryRecord,
  });

  if (input.deliveryPhase === 'prepare' && output.deliveryPrep) {
    const prep = output.deliveryPrep;
    return {
      result: {
        nodeId: input.nodeId,
        count: prep.toSendCount,
        customerIds: prep.toSendIds,
        sample: prep.sampleRecipients.slice(0, 20),
        executedAt: new Date().toISOString(),
        label: node.data.label,
      },
      nodeResults: input.nodeResults,
      deliveryPrep: prep,
    };
  }

  const updatedResults = { ...input.nodeResults };

  if (output.handles) {
    for (const [handle, ids] of Object.entries(output.handles)) {
      const sample = await fetchCustomersByIds(ids.slice(0, 20));
      updatedResults[resultKey(input.nodeId, handle)] = {
        nodeId: input.nodeId,
        handle,
        count: ids.length,
        customerIds: ids,
        sample,
        executedAt: new Date().toISOString(),
        label: node.data.label,
      };
    }
  } else {
    const nodeResult: NodePopulationResult = {
      nodeId: input.nodeId,
      count: output.ids.length,
      customerIds: output.ids,
      sample: output.rows.slice(0, 20),
      executedAt: new Date().toISOString(),
      label: node.data.label,
      query: output.query,
    };
    if (input.deliveryPhase === 'confirm' && input.deliveryRecord) {
      nodeResult.delivery = {
        ...input.deliveryRecord,
        confirmedAt: new Date().toISOString(),
      };
    }
    updatedResults[resultKey(input.nodeId)] = nodeResult;
  }

  const runStatus = 'running';

  await supabase
    .from('journey_workflow_runs')
    .update({
      status: runStatus,
      current_node_id: input.nodeId,
      node_results: updatedResults,
      started_at: new Date().toISOString(),
    })
    .eq('id', input.runId);

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'run',
    resourceType: 'journey',
    resourceId: input.journeyId,
    resourceName: input.journeyName,
    summary:
      input.deliveryPhase === 'confirm'
        ? `Confirmed delivery "${node.data.label}" — ${output.ids.length} recipients`
        : `Ran workflow step "${node.data.label}" — ${output.ids.length} profiles`,
    metadata: {
      node_id: input.nodeId,
      step_type: node.data.stepType,
      count: output.ids.length,
      delivery_phase: input.deliveryPhase,
    },
  });

  const primary =
    updatedResults[resultKey(input.nodeId)] ??
    Object.values(updatedResults).find((r) => r.nodeId === input.nodeId)!;

  return { result: primary, nodeResults: updatedResults, deliveryPrep: output.deliveryPrep };
}

export function getExecutableOrder(graph: ReturnType<typeof parseCampaignGraph>): string[] {
  const { nodes, edges } = graph;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));

  const queue = nodes
    .filter((n) => (incoming.get(n.id) ?? 0) === 0)
    .sort(compareCanvasOrder)
    .map((n) => n.id);
  const order: string[] = [];

  while (queue.length) {
    queue.sort((a, b) => compareCanvasOrder(nodeById.get(a)!, nodeById.get(b)!));
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

  return order;
}
