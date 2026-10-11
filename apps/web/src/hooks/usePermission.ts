import { useAuth } from '@/contexts/AuthContext';
import type { PermissionSlug } from '@/lib/permissions';

export function usePermission(permission: PermissionSlug | string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}

export function usePermissions() {
  const { access, hasPermission, accessLoading } = useAuth();
  return {
    permissions: access.permissions,
    roleSlug: access.roleSlug,
    roleName: access.roleName,
    isAdmin: access.isAdmin,
    loading: accessLoading,
    hasPermission,
  };
}
