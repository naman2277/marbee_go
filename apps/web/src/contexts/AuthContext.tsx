import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Environment } from '@marbee/shared';
import { supabase } from '@/lib/supabase';
import { fetchMyAccess, type AccessSnapshot } from '@/lib/access-management';
import { hasPermission as checkPermission, type PermissionSlug } from '@/lib/permissions';
import { fetchMyProfile, type UserProfile } from '@/lib/profile';
import { getDisplayName } from '@/lib/user-avatar';
import { readStoredEnvironment, storeEnvironment } from '@/lib/environment';

/** 'ready' = signed in with an active workspace. 'none' / 'suspended' = signed in but
 *  nothing to show (TD-20). 'loading' while it is being worked out. */
export type WorkspaceStatus = 'loading' | 'ready' | 'none' | 'suspended';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  displayName: string;
  loading: boolean;
  /** Empty string until a workspace is ready — never a fallback workspace. */
  tenantId: string;
  tenantName: string | null;
  workspaceStatus: WorkspaceStatus;
  /** Names of the user's own suspended workspaces (for the explanation screen). */
  suspendedWorkspaces: string[];
  /** Re-check memberships (after accepting an invite or finishing setup). */
  refreshWorkspace: () => Promise<void>;
  environment: Environment;
  setEnvironment: (env: Environment) => void;
  access: AccessSnapshot;
  accessLoading: boolean;
  refreshAccess: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (permission: PermissionSlug | string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const EMPTY_ACCESS: AccessSnapshot = {
  roleSlug: null,
  roleName: null,
  roleId: null,
  permissions: [],
  isAdmin: false,
  instanceAccess: null,
};

export const AuthContext = createContext<AuthContextType | null>(null);

/** Decode the `tenant_id` claim stamped into the JWT by the
 *  `custom_access_token_hook` (supabase/sql/v2/52_extensions_helpers.sql).
 *  Returns null on any pre-v2 / hook-disabled token. */
function tenantIdFromJwt(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { tenant_id?: string; app_metadata?: { tenant_id?: string } };
    return json.tenant_id ?? json.app_metadata?.tenant_id ?? null;
  } catch {
    return null;
  }
}

type ResolvedWorkspace = {
  tenantId: string;
  tenantName: string | null;
  status: WorkspaceStatus;
  suspended: string[];
};

const NO_WORKSPACE: ResolvedWorkspace = { tenantId: '', tenantName: null, status: 'none', suspended: [] };

/**
 * The signed-in user's workspace, confirmed by the database (RLS only returns
 * memberships of ACTIVE workspaces — sql/91). There is deliberately no fallback
 * workspace (TD-20): no membership means the "no workspace" / "suspended" screen.
 */
