import { supabase } from './supabase';
import { fetchSchemasWithFields, type SchemaWithFields } from './fetch-schemas';
import { fetchSchemaRows } from './schema-records';
import { SCHEMA_TABLE_CONFIG, listAvailableDataFields } from './schema-data';
import {
  applyFilterRoot,
  buildFilterFields,
  createFilterRoot,
  type FilterOperator,
  type FilterRoot,
  type SchemaFilterField,
} from './schema-filters';
import { applyQuickSearch } from '@/components/schemas/SchemaFilterEditor';
import { logAudit, diffChanges } from './audit';
import {
  isScheduleDue,
  scheduleLabel,
  schedulePollIntervalMs,
} from './audience-schedule';

export type { RefreshSchedule, ScheduleFrequency } from './audience-schedule';
export {
  defaultSchedule,
  describeSchedule,
  parseRefreshSchedule,
  serializeRefreshSchedule,
  SCHEDULE_FREQUENCY_OPTIONS,
  WEEKDAY_LABELS,
} from './audience-schedule';

export type Audience = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  slug: string;
  description: string | null;
  schema_slug: string;
  filter_json: FilterRoot;
  quick_search: string | null;
  creation_mode: 'diy' | 'ai' | 'template';
  ai_prompt: string | null;
  member_count: number;
  status: string;
  auto_refresh: boolean;
  refresh_cron: string | null;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AudienceRefreshLog = {
  id: string;
  audience_id: string;
  member_count: number;
  previous_count: number | null;
  status: string;
  triggered_by: 'manual' | 'scheduled' | 'auto';
  message: string | null;
  created_at: string;
};

