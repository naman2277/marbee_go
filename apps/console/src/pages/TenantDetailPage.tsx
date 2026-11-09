import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, ErrorBox, Loading, useLoad } from '@/components/ui';
import { OverviewTab } from './tenant/OverviewTab';
import { UsageTab } from './tenant/UsageTab';
import { CreditsTab } from './tenant/CreditsTab';
import { MembersTab } from './tenant/MembersTab';
import { BillingTab } from './tenant/BillingTab';

const TABS = ['Overview', 'Usage', 'Credits', 'Members', 'Billing'] as const;
type Tab = (typeof TABS)[number];

export function TenantDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('Overview');
  const detail = useLoad(() => api.getTenant(id), [id]);

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error) return <ErrorBox message={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return null;
  const { tenant } = detail.data;

  return (
    <>
      <Link to="/tenants" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 print:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All tenants
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{tenant.name}</h1>
        <Badge tone={tenant.status}>{tenant.status}</Badge>
        <span className="text-sm text-slate-500"><span className="capitalize">{tenant.plan}</span> plan · {tenant.slug}</span>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 print:hidden" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab detail={detail.data} onChanged={detail.reload} />}
      {tab === 'Usage' && <UsageTab tenantId={tenant.id} />}
      {tab === 'Credits' && <CreditsTab tenant={tenant} wallet={detail.data.wallet} onChanged={detail.reload} />}
      {tab === 'Members' && <MembersTab tenantId={tenant.id} />}
      {tab === 'Billing' && <BillingTab tenantId={tenant.id} />}
    </>
  );
}
