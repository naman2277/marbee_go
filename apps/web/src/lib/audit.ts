import { supabase } from './supabase';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'unpublish'
  | 'refresh'
  | 'run'
  | 'test'
  | 'sync'
  | 'release'
  | 'archive'
  | 'restore';

export type AuditResourceType =
  | 'audience'
  | 'connector'
  | 'connector_link'
  | 'schema'
  | 'schema_record'
  | 'form'
  | 'content_template'
  | 'landing_page'
  | 'asset'
  | 'asset_folder'
  | 'data_quality_rule'
  | 'quarantine_record'
  | 'data_job'
  | 'customer'
  | 'information_service'
  | 'service_subscription'
  | 'journey'
  | 'settings'
  | 'tenant_member'
  | 'role'
  | 'api_key'
  | 'loyalty_program'
  | 'loyalty_offer'
  | 'offer_decision_policy'
  | 'social_account'
  | 'social_post'
  | 'chatbot'
  | 'ai_engine_providers';

export const AUDIT_RETENTION_DAYS = 7;

export const AUDIT_PAGE_SIZE_DEFAULT = 20;

export type AuditSortField = 'created_at' | 'action' | 'resource_type';
export type AuditSortDir = 'asc' | 'desc';

export type AuditLogsPage = {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const AUDIT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export const AUDIT_ACTION_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Updated' },
  { value: 'delete', label: 'Deleted' },
  { value: 'publish', label: 'Published' },
  { value: 'unpublish', label: 'Unpublished' },
  { value: 'refresh', label: 'Refreshed' },
  { value: 'run', label: 'Ran' },
  { value: 'sync', label: 'Synced' },
  { value: 'release', label: 'Released' },
  { value: 'archive', label: 'Archived' },
];

export const AUDIT_RESOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All modules' },
  { value: 'audience', label: 'Cohorts' },
  { value: 'connector', label: 'Connectors' },
  { value: 'connector_link', label: 'Connections' },
  { value: 'schema', label: 'Schemas' },
  { value: 'form', label: 'Forms' },
  { value: 'landing_page', label: 'Landing pages' },
  { value: 'data_quality_rule', label: 'Quality rules' },
  { value: 'asset', label: 'Assets' },
  { value: 'customer', label: 'Customers' },
  { value: 'information_service', label: 'Subscriptions' },
  { value: 'service_subscription', label: 'Service subscribers' },
  { value: 'journey', label: 'Journeys' },
];

export const AUDIT_SORT_OPTIONS: { field: AuditSortField; label: string }[] = [
  { field: 'created_at', label: 'Date' },
  { field: 'action', label: 'Action' },
  { field: 'resource_type', label: 'Resource type' },
];

export type AuditLog = {
  id: string;
  tenant_id: string;
  environment: string;
  user_id: string | null;
  action: AuditAction | string;
  resource_type: AuditResourceType | string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user_email?: string | null;
  user_name?: string | null;
};

export type LogAuditInput = {
  tenantId: string;
  environment: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  resourceName?: string;
  summary?: string;
  changes?: Array<{ field: string; from?: unknown; to?: unknown }>;
  metadata?: Record<string, unknown>;
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  publish: 'Published',
  unpublish: 'Unpublished',
  refresh: 'Refreshed',
  run: 'Ran',
  test: 'Tested',
  sync: 'Synced',
  release: 'Released',
  archive: 'Archived',
  restore: 'Restored',
};

export const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  audience: 'Cohort',
  connector: 'Connector',
  connector_link: 'Connection',
  schema: 'Schema',
  schema_record: 'Record',
  form: 'Form',
  landing_page: 'Landing page',
  asset: 'Asset',
  asset_folder: 'Asset folder',
  data_quality_rule: 'Quality rule',
  quarantine_record: 'Quarantine',
  data_job: 'Data job',
  customer: 'Customer',
  information_service: 'Information service',
  service_subscription: 'Service subscription',
  journey: 'Journey',
  settings: 'Settings',
  tenant_member: 'Member',
  role: 'Role',
  api_key: 'API key',
};

