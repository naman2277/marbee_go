import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare, Users, UserCheck, MousePointerClick, Clock, Timer, Coins, Smile, Star,
} from 'lucide-react';
import { Card } from '@/components/ui';
import type { TabProps } from '../types';
import { fetchChatBotAnalytics } from '@/lib/chatbots';

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'all';

function dateRange(range: RangeKey): { since?: string; until?: string } {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString() };
  }
  if (range === 'yesterday') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), until: end.toISOString() };
  }
  if (range === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { since: start.toISOString() };
  }
  if (range === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { since: start.toISOString() };
  }
  return {};
}

function StatTile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></div>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

export function AnalyticsTab({ draft }: TabProps) {
  const [range, setRange] = useState<RangeKey>('30d');
  const { since, until } = useMemo(() => dateRange(range), [range]);

  const { data, isLoading } = useQuery({
    queryKey: ['chatbot-analytics', draft.bot.id, range],
    queryFn: () => fetchChatBotAnalytics(draft.bot.id, since, until),
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Analytics</h2>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
          {(['today', 'yesterday', '7d', '30d', 'all'] as RangeKey[]).map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} className={`rounded-md px-2.5 py-1.5 font-semibold ${range === r ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : r === 'today' ? 'Today' : r === 'yesterday' ? 'Yesterday' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading analytics…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatTile icon={MessageSquare} label="Total Conversations" value={data.totalConversations.toLocaleString()} tone="bg-brand-50 text-brand-600" />
            <StatTile icon={Users} label="Unique Visitors" value={data.uniqueVisitors.toLocaleString()} tone="bg-sky-50 text-sky-600" />
            <StatTile icon={UserCheck} label="Leads Captured" value={data.leadsCaptured.toLocaleString()} tone="bg-purple-50 text-purple-600" />
            <StatTile icon={UserCheck} label="Qualified Leads" value={data.qualifiedLeads.toLocaleString()} tone="bg-emerald-50 text-emerald-600" />
            <StatTile icon={MousePointerClick} label="CTA Clicks" value={data.ctaClicks.toLocaleString()} tone="bg-amber-50 text-amber-600" />
            <StatTile icon={MousePointerClick} label="CTA Conversion Rate" value={`${data.ctaConversionRate}%`} tone="bg-amber-50 text-amber-600" />
            <StatTile icon={Clock} label="Avg. Messages / Conversation" value={String(data.avgMessages)} tone="bg-slate-100 text-slate-600" />
            <StatTile icon={Timer} label="Avg. Response Time" value={`${data.avgResponseTimeMs}ms`} tone="bg-slate-100 text-slate-600" />
            <StatTile icon={Timer} label="Avg. Conversation Duration" value={`${Math.round(data.avgDurationSeconds / 60)}m`} tone="bg-slate-100 text-slate-600" />
            <StatTile icon={Coins} label="Token Consumption" value={data.totalTokens.toLocaleString()} tone="bg-slate-100 text-slate-600" />
            <StatTile icon={MessageSquare} label="Active" value={data.activeConversations.toLocaleString()} tone="bg-sky-50 text-sky-600" />
            <StatTile icon={MessageSquare} label="Completed" value={data.completedConversations.toLocaleString()} tone="bg-emerald-50 text-emerald-600" />
            <StatTile icon={Star} label="Avg. Feedback Rating" value={data.avgFeedbackRating != null ? `${data.avgFeedbackRating}/5` : '—'} tone="bg-yellow-50 text-yellow-600" />
            <StatTile icon={Star} label="Feedback Responses" value={data.feedbackCount.toLocaleString()} tone="bg-yellow-50 text-yellow-600" />
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><Smile className="h-3.5 w-3.5" /> Sentiment Breakdown</div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Positive', icon: '🟢', value: data.positiveCount, color: 'bg-emerald-500' },
                { label: 'Neutral', icon: '🔵', value: data.neutralCount, color: 'bg-sky-400' },
                { label: 'Negative', icon: '🔴', value: data.negativeCount, color: 'bg-red-500' },
                { label: 'Mixed', icon: '🟡', value: data.mixedCount, color: 'bg-amber-400' },
              ].map((s) => {
                const total = data.positiveCount + data.neutralCount + data.negativeCount + data.mixedCount || 1;
                const pct = Math.round((s.value / total) * 100);
                return (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-xs mb-1"><span>{s.icon} {s.label}</span><span className="font-bold">{s.value}</span></div>
                    <div className="h-2 w-full rounded-full bg-slate-100"><div className={`h-2 rounded-full ${s.color}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
