import {
  Activity,
  Bell,
  FileInput,
  GitBranch,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import {
  formatCurrency,
  formatRelativeTime,
  type Customer360,
  type TimelineItem,
} from '@/lib/customers';
import { TimelineIcon, timelineKindLabel } from '@/components/customers/CustomerTimeline';
import {
  CustomerIdentityPanel,
  CustomerAttributesPanel,
  CustomerChannelsPanel,
  CustomerConsentPanel,
  CustomerJourneysPanel,
  CustomerLoyaltyPanel,
} from '@/components/customers/Customer360Panels';

type Props = {
  profile: Customer360;
  onViewActivity: () => void;
};

export function Customer360Overview({ profile, onViewActivity }: Props) {
  const { metrics, timeline } = profile;

  const breakdown = [
    { label: 'Behavior', count: profile.events.length, icon: Activity, color: 'bg-blue-500' },
    { label: 'Messages', count: profile.engagements.length, icon: Bell, color: 'bg-orange-500' },
    { label: 'Forms', count: profile.formSubmissions.length, icon: FileInput, color: 'bg-pink-500' },
    { label: 'Journeys', count: profile.journeyInstances.length, icon: GitBranch, color: 'bg-brand-500' },
  ];

  const totalBreakdown = breakdown.reduce((sum, b) => sum + b.count, 0) || 1;
  const recentHighlights = timeline.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Engagement snapshot — unique to overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-600" />
            <h3 className="font-semibold text-slate-900">Stitched profile summary</h3>
          </div>
          <p className="mb-5 text-sm text-slate-600">
            Unified view across {metrics.identityCount || 1} identit{metrics.identityCount === 1 ? 'y' : 'ies'},{' '}
            {metrics.channelCount} active channel{metrics.channelCount === 1 ? '' : 's'}, and{' '}
            {totalBreakdown} total touchpoint{totalBreakdown === 1 ? '' : 's'}.
          </p>

          <div className="space-y-3">
            {breakdown.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                    <item.icon className="h-3.5 w-3.5 text-slate-400" />
                    {item.label}
                  </span>
                  <span className="tabular-nums text-slate-500">{item.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${Math.max((item.count / totalBreakdown) * 100, item.count > 0 ? 8 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <InsightCard
            icon={TrendingUp}
            label="Engagement rate"
            value={`${metrics.engagementRate.toFixed(0)}%`}
            hint={`${metrics.messagesClicked} clicks from ${metrics.messagesSent} sent`}
            accent="text-emerald-600 bg-emerald-50"
          />
          <InsightCard
            icon={Sparkles}
            label="Lifetime value"
            value={metrics.estimatedValue ? formatCurrency(metrics.estimatedValue) : '—'}
            hint="From purchase & order events"
            accent="text-violet-600 bg-violet-50"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left: profile panels — no timeline */}
        <div className="xl:col-span-2 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <CustomerIdentityPanel profile={profile} />
            <CustomerAttributesPanel profile={profile} />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <CustomerChannelsPanel profile={profile} />
            <CustomerConsentPanel profile={profile} />
          </div>
          <CustomerLoyaltyPanel profile={profile} />
          <CustomerJourneysPanel profile={profile} />
        </div>

        {/* Right: compact recent highlights — not the full timeline */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Recent highlights</h3>
            <p className="text-xs text-slate-500">Latest touchpoints at a glance</p>
          </div>
          <div className="p-4">
            {recentHighlights.length ? (
              <ul className="space-y-3">
                {recentHighlights.map((item) => (
                  <HighlightRow key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">No activity recorded yet.</p>
            )}
          </div>
          {timeline.length > 4 && (
            <div className="border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={onViewActivity}
                className="w-full text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View full activity timeline ({timeline.length}) →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex rounded-lg p-2 ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

function HighlightRow({ item }: { item: TimelineItem }) {
  return (
    <li className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
        <TimelineIcon item={item} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
          <Badge variant="default">{timelineKindLabel(item)}</Badge>
        </div>
        {item.subtitle && (
          <p className="mt-0.5 truncate text-xs text-slate-500">{item.subtitle}</p>
        )}
        <p className="mt-1 text-[10px] text-slate-400">{formatRelativeTime(item.timestamp)}</p>
      </div>
    </li>
  );
}