/** Fire-and-forget audit log — never throws to caller */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const metadata: Record<string, unknown> = {
      ...input.metadata,
      resource_name: input.resourceName,
      summary: input.summary,
      changes: input.changes,
      user_email: user?.email ?? null,
      user_name: (user?.user_metadata?.name as string) ?? null,
    };

    await supabase.rpc('log_audit_event', {
      p_tenant_id: input.tenantId,
      p_environment: input.environment,
      p_action: input.action,
      p_resource_type: input.resourceType,
      p_resource_id: input.resourceId ?? null,
      p_metadata: metadata,
    });
  } catch {
    // Audit must not break primary operations; table/RPC may not exist until migration
  }
}

export async function purgeOldAuditLogs(days = AUDIT_RETENTION_DAYS): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('purge_old_audit_logs', { p_days: days });
    if (error) return 0;
    return typeof data === 'number' ? data : 0;
  } catch {
    return 0;
  }
}

export async function fetchAuditLogsPage(opts: {
  tenantId: string;
  environment: string;
  resourceType?: AuditResourceType | string;
  resourceId?: string;
  actionFilter?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: AuditSortField;
  sortDir?: AuditSortDir;
}): Promise<AuditLogsPage> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? AUDIT_PAGE_SIZE_DEFAULT;
  const sortBy = opts.sortBy ?? 'created_at';
  const sortDir = opts.sortDir ?? 'desc';

  try {
    const { data, error } = await supabase.rpc('fetch_audit_logs_page', {
      p_tenant_id: opts.tenantId,
      p_environment: opts.environment,
      p_resource_type: opts.resourceType ?? null,
      p_resource_id: opts.resourceId ?? null,
      p_action: opts.actionFilter ?? null,
      p_search: opts.search?.trim() || null,
      p_page: page,
      p_page_size: pageSize,
      p_sort_by: sortBy,
      p_sort_dir: sortDir,
    });

    if (error) {
      return fetchAuditLogsPageFallback(opts);
    }

    const payload = data as {
      logs?: AuditLog[];
      total?: number;
      page?: number;
      page_size?: number;
      total_pages?: number;
    };

    const logs = await enrichWithProfiles((payload.logs ?? []) as AuditLog[]);
    return {
      logs,
      total: payload.total ?? logs.length,
      page: payload.page ?? page,
      pageSize: payload.page_size ?? pageSize,
      totalPages: payload.total_pages ?? 1,
    };
  } catch {
    return fetchAuditLogsPageFallback(opts);
  }
}

