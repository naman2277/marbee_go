import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { Customer360Header, CustomerMetricsGrid } from '@/components/customers/Customer360Panels';
import { Customer360Overview } from '@/components/customers/Customer360Overview';
import { CustomerActivityTimeline } from '@/components/customers/CustomerActivityTimeline';
import { CustomerJourneyList } from '@/components/customers/CustomerJourneyList';
import { CustomerSubscriptionsPanel } from '@/components/subscriptions/CustomerSubscriptionsPanel';
import { CustomerOffersPanel } from '@/components/customers/CustomerOffersPanel';
import { fetchCustomer360 } from '@/lib/customers';
import { useTenantScope } from '@/contexts/AuthContext';

type Tab = 'overview' | 'timeline' | 'journeys' | 'offers' | 'subscriptions';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId, environment } = useTenantScope();
  const [tab, setTab] = useState<Tab>('overview');

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['customer-360', id, tenantId, environment],
    queryFn: () => fetchCustomer360(id!, tenantId, environment),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Stitching customer profile…</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <EmptyState
        title="Customer not found"
        description="This profile does not exist or you do not have access."
        action={
          <Link to="/customers" className="text-sm font-medium text-brand-600 hover:underline">
            Back to Customer Profiles
          </Link>
        }
      />
    );
  }

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'overview', label: '360° Overview' },
    { id: 'timeline', label: 'Activity Timeline', count: profile.timeline.length },
    { id: 'journeys', label: 'Journeys involved', count: profile.journeyInstances.length },
    { id: 'offers', label: 'Offers & Eligibility' },
    { id: 'subscriptions', label: 'Subscriptions' },
  ];

  return (
    <div className="space-y-6">
      <Link
        to="/customers"
        className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Customer Profiles
      </Link>

      <Customer360Header profile={profile} />
      <CustomerMetricsGrid profile={profile} />

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] tabular-nums text-slate-600">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Customer360Overview profile={profile} onViewActivity={() => setTab('timeline')} />
      )}

      {tab === 'timeline' && <CustomerActivityTimeline items={profile.timeline} />}

      {tab === 'journeys' && (
        <CustomerJourneyList
          instances={profile.journeyInstances}
          variant="full"
          title="Journeys involved"
          showViewAllLink={profile.journeyInstances.length > 0}
        />
      )}

      {tab === 'offers' && <CustomerOffersPanel profile={profile} />}

      {tab === 'subscriptions' && (
        <CustomerSubscriptionsPanel customerId={profile.customer.id} />
      )}
    </div>
  );
}
