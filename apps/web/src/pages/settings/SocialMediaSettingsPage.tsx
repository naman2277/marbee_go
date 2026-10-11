import { PageHeader } from '@/components/ui';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { useTenantScope } from '@/contexts/AuthContext';
import { PERMISSIONS } from '@/lib/permissions';
import { SocialConnectionsManager } from '@/components/social/SocialConnectionsManager';

export function SocialMediaSettingsPage() {
  const { tenantId, environment } = useTenantScope();

  return (
    <RequirePermission permission={PERMISSIONS.SOCIAL_MANAGE}>
      <div className="space-y-6">
        <PageHeader
          title="Social media connections"
          description="Connect and manage LinkedIn, Facebook, Instagram, and X channels for multi-channel broadcasts and campaign automation"
        />

        <SocialConnectionsManager tenantId={tenantId} environment={environment} />
      </div>
    </RequirePermission>
  );
}
