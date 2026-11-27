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
  /** web_analytics_sites.site_id values; empty/undefined = every website */
  sites?: string[];
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
  folder_path: string;
  created_by: string | null;
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
  const siteNames = Array.isArray(a.siteNames) ? (a.siteNames as string[]) : [];
  const base = describeWho(a);
  return siteNames.length ? `${base} · on ${siteNames.join(', ')}` : base;
}

function describeWho(a: Record<string, unknown>): string {
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
  /** What the marketer chose, stored for display (choice + website names). */
  audience: Record<string, unknown>;
  filter: BroadcastFilter;
  customerIds: string[] | null;
  scheduledAt: string | null;
  folderPath: string;
}): Promise<{ broadcast_id: string; queued: number; devices: number; excluded: number; capped: number; already_sent: boolean }> {
  const { data, error } = await supabase.rpc('web_push_broadcast_send', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_client_key: input.clientKey,
    p_name: input.name,
    p_content: input.content,
    p_audience: input.audience,
    p_filter: input.filter,
    p_customer_ids: input.customerIds,
    p_scheduled_at: input.scheduledAt,
    p_folder_path: input.folderPath,
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
    p_limit: 500,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BroadcastRow[];
}

// ---------------------------------------------------------------- campaign report (SQL 98)
export type ReportSegment = { name: string; targeted: number; delivered: number; clicked: number };

export type BroadcastReport = {
  broadcast: {
    id: string;
    name: string;
    content: Record<string, unknown>;
    audience: Record<string, unknown>;
    scheduled_at: string | null;
    created_at: string;
    cancelled_at: string | null;
    result: { queued?: number; devices?: number; excluded?: number; capped?: number };
    status: BroadcastRow['status'];
  };
  summary: {
    targeted: number;
    queued: number;
    delivered: number;
    failed: number;
    skipped: number;
    clicked: number;
    clicked_known: number;
    clicked_anonymous: number;
    excluded_at_send: number;
    capped_at_send: number;
    first_sent_at: string | null;
    last_sent_at: string | null;
    first_click_at: string | null;
    last_click_at: string | null;
    median_seconds_to_click: number | null;
    p90_seconds_to_click: number | null;
  };
  by_action: { action: string; clicks: number }[];
  by_browser: ReportSegment[];
  by_os: ReportSegment[];
  by_device: ReportSegment[];
  timeline: { t: string; delivered: number; clicked: number }[];
  bucket: number | null;
  issues: { status: 'failed' | 'skipped'; reason: string; count: number }[];
  recent_clicks: {
    clicked_at: string;
    action: string;
    browser: string;
    os: string;
    device: string;
    seconds_to_click: number | null;
    customer_id: string | null;
    customer: string | null;
  }[];
};

export async function fetchBroadcastReport(id: string): Promise<BroadcastReport> {
  const { data, error } = await supabase.rpc('web_push_broadcast_report', { p_broadcast_id: id });
  if (error) throw new Error(error.message);
  return data as BroadcastReport;
}

export type CtaRow = { key: string; label: string; kind: 'body' | 'button' | 'other'; url: string | null; clicks: number };

/** Clicks per call-to-action: the notification body plus each button, in the order shown. */
export function ctaBreakdown(content: Record<string, unknown>, byAction: { action: string; clicks: number }[]): CtaRow[] {
  const clicks = new Map(byAction.map((x) => [x.action, x.clicks]));
  const actions = Array.isArray(content.actions) ? (content.actions as { action?: string; title?: string; url?: string }[]) : [];
  const rows: CtaRow[] = [
    { key: 'body', label: 'Notification (body click)', kind: 'body', url: (content.click_url as string) ?? null, clicks: clicks.get('body') ?? 0 },
  ];
  actions.slice(0, 2).forEach((a, i) => {
    const key = a.action || `action_${i + 1}`;
    rows.push({ key, label: `Button ${i + 1}: ${a.title || 'Open'}`, kind: 'button', url: a.url || (content.click_url as string) || null, clicks: clicks.get(key) ?? 0 });
  });
  const known = new Set(rows.map((r) => r.key));
  const other = byAction.filter((x) => !known.has(x.action)).reduce((s, x) => s + x.clicks, 0);
  if (other > 0) rows.push({ key: 'other', label: 'Other', kind: 'other', url: null, clicks: other });
  return rows;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

// ---------------------------------------------------------------- websites + folders (SQL 97)
export type PushSite = { site_id: string | null; name: string | null; domain: string | null; devices: number };

export async function fetchPushSites(tenantId: string, environment: string): Promise<PushSite[]> {
  const { data, error } = await supabase.rpc('web_push_site_counts', { p_tenant_id: tenantId, p_environment: environment });
  if (error) throw new Error(error.message);
  return (data ?? []) as PushSite[];
}

export type CampaignFolder = { path: string; name: string; parent_path: string };

export async function fetchCampaignFolders(tenantId: string, environment: string): Promise<CampaignFolder[]> {
  const { data, error } = await supabase
    .from('web_push_campaign_folders')
    .select('path, name, parent_path')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('path');
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignFolder[];
}

/** create: path = parent folder, name = new name · rename: path = folder, name = new name · delete: path = folder */
export async function saveCampaignFolder(
  tenantId: string,
  environment: string,
  op: 'create' | 'rename' | 'delete',
  path: string,
  name?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('web_push_folder_save', {
    p_tenant_id: tenantId, p_environment: environment, p_op: op, p_path: path, p_name: name ?? null,
  });
  if (error) throw new Error(error.message);
  return String((data as { path?: string })?.path ?? '/');
}

export async function moveBroadcast(id: string, folderPath: string): Promise<void> {
  const { error } = await supabase.rpc('web_push_broadcast_move', { p_broadcast_id: id, p_folder_path: folderPath });
  if (error) throw new Error(error.message);
}

export type CampaignFolderNode = { path: string; name: string; directCount: number; children: CampaignFolderNode[] };

/** Folder tree; counts include campaigns in subfolders. Folders only implied by a campaign's path still show. */
export function buildCampaignFolderTree(folders: CampaignFolder[], rows: { folder_path: string }[]): CampaignFolderNode {
  const paths = new Set<string>(['/']);
  const addWithAncestors = (path: string) => {
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i += 1) paths.add('/' + parts.slice(0, i).join('/'));
  };
  folders.forEach((f) => addWithAncestors(f.path));
  rows.forEach((r) => addWithAncestors(r.folder_path || '/'));
  const inSubtree = (path: string) =>
    rows.filter((r) => { const fp = r.folder_path || '/'; return path === '/' || fp === path || fp.startsWith(path + '/'); }).length;
  const node = (path: string): CampaignFolderNode => ({
    path,
    name: path === '/' ? 'All' : path.slice(path.lastIndexOf('/') + 1),
    directCount: inSubtree(path),
    children: [...paths]
      .filter((p) => p !== '/' && p.slice(0, p.lastIndexOf('/') || 1) === path)
      .sort((a, b) => a.localeCompare(b))
      .map(node),
  });
  return node('/');
}
