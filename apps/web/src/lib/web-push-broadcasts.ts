// Web Push broadcasts (D-026): thin client over the SQL 97 functions. All targeting, caps,
// exclusions and sending happen on the server; the browser only resolves a Marbee audience to
// customer ids (today's audience engine runs in the browser, max 5,000 customers).
import { supabase } from './supabase';
import type { WebPushContent } from './content-templates';
import { evaluateAudienceMembers, type Audience } from './audiences';
import { fetchSchemasWithFields } from './fetch-schemas';

export type BroadcastFilter = {
  browsers?: string[];
  os?: string[];
  devices?: string[];
  subscribed_within_days?: number;
  active_within_days?: number;
  linked?: 'any' | 'linked' | 'anonymous';
};

export type AudienceChoice =
  | { kind: 'all' }
  | { kind: 'filter'; filter: BroadcastFilter }
  | { kind: 'audience'; audienceId: string; audienceName: string };

export type AudienceCount = {
  devices: number;
  linked: number;
  anonymous: number;
  excluded: number;
  daily_cap: number;
  cap_remaining: number;
};

export type BroadcastRow = {
  id: string;
  name: string;
  content: Record<string, unknown>;
  audience: Record<string, unknown>;
  scheduled_at: string | null;
  created_at: string;
  cancelled_at: string | null;
  result: { queued?: number; devices?: number; excluded?: number; capped?: number };
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled';
  queued: number;
  delivered: number;
  failed: number;
  skipped: number;
  clicked: number;
};

/** Composer content → what the server stores and the worker sends. */
export function toPushPayload(c: WebPushContent): Record<string, unknown> {
  return {
    title: c.title?.trim() ?? '',
    body: c.body?.trim() ?? '',
    click_url: c.action_url?.trim() || undefined,
    icon_url: c.icon_url?.trim() || undefined,
    image_url: c.image_url?.trim() || undefined,
    badge_url: c.badge_url?.trim() || undefined,
    actions: (c.actions ?? []).filter((a) => a.title).slice(0, 2),
    ttl_seconds: c.ttl_hours ? Math.round(c.ttl_hours * 3600) : undefined,
  };
}

export function filterFor(choice: AudienceChoice): BroadcastFilter {
  return choice.kind === 'filter' ? choice.filter : {};
}

export function describeAudience(a: Record<string, unknown>): string {
  if (a.kind === 'audience') return `Audience: ${String(a.audienceName ?? 'audience')}`;
  if (a.kind === 'filter') {
    const f = (a.filter ?? {}) as BroadcastFilter;
    const parts: string[] = [];
    if (f.browsers?.length) parts.push(f.browsers.join('/'));
    if (f.os?.length) parts.push(f.os.join('/'));
    if (f.devices?.length) parts.push(f.devices.join('/'));
    if (f.subscribed_within_days) parts.push(`subscribed ≤${f.subscribed_within_days}d`);
    if (f.active_within_days) parts.push(`active ≤${f.active_within_days}d`);
    if (f.linked && f.linked !== 'any') parts.push(f.linked === 'linked' ? 'known customers' : 'anonymous');
    return parts.length ? `Filtered: ${parts.join(', ')}` : 'All subscribers';
  }
  return 'All subscribers';
}

/** Customer ids of a Marbee audience (customer-schema audiences only). */
export async function resolveAudienceCustomerIds(
  tenantId: string,
  environment: string,
  audience: Audience,
): Promise<{ ids: string[]; truncated: boolean }> {
  const schemas = await fetchSchemasWithFields(tenantId, environment);
  const schema = schemas.find((s) => s.slug === audience.schema_slug);
  const isCustomers = Boolean(schema?.table_name) && (['customer', 'customers'].includes(schema!.slug) || schema!.table_name === 'customers');
  if (!schema || !isCustomers) {
    throw new Error('Only customer audiences can receive web push.');
  }
  const { members, total } = await evaluateAudienceMembers({
    tenantId,
    environment,
    schema,
    filterRoot: audience.filter_json,
    quickSearch: audience.quick_search ?? '',
    limit: 5000,
  });
  const ids = members.map((m) => String(m.id)).filter(Boolean);
  return { ids, truncated: total > ids.length || ids.length >= 5000 };
}

export async function countAudience(
  tenantId: string,
  environment: string,
  filter: BroadcastFilter,
  customerIds: string[] | null,
): Promise<AudienceCount> {
  const { data, error } = await supabase.rpc('web_push_audience_count', {
    p_tenant_id: tenantId,
    p_environment: environment,
    p_filter: filter,
    p_customer_ids: customerIds,
  });
  if (error) throw new Error(error.message);
  return data as AudienceCount;
}

export async function sendBroadcast(input: {
  tenantId: string;
  environment: string;
  clientKey: string;
  name: string;
  content: Record<string, unknown>;
  audience: AudienceChoice;
  customerIds: string[] | null;
  scheduledAt: string | null;
}): Promise<{ broadcast_id: string; queued: number; devices: number; excluded: number; capped: number; already_sent: boolean }> {
  const { data, error } = await supabase.rpc('web_push_broadcast_send', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_client_key: input.clientKey,
    p_name: input.name,
    p_content: input.content,
    p_audience: input.audience,
    p_filter: filterFor(input.audience),
    p_customer_ids: input.customerIds,
    p_scheduled_at: input.scheduledAt,
  });
  if (error) throw new Error(error.message);
  return data as { broadcast_id: string; queued: number; devices: number; excluded: number; capped: number; already_sent: boolean };
}

export async function cancelBroadcast(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('web_push_broadcast_cancel', { p_broadcast_id: id });
  if (error) throw new Error(error.message);
  return Number((data as { cancelled?: number })?.cancelled ?? 0);
}

export async function listBroadcasts(tenantId: string, environment: string): Promise<BroadcastRow[]> {
  const { data, error } = await supabase.rpc('web_push_broadcast_list', {
    p_tenant_id: tenantId,
    p_environment: environment,
    p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BroadcastRow[];
}
