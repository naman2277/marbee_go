import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Mail, RefreshCw } from 'lucide-react';
import type { DeployedDelivery } from '@/lib/campaign-deliveries';
import {
  extractDeployedDeliveries,
  fetchDeliveryEngagementReport,
  type DeliveryEngagementReport,
} from '@/lib/campaign-deliveries';
import { channelLabel, type ContentChannel } from '@/lib/content-templates';
import type { NodePopulationResult } from '@/lib/workflow-engine';

type Props = {
  tenantId: string;
  environment: string;
  journeyId?: string;
  nodeResults?: Record<string, NodePopulationResult>;
  deliveries?: DeployedDelivery[];
  isFinished?: boolean;
  completedAt?: string | null;
  embedded?: boolean;
};

function channelLabelSafe(channel: string): string {
  if (channel === 'email' || channel === 'sms' || channel === 'web_push' || channel === 'whatsapp') {
    return channelLabel(channel as ContentChannel);
  }
  return channel;
}

function StatPill({
  label,
  value,
  tone,
  light,
}: {
  label: string;
  value: number;
  tone?: string;
  light?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 text-center ${
        light ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
      }`}
    >
      <p className={`text-xs font-medium ${light ? 'text-slate-500' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tone ?? (light ? 'text-slate-900' : 'text-slate-200')}`}>
        {value}
      </p>
    </div>
  );
}

function DeliveryCard({
  report,
  expanded,
  onToggle,
  light,
}: {
  report: DeliveryEngagementReport;
  expanded: boolean;
  onToggle: () => void;
  light?: boolean;
}) {
  const { delivery, stats, logs } = report;

  return (
    <div
      className={`overflow-hidden rounded-lg border ${
        light ? 'border-slate-200 bg-white shadow-sm' : 'border-slate-800 bg-slate-900/40'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left ${
          light ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
        }`}
      >
        <div className="mt-0.5 text-slate-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
            {delivery.label}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {delivery.id.slice(0, 8)} · {channelLabelSafe(delivery.channel)} ·{' '}
            {new Date(delivery.confirmedAt).toLocaleString()}
          </p>
          <p className={`mt-1 text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>
            Sent to {delivery.sentCount.toLocaleString()} · excluded {delivery.excludedCount.toLocaleString()}
          </p>
        </div>
      </button>

      {expanded && (
        <div className={`border-t px-4 py-3 ${light ? 'border-slate-100' : 'border-slate-800'}`}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <StatPill label="Sent" value={stats.sent} tone="text-blue-600" light={light} />
            <StatPill label="Delivered" value={stats.delivered} tone="text-emerald-600" light={light} />
            <StatPill label="Opened" value={stats.opened} light={light} />
            <StatPill label="Clicked" value={stats.clicked} light={light} />
            <StatPill label="Failed" value={stats.failed} tone="text-red-600" light={light} />
            <StatPill label="Events" value={logs.length} light={light} />
          </div>

          {logs.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">
              No engagement events for this delivery yet ({delivery.sentCount} recipient
              {delivery.sentCount === 1 ? '' : 's'} targeted).
            </p>
          ) : (
            <div className={`mt-4 overflow-hidden rounded-lg border ${light ? 'border-slate-200' : 'border-slate-800'}`}>
              <table className="w-full text-left text-xs">
                <thead
                  className={`text-xs font-medium uppercase ${
                    light ? 'bg-slate-50 text-slate-500' : 'bg-slate-900/80 text-slate-500'
                  }`}
                >
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Message</th>
                  </tr>
                </thead>
                <tbody className={light ? 'divide-y divide-slate-100' : 'divide-y divide-slate-800'}>
                  {logs.slice(0, 100).map((log) => (
                    <tr key={log.id} className={light ? 'text-slate-700' : 'text-slate-300'}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                            light ? 'bg-slate-100 text-slate-600' : 'bg-slate-800'
                          }`}
                        >
                          {log.event}
                        </span>
                      </td>
                      <td className="max-w-[80px] truncate px-3 py-2 font-mono text-[10px]">
                        {log.customer_id?.slice(0, 8) ?? '—'}
                      </td>
                      <td className="max-w-[100px] truncate px-3 py-2 font-mono text-[10px] text-slate-500">
                        {log.message_id.slice(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length > 100 && (
                <p className={`border-t px-3 py-2 text-[10px] text-slate-500 ${light ? 'border-slate-100' : 'border-slate-800'}`}>
                  Showing 100 of {logs.length} events
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryReportLoader({
  tenantId,
  environment,
  journeyId,
  delivery,
  expanded,
  onToggle,
  light,
}: {
  tenantId: string;
  environment: string;
  journeyId?: string;
  delivery: DeployedDelivery;
  expanded: boolean;
  onToggle: () => void;
  light?: boolean;
}) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['delivery-engagement', journeyId, delivery.id, delivery.confirmedAt],
    queryFn: () => fetchDeliveryEngagementReport(tenantId, environment, delivery, journeyId),
    enabled: expanded,
  });

  if (!expanded) {
    return (
      <DeliveryCard
        report={{ delivery, stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, other: 0, total: 0 }, logs: [] }}
        expanded={false}
        onToggle={onToggle}
        light={light}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border px-4 py-6 text-xs text-slate-500 ${
          light ? 'border-slate-200 bg-white' : 'border-slate-800'
        }`}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading engagement for {delivery.name}…
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void refetch()}
        disabled={isFetching}
        className={`absolute right-3 top-3 z-10 rounded-md p-1.5 disabled:opacity-50 ${
          light ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-600' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
        }`}
        title="Refresh engagement"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
      </button>
      <DeliveryCard report={data} expanded onToggle={onToggle} light={light} />
    </div>
  );
}

export function CampaignDeliveriesPanel({
  tenantId,
  environment,
  journeyId,
  nodeResults,
  deliveries: deliveriesProp,
  isFinished,
  completedAt,
  embedded,
}: Props) {
  const deliveries =
    deliveriesProp ?? (nodeResults ? extractDeployedDeliveries(nodeResults) : []);
  const [expandedId, setExpandedId] = useState<string | null>(deliveries[0]?.id ?? null);
  const light = embedded;

  return (
    <div className={`flex h-full flex-col ${light ? 'bg-white' : 'bg-[#0c0f1a]'}`}>
      {!embedded && (
      <div className="border-b border-slate-800 px-4 py-4">
        {isFinished && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-emerald-300">Campaign finished</p>
              {completedAt && (
                <p className="text-[10px] text-emerald-400/70">
                  Completed {new Date(completedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Deployed deliveries</p>
        <p className="mt-1 text-sm font-semibold text-white">
          {deliveries.length} delivery{deliveries.length === 1 ? '' : 'ies'}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Expand a delivery to view engagement logs and delivery performance.
        </p>
      </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!deliveries.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Mail className={`h-8 w-8 ${light ? 'text-slate-300' : 'text-slate-600'}`} />
            <p className={`mt-3 text-sm ${light ? 'text-slate-600' : 'text-slate-400'}`}>No confirmed deliveries yet</p>
            <p className="mt-1 max-w-[220px] text-xs text-slate-500">
              Deliveries appear here after you confirm send on a delivery activity.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {deliveries.map((delivery) => (
              <DeliveryReportLoader
                key={delivery.id}
                tenantId={tenantId}
                environment={environment}
                journeyId={journeyId}
                delivery={delivery}
                expanded={expandedId === delivery.id}
                onToggle={() => setExpandedId((id) => (id === delivery.id ? null : delivery.id))}
                light={light}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
