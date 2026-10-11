import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Environment } from '@marbee/shared';
import { supabase, DEMO_TENANT_ID } from '@/lib/supabase';
import { fetchMyAccess, type AccessSnapshot } from '@/lib/access-management';
import { hasPermission as checkPermission, type PermissionSlug } from '@/lib/permissions';
import { fetchMyProfile, type UserProfile } from '@/lib/profile';
import { getDisplayName } from '@/lib/user-avatar';
import { readStoredEnvironment, storeEnvironment } from '@/lib/environment';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  displayName: string;
  loading: boolean;
  tenantId: string;
  tenantName: string | null;
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

async function resolveTenant(session: Session | null) {
  const userId = session?.user?.id;

  // Fast path: the tenant is already in the JWT — no round-trip.
  const claimTenantId = tenantIdFromJwt(session?.access_token);

  if (!userId) {
    return { tenantId: DEMO_TENANT_ID, tenantName: 'Demo Organization' };
  }

  const query = supabase
    .from('tenant_users')
    .select('tenant_id, tenants(name)')
    .eq('user_id', userId)
    .eq('status', 'active');

  const { data } = claimTenantId
    ? await query.eq('tenant_id', claimTenantId).limit(1).maybeSingle()
    : await query.limit(1).maybeSingle();

  if (data?.tenant_id) {
    const tenant = data.tenants as { name: string } | { name: string }[] | null;
    const name = Array.isArray(tenant) ? tenant[0]?.name : tenant?.name;
    return { tenantId: data.tenant_id, tenantName: name ?? null };
  }

  if (claimTenantId) {
    return { tenantId: claimTenantId, tenantName: null };
  }

  return { tenantId: DEMO_TENANT_ID, tenantName: 'Demo Organization' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [environment, setEnvironmentState] = useState<Environment>(
    () => readStoredEnvironment() ?? 'production',
  );
  const [tenantId, setTenantId] = useState(DEMO_TENANT_ID);
  const [tenantName, setTenantName] = useState<string | null>(null);
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
    if (!tenantId) return;
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
      void refreshAccess();
      void refreshProfile();
    } else {
      setAccess(EMPTY_ACCESS);
      setProfile(null);
    }
  }, [session?.user]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        const t = await resolveTenant(session);
        setTenantId(t.tenantId);
        setTenantName(t.tenantName);
        void supabase.rpc('touch_last_login').then(() => undefined);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        const t = await resolveTenant(session);
        setTenantId(t.tenantId);
        setTenantName(t.tenantName);
      } else {
        setTenantId(DEMO_TENANT_ID);
        setTenantName(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