export const AUDIENCE_REFRESH_PRESETS = [
  { label: 'Manual only', value: '' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 2 AM', value: '0 2 * * *' },
  { label: 'Weekly (Mon 3 AM)', value: '0 3 * * 1' },
] as const;

/** Human-readable label for stored cron or @sch: JSON schedule */
export function cronLabel(cron: string | null | undefined): string | null {
  return scheduleLabel(cron);
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Whether a scheduled refresh is due based on custom or legacy schedule */
export function isRefreshDue(audience: Audience): boolean {
  return isScheduleDue(audience.refresh_cron, audience.last_refreshed_at, audience.auto_refresh);
}

export function refreshPollIntervalMs(audience: Audience): number {
  return schedulePollIntervalMs(audience.refresh_cron);
}

export type SimpleAudienceRule = {
  field: string;
  operator: FilterOperator;
  value: string;
  join?: 'and' | 'or';
};

export function slugifyAudienceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'cohort';
}

export function parseFilterRoot(json: unknown): FilterRoot {
  if (json && typeof json === 'object' && (json as FilterRoot).type === 'group') {
    return json as FilterRoot;
  }
  return createFilterRoot();
}

export function filterRootFromRules(rules: SimpleAudienceRule[]): FilterRoot {
  const root = createFilterRoot();
  root.children = rules.map((rule, i) => ({
    type: 'condition' as const,
    id: crypto.randomUUID(),
    join: i === 0 ? undefined : (rule.join ?? 'and'),
    left: { kind: 'field' as const, field: rule.field },
    operator: rule.operator,
    right: { kind: 'literal' as const, value: rule.value },
  }));
  return root;
}

export const LINKED_DELIVERY_RELATION_FIELDS: SchemaFilterField[] = [
  // 1. Deliveries & Message Activity (Linked)
  {
    key: 'delivery_code',
    label: 'Delivery Code (Sent / Received)',
    type: 'string',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.delivery_code || row.received_delivery_codes || '',
  },
  {
    key: 'last_delivery_code',
    label: 'Last Delivery Code',
    type: 'string',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.last_delivery_code || '',
  },
  {
    key: 'last_delivery_channel',
    label: 'Last Delivery Channel',
    type: 'enum',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.last_delivery_channel || '',
  },
  {
    key: 'last_delivery_status',
    label: 'Last Delivery Status',
    type: 'enum',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.last_delivery_status || '',
  },
  {
    key: 'last_delivery_at',
    label: 'Last Delivery Received Date',
    type: 'timestamp',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.last_delivery_at || null,
  },
  {
    key: 'deliveries_received_7d_count',
    label: 'Deliveries Received in Last 7 Days',
    type: 'number',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.deliveries_received_7d_count ?? 0,
  },
  {
    key: 'deliveries_received_30d_count',
    label: 'Deliveries Received in Last 30 Days',
    type: 'number',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.deliveries_received_30d_count ?? 0,
  },
  {
    key: 'email_opened_7d',
    label: 'Email Opened in Last 7 Days',
    type: 'boolean',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.email_opened_7d ?? false,
  },
  {
    key: 'email_clicked_7d',
    label: 'Email Clicked in Last 7 Days',
    type: 'boolean',
    group: 'Deliveries & Message Activity (Linked)',
    getValue: (row) => row.email_clicked_7d ?? false,
  },

  // 2. Customer Events (Linked)
  {
    key: 'last_event_name',
    label: 'Last Triggered Event Name',
    type: 'string',
    group: 'Customer Events (Linked)',
    getValue: (row) => row.last_event_name || '',
  },
  {
    key: 'last_event_at',
    label: 'Last Event Date',
    type: 'timestamp',
    group: 'Customer Events (Linked)',
    getValue: (row) => row.last_event_at || null,
  },
  {
    key: 'events_7d_count',
    label: 'Total Events in Last 7 Days',
    type: 'number',
    group: 'Customer Events (Linked)',
    getValue: (row) => row.events_7d_count ?? 0,
  },
  {
    key: 'event_names',
    label: 'Triggered Event Names List',
    type: 'string',
    group: 'Customer Events (Linked)',
    getValue: (row) => row.event_names || '',
  },

  // 3. Channels & Reachability (Linked)
  {
    key: 'is_email_reachable',
    label: 'Email Reachable (Valid Email)',
    type: 'boolean',
    group: 'Channels & Reachability (Linked)',
    getValue: (row) => row.is_email_reachable ?? false,
  },
  {
    key: 'is_sms_reachable',
    label: 'SMS Reachable (Valid Phone)',
    type: 'boolean',
    group: 'Channels & Reachability (Linked)',
    getValue: (row) => row.is_sms_reachable ?? false,
  },
  {
    key: 'is_push_subscribed',
    label: 'Web Push Subscribed',
    type: 'boolean',
    group: 'Channels & Reachability (Linked)',
    getValue: (row) => row.is_push_subscribed ?? false,
  },
];

export function buildAudienceFilterFields(
  schema: SchemaWithFields,
  rows: Record<string, unknown>[],
): SchemaFilterField[] {
  const tableConfig = schema.table_name ? SCHEMA_TABLE_CONFIG[schema.table_name] : undefined;
  const schemaFields = (schema.schema_fields ?? []) as {
    name: string;
    field_type: string;
    sort_order: number;
  }[];
  const available = listAvailableDataFields(
    schema.table_name ?? schema.slug,
    schemaFields,
    rows,
    tableConfig,
  );
  const baseFields = buildFilterFields(
    available.map((f) => f.key),
    schemaFields,
    tableConfig?.relationFields ?? [],
  ).map((f) => ({
    ...f,
    group: f.group || `${schema.name || 'Customer'} Attributes`,
  }));

  const isCustomerSchema =
    schema.slug === 'customer' ||
    schema.slug === 'customers' ||
    schema.table_name === 'customers';

  if (isCustomerSchema) {
    const existingKeys = new Set(baseFields.map((f) => f.key));
    const extraLinked = LINKED_DELIVERY_RELATION_FIELDS.filter((f) => !existingKeys.has(f.key));
    return [...baseFields, ...extraLinked];
  }

  return baseFields;
}

export async function evaluateAudienceMembers(opts: {
  tenantId: string;
  environment: string;
  schema: SchemaWithFields;
  filterRoot: FilterRoot;
  quickSearch?: string;
  limit?: number;
}): Promise<{
  members: Record<string, unknown>[];
  total: number;
  filterFields: SchemaFilterField[];
}> {
  const tableName = opts.schema.table_name;
  if (!tableName) {
    return { members: [], total: 0, filterFields: [] };
  }

  const rows = await fetchSchemaRows(tableName, opts.tenantId, opts.environment, 5000);

  const isCustomerSchema =
    opts.schema.slug === 'customer' ||
    opts.schema.slug === 'customers' ||
    tableName === 'customers';

  if (isCustomerSchema && rows.length > 0) {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // In parallel, query events, engagement logs, push subscribers, and workflow delivery runs
    const [eventsRes, engLogsRes, pushRes, workflowRunsRes] = await Promise.all([
      supabase
        .from('events')
        .select('customer_id, event_name, timestamp')
        .eq('tenant_id', opts.tenantId)
        .eq('environment', opts.environment)
        .order('timestamp', { ascending: false })
        .limit(10000),
      supabase
        .from('engagement_log')
        .select('customer_id, channel, event_type, timestamp, metadata')
        .eq('tenant_id', opts.tenantId)
        .eq('environment', opts.environment)
        .order('timestamp', { ascending: false })
        .limit(10000),
      supabase
        .from('web_push_subscribers')
        .select('customer_id, permission_status, subscription_status')
        .eq('tenant_id', opts.tenantId)
        .eq('environment', opts.environment)
        .limit(5000),
      supabase
        .from('journey_workflow_runs')
        .select('node_results, started_at')
        .eq('tenant_id', opts.tenantId)
        .eq('environment', opts.environment)
        .order('started_at', { ascending: false })
        .limit(50),
    ]);

    // Map Events by customer
    const eventsByCust = new Map<
      string,
      { lastEvent?: string; lastAt?: string; count7d: number; names: Set<string> }
    >();
    for (const ev of eventsRes.data ?? []) {
      if (!ev.customer_id) continue;
      const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : 0;
      let agg = eventsByCust.get(ev.customer_id);
      if (!agg) {
        agg = { lastEvent: ev.event_name, lastAt: ev.timestamp, count7d: 0, names: new Set() };
        eventsByCust.set(ev.customer_id, agg);
      }
      if (ev.event_name) agg.names.add(ev.event_name);
      if (ts >= sevenDaysAgo) agg.count7d += 1;
    }

    // Map Engagement & Delivery Logs by customer
    const delivsByCust = new Map<
      string,
      {
        codes: Set<string>;
        lastCode?: string;
        lastChannel?: string;
        lastStatus?: string;
        lastAt?: string;
        count7d: number;
        count30d: number;
        opened7d: boolean;
        clicked7d: boolean;
      }
    >();

    // 1. Ingest engagement_log entries
    for (const eng of engLogsRes.data ?? []) {
      if (!eng.customer_id) continue;
      const ts = eng.timestamp ? new Date(eng.timestamp).getTime() : 0;
      const meta = (eng.metadata as Record<string, unknown>) || {};
      const delivCode = String(meta.delivery_code || meta.code || '');

      let agg = delivsByCust.get(eng.customer_id);
      if (!agg) {
        agg = {
          codes: new Set(),
          lastCode: delivCode || undefined,
          lastChannel: eng.channel,
          lastStatus: eng.event_type,
          lastAt: eng.timestamp,
          count7d: 0,
          count30d: 0,
          opened7d: false,
          clicked7d: false,
        };
        delivsByCust.set(eng.customer_id, agg);
      }
      if (delivCode) agg.codes.add(delivCode);
      if (ts >= sevenDaysAgo) {
        agg.count7d += 1;
        if (eng.event_type === 'open' || eng.event_type === 'opened') agg.opened7d = true;
        if (eng.event_type === 'click' || eng.event_type === 'clicked') agg.clicked7d = true;
      }
      if (ts >= thirtyDaysAgo) agg.count30d += 1;
    }

    // 2. Ingest workflow run delivery results (e.g. delivery code XYZA, DELIV_001)
    for (const run of workflowRunsRes.data ?? []) {
      const nodeResults = (run.node_results as Record<string, any>) || {};
      const runTs = run.started_at ? new Date(run.started_at).getTime() : 0;
      for (const node of Object.values(nodeResults)) {
        const dRec = node?.delivery;
        const dCode = dRec?.name || dRec?.id || node?.label;
        const custIds = Array.isArray(node?.customerIds) ? node.customerIds : [];
        if (dCode && custIds.length > 0) {
          for (const cid of custIds) {
            let agg = delivsByCust.get(cid);
            if (!agg) {
              agg = {
                codes: new Set(),
                lastCode: dCode,
                lastChannel: dRec?.channel || 'email',
                lastStatus: 'delivered',
                lastAt: run.started_at,
                count7d: 0,
                count30d: 0,
                opened7d: false,
                clicked7d: false,
              };
              delivsByCust.set(cid, agg);
            }
            agg.codes.add(dCode);
            if (dRec?.stepType) agg.codes.add(dRec.stepType);
            if (runTs >= sevenDaysAgo) agg.count7d += 1;
            if (runTs >= thirtyDaysAgo) agg.count30d += 1;
          }
        }
      }
    }

    // Map Web Push Subscriptions
    const pushByCust = new Set<string>();
    for (const p of pushRes.data ?? []) {
      if (
        p.customer_id &&
        (p.permission_status === 'granted' || p.subscription_status === 'subscribed')
      ) {
        pushByCust.add(p.customer_id);
      }
    }

    // Enrich customer rows with joined linked data
    for (const row of rows) {
      const cid = String(row.id || '');
      const d = delivsByCust.get(cid);
      const e = eventsByCust.get(cid);

      const dCodesArray = d ? [...d.codes] : [];
      row.delivery_code = dCodesArray.join(', ');
      row.received_delivery_codes = dCodesArray.join(', ');
      row.last_delivery_code = d?.lastCode || '';
      row.last_delivery_channel = d?.lastChannel || '';
      row.last_delivery_status = d?.lastStatus || '';
      row.last_delivery_at = d?.lastAt || null;
      row.deliveries_received_7d_count = d?.count7d ?? 0;
      row.deliveries_received_30d_count = d?.count30d ?? 0;
      row.email_opened_7d = d?.opened7d ?? false;
      row.email_clicked_7d = d?.clicked7d ?? false;

      row.last_event_name = e?.lastEvent || '';
      row.last_event_at = e?.lastAt || null;
      row.events_7d_count = e?.count7d ?? 0;
      row.event_names = e ? [...e.names].join(', ') : '';

      row.is_email_reachable = Boolean(row.email && String(row.email).includes('@'));
      row.is_sms_reachable = Boolean(
        row.mobile && String(row.mobile).replace(/\D/g, '').length >= 7,
      );
      row.is_push_subscribed = pushByCust.has(cid);
    }
  }

  const filterFields = buildAudienceFilterFields(opts.schema, rows);
  let filtered = applyFilterRoot(rows, opts.filterRoot, filterFields);
  if (opts.quickSearch?.trim()) {
    filtered = applyQuickSearch(filtered, opts.quickSearch, filterFields);
  }
  const total = filtered.length;
  const limit = opts.limit ?? 500;
  return { members: filtered.slice(0, limit), total, filterFields };
}

export async function fetchAudiences(tenantId: string, environment: string): Promise<Audience[]> {
  const { data, error } = await supabase
    .from('audiences')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeAudience);
}

