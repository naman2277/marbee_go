// Workspace guards for edge functions that act with the service role
// (Phase 0 · TD-12b, SEC-18).
//
// sql/91 makes suspension automatic for anything that goes through RLS or the
// permission helpers. Functions that use the service role and find the tenant
// themselves (a form id, a bot id, a webhook path, an asset id) must call
// assertTenantActive() once they know the tenant. All checks fail CLOSED: if the
// database can't answer, the request is refused.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AuthError } from './auth.ts';
import { constantTimeEqual } from './webhook-sig.ts';

/** True only if the tenant exists and is not suspended. */
export async function tenantIsActive(service: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await service.rpc('tenant_is_active', { p_tenant_id: tenantId });
  if (error) {
    console.error('tenant_is_active failed', error.message);
    throw new AuthError(503, 'Workspace check unavailable — try again shortly');
  }
  return data === true;
}

/** Throws 403 "This workspace is suspended" (or 503 if the check can't run). */
export async function assertTenantActive(service: SupabaseClient, tenantId: string): Promise<void> {
  if (!(await tenantIsActive(service, tenantId))) throw new AuthError(403, 'This workspace is suspended');
}

/** True when the caller presented the project's service-role key (internal engine calls). */
export function isServiceCaller(req: Request): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return key.length > 0 && token.length > 0 && constantTimeEqual(token, key);
}

/**
 * Signed-in user who is an ACTIVE member of an ACTIVE tenant and holds one of
 * `permissions` (tenant admins hold all). Returns the user id; throws AuthError.
 */
export async function requireMemberWithPermission(
  service: SupabaseClient,
  req: Request,
  tenantId: string,
  permissions: string[],
): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new AuthError(401, 'Not signed in');
  const { data, error } = await service.auth.getUser(token);
  if (error || !data?.user) throw new AuthError(401, 'Session is invalid or expired');
  for (const permission of permissions) {
    const { data: ok, error: permErr } = await service.rpc('user_has_permission_as', {
      p_user_id: data.user.id, p_tenant_id: tenantId, p_permission: permission,
    });
    if (permErr) {
      console.error('user_has_permission_as failed', permErr.message);
      throw new AuthError(503, 'Permission check unavailable — try again shortly');
    }
    if (ok === true) return data.user.id;
  }
  throw new AuthError(403, 'You do not have permission for this in this workspace');
}
