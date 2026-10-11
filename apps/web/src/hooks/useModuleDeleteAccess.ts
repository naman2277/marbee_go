import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  canDeleteInModule,
  MODULE_RESOURCE_LABELS,
  type DeletableModule,
} from '@/lib/delete-access';

export function useModuleDeleteAccess(module: DeletableModule) {
  const { environment, access } = useAuth();

  return useMemo(() => {
    const result = canDeleteInModule(module, {
      permissions: access.permissions,
      isAdmin: access.isAdmin,
      environment,
      instanceAccess: access.instanceAccess,
    });
    return {
      canDelete: result.allowed,
      deleteDeniedReason: result.reason,
      resourceLabel: MODULE_RESOURCE_LABELS[module],
    };
  }, [module, environment, access.permissions, access.isAdmin, access.instanceAccess]);
}
