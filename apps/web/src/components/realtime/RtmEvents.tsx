import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  Copy, Eye, Globe, Mail, MessageSquare,
  Phone, Play, Search, Settings, Smartphone, X, Zap,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import {
  type DecisionStatus, 
  type RtmEvent, type RtmEventIdentity,
  CHANNELS, DECISION_STATUSES, EVENT_SOURCES, 
  SUPPRESSION_REASONS, maskPii, getLiveEventsStore, subscribeRealTimeEvents,
} from '@/lib/rtm';

// ─── Sortable hook ──────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null;
type SortState = { field: string; dir: SortDir };

function useSortable(defaultField: string, defaultDir: SortDir = 'desc') {
  const [sort, setSort] = useState<SortState>({ field: defaultField, dir: defaultDir });
  const toggle = useCallback((field: string) => {
    setSort((prev) => {
      if (prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return { field: defaultField, dir: defaultDir };
    });
  }, [defaultField, defaultDir]);
  return { sort, toggle };
}

// ─── Configurable columns ───────────────────────────────────────────────────

type ColumnKey = 'eventName' | 'eventId' | 'customer' | 'identity' | 'identityCheck' | 'source' | 'eventChannel' | 'activationChannel' | 'timestamp' | 'receivedAt' | 'commsTriggeredAt' | 'processing' | 'trigger' | 'decision' | 'template' | 'delivery' | 'provider' | 'destination' | 'device' | 'location' | 'environment' | 'correlationId' | 'status' | 'actions';

type ColumnDef = { key: ColumnKey; label: string; defaultOn: boolean; sortable: boolean; width?: string };

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'eventName', label: 'Event', defaultOn: true, sortable: true },
  { key: 'eventId', label: 'Event ID', defaultOn: false, sortable: false },
  { key: 'customer', label: 'Customer', defaultOn: true, sortable: true },
  { key: 'identity', label: 'Identity', defaultOn: false, sortable: false },
  { key: 'identityCheck', label: 'Identity Resolution (Upsert)', defaultOn: true, sortable: true },
  { key: 'source', label: 'Source', defaultOn: true, sortable: true },
  { key: 'eventChannel', label: 'Event Channel', defaultOn: false, sortable: true },
  { key: 'activationChannel', label: 'Activation Channel', defaultOn: true, sortable: true },
  { key: 'timestamp', label: 'Occurred At', defaultOn: false, sortable: true },
  { key: 'receivedAt', label: 'Received At', defaultOn: true, sortable: true },
  { key: 'commsTriggeredAt', label: 'Comms Triggered', defaultOn: true, sortable: true },
  { key: 'processing', label: 'Processing', defaultOn: true, sortable: true, width: 'w-20' },
  { key: 'decision', label: 'Decision', defaultOn: true, sortable: true },
  { key: 'trigger', label: 'Trigger', defaultOn: true, sortable: false },
  { key: 'template', label: 'Template', defaultOn: true, sortable: false },
  { key: 'delivery', label: 'Delivery', defaultOn: true, sortable: false },
  { key: 'provider', label: 'Provider', defaultOn: false, sortable: false },
  { key: 'destination', label: 'Destination', defaultOn: false, sortable: false },
  { key: 'device', label: 'Device', defaultOn: false, sortable: false },
  { key: 'location', label: 'Location', defaultOn: false, sortable: false },
  { key: 'status', label: 'Status', defaultOn: true, sortable: true },
  { key: 'correlationId', label: 'Correlation ID', defaultOn: false, sortable: false },
  { key: 'actions', label: 'Actions', defaultOn: true, sortable: false, width: 'w-20' },
];

function loadColumnPrefs(): Set<ColumnKey> {
  try {
    const s = localStorage.getItem('rtm_event_columns');
    if (s) return new Set(JSON.parse(s));
  } catch { /* fallback */ }
  return new Set(ALL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key));
}

