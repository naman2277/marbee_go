import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  GitBranch,
  MousePointerClick,
  Radio,
  Send,
  Target,
  TrendingUp,
  Users,
  Zap,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { KpiCard } from '@/components/home/KpiCard';
import { useAuth } from '@/contexts/AuthContext';
import {
  getHyperPersonalizedGreeting,
  getFallbackGreeting,
  type PersonalizedGreeting,
} from '@/lib/ai-personalized-greeting';
import {
  deltaPercent,
  deliveryRate,
  engagementRate,
  fetchPulseMetrics,
} from '@/lib/home-analytics';
import { formatNumber, cn } from '@/lib/utils';
import { ENV_BADGE_CLASS, ENV_FULL_LABEL } from '@/lib/environment';

const EVENT_LABELS: Record<string, string> = {
  sent: 'Message sent',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked',
  converted: 'Converted',
  failed: 'Failed',
  unsubscribed: 'Unsubscribed',
};

const QUICK_ACTIONS = [
  { label: 'New journey', path: '/journeys', icon: GitBranch },
  { label: 'View events', path: '/events', icon: Radio },
  { label: 'Audiences', path: '/customers/audiences', icon: Target },
  { label: 'Insights', path: '/insights', icon: TrendingUp },
] as const;

export function PulsePage() {
  const { tenantId, environment, displayName } = useAuth();
  const [personalizedGreeting, setPersonalizedGreeting] = useState<PersonalizedGreeting>(() =>
    getFallbackGreeting(displayName || 'Naman')
  );
  const [isRefreshingGreeting, setIsRefreshingGreeting] = useState(false);

  const loadPersonalizedGreeting = async (force: boolean = false) => {
    if (force) setIsRefreshingGreeting(true);
    try {
      const res = await getHyperPersonalizedGreeting(tenantId, environment, displayName || 'Naman', force);
      setPersonalizedGreeting(res);
    } catch {
      // fallback already active
    } finally {
      setIsRefreshingGreeting(false);
    }
  };

  useEffect(() => {
    loadPersonalizedGreeting(false);
  }, [tenantId, environment, displayName]);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['pulse', tenantId, environment],
    queryFn: () => fetchPulseMetrics(tenantId, environment),
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
  });

  const today = data?.today;
  const yesterday = data?.yesterday;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 px-6 py-8 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-orange-500/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3.5 max-w-3xl">
            {/* 1. Top Badges & Live Status */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span>Live · {ENV_FULL_LABEL[environment]}</span>
              </div>

              {personalizedGreeting.weatherBadge && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/90">
                  <span>{personalizedGreeting.weatherBadge}</span>
                </div>
              )}

              {personalizedGreeting.vibeBadge && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-200">
                  <span>{personalizedGreeting.vibeBadge}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => loadPersonalizedGreeting(true)}
                disabled={isRefreshingGreeting}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-40"
                title="Regenerate AI Personalized Briefing"
              >
                <RefreshCw className={cn('h-3 w-3', isRefreshingGreeting && 'animate-spin')} />
                <span>{isRefreshingGreeting ? 'Updating…' : 'Refresh'}</span>
              </button>
            </div>

            {/* 2. Structured Primary Greeting & Tagline */}
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl text-white">
                {personalizedGreeting.greeting}
              </h1>
              {personalizedGreeting.tagline && (
                <p className="mt-1 text-base font-semibold text-purple-200/90 md:text-lg">
                  {personalizedGreeting.tagline}
                </p>
              )}
            </div>

            {/* 3. Subtitle / Feel-Good Message */}
            <p className="text-sm leading-relaxed text-slate-300 max-w-2xl">
              {personalizedGreeting.subtitle}
            </p>

            {/* 4. Mindful Daily Spark Box */}
            {personalizedGreeting.aiTip && (
              <div className="inline-flex items-center gap-2 rounded-xl bg-purple-500/10 border border-purple-400/25 px-3.5 py-2 text-xs font-medium text-purple-200 backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span>{personalizedGreeting.aiTip}</span>
              </div>
            )}
          </div>

          <div className="text-right text-xs text-white/50 shrink-0">
            <p>Auto-refreshes every minute</p>
            {dataUpdatedAt > 0 && (
              <p className="mt-1 tabular-nums">
                Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="New Customers (24h)"
          value={isLoading ? '—' : formatNumber(data?.customersLastDay ?? 0)}
          icon={Users}
          accent="purple"
          subtitle={data ? `Total: ${formatNumber(data.totalCustomers)} active` : undefined}
          delta={
            data && data.customersPreviousDay !== undefined
              ? deltaPercent(data.customersLastDay, data.customersPreviousDay)
              : null
          }
        />
        <KpiCard
          label="Messages sent"
          value={isLoading ? '—' : formatNumber(today?.sent ?? 0)}
          icon={Send}
          accent="orange"
          delta={today && yesterday ? deltaPercent(today.sent, yesterday.sent) : null}
        />
        <KpiCard
          label="Delivered"
          value={isLoading ? '—' : formatNumber(today?.delivered ?? 0)}
          icon={Zap}
          accent="sky"
          subtitle={today ? `${deliveryRate(today)?.toFixed(0) ?? '—'}% delivery rate` : undefined}
          delta={today && yesterday ? deltaPercent(today.delivered, yesterday.delivered) : null}
        />
        <KpiCard
          label="Engaged"
          value={isLoading ? '—' : formatNumber(today?.engaged ?? 0)}
          icon={MousePointerClick}
          accent="violet"
          subtitle={today ? `${engagementRate(today)?.toFixed(0) ?? '—'}% of delivered` : undefined}
          delta={today && yesterday ? deltaPercent(today.engaged, yesterday.engaged) : null}
        />
        <KpiCard
          label="Conversions"
          value={isLoading ? '—' : formatNumber(today?.converted ?? 0)}
          icon={TrendingUp}
          accent="emerald"
          delta={today && yesterday ? deltaPercent(today.converted, yesterday.converted) : null}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map(({ label, path, icon: Icon }) => (
          <Link key={path} to={path}>
            <Button variant="secondary" size="sm" className="gap-2">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Channel mix" subtitle="Today's volume by channel" />
          <div className="overflow-x-auto p-6 pt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-3 font-semibold">Channel</th>
                  <th className="pb-3 font-semibold">Sent</th>
                  <th className="pb-3 font-semibold">Delivery</th>
                  <th className="pb-3 font-semibold">Engaged</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(data?.channels ?? []).map((ch) => (
                  <tr key={ch.channel} className="hover:bg-slate-50/50">
                    <td className="py-3 font-medium capitalize text-slate-900">{ch.channel.replace(/_/g, ' ')}</td>
                    <td className="py-3 tabular-nums">{formatNumber(ch.sent)}</td>
                    <td className="py-3 tabular-nums">
                      {ch.sent ? `${Math.round((ch.delivered / ch.sent) * 100)}%` : '—'}
                    </td>
                    <td className="py-3 tabular-nums">{formatNumber(ch.engaged)}</td>
                    <td className="py-3">
                      <Badge variant={ch.sent > 0 ? 'success' : 'default'}>
                        {ch.sent > 0 ? 'Active' : 'Idle'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {!data?.channels?.length && !isLoading && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                      No channel activity yet today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Journeys"
            subtitle="Recent workflows"
            action={
              <Link to="/journeys" className="text-xs font-medium text-brand-600 hover:underline">
                View all
              </Link>
            }
          />
          <div className="divide-y divide-slate-100">
            {(data?.journeys ?? []).map((j) => (
              <Link
                key={j.id}
                to={`/journeys/${j.id}`}
                className="flex items-center justify-between px-6 py-3 transition hover:bg-slate-50"
              >
                <span className="truncate text-sm font-medium text-slate-900">{j.name}</span>
                <Badge variant={j.status === 'published' ? 'success' : j.status === 'paused' ? 'warning' : 'default'}>
                  {j.status}
                </Badge>
              </Link>
            ))}
            {!data?.journeys?.length && !isLoading && (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-slate-500">No journeys yet</p>
                <Link to="/journeys" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
                  Create your first <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Live activity"
          subtitle="Latest engagement events"
          action={
            <Link to="/events" className="text-xs font-medium text-brand-600 hover:underline">
              Event stream
            </Link>
          }
        />
        <div className="divide-y divide-slate-100">
          {(data?.recentActivity ?? []).map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-6 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <Activity className="h-4 w-4 text-slate-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {EVENT_LABELS[item.event] ?? item.event}
                  <span className="font-normal text-slate-500"> · {item.channel.replace(/_/g, ' ')}</span>
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(item.timestamp).toLocaleString()}
                </p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  ENV_BADGE_CLASS[environment],
                )}
              >
                {item.event}
              </span>
            </div>
          ))}
          {!data?.recentActivity?.length && !isLoading && (
            <p className="px-6 py-10 text-center text-sm text-slate-500">
              Activity will appear here as messages flow through your channels
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
