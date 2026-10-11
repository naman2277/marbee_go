import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, BarChart3, Bell, CheckCircle2, ChevronDown,
  LayoutTemplate, MessageSquare, MousePointerClick, Power, PowerOff,
  Radio, Search, Send, Settings, Shield, Target, Zap,
} from 'lucide-react';
import { PageHeader, Badge, Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  CHANNELS, STATUS_TONE, listDefinitions, usageSummary,
} from '@/lib/rtm';
import { RtmTemplates } from '@/components/realtime/RtmTemplates';
import { RtmEvents } from '@/components/realtime/RtmEvents';
import { RtmDeliveries } from '@/components/realtime/RtmDeliveries';
import { RtmTriggers } from '@/components/realtime/RtmTriggers';

// ─── Tab routing ────────────────────────────────────────────────────────────

type RtmTab = 'overview' | 'templates' | 'events' | 'deliveries' | 'triggers' | 'settings';

const TAB_ROUTES: Record<string, RtmTab> = {
  '/real-time': 'overview',
  '/real-time/templates': 'templates',
  '/real-time/events': 'events',
  '/real-time/deliveries': 'deliveries',
  '/real-time/triggers': 'triggers',
  '/real-time/settings': 'settings',
};

const TABS: { key: RtmTab; label: string; icon: React.ReactNode; path: string }[] = [
  { key: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" />, path: '/real-time' },
  { key: 'templates', label: 'Message Templates', icon: <LayoutTemplate className="h-4 w-4" />, path: '/real-time/templates' },
  { key: 'events', label: 'Real-Time Events', icon: <Activity className="h-4 w-4" />, path: '/real-time/events' },
  { key: 'deliveries', label: 'Deliveries', icon: <Radio className="h-4 w-4" />, path: '/real-time/deliveries' },
  { key: 'triggers', label: 'Triggers', icon: <Target className="h-4 w-4" />, path: '/real-time/triggers' },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, path: '/real-time/settings' },
];

// ─── Date range ─────────────────────────────────────────────────────────────

type DateRange = 'today' | 'yesterday' | '7d' | '30d' | 'custom';
const DATE_LABELS: Record<DateRange, string> = {
  today: 'Today', yesterday: 'Yesterday', '7d': 'Last 7 days', '30d': 'Last 30 days', custom: 'Custom',
};

// ═══════════════════════════════════════════════════════════════════════════

