import { PageHeader, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

export function GeneralSettingsPage() {
  const { tenantName, tenantId, environment, user } = useAuth();

  return (
    <div>
      <PageHeader title="General" description="Organization and environment settings" />

      <Card className="max-w-xl p-6">
        <dl className="space-y-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Organization</dt>
            <dd className="font-medium">{tenantName ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Tenant ID</dt>
            <dd className="font-mono text-xs">{tenantId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Environment</dt>
            <dd className="font-medium capitalize">{environment}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Signed in as</dt>
            <dd className="font-medium">{user?.email}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
