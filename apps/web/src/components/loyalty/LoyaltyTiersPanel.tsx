import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { fetchLoyaltyPrograms, fetchLoyaltyTiers } from '@/lib/loyalty';

export function LoyaltyTiersPanel() {
  const { tenantId, environment } = useAuth();

  const { data: programs } = useQuery({
    queryKey: ['loyalty-programs', tenantId, environment],
    queryFn: () => fetchLoyaltyPrograms(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const program = programs?.find((p) => p.status === 'active') ?? programs?.[0];

  const { data: tiers, isLoading } = useQuery({
    queryKey: ['loyalty-tiers', program?.id],
    queryFn: () => fetchLoyaltyTiers(program!.id),
    enabled: Boolean(program?.id),
  });

  if (!program) {
    return <EmptyState title="No program" description="Create a loyalty program first to configure tiers." />;
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Tier ladder for <strong>{program.name}</strong> — points thresholds, multipliers, and benefits.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(tiers ?? []).map((tier) => (
          <Card key={tier.id} className="overflow-hidden">
            <div className="h-2" style={{ backgroundColor: tier.color }} />
            <div className="p-5">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold text-slate-900">{tier.name}</h3>
              </div>
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Min points</dt><dd className="font-medium tabular-nums">{tier.minPoints.toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Multiplier</dt><dd className="font-medium">{tier.pointsMultiplier}×</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Slug</dt><dd className="font-mono">{tier.slug}</dd></div>
              </dl>
            </div>
          </Card>
        ))}
      </div>
      {!tiers?.length && !isLoading && (
        <EmptyState title="No tiers configured" description="Tiers are seeded with demo data after running migration 47." />
      )}
    </div>
  );
}