/** Fallback when RPC not deployed — client-side slice with Supabase range */
async function fetchAuditLogsPageFallback(opts: {
  tenantId: string;
  environment: string;
  resourceType?: AuditResourceType | string;
  resourceId?: string;
  actionFilter?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: AuditSortField;
  sortDir?: AuditSortDir;
}): Promise<AuditLogsPage> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? AUDIT_PAGE_SIZE_DEFAULT;
  const sortBy = opts.sortBy ?? 'created_at';
  const sortDir = opts.sortDir ?? 'desc';
  const retentionCutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let countQ = supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', opts.tenantId)
    .eq('environment', opts.environment)
    .gte('created_at', retentionCutoff);

  if (opts.resourceType) countQ = countQ.eq('resource_type', opts.resourceType);
  if (opts.resourceId) countQ = countQ.eq('resource_id', opts.resourceId);
  if (opts.actionFilter) countQ = countQ.eq('action', opts.actionFilter);
  if (opts.search?.trim()) {
    const s = opts.search.trim().replace(/[%_]/g, '');
    countQ = countQ.or(`action.ilike.%${s}%,resource_type.ilike.%${s}%`);
  }

  const { count } = await countQ;
  const total = count ?? 0;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from('audit_logs')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('environment', opts.environment)
    .gte('created_at', retentionCutoff)
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(from, to);

  if (opts.resourceType) q = q.eq('resource_type', opts.resourceType);
  if (opts.resourceId) q = q.eq('resource_id', opts.resourceId);
  if (opts.actionFilter) q = q.eq('action', opts.actionFilter);
  if (opts.search?.trim()) {
    const s = opts.search.trim().replace(/[%_]/g, '');
    q = q.or(`action.ilike.%${s}%,resource_type.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) return { logs: [], total: 0, page, pageSize, totalPages: 1 };

  const logs = await enrichWithProfiles((data ?? []) as AuditLog[]);
  return { logs, total, page, pageSize, totalPages };
}

export async function fetchAuditLogs(opts: {
  tenantId: string;
  environment: string;
  resourceType?: AuditResourceType | string;
  resourceId?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  const result = await fetchAuditLogsPage({
    ...opts,
    page: 1,
    pageSize: opts.limit ?? 50,
  });
  return result.logs;
}

export async function fetchResourceAuditLogs(
  tenantId: string,
  environment: string,
  resourceType: AuditResourceType | string,
  resourceId: string,
  page = 1,
  pageSize = 20,
  sortBy: AuditSortField = 'created_at',
  sortDir: AuditSortDir = 'desc',
): Promise<AuditLogsPage> {
  return fetchAuditLogsPage({
    tenantId,
    environment,
    resourceType,
    resourceId,
    page,
    pageSize,
    sortBy,
    sortDir,
  });
}

async function enrichWithProfiles(logs: AuditLog[]): Promise<AuditLog[]> {
  const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];
  if (!userIds.length) return logs;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, name')
    .in('id', userIds);

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return logs.map((log) => {
    const profile = log.user_id ? byId.get(log.user_id) : undefined;
    const meta = log.metadata ?? {};
    return {
      ...log,
      metadata: meta,
      user_email: profile?.email ?? (meta.user_email as string) ?? null,
      user_name: profile?.name ?? (meta.user_name as string) ?? null,
    };
  });
}

export function auditEntryTitle(log: AuditLog): string {
  const action = AUDIT_ACTION_LABELS[log.action] ?? log.action;
  const resource = AUDIT_RESOURCE_LABELS[log.resource_type] ?? log.resource_type;
  const name = (log.metadata?.resource_name as string) ?? (log.metadata?.summary as string);
  if (name) return `${action} ${resource}: ${name}`;
  return `${action} ${resource}`;
}

export function auditEntrySubtitle(log: AuditLog): string {
  const parts: string[] = [];
  const summary = log.metadata?.summary as string | undefined;
  if (summary && summary !== log.metadata?.resource_name) parts.push(summary);

  const changes = log.metadata?.changes as Array<{ field: string; from?: unknown; to?: unknown }> | undefined;
  if (changes?.length) {
    parts.push(
      changes
        .slice(0, 3)
        .map((c) => `${c.field}: ${formatVal(c.from)} → ${formatVal(c.to)}`)
        .join('; '),
    );
  }

  return parts.join(' · ') || '';
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.startsWith('<') || trimmed.includes('</div>') || trimmed.includes('</')) {
      return `HTML (${v.length} chars)`;
    }
    if (v.length > 45) {
      return `"${v.slice(0, 42)}..."`;
    }
    return `"${v}"`;
  }
  if (Array.isArray(v)) {
    return `${v.length} items`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>);
    if (keys.length === 0) return 'empty';
    if (keys.length <= 2) return keys.join(', ');
    return `${keys.slice(0, 2).join(', ')} (+${keys.length - 2} more)`;
  }
  return String(v);
}

export function auditActorLabel(log: AuditLog): string {
  return log.user_name || log.user_email || (log.user_id ? 'User' : 'System');
}

export function formatAuditTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Build change list from a patch object vs previous values */
export function diffChanges(
  previous: Record<string, unknown>,
  patch: Record<string, unknown>,
  fields?: string[],
): Array<{ field: string; from?: unknown; to?: unknown }> {
  const keys = fields ?? Object.keys(patch);
  return keys
    .filter((k) => patch[k] !== undefined && JSON.stringify(previous[k]) !== JSON.stringify(patch[k]))
    .map((k) => ({ field: k, from: previous[k], to: patch[k] }));
}
