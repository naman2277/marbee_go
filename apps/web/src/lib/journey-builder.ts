/**
 * Journey builder model — AJO / SFMC-style flow journeys.
 *
 * This module layers a cleaner "activity" taxonomy, an explicit entry step, journey
 * settings, validation and versioned publish on top of the existing flow-journey graph
 * format. It never forks the step-type registry (`campaign-nodes.ts`) or the graph
 * codecs (`campaign-graph.ts`) — the saved `journey_versions.canvas_json` stays
 * byte-compatible with the runtime engine (`journey-runner.ts`).
 */
import type { Edge, Node } from 'reactflow';
import { supabase } from './supabase';
import { logAudit } from './audit';
import {
  defaultConfigForType,
  paletteItem,
  type CampaignIconKey,
} from './campaign-nodes';
import {
  parseCampaignGraph,
  serializeCampaignGraph,
  validateCampaign,
  type CampaignNodeData,
} from './campaign-graph';
import type { CampaignSettings } from './journeys';

/* ------------------------------------------------------------------ *
 * Activity taxonomy
 * ------------------------------------------------------------------ */

export type JourneyActivityKind =
  | 'entry'
  | 'message'
  | 'wait'
  | 'decision'
  | 'split'
  | 'merge'
  | 'action'
  | 'webhook'
  | 'exit';

export type JourneyActivityDef = {
  stepType: string;
  label: string;
  description: string;
  icon: CampaignIconKey;
  accent: string;
  kind: JourneyActivityKind;
  /** Branch outputs (yes/no, A/B) when the activity forks the flow. */
  branches?: { id: string; label: string }[];
  /** Offered by the "+ insert activity between" edge menu. */
  insertable: boolean;
  entryOnly?: boolean;
  terminal?: boolean;
};

export type JourneyActivityGroupId = 'entry' | 'messages' | 'flow' | 'data' | 'exit';

export type JourneyActivityGroup = {
  id: JourneyActivityGroupId;
  label: string;
  description: string;
  items: JourneyActivityDef[];
};

function defFromStep(
  stepType: string,
  kind: JourneyActivityKind,
  over?: Partial<JourneyActivityDef>,
): JourneyActivityDef {
  const meta = paletteItem(stepType);
  const branches = meta?.outputs?.map((o) => ({ id: o.id, label: o.label }));
  const entryOnly = Boolean(meta?.entryOnly);
  const terminal = Boolean(meta?.terminal);
  const insertable =
    over?.insertable ??
    (!entryOnly && !terminal && !(branches && branches.length > 0) && kind !== 'merge');
  return {
    stepType,
    label: over?.label ?? meta?.label ?? stepType,
    description: over?.description ?? meta?.description ?? '',
    icon: (over?.icon ?? meta?.icon ?? 'zap') as CampaignIconKey,
    accent: over?.accent ?? meta?.accent ?? '#6366f1',
    kind,
    branches,
    insertable,
    entryOnly,
    terminal,
  };
}

export const JOURNEY_ACTIVITY_GROUPS: JourneyActivityGroup[] = [
  {
    id: 'entry',
    label: 'Entry',
    description: 'How customers enter the journey — configured in the Entry tab',
    items: [
      defFromStep('segment_entry', 'entry', { label: 'Audience', description: 'Batch read of an audience / segment' }),
      defFromStep('event_trigger', 'entry', { label: 'Event', description: 'Real-time behavioural event' }),
      defFromStep('schedule_blast', 'entry', { label: 'Schedule', description: 'One-time or recurring scheduled entry' }),
      defFromStep('subscription_entry', 'entry', { label: 'Service subscribers', description: 'Subscribers of an information service' }),
    ],
  },
  {
    id: 'messages',
    label: 'Messages',
    description: 'Reach the customer on a channel',
    items: [
      defFromStep('send_email', 'message'),
      defFromStep('send_sms', 'message'),
      defFromStep('send_web_push', 'message'),
      defFromStep('send_whatsapp', 'message'),
      defFromStep('send_rcs', 'message'),
      defFromStep('send_in_app', 'message'),
    ],
  },
  {
    id: 'flow',
    label: 'Flow control',
    description: 'Wait, branch and split the flow',
    items: [
      defFromStep('wait_duration', 'wait'),
      defFromStep('wait_until', 'wait'),
      defFromStep('wait_until_event', 'wait'),
      defFromStep('condition_attribute', 'decision', { label: 'Decision split', description: 'Branch on a profile attribute' }),
      defFromStep('condition_clicked', 'decision'),
      defFromStep('condition_opened', 'decision'),
      defFromStep('condition_purchased', 'decision'),
      defFromStep('condition_segment', 'decision'),
      defFromStep('condition_engagement', 'decision'),
      defFromStep('condition_consent', 'decision'),
      defFromStep('split_ab', 'split'),
      defFromStep('split_random', 'split'),
      defFromStep('merge_paths', 'merge'),
      defFromStep('webhook', 'webhook'),
    ],
  },
  {
    id: 'data',
    label: 'Data & Audience',
    description: 'Update the profile or audience membership',
    items: [
      defFromStep('add_to_audience', 'action'),
      defFromStep('add_to_list', 'action'),
      defFromStep('subscribe_service', 'action'),
      defFromStep('unsubscribe_service', 'action'),
      defFromStep('update_profile', 'action'),
    ],
  },
  {
    id: 'exit',
    label: 'Exit',
    description: 'End the journey for the customer',
    items: [defFromStep('exit', 'exit')],
  },
];

