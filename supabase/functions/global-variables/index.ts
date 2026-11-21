// global-variables — the ONLY way the app manages tenant variables (D-019, Phase 0 · SEC-05).
//
// Before: secret values and encryption keys were sealed in the browser with a "master key"
// kept in ONE admin's localStorage — lost if that storage was cleared, unreadable by the
// server (so hosted CAPTCHA secrets and published-form encryption never worked).
// Now: values are sealed on the server with MARBEE_SECRETS_KEY; encryption keys are
// generated here and never leave the server; app users can't read or write the value
// column directly (sql/90).
//
// Ops (POST JSON, signed-in user JWT; deploy with JWT verification ON):
//   list           { tenant_id?, environment }                       member — secret values never returned
//   create         { tenant_id?, environment, name, kind, value?, description?, scopes? }   api_keys.manage
//   update         { id, value?, description?, scopes? }              api_keys.manage
//   rotate         { id }                                             api_keys.manage (encryption_key)
//   reveal         { id }                                             api_keys.manage, audited (never encryption keys)
//   delete         { id }                                             api_keys.manage
//   encrypt_fields { tenant_id?, environment, key_variable, fields[], data }          member (form previews)
//   decrypt_fields { tenant_id?, environment, key_variable, fields[], records[] }     customers.read

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { AuthError, authenticateUser, requirePermission, resolveTenant, type AuthedUser } from '../_shared/auth.ts';
import { sealSecret } from '../_shared/secret-box.ts';
import { dataKeyFingerprint, decryptFieldsWithKey, encryptFieldsWithKey, generateDataKey } from '../_shared/field-crypto.ts';
import { loadVariablePlaintext } from '../_shared/global-vars.ts';

type Json = Record<string, unknown>;
const KINDS = ['plain', 'secret', 'encryption_key'] as const;
const SCOPES = ['forms', 'workflows', 'landing_pages', 'imports', 'exports', 'connectors', 'all'];
const ENVIRONMENTS = ['production', 'staging', 'development'];
const NAME_RE = /^[A-Z0-9_]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_COLUMNS = 'id, tenant_id, environment, name, description, kind, scopes, fingerprint, rotated_at, last_used_at, created_at, updated_at';
const MANAGE = 'api_keys.manage';

function envOf(p: Json): string {
  const e = typeof p.environment === 'string' ? p.environment : 'production';
  if (!ENVIRONMENTS.includes(e)) throw new AuthError(400, 'Invalid environment');
  return e;
}
function scopesOf(v: unknown): string[] {
  if (v === undefined) return ['all'];
  if (!Array.isArray(v) || v.some((s) => typeof s !== 'string' || !SCOPES.includes(s))) throw new AuthError(400, 'Invalid scopes');
  return v.length ? (v as string[]) : ['all'];
}
function textOf(v: unknown, max: number, label: string): string {
  if (typeof v !== 'string') throw new AuthError(400, `${label} must be text`);
  if (v.length > max) throw new AuthError(400, `${label} is too long`);
  return v;
}

async function audit(tenantId: string, environment: string, userId: string, action: string, variableId: string | null, metadata: Json) {
  const { error } = await getServiceClient().from('audit_logs').insert({
    tenant_id: tenantId, environment, user_id: userId, action, resource_type: 'global_variable', resource_id: variableId, metadata,
  });
  if (error) console.error('global-variables: audit insert failed', error.message);
}

/** Load a row by id and check the caller manages its tenant. */
async function loadOwned(user: AuthedUser, id: unknown) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new AuthError(400, 'id must be a UUID');
  const { data, error } = await getServiceClient().from('global_variables').select('*').eq('id', id).maybeSingle();
  if (error) throw new AuthError(500, 'Could not load the variable');
  if (!data) throw new AuthError(404, 'Variable not found');
  await resolveTenant(user, data.tenant_id); // membership
  await requirePermission(user, data.tenant_id as string, MANAGE, 'Manage API keys & variables');
  return data as Json & { id: string; tenant_id: string; environment: string; kind: string; name: string };
}

