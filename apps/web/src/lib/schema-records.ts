import { supabase } from './supabase';
import { logAudit } from './audit';
import { SCHEMA_TABLE_CONFIG } from './schema-data';
import { invokeFunction } from './functions';
import { fetchWebPushSubscribers } from './web-analytics';

export type RecordPayload = Record<string, unknown>;

/** Direct PostgREST CRUD for published custom tables (RLS-scoped) */
export async function listSchemaRecords(
  tableName: string,
  tenantId: string,
  environment: string,
  limit = 500,
): Promise<Record<string, unknown>[]> {
  const client = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

  const { data, error } = await client
    .from(tableName)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

export async function createSchemaRecord(
  tableName: string,
  tenantId: string,
  environment: string,
  record: RecordPayload,
): Promise<Record<string, unknown>> {
  const client = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

  const { data, error } = await client
    .from(tableName)
    .insert({ ...record, tenant_id: tenantId, environment })
    .select()
    .single();

  if (error) throw error;
  const row = data as Record<string, unknown>;
  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'schema_record',
    resourceId: String(row.id ?? ''),
    resourceName: tableName,
    summary: `Created record in ${tableName}`,
    metadata: { table_name: tableName },
  });
  return row;
}

export async function updateSchemaRecord(
  tableName: string,
  id: string,
  record: RecordPayload,
  scope?: { tenantId: string; environment: string },
): Promise<Record<string, unknown>> {
  const client = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

  const { data, error } = await client.from(tableName).update(record).eq('id', id).select().single();

  if (error) throw error;
  if (scope) {
    void logAudit({
      tenantId: scope.tenantId,
      environment: scope.environment,
      action: 'update',
      resourceType: 'schema_record',
      resourceId: id,
      resourceName: tableName,
      metadata: { table_name: tableName, fields: Object.keys(record) },
    });
  }
  return data as Record<string, unknown>;
}

export async function deleteSchemaRecord(
  tableName: string,
  id: string,
  scope?: { tenantId: string; environment: string },
): Promise<void> {
  const client = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

  const { error } = await client.from(tableName).delete().eq('id', id);
  if (error) throw error;
  if (scope) {
    void logAudit({
      tenantId: scope.tenantId,
      environment: scope.environment,
      action: 'delete',
      resourceType: 'schema_record',
      resourceId: id,
      resourceName: tableName,
      metadata: { table_name: tableName },
    });
  }
}

/** Load rows for schema data explorer (system tables with join config or custom tables) */
export async function fetchSchemaRows(
  tableName: string,
  tenantId: string,
  environment: string,
  limit = 500,
): Promise<Record<string, unknown>[]> {
  // Sync pushSubscribers / web_push_subscribers directly with live Web Analytics feed
  if (
    tableName === 'pushSubscribers' ||
    tableName === 'web_push_subscribers' ||
    tableName === 'push_subscribers' ||
    tableName === 'web_push_subscriber'
  ) {
    let pushSubs: Awaited<ReturnType<typeof fetchWebPushSubscribers>> = [];
    try {
      pushSubs = await fetchWebPushSubscribers(tenantId, environment);
    } catch {}

    return pushSubs.map((s) => ({
      id: s.id,
      tenant_id: s.tenantId || tenantId,
      environment: s.environment || environment,
      customer_id: s.customerId || null,
      fcm_token: s.fcmToken,
      browser: s.browser,
      os: s.os,
      device: s.device,
      website_domain: s.websiteDomain || 'web',
      optin_page: s.optinPage || '/',
      optin_status: s.optinStatus || 'yes',
      permission_status: s.permissionStatus || 'granted',
      subscription_status: s.subscriptionStatus || 'active',
      is_test_token: Boolean(s.isTestToken),
      endpoint: s.endpoint || null,
      last_seen: s.lastSeen,
      created_at: s.createdAt,
      customer_name: `${s.browser} (${s.device || 'desktop'})`,
      customer_email: s.customerId
        ? `${s.customerId}@marbee.io`
        : `${(s.browser || 'browser').toLowerCase()}@${s.websiteDomain || 'web'}`,
    }));
  }

  const config = SCHEMA_TABLE_CONFIG[tableName];
  const client = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

  if (config) {
    const { data, error } = await client
      .from(tableName)
      .select(config.select)
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .order(config.orderBy, { ascending: config.ascending ?? false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  return listSchemaRecords(tableName, tenantId, environment, limit);
}

/** External API-style CRUD via Edge Function (API key / server integrations) */
export async function invokeSchemaRecords<T = Record<string, unknown>>(
  action: 'list' | 'create' | 'update' | 'delete',
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const result = await invokeFunction<T>('schema-records', { action, ...body });
  return result.ok
    ? { ok: true, data: result.data }
    : { ok: false, error: result.error };
}
