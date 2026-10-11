import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Mail, TrendingUp, Users } from 'lucide-react';
import {
  extractDeployedDeliveries,
  aggregateEngagementStats,
  fetchAllDeliveryReports,
  fetchPersistedCampaignDeliveries,
  mergeCampaignDeliveries,
  type DeliveryEngagementReport,
} from '@/lib/campaign-deliveries';
import { CampaignDeliveriesPanel } from '@/components/journeys/CampaignDeliveriesPanel';
import type { NodePopulationResult } from '@/lib/workflow-engine';

type Props = {
  tenantId: string;
  environment: string;
  journeyId?: string;
  nodeResults: Record<string, NodePopulationResult>;
  isFinished?: boolean;
  completedAt?: string | null;
  campaignName: string;
};

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Users;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? 'text-slate-900'}`}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className="rounded-md bg-slate-50 p-2 text-slate-400">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function CampaignDashboard({
  tenantId,
  environment,
  journeyId,
  nodeResults,
  isFinished,
  completedAt,
  campaignName,
}: Props) {
  const sessionDeliveries = extractDeployedDeliveries(nodeResults);

  const { data: persistedDeliveries = [] } = useQuery({
    queryKey: ['campaign-persisted-deliveries', tenantId, environment, journeyId],
    queryFn: () => fetchPersistedCampaignDeliveries(tenantId, environment, journeyId),
    refetchInterval: 30_000,
  });

  const deliveries = useMemo(
    () => mergeCampaignDeliveries(sessionDeliveries, persistedDeliveries),
    [sessionDeliveries, persistedDeliveries],
  );

  const { data: reports = [] } = useQuery({
    queryKey: ['campaign-dashboard-reports', journeyId, deliveries.map((d) => d.id).join(',')],
    queryFn: () => fetchAllDeliveryReports(tenantId, environment, deliveries, journeyId),
    enabled: deliveries.length > 0,
    refetchInterval: 30_000,
  });

  const aggregate = aggregateEngagementStats(reports);

  const totalTarget = deliveries.reduce((s, d) => s + d.sentCount + d.excludedCount, 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        {isFinished && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-emerald-900">Campaign complete — {campaignName}</p>
              {completedAt && (
                <p className="text-xs text-emerald-700">
                  Finished {new Date(completedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}

        <h2 className="text-lg font-semibold text-slate-900">Delivery monitoring</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sent, delivered, opens, and clicks across all deliveries.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Recipients" value={totalTarget.toLocaleString()} icon={Users} />
          <KpiCard label="Sent" value={aggregate.sent} icon={TrendingUp} tone="text-blue-600" />
          <KpiCard label="Delivered" value={aggregate.delivered} tone="text-emerald-600" icon={CheckCircle2} />
          <KpiCard label="Opened" value={aggregate.opened} icon={Mail} />
          <KpiCard label="Clicked" value={aggregate.clicked} icon={Mail} tone="text-blue-600" />
          <KpiCard label="Failed" value={aggregate.failed} tone="text-red-600" icon={Mail} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex-1 border-r border-slate-200 bg-white">
          <CampaignDeliveriesPanel
            tenantId={tenantId}
            environment={environment}
            journeyId={journeyId}
            deliveries={deliveries}
            isFinished={isFinished}
            completedAt={completedAt}
            embedded
          />
        </div>

        {reports.length > 0 && (
          <div className="hidden w-[260px] shrink-0 border-l border-slate-200 bg-white p-4 xl:block">
            <p className="text-xs font-medium text-slate-500">Funnel summary</p>
            <FunnelSummary reports={reports} />
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelSummary({ reports }: { reports: DeliveryEngagementReport[] }) {
  const stats = aggregateEngagementStats(reports);
  const steps = [
    { label: 'Sent', value: stats.sent, pct: 100 },
    {
      label: 'Delivered',
      value: stats.delivered,
      pct: stats.sent ? (stats.delivered / stats.sent) * 100 : 0,
    },
    {
      label: 'Opened',
      value: stats.opened,
      pct: stats.sent ? (stats.opened / stats.sent) * 100 : 0,
    },
    {
      label: 'Clicked',
      value: stats.clicked,
      pct: stats.sent ? (stats.clicked / stats.sent) * 100 : 0,
    },
  ];

  return (
    <ul className="mt-3 space-y-3">
      {steps.map((step) => (
        <li key={step.label}>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">{step.label}</span>
            <span className="font-mono text-slate-800">{step.value}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${Math.min(step.pct, 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
