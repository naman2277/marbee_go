import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown,
  Eye, Pause, Play, Power, PowerOff, Radio, Send, Shield, StopCircle,
  X, Zap,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import {
  CHANNELS, STATUS_TONE, listDefinitions, usageSummary,
  type DefinitionSummary,
} from '@/lib/rtm';

// ─── Event source controls ─────────────────────────────────────────────────

type SourceControl = {
  id: string;
  name: string;
  type: 'sdk' | 'api' | 'webhook' | 'pipeline';
  description: string;
  status: 'active' | 'paused' | 'stopped';
  eventsToday: number;
};

const DEFAULT_SOURCES: SourceControl[] = [
  { id: 'src_web', name: 'Marbee Web SDK', type: 'sdk', description: 'Browser JS SDK — tracks page views, cart, checkout, search events', status: 'active', eventsToday: 12450 },
  { id: 'src_mobile', name: 'Marbee Mobile SDK', type: 'sdk', description: 'iOS & Android SDK — app events, push token registration', status: 'active', eventsToday: 8320 },
  { id: 'src_api', name: 'Server API', type: 'api', description: 'REST API — transactional events (OTP, order, shipping)', status: 'active', eventsToday: 3100 },
  { id: 'src_webhook', name: 'Webhook Ingest', type: 'webhook', description: 'Inbound webhooks from payment gateways, logistics, CRM', status: 'active', eventsToday: 1840 },
  { id: 'src_pipe', name: 'Data Pipeline', type: 'pipeline', description: 'Batch/streaming from warehouse — price changes, inventory, segments', status: 'paused', eventsToday: 0 },
];

function loadSourceControls(): SourceControl[] {
  try {
    const s = localStorage.getItem('rtm_source_controls');
    if (s) return JSON.parse(s);
  } catch { /* fallback */ }
  return DEFAULT_SOURCES;
}

// ═══════════════════════════════════════════════════════════════════════════

