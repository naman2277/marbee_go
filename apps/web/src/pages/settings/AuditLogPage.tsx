import { Shield } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { AuditTrailPanel } from '@/components/audit/AuditTrailPanel';
import { AUDIT_RETENTION_DAYS } from '@/lib/audit';
import { useAuth } from '@/contexts/AuthContext';

export function AuditLogPage() {
  const { tenantId, environment } = useAuth();

  return (
    <div>
      <PageHeader
        title="Audit log"
        description={`Configuration change history — auto-purged after ${AUDIT_RETENTION_DAYS} days`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Retention" value={`${AUDIT_RETENTION_DAYS} days`} accent />
        <StatCard label="Environment" value={environment} />
        <StatCard label="Auto purge" value="Daily 3 AM UTC" icon={Shield} />
      </div>

      <AuditTrailPanel
        tenantId={tenantId}
        environment={environment}
        runPurgeOnMount
        title="Workspace audit trail"
        subtitle={`Filter by module, action, or user · logs auto-purged after ${AUDIT_RETENTION_DAYS} days`}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon?: typeof Shield;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-violet-500 opacity-60" />}
      </div>
      <p className={`mt-1 text-lg font-bold capitalize ${accent ? 'text-violet-600' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}
