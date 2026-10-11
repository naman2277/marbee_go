import type { Edge, Node } from 'reactflow';
import { supabase } from './supabase';
import { parseCampaignGraph, type CampaignNodeData } from './campaign-graph';
import { paletteItem } from './campaign-nodes';
import { evaluateAudienceMembers, type Audience } from './audiences';
import { fetchSchemasWithFields } from './fetch-schemas';
import { subscribeCustomers } from './subscriptions';
import { logAudit } from './audit';

export type JourneyInstanceRow = {
  id: string;
  tenant_id: string;
  environment: string;
  journey_id: string;
  version_id: string;
  customer_id: string;
  status: 'entered' | 'active' | 'waiting' | 'completed' | 'exited' | 'failed';
  current_node_id: string | null;
  entered_at: string;
  completed_at: string | null;
  context: Record<string, unknown>;
};

export type CampaignRunStats = {
  total: number;
  active: number;
  waiting: number;
  completed: number;
  exited: number;
  failed: number;
  byNode: Record<string, number>;
};

export type RunResult = {
  enrolled: number;
  advanced: number;
  completed: number;
  errors: string[];
};

function getNode(graph: { nodes: Node<CampaignNodeData>[]; edges: Edge[] }, nodeId: string | null) {
  if (!nodeId) return null;
  return graph.nodes.find((n) => n.id === nodeId) ?? null;
}

function findEntryNode(graph: { nodes: Node<CampaignNodeData>[] }) {
  return (
    graph.nodes.find((n) => n.data.stepType === 'segment_entry') ??
    graph.nodes.find((n) => paletteItem(n.data.stepType)?.entryOnly) ??
    graph.nodes[0] ??
    null
  );
}

function outgoingEdges(graph: { edges: Edge[] }, nodeId: string, handle?: string) {
  return graph.edges.filter((e) => {
    if (e.source !== nodeId) return false;
    if (handle) return e.sourceHandle === handle;
    return !e.sourceHandle;
  });
}

function nextNodeId(
  graph: { nodes: Node<CampaignNodeData>[]; edges: Edge[] },
  fromId: string,
  handle?: string,
): string | null {
  const edges = outgoingEdges(graph, fromId, handle);
  if (!edges.length && handle) {
    return outgoingEdges(graph, fromId)[0]?.target ?? null;
  }
  return edges[0]?.target ?? null;
}

function durationMs(config: Record<string, unknown>): number {
  const value = Number(config.duration_value ?? 1);
  const unit = String(config.duration_unit ?? 'hours');
  const multipliers: Record<string, number> = {
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
    weeks: 604_800_000,
  };
  return value * (multipliers[unit] ?? 3_600_000);
}

