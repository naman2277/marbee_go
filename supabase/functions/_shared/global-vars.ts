// Server-side access to tenant global variables (Phase 0 · SEC-05).
// Values of kind `secret` / `encryption_key` are sealed with MARBEE_SECRETS_KEY
// (secret-box.ts). Only edge functions (service role) can read the value column (sql/90).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { openSecret } from './secret-box.ts';

export type VariableScope = 'forms' | 'workflows' | 'landing_pages' | 'imports' | 'exports' | 'connectors' | 'all';

/** Plaintext of a tenant variable allowed in `scope`, or null if absent / not allowed. */
export async function loadVariablePlaintext(
  svc: SupabaseClient,
  tenantId: string,
  environment: string,
  name: string,
  scope: VariableScope,
): Promise<{ kind: string; plaintext: string } | null> {
  const { data, error } = await svc.from('global_variables')
    .select('id, kind, value, scopes')
    .eq('tenant_id', tenantId).eq('environment', environment).eq('name', name)
    .maybeSingle();
  if (error || !data) return null;
  const scopes = (data.scopes as string[] | null) ?? ['all'];
  if (scope !== 'all' && !scopes.includes('all') && !scopes.includes(scope)) return null;
  const plaintext = data.kind === 'plain' ? String(data.value ?? '') : await openSecret(String(data.value ?? ''));
  if (!plaintext) return null;
  await svc.from('global_variables').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { kind: String(data.kind), plaintext };
}