const ops: Record<string, (u: AuthedUser, p: Json) => Promise<unknown>> = {
  async list(user, p) {
    const tenantId = await resolveTenant(user, p.tenant_id);
    const environment = envOf(p);
    const svc = getServiceClient();
    const { data, error } = await svc.from('global_variables').select(`${PUBLIC_COLUMNS}, value`)
      .eq('tenant_id', tenantId).eq('environment', environment).order('name');
    if (error) throw new AuthError(500, 'Could not list variables');
    // Plain values are config and are returned; secret values and keys never are.
    return {
      variables: (data ?? []).map((r) => ({ ...r, value: r.kind === 'plain' ? r.value : '', has_value: Boolean(r.value) })),
    };
  },

  async create(user, p) {
    const tenantId = await resolveTenant(user, p.tenant_id);
    await requirePermission(user, tenantId, MANAGE, 'Manage API keys & variables');
    const environment = envOf(p);
    const name = textOf(p.name, 64, 'name');
    if (!NAME_RE.test(name)) throw new AuthError(400, 'Name must be UPPER_SNAKE_CASE (A–Z, 0–9, _)');
    const kind = String(p.kind) as (typeof KINDS)[number];
    if (!KINDS.includes(kind)) throw new AuthError(400, 'Invalid kind');
    let stored: string;
    let fingerprint: string | null = null;
    if (kind === 'encryption_key') {
      // Keys are generated here and never accepted from (or sent to) the browser.
      const key = generateDataKey();
      stored = await sealSecret(key);
      fingerprint = await dataKeyFingerprint(key);
    } else {
      const value = textOf(p.value ?? '', 4000, 'value');
      if (!value) throw new AuthError(400, 'A value is required');
      stored = kind === 'secret' ? await sealSecret(value) : value;
    }
    const now = new Date().toISOString();
    const { data, error } = await getServiceClient().from('global_variables').insert({
      tenant_id: tenantId, environment, name, kind, value: stored, fingerprint,
      description: typeof p.description === 'string' && p.description.trim() ? p.description.trim().slice(0, 500) : null,
      scopes: scopesOf(p.scopes), rotated_at: kind === 'encryption_key' ? now : null,
    }).select(PUBLIC_COLUMNS).single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new AuthError(409, `A variable named ${name} already exists in this environment`);
      console.error('global-variables create failed', error.message);
      throw new AuthError(500, 'Could not create the variable');
    }
    await audit(tenantId, environment, user.userId, 'create', data.id as string, { name, kind });
    return { variable: { ...data, value: kind === 'plain' ? stored : '', has_value: true } };
  },

  async update(user, p) {
    const row = await loadOwned(user, p.id);
    const patch: Json = { updated_at: new Date().toISOString() };
    if (p.description !== undefined) patch.description = textOf(p.description, 500, 'description').trim() || null;
    if (p.scopes !== undefined) patch.scopes = scopesOf(p.scopes);
    if (p.value !== undefined && p.value !== '') {
      if (row.kind === 'encryption_key') throw new AuthError(400, 'Use rotate to replace an encryption key');
      const value = textOf(p.value, 4000, 'value');
      patch.value = row.kind === 'secret' ? await sealSecret(value) : value;
    }
    const { error } = await getServiceClient().from('global_variables').update(patch).eq('id', row.id);
    if (error) throw new AuthError(500, 'Could not update the variable');
    await audit(row.tenant_id, row.environment, user.userId, 'update', row.id, { name: row.name, value_changed: 'value' in patch });
    return { updated: true };
  },

  async rotate(user, p) {
    const row = await loadOwned(user, p.id);
    if (row.kind !== 'encryption_key') throw new AuthError(400, 'Only encryption keys can be rotated');
    const key = generateDataKey();
    const now = new Date().toISOString();
    const { error } = await getServiceClient().from('global_variables')
      .update({ value: await sealSecret(key), fingerprint: await dataKeyFingerprint(key), rotated_at: now, updated_at: now }).eq('id', row.id);
    if (error) throw new AuthError(500, 'Could not rotate the key');
    await audit(row.tenant_id, row.environment, user.userId, 'rotate', row.id, { name: row.name });
    return { rotated: true };
  },

  async reveal(user, p) {
    const row = await loadOwned(user, p.id);
    if (row.kind === 'encryption_key') throw new AuthError(403, 'Encryption keys are never revealed');
    const found = await loadVariablePlaintext(getServiceClient(), row.tenant_id, row.environment, row.name, 'all');
    await audit(row.tenant_id, row.environment, user.userId, 'reveal', row.id, { name: row.name });
    return { value: found?.plaintext ?? '' };
  },

  async delete(user, p) {
    const row = await loadOwned(user, p.id);
    const { error } = await getServiceClient().from('global_variables').delete().eq('id', row.id);
    if (error) throw new AuthError(500, 'Could not delete the variable');
    await audit(row.tenant_id, row.environment, user.userId, 'delete', row.id, { name: row.name, kind: row.kind });
    return { deleted: true };
  },

  async encrypt_fields(user, p) {
    const tenantId = await resolveTenant(user, p.tenant_id);
    const environment = envOf(p);
    const { key, fields } = await fieldKey(tenantId, environment, p);
    const data = (p.data && typeof p.data === 'object' && !Array.isArray(p.data)) ? (p.data as Json) : null;
    if (!data) throw new AuthError(400, 'data must be an object');
    return { data: await encryptFieldsWithKey(data, fields, key) };
  },

  async decrypt_fields(user, p) {
    const tenantId = await resolveTenant(user, p.tenant_id);
    await requirePermission(user, tenantId, 'customers.read', 'View customer data');
    const environment = envOf(p);
    const { key, fields } = await fieldKey(tenantId, environment, p);
    const records = Array.isArray(p.records) ? (p.records as Json[]).slice(0, 500) : [];
    const out = [];
    for (const r of records) {
      const data = (r?.data && typeof r.data === 'object') ? (r.data as Json) : {};
      out.push({ id: r?.id ?? null, data: await decryptFieldsWithKey(data, fields.length ? fields : Object.keys(data), key) });
    }
    return { records: out };
  },
};

async function fieldKey(tenantId: string, environment: string, p: Json) {
  const name = textOf(p.key_variable, 64, 'key_variable');
  const found = await loadVariablePlaintext(getServiceClient(), tenantId, environment, name, 'forms');
  if (!found || found.kind !== 'encryption_key') throw new AuthError(404, `Encryption key ${name} could not be resolved`);
  const fields = Array.isArray(p.fields) ? (p.fields as unknown[]).filter((f): f is string => typeof f === 'string').slice(0, 500) : [];
  return { key: found.plaintext, fields };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  try {
    const user = await authenticateUser(req);
    const body = (await req.json().catch(() => null)) as Json | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('JSON body required', 400);
    const op = typeof body.op === 'string' ? body.op : '';
    const handler = Object.prototype.hasOwnProperty.call(ops, op) ? ops[op] : undefined;
    if (!handler) return errorResponse('Unknown operation', 400);
    return jsonResponse({ data: await handler(user, body) });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('global-variables unhandled', e instanceof Error ? e.message : e);
    return errorResponse('Internal error', 500);
  }
});
