import { useMemo, useState } from 'react';
import {
  CheckCircle2, 
  Edit2, 
  Pause, Play, Plus, Search, Target, Trash2,
  X, Zap,
} from 'lucide-react';
import { Badge, Button, EmptyState } from '@/components/ui';
import {
  type Channel, type TriggerCategory, type TriggerStatus,
  type TriggerCondition, type TemporalCondition, type TriggerAction,
  type TriggerRule, 
  CHANNELS,
} from '@/lib/rtm';

// ─── Trigger presets ────────────────────────────────────────────────────────

type Preset = {
  name: string;
  category: TriggerCategory;
  event: string;
  description: string;
  conditions: TriggerCondition[];
  temporal?: TemporalCondition;
  action: Partial<TriggerAction>;
  suggestedChannels: Channel[];
};

const PRESETS: Preset[] = [
  { name: 'Cart Abandonment', category: 'commerce', event: 'cart_updated', description: 'Trigger when cart is abandoned after 30 min with no checkout.',
    conditions: [{ field: 'payload.cartValue', op: 'gt', value: 0 }],
    temporal: { type: 'absence', event: 'checkout_started', window: '30m' },
    action: { templateSlug: 'cart-reminder' }, suggestedChannels: ['web_push', 'email', 'whatsapp'] },
  { name: 'Checkout Abandonment', category: 'commerce', event: 'checkout_started', description: 'Trigger when checkout starts but no purchase within 1h.',
    conditions: [{ field: 'payload.cartValue', op: 'gt', value: 500 }],
    temporal: { type: 'absence', event: 'purchase_completed', window: '1h' },
    action: { templateSlug: 'checkout-reminder' }, suggestedChannels: ['whatsapp', 'email'] },
  { name: 'Search Abandonment', category: 'commerce', event: 'product_search', description: 'Trigger when user searches but does not view any product within 15 min.',
    conditions: [{ field: 'payload.query', op: 'exists', value: true }],
    temporal: { type: 'absence', event: 'product_viewed', window: '15m' },
    action: { templateSlug: 'search-results' }, suggestedChannels: ['web_push', 'in_browser'] },
  { name: 'Browse Drop-off', category: 'commerce', event: 'product_viewed', description: 'Viewed 3+ products without add-to-cart in 20 min.',
    conditions: [{ field: 'context.page.viewCount', op: 'gte', value: 3 }],
    temporal: { type: 'absence', event: 'cart_updated', window: '20m' },
    action: { templateSlug: 'browse-nudge' }, suggestedChannels: ['web_push', 'in_browser'] },
  { name: 'Price Drop Alert', category: 'commerce', event: 'price_changed', description: 'Notify users who wishlisted an item when price drops >10%.',
    conditions: [{ field: 'payload.priceDropPct', op: 'gt', value: 10 }],
    action: { templateSlug: 'price-alert' }, suggestedChannels: ['email', 'web_push', 'mobile_push'] },
  { name: 'Back In Stock', category: 'commerce', event: 'inventory_updated', description: 'Notify users who registered interest when item restocks.',
    conditions: [{ field: 'payload.previousStock', op: 'eq', value: 0 }, { field: 'payload.currentStock', op: 'gt', value: 0 }],
    action: { templateSlug: 'back-in-stock' }, suggestedChannels: ['email', 'web_push'] },

  { name: 'OTP Delivery', category: 'transactional', event: 'otp_login', description: 'Immediate OTP delivery via SMS.',
    conditions: [], action: { templateSlug: 'otp' }, suggestedChannels: ['sms'] },
  { name: 'Order Confirmation', category: 'transactional', event: 'purchase_completed', description: 'Confirm order immediately after purchase.',
    conditions: [], action: { templateSlug: 'order-confirm' }, suggestedChannels: ['email', 'whatsapp'] },
  { name: 'Shipping Update', category: 'transactional', event: 'order_shipped', description: 'Notify customer when order is shipped.',
    conditions: [], action: { templateSlug: 'order-shipped' }, suggestedChannels: ['email', 'sms', 'whatsapp'] },

  { name: 'Booking Confirmation', category: 'travel', event: 'booking_confirmed', description: 'Send itinerary immediately after booking.',
    conditions: [], action: { templateSlug: 'booking-confirm' }, suggestedChannels: ['email', 'whatsapp'] },
  { name: 'Check-in Reminder', category: 'travel', event: 'check_in_open', description: 'Remind traveler to check in.',
    conditions: [], temporal: { type: 'delay', delayMs: 0 }, action: { templateSlug: 'checkin-reminder' }, suggestedChannels: ['mobile_push', 'sms'] },
  { name: 'Flight Status', category: 'travel', event: 'flight_status_changed', description: 'Real-time flight status change alerts.',
    conditions: [], action: { templateSlug: 'flight-status' }, suggestedChannels: ['sms', 'mobile_push'] },

  { name: 'Trial Expiry Warning', category: 'saas', event: 'trial_status', description: 'Warn user 3 days before trial expires.',
    conditions: [{ field: 'payload.daysRemaining', op: 'lte', value: 3 }],
    action: { templateSlug: 'trial-expiry' }, suggestedChannels: ['email', 'in_app'] },
  { name: 'Feature Adoption', category: 'saas', event: 'feature_activated', description: 'Guide user when they first use a key feature.',
    conditions: [{ field: 'payload.isFirstUse', op: 'eq', value: true }],
    action: { templateSlug: 'feature-guide' }, suggestedChannels: ['in_app', 'email'] },
  { name: 'Usage Spike Alert', category: 'saas', event: 'usage_threshold', description: 'Alert when approaching plan limits.',
    conditions: [{ field: 'payload.usagePct', op: 'gte', value: 80 }],
    action: { templateSlug: 'usage-alert' }, suggestedChannels: ['email', 'in_app'] },

  { name: 'Low Balance Alert', category: 'financial', event: 'balance_changed', description: 'Notify when balance drops below threshold.',
    conditions: [{ field: 'payload.balance', op: 'lt', value: 1000 }],
    action: { templateSlug: 'low-balance' }, suggestedChannels: ['sms', 'mobile_push'] },
];

