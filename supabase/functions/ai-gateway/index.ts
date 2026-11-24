// ai-gateway — the ONLY way the Marbee app talks to an LLM (D-018, Phase 0 · SEC-06/SEC-07).
//
// The browser sends prompts; this function picks the key, calls the provider, meters
// usage, and returns text. Provider keys never reach the browser:
//   • tenant keys live sealed in ai_engine_providers.api_key_encrypted (MARBEE_SECRETS_KEY)
//     and the column isn't even readable by app users (sql/89);
//   • otherwise Marbee's platform key from function secrets is used, and the call is
//     debited from the tenant's AI credits (D-015) when a wallet exists.
//
// Ops (POST JSON, signed-in user JWT required; deploy with JWT verification ON):
//   complete  { tenant_id, environment?, provider?, model?, system_prompt, user_message,
//               temperature?, max_tokens?, candidate_key? }  → { text, provider, model, source, latency_ms, tokens }
//   save_key  { tenant_id, environment?, provider, model_name, api_key }      (settings.manage)
//   clear_key { tenant_id, environment?, provider, model_name }               (settings.manage)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { AuthError, authenticateUser, requireTenantMember, resolveTenant, type AuthedUser } from '../_shared/auth.ts';
import { rateLimited } from '../_shared/ingest-auth.ts';
import { callLlm, resolveProviderApiKey, type LlmProvider } from '../_shared/llm.ts';
import { isSealed, last4, openSecret, sealSecret } from '../_shared/secret-box.ts';

const PROVIDERS: readonly LlmProvider[] = ['openai', 'gemini', 'claude', 'grok', 'deepseek', 'groq', 'openrouter', 'jev', 'custom_llm'];
const DEFAULT_MODEL: Record<string, string> = {
  openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash', claude: 'claude-3-5-haiku-latest', grok: 'grok-2-latest',
  deepseek: 'deepseek-chat', groq: 'llama-3.1-8b-instant', openrouter: 'openai/gpt-4o-mini', jev: 'jev-latest', custom_llm: 'gpt-4o-mini',
};
const ENVIRONMENTS = ['production', 'staging', 'development'];
const MAX_PROMPT_CHARS = 24_000;

type Json = Record<string, unknown>;

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.slice(0, max) : null;
}
function env(p: Json): string {
  const e = typeof p.environment === 'string' ? p.environment : 'production';
  if (!ENVIRONMENTS.includes(e)) throw new AuthError(400, 'Invalid environment');
  return e;
}
function provider(p: Json, required: boolean): LlmProvider | null {
  const v = p.provider;
  if (v === undefined || v === null || v === '') {
    if (required) throw new AuthError(400, 'provider is required');
    return null;
  }
  if (typeof v !== 'string' || !(PROVIDERS as readonly string[]).includes(v)) throw new AuthError(400, 'Unknown provider');
  return v as LlmProvider;
}
async function requireSettingsManager(user: AuthedUser, tenantId: string) {
  const { data, error } = await user.db.rpc('user_has_permission', { p_tenant_id: tenantId, p_permission: 'settings.manage' });
  if (error) throw new AuthError(500, 'Could not verify permissions');
  if (data !== true) throw new AuthError(403, 'You need the "Manage settings" permission to change AI keys');
}


