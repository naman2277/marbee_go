import { supabase } from './supabase';
import { invokeFunction } from './functions';
import { connectorMeta } from './connector-meta';
import { logAudit } from './audit';
import type { ConnectorMappingRow } from './connector-mapping';

export type TestStatus = 'success' | 'failed' | 'warning';

export type ConnectionTestResult = {
  status: TestStatus;
  latencyMs: number;
  message: string;
  checks: Array<{ label: string; ok: boolean; detail?: string }>;
  source?: 'edge' | 'local';
};

export type ConnectorLink = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  source_connector_id: string;
  target_connector_id: string;
  bridge_schema: string;
  sync_mode: string;
  status: string;
  config: Record<string, unknown>;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_message: string | null;
  created_at?: string;
};

export type ConnectorTestLog = {
  id: string;
  connector_id: string | null;
  link_id: string | null;
  test_type: string;
  status: string;
  latency_ms: number | null;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const REQUIRED_KEYS: Record<string, string[]> = {
  webhook: [],
  rest_api: ['url'],
  sftp: ['host', 'username'],
  csv_upload: ['storage_path'],
  database: ['connection_string'],
  webhook_out: ['url'],
  api_push: ['url'],
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Local validation + simulated reachability when Edge Function unavailable */
export async function testConnectorLocal(opts: {
  connectorType: string;
  direction: string;
  config: Record<string, unknown>;
  mapping?: ConnectorMappingRow[];
  connectorId?: string;
}): Promise<ConnectionTestResult> {
  const start = Date.now();
  const checks: ConnectionTestResult['checks'] = [];
  const meta = connectorMeta(opts.connectorType);
  const config = opts.config ?? {};

  checks.push({
    label: 'Connector type',
    ok: Boolean(meta),
    detail: meta?.label ?? opts.connectorType,
  });

  const required = REQUIRED_KEYS[opts.connectorType] ?? [];
  for (const key of required) {
    const val = config[key];
    const ok = val != null && String(val).trim() !== '';
    checks.push({ label: `Config: ${key}`, ok, detail: ok ? 'Set' : 'Missing' });
  }

  const mapping = opts.mapping ?? [];
  const validMappings = mapping.filter((m) => m.source_field && m.target_field);
  checks.push({
    label: 'Field mappings',
    ok: validMappings.length > 0,
    detail: `${validMappings.length} mapping(s) configured`,
  });

  if (opts.connectorType === 'webhook' && opts.connectorId) {
    checks.push({
      label: 'Webhook endpoint',
      ok: true,
      detail: `/functions/v1/connector-webhook/${opts.connectorId}`,
    });
  }

  const url = String(config.url ?? '');
  if (url && (opts.connectorType === 'rest_api' || opts.connectorType === 'webhook_out' || opts.connectorType === 'api_push')) {
    try {
      new URL(url);
      checks.push({ label: 'URL format', ok: true, detail: url });
      await sleep(300);
      checks.push({
        label: 'Reachability (simulated)',
        ok: true,
        detail: 'Config valid — deploy connector-test Edge Function for live HTTP check',
      });
    } catch {
      checks.push({ label: 'URL format', ok: false, detail: 'Invalid URL' });
    }
  }

  if (opts.connectorType === 'sftp') {
    const host = String(config.host ?? '');
    checks.push({
      label: 'SFTP host',
      ok: host.length > 0,
      detail: host || 'Not set',
    });
  }

  if (opts.connectorType === 'database') {
    const cs = String(config.connection_string ?? '');
    const ok = cs.startsWith('postgres') || cs.startsWith('mysql');
    checks.push({
      label: 'Connection string format',
      ok: cs ? ok : false,
      detail: ok ? 'Valid prefix' : cs ? 'Expected postgresql:// or mysql://' : 'Missing',
    });
  }

  const failed = checks.filter((c) => !c.ok);
  const latencyMs = Date.now() - start;

  if (failed.length) {
    return {
      status: 'failed',
      latencyMs,
      message: failed[0].detail ?? failed[0].label,
      checks,
      source: 'local',
    };
  }

  if (required.some((k) => !config[k])) {
    return {
      status: 'warning',
      latencyMs,
      message: 'Configuration incomplete — fill required fields for live test',
      checks,
      source: 'local',
    };
  }

  return {
    status: 'success',
    latencyMs,
    message: 'Connection configuration valid',
    checks,
    source: 'local',
  };
}

export async function testConnectorRemote(opts: {
  tenantId: string;
  environment: string;
  connectorId: string;
  connectorType: string;
  direction: string;
  config: Record<string, unknown>;
}): Promise<ConnectionTestResult | null> {
  const result = await invokeFunction<{
    status: TestStatus;
    latency_ms: number;
    message: string;
    checks: ConnectionTestResult['checks'];
  }>('connector-test', {
    action: 'test_connector',
    tenant_id: opts.tenantId,
    environment: opts.environment,
    connector_id: opts.connectorId,
    connector_type: opts.connectorType,
    direction: opts.direction,
    config: opts.config,
  });

  if (!result.ok || !result.data) return null;

  return {
    status: result.data.status,
    latencyMs: result.data.latency_ms,
    message: result.data.message,
    checks: result.data.checks ?? [],
    source: 'edge',
  };
}

export async function testConnector(opts: {
  tenantId: string;
  environment: string;
  connectorId: string;
  connectorType: string;
  direction: string;
  config: Record<string, unknown>;
  mapping?: ConnectorMappingRow[];
}): Promise<ConnectionTestResult> {
  const remote = await testConnectorRemote(opts);
  const result = remote ?? (await testConnectorLocal({ ...opts, mapping: opts.mapping }));

  await logConnectorTest({
    tenant_id: opts.tenantId,
    environment: opts.environment,
    connector_id: opts.connectorId,
    test_type: 'single',
    status: result.status,
    latency_ms: result.latencyMs,
    message: result.message,
    details: { checks: result.checks, source: result.source },
  });

  await supabase
    .from('connectors')
    .update({
      config: {
        ...opts.config,
        last_test_at: new Date().toISOString(),
        last_test_status: result.status,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.connectorId);

  return result;
}

export async function testConnectorLink(opts: {
  tenantId: string;
  environment: string;
  linkId?: string;
  sourceConnector: { id: string; name: string; connector_type: string; direction: string; config: Record<string, unknown>; mapping: ConnectorMappingRow[] };
  targetConnector: { id: string; name: string; connector_type: string; direction: string; config: Record<string, unknown>; mapping: ConnectorMappingRow[] };
  bridgeSchema: string;
}): Promise<ConnectionTestResult> {
  const start = Date.now();
  const checks: ConnectionTestResult['checks'] = [];

  checks.push({
    label: 'Source direction',
    ok: opts.sourceConnector.direction === 'inbound',
    detail: opts.sourceConnector.direction,
  });
  checks.push({
    label: 'Target direction',
    ok: opts.targetConnector.direction === 'outbound',
    detail: opts.targetConnector.direction,
  });

  const sourceMaps = opts.sourceConnector.mapping.filter(
    (m) => m.target_schema === opts.bridgeSchema && m.source_field && m.target_field,
  );
  checks.push({
    label: 'Source → bridge mappings',
    ok: sourceMaps.length > 0,
    detail: `${sourceMaps.length} field(s) to ${opts.bridgeSchema}`,
  });

  const targetMaps = opts.targetConnector.mapping.filter(
    (m) => m.source_field && m.target_field,
  );
  checks.push({
    label: 'Target outbound mappings',
    ok: targetMaps.length > 0,
    detail: `${targetMaps.length} outbound field(s)`,
  });

  const sourceTest = await testConnectorLocal({
    connectorType: opts.sourceConnector.connector_type,
    direction: opts.sourceConnector.direction,
    config: opts.sourceConnector.config,
    mapping: opts.sourceConnector.mapping,
    connectorId: opts.sourceConnector.id,
  });
  checks.push({
    label: `Source: ${opts.sourceConnector.name}`,
    ok: sourceTest.status !== 'failed',
    detail: sourceTest.message,
  });

  const targetTest = await testConnectorLocal({
    connectorType: opts.targetConnector.connector_type,
    direction: opts.targetConnector.direction,
    config: opts.targetConnector.config,
    mapping: opts.targetConnector.mapping,
    connectorId: opts.targetConnector.id,
  });
  checks.push({
    label: `Target: ${opts.targetConnector.name}`,
    ok: targetTest.status !== 'failed',
    detail: targetTest.message,
  });

  const failed = checks.filter((c) => !c.ok);
  const latencyMs = Date.now() - start;
  const status: TestStatus = failed.length ? 'failed' : 'success';
  const message = failed.length
    ? failed[0].detail ?? 'Link validation failed'
    : `Pipeline ready: ${opts.sourceConnector.name} → ${opts.bridgeSchema} → ${opts.targetConnector.name}`;

  const result: ConnectionTestResult = { status, latencyMs, message, checks, source: 'local' };

  if (opts.linkId) {
    await logConnectorTest({
      tenant_id: opts.tenantId,
      environment: opts.environment,
      link_id: opts.linkId,
      test_type: 'link',
      status: result.status,
      latency_ms: result.latencyMs,
      message: result.message,
      details: { checks: result.checks },
    });

    await supabase
      .from('connector_links')
      .update({
        last_test_at: new Date().toISOString(),
        last_test_status: result.status,
        last_test_message: result.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.linkId);
  }

  return result;
}

async function logConnectorTest(row: {
  tenant_id: string;
  environment: string;
  connector_id?: string;
  link_id?: string;
  test_type: string;
  status: string;
  latency_ms: number;
  message: string;
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('connector_test_logs').insert(row);
  } catch {
    // Table may not exist until migration runs
  }
}

export async function fetchConnectorLinks(tenantId: string, environment: string) {
  const { data, error } = await supabase
    .from('connector_links')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConnectorLink[];
}

export async function createConnectorLink(input: {
  tenant_id: string;
  environment: string;
  name: string;
  source_connector_id: string;
  target_connector_id: string;
  bridge_schema: string;
  sync_mode?: string;
}) {
  const { data, error } = await supabase
    .from('connector_links')
    .insert({ ...input, status: 'active', sync_mode: input.sync_mode ?? 'batch' })
    .select()
    .single();
  if (error) throw error;
  const link = data as ConnectorLink;
  void logAudit({
    tenantId: input.tenant_id,
    environment: input.environment,
    action: 'create',
    resourceType: 'connector_link',
    resourceId: link.id,
    resourceName: input.name,
  });
  return link;
}

export async function deleteConnectorLink(id: string) {
  const { data: prev } = await supabase.from('connector_links').select('*').eq('id', id).maybeSingle();
  const { error } = await supabase.from('connector_links').delete().eq('id', id);
  if (error) throw error;
  if (prev) {
    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action: 'delete',
      resourceType: 'connector_link',
      resourceId: id,
      resourceName: prev.name,
    });
  }
}

export async function fetchTestLogs(opts: { connectorId?: string; linkId?: string; limit?: number }) {
  let q = supabase.from('connector_test_logs').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 10);
  if (opts.connectorId) q = q.eq('connector_id', opts.connectorId);
  if (opts.linkId) q = q.eq('link_id', opts.linkId);
  const { data, error } = await q;
  if (error) return [] as ConnectorTestLog[];
  return (data ?? []) as ConnectorTestLog[];
}