const CATEGORY_LABELS: Record<TriggerCategory, string> = {
  commerce: 'Commerce', content: 'Content', travel: 'Travel & Booking', saas: 'SaaS & Product', financial: 'Financial', transactional: 'Transactional', custom: 'Custom',
};

// ─── Demo triggers ──────────────────────────────────────────────────────────

function genTriggers(): TriggerRule[] {
  return PRESETS.slice(0, 8).map((p, i) => ({
    id: `TRG_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    name: p.name,
    status: (i < 5 ? 'active' : i === 5 ? 'paused' : 'draft') as TriggerStatus,
    category: p.category,
    event: p.event,
    conditions: p.conditions,
    temporal: p.temporal,
    action: { channel: p.suggestedChannels[0], templateId: `TPL_${p.action.templateSlug?.toUpperCase().replace(/-/g, '_').slice(0, 12)}`, templateSlug: p.action.templateSlug!, fallbackChain: p.suggestedChannels.slice(1) },
    frequencyCap: { maxMessages: 1, windowMs: 86400000, scope: 'per_customer' },
    quietHours: { enabled: false },
    priority: 100 - i * 10,
    createdAt: new Date(Date.now() - (30 - i) * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - i * 86400000).toISOString(),
    stats: { matched: 1200 + i * 500, sent: 1000 + i * 400, suppressed: 80 + i * 20, avgLatencyMs: 120 + i * 15 },
  }));
}

// ═══════════════════════════════════════════════════════════════════════════

export function RtmTriggers() {
  const [triggers, setTriggers] = useState(() => genTriggers());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTrigger, setSelectedTrigger] = useState<TriggerRule | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [presetCategory] = useState<TriggerCategory | ''>('');
  const [showSimulator, setShowSimulator] = useState(false);

  const filtered = useMemo(() => {
    let r = triggers;
    if (search) { const q = search.toLowerCase(); r = r.filter((t) => t.name.toLowerCase().includes(q) || t.event.toLowerCase().includes(q)); }
    if (categoryFilter) r = r.filter((t) => t.category === categoryFilter);
    if (statusFilter) r = r.filter((t) => t.status === statusFilter);
    return r;
  }, [triggers, search, categoryFilter, statusFilter]);

  const toggleStatus = (id: string) => {
    setTriggers((prev) => prev.map((t) => t.id === id ? { ...t, status: t.status === 'active' ? 'paused' : 'active' } as TriggerRule : t));
  };

  const deleteTrigger = (id: string) => {
    setTriggers((prev) => prev.filter((t) => t.id !== id));
  };

  const addFromPreset = (preset: Preset) => {
    const rule: TriggerRule = {
      id: `TRG_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      name: preset.name,
      status: 'draft',
      category: preset.category,
      event: preset.event,
      conditions: preset.conditions,
      temporal: preset.temporal,
      action: { channel: preset.suggestedChannels[0], templateId: `TPL_NEW`, templateSlug: preset.action.templateSlug!, fallbackChain: preset.suggestedChannels.slice(1) },
      frequencyCap: { maxMessages: 1, windowMs: 86400000, scope: 'per_customer' },
      quietHours: { enabled: false },
      priority: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: { matched: 0, sent: 0, suppressed: 0, avgLatencyMs: 0 },
    };
    setTriggers((prev) => [rule, ...prev]);
    setShowPresets(false);
    setSelectedTrigger(rule);
  };

  const statusColor = (s: TriggerStatus) => s === 'active' ? 'success' : s === 'paused' ? 'warning' : 'default';

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search triggers by name or event…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><option value="">All statuses</option>
          <option value="active">Active</option><option value="paused">Paused</option><option value="draft">Draft</option></select>
        <Button variant="secondary" onClick={() => setShowSimulator(true)}><Play className="mr-1.5 h-4 w-4" /> Simulator</Button>
        <Button onClick={() => setShowPresets(true)}><Plus className="mr-1.5 h-4 w-4" /> New Trigger</Button>
      </div>

      {/* Stats strip */}
      <div className="mb-4 flex gap-3">
        {[
          { label: 'Active', value: triggers.filter((t) => t.status === 'active').length, color: 'text-emerald-600' },
          { label: 'Paused', value: triggers.filter((t) => t.status === 'paused').length, color: 'text-amber-600' },
          { label: 'Draft', value: triggers.filter((t) => t.status === 'draft').length, color: 'text-slate-500' },
          { label: 'Total Matched', value: triggers.reduce((a, t) => a + t.stats.matched, 0), color: 'text-brand-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Trigger list */}
      {filtered.length === 0 ? (
        <EmptyState title="No triggers" description="Create a trigger from pre-built templates to start event-driven messaging."
          action={<Button onClick={() => setShowPresets(true)}><Plus className="mr-1.5 h-4 w-4" /> Browse Presets</Button>} />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.status === 'active' ? 'bg-emerald-50 text-emerald-600' : t.status === 'paused' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                <Target className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-semibold text-slate-900">{t.name}</h3>
                  <Badge variant={statusColor(t.status)}>{t.status}</Badge>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{CATEGORY_LABELS[t.category]}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="font-medium">WHEN</span> <code className="rounded bg-slate-100 px-1">{t.event}</code>
                  {t.conditions.length > 0 && <> <span className="font-medium">AND</span> {t.conditions.length} condition{t.conditions.length > 1 ? 's' : ''}</>}
                  {t.temporal && <> <span className="font-medium">WAIT</span> {t.temporal.type === 'absence' ? `no ${t.temporal.event} in ${t.temporal.window}` : `${t.temporal.type}`}</>}
                  {' '}<span className="font-medium">THEN</span> {CHANNELS.find((c) => c.value === t.action.channel)?.label ?? t.action.channel}
                  {t.action.fallbackChain?.length ? ` → ${t.action.fallbackChain.map((c) => CHANNELS.find((ch) => ch.value === c)?.label ?? c).join(' → ')}` : ''}
                </p>
              </div>
              <div className="hidden gap-6 text-right md:flex">
                <div><p className="text-sm font-semibold tabular-nums text-slate-900">{t.stats.matched.toLocaleString()}</p><p className="text-[10px] uppercase text-slate-400">matched</p></div>
                <div><p className="text-sm font-semibold tabular-nums text-slate-900">{t.stats.sent.toLocaleString()}</p><p className="text-[10px] uppercase text-slate-400">sent</p></div>
                <div><p className="text-sm font-semibold tabular-nums text-slate-900">{t.stats.avgLatencyMs} ms</p><p className="text-[10px] uppercase text-slate-400">latency</p></div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setSelectedTrigger(t)} className="rounded p-1.5 text-slate-400 hover:bg-slate-50 hover:text-brand-600" title="Edit"><Edit2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => toggleStatus(t.id)} className="rounded p-1.5 text-slate-400 hover:bg-slate-50 hover:text-brand-600" title={t.status === 'active' ? 'Pause' : 'Activate'}>
                  {t.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => deleteTrigger(t.id)} className="rounded p-1.5 text-slate-400 hover:bg-slate-50 hover:text-red-500" title="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showPresets && <PresetBrowser category={presetCategory} onSelect={addFromPreset} onClose={() => setShowPresets(false)} />}
      {selectedTrigger && <TriggerDrawer trigger={selectedTrigger} onClose={() => setSelectedTrigger(null)} />}
      {showSimulator && <TriggerSimulator triggers={triggers} onClose={() => setShowSimulator(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Preset browser
// ═══════════════════════════════════════════════════════════════════════════

function PresetBrowser({ category, onSelect, onClose }: { category: TriggerCategory | ''; onSelect: (p: Preset) => void; onClose: () => void }) {
  const [cat, setCat] = useState<TriggerCategory | ''>(category);
  const filtered = cat ? PRESETS.filter((p) => p.category === cat) : PRESETS;
  const grouped = useMemo(() => {
    const map = new Map<TriggerCategory, Preset[]>();
    for (const p of filtered) {
      let arr = map.get(p.category);
      if (!arr) { arr = []; map.set(p.category, arr); }
      arr.push(p);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Trigger Presets</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-4 flex gap-2">
          <button type="button" onClick={() => setCat('')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!cat ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}>All</button>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setCat(k as TriggerCategory)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${cat === k ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}>{v}</button>
          ))}
        </div>
        <div className="space-y-4">
          {grouped.map(([catKey, presets]) => (
            <div key={catKey}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{CATEGORY_LABELS[catKey]}</h3>
              <div className="space-y-2">
                {presets.map((p) => (
                  <div key={p.name} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 hover:border-brand-200">
                    <Target className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{p.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{p.event}</code>
                        {p.suggestedChannels.map((c) => (
                          <span key={c} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-600">{CHANNELS.find((ch) => ch.value === c)?.label ?? c}</span>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => onSelect(p)}>Use</Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Trigger detail drawer
// ═══════════════════════════════════════════════════════════════════════════

function TriggerDrawer({ trigger, onClose }: { trigger: TriggerRule; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="flex-1" onClick={onClose} />
      <div className="flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{trigger.name}</h2>
              <Badge variant={trigger.status === 'active' ? 'success' : trigger.status === 'paused' ? 'warning' : 'default'}>{trigger.status}</Badge>
            </div>
            <p className="mt-0.5 font-mono text-xs text-slate-400">{trigger.id}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Visual rule display */}
          <div className="space-y-3">
            <RuleStep label="WHEN" color="bg-blue-500">
              <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{trigger.event}</code>
            </RuleStep>

            {trigger.conditions.length > 0 && trigger.conditions.map((c, i) => (
              <RuleStep key={i} label="AND" color="bg-indigo-500">
                <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{c.field} {c.op} {String(c.value)}</code>
              </RuleStep>
            ))}

            {trigger.temporal && (
              <RuleStep label="WAIT" color="bg-amber-500">
                <span className="text-sm text-slate-700">
                  {trigger.temporal.type === 'absence' && `No "${trigger.temporal.event}" within ${trigger.temporal.window}`}
                  {trigger.temporal.type === 'delay' && `Delay ${trigger.temporal.delayMs}ms`}
                  {trigger.temporal.type === 'within' && `Within ${trigger.temporal.window}`}
                  {trigger.temporal.type === 'sequence' && `Sequence: ${trigger.temporal.events?.join(' → ')}`}
                </span>
              </RuleStep>
            )}

            <RuleStep label="THEN" color="bg-emerald-500">
              <div className="text-sm text-slate-700">
                <p>Send <span className="font-medium">{trigger.action.templateSlug}</span> via <span className="font-medium">{CHANNELS.find((c) => c.value === trigger.action.channel)?.label}</span></p>
                {trigger.action.fallbackChain?.length ? (
                  <p className="mt-1 text-xs text-slate-500">Fallback: {trigger.action.fallbackChain.map((c) => CHANNELS.find((ch) => ch.value === c)?.label ?? c).join(' → ')}</p>
                ) : null}
              </div>
            </RuleStep>
          </div>

          {/* Frequency cap */}
          <Section title="FREQUENCY CAP">
            <Row label="Max messages">{trigger.frequencyCap.maxMessages} per {Math.round(trigger.frequencyCap.windowMs / 3600000)}h</Row>
            <Row label="Scope">{trigger.frequencyCap.scope}</Row>
          </Section>

          {/* Quiet hours */}
          <Section title="QUIET HOURS">
            <Row label="Enabled">{trigger.quietHours.enabled ? 'Yes' : 'No'}</Row>
            {trigger.quietHours.enabled && trigger.quietHours.start && (
              <Row label="Window">{trigger.quietHours.start} – {trigger.quietHours.end} ({trigger.quietHours.timezone})</Row>
            )}
            {trigger.quietHours.enabled && (
              <Row label="Behavior">{trigger.quietHours.action ?? 'delay'}</Row>
            )}
          </Section>

          {/* Stats */}
          <Section title="PERFORMANCE">
            <Row label="Matched">{trigger.stats.matched.toLocaleString()}</Row>
            <Row label="Sent">{trigger.stats.sent.toLocaleString()}</Row>
            <Row label="Suppressed">{trigger.stats.suppressed.toLocaleString()}</Row>
            <Row label="Avg Latency">{trigger.stats.avgLatencyMs} ms</Row>
          </Section>

          {/* Meta */}
          <Section title="META">
            <Row label="Category">{CATEGORY_LABELS[trigger.category]}</Row>
            <Row label="Priority">{trigger.priority}</Row>
            <Row label="Created">{new Date(trigger.createdAt).toLocaleDateString()}</Row>
            <Row label="Updated">{new Date(trigger.updatedAt).toLocaleDateString()}</Row>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Trigger simulator
// ═══════════════════════════════════════════════════════════════════════════

function TriggerSimulator({ triggers, onClose }: { triggers: TriggerRule[]; onClose: () => void }) {
  const [eventName, setEventName] = useState('cart_updated');
  const [payloadJson, setPayloadJson] = useState('{\n  "cartValue": 2500,\n  "currency": "INR",\n  "itemCount": 3\n}');
  const [result, setResult] = useState<{ matched: TriggerRule[]; reason: string } | null>(null);

  const simulate = () => {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(payloadJson); } catch { /* ignore parse errors for demo */ }

    const matched = triggers.filter((t) => {
      if (t.status !== 'active') return false;
      if (t.event !== eventName) return false;
      for (const c of t.conditions) {
        const parts = c.field.split('.');
        let val: unknown = { payload };
        for (const p of parts) val = (val as Record<string, unknown>)?.[p];
        switch (c.op) {
          case 'eq': if (val !== c.value) return false; break;
          case 'gt': if (typeof val !== 'number' || val <= (c.value as number)) return false; break;
          case 'gte': if (typeof val !== 'number' || val < (c.value as number)) return false; break;
          case 'lt': if (typeof val !== 'number' || val >= (c.value as number)) return false; break;
          case 'exists': if (!val) return false; break;
        }
      }
      return true;
    });

    setResult({
      matched,
      reason: matched.length === 0 ? 'No active trigger matches this event + payload.' : `${matched.length} trigger(s) matched.`,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Trigger Simulator</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Event Name</label>
            <input value={eventName} onChange={(e) => setEventName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Payload (JSON)</label>
            <textarea value={payloadJson} onChange={(e) => setPayloadJson(e.target.value)} rows={6}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none" />
          </div>
          <Button onClick={simulate} className="w-full"><Zap className="mr-1.5 h-4 w-4" /> Simulate</Button>
        </div>

        {result && (
          <div className="mt-4 space-y-2">
            <div className={`rounded-lg border p-3 ${result.matched.length > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className={`text-sm font-semibold ${result.matched.length > 0 ? 'text-emerald-800' : 'text-slate-600'}`}>{result.reason}</p>
            </div>
            {result.matched.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-500">→ {t.action.templateSlug} via {CHANNELS.find((c) => c.value === t.action.channel)?.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared components ──────────────────────────────────────────────────────

function RuleStep({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 rounded px-2 py-1 text-[10px] font-bold text-white ${color}`}>{label}</div>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  );
}

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