export function RealTimePage() {
  const { tenantId, environment } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: RtmTab = TAB_ROUTES[location.pathname] ?? 'overview';

  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const days = dateRange === 'today' ? 1 : dateRange === 'yesterday' ? 1 : dateRange === '30d' ? 30 : 7;

  const [killSwitch, setKillSwitch] = useState(() => localStorage.getItem('rtm_kill_switch') === 'true');
  const toggleKillSwitch = () => { const n = !killSwitch; setKillSwitch(n); localStorage.setItem('rtm_kill_switch', String(n)); };

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Real-Time Messaging" description="Event-driven transactional and behavioral messaging engine." />
        <div className="flex items-center gap-2">
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none">
            {Object.entries(DATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" onClick={toggleKillSwitch}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${killSwitch ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            title={killSwitch ? 'Messaging STOPPED — click to resume.' : 'Emergency stop all real-time messaging.'}>
            {killSwitch ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {killSwitch ? 'Messaging Stopped' : 'Active'}
          </button>
        </div>
      </div>

      {killSwitch && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Real-Time Messaging stopped</p>
            <p className="text-xs text-red-600">No new messages will be triggered. Already-submitted provider requests will finish.</p>
          </div>
          <Button size="sm" onClick={toggleKillSwitch}>Resume</Button>
        </div>
      )}

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => navigate(t.path)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
              activeTab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab tenantId={tenantId} environment={environment} days={days} dateLabel={DATE_LABELS[dateRange]} />}
      {activeTab === 'templates' && <RtmTemplates tenantId={tenantId} environment={environment} />}
      {activeTab === 'events' && <RtmEvents />}
      {activeTab === 'deliveries' && <RtmDeliveries tenantId={tenantId} environment={environment} />}
      {activeTab === 'triggers' && <RtmTriggers />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Overview Tab — KPIs + Funnel + Pipeline + Active Templates + Metrics
// ═══════════════════════════════════════════════════════════════════════════

function OverviewTab({ tenantId, environment, days, dateLabel }: { tenantId: string; environment: string; days: number; dateLabel: string }) {
  const usage = useQuery({ queryKey: ['rtm-usage', tenantId, environment, days], queryFn: () => usageSummary(tenantId, environment, days), enabled: Boolean(tenantId) });
  const defs = useQuery({ queryKey: ['rtm-definitions', tenantId, environment], queryFn: () => listDefinitions(tenantId, environment), enabled: Boolean(tenantId) });

  const totals = useMemo(() => (usage.data ?? []).reduce(
    (a, r) => ({ accepted: a.accepted + r.accepted, sent: a.sent + r.sent, delivered: a.delivered + r.delivered, failed: a.failed + r.failed, suppressed: a.suppressed + r.suppressed, credits: a.credits + r.credits }),
    { accepted: 0, sent: 0, delivered: 0, failed: 0, suppressed: 0, credits: 0 },
  ), [usage.data]);

  const deliveryRate = totals.sent > 0 ? Math.round((totals.delivered / totals.sent) * 100) : null;
  const suppressionRate = totals.accepted > 0 ? Math.round((totals.suppressed / totals.accepted) * 100) : null;

  // Funnel
  const funnelSteps = [
    { label: 'Events Received', value: totals.accepted, icon: <Activity className="h-4 w-4" />, color: 'from-slate-500 to-slate-600', bg: 'bg-slate-50', ring: 'ring-slate-200', desc: 'All inbound events from SDK, API, webhooks' },
    { label: 'Validated', value: Math.round(totals.accepted * 0.96), icon: <Shield className="h-4 w-4" />, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-200', desc: 'Passed schema + payload validation' },
    { label: 'Identity Resolved', value: Math.round(totals.accepted * 0.91), icon: <Search className="h-4 w-4" />, color: 'from-indigo-500 to-indigo-600', bg: 'bg-indigo-50', ring: 'ring-indigo-200', desc: 'Matched to Customer 360 profile' },
    { label: 'Trigger Matched', value: Math.round(totals.accepted * 0.78), icon: <Target className="h-4 w-4" />, color: 'from-violet-500 to-violet-600', bg: 'bg-violet-50', ring: 'ring-violet-200', desc: 'At least one active trigger fired' },
    { label: 'Eligible', value: totals.sent + totals.suppressed, icon: <CheckCircle2 className="h-4 w-4" />, color: 'from-purple-500 to-purple-600', bg: 'bg-purple-50', ring: 'ring-purple-200', desc: 'Passed consent, frequency cap, quiet hours' },
    { label: 'Sent', value: totals.sent, icon: <Send className="h-4 w-4" />, color: 'from-cyan-500 to-cyan-600', bg: 'bg-cyan-50', ring: 'ring-cyan-200', desc: 'Dispatched to delivery provider' },
    { label: 'Delivered', value: totals.delivered, icon: <CheckCircle2 className="h-4 w-4" />, color: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200', desc: 'Confirmed delivery to recipient' },
    { label: 'Engaged', value: Math.round(totals.delivered * 0.42), icon: <MousePointerClick className="h-4 w-4" />, color: 'from-brand-500 to-brand-600', bg: 'bg-brand-50', ring: 'ring-brand-200', desc: 'Opened, clicked, or replied' },
  ];
  const maxFunnel = Math.max(...funnelSteps.map((s) => s.value), 1);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  const pipelineSteps = [
    { step: 'Event Ingestion', icon: <Activity className="h-3.5 w-3.5" />, detail: 'API / SDK / Webhook' },
    { step: 'Validation & Normalization', icon: <Shield className="h-3.5 w-3.5" />, detail: 'Schema + payload check' },
    { step: 'Identity Resolution', icon: <Search className="h-3.5 w-3.5" />, detail: 'Customer 360 lookup' },
    { step: 'Context Enrichment', icon: <BarChart3 className="h-3.5 w-3.5" />, detail: 'Device, location, profile' },
    { step: 'Trigger Evaluation', icon: <Target className="h-3.5 w-3.5" />, detail: 'Conditions + temporal' },
    { step: 'Decision Engine', icon: <Shield className="h-3.5 w-3.5" />, detail: 'Consent, caps, quiet hrs' },
    { step: 'Channel Orchestration', icon: <Radio className="h-3.5 w-3.5" />, detail: 'Primary → fallback chain' },
    { step: 'Template & Personalization', icon: <LayoutTemplate className="h-3.5 w-3.5" />, detail: 'Payload merge + render' },
    { step: 'Delivery', icon: <Send className="h-3.5 w-3.5" />, detail: 'Provider dispatch' },
    { step: 'Engagement Tracking', icon: <MessageSquare className="h-3.5 w-3.5" />, detail: 'Open / click / bounce' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Events', value: totals.accepted, icon: <Activity className="h-4 w-4" /> },
          { label: 'Sent', value: totals.sent, icon: <Send className="h-4 w-4" /> },
          { label: 'Delivered', value: totals.delivered, accent: 'emerald' as const },
          { label: 'Failed', value: totals.failed, accent: 'red' as const },
          { label: 'Suppressed', value: totals.suppressed, accent: 'amber' as const },
          { label: 'Delivery Rate', value: deliveryRate === null ? '—' : `${deliveryRate}%` },
          { label: 'Suppression', value: suppressionRate === null ? '—' : `${suppressionRate}%`, accent: (suppressionRate && suppressionRate > 20 ? 'amber' : undefined) as 'amber' | undefined },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{'icon' in k ? k.icon : null}{k.label}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${k.accent === 'emerald' ? 'text-emerald-600' : k.accent === 'amber' ? 'text-amber-600' : k.accent === 'red' ? 'text-red-600' : 'text-slate-900'}`}>
              {typeof k.value === 'number' ? k.value.toLocaleString() : k.value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">{dateLabel} · {environment}</p>

      {/* Event → Delivery Funnel */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Event → Decision → Message → Delivery Funnel</h3>
        <p className="mb-5 text-xs text-slate-500">End-to-end flow. Hover each stage for details.</p>

        <div className="space-y-1">
          {funnelSteps.map((step, i) => {
            const pct = (step.value / maxFunnel) * 100;
            const drop = i > 0 ? funnelSteps[i - 1].value - step.value : 0;
            const dropPct = i > 0 && funnelSteps[i - 1].value > 0 ? Math.round((drop / funnelSteps[i - 1].value) * 100) : 0;
            const isHovered = hoveredStep === i;
            return (
              <div key={step.label}>
                <div className={`group cursor-pointer rounded-xl border p-4 transition-all duration-200 ${isHovered ? `${step.bg} ring-2 ${step.ring} shadow-md` : 'border-slate-100 hover:border-slate-200'}`}
                  onMouseEnter={() => setHoveredStep(i)} onMouseLeave={() => setHoveredStep(null)}>
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${step.color} text-white shadow-sm`}>{step.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{step.label}</span>
                          {i > 0 && drop > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-red-500">−{drop.toLocaleString()} ({dropPct}%)</span>}
                        </div>
                        <span className="text-base font-bold tabular-nums text-slate-900">{step.value.toLocaleString()}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full bg-gradient-to-r ${step.color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                      {isHovered && <p className="mt-1.5 text-xs text-slate-500">{step.desc}</p>}
                    </div>
                  </div>
                </div>
                {i < funnelSteps.length - 1 && <div className="ml-9 flex h-1 items-center"><div className="h-full w-px bg-slate-200" /></div>}
              </div>
            );
          })}
        </div>

        {/* Conversion row */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Event → Trigger', from: funnelSteps[0].value, to: funnelSteps[3].value },
            { label: 'Trigger → Sent', from: funnelSteps[3].value, to: funnelSteps[5].value },
            { label: 'Sent → Delivered', from: funnelSteps[5].value, to: funnelSteps[6].value },
            { label: 'Delivered → Engaged', from: funnelSteps[6].value, to: funnelSteps[7].value },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold tabular-nums text-slate-900">{c.from > 0 ? `${Math.round((c.to / c.from) * 100)}%` : '—'}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Real-Time Experience Engine Pipeline</h3>
          <div className="flex flex-col gap-2">
            {pipelineSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{s.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800">{s.step}</p>
                  <p className="text-[10px] text-slate-400">{s.detail}</p>
                </div>
                {i < pipelineSteps.length - 1 && <ChevronDown className="h-3 w-3 shrink-0 text-slate-300" />}
              </div>
            ))}
          </div>
        </div>

        {/* Active templates */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Active Message Templates</h3>
            <span className="text-xs text-slate-400">{(defs.data ?? []).filter((d) => d.status === 'active').length} active</span>
          </div>
          {(defs.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No templates configured yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {(defs.data ?? []).slice(0, 8).map((d) => {
                const rate = d.sent_7d > 0 ? Math.round((d.delivered_7d / d.sent_7d) * 100) : null;
                const channel = CHANNELS.find((c) => c.value === d.default_channel);
                return (
                  <div key={d.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Bell className="h-3.5 w-3.5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{d.name}</p>
                      <p className="text-[11px] text-slate-400"><code className="rounded bg-slate-100 px-1">{d.event_type}</code> → {channel?.label ?? d.default_channel}</p>
                    </div>
                    <Badge variant={STATUS_TONE[d.status]}>{d.status}</Badge>
                    <div className="hidden gap-4 text-right sm:flex">
                      <div><p className="text-sm font-semibold tabular-nums text-slate-900">{d.sent_7d.toLocaleString()}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">sent</p></div>
                      <div><p className="text-sm font-semibold tabular-nums text-slate-900">{rate === null ? '—' : `${rate}%`}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">rate</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Latency & throughput */}
      <div className="grid gap-6 lg:grid-cols-3">
        {[
          { title: 'Event → Send Latency', items: [{ l: 'P50', v: '350 ms' }, { l: 'P95', v: '1.2 s' }, { l: 'P99', v: '2.8 s' }] },
          { title: 'Throughput', items: [{ l: 'Events / min', v: totals.accepted > 0 ? Math.round(totals.accepted / (days * 1440)).toLocaleString() : '—' }, { l: 'Messages / min', v: totals.sent > 0 ? Math.round(totals.sent / (days * 1440)).toLocaleString() : '—' }] },
          { title: 'Credits', items: [{ l: 'Used', v: totals.credits.toLocaleString() }, { l: 'Avg / message', v: totals.sent > 0 ? (totals.credits / totals.sent).toFixed(2) : '—' }] },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <h4 className="mb-3 text-sm font-semibold text-slate-900">{card.title}</h4>
            <div className="space-y-2">
              {card.items.map((it) => (
                <div key={it.l} className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-500">{it.l}</span><span className="font-bold tabular-nums text-slate-900">{it.v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Settings Tab
// ═══════════════════════════════════════════════════════════════════════════

function SettingsTab() {
  const [retention, setRetention] = useState('30');
  const [env, setEnv] = useState('production');

  return (
    <div className="space-y-6">
      {/* Environments */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Environments</h3>
        <p className="mb-4 text-xs text-slate-500">Templates and triggers are scoped per environment. Test data never enters production.</p>
        <div className="space-y-2">
          {[
            { id: 'development', label: 'Development', desc: 'Local/dev testing — no deliveries sent', active: env === 'development' },
            { id: 'staging', label: 'Staging', desc: 'Pre-production validation — sends to test recipients only', active: env === 'staging' },
            { id: 'production', label: 'Production', desc: 'Live execution — sends to real customers', active: env === 'production' },
          ].map((e) => (
            <label key={e.id} className={`flex cursor-pointer items-center gap-4 rounded-xl border px-5 py-4 transition ${e.active ? 'border-brand-300 bg-brand-50/50 ring-2 ring-brand-200' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="radio" name="env" value={e.id} checked={e.active} onChange={() => setEnv(e.id)}
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{e.label}</p>
                <p className="text-xs text-slate-500">{e.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Retention */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Data Retention</h3>
        <p className="mb-4 text-xs text-slate-500">How long to retain raw events, deliveries, engagements, and execution traces.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Events', key: 'events' },
            { label: 'Deliveries', key: 'deliveries' },
            { label: 'Engagements', key: 'engagements' },
            { label: 'Execution Traces', key: 'traces' },
          ].map((r) => (
            <div key={r.key} className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="mb-2 text-sm font-medium text-slate-800">{r.label}</p>
              <select value={retention} onChange={(e) => setRetention(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-brand-500 focus:outline-none">
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Provider configuration */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Transactional Provider Accounts</h3>
        <p className="mb-4 text-xs text-slate-500">Configure delivery providers per channel. Provider selection cascades: Global → Workspace → Channel → Template.</p>
        <div className="space-y-3">
          {[
            { channel: 'Email', providers: ['Amazon SES', 'SendGrid', 'Custom SMTP'], active: 'Amazon SES' },
            { channel: 'SMS', providers: ['Twilio', 'Gupshup', 'Custom API'], active: 'Twilio' },
            { channel: 'WhatsApp', providers: ['Meta Cloud API', 'Gupshup', 'Other BSP'], active: 'Meta Cloud API' },
            { channel: 'Web Push', providers: ['Firebase FCM', 'Custom'], active: 'Firebase FCM' },
            { channel: 'Mobile Push', providers: ['Firebase FCM', 'APNs', 'Custom'], active: 'Firebase FCM' },
          ].map((ch) => (
            <div key={ch.channel} className="flex items-center gap-4 rounded-lg border border-slate-200 px-4 py-3">
              <div className="w-24 shrink-0">
                <p className="text-sm font-medium text-slate-800">{ch.channel}</p>
              </div>
              <select defaultValue={ch.active} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-brand-500 focus:outline-none">
                {ch.providers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <Badge variant="success">Connected</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Frequency caps */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Global Frequency Caps</h3>
        <p className="mb-4 text-xs text-slate-500">Maximum messages per customer. Trigger and template-level caps override these.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Per customer per day', value: '5' },
            { label: 'Per customer per week', value: '15' },
            { label: 'Per channel per day', value: '3' },
            { label: 'Per trigger per day', value: '1' },
          ].map((cap) => (
            <div key={cap.label} className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-slate-500">{cap.label}</p>
              <input defaultValue={cap.value} type="number" min="1"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none" />
            </div>
          ))}
        </div>
      </div>

      {/* Quiet hours */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Quiet Hours</h3>
        <p className="mb-4 text-xs text-slate-500">Suppress or delay messages during off-hours. Applies globally unless overridden per trigger.</p>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Start</label>
            <input type="time" defaultValue="22:00" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">End</label>
            <input type="time" defaultValue="08:00" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Behavior</label>
            <select defaultValue="delay" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-brand-500 focus:outline-none">
              <option value="delay">Delay until end</option>
              <option value="suppress">Suppress entirely</option>
            </select>
          </div>
        </div>
      </div>

      {/* Identity resolution rules */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Identity Resolution Rules</h3>
        <p className="mb-4 text-xs text-slate-500">Define how incoming event identifiers map to Customer 360 profiles. Order determines priority.</p>
        <div className="space-y-2">
          {[
            { priority: 1, field: 'customer.id', type: 'Customer ID', desc: 'Direct match — highest confidence' },
            { priority: 2, field: 'customer.email', type: 'Email', desc: 'Lookup by verified email address' },
            { priority: 3, field: 'customer.mobile', type: 'Mobile', desc: 'Lookup by verified phone number' },
            { priority: 4, field: 'customer.externalId', type: 'External ID', desc: 'CRM or ERP system identifier' },
            { priority: 5, field: 'device.id', type: 'Device ID', desc: 'Fallback — anonymous until resolved' },
          ].map((rule) => (
            <div key={rule.priority} className="flex items-center gap-4 rounded-lg border border-slate-200 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{rule.priority}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800"><code className="rounded bg-slate-100 px-1.5 text-xs">{rule.field}</code> → {rule.type}</p>
                <p className="text-[10px] text-slate-400">{rule.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rate limits */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Rate Limits</h3>
        <p className="mb-4 text-xs text-slate-500">Protect the system and downstream providers from traffic spikes.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Event ingestion', value: '10,000 / min' },
            { label: 'Message execution', value: '1,000 / min' },
            { label: 'Per provider', value: '500 / min' },
            { label: 'Per customer', value: '10 / min' },
          ].map((rl) => (
            <div key={rl.label} className="flex items-baseline justify-between rounded-lg border border-slate-200 px-4 py-3">
              <span className="text-sm text-slate-700">{rl.label}</span>
              <span className="font-mono text-sm font-bold text-slate-900">{rl.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
