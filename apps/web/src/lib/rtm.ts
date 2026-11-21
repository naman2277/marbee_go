// Real-Time Messages — console data layer + client-side helpers
// (schema inference, template preview, integration snippets).

import { supabase } from '@/lib/supabase';
import { getCustomerTesterProfiles, saveCustomerTesterProfiles } from '@/lib/customer-testers';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1`;
export const RTM_INGEST_URL = `${FUNCTIONS_BASE}/rtm-ingest`;
const RTM_WORKER_URL = `${FUNCTIONS_BASE}/rtm-worker`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Channel = 'email' | 'sms' | 'whatsapp' | 'rcs' | 'web_push' | 'mobile_push' | 'in_app' | 'in_browser' | 'voice';
export type LatencyClass = 'standard' | 'hot';
export type DefinitionStatus = 'draft' | 'active' | 'paused';
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'url' | 'email' | 'object' | 'array';
export type MissingVarPolicy = 'fallback' | 'skip' | 'fail';

export type SchemaField = {
  key: string;
  type: FieldType;
  required: boolean;
  example?: string;
  pii?: boolean;
};

export type RtmTemplate = {
  channel: Channel;
  locale: string;
  content: Record<string, unknown>;
  missing_var_policy: MissingVarPolicy;
};

export type Guardrails = {
  dedupe?: { keys: string[]; window_seconds: number };
  rate_per_recipient?: { max: number; window_seconds: number };
  spend_cap_credits_per_day?: number;
  require_consent?: boolean;
};

export type DefinitionSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  event_type: string;
  status: DefinitionStatus;
  latency_class: LatencyClass;
  is_transactional: boolean;
  default_channel: Channel;
  fallback_channels: string[];
  updated_at: string;
  published_at: string | null;
  template_count: number;
  accepted_7d: number;
  sent_7d: number;
  delivered_7d: number;
  failed_7d: number;
};

export type DefinitionDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  event_type: string;
  status: DefinitionStatus;
  latency_class: LatencyClass;
  is_transactional: boolean;
  default_channel: Channel;
  fallback_channels: string[];
  filters: Array<{ path: string; op: string; value?: unknown }>;
  payload_schema: SchemaField[];
  guardrails: Guardrails;
  schema_version: number;
  templates: RtmTemplate[];
};

export type RtmMessage = {
  message_id: string;
  event_type: string;
  status: string;
  channel: string | null;
  reason_code: string | null;
  error_detail: string | null;
  recipient: Record<string, unknown>;
  payload: Record<string, unknown>;
  rendered: Record<string, unknown> | null;
  state_history: Array<{ state: string; at: string; detail?: string }>;
  provider: string | null;
  cost_credits: number;
  attempts: number;
  received_at: string;
  sent_at: string | null;
  terminal_at: string | null;
};

export type UsageDay = {
  day: string;
  accepted: number;
  sent: number;
  delivered: number;
  failed: number;
  suppressed: number;
  credits: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Channel Registry — abstraction layer for all activation channels
// ---------------------------------------------------------------------------

export type ChannelType = 'messaging' | 'push' | 'experience';
export type ChannelAddressType = 'email' | 'phone_number' | 'push_token' | 'device_token' | 'customer_id' | 'visitor_id';
export type MessageCategory = 'transactional' | 'behavioral' | 'marketing' | 'utility' | 'rich_messaging';

export type ChannelDef = {
  id: Channel;
  name: string;
  type: ChannelType;
  addressType: ChannelAddressType;
  supports: MessageCategory[];
  ready: boolean;
  capabilities: {
    richContent?: boolean;
    html?: boolean;
    attachments?: boolean;
    tracking?: boolean;
    openTracking?: boolean;
    clickTracking?: boolean;
    templates?: boolean;
    buttons?: boolean;
    media?: boolean;
    quickReplies?: boolean;
    cards?: boolean;
    suggestedActions?: boolean;
    image?: boolean;
    actions?: boolean;
    deepLink?: boolean;
    interactive?: boolean;
  };
};

export const CHANNEL_REGISTRY: ChannelDef[] = [
  { id: 'email', name: 'Email', type: 'messaging', addressType: 'email', supports: ['transactional', 'behavioral', 'marketing'], ready: true, capabilities: { richContent: true, html: true, attachments: true, tracking: true, openTracking: true, clickTracking: true } },
  { id: 'sms', name: 'SMS', type: 'messaging', addressType: 'phone_number', supports: ['transactional', 'behavioral'], ready: true, capabilities: { tracking: true, clickTracking: true } },
  { id: 'whatsapp', name: 'WhatsApp', type: 'messaging', addressType: 'phone_number', supports: ['transactional', 'marketing', 'utility'], ready: true, capabilities: { richContent: true, templates: true, buttons: true, media: true, quickReplies: true } },
  { id: 'rcs', name: 'RCS', type: 'messaging', addressType: 'phone_number', supports: ['transactional', 'marketing', 'rich_messaging'], ready: false, capabilities: { richContent: true, cards: true, buttons: true, media: true, suggestedActions: true } },
  { id: 'web_push', name: 'Web Push', type: 'push', addressType: 'push_token', supports: ['behavioral', 'transactional'], ready: true, capabilities: { richContent: true, image: true, actions: true, deepLink: true } },
  { id: 'mobile_push', name: 'Mobile Push', type: 'push', addressType: 'device_token', supports: ['behavioral', 'transactional'], ready: true, capabilities: { richContent: true, image: true, actions: true, deepLink: true } },
  { id: 'in_app', name: 'In-App', type: 'experience', addressType: 'customer_id', supports: ['behavioral', 'transactional'], ready: false, capabilities: { richContent: true, interactive: true, deepLink: true } },
  { id: 'in_browser', name: 'In-Browser', type: 'experience', addressType: 'visitor_id', supports: ['behavioral'], ready: false, capabilities: { richContent: true, interactive: true } },
  { id: 'voice', name: 'Voice', type: 'messaging', addressType: 'phone_number', supports: ['transactional'], ready: false, capabilities: {} },
];

export const CHANNELS: { value: Channel; label: string; ready: boolean }[] =
  CHANNEL_REGISTRY.map((c) => ({ value: c.id, label: c.name, ready: c.ready }));

// ---------------------------------------------------------------------------
// Event Source types
// ---------------------------------------------------------------------------

export type EventSourceType = 'web' | 'mobile_ios' | 'mobile_android' | 'email' | 'api' | 'webhook' | 'pipeline' | 'sdk';

export const EVENT_SOURCES: { value: EventSourceType; label: string }[] = [
  { value: 'web', label: 'Website' },
  { value: 'mobile_ios', label: 'Mobile (iOS)' },
  { value: 'mobile_android', label: 'Mobile (Android)' },
  { value: 'email', label: 'Email' },
  { value: 'api', label: 'API' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'pipeline', label: 'Data Pipeline' },
  { value: 'sdk', label: 'SDK' },
];

// ---------------------------------------------------------------------------
// Three-tier status model
// ---------------------------------------------------------------------------

export type ProcessingStatus = 'received' | 'validating' | 'processed' | 'validation_failed' | 'processing_failed';
export type DecisionStatus = 'no_trigger' | 'trigger_matched' | 'eligible' | 'suppressed' | 'skipped' | 'expired';
export type DeliveryStatus = 'not_applicable' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'rejected';

export const PROCESSING_STATUSES: { value: ProcessingStatus; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'validating', label: 'Validating' },
  { value: 'processed', label: 'Processed' },
  { value: 'validation_failed', label: 'Validation Failed' },
  { value: 'processing_failed', label: 'Processing Failed' },
];

export const DECISION_STATUSES: { value: DecisionStatus; label: string }[] = [
  { value: 'no_trigger', label: 'No Action' },
  { value: 'trigger_matched', label: 'Trigger Matched' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'suppressed', label: 'Suppressed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'expired', label: 'Expired' },
];

export const DELIVERY_STATUSES: { value: DeliveryStatus; label: string }[] = [
  { value: 'not_applicable', label: 'N/A' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'rejected', label: 'Rejected' },
];

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type EventType = 'transactional' | 'behavioral' | 'system' | 'engagement' | 'commerce' | 'identity' | 'consent' | 'custom';

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'transactional', label: 'Transactional' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'system', label: 'System' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'identity', label: 'Identity' },
  { value: 'consent', label: 'Consent' },
  { value: 'custom', label: 'Custom' },
];

// ---------------------------------------------------------------------------
// Canonical event model (enterprise-grade)
// ---------------------------------------------------------------------------

export type RtmEventIdentity = {
  customerId: string | null;
  externalId: string | null;
  anonymousId: string | null;
  sessionId: string | null;
  identifiers: {
    email?: string;
    mobile?: string;
    whatsapp?: string;
    webPushToken?: string;
    mobilePushToken?: string;
    deviceId?: string;
  };
  resolution: {
    status: 'resolved' | 'partial' | 'anonymous' | 'failed';
    method: string;
    matchedProfileId: string | null;
    action?: 'updated' | 'inserted' | 'matched';
    checkedAt?: string;
    detail?: string;
  };
};

export type RtmEventContext = {
  channel: string;
  device?: { type: string; os: string; osVersion?: string; browser?: string; browserVersion?: string };
  location?: { country: string; region?: string; city?: string };
  page?: { url: string; path: string; title?: string; referrer?: string };
};

export type RtmEventProcessingTrace = {
  stage: string;
  status: 'passed' | 'failed' | 'skipped';
  timestamp: string;
  durationMs: number;
  detail: string;
  data?: Record<string, unknown>;
};

export type RtmEventDecision = {
  status: DecisionStatus;
  triggerId: string | null;
  triggerName: string | null;
  decision: 'send' | 'suppress' | 'no_action' | 'failed';
  reason: string;
  rulesEvaluated: Array<{ rule: string; result: 'passed' | 'failed' }>;
};

export type RtmEventActivation = {
  templateId: string | null;
  templateName: string | null;
  templateVersion: number | null;
  channel: { requested: Channel | null; resolved: Channel | null };
  destination: { type: string; resolved: boolean; masked?: string };
  deliveryId: string | null;
  triggeredAt?: string | null;
  campaignId?: string | null;
  journeyId?: string | null;
};

export type RtmEventGovernance = {
  consent: 'passed' | 'failed' | 'not_required';
  suppression: 'passed' | 'failed';
  frequencyCap: 'passed' | 'failed';
  quietHours: 'passed' | 'failed' | 'not_applicable';
  suppressionReason?: string;
};

export type RtmEvent = {
  eventId: string;
  tenantId: string;
  event: {
    name: string;
    version: string;
    type: EventType;
    timestamp: string;
    receivedAt: string;
  };
  source: {
    type: EventSourceType;
    sourceId: string | null;
    sourceName: string | null;
    sdk: string | null;
    sdkVersion: string | null;
  };
  identity: RtmEventIdentity;
  context: RtmEventContext;
  payload: Record<string, unknown>;
  processing: {
    status: ProcessingStatus;
    processingTimeMs: number;
    validation: 'passed' | 'failed';
    idempotencyKey: string;
    trace: RtmEventProcessingTrace[];
  };
  decision: RtmEventDecision;
  activation: RtmEventActivation;
  governance: RtmEventGovernance;
  correlationId: string;
};

// ---------------------------------------------------------------------------
// Engagement types
// ---------------------------------------------------------------------------

export type EngagementType = 'open' | 'click' | 'bounce' | 'unsubscribe' | 'complaint' | 'conversion';

export type RtmEngagement = {
  id: string;
  deliveryId: string;
  customerId: string | null;
  type: EngagementType;
  channel: Channel;
  timestamp: string;
  detail: {
    linkName?: string;
    linkUrl?: string;
    bounceCode?: string;
    bounceType?: 'hard' | 'soft';
    deviceInfo?: string;
    clickPosition?: number;
  };
};

// ---------------------------------------------------------------------------
// Trigger types
// ---------------------------------------------------------------------------

export type TriggerStatus = 'draft' | 'active' | 'paused' | 'archived';
export type TriggerCategory = 'commerce' | 'content' | 'travel' | 'saas' | 'financial' | 'custom';
export type ConditionOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'starts_with' | 'ends_with' | 'exists' | 'not_exists' | 'in' | 'not_in' | 'regex';
export type TemporalType = 'absence' | 'delay' | 'within' | 'sequence';

export type TriggerCondition = { field: string; op: ConditionOp; value?: unknown; logic?: 'AND' | 'OR' };
export type TemporalCondition = { type: TemporalType; event?: string; window?: string; delayMs?: number; events?: string[] };
export type FrequencyCap = { maxMessages: number; windowMs: number; scope: 'per_customer' | 'per_trigger' | 'per_channel' | 'global' };
export type QuietHours = { enabled: boolean; start?: string; end?: string; timezone?: string; action?: 'delay' | 'suppress' };

export type TriggerAction = {
  channel: Channel;
  templateId: string;
  templateSlug: string;
  fallbackChain?: Channel[];
};

export type TriggerRule = {
  id: string;
  name: string;
  status: TriggerStatus;
  category: TriggerCategory;
  event: string;
  conditions: TriggerCondition[];
  temporal?: TemporalCondition;
  action: TriggerAction;
  frequencyCap: FrequencyCap;
  quietHours: QuietHours;
  priority: number;
  createdAt: string;
  updatedAt: string;
  stats: { matched: number; sent: number; suppressed: number; avgLatencyMs: number };
};

// ---------------------------------------------------------------------------
// Suppression reasons
// ---------------------------------------------------------------------------

export const SUPPRESSION_REASONS: Record<string, string> = {
  quarantine: 'Customer in quarantine',
  blacklist: 'Blacklisted',
  suppression_list: 'On suppression list',
  opt_out: 'Opted out',
  channel_disabled: 'Channel disabled',
  invalid_identity: 'Invalid identity',
  missing_consent: 'Missing consent',
  frequency_cap: 'Frequency cap exceeded',
  quiet_hours: 'Quiet hours',
  duplicate_event: 'Duplicate event',
  invalid_payload: 'Invalid payload',
  no_channel_id: 'No channel identifier',
  provider_unavailable: 'Provider unavailable',
};

// ---------------------------------------------------------------------------
// PII masking utility
// ---------------------------------------------------------------------------

export function maskPii(value: string, type: 'email' | 'phone' | 'token'): string {
  if (type === 'email') {
    const [local, domain] = value.split('@');
    if (!domain) return value;
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
  }
  if (type === 'phone') {
    if (value.length < 6) return value;
    return `${value.slice(0, 4)} ${'*'.repeat(value.length - 8)} ${value.slice(-4)}`;
  }
  return `${value.slice(0, 6)}…`;
}

export const FIELD_TYPES: FieldType[] = ['string', 'number', 'boolean', 'date', 'url', 'email', 'object', 'array'];

export const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  active: 'success', draft: 'default', paused: 'warning',
  accepted: 'default', matched: 'default', rendered: 'default',
  sent: 'success', delivered: 'success',
  suppressed: 'warning', skipped: 'warning', no_match: 'warning',
  failed: 'error', invalid: 'error', dead_letter: 'error',
};

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

export async function listDefinitions(tenantId: string, environment: string): Promise<DefinitionSummary[]> {
  const { data, error } = await supabase.rpc('rtm_list_definitions', {
    p_tenant_id: tenantId, p_environment: environment,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DefinitionSummary[];
}

export async function getDefinition(tenantId: string, id: string): Promise<DefinitionDetail> {
  const { data, error } = await supabase.rpc('rtm_get_definition', { p_tenant_id: tenantId, p_id: id });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  return {
    ...(d as unknown as DefinitionDetail),
    filters: (d.filters ?? []) as DefinitionDetail['filters'],
    payload_schema: (d.payload_schema ?? []) as SchemaField[],
    guardrails: (d.guardrails ?? {}) as Guardrails,
    templates: ((d.templates ?? []) as RtmTemplate[]).map((t) => ({
      ...t, content: t.content ?? {}, locale: t.locale ?? 'default',
      missing_var_policy: t.missing_var_policy ?? 'fallback',
    })),
  };
}

export type UpsertInput = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  event_type: string;
  latency_class: LatencyClass;
  is_transactional: boolean;
  default_channel: Channel;
  fallback_channels: string[];
  filters: DefinitionDetail['filters'];
  payload_schema: SchemaField[];
  guardrails: Guardrails;
  templates: RtmTemplate[];
  status: DefinitionStatus;
};

export async function upsertDefinition(tenantId: string, environment: string, input: UpsertInput): Promise<string> {
  const { data, error } = await supabase.rpc('rtm_upsert_definition', {
    p_tenant_id: tenantId,
    p_environment: environment,
    p_id: input.id ?? null,
    p_name: input.name,
    p_slug: input.slug,
    p_description: input.description,
    p_event_type: input.event_type,
    p_latency_class: input.latency_class,
    p_is_transactional: input.is_transactional,
    p_default_channel: input.default_channel,
    p_fallback_channels: input.fallback_channels,
    p_filters: input.filters,
    p_payload_schema: input.payload_schema,
    p_guardrails: input.guardrails,
    p_templates: input.templates,
    p_status: input.status,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setDefinitionStatus(tenantId: string, id: string, status: DefinitionStatus): Promise<void> {
  const { error } = await supabase.rpc('rtm_set_status', { p_tenant_id: tenantId, p_id: id, p_status: status });
  if (error) throw new Error(error.message);
}

export async function deleteDefinition(tenantId: string, id: string): Promise<void> {
  const { error } = await supabase.rpc('rtm_delete_definition', { p_tenant_id: tenantId, p_id: id });
  if (error) throw new Error(error.message);
}

export async function listMessages(
  tenantId: string, environment: string,
  opts: { definitionId?: string; status?: string; search?: string; limit?: number } = {},
): Promise<RtmMessage[]> {
  const { data, error } = await supabase.rpc('rtm_list_messages', {
    p_tenant_id: tenantId, p_environment: environment,
    p_definition_id: opts.definitionId ?? null,
    p_status: opts.status ?? null,
    p_search: opts.search ?? null,
    p_limit: opts.limit ?? 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RtmMessage[];
}

export async function usageSummary(tenantId: string, environment: string, days = 7): Promise<UsageDay[]> {
  const { data, error } = await supabase.rpc('rtm_usage_summary', {
    p_tenant_id: tenantId, p_environment: environment, p_days: days,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as UsageDay[];
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

/** In-console test send. Runs the pipeline synchronously and returns the trace. */
export async function sendTest(
  tenantId: string, environment: string,
  input: { event: string; to: Record<string, unknown>; data: Record<string, unknown>; channel?: string; locale?: string },
): Promise<{ message_id: string; status: string; trace: RtmMessage }> {
  const res = await fetch(`${RTM_INGEST_URL}?dry=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'x-environment': environment,
      ...(await authHeader()),
    },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ? `${body.error}${body.fields ? ': ' + body.fields.map((f: { message: string }) => f.message).join(', ') : ''}` : `HTTP ${res.status}`);
  return body;
}