// ─── Decision badge ─────────────────────────────────────────────────────────

function decisionBadge(d: DecisionStatus) {
  const map: Record<DecisionStatus, { v: 'success' | 'warning' | 'error' | 'default'; l: string }> = {
    eligible: { v: 'success', l: 'Eligible' },
    trigger_matched: { v: 'success', l: 'Matched' },
    suppressed: { v: 'warning', l: 'Suppressed' },
    no_trigger: { v: 'default', l: 'No Action' },
    skipped: { v: 'default', l: 'Skipped' },
    expired: { v: 'error', l: 'Expired' },
  };
  const m = map[d] ?? { v: 'default' as const, l: d };
  return <Badge variant={m.v}>{m.l}</Badge>;
}


// ═══════════════════════════════════════════════════════════════════════════
// RtmEvents — main component
// ═══════════════════════════════════════════════════════════════════════════

export function RtmEvents() {
  const [events, setEvents] = useState<RtmEvent[]>(() => getLiveEventsStore());
  const [lastLiveId, setLastLiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<RtmEvent | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(loadColumnPrefs);
  const { sort, toggle: toggleSort } = useSortable('timestamp', 'desc');

  useEffect(() => {
    const unsubscribe = subscribeRealTimeEvents((newEvent) => {
      setEvents((prev) => [newEvent, ...prev]);
      setLastLiveId(newEvent.eventId);
    });
    return unsubscribe;
  }, []);

  const PAGE_SIZE = 100;

  const saveColumns = (cols: Set<ColumnKey>) => {
    setVisibleCols(cols);
    localStorage.setItem('rtm_event_columns', JSON.stringify([...cols]));
  };

  const filtered = useMemo(() => {
    let result = events;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.eventId.includes(q) || e.event.name.includes(q) || (e.identity.customerId ?? '').toLowerCase().includes(q) || (e.identity.identifiers.email ?? '').includes(q));
    }
    if (nameFilter) result = result.filter((e) => e.event.name === nameFilter);
    if (sourceFilter) result = result.filter((e) => e.source.type === sourceFilter);
    if (decisionFilter) result = result.filter((e) => e.decision.status === decisionFilter);
    if (channelFilter) result = result.filter((e) => e.activation.channel.resolved === channelFilter);
    return result;
  }, [events, search, nameFilter, sourceFilter, decisionFilter, channelFilter]);

  const sorted = useMemo(() => {
    if (!sort.dir) return filtered;
    const arr = [...filtered];
    const getter = (e: RtmEvent): string | number => {
      switch (sort.field) {
        case 'eventName': return e.event.name;
        case 'customer': return e.identity.customerId ?? '';
        case 'source': return e.source.type;
        case 'eventChannel': return e.context.channel;
        case 'activationChannel': return e.activation.channel.resolved ?? '';
        case 'timestamp': return e.event.timestamp;
        case 'receivedAt': return e.event.receivedAt;
        case 'processing': return e.processing.processingTimeMs;
        case 'decision': return e.decision.status;
        case 'status': return e.processing.status;
        default: return '';
      }
    };
    arr.sort((a, b) => {
      const va = getter(a), vb = getter(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const uniqueNames = useMemo(() => [...new Set(events.map((e) => e.event.name))].sort(), [events]);
  const activeCols = ALL_COLUMNS.filter((c) => visibleCols.has(c.key));

  function renderCell(col: ColumnKey, evt: RtmEvent) {
    switch (col) {
      case 'eventName': return <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{evt.event.name}</code>;
      case 'eventId': return <span className="font-mono text-[10px] text-slate-500">{evt.eventId.slice(0, 16)}</span>;
      case 'customer': return <span className="font-mono text-xs text-slate-600">{evt.identity.customerId ?? evt.identity.anonymousId ?? '—'}</span>;
      case 'identity': return <span className="text-xs text-slate-500">{evt.identity.identifiers.email ? maskPii(evt.identity.identifiers.email, 'email') : evt.identity.identifiers.mobile ? maskPii(evt.identity.identifiers.mobile, 'phone') : '—'}</span>;
      case 'source': return <span className="text-xs text-slate-600">{EVENT_SOURCES.find((s) => s.value === evt.source.type)?.label ?? evt.source.type}</span>;
      case 'eventChannel': return <span className="text-xs text-slate-500">{evt.context.channel}</span>;
      case 'activationChannel': {
        const ch = evt.activation.channel.resolved;
        return ch ? <span className="text-xs text-slate-600">{CHANNELS.find((c) => c.value === ch)?.label ?? ch}</span> : <span className="text-xs text-slate-400">—</span>;
      }
      case 'timestamp': return <span className="text-xs tabular-nums text-slate-500">{new Date(evt.event.timestamp).toLocaleTimeString()}</span>;
      case 'receivedAt': return (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
            {new Date(evt.event.receivedAt).toLocaleTimeString()}
          </span>
          <span className="text-[9px] text-slate-400">Received</span>
        </div>
      );
      case 'commsTriggeredAt': {
        const trg = evt.activation.triggeredAt;
        if (!trg || evt.decision.decision !== 'send') {
          return <span className="text-xs text-slate-400">—</span>;
        }
        return (
          <div className="flex flex-col">
            <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
              {new Date(trg).toLocaleTimeString()}
            </span>
            <span className="text-[9px] text-emerald-600 font-medium">Triggered</span>
          </div>
        );
      }
      case 'identityCheck': {
        const res = evt.identity.resolution;
        const action = res.action ?? 'updated';
        return (
          <div className="flex flex-col gap-0.5" title={res.detail || `Identity Resolution: ${action}`}>
            <span className={`inline-flex items-center gap-1 w-fit rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              action === 'updated'
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : action === 'inserted'
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-700'
            }`}>
              {action === 'updated' ? 'UPSERT: UPDATED' : action === 'inserted' ? 'UPSERT: INSERTED' : 'RESOLVED'}
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              {res.checkedAt ? new Date(res.checkedAt).toLocaleTimeString() : '—'}
            </span>
          </div>
        );
      }
      case 'processing': return <span className="text-xs tabular-nums text-slate-500">{evt.processing.processingTimeMs} ms</span>;
      case 'decision': return decisionBadge(evt.decision.status);
      case 'trigger': return <span className="text-xs text-slate-500">{evt.decision.triggerName ?? '—'}</span>;
      case 'template': return <span className="text-xs text-slate-500">{evt.activation.templateName ?? '—'}</span>;
      case 'delivery': return evt.activation.deliveryId ? <span className="font-mono text-[10px] text-brand-600">{evt.activation.deliveryId}</span> : <span className="text-xs text-slate-400">—</span>;
      case 'provider': return <span className="text-xs text-slate-500">{evt.processing.trace.find((t) => t.stage === 'send')?.detail?.replace('Provider: ', '') ?? '—'}</span>;
      case 'destination': return <span className="text-xs text-slate-500">{evt.activation.destination.masked ?? '—'}</span>;
      case 'device': return <span className="text-xs text-slate-400">{evt.context.device ? `${evt.context.device.os} / ${evt.context.device.browser ?? evt.context.device.type}` : '—'}</span>;
      case 'location': return <span className="text-xs text-slate-400">{evt.context.location ? `${evt.context.location.city}, ${evt.context.location.country}` : '—'}</span>;
      case 'status': {
        const s = evt.processing.status;
        return <Badge variant={s === 'processed' ? 'success' : s.includes('failed') ? 'error' : 'default'}>{s}</Badge>;
      }
      case 'correlationId': return <span className="font-mono text-[10px] text-slate-400">{evt.correlationId}</span>;
      case 'actions': return (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setSelectedEvent(evt)} className="text-slate-400 hover:text-brand-600" title="View detail"><Eye className="h-4 w-4" /></button>
          <button type="button" className="text-slate-400 hover:text-brand-600" title="Replay"><Play className="h-3.5 w-3.5" /></button>
        </div>
      );
      default: return null;
    }
  }

  return (
    <div>
      {/* Live Stream Active Banner */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-emerald-800">
            Real-Time Streaming Active — Events arrive in real time as Test/Prod API calls execute.
          </span>
        </div>
        {lastLiveId && (
          <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
            New event: {lastLiveId}
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search event, customer, event ID, email…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
        <select value={nameFilter} onChange={(e) => { setNameFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All events</option>
          {uniqueNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All sources</option>
          {EVENT_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <select value={decisionFilter} onChange={(e) => { setDecisionFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All decisions</option>
          {DECISION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <select value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All channels</option>
          {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        <button type="button" onClick={() => setShowColumnPicker(!showColumnPicker)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <Settings className="h-4 w-4" /> Columns
        </button>
      </div>

      {/* Column picker */}
      {showColumnPicker && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Configure Columns</h4>
            <button type="button" onClick={() => setShowColumnPicker(false)} className="text-slate-400"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_COLUMNS.map((c) => (
              <label key={c.key} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
                <input type="checkbox" checked={visibleCols.has(c.key)}
                  onChange={(e) => { const next = new Set(visibleCols); e.target.checked ? next.add(c.key) : next.delete(c.key); saveColumns(next); }}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-xs text-slate-400">{sorted.length.toLocaleString()} events · Page {page + 1} of {totalPages || 1} · 100 per page</p>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                {activeCols.map((col) => (
                  <th key={col.key} className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-500 ${col.width ?? ''} ${col.sortable ? 'cursor-pointer select-none hover:text-slate-700' : ''}`}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}>
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && (
                        <span className="inline-flex flex-col">
                          <ChevronUp className={`h-2.5 w-2.5 ${sort.field === col.key && sort.dir === 'asc' ? 'text-brand-600' : 'text-slate-300'}`} />
                          <ChevronDown className={`-mt-0.5 h-2.5 w-2.5 ${sort.field === col.key && sort.dir === 'desc' ? 'text-brand-600' : 'text-slate-300'}`} />
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paged.map((evt) => (
                <tr key={evt.eventId} className="hover:bg-slate-50" onClick={() => setSelectedEvent(evt)} style={{ cursor: 'pointer' }}>
                  {activeCols.map((col) => (
                    <td key={col.key} className={`px-3 py-2 ${col.width ?? ''}`}>{renderCell(col.key, evt)}</td>
                  ))}
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

      {selectedEvent && <EventIntelligenceDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Intelligence Drawer — 6 tabs
// ═══════════════════════════════════════════════════════════════════════════

type DrawerTab = 'overview' | 'identity' | 'payload' | 'decision' | 'delivery' | 'trace';

function EventIntelligenceDrawer({ event, onClose }: { event: RtmEvent; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>('overview');

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="flex-1" onClick={onClose} />
      <div className="flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <code className="rounded bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-900">{event.event.name}</code>
              <Badge variant={event.processing.status === 'processed' ? 'success' : 'error'}>{event.processing.status}</Badge>
            </div>
            <p className="mt-1 font-mono text-xs text-slate-500">{event.eventId}</p>
            <p className="mt-0.5 text-xs text-slate-400">{event.processing.processingTimeMs} ms processing</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-6 py-2">
          {(['overview', 'identity', 'payload', 'decision', 'delivery', 'trace'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${tab === t ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'overview' && <OverviewTab event={event} />}
          {tab === 'identity' && <IdentityTab identity={event.identity} />}
          {tab === 'payload' && <PayloadTab event={event} />}
          {tab === 'decision' && <DecisionTab event={event} />}
          {tab === 'delivery' && <DeliveryTab event={event} />}
          {tab === 'trace' && <TraceTab event={event} />}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 border-t border-slate-100 px-6 py-3">
          {event.activation.deliveryId && (
            <Button variant="secondary" size="sm"><Eye className="mr-1.5 h-3.5 w-3.5" /> View Delivery</Button>
          )}
          <Button variant="secondary" size="sm"><Eye className="mr-1.5 h-3.5 w-3.5" /> View Customer</Button>
          <Button variant="secondary" size="sm"><Play className="mr-1.5 h-3.5 w-3.5" /> Replay Event</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

function OverviewTab({ event }: { event: RtmEvent }) {
  return (
    <div className="space-y-5">
      <Section title="EVENT & TIMESTAMPS">
        <Row label="Event Name"><code className="rounded bg-slate-100 px-1.5 text-xs">{event.event.name}</code></Row>
        <Row label="Event Type"><Badge variant="default">{event.event.type}</Badge></Row>
        <Row label="Received At">
          <span className="font-mono text-xs font-bold text-slate-900">{new Date(event.event.receivedAt).toLocaleTimeString()}</span>
        </Row>
        <Row label="Identity Checked At">
          <span className="font-mono text-xs font-bold text-indigo-700">
            {event.identity.resolution.checkedAt ? new Date(event.identity.resolution.checkedAt).toLocaleTimeString() : '—'}
          </span>
        </Row>
        <Row label="Comms Triggered At">
          {event.activation.triggeredAt ? (
            <span className="font-mono text-xs font-bold text-emerald-700">
              {new Date(event.activation.triggeredAt).toLocaleTimeString()} (Dispatched)
            </span>
          ) : (
            <span className="text-xs text-slate-400">Not Triggered ({event.decision.status})</span>
          )}
        </Row>
        <Row label="Processing Latency">{event.processing.processingTimeMs} ms</Row>
        <Row label="Correlation ID"><code className="font-mono text-[10px]">{event.correlationId}</code></Row>
      </Section>

      <Section title="SOURCE">
        <Row label="Source">{EVENT_SOURCES.find((s) => s.value === event.source.type)?.label ?? event.source.type}</Row>
        <Row label="Source Name">{event.source.sourceName ?? '—'}</Row>
        {event.source.sdk && <Row label="SDK">{event.source.sdk} v{event.source.sdkVersion}</Row>}
        <Row label="Session"><code className="font-mono text-[10px]">{event.identity.sessionId ?? '—'}</code></Row>
      </Section>

      <Section title="CUSTOMER & IDENTITY RESOLUTION">
        <Row label="Customer ID"><code className="font-mono text-xs">{event.identity.customerId ?? '—'}</code></Row>
        <Row label="Profile Action">
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
            event.identity.resolution.action === 'updated' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {event.identity.resolution.action === 'updated' ? 'UPSERT: UPDATED EXISTING PROFILE' : 'UPSERT: INSERTED NEW PROFILE'}
          </span>
        </Row>
        <Row label="Email">{event.identity.identifiers.email ? maskPii(event.identity.identifiers.email, 'email') : '—'}</Row>
        <Row label="Mobile">{event.identity.identifiers.mobile ? maskPii(event.identity.identifiers.mobile, 'phone') : '—'}</Row>
        <Row label="Resolution">{event.identity.resolution.status} via {event.identity.resolution.method}</Row>
      </Section>

      <Section title="DECISION">
        <Row label="Decision">{decisionBadge(event.decision.status)}</Row>
        <Row label="Reason">{event.decision.reason}</Row>
        {event.decision.triggerName && <Row label="Trigger">{event.decision.triggerName}</Row>}
      </Section>

      {event.activation.templateName && (
        <Section title="ACTION & COMMS DISPATCH">
          <Row label="Template">{event.activation.templateName}</Row>
          <Row label="Channel">{event.activation.channel.resolved ? CHANNELS.find((c) => c.value === event.activation.channel.resolved)?.label : '—'}</Row>
          <Row label="Destination">{event.activation.destination.masked ?? '—'}</Row>
          <Row label="Comms Triggered">{event.activation.triggeredAt ? new Date(event.activation.triggeredAt).toLocaleString() : '—'}</Row>
          {event.activation.deliveryId && <Row label="Delivery ID"><code className="font-mono text-[10px] text-brand-600">{event.activation.deliveryId}</code></Row>}
        </Section>
      )}
    </div>
  );
}

// ─── Identity ───────────────────────────────────────────────────────────────

function IdentityTab({ identity }: { identity: RtmEventIdentity }) {
  const channels: { icon: React.ReactNode; label: string; value: string | undefined; available: boolean }[] = [
    { icon: <Mail className="h-4 w-4" />, label: 'Email', value: identity.identifiers.email, available: Boolean(identity.identifiers.email) },
    { icon: <Phone className="h-4 w-4" />, label: 'Mobile', value: identity.identifiers.mobile, available: Boolean(identity.identifiers.mobile) },
    { icon: <MessageSquare className="h-4 w-4" />, label: 'WhatsApp', value: identity.identifiers.whatsapp, available: Boolean(identity.identifiers.whatsapp) },
    { icon: <Globe className="h-4 w-4" />, label: 'Web Push', value: identity.identifiers.webPushToken ? 'Available' : undefined, available: Boolean(identity.identifiers.webPushToken) },
    { icon: <Smartphone className="h-4 w-4" />, label: 'Mobile Push', value: identity.identifiers.mobilePushToken ? 'Available' : undefined, available: Boolean(identity.identifiers.mobilePushToken) },
  ];

  return (
    <div className="space-y-5">
      <Section title="CUSTOMER PROFILE & IDENTITY RESOLUTION">
        <Row label="Customer ID"><code className="font-mono text-xs font-bold text-slate-900">{identity.customerId ?? '—'}</code></Row>
        <Row label="Upsert Action">
          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${
            identity.resolution.action === 'updated' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {identity.resolution.action === 'updated' ? 'UPSERT: UPDATED PROFILE' : 'UPSERT: INSERTED NEW PROFILE'}
          </span>
        </Row>
        <Row label="Checked At">
          <span className="font-mono text-xs text-slate-700">
            {identity.resolution.checkedAt ? new Date(identity.resolution.checkedAt).toLocaleString() : '—'}
          </span>
        </Row>
        <Row label="Combination Rule">Email + Mobile Combination Matching</Row>
        <Row label="External ID"><code className="font-mono text-xs">{identity.externalId ?? '—'}</code></Row>
        <Row label="Anonymous ID"><code className="font-mono text-xs">{identity.anonymousId ?? '—'}</code></Row>
        <Row label="Session"><code className="font-mono text-xs">{identity.sessionId ?? '—'}</code></Row>
      </Section>

      <Section title="RESOLUTION AUDIT TRAIL">
        <Row label="Status"><Badge variant={identity.resolution.status === 'resolved' ? 'success' : identity.resolution.status === 'partial' ? 'warning' : 'default'}>{identity.resolution.status}</Badge></Row>
        <Row label="Method">{identity.resolution.method}</Row>
        <Row label="Matched Profile">{identity.resolution.matchedProfileId ?? '—'}</Row>
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-900 mb-1">Resolution Detail:</p>
          <p className="font-mono text-[11px] text-slate-600">{identity.resolution.detail || 'Identity resolved and profile synced.'}</p>
        </div>
      </Section>

      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Identity Graph — Available Destinations</h4>
        <div className="space-y-2">
          {channels.map((ch) => (
            <div key={ch.label} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${ch.available ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${ch.available ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>{ch.icon}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{ch.label}</p>
                <p className="text-xs text-slate-500">
                  {ch.available
                    ? (ch.value === 'Available' ? '✓ Token available' : maskPii(ch.value!, ch.label === 'Email' ? 'email' : 'phone'))
                    : '✕ Not available'}
                </p>
              </div>
              {ch.available ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <X className="h-5 w-5 text-slate-300" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Payload ────────────────────────────────────────────────────────────────

function PayloadTab({ event }: { event: RtmEvent }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(event.payload, null, 2);
  const copy = () => { void navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy JSON'}
        </button>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <Play className="h-3.5 w-3.5" /> Use as Test Payload
        </button>
      </div>
      <pre className="overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">{json}</pre>

      <Section title="FULL EVENT OBJECT">
        <pre className="overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-[10px] leading-relaxed text-slate-300">
          {JSON.stringify({
            eventId: event.eventId,
            event: event.event,
            source: event.source,
            identity: { ...event.identity, identifiers: Object.fromEntries(Object.entries(event.identity.identifiers).map(([k, v]) => [k, v ? '***masked***' : undefined]).filter(([, v]) => v)) },
            context: event.context,
            payload: event.payload,
          }, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

// ─── Decision ───────────────────────────────────────────────────────────────

function DecisionTab({ event }: { event: RtmEvent }) {
  const isPositive = event.decision.decision === 'send';
  const isSuppressed = event.decision.decision === 'suppress';

  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-4 ${isPositive ? 'border-emerald-200 bg-emerald-50' : isSuppressed ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
        <p className={`text-lg font-bold ${isPositive ? 'text-emerald-800' : isSuppressed ? 'text-amber-800' : 'text-slate-600'}`}>
          DECISION: {event.decision.decision.toUpperCase()}
        </p>
        <p className="mt-1 text-sm text-slate-600">{event.decision.reason}</p>
      </div>

      <div className="space-y-2">
        {event.decision.rulesEvaluated.map((rule, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-2.5">
            {rule.result === 'passed'
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              : <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />}
            <span className="flex-1 text-sm capitalize text-slate-700">{rule.rule.replace(/_/g, ' ')}</span>
            <Badge variant={rule.result === 'passed' ? 'success' : 'error'}>{rule.result}</Badge>
          </div>
        ))}
      </div>

      {isSuppressed && event.governance.suppressionReason && (
        <Section title="SUPPRESSION DETAIL">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">Reason: {SUPPRESSION_REASONS[event.governance.suppressionReason] ?? event.governance.suppressionReason}</p>
            <p className="mt-1 text-xs text-amber-600">
              {event.governance.suppressionReason === 'frequency_cap' && 'Maximum messages per customer per time window exceeded. The customer has already received a message from this trigger within the configured window.'}
              {event.governance.suppressionReason === 'quiet_hours' && 'The event arrived during configured quiet hours. Depending on configuration, the message is either delayed or suppressed entirely.'}
              {event.governance.suppressionReason === 'opt_out' && 'The customer has opted out of this channel or message category.'}
            </p>
          </div>
        </Section>
      )}

      {event.decision.triggerName && (
        <Section title="MATCHED TRIGGER">
          <Row label="Trigger">{event.decision.triggerName}</Row>
          <Row label="Trigger ID"><code className="font-mono text-[10px]">{event.decision.triggerId}</code></Row>
        </Section>
      )}

      {event.activation.templateName && (
        <Section title="SELECTED TEMPLATE">
          <Row label="Template">{event.activation.templateName}</Row>
          <Row label="Version">v{event.activation.templateVersion}</Row>
          <Row label="Channel">{event.activation.channel.resolved ? CHANNELS.find((c) => c.value === event.activation.channel.resolved)?.label : '—'}</Row>
          <Row label="Destination">{event.activation.destination.type} — {event.activation.destination.resolved ? 'Resolved' : 'Not resolved'}</Row>
        </Section>
      )}

      <Section title="GOVERNANCE">
        {[
          { label: 'Consent', value: event.governance.consent },
          { label: 'Suppression Check', value: event.governance.suppression },
          { label: 'Frequency Cap', value: event.governance.frequencyCap },
          { label: 'Quiet Hours', value: event.governance.quietHours },
        ].map((g) => (
          <Row key={g.label} label={g.label}>
            <Badge variant={g.value === 'passed' ? 'success' : g.value === 'failed' ? 'error' : 'default'}>{g.value}</Badge>
          </Row>
        ))}
      </Section>
    </div>
  );
}

// ─── Delivery ───────────────────────────────────────────────────────────────

function DeliveryTab({ event }: { event: RtmEvent }) {
  if (!event.activation.deliveryId) {
    return <p className="py-8 text-center text-sm text-slate-400">No delivery associated with this event.</p>;
  }
  return (
    <div className="space-y-5">
      <Section title="DELIVERY">
        <Row label="Delivery ID"><code className="font-mono text-xs text-brand-600">{event.activation.deliveryId}</code></Row>
        <Row label="Template">{event.activation.templateName ?? '—'}</Row>
        <Row label="Channel">{event.activation.channel.resolved ? CHANNELS.find((c) => c.value === event.activation.channel.resolved)?.label : '—'}</Row>
        <Row label="Destination">{event.activation.destination.masked ?? '—'}</Row>
        <Row label="Provider">{event.processing.trace.find((t) => t.stage === 'send')?.detail?.replace('Provider: ', '') ?? '—'}</Row>
      </Section>

      <Section title="CHANNEL RESOLUTION">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="space-y-2 text-xs text-slate-600">
            <p><span className="font-medium">Requested channel:</span> {event.activation.channel.requested ? CHANNELS.find((c) => c.value === event.activation.channel.requested)?.label : '—'}</p>
            <p><span className="font-medium">Resolved channel:</span> {event.activation.channel.resolved ? CHANNELS.find((c) => c.value === event.activation.channel.resolved)?.label : '—'}</p>
            <p><span className="font-medium">Destination type:</span> {event.activation.destination.type}</p>
            <p><span className="font-medium">Destination resolved:</span> {event.activation.destination.resolved ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ─── Trace ───────────────────────────────────────────────────────────────────

function TraceTab({ event }: { event: RtmEvent }) {
  const trace = event.processing.trace;
  const t0 = trace.length > 0 ? new Date(trace[0].timestamp).getTime() : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Zap className="h-3.5 w-3.5" />
        <span>Total processing: {event.processing.processingTimeMs} ms</span>
      </div>

      <div className="space-y-1">
        {trace.map((step, i) => {
          const ms = new Date(step.timestamp).getTime() - t0;
          const isPassed = step.status === 'passed';
          const isFailed = step.status === 'failed';
          return (
            <div key={i}>
              <div className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3">
                {isPassed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : isFailed ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" /> : <X className="h-4 w-4 shrink-0 text-slate-300" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold capitalize text-slate-800">{step.stage.replace(/_/g, ' ')}</p>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-400">+{ms} ms ({step.durationMs} ms)</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{step.detail}</p>
                </div>
              </div>
              {i < trace.length - 1 && (
                <div className="ml-5 flex h-4 items-center">
                  <div className="h-full w-px bg-slate-200" />
                  <ChevronDown className="ml-[-4px] h-3 w-3 text-slate-300" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Section title="LATENCY BREAKDOWN">
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-slate-500">Stage</th>
                <th className="px-3 py-2 text-right text-slate-500">Duration</th>
                <th className="px-3 py-2 text-right text-slate-500">Cumulative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {trace.map((step, i) => {
                const cum = new Date(step.timestamp).getTime() - t0 + step.durationMs;
                return (
                  <tr key={i}>
                    <td className="px-3 py-1.5 capitalize text-slate-700">{step.stage.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{step.durationMs} ms</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{cum} ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ─── Shared ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{children}</span>
    </div>
  );
}
