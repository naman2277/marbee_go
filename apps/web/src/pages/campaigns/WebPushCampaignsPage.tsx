// Campaigns → Web Push Campaigns (D-026): list / compose broadcasts, and one report per campaign.
import { useParams } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { Breadcrumbs } from '@/components/campaigns/CampaignUi';
import { WebPushBroadcasts } from '@/components/web-push/WebPushBroadcasts';
import { WebPushCampaignReport } from '@/components/web-push/WebPushCampaignReport';
import { useAuth } from '@/contexts/AuthContext';

export function WebPushCampaignsPage() {
  const { tenantId, environment } = useAuth();
  return (
    <div className="space-y-5">
      <div>
        <Breadcrumbs items={[{ label: 'Campaigns', to: '/campaigns' }, { label: 'Web Push Campaigns' }]} />
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
          <BellRing className="h-6 w-6 text-brand-600" /> Web Push Campaigns
        </h1>
        <p className="text-sm text-slate-500">Send a browser notification to your website subscribers and see how it performed.</p>
      </div>
      {tenantId ? <WebPushBroadcasts tenantId={tenantId} environment={environment} /> : null}
    </div>
  );
}

export function WebPushCampaignReportPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-3">
      <Breadcrumbs items={[{ label: 'Campaigns', to: '/campaigns' }, { label: 'Web Push Campaigns', to: '/campaigns/web-push' }, { label: 'Report' }]} />
      {id ? <WebPushCampaignReport broadcastId={id} /> : null}
    </div>
  );
}
