// connector-test — "Test connection" for connectors and connector links.
//
// SEC-08 (Phase 0): previously had no authentication at all, so anyone could make
// Marbee's servers fetch arbitrary URLs (SSRF — e.g. the cloud metadata service), and
// test_link read ANY tenant's connectors with the service role. Now:
//   • the caller must be a signed-in member of the workspace;
//   • test_link loads connectors AS the caller (RLS) and only within that workspace;
//   • every outbound probe goes through net-guard (public http(s) hosts only, DNS
//     checked) and never follows redirects;
//   • per-user rate limit.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase.ts';
import { AuthError, authenticateUser, resolveTenant, type AuthedUser } from '../_shared/auth.ts';
import { rateLimited } from '../_shared/ingest-auth.ts';
import { assertPublicHttpUrl, BlockedUrlError } from '../_shared/net-guard.ts';

type Check = { label: string; ok: boolean; detail?: string };

async function httpProbe(url: string, method = 'HEAD'): Promise<{ ok: boolean; detail: string; latency: number }> {
  const start = Date.now();
  try {
    await assertPublicHttpUrl(url);
  } catch (e) {
    return { ok: false, detail: e instanceof BlockedUrlError ? `Blocked: ${e.message}` : 'Invalid URL', latency: 0 };
  }
  try {
    // redirect: 'manual' — a public URL must not be able to bounce us to an internal one.
    const res = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    await res.body?.cancel();
    const redirected = res.status >= 300 && res.status < 400;
    return {
      ok: res.status < 500,
      detail: redirected ? `HTTP ${res.status} (redirect not followed)` : `HTTP ${res.status}`,
      latency: Date.now() - start,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return { ok: false, detail: /timed? ?out|abort/i.test(msg) ? 'Timed out after 8s' : 'Could not connect', latency: Date.now() - start };
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
        checks.push({ label: 'URL format', ok: true, detail: url.slice(0, 200) });
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
    checks.push({ label: 'SFTP host', ok: host.length > 0, detail: host ? `${host}:${config.port ?? 22}` : 'Missing host' });
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
  return {
    status: failed.length ? 'failed' : 'success',
    latency_ms: Date.now() - start,
    message: failed[0]?.detail ?? 'Connection test passed',
    checks,
  };
}

async function testLinkBody(user: AuthedUser, tenantId: string, body: Record<string, unknown>) {
  const sourceId = String(body.source_connector_id ?? '');
  const targetId = String(body.target_connector_id ?? '');
  const bridgeSchema = String(body.bridge_schema ?? '');

  // As the caller (RLS) AND explicitly within the caller's workspace.
  const { data: rows, error } = await user.db.from('connectors')
    .select('id, name, direction, connector_type, config, mapping')
    .eq('tenant_id', tenantId).in('id', [sourceId, targetId]);
  if (error) throw new AuthError(500, 'Could not load connectors');
  const source = rows?.find((r) => r.id === sourceId);
  const target = rows?.find((r) => r.id === targetId);
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await authenticateUser(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return errorResponse('JSON body required', 400);
    const tenantId = await resolveTenant(user, body.tenant_id);
    if (rateLimited(`connector-test:${user.userId}`, 30)) return errorResponse('Too many tests — wait a minute', 429);

    const action = body.action as string;
    if (action === 'test_connector') return jsonResponse(await testConnectorBody(body));
    if (action === 'test_link') return await testLinkBody(user, tenantId, body);
    return errorResponse('Unknown action', 400);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('connector-test unhandled', e instanceof Error ? e.message : e);
    return errorResponse('Internal error', 500);
  }
});
