import { useQuery } from '@tanstack/react-query';
import { Award, Brain, Gift, Tag, Users, Zap } from 'lucide-react';
import { Card } from '@/components/ui';
import { KpiCard } from '@/components/home/KpiCard';
import { useAuth } from '@/contexts/AuthContext';
import { fetchLoyaltyOverviewStats } from '@/lib/loyalty';
import { formatNumber } from '@/lib/utils';

export function LoyaltyOverviewPanel() {
  const { tenantId, environment } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['loyalty-overview', tenantId, environment],
    queryFn: () => fetchLoyaltyOverviewStats(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-orange-50 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">Loyalty & Offer Decisioning</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Enterprise-grade loyalty with real-time <strong>Best Offer Decisioning (BOD)</strong> — rank offers by value,
          margin, propensity, tier eligibility, frequency caps, and multi-armed exploration. Comparable to Salesforce
          Offer Decisioning, Adobe Target, and Bloomreach Engagement.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Real-time BOD API', 'Tiered loyalty', 'Margin-aware scoring', 'Frequency caps', 'Holdout groups', 'A/B exploration'].map((f) => (
            <span key={f} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
              {f}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Active programs" value={isLoading ? '—' : String(stats?.activePrograms ?? 0)} icon={Award} accent="violet" />
        <KpiCard label="Loyalty members" value={isLoading ? '—' : formatNumber(stats?.members ?? 0)} icon={Users} accent="sky" />
        <KpiCard label="Points in circulation" value={isLoading ? '—' : formatNumber(stats?.totalPoints ?? 0)} icon={Zap} accent="orange" />
        <KpiCard label="Active offers" value={isLoading ? '—' : String(stats?.activeOffers ?? 0)} icon={Tag} accent="emerald" />
        <KpiCard label="BOD policies live" value={isLoading ? '—' : String(stats?.activePolicies ?? 0)} icon={Brain} accent="violet" />
        <KpiCard label="Total programs" value={isLoading ? '—' : String(stats?.programs ?? 0)} icon={Gift} accent="orange" />
      </div>

      <div className="rounded-xl border border-violet-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-900">How loyalty works in Marbee</h3>
        <ol className="mt-4 space-y-3 text-sm text-slate-600">
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">1</span><span><strong>Programs & tiers</strong> — Define earn rates and tier ladders (Bronze → Platinum). Members progress as they accumulate points.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">2</span><span><strong>Enrollment</strong> — Customers join via journeys, API, or manual enroll. <code className="rounded bg-slate-100 px-1">loyalty_members</code> syncs flags to the customer profile automatically.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">3</span><span><strong>Offers catalog</strong> — Build discounts, cashback, points bonuses with channel placement, budgets, and frequency caps.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">4</span><span><strong>Best Offer Decisioning</strong> — At checkout or in journeys, BOD ranks eligible offers by value, margin, propensity, and tier — then logs every decision.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">5</span><span><strong>Customer 360 flags</strong> — <code className="rounded bg-slate-100 px-1">loyalty_member</code>, tier, and points appear on every customer record and in Data → Schemas.</span></li>
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Offer types supported</h3>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
            {['% & fixed discounts', 'Cashback & BOGO', 'Free shipping', 'Points bonus', 'Tier upgrades', 'Bundle deals'].map((t) => (
              <li key={t} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" />{t}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Decisioning strategies</h3>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
            {['Highest value', 'Margin-aware', 'Balanced (weighted)', 'Explore / exploit', 'Personalized propensity'].map((t) => (
              <li key={t} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" />{t}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">MarTech integrations</h3>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
            {['Journey offer nodes', 'Audience targeting', 'Channel placements', 'Real-time context API', 'Decision audit log'].map((t) => (
              <li key={t} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