const ACTIVITY_BY_STEP = new Map<string, JourneyActivityDef>(
  JOURNEY_ACTIVITY_GROUPS.flatMap((g) => g.items.map((i) => [i.stepType, i] as const)),
);

export function journeyActivityDef(stepType: string): JourneyActivityDef | undefined {
  return ACTIVITY_BY_STEP.get(stepType);
}

export function insertableActivities(): JourneyActivityDef[] {
  return JOURNEY_ACTIVITY_GROUPS.flatMap((g) => g.items).filter((i) => i.insertable);
}

/* ------------------------------------------------------------------ *
 * Curated event catalogue (free-text fallback in the UI)
 * ------------------------------------------------------------------ */

export const JOURNEY_EVENT_TYPES: { value: string; label: string; description: string }[] = [
  { value: 'cart_abandoned', label: 'Cart abandoned', description: 'Items left in cart without checkout' },
  { value: 'checkout_started', label: 'Checkout started', description: 'Customer began the checkout flow' },
  { value: 'purchase_completed', label: 'Purchase completed', description: 'Order placed successfully' },
  { value: 'product_viewed', label: 'Product viewed', description: 'Viewed a product detail page' },
  { value: 'page_viewed', label: 'Page viewed', description: 'Any tracked page view' },
  { value: 'signup_completed', label: 'Signup completed', description: 'New account created' },
  { value: 'form_submitted', label: 'Form submitted', description: 'A Marbee form was submitted' },
  { value: 'subscription_renewed', label: 'Subscription renewed', description: 'Recurring subscription renewed' },
  { value: 'app_opened', label: 'App opened', description: 'Mobile app session started' },
  { value: 'support_ticket_opened', label: 'Support ticket opened', description: 'Customer contacted support' },
];

/* ------------------------------------------------------------------ *
 * Small coercion helpers
 * ------------------------------------------------------------------ */