async function fetchAudienceBySlug(
  tenantId: string,
  environment: string,
  slug: string,
): Promise<Audience | null> {
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

async function resolveAudienceMembers(
  tenantId: string,
  environment: string,
  audienceSlug: string,
  limit = 500,
): Promise<string[]> {
  const audience = await fetchAudienceBySlug(tenantId, environment, audienceSlug);
  if (!audience) return [];

  const schemas = await fetchSchemasWithFields(tenantId, environment);
  const schema = schemas.find((s) => s.slug === audience.schema_slug);
  if (!schema?.table_name) return [];

  const { members } = await evaluateAudienceMembers({
    tenantId,
    environment,
    schema,
    filterRoot: audience.filter_json,
    quickSearch: audience.quick_search ?? '',
    limit,
  });

  return members.map((m) => String(m.id)).filter(Boolean);
}

async function logInstanceEvent(
  instanceId: string,
  nodeId: string | null,
  eventType: string,
  details: Record<string, unknown> = {},
) {
  await supabase.from('journey_instance_events').insert({
    instance_id: instanceId,
    node_id: nodeId,
    event_type: eventType,
    details,
  });
}

async function fetchCustomer(customerId: string) {
  const { data, error } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
  if (error) throw error;
  return data;
}

async function hasEngagement(input: {
  tenantId: string;
  environment: string;
  customerId: string;
  channel: string;
  event: string;
  deliveryRef?: string;
  withinHours?: number;
}): Promise<boolean> {
  let query = supabase
    .from('engagement_log')
    .select('id, metadata')
    .eq('tenant_id', input.tenantId)
    .eq('environment', input.environment)
    .eq('customer_id', input.customerId)
    .eq('channel', input.channel)
    .eq('event', input.event)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (input.withinHours) {
    const since = new Date(Date.now() - input.withinHours * 3_600_000).toISOString();
    query = query.gte('timestamp', since);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!input.deliveryRef) return (data?.length ?? 0) > 0;

  return (data ?? []).some((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    const name = meta?.delivery_name ?? meta?.delivery_ref;
    return name === input.deliveryRef;
  });
}

async function hasPurchaseEvent(
  tenantId: string,
  environment: string,
  customerId: string,
  withinHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinHours * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('customer_id', customerId)
    .eq('event_type', 'purchase_completed')
    .gte('timestamp', since)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function evaluateCondition(
  stepType: string,
  config: Record<string, unknown>,
  ctx: {
    tenantId: string;
    environment: string;
    customerId: string;
  },
): Promise<boolean> {
  switch (stepType) {
    case 'condition_clicked':
      return hasEngagement({
        tenantId: ctx.tenantId,
        environment: ctx.environment,
        customerId: ctx.customerId,
        channel: 'email',
        event: 'clicked',
        deliveryRef: String(config.delivery_ref ?? ''),
        withinHours: Number(config.within_hours ?? 168),
      });
    case 'condition_opened':
      return hasEngagement({
        tenantId: ctx.tenantId,
        environment: ctx.environment,
        customerId: ctx.customerId,
        channel: 'email',
        event: 'opened',
        deliveryRef: String(config.delivery_ref ?? ''),
        withinHours: Number(config.within_hours ?? 72),
      });
    case 'condition_purchased':
      return hasPurchaseEvent(
        ctx.tenantId,
        ctx.environment,
        ctx.customerId,
        Number(config.within_hours ?? 336),
      );
    case 'condition_segment': {
      const slug = String(config.audience_slug ?? '');
      if (!slug) return false;
      const ids = await resolveAudienceMembers(ctx.tenantId, ctx.environment, slug, 5000);
      return ids.includes(ctx.customerId);
    }
    case 'condition_attribute': {
      const customer = await fetchCustomer(ctx.customerId);
      if (!customer) return false;
      const field = String(config.field ?? '');
      const op = String(config.operator ?? 'equals');
      const expected = config.value;
      const actual = (customer as Record<string, unknown>)[field];
      if (op === 'not_equals') return String(actual) !== String(expected);
      if (op === 'contains') return String(actual ?? '').includes(String(expected));
      return String(actual) === String(expected);
    }
    case 'condition_consent': {
      const customer = await fetchCustomer(ctx.customerId);
      if (!customer) return false;
      const channel = String(config.channel ?? 'email');
      return Boolean((customer as Record<string, unknown>)[`consent_${channel}`]);
    }
    case 'condition_engagement': {
      const { count } = await supabase
        .from('engagement_log')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', ctx.tenantId)
        .eq('customer_id', ctx.customerId)
        .in('event', ['clicked', 'opened', 'converted']);
      const score = count ?? 0;
      const op = String(config.operator ?? 'gte');
      const threshold = Number(config.value ?? 0);
      if (op === 'lte') return score <= threshold;
      if (op === 'equals') return score === threshold;
      return score >= threshold;
    }
    default:
      return false;
  }
}

async function executeSend(
  stepType: string,
  config: Record<string, unknown>,
  ctx: {
    tenantId: string;
    environment: string;
    customerId: string;
    journeyId: string;
    instanceContext: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const messageId = crypto.randomUUID();
  const deliveryName = String(config.delivery_name ?? 'Delivery');
  const channel =
    stepType === 'send_email' ? 'email' :
    stepType === 'send_sms' ? 'sms' :
    stepType === 'send_whatsapp' ? 'whatsapp' :
    stepType === 'send_web_push' ? 'web_push' :
    stepType === 'send_in_app' ? 'in_app' : 'email';

  if (stepType === 'send_web_push') {
    const { resolveWebPushDeliveryContent } = await import('./content-templates');
    const { resolveWebPushTargets, sendWebPushToSubscribers } = await import('./firebase-push');
    const pushContent = await resolveWebPushDeliveryContent(config);
    const targets = await resolveWebPushTargets(ctx.tenantId, ctx.environment, [ctx.customerId]);

    if (targets.length) {
      await sendWebPushToSubscribers({
        tenantId: ctx.tenantId,
        environment: ctx.environment,
        targets,
        title: pushContent.title,
        body: pushContent.body,
        clickAction: pushContent.clickAction,
        iconUrl: pushContent.iconUrl,
        imageUrl: pushContent.imageUrl,
        badgeUrl: pushContent.badgeUrl,
        tag: pushContent.tag,
        ttlSeconds: pushContent.ttlSeconds,
        actions: pushContent.actions,
        trackOpens: pushContent.trackOpens,
        journeyId: ctx.journeyId,
      });
    }

    const deliveries = {
      ...(ctx.instanceContext.deliveries as Record<string, string> | undefined),
      [deliveryName]: messageId,
    };
    return { ...ctx.instanceContext, deliveries, last_delivery: deliveryName, last_message_id: messageId };
  }

  await supabase.from('engagement_log').insert({
    tenant_id: ctx.tenantId,
    environment: ctx.environment,
    customer_id: ctx.customerId,
    channel,
    message_id: messageId,
    event: 'sent',
    journey_id: ctx.journeyId,
    metadata: {
      delivery_name: deliveryName,
      subject: config.subject,
      title: config.title,
      body: config.body,
      sandbox: true,
    },
  });

  await supabase.from('customer_delivery_log').insert({
    tenant_id: ctx.tenantId,
    environment: ctx.environment,
    customer_id: ctx.customerId,
    journey_id: ctx.journeyId,
    channel,
    message_id: messageId,
    status: 'sent',
  });

  const deliveries = {
    ...(ctx.instanceContext.deliveries as Record<string, string> | undefined),
    [deliveryName]: messageId,
  };

  return { ...ctx.instanceContext, deliveries, last_delivery: deliveryName, last_message_id: messageId };
}

async function executeAudienceAction(
  stepType: string,
  config: Record<string, unknown>,
  ctx: {
    tenantId: string;
    environment: string;
    customerId: string;
    instanceContext: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  if (stepType === 'add_to_list') {
    const lists = [...((ctx.instanceContext.lists as string[]) ?? []), String(config.list_name ?? 'List')];
    return { ...ctx.instanceContext, lists };
  }

  if (stepType === 'subscribe_service') {
    const slug = String(config.service_slug ?? '');
    if (slug) {
      const { data: service } = await supabase
        .from('information_services')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('environment', ctx.environment)
        .eq('slug', slug)
        .maybeSingle();
      if (service) {
        await subscribeCustomers({
          service,
          tenantId: ctx.tenantId,
          environment: ctx.environment,
          customerIds: [ctx.customerId],
          source: 'workflow',
        });
      }
    }
    return ctx.instanceContext;
  }

  if (stepType === 'update_profile') {
    const field = String(config.field ?? '');
    if (field) {
      await supabase.from('customers').update({ [field]: config.value }).eq('id', ctx.customerId);
    }
    return ctx.instanceContext;
  }

  return ctx.instanceContext;
}

export async function fetchCampaignRunStats(
  journeyId: string,
  graphJson: unknown,
): Promise<CampaignRunStats> {
  const graph = parseCampaignGraph(graphJson);
  const { data, error } = await supabase
    .from('journey_instances')
    .select('status, current_node_id')
    .eq('journey_id', journeyId);
  if (error) throw error;

  const rows = data ?? [];
  const byNode: Record<string, number> = {};
  graph.nodes.forEach((n) => { byNode[n.id] = 0; });

  for (const row of rows) {
    const nodeId = row.current_node_id ?? 'completed';
    byNode[nodeId] = (byNode[nodeId] ?? 0) + 1;
  }

  return {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active' || r.status === 'entered').length,
    waiting: rows.filter((r) => r.status === 'waiting').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    exited: rows.filter((r) => r.status === 'exited').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    byNode,
  };
}

export async function enrollBlastCampaign(input: {
  journeyId: string;
  versionId: string;
  tenantId: string;
  environment: string;
  canvasJson: unknown;
  customerIds?: string[];
  limit?: number;
}): Promise<number> {
  const graph = parseCampaignGraph(input.canvasJson);
  const entry = findEntryNode(graph);
  if (!entry) throw new Error('No entry node found on canvas');

  let customerIds = input.customerIds;
  if (!customerIds?.length) {
    const slug = String(entry.data.config?.audience_slug ?? '');
    if (!slug) throw new Error('Entry node has no audience configured');
    customerIds = await resolveAudienceMembers(
      input.tenantId,
      input.environment,
      slug,
      input.limit ?? 500,
    );
  }

  if (!customerIds.length) return 0;

  const { data: existing } = await supabase
    .from('journey_instances')
    .select('customer_id')
    .eq('journey_id', input.journeyId)
    .in('status', ['entered', 'active', 'waiting']);

  const activeSet = new Set((existing ?? []).map((r) => r.customer_id));
  const toEnroll = customerIds.filter((id) => !activeSet.has(id));
  if (!toEnroll.length) return 0;

  const rows = toEnroll.map((customerId) => ({
    tenant_id: input.tenantId,
    environment: input.environment,
    journey_id: input.journeyId,
    version_id: input.versionId,
    customer_id: customerId,
    status: 'active' as const,
    current_node_id: entry.id,
    context: { enrolled_at: new Date().toISOString() },
  }));

  const { data: inserted, error } = await supabase.from('journey_instances').insert(rows).select('id, customer_id');
  if (error) throw error;

  for (const inst of inserted ?? []) {
    await logInstanceEvent(inst.id, entry.id, 'enrolled', { customer_id: inst.customer_id });
  }

  return inserted?.length ?? 0;
}

async function advanceInstance(
  instance: JourneyInstanceRow,
  graph: ReturnType<typeof parseCampaignGraph>,
  journeyId: string,
): Promise<'advanced' | 'waiting' | 'done' | 'error'> {
  let node = getNode(graph, instance.current_node_id);
  if (!node) {
    node = findEntryNode(graph);
    if (!node) return 'error';
  }

  const stepType = node.data.stepType;
  const config = node.data.config ?? {};
  let context = { ...instance.context };
  const execCtx = {
    tenantId: instance.tenant_id,
    environment: instance.environment,
    customerId: instance.customer_id,
    journeyId,
    instanceContext: context,
  };

  if (paletteItem(stepType)?.entryOnly && stepType !== 'segment_entry') {
    const next = nextNodeId(graph, node.id);
    await supabase.from('journey_instances').update({
      current_node_id: next,
      status: next ? 'active' : 'completed',
      completed_at: next ? null : new Date().toISOString(),
    }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, 'passed_entry', { stepType });
    return next ? 'advanced' : 'done';
  }

  if (stepType === 'segment_entry') {
    const next = nextNodeId(graph, node.id);
    await supabase.from('journey_instances').update({ current_node_id: next, status: 'active' }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, 'segment_entered', config);
    return 'advanced';
  }

  if (stepType.startsWith('wait_')) {
    const waitUntil = context.wait_until as string | undefined;
    const waitNodeId = context.wait_node_id as string | undefined;
    const forceWaits = Boolean(context._force_waits);

    if (waitNodeId !== node.id || !waitUntil) {
      const until = forceWaits
        ? new Date().toISOString()
        : new Date(Date.now() + durationMs(config)).toISOString();
      if (forceWaits) {
        context = { ...context, wait_until: until, wait_node_id: node.id };
      } else {
        await supabase.from('journey_instances').update({
          status: 'waiting',
          context: { ...context, wait_until: until, wait_node_id: node.id },
        }).eq('id', instance.id);
        await logInstanceEvent(instance.id, node.id, 'waiting', { until });
        return 'waiting';
      }
    }

    if (!forceWaits && waitUntil && new Date(waitUntil).getTime() > Date.now()) return 'waiting';

    context = { ...context, wait_until: undefined, wait_node_id: undefined };
    const next = nextNodeId(graph, node.id);
    await supabase.from('journey_instances').update({
      current_node_id: next,
      status: next ? 'active' : 'completed',
      context,
      completed_at: next ? null : new Date().toISOString(),
    }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, 'wait_completed', {});
    return next ? 'advanced' : 'done';
  }

  if (stepType.startsWith('send_')) {
    context = await executeSend(stepType, config, execCtx);
    const next = nextNodeId(graph, node.id);
    await supabase.from('journey_instances').update({
      current_node_id: next,
      status: next ? 'active' : 'completed',
      context,
      completed_at: next ? null : new Date().toISOString(),
    }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, 'message_sent', { stepType, delivery_name: config.delivery_name });
    return next ? 'advanced' : 'done';
  }

  if (stepType.startsWith('condition_')) {
    const result = await evaluateCondition(stepType, config, execCtx);
    const handle = result ? 'yes' : 'no';
    const next = nextNodeId(graph, node.id, handle);
    await supabase.from('journey_instances').update({
      current_node_id: next,
      status: next ? 'active' : 'completed',
      context,
      completed_at: next ? null : new Date().toISOString(),
    }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, 'condition_evaluated', { result, handle });
    return next ? 'advanced' : 'done';
  }

  if (stepType === 'split_ab' || stepType === 'split_random') {
    const pct = Number(config.split_a_percent ?? 50);
    const handle = Math.random() * 100 < pct ? 'a' : 'b';
    const next = nextNodeId(graph, node.id, handle);
    await supabase.from('journey_instances').update({
      current_node_id: next,
      status: next ? 'active' : 'completed',
    }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, 'split', { handle });
    return next ? 'advanced' : 'done';
  }

  if (stepType === 'merge_paths' || stepType === 'webhook') {
    const next = nextNodeId(graph, node.id);
    await supabase.from('journey_instances').update({
      current_node_id: next,
      status: next ? 'active' : 'completed',
    }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, stepType, config);
    return next ? 'advanced' : 'done';
  }

  if (
    stepType.startsWith('add_to_') ||
    stepType === 'subscribe_service' ||
    stepType === 'unsubscribe_service' ||
    stepType === 'update_profile'
  ) {
    context = await executeAudienceAction(stepType, config, execCtx);
    const next = nextNodeId(graph, node.id);
    await supabase.from('journey_instances').update({
      current_node_id: next,
      status: next ? 'active' : 'completed',
      context,
      completed_at: next ? null : new Date().toISOString(),
    }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, 'audience_action', { stepType });
    return next ? 'advanced' : 'done';
  }

  if (stepType === 'exit' || paletteItem(stepType)?.terminal) {
    await supabase.from('journey_instances').update({
      status: 'exited',
      completed_at: new Date().toISOString(),
      context: { ...context, exit_reason: config.reason },
    }).eq('id', instance.id);
    await logInstanceEvent(instance.id, node.id, 'exited', config);
    return 'done';
  }

  const fallbackNext = nextNodeId(graph, node.id);
  await supabase.from('journey_instances').update({
    current_node_id: fallbackNext,
    status: fallbackNext ? 'active' : 'completed',
  }).eq('id', instance.id);
  return fallbackNext ? 'advanced' : 'done';
}

export async function processCampaignTick(input: {
  journeyId: string;
  canvasJson: unknown;
  maxInstances?: number;
  maxStepsPerInstance?: number;
  forceWaits?: boolean;
}): Promise<Omit<RunResult, 'enrolled'>> {
  const graph = parseCampaignGraph(input.canvasJson);
  const maxInstances = input.maxInstances ?? 100;
  const maxSteps = input.maxStepsPerInstance ?? 20;

  const { data: instances, error } = await supabase
    .from('journey_instances')
    .select('*')
    .eq('journey_id', input.journeyId)
    .in('status', ['entered', 'active', 'waiting'])
    .limit(maxInstances);

  if (error) throw error;

  let advanced = 0;
  let completed = 0;
  const errors: string[] = [];

  for (const raw of instances ?? []) {
    const instance = raw as JourneyInstanceRow;
    if (input.forceWaits) {
      instance.context = { ...instance.context, _force_waits: true };
    }
    try {
      for (let step = 0; step < maxSteps; step++) {
        const result = await advanceInstance(instance, graph, input.journeyId);
        if (result === 'waiting') break;
        if (result === 'done') {
          completed += 1;
          break;
        }
        if (result === 'advanced') {
          advanced += 1;
          const { data: refreshed } = await supabase
            .from('journey_instances')
            .select('*')
            .eq('id', instance.id)
            .single();
          if (refreshed) Object.assign(instance, refreshed);
          continue;
        }
        if (result === 'error') {
          errors.push(`Instance ${instance.id}: could not advance`);
          break;
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Advance failed');
    }
  }

  return { advanced, completed, errors };
}

export async function launchBlastCampaign(input: {
  journeyId: string;
  versionId: string;
  tenantId: string;
  environment: string;
  canvasJson: unknown;
  journeyName: string;
  testMode?: boolean;
}): Promise<RunResult> {
  const { data: journeyRow } = await supabase
    .from('journeys')
    .select('status')
    .eq('id', input.journeyId)
    .maybeSingle();
  if (journeyRow?.status === 'paused') {
    return { enrolled: 0, advanced: 0, completed: 0, errors: ['Campaign is paused — resume it to deliver.'] };
  }

  const enrolled = await enrollBlastCampaign({
    journeyId: input.journeyId,
    versionId: input.versionId,
    tenantId: input.tenantId,
    environment: input.environment,
    canvasJson: input.canvasJson,
    limit: input.testMode ? 5 : 500,
  });

  const tick = await processCampaignTick({
    journeyId: input.journeyId,
    canvasJson: input.canvasJson,
    maxInstances: input.testMode ? 5 : 200,
  });

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'run',
    resourceType: 'journey',
    resourceId: input.journeyId,
    resourceName: input.journeyName,
    summary: input.testMode
      ? `Test run: enrolled ${enrolled}, advanced ${tick.advanced} steps`
      : `Launched blast: enrolled ${enrolled}, advanced ${tick.advanced} steps`,
    metadata: { enrolled, ...tick, testMode: input.testMode ?? false },
  });

  return { enrolled, ...tick };
}

export async function publishJourney(
  journeyId: string,
  tenantId: string,
  environment: string,
  name: string,
) {
  const { error } = await supabase.from('journeys').update({ status: 'published' }).eq('id', journeyId);
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'publish',
    resourceType: 'journey',
    resourceId: journeyId,
    resourceName: name,
    summary: `Published journey "${name}"`,
  });
}

export async function simulateEmailClick(input: {
  tenantId: string;
  environment: string;
  customerId: string;
  deliveryName: string;
  journeyId?: string;
}) {
  await supabase.from('engagement_log').insert({
    tenant_id: input.tenantId,
    environment: input.environment,
    customer_id: input.customerId,
    channel: 'email',
    message_id: crypto.randomUUID(),
    event: 'clicked',
    journey_id: input.journeyId ?? null,
    metadata: { delivery_name: input.deliveryName, simulated: true },
  });
}
