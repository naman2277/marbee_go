import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { fetchLoyaltyMembers, fetchLoyaltyPrograms } from '@/lib/loyalty';
import { formatNumber } from '@/lib/utils';

export function LoyaltyMembersPanel() {
  const { tenantId, environment } = useAuth();

  const { data: programs } = useQuery({
    queryKey: ['loyalty-programs', tenantId, environment],
    queryFn: () => fetchLoyaltyPrograms(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const activeProgramId = programs?.find((p) => p.status === 'active')?.id ?? programs?.[0]?.id;

  const { data: members, isLoading } = useQuery({
    queryKey: ['loyalty-members', tenantId, environment, activeProgramId],
    queryFn: () => fetchLoyaltyMembers(tenantId, environment, activeProgramId),
    enabled: Boolean(tenantId && activeProgramId),
  });

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Enrolled members with tier status, points balance, and lifetime earn history.
      </p>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-6 py-3 font-semibold">Member</th>
              <th className="px-6 py-3 font-semibold">Tier</th>
              <th className="px-6 py-3 font-semibold">Balance</th>
              <th className="px-6 py-3 font-semibold">Lifetime</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Enrolled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(members ?? []).map((m) => (
              <tr key={m.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4">
                  <Link to={`/customers/${m.customerId}`} className="font-medium text-brand-600 hover:underline">
                    {m.customer?.email ?? m.customerId.slice(0, 8)}
                  </Link>
                  {(m.customer?.first_name || m.customer?.last_name) && (
                    <p className="text-xs text-slate-500">{[m.customer?.first_name, m.customer?.last_name].filter(Boolean).join(' ')}</p>
                  )}
                </td>
                <td className="px-6 py-4">
                  {m.tier ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${m.tier.color}22`, color: m.tier.color }}>
                      {m.tier.name}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-6 py-4 tabular-nums font-medium">{formatNumber(m.pointsBalance)}</td>
                <td className="px-6 py-4 tabular-nums text-slate-500">{formatNumber(m.lifetimePoints)}</td>
                <td className="px-6 py-4"><Badge variant={m.status === 'active' ? 'success' : 'warning'}>{m.status}</Badge></td>
                <td className="px-6 py-4 text-xs text-slate-500">{new Date(m.enrolledAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!members?.length && !isLoading && (
          <EmptyState title="No members enrolled" description="Members appear here when enrolled in a loyalty program via journeys or API." />
        )}
      </Card>
    </div>
  );
}