async function resolveTenant(session: Session | null): Promise<ResolvedWorkspace | null> {
  const userId = session?.user?.id;
  if (!userId) return NO_WORKSPACE;

  // Prefer the workspace named in the token (v2 hook), but only if the DB confirms it.
  const claimTenantId = tenantIdFromJwt(session?.access_token);
  const query = () => supabase
    .from('tenant_users')
    .select('tenant_id, tenants(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  let { data, error } = claimTenantId
    ? await query().eq('tenant_id', claimTenantId).limit(1).maybeSingle()
    : await query().limit(1).maybeSingle();
  if (!error && !data && claimTenantId) ({ data, error } = await query().limit(1).maybeSingle());
  // A failed lookup is "unknown", not "no workspace" (a network blip must not hide the app).
  if (error) return null;

  if (data?.tenant_id) {
    const tenant = data.tenants as { name: string } | { name: string }[] | null;
    const name = Array.isArray(tenant) ? tenant[0]?.name : tenant?.name;
    return { tenantId: data.tenant_id, tenantName: name ?? null, status: 'ready', suspended: [] };
  }

  // No active workspace: find out whether it's because theirs is suspended (sql/93).
  const { data: status, error: statusError } = await supabase.rpc('my_workspace_status');
  if (statusError) return NO_WORKSPACE; // script 93 not run yet → plain "no workspace" screen
  const suspended = Array.isArray((status as { suspended?: unknown })?.suspended)
    ? ((status as { suspended: unknown[] }).suspended.map(String))
    : [];
  return suspended.length ? { ...NO_WORKSPACE, status: 'suspended', suspended } : NO_WORKSPACE;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [environment, setEnvironmentState] = useState<Environment>(
    () => readStoredEnvironment() ?? 'production',
  );
  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>('loading');
  const [suspendedWorkspaces, setSuspendedWorkspaces] = useState<string[]>([]);

  const applyWorkspace = useCallback((w: ResolvedWorkspace) => {
    setTenantId(w.tenantId);
    setTenantName(w.tenantName);
    setWorkspaceStatus(w.status);
    setSuspendedWorkspaces(w.suspended);
  }, []);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<AccessSnapshot>(EMPTY_ACCESS);
  const [accessLoading, setAccessLoading] = useState(false);

  const setEnvironment = useCallback((env: Environment) => {
    setEnvironmentState(env);
    storeEnvironment(env);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    try {
      const row = await fetchMyProfile();
      setProfile(row);
    } catch {
      setProfile(null);
    }
  }, [session?.user]);

  const refreshAccess = useCallback(async () => {
    if (!tenantId) {
      setAccess(EMPTY_ACCESS);
      return;
    }
    setAccessLoading(true);
    try {
      const snapshot = await fetchMyAccess(tenantId);
      setAccess(snapshot);
    } catch {
      setAccess(EMPTY_ACCESS);
    } finally {
      setAccessLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (session?.user) {
      void refreshProfile();
    } else {
      setAccess(EMPTY_ACCESS);
      setProfile(null);
    }
  }, [session?.user]);

  // Permissions belong to the resolved workspace, so reload whenever it changes.
  useEffect(() => {
    if (session?.user && tenantId) void refreshAccess();
    else setAccess(EMPTY_ACCESS);
  }, [session?.user, tenantId, refreshAccess]);

  /** User id whose workspace is currently shown (null = nothing resolved yet). */
  const resolvedUserRef = useRef<string | null>(null);

  /**
   * Resolve the workspace for `current`.
   * - New user (sign-in): show 'loading' immediately — never flash "No workspace yet" —
   *   and retry a failed lookup a few times before giving up.
   * - Same user (token refresh, Check again): keep what's on screen if the lookup fails.
   */
  const syncWorkspace = useCallback(async (current: Session | null) => {
    if (!current?.user) {
      resolvedUserRef.current = null;
      applyWorkspace(NO_WORKSPACE);
      return;
    }
    const sameUser = resolvedUserRef.current === current.user.id;
    if (!sameUser) setWorkspaceStatus('loading');
    for (let attempt = 0; attempt < (sameUser ? 1 : 3); attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
      const w = await resolveTenant(current);
      if (w) {
        resolvedUserRef.current = current.user.id;
        applyWorkspace(w);
        return;
      }
    }
    if (!sameUser) applyWorkspace(NO_WORKSPACE); // still unknown after retries; "Check again" retries
  }, [applyWorkspace]);

  const refreshWorkspace = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession();
    await syncWorkspace(current);
  }, [syncWorkspace]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      await syncWorkspace(session);
      if (session?.user) void supabase.rpc('touch_last_login').then(() => undefined);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Set the loading state in the same update as the session (see syncWorkspace).
      if (session?.user && resolvedUserRef.current !== session.user.id) setWorkspaceStatus('loading');
      setSession(session);
      await syncWorkspace(session);
    });

    return () => subscription.unsubscribe();
  }, [syncWorkspace]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      void supabase.rpc('touch_last_login').then(() => undefined);
    }
    return { error: error?.message };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return { error: error?.message };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasPermission = useCallback(
    (permission: PermissionSlug | string) =>
      checkPermission(access.permissions, permission, access.isAdmin),
    [access],
  );

  const displayName = useMemo(
    () =>
      getDisplayName(
        profile?.name ?? (session?.user?.user_metadata?.name as string | undefined),
        profile?.email ?? session?.user?.email,
      ),
    [profile, session?.user],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        displayName,
        loading,
        tenantId,
        tenantName,
        workspaceStatus,
        suspendedWorkspaces,
        refreshWorkspace,
        environment,
        setEnvironment,
        access,
        accessLoading,
        refreshAccess,
        refreshProfile,
        hasPermission,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useTenantScope() {
  const { tenantId, environment } = useAuth();
  return { tenantId, environment };
}