export async function fetchAudience(id: string): Promise<Audience | null> {
  const { data, error } = await supabase.from('audiences').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizeAudience(data) : null;
}

function normalizeAudience(row: Record<string, unknown>): Audience {
  return {
    ...(row as unknown as Audience),
    filter_json: parseFilterRoot(row.filter_json),
    quick_search: (row.quick_search as string) ?? '',
    auto_refresh: Boolean(row.auto_refresh),
    refresh_cron: (row.refresh_cron as string) ?? null,
    last_refreshed_at: (row.last_refreshed_at as string) ?? null,
  };
}

export async function createAudience(input: {
  tenant_id: string;
  environment: string;
  name: string;
  slug?: string;
  description?: string;
  schema_slug: string;
  filter_json: FilterRoot;
  quick_search?: string;
  creation_mode: Audience['creation_mode'];
  ai_prompt?: string;
  member_count?: number;
}) {
  const slug = input.slug ?? slugifyAudienceName(input.name);
  const { data, error } = await supabase
    .from('audiences')
    .insert({
      ...input,
      slug,
      filter_json: input.filter_json,
      member_count: input.member_count ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  const audience = normalizeAudience(data);
  void logAudit({
    tenantId: input.tenant_id,
    environment: input.environment,
    action: 'create',
    resourceType: 'audience',
    resourceId: audience.id,
    resourceName: audience.name,
    summary: `Created cohort on ${input.schema_slug} schema`,
  });
  return audience;
}

export async function updateAudience(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    schema_slug: string;
    filter_json: FilterRoot;
    quick_search: string;
    member_count: number;
    status: string;
    auto_refresh: boolean;
    refresh_cron: string | null;
    last_refreshed_at: string;
  }>,
) {
  const prev = await fetchAudience(id);
  const { data, error } = await supabase
    .from('audiences')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const updated = normalizeAudience(data);
  const auditKeys = Object.keys(patch).filter(
    (k) => !['member_count', 'last_refreshed_at'].includes(k),
  );
  if (prev && auditKeys.length) {
    void logAudit({
      tenantId: updated.tenant_id,
      environment: updated.environment,
      action: 'update',
      resourceType: 'audience',
      resourceId: updated.id,
      resourceName: updated.name,
      summary: `Updated ${auditKeys.join(', ')}`,
      changes: diffChanges(
        prev as unknown as Record<string, unknown>,
        patch as Record<string, unknown>,
        auditKeys,
      ),
    });
  }
  return updated;
}

export async function deleteAudience(id: string) {
  const prev = await fetchAudience(id);
  const { error } = await supabase.from('audiences').delete().eq('id', id);
  if (error) throw error;
  if (prev) {
    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action: 'delete',
      resourceType: 'audience',
      resourceId: id,
      resourceName: prev.name,
    });
  }
}