// --------------------------------------------------------------------------------------
async function complete(user: AuthedUser, p: Json) {
  const tenantId = await resolveTenant(user, p.tenant_id);
  const environment = env(p);
  const wantProvider = provider(p, false);
  const systemPrompt = str(p.system_prompt, MAX_PROMPT_CHARS) ?? 'You are a helpful assistant for the Marbee platform.';
  const userMessage = str(p.user_message, MAX_PROMPT_CHARS);
  if (!userMessage) throw new AuthError(400, 'user_message is required');
  const temperature = Math.min(Math.max(Number(p.temperature ?? 0.7) || 0.7, 0), 1.5);
  const maxTokens = Math.min(Math.max(Number(p.max_tokens ?? 1024) || 1024, 16), 4096);
  if (rateLimited(`ai:${user.userId}`, 40)) throw new AuthError(429, 'Too many AI requests — wait a moment');

  const svc = getServiceClient();
  let apiKey: string | null = null;
  let source: 'candidate' | 'tenant_key' | 'platform' = 'platform';
  let chosenProvider: LlmProvider = wantProvider ?? 'openai';
  let model = str(p.model, 120) ?? '';
  let baseUrl: string | undefined;

  // 1. A key the admin is testing before saving it (never stored here).
  const candidate = str(p.candidate_key, 512);
  if (candidate && !candidate.startsWith('••')) {
    await requireSettingsManager(user, tenantId);
    apiKey = candidate.trim();
    source = 'candidate';
  }

  // 2. The tenant's own configured key.
  if (!apiKey) {
    let q = svc.from('ai_engine_providers')
      .select('id, provider, model_name, api_key_encrypted, base_url, is_default')
      .eq('tenant_id', tenantId).eq('environment', environment).not('api_key_encrypted', 'is', null);
    if (wantProvider) q = q.eq('provider', wantProvider);
    const { data: rows } = await q.order('is_default', { ascending: false }).limit(20);
    const row = (rows ?? []).find((r) => !model || r.model_name === model) ?? (rows ?? [])[0];
    if (row?.api_key_encrypted) {
      try {
        apiKey = await openSecret(row.api_key_encrypted as string);
      } catch (e) {
        console.error('ai-gateway: could not open tenant key', e instanceof Error ? e.message : e);
        throw new AuthError(500, 'Stored AI key could not be decrypted — re-enter it in Settings → AI Engine');
      }
      if (apiKey) {
        source = 'tenant_key';
        chosenProvider = row.provider as LlmProvider;
        model = model || (row.model_name as string);
        baseUrl = (row.base_url as string) || undefined;
        // Re-seal legacy plaintext keys on first use.
        if (!isSealed(row.api_key_encrypted as string)) {
          await svc.from('ai_engine_providers').update({
            api_key_encrypted: await sealSecret(apiKey), api_key_last4: last4(apiKey),
          }).eq('id', row.id);
        }
      }
    }
  }

  // 3. Marbee's platform key (function secrets), metered against AI credits.
  if (!apiKey) {
    apiKey = resolveProviderApiKey(chosenProvider, null);
    source = 'platform';
    if (!apiKey) throw new AuthError(503, 'No AI key is configured for this workspace');
  }
  model = model || DEFAULT_MODEL[chosenProvider] || 'gpt-4o-mini';

  let metered: 'debited' | 'no_wallet' | 'not_metered' = 'not_metered';
  if (source === 'platform') {
    const { data: rate } = await svc.from('credit_rate_card').select('credits_per_unit').eq('service', 'ai_generation').maybeSingle();
    const credits = Number(rate?.credits_per_unit ?? 0);
    if (credits > 0) {
      const { data: debit, error: debitErr } = await svc.rpc('credit_debit', {
        p_tenant_id: tenantId, p_service: 'ai_generation', p_credits: credits, p_quantity: 1,
        p_transactional: false, p_idempotency_key: `ai:${crypto.randomUUID()}`, p_metadata: { user_id: user.userId, model },
      });
      if (debitErr) {
        console.error('ai-gateway: credit_debit failed', debitErr.message);
      } else if ((debit as Json)?.ok === false && (debit as Json)?.reason === 'insufficient_credits') {
        throw new AuthError(402, 'Not enough AI credits — top up in your Marbee plan');
      } else {
        metered = (debit as Json)?.ok ? 'debited' : 'no_wallet'; // no wallet yet = pre-billing (dev / not onboarded)
      }
    }
  }

  try {
    const r = await callLlm({ provider: chosenProvider, model, apiKey, baseUrl, systemPrompt, userMessage, temperature, maxTokens, timeoutMs: 45_000 }, 1);
    return { text: r.text, provider: chosenProvider, model, source, metered, latency_ms: r.latencyMs, tokens: r.totalTokens };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'LLM call failed';
    console.error('ai-gateway: provider call failed', chosenProvider, msg.slice(0, 300));
    // Surface auth problems clearly without echoing provider internals.
    if (/401|403|invalid.*key|unauthori/i.test(msg)) throw new AuthError(502, `The ${chosenProvider} key was rejected by the provider`);
    throw new AuthError(502, `The ${chosenProvider} request failed — try again`);
  }
}