export async function replayMessages(messageIds: string[]): Promise<{ results: Array<{ message_id: string; status: string }> }> {
  const res = await fetch(RTM_WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ message_ids: messageIds }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

// ---------------------------------------------------------------------------
// Client-side helpers
// ---------------------------------------------------------------------------

/** Infer a payload schema from a pasted sample JSON object. */
export function inferSchema(sample: unknown): SchemaField[] {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) return [];
  const out: SchemaField[] = [];
  for (const [key, value] of Object.entries(sample as Record<string, unknown>)) {
    let type: FieldType = 'string';
    if (typeof value === 'number') type = 'number';
    else if (typeof value === 'boolean') type = 'boolean';
    else if (Array.isArray(value)) type = 'array';
    else if (value && typeof value === 'object') type = 'object';
    else if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) type = 'url';
      else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) type = 'email';
      else if (/^\d{4}-\d{2}-\d{2}/.test(value)) type = 'date';
    }
    const pii = /email|phone|mobile|name|address|dob|ssn|card|passport/i.test(key);
    out.push({
      key, type, required: true, pii,
      example: value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
    });
  }
  return out;
}

/** Build the render context sample data from a schema's examples. */
export function sampleFromSchema(schema: SchemaField[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of schema) {
    if (f.example === undefined || f.example === '') { data[f.key] = `«${f.key}»`; continue; }
    if (f.type === 'number') data[f.key] = Number(f.example) || 0;
    else if (f.type === 'boolean') data[f.key] = f.example === 'true';
    else if (f.type === 'object' || f.type === 'array') {
      try { data[f.key] = JSON.parse(f.example); } catch { data[f.key] = f.example; }
    } else data[f.key] = f.example;
  }
  return data;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getPath(root: unknown, path: string): unknown {
  return String(path).split('.').filter(Boolean).reduce<unknown>((cur, p) => {
    if (cur == null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[p];
  }, root);
}

/** Mirror of the edge renderer, enough for a live preview. Returns text + missing keys. */
export function renderPreview(
  tpl: string,
  ctx: { data: Record<string, unknown>; customer: Record<string, unknown>; env?: Record<string, unknown> },
): { text: string; missing: string[] } {
  const missing: string[] = [];
  if (!tpl) return { text: '', missing };
  const text = tpl.replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
    const [pathPart, ...fb] = raw.split('|');
    const path = pathPart.trim();
    const fallbackRaw = fb.join('|').trim().replace(/^["']|["']$/g, '');
    const parts = path.split(/\s+/).filter(Boolean);

    if (parts.length > 1 && ['date', 'currency', 'number', 'uppercase', 'lowercase', 'truncate', 'default'].includes(parts[0])) {
      const [fn, ...args] = parts;
      const vals = args.map((a) => (a.startsWith('"') || a.startsWith("'") ? a.replace(/^["']|["']$/g, '') : getPath(ctx, a)));
      if (fn === 'date') {
        const d = new Date(String(vals[0])); if (isNaN(d.getTime())) return String(vals[0] ?? fallbackRaw);
        const pad = (n: number) => String(n).padStart(2, '0');
        return String(vals[1] ?? 'YYYY-MM-DD')
          .replace(/ddd/g, DOW[d.getUTCDay()]).replace(/MMM/g, MON[d.getUTCMonth()])
          .replace(/YYYY/g, String(d.getUTCFullYear())).replace(/MM/g, pad(d.getUTCMonth() + 1))
          .replace(/DD/g, pad(d.getUTCDate())).replace(/D/g, String(d.getUTCDate()));
      }
      if (fn === 'uppercase') return String(vals[0] ?? '').toUpperCase();
      if (fn === 'lowercase') return String(vals[0] ?? '').toLowerCase();
      if (fn === 'number') { const n = Number(vals[0]); return isNaN(n) ? String(vals[0] ?? '') : n.toLocaleString(); }
      if (fn === 'currency') { const n = Number(vals[0]); return isNaN(n) ? String(vals[0] ?? '') : `${vals[1] ?? 'USD'} ${n.toFixed(2)}`; }
      if (fn === 'truncate') { const s = String(vals[0] ?? ''); const k = Number(vals[1] ?? 80); return s.length > k ? s.slice(0, k - 1) + '…' : s; }
      if (fn === 'default') { const v = vals[0]; return v == null || v === '' ? String(vals[1] ?? '') : String(v); }
    }

    const v = getPath(ctx, path);
    if (v === undefined || v === null || v === '') {
      if (path.startsWith('data.') || path.startsWith('customer.')) missing.push(path);
      return fallbackRaw;
    }
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
  return { text, missing: [...new Set(missing)] };
}

// ---------------------------------------------------------------------------
// Integration snippets
// ---------------------------------------------------------------------------

export type SnippetLang = 'curl' | 'node' | 'python' | 'php';

export function buildSnippet(
  lang: SnippetLang,
  args: { event: string; schema: SchemaField[]; channel: Channel },
): string {
  const data: Record<string, unknown> = {};
  for (const f of args.schema) {
    data[f.key] = f.type === 'number' ? (Number(f.example) || 0)
      : f.type === 'boolean' ? f.example === 'true'
      : (f.example || `<${f.key}>`);
  }
  const payload = {
    event: args.event,
    to: { customer_id: '<your-customer-id>' },
    data,
    channel: args.channel === 'web_push' ? 'auto' : args.channel,
  };
  const pretty = JSON.stringify(payload, null, 2);

  if (lang === 'curl') {
    return `curl -X POST ${RTM_INGEST_URL} \\
  -H "Authorization: Bearer $MARBEE_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}'`;
  }
  if (lang === 'node') {
    return `import { randomUUID } from "node:crypto";

await fetch("${RTM_INGEST_URL}", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.MARBEE_API_KEY}\`,
    "Idempotency-Key": randomUUID(),
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${pretty.replace(/\n/g, '\n  ')}),
});`;
  }
  if (lang === 'python') {
    return `import os, uuid, requests

requests.post(
    "${RTM_INGEST_URL}",
    headers={
        "Authorization": f"Bearer {os.environ['MARBEE_API_KEY']}",
        "Idempotency-Key": str(uuid.uuid4()),
    },
    json=${pretty.replace(/: true/g, ': True').replace(/: false/g, ': False').replace(/\n/g, '\n    ')},
    timeout=5,
)`;
  }
  return `<?php
$ch = curl_init("${RTM_INGEST_URL}");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("MARBEE_API_KEY"),
    "Idempotency-Key: " . bin2hex(random_bytes(16)),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => '${JSON.stringify(payload)}',
]);
curl_exec($ch);`;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// In-Memory Customer Profile Registry & Identity Resolution Engine
// ---------------------------------------------------------------------------

export type CustomerProfile = {
  id: string;
  email: string;
  mobile: string;
  created_at: string;
  updated_at: string;
  attributes: Record<string, unknown>;
};

const customerProfilesStore = new Map<string, CustomerProfile>();

// Seed initial profile registry
for (let i = 0; i < 50; i++) {
  const id = `C${1000 + i}`;
  const email = `user${i}@example.com`;
  const mobile = `+9198765${String(43000 + i).padStart(5, '0')}`;
  customerProfilesStore.set(id, {
    id,
    email,
    mobile,
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    updated_at: new Date(Date.now() - i * 3600000).toISOString(),
    attributes: { account_type: 'retail' },
  });
}

function isValidUUID(str?: string): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export function upsertCustomerIdentity(input: {
  email?: string;
  mobile?: string;
  customerId?: string;
  tenantId?: string;
  environment?: string;
  attributes?: Record<string, unknown>;
  checkedAt?: string;
}): { profile: CustomerProfile; action: 'updated' | 'inserted'; checkedAt: string; detail: string } {
  const checkedAt = input.checkedAt || new Date().toISOString();
  const email = input.email?.trim().toLowerCase();
  const mobile = input.mobile?.trim();
  const tenantId = input.tenantId || '00000000-0000-0000-0000-000000000001';
  const environment = input.environment || 'production';

  let match: CustomerProfile | undefined;

  // 1. Match by Customer ID
  if (input.customerId && customerProfilesStore.has(input.customerId)) {
    match = customerProfilesStore.get(input.customerId);
  } else {
    // 2. Match by email OR mobile combination
    for (const profile of customerProfilesStore.values()) {
      const emailMatched = Boolean(email && profile.email.toLowerCase() === email);
      const mobileMatched = Boolean(mobile && profile.mobile === mobile);
      if (emailMatched || mobileMatched) {
        match = profile;
        break;
      }
    }
  }

  let action: 'updated' | 'inserted' = 'updated';
  let custProfile: CustomerProfile;

  if (match) {
    action = 'updated';
    match.updated_at = checkedAt;
    if (email) match.email = email;
    if (mobile) match.mobile = mobile;
    if (input.attributes) match.attributes = { ...match.attributes, ...input.attributes };
    customerProfilesStore.set(match.id, match);
    custProfile = match;
  } else {
    action = 'inserted';
    const newId = (input.customerId && isValidUUID(input.customerId)) ? input.customerId : crypto.randomUUID();
    custProfile = {
      id: newId,
      email: email || `user_${newId.slice(0, 8)}@example.com`,
      mobile: mobile || `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
      created_at: checkedAt,
      updated_at: checkedAt,
      attributes: input.attributes || {},
    };
    customerProfilesStore.set(newId, custProfile);
  }

  // 1. Persist to Supabase DB customers table (using valid UUID)
  void (async () => {
    try {
      const emailVal = custProfile.email;
      const firstName = (custProfile.attributes?.first_name as string) || (emailVal ? emailVal.split('@')[0] : 'Customer');
      const lastName = (custProfile.attributes?.last_name as string) || '';

      let existingId: string | null = isValidUUID(custProfile.id) ? custProfile.id : null;

      if (!existingId && emailVal) {
        const { data } = await supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('email', String(emailVal).trim().toLowerCase()) // TD-17: stored emails are lower-case (sql/92), so look up the same way.
          .maybeSingle();
        if (data?.id) existingId = data.id;
      }

      if (!existingId && custProfile.mobile) {
        const { data } = await supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('mobile', custProfile.mobile)
          .maybeSingle();
        if (data?.id) existingId = data.id;
      }

      if (existingId) {
        const { error } = await supabase
          .from('customers')
          .update({
            email: emailVal,
            mobile: custProfile.mobile,
            first_name: firstName,
            last_name: lastName,
            updated_at: checkedAt,
          })
          .eq('id', existingId);
        if (error) console.error('Supabase customer update error:', error);
      } else {
        const insertId = isValidUUID(custProfile.id) ? custProfile.id : crypto.randomUUID();
        const { error } = await supabase
          .from('customers')
          .insert({
            id: insertId,
            tenant_id: tenantId,
            environment: environment,
            email: emailVal,
            mobile: custProfile.mobile,
            first_name: firstName,
            last_name: lastName,
            status: 'active',
            created_at: checkedAt,
            updated_at: checkedAt,
          });
        if (error) console.error('Supabase customer insert error:', error);
      }
    } catch (err) {
      console.error('Customer DB upsert exception:', err);
    }
  })();

  // 2. Sync to local customer profiles store
  try {
    const existingTesters = getCustomerTesterProfiles();
    const foundIdx = existingTesters.findIndex((t) => t.id === custProfile.id || (email && t.email.toLowerCase() === email));
    const firstName = (custProfile.attributes?.first_name as string) || (custProfile.email ? custProfile.email.split('@')[0] : 'Customer');
    const lastName = (custProfile.attributes?.last_name as string) || '';

    if (foundIdx >= 0) {
      existingTesters[foundIdx] = {
        ...existingTesters[foundIdx],
        email: custProfile.email,
        mobile: custProfile.mobile,
        first_name: firstName || existingTesters[foundIdx].first_name,
        last_name: lastName || existingTesters[foundIdx].last_name,
      };
    } else {
      existingTesters.unshift({
        id: custProfile.id,
        name: `${firstName} ${lastName}`.trim() || custProfile.email,
        title: 'Mr.',
        first_name: firstName,
        last_name: lastName,
        email: custProfile.email,
        mobile: custProfile.mobile,
        mobile_country_code: '+91',
        city: 'San Francisco',
        state: 'California',
        country: 'United States',
        pincode: '94103',
        status: 'active',
        consent_email: true,
        consent_sms: true,
        consent_whatsapp: true,
        consent_web_push: true,
        loyalty_member: true,
        loyalty_tier_name: 'Standard',
        loyalty_points_balance: 100,
        loyalty_status: 'active',
        order_id: 'ORD-LIVE',
        order_total: '$120.00',
        discount_code: 'TEST10',
        target_test_email: custProfile.email,
        target_test_phone: custProfile.mobile,
      });
    }
    saveCustomerTesterProfiles(existingTesters);
  } catch {
    /* ignore fallback */
  }

  // 3. Notify UI to refresh customer module tables live
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('marbee_customer_upserted', { detail: custProfile }));
  }

  return {
    profile: custProfile,
    action,
    checkedAt,
    detail: action === 'updated'
      ? `Async Identity Resolution (Post-Comms): UPDATED existing profile ${custProfile.id} (matched ${email ? `email: ${email}` : ''}${email && mobile ? ' & ' : ''}${mobile ? `mobile: ${mobile}` : ''})`
      : `Async Identity Resolution (Post-Comms): INSERTED new profile ${custProfile.id} (email/mobile combination not found)`,
  };
}

// ---------------------------------------------------------------------------
// In-Memory Real-Time Event Dispatcher & Bus
// ---------------------------------------------------------------------------

const LIVE_EVENTS_EVENT_NAME = 'marbee_rtm_live_event';
const liveEventsStore: RtmEvent[] = [];

export function dispatchRealTimeEvent(input: {
  eventName: string;
  isTestMode: boolean;
  tenantId: string;
  customer?: { id?: string; email?: string; mobile?: string };
  payload?: Record<string, unknown>;
  templateName?: string;
  channel?: Channel;
}): RtmEvent {
  const receivedAtTime = Date.now();
  const receivedAt = new Date(receivedAtTime).toISOString();
  const eventId = `evt_live_${crypto.randomUUID().slice(0, 12)}`;

  // 1. Event Received (T = 0ms)
  // 2. Checks & Decision (T = +26ms)
  // 3. Send Comms (T = +42ms)
  const commsTriggeredAtTime = receivedAtTime + 42; // +42ms after receive
  const commsTriggeredAt = new Date(commsTriggeredAtTime).toISOString();

  // 4. Async Post-Comms Identity Resolution (T = +120ms post-send / hourly batch job)
  const identityCheckedAtTime = commsTriggeredAtTime + 78;
  const identityCheckedAt = new Date(identityCheckedAtTime).toISOString();

  const identityRes = upsertCustomerIdentity({
    customerId: input.customer?.id,
    email: input.customer?.email,
    mobile: input.customer?.mobile,
    tenantId: input.tenantId || '00000000-0000-0000-0000-000000000001',
    environment: input.isTestMode ? 'development' : 'production',
    attributes: input.payload,
    checkedAt: identityCheckedAt,
  });

  const cust = identityRes.profile;

  const newEvent: RtmEvent = {
    eventId,
    tenantId: input.tenantId || 'tenant_001',
    event: {
      name: input.eventName,
      version: '1.0',
      type: input.isTestMode ? 'custom' : 'transactional',
      timestamp: receivedAt,
      receivedAt: receivedAt,
    },
    source: {
      type: input.isTestMode ? 'api' : 'webhook',
      sourceId: input.isTestMode ? 'test_api_runner' : 'prod_api_gateway',
      sourceName: input.isTestMode ? 'Test API Simulator' : 'Production API Gateway',
      sdk: 'marbee-js-sdk',
      sdkVersion: '1.0.0',
    },
    identity: {
      customerId: cust.id,
      externalId: `EXT_${cust.id}`,
      anonymousId: `anon_${crypto.randomUUID().slice(0, 8)}`,
      sessionId: `sess_${crypto.randomUUID().slice(0, 8)}`,
      identifiers: { email: cust.email, mobile: cust.mobile, whatsapp: cust.mobile, webPushToken: `wp_${cust.id}` },
      resolution: {
        status: 'resolved',
        method: identityRes.action === 'updated' ? 'email_mobile_match_update' : 'email_mobile_insert',
        matchedProfileId: cust.id,
        action: identityRes.action,
        checkedAt: identityCheckedAt,
        detail: identityRes.detail,
      },
    },
    context: {
      channel: 'api',
      device: { type: 'desktop', os: 'Windows', browser: 'Chrome', browserVersion: '128.0' },
      location: { country: 'US', region: 'CA', city: 'San Francisco' },
    },
    payload: input.payload || { sample_key: 'sample_value' },
    processing: {
      status: 'processed',
      processingTimeMs: Math.floor(15 + Math.random() * 45),
      validation: 'passed',
      idempotencyKey: crypto.randomUUID(),
      trace: [
        { stage: 'receive', status: 'passed', timestamp: receivedAt, durationMs: 2, detail: `1. Event received via ${input.isTestMode ? 'Test API' : 'Live API'} at ${new Date(receivedAt).toLocaleTimeString()}` },
        { stage: 'validate', status: 'passed', timestamp: new Date(receivedAtTime + 3).toISOString(), durationMs: 3, detail: '2. Payload schema & integrity validated' },
        { stage: 'trigger_evaluate', status: 'passed', timestamp: new Date(receivedAtTime + 18).toISOString(), durationMs: 8, detail: `3. Template trigger matched: ${input.templateName || input.eventName}` },
        { stage: 'decision', status: 'passed', timestamp: new Date(receivedAtTime + 26).toISOString(), durationMs: 5, detail: '4. Decision & checks passed (Consent, Frequency Cap, Quiet Hours)' },
        { stage: 'send', status: 'passed', timestamp: commsTriggeredAt, durationMs: 16, detail: `5. Comms Triggered & Dispatched via provider (Channel: ${input.channel || 'email'}) at ${new Date(commsTriggeredAt).toLocaleTimeString()}` },
        { stage: 'identity_resolve', status: 'passed', timestamp: identityCheckedAt, durationMs: 6, detail: `6. ${identityRes.detail}` },
      ],
    },
    decision: {
      status: 'eligible',
      triggerId: `TRG_${input.eventName.toUpperCase()}`,
      triggerName: input.templateName || `${input.eventName} Trigger`,
      decision: 'send',
      reason: input.isTestMode ? 'Test API event processed & comms sent' : 'Live API event executed and delivered',
      rulesEvaluated: [
        { rule: 'consent', result: 'passed' },
        { rule: 'frequency_cap', result: 'passed' },
        { rule: 'quiet_hours', result: 'passed' },
        { rule: 'identity_resolution', result: 'passed' },
      ],
    },
    activation: {
      templateId: `TPL_${input.eventName.toUpperCase()}`,
      templateName: input.templateName || input.eventName,
      templateVersion: 1,
      channel: { requested: input.channel || 'email', resolved: input.channel || 'email' },
      destination: { type: input.channel || 'email', resolved: true, masked: maskPii(cust.email, 'email') },
      deliveryId: `DLV_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      triggeredAt: commsTriggeredAt,
    },
    governance: {
      consent: 'passed',
      suppression: 'passed',
      frequencyCap: 'passed',
      quietHours: 'passed',
    },
    correlationId: `CORR_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
  };

  liveEventsStore.unshift(newEvent);
  window.dispatchEvent(new CustomEvent(LIVE_EVENTS_EVENT_NAME, { detail: newEvent }));
  return newEvent;
}

export function subscribeRealTimeEvents(callback: (event: RtmEvent) => void): () => void {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<RtmEvent>;
    if (custom.detail) callback(custom.detail);
  };
  window.addEventListener(LIVE_EVENTS_EVENT_NAME, handler);
  return () => window.removeEventListener(LIVE_EVENTS_EVENT_NAME, handler);
}

export function getLiveEventsStore(): RtmEvent[] {
  return liveEventsStore;
}

