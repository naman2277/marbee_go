import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, 
  Globe, Link2, Mail, MousePointerClick,
  Radio, Search, Send, X, XCircle,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import {
  CHANNELS, type Channel, type DeliveryStatus, DELIVERY_STATUSES,
  maskPii, getLiveEventsStore, subscribeRealTimeEvents,
} from '@/lib/rtm';

// ─── Demo data ──────────────────────────────────────────────────────────────

type DeliveryRecord = {
  id: string;
  templateId: string;
  templateName: string;
  channel: Channel;
  destination: string;
  destinationMasked: string;
  customerId: string;
  status: DeliveryStatus;
  provider: string;
  providerMessageId: string | null;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  bounceType: 'hard' | 'soft' | null;
  correlationId: string;
  triggerName: string | null;
  eventName: string;
};

type EngagementRecord = {
  id: string;
  deliveryId: string;
  type: 'open' | 'click' | 'bounce' | 'unsubscribe' | 'complaint';
  timestamp: string;
  customerId: string;
  channel: Channel;
  templateName: string;
  link?: string;
  linkLabel?: string;
  userAgent?: string;
  ip?: string;
  bounceType?: 'hard' | 'soft';
  bounceReason?: string;
};

function getDeliveriesFromStore(): DeliveryRecord[] {
  return getLiveEventsStore()
    .filter((e) => e.activation && e.activation.deliveryId)
    .map((e) => ({
      id: e.activation.deliveryId!,
      templateId: e.activation.templateId || 'TPL_LIVE',
      templateName: e.activation.templateName || e.event.name,
      channel: e.activation.channel.resolved || 'email',
      destination: e.activation.destination.masked || e.identity.identifiers.email || e.identity.identifiers.mobile || 'masked@example.com',
      destinationMasked: e.activation.destination.masked || maskPii(e.identity.identifiers.email || 'masked@example.com', 'email'),
      customerId: e.identity.customerId || 'C_LIVE',
      status: (e.decision.status === 'eligible' || e.decision.decision === 'send' ? 'delivered' : 'failed') as DeliveryStatus,
      provider: 'ses',
      providerMessageId: `pmsg_${e.activation.deliveryId}`,
      sentAt: e.activation.triggeredAt || e.event.receivedAt,
      deliveredAt: e.activation.triggeredAt || e.event.receivedAt,
      openedAt: null,
      clickedAt: null,
      bouncedAt: null,
      bounceType: null,
      correlationId: e.correlationId,
      triggerName: e.decision.triggerName || null,
      eventName: e.event.name,
    }));
}

