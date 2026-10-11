import type { ReactNode } from 'react';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { PermissionSlug } from '@/lib/permissions';
import { Card } from '@/components/ui';

type RequirePermissionProps = {
  permission: PermissionSlug | string;
  children: ReactNode;
  fallback?: ReactNode;
};

export function RequirePermission({ permission, children, fallback }: RequirePermissionProps) {
  const { hasPermission, accessLoading, access } = useAuth();

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">
        Checking permissions…
      </div>
    );
  }

  if (!hasPermission(permission)) {
    if (fallback) return <>{fallback}</>;
    return (
      <Card className="max-w-lg mx-auto mt-12 p-8 text-center">
        <ShieldOff className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="mt-2 text-sm text-slate-500">
          Your role ({access.roleName ?? 'unknown'}) does not include the &quot;{permission}&quot; permission.
          Contact a workspace admin.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
