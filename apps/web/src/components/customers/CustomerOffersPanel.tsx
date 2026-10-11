import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Check, Gift, ShieldOff, X } from 'lucide-react';
import { useTenantScope } from '@/contexts/AuthContext';
import { fetchOffers, formatOfferValue, offerStatusMeta, offerChannelLabel, offerPlacementLabel } from '@/lib/offers';
import { eligibilityFromOffer, evaluateEligibility, type EligibilityContext } from '@/lib/offer-eligibility';
import type { Customer360 } from '@/lib/customers';
import { formatNumber } from '@/lib/utils';

/**
 * Customer 360 → Offers. Evaluates every live offer's eligibility criteria
 * against this profile so you can see exactly what they qualify for and why.
 */
export function CustomerOffersPanel({ profile }: { profile: Customer360 }) {
  const { tenantId, environment } = useTenantScope();

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['loyalty-offers', tenantId, environment],
    queryFn: () => fetchOffers(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  // Build the evaluation context from the stitched 360 profile
  const ctx: EligibilityContext = useMemo(() => {
    const c = profile.customer as Record<string, any>;
    return {
      ...c,
      loyalty_points: profile.metrics.loyaltyPoints,
      lifetime_points: profile.metrics.loyaltyPoints,
      loyalty_status: profile.metrics.loyaltyMember ? 'active' : null,
      loyalty_tier: profile.metrics.loyaltyTier,
      loyalty_tier_slug: profile.metrics.loyaltyTier?.toLowerCase() ?? null,
    };
  }, [profile]);

  const evaluated = useMemo(() => {
    return offers
      .filter((o) => o.status === 'active' || o.status === 'scheduled')
      .map((offer) => ({
        offer,
        verdict: evaluateEligibility(eligibilityFromOffer(offer), ctx),
      }))
      .sort((a, b) =>
        a.verdict.eligible === b.verdict.eligible
          ? b.offer.priority - a.offer.priority
          : a.verdict.eligible ? -1 : 1,
      );
  }, [offers, ctx]);

  const eligible = evaluated.filter((e) => e.verdict.eligible);
  const notEligible = evaluated.filter((e) => !e.verdict.eligible);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">Evaluating offer eligibility…</div>;
  }

  if (evaluated.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <Gift className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 text-sm font-bold text-slate-900">No live offers</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
          Publish an offer and it will be evaluated against this customer automatically.
        </p>
        <Link to="/loyalty/offers" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">
          Go to Offers <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
          <p className="text-2xl font-black leading-none text-emerald-700 tabular-nums">{eligible.length}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Qualifies for</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-2xl font-black leading-none text-slate-500 tabular-nums">{notEligible.length}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Not eligible</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
          <p className="text-2xl font-black leading-none text-amber-700 tabular-nums">
            {formatNumber(profile.metrics.loyaltyPoints ?? 0)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
            Points{profile.metrics.loyaltyTier ? ` · ${profile.metrics.loyaltyTier}` : ''}
          </p>
        </div>
      </div>

      <OfferGroup title="Eligible offers" items={eligible} tone="eligible" />
      {notEligible.length > 0 && <OfferGroup title="Not eligible" items={notEligible} tone="blocked" />}
    </div>
  );
}

function OfferGroup({ title, items, tone }: {
  title: string;
  items: Array<{ offer: any; verdict: { eligible: boolean; passed: string[]; failed: string[] } }>;
  tone: 'eligible' | 'blocked';
}) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
        <p className="rounded-2xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
          This customer doesn’t qualify for any live offer yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        {title} <span className="text-slate-400">({items.length})</span>
      </h3>
      <div className="space-y-2">
        {items.map(({ offer, verdict }) => {
          const st = offerStatusMeta(offer.status);
          return (
            <div key={offer.id}
              className={`rounded-2xl border bg-white p-3.5 ${tone === 'eligible' ? 'border-emerald-200' : 'border-slate-200 opacity-80'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-purple-100 px-1.5 py-0.5 font-mono text-[11px] font-black text-purple-800">
                      {formatOfferValue(offer)}
                    </span>
                    <p className="truncate text-sm font-bold text-slate-900">{offer.name}</p>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${st.chip}`}>{st.label}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {offerChannelLabel(offer.channel)} · {offerPlacementLabel(offer.placement)}
                  </p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
                  tone === 'eligible' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {tone === 'eligible' ? <Check className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                  {tone === 'eligible' ? 'Qualifies' : 'Blocked'}
                </span>
              </div>

              {/* Why */}
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                {verdict.passed.map((p, i) => (
                  <span key={`p${i}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    <Check className="h-2.5 w-2.5" /> {p}
                  </span>
                ))}
                {verdict.failed.map((f, i) => (
                  <span key={`f${i}`} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                    <X className="h-2.5 w-2.5" /> {f}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