function str(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  return String(v);
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/* ------------------------------------------------------------------ *
 * Entry configuration — "how customers enter" + selection criteria
 * ------------------------------------------------------------------ */

export type EntrySourceType = 'audience' | 'event' | 'schedule' | 'api' | 'subscription';
export type JourneyReEntryMode = 'none' | 'anytime' | 'after_exit';

export type JourneyScheduleConfig = {
  mode: 'one_time' | 'recurring';
  cron?: string;
  timezone?: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type EntryConfig = {
  sourceType: EntrySourceType;
  audienceSlug?: string;
  audienceName?: string;
  /** Advisory selection filter (FilterRoot). Not yet enforced by journey-runner. */
  extraFilter?: unknown | null;
  eventType?: string;
  serviceSlug?: string;
  serviceName?: string;
  schedule?: JourneyScheduleConfig;
  reEntry: JourneyReEntryMode;
};

const ENTRY_SOURCE_TO_STEP: Record<EntrySourceType, string> = {
  audience: 'segment_entry',
  event: 'event_trigger',
  schedule: 'schedule_blast',
  api: 'event_trigger',
  subscription: 'subscription_entry',
};

export function entryStepTypeFor(sourceType: EntrySourceType): string {
  return ENTRY_SOURCE_TO_STEP[sourceType] ?? 'segment_entry';
}

export const ENTRY_SOURCE_LABELS: Record<EntrySourceType, string> = {
  audience: 'Audience batch',
  event: 'Event trigger',
  schedule: 'Schedule',
  api: 'API / data source',
  subscription: 'Service subscribers',
};

export function isEntryNode(node: Node<CampaignNodeData> | null | undefined): boolean {
  return Boolean(node && paletteItem(node.data.stepType)?.entryOnly);
}

export function findEntryNode(
  nodes: Node<CampaignNodeData>[],
): Node<CampaignNodeData> | undefined {
  return (
    nodes.find((n) => n.data.stepType === 'segment_entry') ??
    nodes.find((n) => paletteItem(n.data.stepType)?.entryOnly)
  );
}

export function entrySourceTypeFromNode(
  node: Node<CampaignNodeData> | null | undefined,
): EntrySourceType {
  if (!node) return 'audience';
  const cfg = node.data.config ?? {};
  switch (node.data.stepType) {
    case 'event_trigger':
      return cfg.entry_source === 'api' ? 'api' : 'event';
    case 'schedule_blast':
      return 'schedule';
    case 'subscription_entry':
      return 'subscription';
    default:
      return 'audience';
  }
}

export function entryConfigFromNode(
  entryNode: Node<CampaignNodeData> | null | undefined,
  journey?: {
    entry_trigger_config?: Record<string, unknown> | null;
    settings?: CampaignSettings | null;
    starts_at?: string | null;
    ends_at?: string | null;
  } | null,
): EntryConfig {
  const nodeCfg = (entryNode?.data.config ?? {}) as Record<string, unknown>;
  const mirror = (journey?.entry_trigger_config ?? {}) as Record<string, unknown>;
  const builder = (journey?.settings?.journey_builder ?? {}) as Record<string, unknown>;
  const sourceType = entrySourceTypeFromNode(entryNode);
  const cron = str(nodeCfg.schedule) ?? str(mirror.schedule);

  return {
    sourceType,
    audienceSlug: str(nodeCfg.audience_slug) ?? str(mirror.audience_slug),
    audienceName: str(nodeCfg.audience_name) ?? str(mirror.audience_name),
    extraFilter: nodeCfg.selection_filter ?? mirror.selection_filter ?? null,
    eventType: str(nodeCfg.event_type) ?? str(mirror.event_type),
    serviceSlug: str(nodeCfg.service_slug) ?? str(mirror.service_slug),
    serviceName: str(nodeCfg.service_name) ?? str(mirror.service_name),
    schedule: {
      mode:
        (str(nodeCfg.schedule_mode) as 'one_time' | 'recurring' | undefined) ??
        (str(mirror.schedule_mode) as 'one_time' | 'recurring' | undefined) ??
        (cron ? 'recurring' : 'one_time'),
      cron,
      timezone: str(nodeCfg.timezone) ?? str(mirror.timezone) ?? 'Asia/Kolkata',
      startsAt: journey?.starts_at ?? (str(mirror.starts_at) || null),
      endsAt: journey?.ends_at ?? (str(mirror.ends_at) || null),
    },
    reEntry:
      (str(nodeCfg.re_entry) as JourneyReEntryMode | undefined) ??
      (str(builder.re_entry) as JourneyReEntryMode | undefined) ??
      (str(mirror.re_entry) as JourneyReEntryMode | undefined) ??
      'none',
  };
}

/** Writes the engine keys the runtime reads onto the on-canvas entry node. */
export function applyEntryConfigToNode(
  node: Node<CampaignNodeData>,
  cfg: EntryConfig,
): Node<CampaignNodeData> {
  const stepType = entryStepTypeFor(cfg.sourceType);
  const meta = paletteItem(stepType);
  const prevMeta = paletteItem(node.data.stepType);
  const config: Record<string, unknown> = {
    ...defaultConfigForType(stepType),
    ...node.data.config,
  };

  // Reset cross-source keys, then set the ones this source needs.
  delete config.audience_slug;
  delete config.audience_name;
  delete config.event_type;
  delete config.service_slug;
  delete config.service_name;
  config.entry_source = cfg.sourceType === 'api' ? 'api' : undefined;

  if (cfg.sourceType === 'audience') {
    config.audience_slug = cfg.audienceSlug ?? '';
    config.audience_name = cfg.audienceName ?? '';
  } else if (cfg.sourceType === 'event' || cfg.sourceType === 'api') {
    config.event_type =
      cfg.sourceType === 'api' ? cfg.eventType || 'api_enrollment' : cfg.eventType ?? '';
  } else if (cfg.sourceType === 'schedule') {
    config.schedule = cfg.schedule?.cron ?? String(config.schedule ?? '0 9 * * 1');
    config.schedule_mode = cfg.schedule?.mode ?? 'recurring';
    config.timezone = cfg.schedule?.timezone ?? 'Asia/Kolkata';
  } else if (cfg.sourceType === 'subscription') {
    config.service_slug = cfg.serviceSlug ?? '';
    config.service_name = cfg.serviceName ?? '';
  }

  config.selection_filter = cfg.extraFilter ?? undefined;
  config.re_entry = cfg.reEntry;

  // Keep a user-renamed label; otherwise track the entry-type default label.
  const wasDefaultLabel = !node.data.label || node.data.label === prevMeta?.label;
  const label = wasDefaultLabel ? meta?.label ?? node.data.label : node.data.label;

  return { ...node, data: { ...node.data, stepType, label, config } };
}

/** Denormalised mirror persisted to `journeys.entry_trigger_config`. */
export function entryTriggerConfigMirror(cfg: EntryConfig): Record<string, unknown> {
  return {
    type: cfg.sourceType,
    audience_slug: cfg.audienceSlug ?? null,
    audience_name: cfg.audienceName ?? null,
    event_type: cfg.eventType ?? null,
    service_slug: cfg.serviceSlug ?? null,
    schedule: cfg.schedule?.cron ?? null,
    schedule_mode: cfg.schedule?.mode ?? null,
    timezone: cfg.schedule?.timezone ?? null,
    starts_at: cfg.schedule?.startsAt ?? null,
    ends_at: cfg.schedule?.endsAt ?? null,
    re_entry: cfg.reEntry,
    selection_filter: cfg.extraFilter ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Journey settings — re-entry, exit criteria, goal, quiet hours
 * ------------------------------------------------------------------ */

export type JourneyExitCriteria = {
  audienceSlug?: string;
  eventType?: string;
  withinHours?: number;
};

export type JourneyGoal = {
  eventType?: string;
  windowHours?: number;
};

export type JourneyQuietHours = {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
};

export type JourneySettings = {
  reEntry: JourneyReEntryMode;
  exitCriteria: JourneyExitCriteria;
  goal: JourneyGoal;
  quietHours: JourneyQuietHours;
};

export function defaultJourneySettings(): JourneySettings {
  return {
    reEntry: 'none',
    exitCriteria: {},
    goal: {},
    quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'Asia/Kolkata' },
  };
}

export function journeySettingsFromRow(
  journey?: { settings?: CampaignSettings | null } | null,
): JourneySettings {
  const builder = (journey?.settings?.journey_builder ?? {}) as Record<string, unknown>;
  const exit = (builder.exit_criteria ?? {}) as Record<string, unknown>;
  const goal = (builder.goal ?? {}) as Record<string, unknown>;
  const quiet = (builder.quiet_hours ?? {}) as Record<string, unknown>;
  const base = defaultJourneySettings();
  return {
    reEntry: (str(builder.re_entry) as JourneyReEntryMode | undefined) ?? base.reEntry,
    exitCriteria: {
      audienceSlug: str(exit.audience_slug),
      eventType: str(exit.event_type),
      withinHours: num(exit.within_hours),
    },
    goal: {
      eventType: str(goal.event_type),
      windowHours: num(goal.window_hours),
    },
    quietHours: {
      enabled: Boolean(quiet.enabled),
      start: str(quiet.start) ?? base.quietHours.start,
      end: str(quiet.end) ?? base.quietHours.end,
      timezone: str(quiet.timezone) ?? base.quietHours.timezone,
    },
  };
}

/** Shallow-merges under `journeys.settings` — preserves `journey_type` + campaign keys. */
export function settingsPatchFromJourneySettings(next: JourneySettings): {
  settings: Partial<CampaignSettings>;
} {
  return {
    settings: {
      journey_builder: {
        re_entry: next.reEntry,
        exit_criteria: {
          audience_slug: next.exitCriteria.audienceSlug ?? null,
          event_type: next.exitCriteria.eventType ?? null,
          within_hours: next.exitCriteria.withinHours ?? null,
        },
        goal: {
          event_type: next.goal.eventType ?? null,
          window_hours: next.goal.windowHours ?? null,
        },
        quiet_hours: {
          enabled: next.quietHours.enabled,
          start: next.quietHours.start,
          end: next.quietHours.end,
          timezone: next.quietHours.timezone,
        },
      },
    },
  };
}

/* ------------------------------------------------------------------ *
 * Graph helpers — hydrate / serialize / starter template
 * ------------------------------------------------------------------ */

export const JOURNEY_NODE_TYPE = 'journeyActivity';
export const JOURNEY_EDGE_TYPE = 'journeyEdge';

export type JourneyEdgeData = { branchLabel?: string };

export function mkActivityNode(
  id: string,
  stepType: string,
  label: string,
  x: number,
  y: number,
  config?: Record<string, unknown>,
): Node<CampaignNodeData> {
  return {
    id,
    type: JOURNEY_NODE_TYPE,
    position: { x, y },
    data: { label, stepType, config: config ?? defaultConfigForType(stepType) },
  };
}

export function mkJourneyEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  branchLabel?: string,
): Edge<JourneyEdgeData> {
  return {
    id,
    source,
    target,
    sourceHandle,
    type: JOURNEY_EDGE_TYPE,
    label: branchLabel,
    data: branchLabel ? { branchLabel } : undefined,
  };
}

export function buildJourneyStarterGraph(): {
  nodes: Node<CampaignNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<CampaignNodeData>[] = [
    mkActivityNode('entry', 'segment_entry', 'Audience entry', 80, 200, {
      ...defaultConfigForType('segment_entry'),
      re_entry: 'none',
    }),
    mkActivityNode('welcome', 'send_email', 'Welcome message', 440, 200),
    mkActivityNode('exit', 'exit', 'Exit journey', 800, 200),
  ];
  const edges: Edge[] = [
    mkJourneyEdge('e-entry-welcome', 'entry', 'welcome'),
    mkJourneyEdge('e-welcome-exit', 'welcome', 'exit'),
  ];
  return { nodes, edges };
}

/** Parse `canvas_json` and remap to the builder node/edge types (falls back to starter). */
export function hydrateJourneyGraph(canvasJson: unknown): {
  nodes: Node<CampaignNodeData>[];
  edges: Edge[];
} {
  const parsed = parseCampaignGraph(canvasJson);
  if (!parsed.nodes.length) return buildJourneyStarterGraph();
  return {
    nodes: parsed.nodes.map((n) => ({ ...n, type: JOURNEY_NODE_TYPE })),
    edges: parsed.edges.map((e) => ({
      ...e,
      type: JOURNEY_EDGE_TYPE,
      data: {
        ...(e.data as Record<string, unknown> | undefined),
        branchLabel:
          (e.data as JourneyEdgeData | undefined)?.branchLabel ??
          (typeof e.label === 'string' ? e.label : undefined),
      },
    })),
  };
}

/** Serialize back to the engine-compatible `{nodes,edges}` shape (campaignStep / campaignThread). */
export function serializeJourneyGraph(
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
): ReturnType<typeof serializeCampaignGraph> {
  return serializeCampaignGraph(
    nodes.map((n) => ({ ...n, type: 'campaignStep' })),
    edges.map((e) => ({
      ...e,
      type: 'campaignThread',
      label: (e.data as JourneyEdgeData | undefined)?.branchLabel ?? e.label,
    })),
  );
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export type JourneyValidationIssue = { nodeId?: string; message: string };
export type JourneyValidationResult = {
  ok: boolean;
  errors: JourneyValidationIssue[];
  warnings: JourneyValidationIssue[];
};

function channelNodeHasContent(config: Record<string, unknown>): boolean {
  const dc = config.delivery_content as Record<string, unknown> | undefined;
  return Boolean(
    config.content_template_id ||
      config.subject ||
      config.title ||
      config.body ||
      config.content ||
      (dc && Object.keys(dc).length > 0),
  );
}

export function validateJourney(
  nodes: Node<CampaignNodeData>[],
  edges: Edge[],
  entry: EntryConfig,
  settings: JourneySettings,
): JourneyValidationResult {
  const errors: JourneyValidationIssue[] = [];
  const warnings: JourneyValidationIssue[] = [];

  for (const m of validateCampaign(nodes, edges, 'flow').messages) errors.push({ message: m });

  const entryNode = findEntryNode(nodes);
  if (!entryNode) {
    errors.push({ message: 'Add an entry step so customers can enter the journey' });
  } else {
    if (entry.sourceType === 'audience' && !entry.audienceSlug) {
      errors.push({ nodeId: entryNode.id, message: 'Choose an entry audience in the Entry tab' });
    }
    if (entry.sourceType === 'event' && !entry.eventType) {
      errors.push({ nodeId: entryNode.id, message: 'Choose an entry event in the Entry tab' });
    }
    if (entry.sourceType === 'subscription' && !entry.serviceSlug) {
      errors.push({ nodeId: entryNode.id, message: 'Choose an information service in the Entry tab' });
    }
    if (entry.sourceType === 'schedule' && !entry.schedule?.cron && !entry.schedule?.startsAt) {
      errors.push({ nodeId: entryNode.id, message: 'Set a schedule in the Entry tab' });
    }
    if (!edges.some((e) => e.source === entryNode.id)) {
      errors.push({ nodeId: entryNode.id, message: 'Connect the entry step to the first activity' });
    }
  }

  for (const n of nodes) {
    const cfg = n.data.config ?? {};
    if (n.data.stepType.startsWith('send_') && !channelNodeHasContent(cfg)) {
      errors.push({ nodeId: n.id, message: `"${n.data.label}" has no message content` });
    }
    if (n.data.stepType === 'wait_duration' && !Number(cfg.duration_value)) {
      warnings.push({
        nodeId: n.id,
        message: `"${n.data.label}" waits for 0 — it passes through immediately`,
      });
    }
    if (n.data.stepType === 'webhook' && !cfg.url) {
      warnings.push({ nodeId: n.id, message: `"${n.data.label}" has no URL configured` });
    }
  }

  // Reachability from the entry step.
  if (entryNode) {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const seen = new Set<string>([entryNode.id]);
    const stack = [entryNode.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nx of adj.get(cur) ?? []) {
        if (!seen.has(nx)) {
          seen.add(nx);
          stack.push(nx);
        }
      }
    }
    for (const n of nodes) {
      if (!seen.has(n.id)) {
        warnings.push({ nodeId: n.id, message: `"${n.data.label}" is not reachable from the entry step` });
      }
    }
  }

  if (!nodes.some((n) => n.data.stepType === 'exit')) {
    warnings.push({
      message: 'No Exit step — customers complete the journey at the last activity',
    });
  }

  if (settings.goal.eventType && !settings.goal.windowHours) {
    warnings.push({ message: 'Conversion goal has no measurement window' });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ------------------------------------------------------------------ *
 * Versioned publish
 * ------------------------------------------------------------------ */

export async function publishJourneyFlow(input: {
  journeyId: string;
  tenantId: string;
  environment: string;
  name: string;
  currentVersionId: string;
  canvasJson: unknown;
  publishedBy: string | null;
}): Promise<{ newVersionId: string; versionNumber: number; publishedVersionNumber: number }> {
  const { data: vers, error: vErr } = await supabase
    .from('journey_versions')
    .select('id, version_number')
    .eq('journey_id', input.journeyId)
    .order('version_number', { ascending: false });
  if (vErr) throw vErr;

  const publishedVersionNumber =
    vers?.find((v) => v.id === input.currentVersionId)?.version_number ??
    vers?.[0]?.version_number ??
    1;
  const nextNumber = (vers?.[0]?.version_number ?? 0) + 1;

  // 1. Freeze the current version as the published snapshot.
  const { error: stampErr } = await supabase
    .from('journey_versions')
    .update({ published_at: new Date().toISOString(), published_by: input.publishedBy })
    .eq('id', input.currentVersionId);
  if (stampErr) throw stampErr;

  // 2. Create the fresh editable draft (must exist before the FK repoint).
  const { data: draft, error: insErr } = await supabase
    .from('journey_versions')
    .insert({
      journey_id: input.journeyId,
      version_number: nextNumber,
      canvas_json: (input.canvasJson ?? { nodes: [], edges: [] }) as Record<string, unknown>,
    })
    .select('id, version_number')
    .single();
  if (insErr) throw insErr;

  // 3. Repoint current_version_id + publish.
  const { error: jErr } = await supabase
    .from('journeys')
    .update({ current_version_id: draft.id, status: 'published' })
    .eq('id', input.journeyId)
    .eq('tenant_id', input.tenantId)
    .eq('environment', input.environment);
  if (jErr) throw jErr;

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'publish',
    resourceType: 'journey',
    resourceId: input.journeyId,
    resourceName: input.name,
    summary: `Published "${input.name}" — snapshot v${publishedVersionNumber}, editing continues on v${nextNumber}`,
  });

  return {
    newVersionId: draft.id,
    versionNumber: draft.version_number,
    publishedVersionNumber,
  };
}
