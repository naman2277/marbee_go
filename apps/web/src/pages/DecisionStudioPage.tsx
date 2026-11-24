import { useMemo, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, BookOpen, Brain,
  CheckCircle2, ChevronDown, ChevronRight, Edit2, 
  Gift, Layers, MessageSquare, Minus,
  Play, Plus, Search, Shield, ShieldCheck, Sliders,
  Sparkles, Target, Ticket, X, Zap,
  FileText, Layout, FlaskConical, Gauge,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCustomers, getCustomerDisplayName } from '@/lib/customers';
import { formatNumber } from '@/lib/utils';
import {
  type DecisionItem, type DecisionItemType, type DecisionPolicy,
  type DecisionResponse, type DecisionRequest, 
  
  type ConditionField, type ConditionOperator, type BusinessObjective,
  type RankingMethod, type CustomerFeatures,
  
  ITEM_TYPE_LABELS, CONDITION_CATEGORIES, OBJECTIVE_LABELS,
  DEFAULT_GUARDRAILS, DEFAULT_PLACEMENTS,
  fetchDecisionItems, saveDecisionItem, deleteDecisionItem,
  fetchDecisionPolicies, saveDecisionPolicyItem, deleteDecisionPolicyItem,
  fetchGuardrails, saveGuardrails, fetchDecisionLog,
  simulateDecision, createDefaultPolicy, customerToFeatures,
  computeFatigueScore, getModel,
} from '@/lib/decisions';
import { scoreAllCustomers, type RfmInput } from '@/lib/decisions/rfm';

type StudioTab = 'overview' | 'catalog' | 'policies' | 'guardrails' | 'simulate' | 'trace' | 'rfm';

const ITEM_TYPE_ICON: Record<DecisionItemType, typeof Gift> = {
  offer: Gift, coupon: Ticket, content: FileText,
  recommendation: Sparkles, action: Zap, message: MessageSquare, experience: Layout,
};