export async function refreshAudience(
  audience: Audience,
  tenantId: string,
  environment: string,
  triggeredBy: 'manual' | 'scheduled' | 'auto' = 'manual',
): Promise<number> {
  const schemas = await fetchSchemasWithFields(tenantId, environment);
  const schema = schemas.find((s) => s.slug === audience.schema_slug);
  if (!schema) return audience.member_count;

  const previous = audience.member_count;
  const { total } = await evaluateAudienceMembers({
    tenantId,
    environment,
    schema,
    filterRoot: audience.filter_json,
    quickSearch: audience.quick_search ?? '',
  });

  const now = new Date().toISOString();
  await updateAudience(audience.id, {
    member_count: total,
    last_refreshed_at: now,
  });

  try {
    await supabase.from('audience_refresh_logs').insert({
      audience_id: audience.id,
      member_count: total,
      previous_count: previous,
      status: 'completed',
      triggered_by: triggeredBy,
      message:
        total === previous ? 'No change' : `${total - previous >= 0 ? '+' : ''}${total - previous} members`,
    });
  } catch {
    // log table may not exist yet
  }

  void logAudit({
    tenantId,
    environment,
    action: 'refresh',
    resourceType: 'audience',
    resourceId: audience.id,
    resourceName: audience.name,
    summary: `${total.toLocaleString()} members (${triggeredBy})`,
    metadata: { triggered_by: triggeredBy, previous_count: previous, member_count: total },
  });

  return total;
}

