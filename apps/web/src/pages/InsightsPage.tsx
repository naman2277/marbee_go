import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  GitBranch,
  LineChart,
  Target,
  Users,
} from 'lucide-react';
import { Card, CardHeader } from '@/components/ui';
import { DailyBarChart } from '@/components/home/DailyBarChart';
import { EngagementFunnel } from '@/components/home/EngagementFunnel';
import { KpiCard } from '@/components/home/KpiCard';
import { useAuth } from '@/contexts/AuthContext';
import {
  conversionRate,
  deltaPercent,
  deliveryRate,
  engagementRate,
  fetchInsightsMetrics,
} from '@/lib/home-analytics';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Period = 7 | 30 | 90;

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

export function InsightsPage() {
  const { tenantId, environment } = useAuth();
  const [period, setPeriod] = useState<Period>(7);

  const { data, isLoading } = useQuery({
    queryKey: ['insights', tenantId, environment, period],
    queryFn: () => fetchInsightsMetrics(tenantId, environment, period),
    enabled: Boolean(tenantId),
  });

  const counts = data?.period;
  const prev = data?.previousPeriod;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <LineChart className="h-3.5 w-3.5" />
            Analytics
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Insights</h1>
          <p className="mt-1 text-slate-500">
            Trends, funnels, and performance patterns across your engagement stack
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition',
                period === opt.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total sent"
          value={isLoading ? '—' : formatNumber(counts?.sent ?? 0)}
          icon={BarChart3}
          accent="orange"
          delta={counts && prev ? deltaPercent(counts.sent, prev.sent) : null}
          deltaLabel={`vs prior ${period} days`}
        />
        <KpiCard
          label="Delivery rate"
          value={isLoading ? '—' : counts ? `${deliveryRate(counts)?.toFixed(0) ?? '0'}%` : '0%'}
          icon={LineChart}
          accent="sky"
          subtitle={counts ? `${formatNumber(counts.delivered)} delivered` : undefined}
        />
        <KpiCard
          label="Engagement rate"
          value={isLoading ? '—' : counts ? `${engagementRate(counts)?.toFixed(0) ?? '0'}%` : '0%'}
          icon={Target}
          accent="violet"
          subtitle={counts ? `${formatNumber(counts.engaged)} opens & clicks` : undefined}
        />
        <KpiCard
          label="Conversion rate"
          value={isLoading ? '—' : counts ? `${conversionRate(counts)?.toFixed(0) ?? '0'}%` : '0%'}
          icon={Users}
          accent="emerald"
          subtitle={counts ? `${formatNumber(counts.converted)} conversions` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Engagement funnel" subtitle={`Last ${period} days`} />
          <div className="p-6 pt-2">
            {counts ? <EngagementFunnel counts={counts} /> : (
              <p className="py-8 text-center text-sm text-slate-500">Loading funnel data…</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Daily volume" subtitle="Sent vs engaged (up to 14 days shown)" />
          <div className="p-6 pt-2">
            {data?.dailyVolume ? <DailyBarChart data={data.dailyVolume} /> : null}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Channel performance" subtitle={`Aggregated over ${period} days`} />
          <div className="overflow-x-auto p-6 pt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-3 font-semibold">Channel</th>
                  <th className="pb-3 font-semibold">Sent</th>
                  <th className="pb-3 font-semibold">Delivered</th>
                  <th className="pb-3 font-semibold">Engaged</th>
                  <th className="pb-3 font-semibold">Converted</th>
                  <th className="pb-3 font-semibold">Eng. rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(data?.channels ?? []).map((ch) => (
                  <tr key={ch.channel}>
                    <td className="py-3 font-medium capitalize">{ch.channel.replace(/_/g, ' ')}</td>
                    <td className="py-3 tabular-nums">{formatNumber(ch.sent)}</td>
                    <td className="py-3 tabular-nums">{formatNumber(ch.delivered)}</td>
                    <td className="py-3 tabular-nums">{formatNumber(ch.engaged)}</td>
                    <td className="py-3 tabular-nums">{formatNumber(ch.converted)}</td>
                    <td className="py-3 tabular-nums">
                      {ch.delivered ? `${Math.round((ch.engaged / ch.delivered) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
                {!data?.channels?.length && !isLoading && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No engagement data for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Platform snapshot" subtitle="Current workspace totals" />
          <div className="space-y-3 p-6 pt-2">
            {[
              { label: 'Customers', value: data?.snapshot.customers, path: '/customers', icon: Users },
              { label: 'Events tracked', value: data?.snapshot.events, path: '/events', icon: BarChart3 },
              { label: 'Journeys', value: data?.snapshot.journeys, path: '/journeys', icon: GitBranch },
              { label: 'Audiences', value: data?.snapshot.audiences, path: '/customers/audiences', icon: Target },
            ].map(({ label, value, path, icon: Icon }) => (
              <Link
                key={label}
                to={path}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 transition hover:border-brand-200 hover:bg-brand-50/30"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <Icon className="h-4 w-4 text-slate-400" />
                  {label}
                </span>
                <span className="text-lg font-bold tabular-nums text-slate-900">
                  {isLoading ? '—' : formatNumber(value ?? 0)}
                </span>
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-100 px-6 py-4">
            <p className="text-xs text-slate-500">
              Deeper reporting available under{' '}
              <Link to="/journey-analytics" className="font-medium text-brand-600 hover:underline">
                Journey Analytics
              </Link>{' '}
              and{' '}
              <Link to="/reporting/channels" className="font-medium text-brand-600 hover:underline">
                Channel Performance
              </Link>
              .
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