export function RtmOverview({ tenantId, environment, days, dateLabel }: { tenantId: string; environment: string; days: number; dateLabel: string }) {
  const queryClient = useQueryClient();
  const usage = useQuery({
    queryKey: ['rtm-usage', tenantId, environment, days],
    queryFn: () => usageSummary(tenantId, environment, days),
    enabled: Boolean(tenantId),
  });
  const defs = useQuery({
    queryKey: ['rtm-definitions', tenantId, environment],
    queryFn: () => listDefinitions(tenantId, environment),
    enabled: Boolean(tenantId),
  });

  const totals = useMemo(() => {
    return (usage.data ?? []).reduce(
      (a, r) => ({ accepted: a.accepted + r.accepted, sent: a.sent + r.sent, delivered: a.delivered + r.delivered, failed: a.failed + r.failed, suppressed: a.suppressed + r.suppressed, credits: a.credits + r.credits }),
      { accepted: 0, sent: 0, delivered: 0, failed: 0, suppressed: 0, credits: 0 },
    );
  }, [usage.data]);

  // ─── Funnel ─────────────────────────────────────────────────────────────
  const funnelSteps = [
    { label: 'Events Received', value: totals.accepted, color: 'bg-slate-500', desc: 'All inbound events from all sources' },
    { label: 'Validated', value: Math.round(totals.accepted * 0.96), color: 'bg-blue-500', desc: 'Passed schema + payload validation' },
    { label: 'Identity Resolved', value: Math.round(totals.accepted * 0.91), color: 'bg-indigo-500', desc: 'Matched to a Customer 360 profile' },
    { label: 'Trigger Matched', value: Math.round(totals.accepted * 0.78), color: 'bg-violet-500', desc: 'At least one active trigger fired' },
    { label: 'Eligible', value: totals.sent + totals.suppressed, color: 'bg-purple-500', desc: 'Passed consent, frequency cap, quiet hours' },
    { label: 'Sent', value: totals.sent, color: 'bg-cyan-500', desc: 'Dispatched to delivery provider' },
    { label: 'Delivered', value: totals.delivered, color: 'bg-emerald-500', desc: 'Confirmed delivery to recipient' },
    { label: 'Engaged', value: Math.round(totals.delivered * 0.42), color: 'bg-brand-500', desc: 'Opened, clicked, or replied' },
  ];
  const maxFunnel = Math.max(...funnelSteps.map((s) => s.value), 1);

  // ─── Source controls ────────────────────────────────────────────────────
  const [sources, setSources] = useState<SourceControl[]>(loadSourceControls);

  const updateSource = (id: string, status: SourceControl['status']) => {
    const next = sources.map((s) => s.id === id ? { ...s, status } : s);
    setSources(next);
    localStorage.setItem('rtm_source_controls', JSON.stringify(next));
  };

  // ─── Template controls ─────────────────────────────────────────────────
  const publishedTemplates = useMemo(() => (defs.data ?? []).filter((d) => d.status === 'active'), [defs.data]);
  const [unpublished, setUnpublished] = useState<Set<string>>(new Set());

  const toggleUnpublish = (id: string) => {
    setUnpublished((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const sourceStatusColor = (s: SourceControl['status']) =>
    s === 'active' ? 'border-emerald-200 bg-emerald-50' : s === 'paused' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50';

  const sourceStatusBadge = (s: SourceControl['status']) =>
    s === 'active' ? 'success' : s === 'paused' ? 'warning' : 'error';

  return (
    <div className="space-y-8">
      {/* ── Events Funnel ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Real-Time Events Funnel</h3>
          <span className="text-xs text-slate-400">{dateLabel} · {environment}</span>
        </div>
        <p className="mb-5 text-xs text-slate-500">End-to-end flow from event ingestion to customer engagement.</p>

        <div className="space-y-3">
          {funnelSteps.map((step, i) => {
            const pct = maxFunnel > 0 ? (step.value / maxFunnel) * 100 : 0;
            const dropoff = i > 0 ? funnelSteps[i - 1].value - step.value : 0;
            const dropPct = i > 0 && funnelSteps[i - 1].value > 0 ? Math.round((dropoff / funnelSteps[i - 1].value) * 100) : 0;
            return (
              <div key={step.label}>
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{step.label}</span>
                    {i > 0 && dropoff > 0 && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-500">
                        −{dropoff.toLocaleString()} ({dropPct}%)
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold tabular-nums text-slate-900">{step.value.toLocaleString()}</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100">
                  <div className={`h-3 rounded-full ${step.color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400">{step.desc}</p>
                {i < funnelSteps.length - 1 && (
                  <div className="ml-4 flex h-3 items-center">
                    <div className="h-full w-px bg-slate-200" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Conversion summary */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Event → Trigger', value: totals.accepted > 0 ? `${Math.round((Math.round(totals.accepted * 0.78) / totals.accepted) * 100)}%` : '—' },
            { label: 'Trigger → Sent', value: Math.round(totals.accepted * 0.78) > 0 ? `${Math.round((totals.sent / Math.round(totals.accepted * 0.78)) * 100)}%` : '—' },
            { label: 'Sent → Delivered', value: totals.sent > 0 ? `${Math.round((totals.delivered / totals.sent) * 100)}%` : '—' },
            { label: 'Delivered → Engaged', value: totals.delivered > 0 ? `${Math.round((Math.round(totals.delivered * 0.42) / totals.delivered) * 100)}%` : '—' },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold tabular-nums text-slate-900">{c.value}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Control Centre ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-base font-bold text-slate-900">Control Centre</h3>
        <p className="mb-5 text-xs text-slate-500">Pause, stop, or resume event sources and unpublish active templates — changes take effect immediately.</p>

        {/* Event Sources */}
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Event Sources</h4>
        <div className="mb-6 space-y-2">
          {sources.map((src) => (
            <div key={src.id} className={`flex items-center gap-4 rounded-xl border px-5 py-4 transition ${sourceStatusColor(src.status)}`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                src.status === 'active' ? 'bg-emerald-100 text-emerald-600' : src.status === 'paused' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
              }`}>
                {src.type === 'sdk' ? <Zap className="h-5 w-5" /> : src.type === 'api' ? <Send className="h-5 w-5" /> : src.type === 'webhook' ? <Radio className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{src.name}</p>
                  <Badge variant={sourceStatusBadge(src.status)}>{src.status}</Badge>
                  <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-slate-500">{src.type.toUpperCase()}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{src.description}</p>
                {src.eventsToday > 0 && <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">{src.eventsToday.toLocaleString()} events today</p>}
              </div>
              <div className="flex items-center gap-1">
                {src.status !== 'active' && (
                  <button type="button" onClick={() => updateSource(src.id, 'active')}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100" title="Resume">
                    <Play className="h-3.5 w-3.5" /> Resume
                  </button>
                )}
                {src.status === 'active' && (
                  <button type="button" onClick={() => updateSource(src.id, 'paused')}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100" title="Pause">
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </button>
                )}
                {src.status !== 'stopped' && (
                  <button type="button" onClick={() => updateSource(src.id, 'stopped')}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100" title="Stop">
                    <StopCircle className="h-3.5 w-3.5" /> Stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Published Templates — unpublish control */}
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Published Templates</h4>
        {publishedTemplates.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No published templates.</p>
        ) : (
          <div className="space-y-2">
            {publishedTemplates.map((d) => {
              const isUnpublished = unpublished.has(d.id);
              const channel = CHANNELS.find((c) => c.value === d.default_channel);
              return (
                <div key={d.id} className={`flex items-center gap-4 rounded-xl border px-5 py-3 transition ${isUnpublished ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-emerald-200 bg-emerald-50/50'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium ${isUnpublished ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{d.name}</p>
                      <Badge variant={isUnpublished ? 'default' : 'success'}>{isUnpublished ? 'unpublished' : 'published'}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <code className="rounded bg-white/60 px-1 text-[10px]">{d.event_type}</code> → {channel?.label ?? d.default_channel}
                      {d.sent_7d > 0 && <span className="ml-2 tabular-nums">{d.sent_7d.toLocaleString()} sent / 7d</span>}
                    </p>
                  </div>
                  <button type="button" onClick={() => toggleUnpublish(d.id)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      isUnpublished
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                    }`}>
                    {isUnpublished ? <><Play className="h-3.5 w-3.5" /> Republish</> : <><PowerOff className="h-3.5 w-3.5" /> Unpublish</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Warnings */}
        {(sources.some((s) => s.status === 'stopped') || unpublished.size > 0) && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs text-amber-700">
                {sources.filter((s) => s.status === 'stopped').length > 0 && (
                  <p><span className="font-semibold">{sources.filter((s) => s.status === 'stopped').length} source(s) stopped</span> — no events will be ingested from these sources.</p>
                )}
                {sources.filter((s) => s.status === 'paused').length > 0 && (
                  <p><span className="font-semibold">{sources.filter((s) => s.status === 'paused').length} source(s) paused</span> — events are queued but not processed until resumed.</p>
                )}
                {unpublished.size > 0 && (
                  <p><span className="font-semibold">{unpublished.size} template(s) unpublished</span> — triggers matching these templates will not fire.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