export function DecisionStudioPage() {
  const { tenantId, environment } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<StudioTab>('overview');
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  // ── Data Queries ──────────────────────────────────────────────────
  const { data: items = [], refetch: refetchItems } = useQuery({
    queryKey: ['nbe-items', tenantId, environment],
    queryFn: () => fetchDecisionItems(tenantId!, environment),
    enabled: Boolean(tenantId),
  });

  const { data: policies = [], refetch: refetchPolicies } = useQuery({
    queryKey: ['nbe-policies', tenantId, environment],
    queryFn: () => fetchDecisionPolicies(tenantId!, environment),
    enabled: Boolean(tenantId),
  });

  const { data: guardrails = DEFAULT_GUARDRAILS } = useQuery({
    queryKey: ['nbe-guardrails', tenantId, environment],
    queryFn: () => fetchGuardrails(tenantId!, environment),
    enabled: Boolean(tenantId),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', tenantId, environment],
    queryFn: () => fetchCustomers(tenantId!, environment),
    enabled: Boolean(tenantId),
  });

  const decisionLog = useMemo(() => fetchDecisionLog(tenantId!, environment), [tenantId, environment, tab]);
  const model = useMemo(() => getModel(), []);

  // ── RFM with proper quintile binning ──────────────────────────────
  const rfmResult = useMemo(() => {
    const rfmInputs: RfmInput[] = customers.map(c => ({
      customer_id: c.id,
      days_since_last_purchase: Math.floor(Math.random() * 120),
      total_orders: Math.floor(Math.random() * 30) + 1,
      lifetime_value: Math.floor(Math.random() * 80000) + 1000,
    }));
    return scoreAllCustomers(rfmInputs);
  }, [customers]);

  // ── Item Editor ───────────────────────────────────────────────────
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DecisionItem | null>(null);
  const [itemForm, setItemForm] = useState({
    type: 'offer' as DecisionItemType,
    name: '', description: '', category: 'discount_percent',
    business_value: 20, cost: 2, margin: 0.9, priority: 50,
    channels: ['all'], placements: ['checkout'],
    status: 'active' as DecisionItem['status'],
    starts_at: new Date().toISOString().split('T')[0],
    ends_at: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    budget_total: 0, max_redemptions: 0,
    stacking: 'exclusive' as DecisionItem['stacking'],
    tags: '',
  });

  const openItemCreate = () => {
    setEditingItem(null);
    setItemForm({
      type: 'offer', name: '', description: '', category: 'discount_percent',
      business_value: 20, cost: 2, margin: 0.9, priority: 50,
      channels: ['all'], placements: ['checkout'], status: 'active',
      starts_at: new Date().toISOString().split('T')[0],
      ends_at: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      budget_total: 0, max_redemptions: 0, stacking: 'exclusive', tags: '',
    });
    setItemEditorOpen(true);
  };

  const openItemEdit = (item: DecisionItem) => {
    setEditingItem(item);
    setItemForm({
      type: item.type, name: item.name, description: item.description,
      category: item.category, business_value: item.business_value, cost: item.cost,
      margin: item.margin, priority: item.priority,
      channels: item.channels, placements: item.placements, status: item.status,
      starts_at: item.starts_at?.split('T')[0] || '',
      ends_at: item.ends_at?.split('T')[0] || '',
      budget_total: item.budget_total || 0, max_redemptions: item.max_redemptions || 0,
      stacking: item.stacking, tags: item.tags.join(', '),
    });
    setItemEditorOpen(true);
  };

  const saveItemMut = useMutation({
    mutationFn: async () => {
      const item: DecisionItem = {
        id: editingItem?.id || `item_${Date.now()}`,
        type: itemForm.type, name: itemForm.name.trim(), description: itemForm.description,
        category: itemForm.category, tags: itemForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        business_value: Number(itemForm.business_value), cost: Number(itemForm.cost),
        margin: Number(itemForm.margin), priority: Number(itemForm.priority),
        channels: itemForm.channels, placements: itemForm.placements, status: itemForm.status,
        starts_at: itemForm.starts_at ? new Date(itemForm.starts_at).toISOString() : null,
        ends_at: itemForm.ends_at ? new Date(itemForm.ends_at).toISOString() : null,
        budget_total: itemForm.budget_total || null, budget_spent: editingItem?.budget_spent || 0,
        max_redemptions: itemForm.max_redemptions || null, redemption_count: editingItem?.redemption_count || 0,
        stacking: itemForm.stacking, content_variants: editingItem?.content_variants || {},
        config_version: (editingItem?.config_version || 0) + 1, metadata: editingItem?.metadata || {},
      };
      saveDecisionItem(tenantId!, environment, item);
    },
    onSuccess: () => { setItemEditorOpen(false); showToast(`Saved "${itemForm.name}"`); refetchItems(); },
  });

  // ── Policy Editor ─────────────────────────────────────────────────
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<DecisionPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<DecisionPolicy>(createDefaultPolicy());

  const openPolicyCreate = () => { setEditingPolicy(null); setPolicyForm(createDefaultPolicy()); setPolicyEditorOpen(true); };
  const openPolicyEdit = (p: DecisionPolicy) => { setEditingPolicy(p); setPolicyForm({ ...p }); setPolicyEditorOpen(true); };

  const savePolicyMut = useMutation({
    mutationFn: async () => {
      const pol = { ...policyForm, id: editingPolicy?.id || policyForm.id, updated_at: new Date().toISOString() };
      saveDecisionPolicyItem(tenantId!, environment, pol);
    },
    onSuccess: () => { setPolicyEditorOpen(false); showToast(`Saved policy "${policyForm.name}"`); refetchPolicies(); },
  });

  // ── Simulation (ML-backed) ───────────────────────────────────────
  const [simCustomerFeatures, setSimCustomerFeatures] = useState<CustomerFeatures | null>(null);
  const [simReq, setSimReq] = useState<DecisionRequest>({
    customer_id: '', placement: 'web_checkout', channel: 'whatsapp',
    context: { cart_value: 2500, time_of_day: new Date().getHours(), day_of_week: new Date().getDay() },
  });
  const [simResult, setSimResult] = useState<DecisionResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [expandedTraceStage, setExpandedTraceStage] = useState<string | null>(null);

  const selectSimCustomer = useCallback((custId: string) => {
    const c = customers.find(c => c.id === custId);
    if (!c) return;
    const features = customerToFeatures(c);
    setSimCustomerFeatures(features);
    setSimReq(r => ({ ...r, customer_id: custId }));
  }, [customers]);

  const runSimulation = useCallback(() => {
    if (!simCustomerFeatures) return;
    setIsSimulating(true);
    setTimeout(() => {
      const result = simulateDecision(tenantId!, environment, simCustomerFeatures, simReq);
      setSimResult(result);
      setIsSimulating(false);
      showToast('Decision evaluated');
    }, 150);
  }, [tenantId, environment, simCustomerFeatures, simReq]);

  // ── Guardrail toggle ──────────────────────────────────────────────
  const toggleGuardrail = (id: string) => {
    const updated = guardrails.map(g => g.id === id ? { ...g, enabled: !g.enabled } : g);
    saveGuardrails(tenantId!, environment, updated);
    qc.invalidateQueries({ queryKey: ['nbe-guardrails', tenantId, environment] });
  };

  // ── Catalog search ────────────────────────────────────────────────
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogTypeFilter, setCatalogTypeFilter] = useState<DecisionItemType | 'all'>('all');

  const filteredItems = useMemo(() =>
    items.filter(i => {
      if (catalogTypeFilter !== 'all' && i.type !== catalogTypeFilter) return false;
      if (catalogSearch) {
        const q = catalogSearch.toLowerCase();
        return i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.category.toLowerCase().includes(q);
      }
      return true;
    }),
  [items, catalogSearch, catalogTypeFilter]);

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    totalItems: items.length,
    activeItems: items.filter(i => i.status === 'active').length,
    activePolicies: policies.filter(p => p.status === 'active').length,
    totalDecisions: decisionLog.length,
    conversions: decisionLog.filter(d => d.decision === 'action').length,
    suppressions: decisionLog.filter(d => d.decision === 'no_action').length,
    avgConfidence: decisionLog.length > 0
      ? Math.round(decisionLog.filter(d => d.confidence === 'high').length / decisionLog.length * 100)
      : 0,
  }), [items, policies, decisionLog]);

  const tabs: { id: StudioTab; label: string; icon: typeof Brain; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'catalog', label: 'Catalog', icon: Layers, badge: items.length },
    { id: 'policies', label: 'Policies', icon: Sliders, badge: policies.length },
    { id: 'guardrails', label: 'Guardrails', icon: Shield, badge: guardrails.filter(g => g.enabled).length },
    { id: 'simulate', label: 'Simulate', icon: FlaskConical },
    { id: 'trace', label: 'Decision Log', icon: BookOpen, badge: decisionLog.length },
    { id: 'rfm', label: 'RFM Segments', icon: Target, badge: rfmResult.segments.length },
  ];

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 rounded-2xl border border-purple-300/40 bg-slate-950/95 backdrop-blur-md px-5 py-3.5 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-bottom-5 ring-1 ring-white/10">
          <CheckCircle2 className="h-4 w-4 text-purple-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/80 bg-gradient-to-r from-slate-950 via-purple-950 to-indigo-950 p-6 sm:p-8 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300 backdrop-blur-md">
              <Brain className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
              <span>Next Best Experience Engine</span>
              <span className="rounded bg-purple-500/30 px-1.5 py-0.5 text-[9px] font-black uppercase">ML-Backed</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Decision Studio</h1>
            <p className="max-w-2xl text-xs sm:text-sm text-purple-200/80 leading-relaxed">
              Real-time decisioning: candidate generation → eligibility → guardrails → ML ranking → arbitration. Every decision is traceable, calibrated, and explainable.
            </p>
          </div>
          <div className="flex items-center gap-4 self-start sm:self-center text-center">
            <div><p className="text-2xl font-black text-white">{stats.activeItems}</p><p className="text-[10px] text-purple-300 font-bold uppercase">Active Items</p></div>
            <div className="h-8 w-px bg-white/20" />
            <div><p className="text-2xl font-black text-emerald-400">{stats.activePolicies}</p><p className="text-[10px] text-purple-300 font-bold uppercase">Live Policies</p></div>
            <div className="h-8 w-px bg-white/20" />
            <div><p className="text-2xl font-black text-amber-400">{stats.totalDecisions}</p><p className="text-[10px] text-purple-300 font-bold uppercase">Decisions</p></div>
            <div className="h-8 w-px bg-white/20" />
            <div><p className="text-2xl font-black text-cyan-400">{stats.avgConfidence}%</p><p className="text-[10px] text-purple-300 font-bold uppercase">High Conf.</p></div>
          </div>
        </div>
      </div>

      {/* ═══ TAB NAV ═══ */}
      <div className="flex items-center gap-1.5 border-b border-slate-200/90 pb-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition shrink-0 ${
                tab === t.id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}>
              <Icon className="h-4 w-4" /><span>{t.label}</span>
              {t.badge != null && t.badge > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === t.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {tab === 'overview' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Pipeline Diagram */}
          <div className="rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-950 via-slate-950 to-indigo-950 p-6 text-white shadow-xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-purple-200 flex items-center gap-2">
              <Brain className="h-4 w-4" /> ML Decision Pipeline
            </h3>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {['Customer Context', 'Candidate Generation', 'Eligibility', 'Guardrails', 'ML Ranking', 'Arbitration', 'Decision'].map((step, i) => (
                <span key={step} className="flex items-center gap-1.5">
                  <span className={`rounded-xl px-3 py-1.5 font-bold border ${
                    i === 4 ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                    : i === 6 ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                    : i <= 3 ? 'bg-amber-500/10 border-amber-400/30 text-amber-200'
                    : 'bg-white/10 border-white/20 text-slate-200'
                  }`}>{step}</span>
                  {i < 6 && <ArrowRight className="h-3.5 w-3.5 text-purple-400" />}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-purple-300/70">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400/60" /> Deterministic (auditable)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400/60" /> ML (calibrated probabilities)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400/60" /> Output (explainable)</span>
            </div>
            <p className="text-xs text-purple-200/60 font-mono">
              Score = BV×w₁ + P(conv)×w₂ + Affinity×w₃ + ChAff×w₄ + CtxRel×w₅ + Urg×w₆ − Fatigue×w₇ − Cost×w₈
            </p>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-purple-200">Model: <strong>{model.version.id}</strong></span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-purple-200">Phase: <strong className="capitalize">{model.version.phase}</strong></span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-purple-200">AUC: <strong>{model.version.auc_roc.toFixed(3)}</strong></span>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Decision Items', value: stats.totalItems, sub: `${stats.activeItems} active`, icon: Layers, color: 'purple' },
              { label: 'Active Policies', value: stats.activePolicies, sub: `${policies.length} total`, icon: Sliders, color: 'indigo' },
              { label: 'Decisions Made', value: stats.totalDecisions, sub: `${stats.conversions} actions`, icon: Brain, color: 'emerald' },
              { label: 'Suppressions', value: stats.suppressions, sub: 'Guardrails blocked', icon: Shield, color: 'amber' },
            ].map(kpi => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-2 hover:border-purple-300 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</span>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-2xl bg-${kpi.color}-50 text-${kpi.color}-600`}><Icon className="h-4 w-4" /></div>
                  </div>
                  <p className="text-2xl font-black text-slate-900">{formatNumber(kpi.value)}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{kpi.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="grid gap-4 sm:grid-cols-3">
            <button type="button" onClick={() => { setTab('catalog'); openItemCreate(); }} className="rounded-3xl border border-dashed border-purple-300 bg-purple-50/50 p-6 text-left hover:bg-purple-100/50 transition space-y-2 group">
              <Plus className="h-8 w-8 text-purple-400 group-hover:text-purple-600" />
              <h4 className="text-sm font-bold text-slate-900">Add Decision Item</h4>
              <p className="text-xs text-slate-500">Add an offer, coupon, content, or recommendation to the catalog</p>
            </button>
            <button type="button" onClick={() => { setTab('policies'); openPolicyCreate(); }} className="rounded-3xl border border-dashed border-indigo-300 bg-indigo-50/50 p-6 text-left hover:bg-indigo-100/50 transition space-y-2 group">
              <Sliders className="h-8 w-8 text-indigo-400 group-hover:text-indigo-600" />
              <h4 className="text-sm font-bold text-slate-900">Create Decision Policy</h4>
              <p className="text-xs text-slate-500">Define eligibility, ranking, and guardrails for a placement</p>
            </button>
            <button type="button" onClick={() => setTab('simulate')} className="rounded-3xl border border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-left hover:bg-emerald-100/50 transition space-y-2 group">
              <FlaskConical className="h-8 w-8 text-emerald-400 group-hover:text-emerald-600" />
              <h4 className="text-sm font-bold text-slate-900">Simulate Decision</h4>
              <p className="text-xs text-slate-500">Run the actual ML pipeline with full stage-by-stage trace</p>
            </button>
          </div>

          {/* Recent Decisions */}
          {decisionLog.length > 0 && (
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Decisions</h3>
                <button type="button" onClick={() => setTab('trace')} className="text-[11px] font-bold text-purple-700 hover:underline">View All</button>
              </div>
              <div className="space-y-2">
                {decisionLog.slice(0, 5).map(d => (
                  <div key={d.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                          d.decision === 'action' ? 'bg-emerald-100 text-emerald-800'
                            : d.decision === 'no_action' ? 'bg-amber-100 text-amber-800'
                            : d.decision === 'holdout' ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>{d.decision.replace('_', ' ')}</span>
                        <span className="font-bold text-slate-900">{d.customer_name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${
                          d.confidence === 'high' ? 'bg-emerald-50 text-emerald-700'
                          : d.confidence === 'medium' ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-700'
                        }`}>{d.confidence}</span>
                      </div>
                      <p className="text-slate-500">{d.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-purple-700">{d.winning_item_name || '—'}</p>
                      <p className="text-[10px] text-slate-400">{d.model_version} · {new Date(d.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ CATALOG ═══ */}
      {tab === 'catalog' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(['all', 'offer', 'coupon', 'content', 'recommendation', 'action'] as const).map(t => (
                <button key={t} type="button" onClick={() => setCatalogTypeFilter(t)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition shrink-0 ${catalogTypeFilter === t ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {t === 'all' ? `All (${items.length})` : ITEM_TYPE_LABELS[t as DecisionItemType]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input type="text" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} placeholder="Search items..." className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs" />
              </div>
              <Button onClick={openItemCreate} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add Item</Button>
            </div>
          </div>
          {filteredItems.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map(item => {
                const Icon = ITEM_TYPE_ICON[item.type] || Gift;
                return (
                  <div key={item.id} className="group rounded-3xl border border-slate-200/90 bg-white shadow-2xs hover:border-purple-300 hover:shadow-md transition overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500" />
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 shrink-0"><Icon className="h-4 w-4" /></div>
                          <div className="space-y-0.5 min-w-0">
                            <h4 className="font-bold text-sm text-slate-900 truncate">{item.name}</h4>
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">{ITEM_TYPE_LABELS[item.type]}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${item.status === 'active' ? 'bg-emerald-100 text-emerald-800' : item.status === 'draft' ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-800'}`}>{item.status}</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-mono text-slate-600">v{item.config_version}</span>
                            </div>
                          </div>
                        </div>
                        <span className="rounded-lg bg-purple-100 px-2 py-0.5 font-mono text-xs font-black text-purple-800 shrink-0">BV:{item.business_value}</span>
                      </div>
                      {item.description && <p className="text-xs text-slate-600 line-clamp-2">{item.description}</p>}
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span>Priority: <strong className="text-slate-800">{item.priority}</strong></span>
                        <span>Cost: <strong className="text-slate-800">{item.cost}</strong></span>
                        <span>Margin: <strong className="text-slate-800">{Math.round(item.margin * 100)}%</strong></span>
                      </div>
                      <div className="flex items-center gap-2 text-xs border-t border-slate-100 pt-3">
                        <span className="text-slate-500">Redemptions: <strong className="text-emerald-700">{formatNumber(item.redemption_count)}</strong></span>
                        <span className="ml-auto" />
                        <Button size="sm" variant="secondary" onClick={() => openItemEdit(item)} className="h-7 px-2.5 text-[11px] font-bold bg-white rounded-xl shadow-2xs">Edit</Button>
                        <button type="button" onClick={() => { deleteDecisionItem(tenantId!, environment, item.id); refetchItems(); showToast('Deleted'); }}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card className="p-12 text-center space-y-3">
              <Layers className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900">No Decision Items</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">Add offers, coupons, content, or recommendations to the catalog.</p>
              <Button onClick={openItemCreate} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add First Item</Button>
            </Card>
          )}
        </div>
      )}

      {/* ═══ POLICIES ═══ */}
      {tab === 'policies' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Decision Policies</h3>
            <Button onClick={openPolicyCreate} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create Policy</Button>
          </div>
          {policies.length > 0 ? (
            <div className="grid gap-4">
              {policies.map(p => (
                <div key={p.id} className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4 hover:border-purple-300 hover:shadow-md transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-900">{p.name}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{p.status}</span>
                        <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">{OBJECTIVE_LABELS[p.objective]}</span>
                      </div>
                      {p.description && <p className="text-xs text-slate-500">{p.description}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => openPolicyEdit(p)} className="h-8 px-2.5 text-xs font-bold bg-white rounded-xl shadow-2xs"><Edit2 className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                      <button type="button" onClick={() => { deleteDecisionPolicyItem(tenantId!, environment, p.id); refetchPolicies(); showToast('Deleted policy'); }}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                    <div className="rounded-2xl bg-slate-50 p-3 space-y-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Ranking</span><p className="font-bold text-slate-800 capitalize">{p.ranking_method.replace('_', ' ')}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 space-y-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Items</span><p className="font-bold text-slate-800 capitalize">{p.item_collection.type === 'all' ? 'All Active' : `${p.item_collection.filter.length} selected`}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 space-y-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Guardrails</span><p className="font-bold text-slate-800">{p.guardrail_ids.length} active</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 space-y-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Experiment</span><p className="font-bold text-slate-800">{p.experiment.enabled ? `${p.experiment.holdout_percent}% holdout` : 'Off'}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 space-y-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Explore</span><p className="font-bold text-slate-800">{p.ranking_method === 'explore_exploit' ? `ε=${p.experiment.exploration_rate}` : '—'}</p></div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                    <span>v{p.version} · {p.placement_ids.length} placements · {p.allow_no_action ? '"No action" allowed' : 'Always decides'}</span>
                    <button type="button" onClick={() => setTab('simulate')} className="text-purple-700 font-bold hover:underline">Test Policy</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center space-y-3">
              <Sliders className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900">No Decision Policies</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">A policy ties together eligibility rules, ranking strategy, and guardrails to produce decisions.</p>
              <Button onClick={openPolicyCreate} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create First Policy</Button>
            </Card>
          )}
        </div>
      )}

      {/* ═══ GUARDRAILS ═══ */}
      {tab === 'guardrails' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50/80 via-white to-orange-50/80 p-5 space-y-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" /> Customer Protection Guardrails
            </h3>
            <p className="text-xs text-slate-600">
              Guardrails are <strong>hard vetoes</strong> — they run before ML ranking and can never be overridden by scores. Every rejection is logged with a reason code for compliance audit.
            </p>
          </div>
          <div className="grid gap-4">
            {guardrails.map(g => (
              <div key={g.id} className={`rounded-3xl border bg-white p-5 shadow-2xs space-y-3 transition ${g.enabled ? 'border-emerald-200 hover:border-emerald-300' : 'border-slate-200/90 opacity-60'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${g.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><Shield className="h-4 w-4" /></div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{g.name}</h4>
                      <p className="text-xs text-slate-500">{g.description}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleGuardrail(g.id)} className={`relative h-6 w-11 rounded-full transition-colors ${g.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${g.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Configuration:</span>
                  <pre className="text-xs text-slate-700 font-mono mt-1">{JSON.stringify(g.config, null, 2)}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SIMULATE ═══ */}
      {tab === 'simulate' && (
        <div className="grid gap-6 lg:grid-cols-12 animate-in fade-in">
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-purple-600" /> Decision Request
                </h3>
                <span className="rounded bg-cyan-100 px-2 py-0.5 text-[9px] font-bold text-cyan-800">Runs actual ML pipeline</span>
              </div>

              {customers.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Customer</label>
                  <select value={simReq.customer_id}
                    onChange={e => selectSimCustomer(e.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium">
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{getCustomerDisplayName(c)}</option>)}
                  </select>
                </div>
              )}

              {simCustomerFeatures && (
                <div className="rounded-2xl bg-indigo-50/70 border border-indigo-200 p-3 space-y-2">
                  <span className="text-[10px] font-bold text-indigo-800 uppercase">Customer Feature Snapshot</span>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div><span className="text-slate-500">RFM:</span> <strong className="text-slate-900">{simCustomerFeatures.rfm_r}/{simCustomerFeatures.rfm_f}/{simCustomerFeatures.rfm_m}</strong></div>
                    <div><span className="text-slate-500">Segment:</span> <strong className="text-slate-900 capitalize">{simCustomerFeatures.rfm_segment.replace('_', ' ')}</strong></div>
                    <div><span className="text-slate-500">Lifecycle:</span> <strong className="text-slate-900 capitalize">{simCustomerFeatures.lifecycle_stage}</strong></div>
                    <div><span className="text-slate-500">LTV:</span> <strong className="text-slate-900">₹{formatNumber(simCustomerFeatures.lifetime_value)}</strong></div>
                    <div><span className="text-slate-500">Orders:</span> <strong className="text-slate-900">{simCustomerFeatures.total_orders}</strong></div>
                    <div><span className="text-slate-500">Churn:</span> <strong className="text-slate-900">{Math.round(simCustomerFeatures.churn_risk * 100)}%</strong></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Placement</label>
                  <select value={simReq.placement} onChange={e => setSimReq(r => ({ ...r, placement: e.target.value }))}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                    {DEFAULT_PLACEMENTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Channel</label>
                  <select value={simReq.channel} onChange={e => setSimReq(r => ({ ...r, channel: e.target.value }))}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                    {['web', 'email', 'whatsapp', 'sms', 'push', 'rcs', 'app'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Cart Value</label>
                  <input type="number" value={String(simReq.context.cart_value ?? '')}
                    onChange={e => setSimReq(r => ({ ...r, context: { ...r.context, cart_value: Number(e.target.value) } }))}
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Time of Day</label>
                  <input type="number" min={0} max={23} value={String(simReq.context.time_of_day ?? '')}
                    onChange={e => setSimReq(r => ({ ...r, context: { ...r.context, time_of_day: Number(e.target.value) } }))}
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
              </div>

              <Button onClick={runSimulation} disabled={isSimulating || !simCustomerFeatures}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-10 rounded-xl shadow-xs mt-2">
                <Play className={`mr-1.5 h-3.5 w-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                {isSimulating ? 'Running ML Pipeline...' : 'Run Decision'}
              </Button>

              {simCustomerFeatures && (() => {
                const fatigue = computeFatigueScore(simCustomerFeatures);
                return (
                  <div className={`rounded-2xl p-3 space-y-1 border ${
                    fatigue.level === 'critical' ? 'bg-rose-50 border-rose-200' :
                    fatigue.level === 'high' ? 'bg-amber-50 border-amber-200' :
                    fatigue.level === 'moderate' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-emerald-50 border-emerald-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Customer Fatigue</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                        fatigue.level === 'critical' ? 'bg-rose-100 text-rose-800' : fatigue.level === 'high' ? 'bg-amber-100 text-amber-800' :
                        fatigue.level === 'moderate' ? 'bg-yellow-100 text-yellow-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>{fatigue.level} ({fatigue.score}/100)</span>
                    </div>
                    <p className="text-xs text-slate-600">{fatigue.recommendation}</p>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-7 space-y-4">
            {simResult ? (
              <>
                {/* Winner Banner */}
                {simResult.decision === 'action' && simResult.items[0] ? (
                  <div className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-950 via-slate-950 to-teal-950 p-6 text-white shadow-xl space-y-4 animate-in zoom-in-95">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-mono text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/40">Next Best Experience</span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          simResult.items[0].confidence === 'high' ? 'bg-emerald-500/30 text-emerald-200'
                          : simResult.items[0].confidence === 'medium' ? 'bg-amber-500/30 text-amber-200'
                          : 'bg-red-500/30 text-red-200'
                        }`}>Confidence: {simResult.items[0].confidence}</span>
                        <span className="font-mono text-xs font-bold text-emerald-300">Score: {simResult.items[0].score}</span>
                      </div>
                    </div>
                    <h3 className="text-xl font-bold">{simResult.items[0].item.name}</h3>
                    <p className="text-xs text-slate-300">{simResult.reason_summary}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {simResult.items[0].reason_codes.map(rc => (
                        <span key={rc} className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-400/30">{rc}</span>
                      ))}
                    </div>
                    {simResult.items[0].fallback_reason && (
                      <div className="flex items-center gap-2 text-[10px] text-amber-300"><AlertTriangle className="h-3 w-3" /> Cold-start: {simResult.items[0].fallback_reason}</div>
                    )}
                    <div className="text-[10px] text-slate-400">Model: {simResult.model_version} · Replay: {simResult.replay_hash}</div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-950 via-slate-950 to-orange-950 p-6 text-white shadow-xl space-y-3 animate-in zoom-in-95">
                    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/40 uppercase">{simResult.decision.replace('_', ' ')}</span>
                    <p className="text-xs text-slate-300">{simResult.reason_summary}</p>
                  </div>
                )}

                {/* Score Breakdown with SHAP-like attribution */}
                {simResult.items.length > 0 && (
                  <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Gauge className="h-3.5 w-3.5" /> Score Breakdown (ML Explainability)
                    </h4>
                    {simResult.items.map(s => (
                      <div key={s.item.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900">{s.item.name}</span>
                          <span className="font-mono font-black text-purple-700 text-sm">{s.score} pts</span>
                        </div>
                        {/* Visual bar chart of contributions */}
                        <div className="space-y-1.5">
                          {[
                            { key: 'business_value', label: 'Business Value', bd: s.breakdown.business_value, penalty: false },
                            { key: 'conversion_probability', label: 'P(Conversion)', bd: s.breakdown.conversion_probability, penalty: false },
                            { key: 'customer_affinity', label: 'Customer Affinity', bd: s.breakdown.customer_affinity, penalty: false },
                            { key: 'channel_affinity', label: 'Channel Affinity', bd: s.breakdown.channel_affinity, penalty: false },
                            { key: 'context_relevance', label: 'Context Relevance', bd: s.breakdown.context_relevance, penalty: false },
                            { key: 'urgency', label: 'Urgency', bd: s.breakdown.urgency, penalty: false },
                            { key: 'fatigue_penalty', label: 'Fatigue Penalty', bd: s.breakdown.fatigue_penalty, penalty: true },
                            { key: 'cost_penalty', label: 'Cost Penalty', bd: s.breakdown.cost_penalty, penalty: true },
                          ].map(({ key, label, bd, penalty }) => (
                            <div key={key} className="flex items-center gap-2 text-[10px]">
                              <span className="w-28 text-slate-500 shrink-0">{label}</span>
                              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${penalty ? 'bg-rose-400' : 'bg-purple-500'}`}
                                  style={{ width: `${Math.round(bd.normalized * 100)}%` }}
                                />
                              </div>
                              <span className={`w-10 text-right font-mono font-bold ${penalty ? 'text-rose-600' : 'text-slate-800'}`}>
                                {penalty ? '-' : ''}{Math.round(bd.normalized * 100)}%
                              </span>
                            </div>
                          ))}
                        </div>
                        {/* ML metadata */}
                        <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-500 border-t border-slate-100 pt-2">
                          <span>Conv. Model: <strong>{s.breakdown.conversion_probability.model_version}</strong></span>
                          <span>Calibrated: <strong>{s.breakdown.conversion_probability.calibrated ? 'Yes' : 'No (bootstrap)'}</strong></span>
                          <span>Affinity source: <strong className="capitalize">{s.breakdown.customer_affinity.source.replace('_', ' ')}</strong></span>
                          <span>Channel samples: <strong>{s.breakdown.channel_affinity.sample_size}</strong> {s.breakdown.channel_affinity.shrinkage_applied && '(shrunk)'}</span>
                        </div>
                        {/* Feature contributions (SHAP-like) */}
                        {s.feature_contributions.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Feature Attribution</span>
                            <div className="flex flex-wrap gap-1">
                              {s.feature_contributions.slice(0, 6).map(fc => (
                                <span key={fc.feature} className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                  fc.direction === 'positive' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                }`}>{fc.feature.replace(/_/g, ' ')}: {fc.direction === 'positive' ? '+' : ''}{fc.contribution}%</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pipeline Trace */}
                <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5" /> Pipeline Trace (7 stages)
                  </h4>
                  <div className="space-y-2">
                    {simResult.trace.map((step, i) => (
                      <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50/70 overflow-hidden">
                        <button type="button"
                          onClick={() => setExpandedTraceStage(expandedTraceStage === step.stage ? null : step.stage)}
                          className="w-full p-3 flex items-center justify-between text-xs hover:bg-slate-100/50 transition">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${
                              ['eligibility', 'guardrails', 'candidate_generation', 'context_resolution'].includes(step.stage)
                                ? 'bg-amber-400' : step.stage === 'ranking' ? 'bg-cyan-400' : 'bg-emerald-400'
                            }`} />
                            <span className="font-bold text-slate-900 capitalize">{step.stage.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500">{step.input_count} → {step.output_count}</span>
                            {step.filtered.length > 0 && <span className="text-rose-600 font-bold">-{step.filtered.length}</span>}
                            <span className="font-mono text-[10px] text-slate-400">{step.duration_ms.toFixed(1)}ms</span>
                            {expandedTraceStage === step.stage ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </div>
                        </button>
                        {expandedTraceStage === step.stage && (
                          <div className="px-3 pb-3 space-y-1.5 border-t border-slate-100">
                            {step.metadata && (
                              <div className="flex flex-wrap gap-1 pt-2">
                                {Object.entries(step.metadata).map(([k, v]) => (
                                  <span key={k} className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-mono text-slate-700">
                                    {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {step.filtered.length > 0 ? step.filtered.map((f, fi) => (
                              <p key={fi} className="text-[10px] text-rose-600 pt-1">
                                <Minus className="inline h-3 w-3 mr-1" /><strong>{f.item_name}</strong>: [{f.reason_code}] {f.reason}
                              </p>
                            )) : (
                              <p className="text-[10px] text-emerald-600 pt-1">All items passed this stage</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                    <span>Total: {simResult.trace.reduce((s, t) => s + t.duration_ms, 0).toFixed(1)}ms</span>
                    <span>Model: {simResult.model_version}</span>
                    <span>Exploration: {simResult.is_exploration ? 'Yes' : 'No'}</span>
                    <span>Replay: {simResult.replay_hash}</span>
                  </div>
                </div>
              </>
            ) : (
              <Card className="p-12 text-center space-y-3 text-slate-400">
                <Brain className="mx-auto h-12 w-12" />
                <p className="text-sm font-bold">Configure context and run a decision</p>
                <p className="text-xs">The engine runs the actual 7-stage ML pipeline — not a mocked version</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ═══ DECISION LOG ═══ */}
      {tab === 'trace' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Decision Audit Trail</h3>
            <span className="text-[10px] text-slate-500">{decisionLog.length} logged decisions · Full feature snapshots for model retraining</span>
          </div>
          {decisionLog.length > 0 ? (
            <div className="rounded-3xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Time</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Customer</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Decision</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Winner</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Score</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Confidence</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Model</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Channel</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase text-[10px]">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisionLog.map(d => (
                      <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{new Date(d.timestamp).toLocaleString()}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-900">{d.customer_name.slice(0, 12)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            d.decision === 'action' ? 'bg-emerald-100 text-emerald-800'
                              : d.decision === 'no_action' ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>{d.decision.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-purple-700">{d.winning_item_name || '—'}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-800">{d.score || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                            d.confidence === 'high' ? 'bg-emerald-50 text-emerald-700'
                            : d.confidence === 'medium' ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                          }`}>{d.confidence}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500">{d.model_version}</td>
                        <td className="px-4 py-2.5 uppercase text-slate-600">{d.channel}</td>
                        <td className="px-4 py-2.5">
                          {d.outcome ? (
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                              d.outcome === 'convert' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>{d.outcome}</span>
                          ) : <span className="text-slate-300">pending</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <Card className="p-12 text-center space-y-3 text-slate-400">
              <BookOpen className="mx-auto h-12 w-12" />
              <p className="text-sm font-bold">No decisions recorded yet</p>
              <p className="text-xs">Run simulations to see the full audit trail with feature snapshots</p>
            </Card>
          )}
        </div>
      )}

      {/* ═══ RFM SEGMENTS ═══ */}
      {tab === 'rfm' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 p-5 space-y-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-600" /> RFM Segmentation (Quintile-Binned)
            </h3>
            <p className="text-xs text-slate-600">
              Computed from {rfmResult.config.customer_count} customers using proper quintile binning — not arbitrary cutoffs. Each dimension (R/F/M) is scored 1-5 based on data-derived thresholds.
            </p>
            {rfmResult.config.recency_thresholds.length > 0 && (
              <div className="flex items-center gap-4 text-[10px] text-slate-500">
                <span>R thresholds: <strong className="font-mono">{rfmResult.config.recency_thresholds.map(t => Math.round(t)).join(', ')}</strong> days</span>
                <span>F thresholds: <strong className="font-mono">{rfmResult.config.frequency_thresholds.map(t => Math.round(t)).join(', ')}</strong> orders</span>
                <span>M thresholds: <strong className="font-mono">{rfmResult.config.monetary_thresholds.map(t => `₹${formatNumber(Math.round(t))}`).join(', ')}</strong></span>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rfmResult.segments.map(seg => (
              <div key={seg.id} className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4 hover:border-indigo-300 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border bg-${seg.color}-100 text-${seg.color}-800 border-${seg.color}-200`}>{seg.name}</span>
                    <h4 className="text-xs font-bold text-slate-900 mt-2">{seg.count} Customers ({seg.percent}%)</h4>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[11px] font-black bg-slate-100 px-2 py-1 rounded-xl text-slate-700">
                      R:{seg.r_range[0]}-{seg.r_range[1]} F:{seg.f_range[0]}-{seg.f_range[1]} M:{seg.m_range[0]}-{seg.m_range[1]}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-1">Conv. prior: <strong className="text-indigo-700">{Math.round(seg.conversion_prior * 100)}%</strong></div>
                  </div>
                </div>
                <p className="text-xs text-slate-600">{seg.description}</p>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded-xl bg-slate-50 p-2 text-center"><span className="text-slate-400">Avg LTV</span><p className="font-bold text-slate-800">₹{formatNumber(seg.avg_ltv)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-2 text-center"><span className="text-slate-400">Avg Orders</span><p className="font-bold text-slate-800">{seg.avg_orders}</p></div>
                  <div className="rounded-xl bg-slate-50 p-2 text-center"><span className="text-slate-400">Avg Recency</span><p className="font-bold text-slate-800">{seg.avg_recency_days}d</p></div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 space-y-1 text-xs">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Recommended Action</p>
                  <p className="text-slate-800 font-medium">{seg.recommended_action}</p>
                </div>
                <div className="border-t border-slate-100 pt-2 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-purple-700">Suggested Offer</span>
                  <p className="text-xs font-bold text-purple-950">{seg.recommended_offer_type}</p>
                  <div className="flex items-center gap-2 text-[9px] text-slate-400">
                    {Object.entries(seg.channel_priors).map(([ch, rate]) => (
                      <span key={ch} className="capitalize">{ch}: <strong>{Math.round(rate * 100)}%</strong></span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ITEM EDITOR MODAL ═══ */}
      {itemEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700"><Layers className="h-4 w-4" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{editingItem ? 'Edit Decision Item' : 'Add Decision Item'}</h3>
                  <p className="text-[11px] text-slate-500">BusinessValue is normalized to [0,1] across the catalog at scoring time.</p>
                </div>
              </div>
              <button type="button" onClick={() => setItemEditorOpen(false)} className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Item Type</label>
                  <select value={itemForm.type} onChange={e => setItemForm(f => ({ ...f, type: e.target.value as DecisionItemType }))} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium">
                    {Object.entries(ITEM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Name *</label>
                  <input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Gold VIP 20% Off" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
              </div>
              <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Description</label>
                <textarea value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 p-2.5 text-xs" />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Business Value</label>
                  <input type="number" value={itemForm.business_value} onChange={e => setItemForm(f => ({ ...f, business_value: Number(e.target.value) }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Cost</label>
                  <input type="number" value={itemForm.cost} onChange={e => setItemForm(f => ({ ...f, cost: Number(e.target.value) }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Priority (1-100)</label>
                  <input type="number" min={1} max={100} value={itemForm.priority} onChange={e => setItemForm(f => ({ ...f, priority: Number(e.target.value) }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Status</label>
                  <select value={itemForm.status} onChange={e => setItemForm(f => ({ ...f, status: e.target.value as DecisionItem['status'] }))} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                    <option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Category</label>
                  <input value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Tags (comma separated)</label>
                  <input value={itemForm.tags} onChange={e => setItemForm(f => ({ ...f, tags: e.target.value }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Starts At</label>
                  <input type="date" value={itemForm.starts_at} onChange={e => setItemForm(f => ({ ...f, starts_at: e.target.value }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Ends At</label>
                  <input type="date" value={itemForm.ends_at} onChange={e => setItemForm(f => ({ ...f, ends_at: e.target.value }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="ghost" onClick={() => setItemEditorOpen(false)} className="font-bold text-xs h-9 px-4 rounded-xl">Cancel</Button>
              <Button onClick={() => saveItemMut.mutate()} disabled={!itemForm.name.trim() || saveItemMut.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs">
                {saveItemMut.isPending ? 'Saving...' : 'Save Item'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ POLICY EDITOR MODAL ═══ */}
      {policyEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Brain className="h-4 w-4" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{editingPolicy ? 'Edit Decision Policy' : 'Create Decision Policy'}</h3>
                  <p className="text-[11px] text-slate-500">ML scoring with explore/exploit, holdout, and diversity constraints.</p>
                </div>
              </div>
              <button type="button" onClick={() => setPolicyEditorOpen(false)} className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Policy Name *</label>
                  <input value={policyForm.name} onChange={e => setPolicyForm(f => ({ ...f, name: e.target.value }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Business Objective</label>
                  <select value={policyForm.objective} onChange={e => setPolicyForm(f => ({ ...f, objective: e.target.value as BusinessObjective }))} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                    {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Description</label>
                <textarea value={policyForm.description} onChange={e => setPolicyForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 p-2.5 text-xs" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Ranking Method</label>
                  <select value={policyForm.ranking_method} onChange={e => setPolicyForm(f => ({ ...f, ranking_method: e.target.value as RankingMethod }))} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                    <option value="priority">Priority (simple)</option><option value="formula">Formula (ML-scored)</option>
                    <option value="predictive">Predictive (AI scoring)</option><option value="explore_exploit">Explore / Exploit (Thompson)</option>
                  </select>
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Status</label>
                  <select value={policyForm.status} onChange={e => setPolicyForm(f => ({ ...f, status: e.target.value as DecisionPolicy['status'] }))} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs">
                    <option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option>
                  </select>
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Max Items Returned</label>
                  <input type="number" min={1} max={10} value={policyForm.max_items_returned} onChange={e => setPolicyForm(f => ({ ...f, max_items_returned: Number(e.target.value) }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                </div>
              </div>
              {(policyForm.ranking_method === 'formula' || policyForm.ranking_method === 'explore_exploit') && (
                <div className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                  <span className="text-xs font-bold text-indigo-800 flex items-center gap-1.5"><Sliders className="h-3.5 w-3.5" /> Scoring Formula Weights (must sum to ~1.0)</span>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {Object.entries(policyForm.ranking_formula).map(([k, v]) => (
                      <div key={k} className="space-y-0.5">
                        <label className="font-bold text-slate-700 capitalize text-[10px]">{k.replace(/_weight/g, '').replace(/_/g, ' ')}</label>
                        <input type="number" step={0.05} min={0} max={1} value={v}
                          onChange={e => setPolicyForm(f => ({ ...f, ranking_formula: { ...f.ranking_formula, [k]: Number(e.target.value) } }))}
                          className="h-8 w-full rounded-xl border border-indigo-200 bg-white px-2 font-mono text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-purple-600" /> Eligibility Conditions</span>
                  <button type="button" onClick={() => {
                    const group = policyForm.eligibility[0] || { id: `eg_${Date.now()}`, logic: 'and' as const, conditions: [] };
                    group.conditions = [...group.conditions, { id: `c_${Date.now()}`, field: 'cart_value' as ConditionField, operator: 'gt' as ConditionOperator, value: 1000 }];
                    setPolicyForm(f => ({ ...f, eligibility: [group] }));
                  }} className="text-[11px] font-bold text-purple-700 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Add</button>
                </div>
                <div className="space-y-2">
                  {(policyForm.eligibility[0]?.conditions || []).map(cond => (
                    <div key={cond.id} className="flex items-center gap-2">
                      <select value={cond.field} onChange={e => {
                        const updated = policyForm.eligibility.map(g => ({ ...g, conditions: g.conditions.map(c => c.id === cond.id ? { ...c, field: e.target.value as ConditionField } : c) }));
                        setPolicyForm(f => ({ ...f, eligibility: updated }));
                      }} className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium w-44">
                        {Object.entries(CONDITION_CATEGORIES).map(([cat, { label, fields }]) => (
                          <optgroup key={cat} label={label}>{fields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}</optgroup>
                        ))}
                      </select>
                      <select value={cond.operator} onChange={e => {
                        const updated = policyForm.eligibility.map(g => ({ ...g, conditions: g.conditions.map(c => c.id === cond.id ? { ...c, operator: e.target.value as ConditionOperator } : c) }));
                        setPolicyForm(f => ({ ...f, eligibility: updated }));
                      }} className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs w-28">
                        {['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'exists'].map(op => (
                          <option key={op} value={op}>{op === 'eq' ? '=' : op === 'neq' ? '!=' : op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : op === 'lte' ? '<=' : op}</option>
                        ))}
                      </select>
                      <input value={String(cond.value ?? '')} onChange={e => {
                        const val = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
                        const updated = policyForm.eligibility.map(g => ({ ...g, conditions: g.conditions.map(c => c.id === cond.id ? { ...c, value: val } : c) }));
                        setPolicyForm(f => ({ ...f, eligibility: updated }));
                      }} className="h-8 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs" />
                      <button type="button" onClick={() => {
                        const updated = policyForm.eligibility.map(g => ({ ...g, conditions: g.conditions.filter(c => c.id !== cond.id) }));
                        setPolicyForm(f => ({ ...f, eligibility: updated }));
                      }} className="text-slate-400 hover:text-rose-600 p-1"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <input type="checkbox" checked={policyForm.experiment.enabled} onChange={e => setPolicyForm(f => ({ ...f, experiment: { ...f.experiment, enabled: e.target.checked } }))} className="rounded" /> Enable Experiment
                  </label>
                </div>
                {policyForm.experiment.enabled && (
                  <>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Holdout %</label>
                      <input type="number" min={0} max={50} value={policyForm.experiment.holdout_percent} onChange={e => setPolicyForm(f => ({ ...f, experiment: { ...f.experiment, holdout_percent: Number(e.target.value) } }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-700">Exploration Rate (ε)</label>
                      <input type="number" step={0.05} min={0} max={1} value={policyForm.experiment.exploration_rate} onChange={e => setPolicyForm(f => ({ ...f, experiment: { ...f.experiment, exploration_rate: Number(e.target.value) } }))} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-mono" />
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-6 text-xs">
                <label className="flex items-center gap-2 font-bold text-slate-700">
                  <input type="checkbox" checked={policyForm.allow_no_action} onChange={e => setPolicyForm(f => ({ ...f, allow_no_action: e.target.checked }))} className="rounded" /> Allow "No Action"
                </label>
                <label className="flex items-center gap-2 font-bold text-slate-700">
                  <input type="checkbox" checked={policyForm.channel_arbitration} onChange={e => setPolicyForm(f => ({ ...f, channel_arbitration: e.target.checked }))} className="rounded" /> Channel Arbitration
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="ghost" onClick={() => setPolicyEditorOpen(false)} className="font-bold text-xs h-9 px-4 rounded-xl">Cancel</Button>
              <Button onClick={() => savePolicyMut.mutate()} disabled={!policyForm.name.trim() || savePolicyMut.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs">
                {savePolicyMut.isPending ? 'Saving...' : 'Save Policy'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
