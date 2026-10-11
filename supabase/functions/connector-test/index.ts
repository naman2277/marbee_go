import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, errorResponse, getServiceClient, jsonResponse } from '../_shared/supabase.ts';

type Check = { label: string; ok: boolean; detail?: string };

async function httpProbe(url: string, method = 'HEAD'): Promise<{ ok: boolean; detail: string; latency: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(8000) });
    return {
      ok: res.status < 500,
      detail: `HTTP ${res.status}`,
      latency: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : 'Request failed',
      latency: Date.now() - start,
    };
  }
}

async function testConnectorBody(body: Record<string, unknown>) {
  const start = Date.now();
  const connectorType = String(body.connector_type ?? '');
  const config = (body.config ?? {}) as Record<string, unknown>;
  const checks: Check[] = [];

  if (connectorType === 'rest_api' || connectorType === 'api_push' || connectorType === 'webhook_out') {
    const url = String(config.url ?? '');
    if (!url) {
      checks.push({ label: 'URL', ok: false, detail: 'Missing url' });
    } else {
      try {
        new URL(url);
        checks.push({ label: 'URL format', ok: true, detail: url });
        const probe = await httpProbe(url, connectorType === 'rest_api' ? 'GET' : 'HEAD');
        checks.push({ label: 'HTTP reachability', ok: probe.ok, detail: probe.detail });
      } catch {
        checks.push({ label: 'URL format', ok: false, detail: 'Invalid URL' });
      }
    }
  }

  if (connectorType === 'webhook') {
    checks.push({ label: 'Webhook ready', ok: true, detail: 'Endpoint will accept POST after deploy' });
  }

  if (connectorType === 'sftp') {
    const host = String(config.host ?? '');
    checks.push({
      label: 'SFTP host',
      ok: host.length > 0,
      detail: host ? `${host}:${config.port ?? 22}` : 'Missing host',
    });
  }

  if (connectorType === 'database') {
    const cs = String(config.connection_string ?? '');
    checks.push({
      label: 'Connection string',
      ok: cs.startsWith('postgres') || cs.startsWith('mysql'),
      detail: cs ? 'Format OK (live DB ping not enabled)' : 'Missing',
    });
  }

  const failed = checks.filter((c) => !c.ok);
  const latency_ms = Date.now() - start;

  return {
    status: failed.length ? 'failed' : 'success',
    latency_ms,
    message: failed[0]?.detail ?? 'Connection test passed',
    checks,
  };
}

async function testLinkBody(body: Record<string, unknown>, supabase: ReturnType<typeof getServiceClient>) {
  const sourceId = body.source_connector_id as string;
  const targetId = body.target_connector_id as string;
  const bridgeSchema = body.bridge_schema as string;

  const { data: source } = await supabase.from('connectors').select('*').eq('id', sourceId).maybeSingle();
  const { data: target } = await supabase.from('connectors').select('*').eq('id', targetId).maybeSingle();

  if (!source || !target) return errorResponse('Connectors not found', 404);

  const checks: Check[] = [];
  checks.push({ label: 'Source inbound', ok: source.direction === 'inbound', detail: source.direction });
  checks.push({ label: 'Target outbound', ok: target.direction === 'outbound', detail: target.direction });

  const sourceMapping = (source.mapping ?? []) as Array<{ target_schema: string; source_field: string; target_field: string }>;
  const bridgeMaps = sourceMapping.filter((m) => m.target_schema === bridgeSchema && m.source_field && m.target_field);
  checks.push({ label: 'Bridge mappings', ok: bridgeMaps.length > 0, detail: `${bridgeMaps.length} fields` });

  const sourceResult = await testConnectorBody({ connector_type: source.connector_type, config: source.config });
  checks.push({ label: 'Source connection', ok: sourceResult.status === 'success', detail: sourceResult.message });

  const targetResult = await testConnectorBody({ connector_type: target.connector_type, config: target.config });
  checks.push({ label: 'Target connection', ok: targetResult.status === 'success', detail: targetResult.message });

  const failed = checks.filter((c) => !c.ok);
  return jsonResponse({
    status: failed.length ? 'failed' : 'success',
    latency_ms: sourceResult.latency_ms + targetResult.latency_ms,
    message: failed.length ? failed[0].detail : `Link OK: ${source.name} → ${bridgeSchema} → ${target.name}`,
    checks,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === 'test_connector') {
      const result = await testConnectorBody(body);
      return jsonResponse(result);
    }

    if (action === 'test_link') {
      const supabase = getServiceClient();
      return await testLinkBody(body, supabase);
    }

    return errorResponse('Unknown action', 400);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500);
  }
});