async function saveKey(user: AuthedUser, p: Json) {
  const tenantId = await requireTenantMember(user, p.tenant_id);
  await requireSettingsManager(user, tenantId);
  const environment = env(p);
  const prov = provider(p, true)!;
  const modelName = str(p.model_name, 120);
  const apiKey = str(p.api_key, 512)?.trim();
  if (!modelName) throw new AuthError(400, 'model_name is required');
  if (!apiKey || apiKey.length < 8 || apiKey.startsWith('••')) throw new AuthError(400, 'A real API key is required');

  const svc = getServiceClient();
  const sealed = await sealSecret(apiKey);
  const { data, error } = await svc.from('ai_engine_providers')
    .update({ api_key_encrypted: sealed, api_key_last4: last4(apiKey), status: 'unverified', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('environment', environment).eq('provider', prov).eq('model_name', modelName)
    .select('id');
  if (error) {
    console.error('ai-gateway save_key failed', error.message);
    throw new AuthError(500, 'Could not save the key');
  }
  if (!data?.length) throw new AuthError(404, 'Save the model first, then add its key');
  const { error: auditErr } = await svc.from('audit_logs').insert({
    tenant_id: tenantId, environment, user_id: user.userId, action: 'update', resource_type: 'ai_engine_key',
    resource_id: data[0].id, metadata: { provider: prov, model_name: modelName, key_last4: last4(apiKey) },
  });
  if (auditErr) console.error('ai-gateway: audit insert failed', auditErr.message);
  return { saved: true, last4: last4(apiKey) };
}

async function clearKey(user: AuthedUser, p: Json) {
  const tenantId = await requireTenantMember(user, p.tenant_id);
  await requireSettingsManager(user, tenantId);
  const environment = env(p);
  const prov = provider(p, true)!;
  const modelName = str(p.model_name, 120);
  if (!modelName) throw new AuthError(400, 'model_name is required');
  const { error } = await getServiceClient().from('ai_engine_providers')
    .update({ api_key_encrypted: null, api_key_last4: null, status: 'unconfigured', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('environment', environment).eq('provider', prov).eq('model_name', modelName);
  if (error) throw new AuthError(500, 'Could not clear the key');
  const { error: auditErr } = await getServiceClient().from('audit_logs').insert({
    tenant_id: tenantId, environment, user_id: user.userId, action: 'delete', resource_type: 'ai_engine_key',
    metadata: { provider: prov, model_name: modelName },
  });
  if (auditErr) console.error('ai-gateway: audit insert failed', auditErr.message);
  return { cleared: true };
}

/** Seal every legacy plaintext key in the caller's workspace now (instead of on first use). */
async function resealKeys(user: AuthedUser, p: Json) {
  const tenantId = await resolveTenant(user, p.tenant_id);
  await requireSettingsManager(user, tenantId);
  const svc = getServiceClient();
  const { data: rows, error } = await svc.from('ai_engine_providers')
    .select('id, api_key_encrypted').eq('tenant_id', tenantId).not('api_key_encrypted', 'is', null);
  if (error) throw new AuthError(500, 'Could not read provider keys');
  let sealed = 0;
  let alreadySealed = 0;
  for (const r of rows ?? []) {
    const stored = String(r.api_key_encrypted ?? '').trim();
    if (!stored) continue;
    if (isSealed(stored)) { alreadySealed += 1; continue; }
    const { error: upErr } = await svc.from('ai_engine_providers')
      .update({ api_key_encrypted: await sealSecret(stored), api_key_last4: last4(stored) }).eq('id', r.id);
    if (upErr) throw new AuthError(500, 'Could not seal a key');
    sealed += 1;
  }
  const { error: auditErr } = await svc.from('audit_logs').insert({
    tenant_id: tenantId, environment: 'production', user_id: user.userId, action: 'update', resource_type: 'ai_engine_key',
    metadata: { op: 'reseal_keys', sealed, already_sealed: alreadySealed },
  });
  if (auditErr) console.error('ai-gateway: audit insert failed', auditErr.message);
  return { sealed, already_sealed: alreadySealed };
}

const OPS: Record<string, (u: AuthedUser, p: Json) => Promise<unknown>> = {
  complete, save_key: saveKey, clear_key: clearKey, reseal_keys: resealKeys,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  try {
    const user = await authenticateUser(req);
    const body = (await req.json().catch(() => null)) as Json | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('JSON body required', 400);
    const op = typeof body.op === 'string' ? body.op : '';
    const handler = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : undefined;
    if (!handler) return errorResponse('Unknown operation', 400);
    return jsonResponse({ data: await handler(user, body) });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('ai-gateway unhandled', e instanceof Error ? e.message : e);
    return errorResponse('Internal error', 500);
  }
});