function genEngagements(deliveries: DeliveryRecord[]): EngagementRecord[] {
  const records: EngagementRecord[] = [];
  for (const d of deliveries) {
    if (d.openedAt) records.push({ id: `ENG_${crypto.randomUUID().slice(0, 6)}`, deliveryId: d.id, type: 'open', timestamp: d.openedAt, customerId: d.customerId, channel: d.channel, templateName: d.templateName, userAgent: 'Mozilla/5.0 (Linux; Android 15)' });
    if (d.bouncedAt) records.push({ id: `ENG_${crypto.randomUUID().slice(0, 6)}`, deliveryId: d.id, type: 'bounce', timestamp: d.bouncedAt, customerId: d.customerId, channel: d.channel, templateName: d.templateName, bounceType: d.bounceType!, bounceReason: d.bounceType === 'hard' ? 'Mailbox does not exist' : 'Mailbox full' });
  }
  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── Subtabs ────────────────────────────────────────────────────────────────

type SubTab = 'log' | 'engagement' | 'reporting';

export function RtmDeliveries({  }: { tenantId: string; environment: string }) {
  const [subTab, setSubTab] = useState<SubTab>('log');
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>(() => getDeliveriesFromStore());

  useEffect(() => {
    const unsub = subscribeRealTimeEvents(() => {
      setDeliveries(getDeliveriesFromStore());
    });
    return unsub;
  }, []);

  const engagements = useMemo(() => genEngagements(deliveries), [deliveries]);

  return (
    <div>
      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1">
        {([
          { key: 'log' as const, label: 'Delivery Log' },
          { key: 'engagement' as const, label: 'Engagement Logs' },
          { key: 'reporting' as const, label: 'Reporting' },
        ]).map((t) => (
          <button key={t.key} type="button" onClick={() => setSubTab(t.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${subTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t.label}</button>
        ))}
      </div>

      {subTab === 'log' && <DeliveryLog deliveries={deliveries} />}
      {subTab === 'engagement' && <EngagementLog engagements={engagements} />}
      {subTab === 'reporting' && <Reporting deliveries={deliveries} engagements={engagements} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Delivery Log — template-grouped with drill-down
// ═══════════════════════════════════════════════════════════════════════════

function DeliveryLog({ deliveries }: { deliveries: DeliveryRecord[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    let r = deliveries;
    if (search) { const q = search.toLowerCase(); r = r.filter((d) => d.templateName.toLowerCase().includes(q) || d.customerId.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)); }
    if (statusFilter) r = r.filter((d) => d.status === statusFilter);
    if (channelFilter) r = r.filter((d) => d.channel === channelFilter);
    return r;
  }, [deliveries, search, statusFilter, channelFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; channel: Channel; records: DeliveryRecord[] }>();
    for (const d of filtered) {
      let g = map.get(d.templateId);
      if (!g) { g = { name: d.templateName, channel: d.channel, records: [] }; map.set(d.templateId, g); }
      g.records.push(d);
    }
    return [...map.entries()].sort((a, b) => b[1].records.length - a[1].records.length);
  }, [filtered]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search template, customer, delivery ID…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All statuses</option>
          {DELIVERY_STATUSES.filter((s) => s.value !== 'not_applicable').map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <select value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All channels</option>
          {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
      </div>

      <p className="mb-2 text-xs text-slate-400">{filtered.length.toLocaleString()} deliveries across {grouped.length} templates</p>

      <div className="space-y-2">
        {grouped.map(([tplId, group]) => {
          const isExpanded = expandedTemplate === tplId;
          const stats = { delivered: 0, sent: 0, failed: 0, bounced: 0 };
          for (const r of group.records) { if (r.status in stats) stats[r.status as keyof typeof stats]++; }
          const drillRecords = isExpanded ? group.records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];
          const drillPages = Math.ceil(group.records.length / PAGE_SIZE);

          return (
            <div key={tplId} className="rounded-xl border border-slate-200 bg-white">
              <button type="button" onClick={() => { setExpandedTemplate(isExpanded ? null : tplId); setPage(0); }}
                className="flex w-full items-center gap-4 px-5 py-4 text-left">
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Send className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{group.name}</p>
                  <p className="text-xs text-slate-500">{CHANNELS.find((c) => c.value === group.channel)?.label} · {group.records.length} deliveries</p>
                </div>
                <div className="flex gap-4 text-right">
                  <Stat label="Delivered" value={stats.delivered} color="text-emerald-600" />
                  <Stat label="Sent" value={stats.sent} color="text-blue-600" />
                  <Stat label="Failed" value={stats.failed} color="text-red-600" />
                  <Stat label="Bounced" value={stats.bounced} color="text-amber-600" />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Delivery ID</th>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Customer</th>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Destination</th>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Status</th>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Provider</th>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Sent</th>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Delivered</th>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Opened</th>
                          <th className="px-4 py-2 text-left text-xs text-slate-500">Clicked</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {drillRecords.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-mono text-[10px] text-brand-600">{r.id}</td>
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.customerId}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{r.destinationMasked}</td>
                            <td className="px-4 py-2"><Badge variant={r.status === 'delivered' ? 'success' : r.status === 'sent' ? 'success' : r.status === 'bounced' ? 'warning' : r.status === 'failed' ? 'error' : 'default'}>{r.status}</Badge></td>
                            <td className="px-4 py-2 text-xs text-slate-500">{r.provider}</td>
                            <td className="px-4 py-2 text-xs tabular-nums text-slate-500">{new Date(r.sentAt).toLocaleTimeString()}</td>
                            <td className="px-4 py-2 text-xs tabular-nums text-slate-500">{r.deliveredAt ? new Date(r.deliveredAt).toLocaleTimeString() : '—'}</td>
                            <td className="px-4 py-2 text-xs text-slate-400">{r.openedAt ? '✓' : '—'}</td>
                            <td className="px-4 py-2 text-xs text-slate-400">{r.clickedAt ? '✓' : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {drillPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
                      <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
                      <span className="text-xs text-slate-500">Page {page + 1} / {drillPages}</span>
                      <Button variant="secondary" size="sm" disabled={page >= drillPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Engagement Log
// ═══════════════════════════════════════════════════════════════════════════

function EngagementLog({ engagements }: { engagements: EngagementRecord[] }) {
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    let r = engagements;
    if (typeFilter) r = r.filter((e) => e.type === typeFilter);
    if (search) { const q = search.toLowerCase(); r = r.filter((e) => e.customerId.toLowerCase().includes(q) || e.templateName.toLowerCase().includes(q) || (e.link ?? '').includes(q)); }
    return r;
  }, [engagements, typeFilter, search]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const typeIcon = (t: string) => {
    switch (t) {
      case 'open': return <Mail className="h-3.5 w-3.5 text-blue-500" />;
      case 'click': return <MousePointerClick className="h-3.5 w-3.5 text-emerald-500" />;
      case 'bounce': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case 'unsubscribe': return <X className="h-3.5 w-3.5 text-amber-500" />;
      default: return <Radio className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search customer, template, link…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All types</option>
          {['open', 'click', 'bounce', 'unsubscribe', 'complaint'].map((t) => <option key={t} value={t}>{t}</option>)}</select>
      </div>

      <p className="mb-2 text-xs text-slate-400">{filtered.length.toLocaleString()} engagement events</p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs text-slate-500">Type</th>
                <th className="px-4 py-2.5 text-left text-xs text-slate-500">Time</th>
                <th className="px-4 py-2.5 text-left text-xs text-slate-500">Customer</th>
                <th className="px-4 py-2.5 text-left text-xs text-slate-500">Channel</th>
                <th className="px-4 py-2.5 text-left text-xs text-slate-500">Template</th>
                <th className="px-4 py-2.5 text-left text-xs text-slate-500">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paged.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2"><span className="inline-flex items-center gap-1.5">{typeIcon(e.type)} <span className="text-xs capitalize text-slate-700">{e.type}</span></span></td>
                  <td className="px-4 py-2 text-xs tabular-nums text-slate-500">{new Date(e.timestamp).toLocaleTimeString()}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{e.customerId}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{CHANNELS.find((c) => c.value === e.channel)?.label ?? e.channel}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{e.templateName}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {e.type === 'click' && e.link ? <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> {e.linkLabel ?? e.link}</span> : null}
                    {e.type === 'bounce' ? <span>{e.bounceType} — {e.bounceReason}</span> : null}
                    {e.type === 'open' && e.userAgent ? <span className="truncate">{e.userAgent.slice(0, 40)}…</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Reporting
// ═══════════════════════════════════════════════════════════════════════════

function Reporting({ deliveries, engagements }: { deliveries: DeliveryRecord[]; engagements: EngagementRecord[] }) {
  const stats = useMemo(() => {
    const total = deliveries.length;
    const delivered = deliveries.filter((d) => d.status === 'delivered').length;
    const failed = deliveries.filter((d) => d.status === 'failed').length;
    const bounced = deliveries.filter((d) => d.status === 'bounced').length;
    const opens = engagements.filter((e) => e.type === 'open').length;
    const clicks = engagements.filter((e) => e.type === 'click').length;
    const unsubs = engagements.filter((e) => e.type === 'unsubscribe').length;
    const hardBounces = engagements.filter((e) => e.type === 'bounce' && e.bounceType === 'hard').length;
    const softBounces = engagements.filter((e) => e.type === 'bounce' && e.bounceType === 'soft').length;
    return { total, delivered, failed, bounced, opens, clicks, unsubs, hardBounces, softBounces,
      deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
      openRate: delivered > 0 ? Math.round((opens / delivered) * 100) : 0,
      clickRate: delivered > 0 ? Math.round((clicks / delivered) * 100) : 0,
      bounceRate: total > 0 ? Math.round((bounced / total) * 100) : 0,
    };
  }, [deliveries, engagements]);

  // Channel breakdown
  const channelBreakdown = useMemo(() => {
    const map = new Map<string, { sent: number; delivered: number; failed: number; bounced: number }>();
    for (const d of deliveries) {
      let ch = map.get(d.channel);
      if (!ch) { ch = { sent: 0, delivered: 0, failed: 0, bounced: 0 }; map.set(d.channel, ch); }
      ch.sent++;
      if (d.status === 'delivered') ch.delivered++;
      if (d.status === 'failed') ch.failed++;
      if (d.status === 'bounced') ch.bounced++;
    }
    return [...map.entries()].sort((a, b) => b[1].sent - a[1].sent);
  }, [deliveries]);

  // Template leaderboard
  const templateBoard = useMemo(() => {
    const map = new Map<string, { name: string; channel: Channel; sent: number; delivered: number; opens: number; clicks: number }>();
    for (const d of deliveries) {
      let t = map.get(d.templateId);
      if (!t) { t = { name: d.templateName, channel: d.channel, sent: 0, delivered: 0, opens: 0, clicks: 0 }; map.set(d.templateId, t); }
      t.sent++;
      if (d.status === 'delivered') t.delivered++;
      if (d.openedAt) t.opens++;
      if (d.clickedAt) t.clicks++;
    }
    return [...map.values()].sort((a, b) => b.sent - a.sent);
  }, [deliveries]);

  // Hot clicks
  const hotClicks = useMemo(() => {
    const map = new Map<string, { link: string; label: string; count: number }>();
    for (const e of engagements) {
      if (e.type === 'click' && e.link) {
        let c = map.get(e.link);
        if (!c) { c = { link: e.link, label: e.linkLabel ?? e.link, count: 0 }; map.set(e.link, c); }
        c.count++;
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [engagements]);

  // Domain analysis (for email)
  const domainAnalysis = useMemo(() => {
    const map = new Map<string, { sent: number; delivered: number; bounced: number }>();
    for (const d of deliveries.filter((d) => d.channel === 'email')) {
      const domain = d.destination.split('@')[1] ?? 'unknown';
      let dm = map.get(domain);
      if (!dm) { dm = { sent: 0, delivered: 0, bounced: 0 }; map.set(domain, dm); }
      dm.sent++;
      if (d.status === 'delivered') dm.delivered++;
      if (d.status === 'bounced') dm.bounced++;
    }
    return [...map.entries()].sort((a, b) => b[1].sent - a[1].sent).slice(0, 10);
  }, [deliveries]);

  // Suppression funnel
  const suppressionFunnel = [
    { label: 'Events Received', value: stats.total + 40, color: 'bg-slate-500' },
    { label: 'Identity Resolved', value: stats.total + 35, color: 'bg-blue-500' },
    { label: 'Trigger Matched', value: stats.total + 20, color: 'bg-indigo-500' },
    { label: 'Passed Consent', value: stats.total + 10, color: 'bg-violet-500' },
    { label: 'Passed Frequency Cap', value: stats.total, color: 'bg-purple-500' },
    { label: 'Sent', value: stats.total - stats.failed, color: 'bg-emerald-500' },
    { label: 'Delivered', value: stats.delivered, color: 'bg-brand-500' },
  ];
  const maxFunnel = Math.max(...suppressionFunnel.map((s) => s.value), 1);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Total Sent', value: stats.total },
          { label: 'Delivered', value: stats.delivered, accent: 'emerald' },
          { label: 'Failed', value: stats.failed, accent: 'red' },
          { label: 'Bounced', value: stats.bounced, accent: 'amber' },
          { label: 'Delivery Rate', value: `${stats.deliveryRate}%` },
          { label: 'Open Rate', value: `${stats.openRate}%` },
          { label: 'Click Rate', value: `${stats.clickRate}%` },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${k.accent === 'emerald' ? 'text-emerald-600' : k.accent === 'red' ? 'text-red-600' : k.accent === 'amber' ? 'text-amber-600' : 'text-slate-900'}`}>
              {typeof k.value === 'number' ? k.value.toLocaleString() : k.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Channel comparison */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Channel Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>
                <th className="px-3 py-2 text-left text-xs text-slate-500">Channel</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Sent</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Delivered</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Failed</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Rate</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {channelBreakdown.map(([ch, s]) => (
                  <tr key={ch}>
                    <td className="px-3 py-2 text-slate-700">{CHANNELS.find((c) => c.value === ch)?.label ?? ch}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{s.sent}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{s.delivered}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">{s.failed}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{s.sent > 0 ? Math.round((s.delivered / s.sent) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Suppression funnel */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Suppression Funnel</h3>
          <div className="space-y-2.5">
            {suppressionFunnel.map((s) => (
              <div key={s.label}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-slate-700">{s.label}</span>
                  <span className="text-xs font-bold tabular-nums text-slate-900">{s.value.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${s.color} transition-all`} style={{ width: `${(s.value / maxFunnel) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Template leaderboard */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Template Leaderboard</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>
                <th className="px-3 py-2 text-left text-xs text-slate-500">Template</th>
                <th className="px-3 py-2 text-left text-xs text-slate-500">Channel</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Sent</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Del. Rate</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Open Rate</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">CTR</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {templateBoard.map((t) => (
                  <tr key={t.name}>
                    <td className="px-3 py-2 font-medium text-slate-700">{t.name}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{CHANNELS.find((c) => c.value === t.channel)?.label ?? t.channel}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{t.sent}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">{t.sent > 0 ? Math.round((t.delivered / t.sent) * 100) : 0}%</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">{t.delivered > 0 ? Math.round((t.opens / t.delivered) * 100) : 0}%</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">{t.delivered > 0 ? Math.round((t.clicks / t.delivered) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hot clicks */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Hot Clicks</h3>
          {hotClicks.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No click data yet.</p>
          ) : (
            <div className="space-y-2">
              {hotClicks.map((c, _i) => {
                const maxC = hotClicks[0].count;
                return (
                  <div key={c.link}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-700"><MousePointerClick className="h-3 w-3 text-brand-500" /> {c.label}</span>
                      <span className="text-xs font-bold tabular-nums text-slate-900">{c.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${(c.count / maxC) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Domain analysis */}
      {domainAnalysis.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Domain Analysis (Email)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>
                <th className="px-3 py-2 text-left text-xs text-slate-500">Domain</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Sent</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Delivered</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Bounced</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">Delivery %</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {domainAnalysis.map(([domain, s]) => (
                  <tr key={domain}>
                    <td className="px-3 py-2 font-medium text-slate-700"><span className="inline-flex items-center gap-1"><Globe className="h-3 w-3 text-slate-400" /> {domain}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{s.sent}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{s.delivered}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-600">{s.bounced}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{s.sent > 0 ? Math.round((s.delivered / s.sent) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bounce analysis */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Bounce Analysis</h3>
          <div className="space-y-3">
            {[
              { label: 'Hard Bounces', value: stats.hardBounces, desc: 'Permanent delivery failure (invalid address)', color: 'text-red-600' },
              { label: 'Soft Bounces', value: stats.softBounces, desc: 'Temporary delivery failure (mailbox full)', color: 'text-amber-600' },
              { label: 'Bounce Rate', value: `${stats.bounceRate}%`, desc: 'Overall bounce percentage', color: stats.bounceRate > 5 ? 'text-red-600' : 'text-slate-900' },
            ].map((b) => (
              <div key={b.label} className="flex items-baseline justify-between rounded-lg border border-slate-100 px-4 py-3">
                <div><p className="text-sm font-medium text-slate-800">{b.label}</p><p className="text-[10px] text-slate-400">{b.desc}</p></div>
                <p className={`text-lg font-bold tabular-nums ${b.color}`}>{typeof b.value === 'number' ? b.value.toLocaleString() : b.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Throughput</h3>
          <div className="space-y-3">
            {[
              { label: 'Deliveries / hour', value: Math.round(stats.total / 24), desc: 'Average across the period' },
              { label: 'Avg latency', value: '2.4 s', desc: 'Send → Delivered' },
              { label: 'P95 latency', value: '5.8 s', desc: '95th percentile' },
            ].map((m) => (
              <div key={m.label} className="flex items-baseline justify-between rounded-lg border border-slate-100 px-4 py-3">
                <div><p className="text-sm font-medium text-slate-800">{m.label}</p><p className="text-[10px] text-slate-400">{m.desc}</p></div>
                <p className="text-lg font-bold tabular-nums text-slate-900">{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="hidden sm:block">
      <p className={`text-sm font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
