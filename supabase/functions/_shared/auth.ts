// Shared caller authentication for edge functions (Phase 0, SEC-01).
//
// Rule (docs/cpo/09-security-baseline.md §2): a function derives tenant access
// from a VERIFIED credential, never from a header or body. For calls made by a
// signed-in app user, the safest pattern is to act AS that user: queries run
// through a client carrying the user's JWT, so Postgres RLS enforces tenant
// isolation even if function code has a bug. Use the service role only after
// authentication, and only for work RLS can't express.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type AuthedUser = {
  userId: string;
  email: string | null;
  /** Client that runs every query as the caller — RLS applies. */
  db: SupabaseClient;
};

const AUTH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new AuthError(500, `Server misconfigured: ${name} is not set`);
  return v;
}

/** Verify the bearer token belongs to a real signed-in user (not the anon key). */
export async function authenticateUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new AuthError(401, 'Not signed in');

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // getUser validates signature + expiry with Auth; the anon key has no user and fails here.
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new AuthError(401, 'Session is invalid or expired');

  return { userId: data.user.id, email: data.user.email ?? null, db };
}

/** Confirm the caller is an active member of the tenant (checked by the database as the caller). */
export async function requireTenantMember(user: AuthedUser, tenantId: unknown): Promise<string> {
  if (typeof tenantId !== 'string' || !AUTH_UUID_RE.test(tenantId)) throw new AuthError(400, 'tenant_id must be a UUID');
  const { data, error } = await user.db.rpc('user_has_tenant_access', { p_tenant_id: tenantId });
  if (error) {
    console.error('tenant membership check failed', error.message);
    throw new AuthError(500, 'Could not verify tenant access');
  }
  if (data !== true) throw new AuthError(403, 'No access to this tenant');
  return tenantId.toLowerCase();
}