/** @deprecated use refreshAudience */
export async function refreshAudienceCount(
  audience: Audience,
  tenantId: string,
  environment: string,
): Promise<number> {
  return refreshAudience(audience, tenantId, environment, 'manual');
}

export async function fetchAudienceRefreshLogs(
  audienceId: string,
  limit = 10,
): Promise<AudienceRefreshLog[]> {
  const { data, error } = await supabase
    .from('audience_refresh_logs')
    .select('*')
    .eq('audience_id', audienceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as AudienceRefreshLog[];
}

export const AUDIENCE_TEMPLATES = [
  {
    name: 'Received Delivery in Last 7 Days',
    description: 'Received any delivery or campaign message within the last 7 days',
    schema_slug: 'customer',
    rules: [
      {
        field: 'deliveries_received_7d_count',
        operator: 'gt' as FilterOperator,
        value: '0',
      },
    ],
  },
  {
    name: 'Received Delivery Code XYZA',
    description: 'Sent or received messages with delivery code XYZA',
    schema_slug: 'customer',
    rules: [
      {
        field: 'delivery_code',
        operator: 'contains' as FilterOperator,
        value: 'XYZA',
      },
    ],
  },
  {
    name: 'Email Engaged (Opened in 7 Days)',
    description: 'Has opened an email communication within the past 7 days',
    schema_slug: 'customer',
    rules: [
      {
        field: 'email_opened_7d',
        operator: 'equals' as FilterOperator,
        value: 'true',
      },
    ],
  },
  {
    name: 'Active Customers in India',
    description: 'Status is active and country code is IN',
    schema_slug: 'customer',
    rules: [
      { field: 'status', operator: 'equals' as FilterOperator, value: 'active' },
      { field: 'country', operator: 'equals' as FilterOperator, value: 'IN', join: 'and' as const },
    ],
  },
  {
    name: 'Omnichannel Reachable (Email + Phone)',
    description: 'Has valid email and mobile numbers for omnichannel campaigns',
    schema_slug: 'customer',
    rules: [
      { field: 'is_email_reachable', operator: 'equals' as FilterOperator, value: 'true' },
      {
        field: 'is_sms_reachable',
        operator: 'equals' as FilterOperator,
        value: 'true',
        join: 'and' as const,
      },
    ],
  },
];

